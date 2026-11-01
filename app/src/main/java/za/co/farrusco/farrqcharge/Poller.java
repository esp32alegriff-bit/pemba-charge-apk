package za.co.farrusco.farrqcharge;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

/**
 * Talks to the meter, keeps sessions and alerts on the phone, and plans the next background check.
 * Battery rule: one small request per check, about every 30 s while charging and 5 min when idle,
 * only on Wi-Fi. Off Wi-Fi nothing is scheduled; Android wakes the app again when Wi-Fi returns.
 */
final class Poller {
    private Poller() {}

    static final long CHARGING_MS = 30_000, IDLE_MS = 5 * 60_000, UNREACHABLE_MS = 15 * 60_000, AWAY_MS = 5 * 60_000;
    static final String ACTION_POLL = "za.co.farrusco.farrqcharge.POLL";
    static final String ACTION_NET = "za.co.farrusco.farrqcharge.NET";

    private static String k(boolean demo, String key) { return demo ? "demo_" + key : key; }

    /* ---------- live reading for the screens ---------- */
    static synchronized JSONObject live(Context c) {
        Net.init(c);
        MeterApi m = MeterApi.get(c);
        boolean demo = m.isDemo();
        JSONObject out = new JSONObject();
        try {
            out.put("demo", demo);
            if (!demo && !Net.onWifi(c)) {
                out.put("online", false); out.put("error", "This phone is not on Wi-Fi, so the meter cannot be reached.");
            } else {
                try {
                    JSONObject L = m.live();
                    seen(c, demo, L);
                    out.put("online", true); out.put("live", L);
                    boolean more = L.optLong("last_session_seq") > Store.getLong(c, k(demo, "lastSessionSeq"), 0)
                            || L.optLong("last_event_seq") > Store.getLong(c, k(demo, "lastEventSeq"), 0)
                            || !L.optString("store_id").equals(Store.getString(c, k(demo, "storeId"), ""))
                            || (!demo && Store.config(c).optBoolean("pendingMeter"));
                    if (more) syncLocked(c, m, L);
                } catch (IOException e) {
                    failed(c, demo);
                    out.put("online", false); out.put("error", "Meter not answering at " + Store.config(c).optString("meterUrl") + " (" + e.getMessage() + ")");
                }
            }
            out.put("everSeen", Store.getLong(c, k(demo, "lastSeen"), 0) > 0);
            out.put("lastSeen", Store.getLong(c, k(demo, "lastSeen"), 0));
            out.put("unread", Store.getLong(c, "unread", 0));
            out.put("sessionsCount", Store.array(c, "sessions").length());
        } catch (JSONException ignored) {}
        return out;
    }

    /* ---------- full sync: sessions, events, pending settings ---------- */
    static synchronized JSONObject sync(Context c) {
        Net.init(c);
        MeterApi m = MeterApi.get(c);
        boolean demo = m.isDemo();
        Store.putLong(c, "lastPoll", System.currentTimeMillis());
        JSONObject r = new JSONObject();
        try {
            if (!demo && !Net.onWifi(c)) { r.put("ok", false); r.put("offWifi", true); r.put("message", "Not on Wi-Fi"); away(c, r); return r; }
            JSONObject L;
            try { L = m.live(); }
            catch (IOException e) {
                failed(c, demo);
                r.put("ok", false); r.put("message", "Meter not answering: " + e.getMessage()); away(c, r); return r;
            }
            seen(c, demo, L);
            return syncLocked(c, m, L);
        } catch (JSONException e) {
            return r;
        }
    }

    /** 2.2.5: the meter cannot be reached (this phone is away, or the meter is down): ask the Google Sheet for the alerts instead. */
    private static void away(Context c, JSONObject r) {
        try {
            if (!Remote.configured(c) || Store.config(c).optBoolean("demo")) return;
            r.put("away", true);
            if (System.currentTimeMillis() - Store.getLong(c, "lastPull", 0) >= 120_000L) Remote.pull(c);
        } catch (JSONException ignored) {}
    }

