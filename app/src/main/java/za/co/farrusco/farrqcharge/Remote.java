package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

/**
 * "View from anywhere": sends a copy of the log to the owner's own Google Sheet through a small Google Apps Script
 * (docs/remote-viewing-google-sheet.gs). Works on Wi-Fi or mobile data, so it also works when the owner is abroad.
 * Nothing is sent until a web address and password are entered on the Connections page. Failures never affect charging.
 */
final class Remote {
    private Remote() {}

    static boolean configured(Context c) {
        JSONObject cfg = Store.config(c);
        return cfg.optString("remoteUrl").startsWith("https://") && !cfg.optString("remoteToken").isEmpty();
    }

    /** Sends one payload (built by the app screens or by the background sync). Returns {ok, message}. */
    static synchronized JSONObject push(Context c, JSONObject payload) throws IOException {
        Net.init(c);
        JSONObject cfg = Store.config(c);
        String url = cfg.optString("remoteUrl").trim();
        String token = cfg.optString("remoteToken");
        if (!url.startsWith("https://")) throw new IOException("Enter the Google web address first (it starts with https://).");
        if (token.isEmpty()) throw new IOException("Enter the password first.");
        JSONObject out = new JSONObject();
        try {
            payload.put("token", token);
            payload.put("phone", cfg.optString("remoteName", "").isEmpty() ? "Phone" : cfg.optString("remoteName"));
            payload.put("app", Store.APP_VERSION);
            String kind = payload.optString("kind");
            if ("app".equals(kind) || "pull".equals(kind)) {   // 2.2.5: also bring back the alerts the phone at home raised
                payload.put("wantAlerts", true);
                payload.put("since", AlertMerge.requestSince(Store.getLong(c, "alertsSince", 0)));
            }
            String reply;
            try { reply = Net.request("POST", url, payload.toString(), null, 25000); }
            catch (Net.HttpError e) { throw new IOException("Google answered " + e.code + ". Check the web address and that access is set to Anyone."); }
            JSONObject r;
            try { r = new JSONObject(reply); }
            catch (JSONException e) { throw new IOException("Google did not send the expected answer. Check that the web address is the Web app address and access is set to Anyone."); }
            boolean ok = r.optBoolean("ok");
            String msg = r.optString("message", ok ? "Sent" : "Refused");
            JSONObject st = new JSONObject();
            st.put("remoteLastMsg", msg);
            if (ok) st.put("remoteLastOk", System.currentTimeMillis());
            Store.mergeConfigQuiet(c, st);
            if (!ok) throw new IOException(msg);
            out.put("ok", true); out.put("message", msg);
            if (r.has("script")) out.put("script", r.optString("script"));
            if (r.has("readings")) out.put("readings", r.get("readings"));   // the other phone's entries, merged by the app screens
            if (r.has("meter")) out.put("meter", r.get("meter"));            // 2.2.4: finished Shelly charges and the last meter reading, copied by the phone at home
            try { applyAlerts(c, r); } catch (Exception ignored) { /* alerts never stop a sync */ }
        } catch (JSONException e) {
            throw new IOException("Could not prepare the data to send");
        }
        return out;
    }

    /** 2.2.5: puts the alerts the Sheet returned into this phone's alert log and shows them (this phone's own ticks decide which). */
    private static void applyAlerts(Context c, JSONObject r) {
        JSONArray a = r.optJSONArray("alerts");
        if (a == null) return;
        long cursor = Store.getLong(c, "alertsSince", 0);
        if (cursor <= 0) { Store.putLong(c, "alertsSince", r.optLong("now", System.currentTimeMillis())); return; }   // first contact: old alerts are not replayed
        long max = cursor;
        java.util.ArrayList<JSONObject> fresh = new java.util.ArrayList<>();
        for (int i = a.length() - 1; i >= 0; i--) {          // the Sheet sends newest first; show oldest first
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            max = Math.max(max, o.optLong("ts"));
            if (AlertMerge.localOnly(o.optString("type"))) continue;
            fresh.add(o);
        }
        int visible = 0;
        for (JSONObject o : fresh) if (!Alerts.isOff(c, o.optString("type"))) visible++;
        boolean each = visible <= 5;
        int added = 0;
        for (JSONObject o : fresh)
            if (Alerts.addFromSheet(c, o.optString("type"), o.optString("level", "info"), o.optString("text"), o.optLong("ts"), each)) added++;
        if (!each && added > 0) Alerts.show(c, visible + " alerts from home. Open PEMBA CHARGE to see them.", "info");
        Store.putLong(c, "alertsSince", max);
    }