    private static JSONObject syncLocked(Context c, MeterApi m, JSONObject L) {
        boolean demo = m.isDemo();
        JSONObject r = new JSONObject();
        int newSessions = 0, newEvents = 0;
        boolean pushed = false;
        try {
            String sid = L.optString("store_id");
            boolean firstContact = false;
            if (!sid.equals(Store.getString(c, k(demo, "storeId"), ""))) {
                // a new meter (or a wiped flash store): start numbering again, and do not notify its old history
                firstContact = true;
                Store.putString(c, k(demo, "storeId"), sid);
                Store.putLong(c, k(demo, "lastSessionSeq"), 0);
                Store.putLong(c, k(demo, "lastEventSeq"), 0);
            }
            // settings waiting to go to the meter (addresses, token, MQTT, tariff)
            JSONObject cfg = Store.config(c);
            if (cfg.optBoolean("pendingMeter")) {
                JSONObject p = new JSONObject();
                p.put("relay_url", cfg.optString("relayUrl"));
                if (!cfg.optString("relayToken").isEmpty()) p.put("relay_token", cfg.optString("relayToken"));
                p.put("mqtt_enabled", cfg.optBoolean("mqttEnabled"));
                p.put("mqtt_host", cfg.optString("mqttHost"));
                p.put("mqtt_port", cfg.optInt("mqttPort", 1883));
                p.put("mqtt_user", cfg.optString("mqttUser"));
                if (!cfg.optString("mqttPass").isEmpty()) p.put("mqtt_pass", cfg.optString("mqttPass"));
                p.put("tariff", cfg.optDouble("tariff", 3.88));
                try { m.setConfig(p); pushed = true; JSONObject f = new JSONObject(); f.put("pendingMeter", false); Store.mergeConfigQuiet(c, f); }
                catch (IOException ignored) {}
            }
            // finished sessions
            String sKey = demo ? "demoSessions" : "sessions";
            JSONArray addedNow = new JSONArray();
            for (int guard = 0; guard < 60; guard++) {
                long after = Store.getLong(c, k(demo, "lastSessionSeq"), 0);
                if (L.optLong("last_session_seq") <= after) break;
                JSONObject res = m.sessionsAfter(after);
                JSONArray a = res.optJSONArray("sessions");
                if (a == null || a.length() == 0) break;
                long max = after;
                for (int i = 0; i < a.length(); i++) max = Math.max(max, a.optJSONObject(i).optLong("seq"));
                int addedHere = Store.addSessions(c, sKey, a, sid, demo);
                newSessions += addedHere;
                if (addedHere > 0) for (int i = 0; i < a.length(); i++) addedNow.put(a.optJSONObject(i));
                Store.putLong(c, k(demo, "lastSessionSeq"), max);
                if (!res.optBoolean("more")) break;
            }
            // events become alerts
            JSONArray fresh = new JSONArray();
            for (int guard = 0; guard < 60; guard++) {
                long after = Store.getLong(c, k(demo, "lastEventSeq"), 0);
                if (L.optLong("last_event_seq") <= after) break;
                JSONObject res = m.eventsAfter(after);
                JSONArray a = res.optJSONArray("events");
                if (a == null || a.length() == 0) break;
                long max = after;
                for (int i = 0; i < a.length(); i++) { JSONObject e = a.optJSONObject(i); max = Math.max(max, e.optLong("seq")); fresh.put(e); }
                Store.putLong(c, k(demo, "lastEventSeq"), max);
                if (!res.optBoolean("more")) break;
            }
            newEvents = fresh.length();
            int visible = 0;                      // alerts the owner has not switched off
            for (int i = 0; i < fresh.length(); i++) if (!Alerts.isOff(c, fresh.optJSONObject(i).optString("type"))) visible++;
            boolean notifyEach = !firstContact && visible <= 5;
            for (int i = 0; i < fresh.length(); i++) {
                JSONObject e = fresh.optJSONObject(i);
                Alerts.add(c, e.optString("type"), e.optString("level", "info"), e.optString("text"), e.optLong("ts_ms"), demo, notifyEach);
                if (demo && "auto_off".equals(e.optString("type")) && cfg.optBoolean("demoRealRelay")) {
                    JSONObject rr = Relay.command(c, "/api/v1/relay/2/off");
                    Alerts.add(c, "auto_off", "info", "DEMO: real EV relay OFF sent: " + rr.optString("message"), System.currentTimeMillis(), true, notifyEach);
                }
            }
            if (!firstContact && visible > 5) {
                Alerts.show(c, visible + " alerts while you were away. Open PEMBA CHARGE to see them.", "info");
            }
            if (!demo) {   // 2.2.3: was the charge that just ended a full one? (read-only checks of the Shelly and the relay board)
                long nowMs = L.optLong("now_ms", 0); if (nowMs <= 0) nowMs = System.currentTimeMillis();
                if (!firstContact && addedNow.length() > 0) FullCharge.onNewSessions(c, addedNow, nowMs, demo);
                try { FullCharge.tick(c, L); } catch (Exception ignored) {}
            }
            if (!demo) Remote.pushLiveIfDue(c, L, newSessions > 0);   // 2.2.5: live reading, alerts and new sessions to the owner's Google Sheet (only if set up)
            Store.putLong(c, k(demo, "lastSync"), System.currentTimeMillis());
            r.put("ok", true); r.put("pushed", pushed); r.put("newSessions", newSessions); r.put("newEvents", newEvents);
            r.put("charging", L.optBoolean("charging"));
            r.put("message", "Meter checked" + (newSessions > 0 ? ", " + newSessions + " new session" + (newSessions > 1 ? "s" : "") : "") + (newEvents > 0 ? ", " + newEvents + " new alert" + (newEvents > 1 ? "s" : "") : ""));
        } catch (Exception e) {
            try { r.put("ok", false); r.put("message", "Sync stopped: " + e.getMessage()); } catch (JSONException ignored) {}
        }
        return r;
    }