    /** 2.2.5: a phone that is away from home asks the Sheet for the alerts (small request, about every 5 minutes). */
    static void pull(Context c) {
        if (!configured(c)) return;
        try {
            JSONObject p = new JSONObject();
            p.put("kind", "pull");
            p.put("sent", System.currentTimeMillis());
            push(c, p);
            Store.putLong(c, "lastPull", System.currentTimeMillis());
        } catch (Exception ignored) { /* tried again at the next check */ }
    }

    /** 2.2.5: sends the live reading (and waiting alerts) when due: every 5 minutes while charging, every 30 minutes otherwise, at once for new alerts or sessions. */
    static void pushLiveIfDue(Context c, JSONObject live, boolean newSessions) {
        if (!configured(c) || live == null) return;
        long now = System.currentTimeMillis(), last = Store.getLong(c, "livePushAt", 0), gap = now - last;
        boolean charging = live.optBoolean("charging");
        boolean wasCharging = Store.getLong(c, "livePushCh", 0) == 1;
        boolean waiting = Alerts.outbox(c).length() > 0;
        long period = charging ? 5 * 60_000L - 15_000L : 30 * 60_000L - 15_000L;
        if (!(newSessions || gap >= period || (gap >= 30_000L && (waiting || charging != wasCharging)))) return;
        Store.putLong(c, "livePushAt", now);
        Store.putLong(c, "livePushCh", charging ? 1 : 0);
        final Context ac = c.getApplicationContext();
        final boolean withSessions = newSessions;
        new Thread(() -> pushLive(ac, live, withSessions), "farrq-live").start();
    }

    /** Background copy of the measured sessions and the last live reading (used after the meter sync at home). */
    static void pushMeter(Context c) {
        pushLive(c, null, true);
    }

    private static void pushLive(Context c, JSONObject liveNow, boolean withSessions) {
        if (!configured(c)) return;
        try {
            JSONObject p = new JSONObject();
            p.put("kind", "meter");
            p.put("sent", System.currentTimeMillis());
            if (withSessions) {
                JSONArray all = Store.array(c, "sessions"), recent = new JSONArray();
                for (int i = Math.max(0, all.length() - 300); i < all.length(); i++) {
                    JSONObject s = all.optJSONObject(i);
                    if (s != null && s.optBoolean("from_sheet")) continue;   // 2.2.4: copies that came from the Sheet are never sent back
                    recent.put(all.opt(i));
                }
                p.put("sessions", recent);
            }
            JSONArray waiting = Alerts.outbox(c);
            int sentAlerts = waiting.length();
            if (sentAlerts > 0) p.put("alerts", waiting);
            JSONObject ll = liveNow != null ? liveNow : Store.object(c, "lastLive");
            if (ll.length() > 0) {
                JSONObject live = new JSONObject();
                for (String k : new String[]{"watts", "amps", "charging", "today_kwh", "month_kwh", "total_kwh", "now_ms"})
                    if (ll.has(k)) live.put(k, ll.get(k));
                p.put("live", live);
            }
            push(c, p);
            if (sentAlerts > 0) Alerts.outboxDrop(c, sentAlerts);   // only after the Sheet said OK
        } catch (Exception ignored) { /* the app screens retry the next time they are opened */ }
    }
}