    private static void seen(Context c, boolean demo, JSONObject L) {
        if (Store.getLong(c, k(demo, "fails"), 0) >= 3 && !demo)
            Alerts.add(c, "meter_online", "info", "EV meter is back online", System.currentTimeMillis(), false, true);
        Store.putLong(c, k(demo, "fails"), 0);
        Store.putLong(c, k(demo, "lastSeen"), System.currentTimeMillis());
        Store.putObject(c, k(demo, "lastLive"), L);
    }

    private static void failed(Context c, boolean demo) {
        long f = Store.getLong(c, k(demo, "fails"), 0) + 1;
        Store.putLong(c, k(demo, "fails"), f);
        if (f == 3 && Store.getLong(c, k(demo, "lastSeen"), 0) > 0)
            Alerts.add(c, "meter_offline", "warning", "EV meter is not answering on home Wi-Fi", System.currentTimeMillis(), false, true);
    }

    /* ---------- background scheduling ---------- */
    static long nextDelay(JSONObject r, Context c) {
        boolean demo = Store.config(c).optBoolean("demo");
        if (!demo && r.optBoolean("away")) return AWAY_MS;       // 2.2.5: away from home, ask the Sheet every 5 minutes
        if (!demo && r.optBoolean("offWifi")) return 0;          // nothing until Wi-Fi returns
        if (!r.optBoolean("ok")) return UNREACHABLE_MS;
        if (!demo && FullCharge.pending(c)) return CHARGING_MS;      // 2.2.3: keep checking every 30 s until the charge is judged
        return r.optBoolean("charging") ? CHARGING_MS : IDLE_MS;
    }

    static void schedule(Context c, long delayMs) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pollIntent(c);
        if (am == null) return;
        am.cancel(pi);
        if (delayMs <= 0) { Store.putLong(c, "nextPollAt", 0); return; }
        long at = SystemClock.elapsedRealtime() + delayMs;
        boolean exact = false;
        try {
            // 2.2.2: an exact wake-up when Android allows it, so "Charging finished" is not held back; otherwise the old way
            if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) { am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi); exact = true; }
        } catch (SecurityException ignored) { exact = false; }
        if (!exact) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
        Store.putLong(c, "nextPollAt", System.currentTimeMillis() + delayMs);
    }

    private static PendingIntent pollIntent(Context c) {
        Intent i = new Intent(c, PollReceiver.class).setAction(ACTION_POLL);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Asks Android to wake the app whenever Wi-Fi connects (works even when the app is closed). */
    static void watchWifi(Context c) {
        try {
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(c, 2, new Intent(c, PollReceiver.class).setAction(ACTION_NET), flags);
            NetworkRequest req = new NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build();
            cm.registerNetworkCallback(req, pi);
        } catch (Exception ignored) {}
    }

    /** Starts (or restarts) the background chain soon. */
    static void kick(Context c) {
        watchWifi(c);
        schedule(c, 15_000);
    }
}
