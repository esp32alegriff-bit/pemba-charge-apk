package za.co.farrusco.farrqcharge;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Alert log on the phone plus Android notifications. */
final class Alerts {
    static final String CHANNEL = "farrq_alerts";
    private Alerts() {}

    static final String[][] TYPES = {
            {"session_start", "Charging started"},
            {"session_end", "Charging finished"},
            {"charge_stopped_abrupt", "Charging stopped suddenly"},
            {"charge_full", "Full charge recorded"},
            {"charge_not_full", "Charge ended before full"},
            {"charge_full_unsure", "Charge ended, not sure it was full"},
            {"auto_off", "AUTO switched the EV relay off"},
            {"auto_nostart_off", "AUTO: the car never started drawing power"},
            {"relay_off_power_flowing", "Relay OFF but power still flowing"},
            {"overcurrent", "Current above the limit"},
            {"relay_cmd_failed", "Relay command failed"},
            {"meter_offline", "Meter offline"},
            {"meter_online", "Meter back online"},
            {"meter_boot", "Meter restarted"},
            {"time_synced", "Meter clock set"},
            {"config_changed", "Meter settings changed"},
            {"mqtt_error", "MQTT problem"},
    };

    static JSONArray typesJson() {
        JSONArray a = new JSONArray();
        for (String[] t : TYPES) {
            JSONObject o = new JSONObject();
            try { o.put("type", t[0]); o.put("label", t[1]); } catch (JSONException ignored) {}
            a.put(o);
        }
        return a;
    }

    static JSONArray off(Context c) { return Store.array(c, "alertsOff"); }

    static boolean isOff(Context c, String type) {
        JSONArray a = off(c);
        for (int i = 0; i < a.length(); i++) if (type.equals(a.optString(i))) return true;
        return false;
    }

    static synchronized void setOff(Context c, String type, boolean offNow) {
        JSONArray a = off(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) if (!type.equals(a.optString(i))) out.put(a.optString(i));
        if (offNow) out.put(type);
        Store.putArray(c, "alertsOff", out);
    }

    /** Adds one alert to the log (newest first) and optionally shows a notification. */
    static synchronized void add(Context c, String type, String level, String text, long ts, boolean demo, boolean notify) {
        JSONArray a = Store.array(c, "alerts"), out = new JSONArray();
        JSONObject o = new JSONObject();
        try {
            o.put("type", type); o.put("level", level == null ? "info" : level); o.put("text", text);
            o.put("ts", ts > 0 ? ts : System.currentTimeMillis()); o.put("demo", demo);
        } catch (JSONException ignored) {}
        boolean sameAsSheetCopy = !demo && AlertMerge.duplicate(a, type, ts > 0 ? ts : System.currentTimeMillis(), true);
        out.put(o);
        for (int i = 0; i < a.length() && out.length() < Store.MAX_ALERTS; i++) out.put(a.opt(i));
        Store.putArray(c, "alerts", out);
        if (!demo && !AlertMerge.localOnly(type)) outboxAdd(c, o);   // 2.2.5: goes to the Google Sheet so a phone that is away can show it
        if (isOff(c, type)) return;
        Store.putLong(c, "unread", Store.getLong(c, "unread", 0) + 1);
        if (notify && !sameAsSheetCopy) show(c, demo ? text : text, level);   // not twice when the Sheet already brought the same alert
    }

    /** 2.2.5: an alert that came from the Google Sheet (raised by the phone at home). Returns true when it was new. */
    static synchronized boolean addFromSheet(Context c, String type, String level, String text, long ts, boolean notify) {
        JSONArray a = Store.array(c, "alerts"), out = new JSONArray();
        if (type == null || type.isEmpty() || ts <= 0 || AlertMerge.duplicate(a, type, ts, false)) return false;
        JSONObject o = new JSONObject();
        try {
            o.put("type", type); o.put("level", level == null || level.isEmpty() ? "info" : level); o.put("text", text);
            o.put("ts", ts); o.put("demo", false); o.put("from_sheet", true);
        } catch (JSONException ignored) {}
        out.put(o);
        for (int i = 0; i < a.length() && out.length() < Store.MAX_ALERTS; i++) out.put(a.opt(i));
        Store.putArray(c, "alerts", out);
        if (isOff(c, type)) return true;
        Store.putLong(c, "unread", Store.getLong(c, "unread", 0) + 1);
        if (notify) show(c, text, level);
        return true;
    }

    /* ---------- 2.2.5: alerts waiting to go to the Google Sheet ---------- */
    static synchronized JSONArray outbox(Context c) { return Store.array(c, "alertOutbox"); }

    private static synchronized void outboxAdd(Context c, JSONObject alert) {
        JSONArray a = outbox(c);
        try {
            JSONObject o = new JSONObject();
            o.put("type", alert.optString("type")); o.put("level", alert.optString("level", "info"));
            o.put("text", alert.optString("text")); o.put("ts", alert.optLong("ts"));
            a.put(o);
        } catch (JSONException ignored) {}
        AlertMerge.trim(a);
        Store.putArray(c, "alertOutbox", a);
    }

    /** Removes the first n entries (the ones that were sent). */
    static synchronized void outboxDrop(Context c, int n) {
        JSONArray a = outbox(c), out = new JSONArray();
        for (int i = Math.max(0, n); i < a.length(); i++) out.put(a.opt(i));
        Store.putArray(c, "alertOutbox", out);
    }

    static synchronized void removeDemo(Context c) {
        JSONArray a = Store.array(c, "alerts"), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !o.optBoolean("demo")) out.put(o);
        }
        Store.putArray(c, "alerts", out);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "FARR Q alerts", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("EV meter, charging and relay alerts");
        nm.createNotificationChannel(ch);
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        return nm != null && nm.areNotificationsEnabled();
    }

    static void show(Context c, String text, String level) {
        if (!allowed(c)) return;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).putExtra("openScreen", "alerts").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = "critical".equals(level) ? "PEMBA · urgent" : "warning".equals(level) ? "PEMBA · warning" : "PEMBA CHARGE";
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .build();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        int id = (int) (Store.getLong(c, "notifId", 100) + 1);
        Store.putLong(c, "notifId", id > 100000 ? 100 : id);
        try { if (nm != null) nm.notify(id, n); } catch (SecurityException ignored) {}
    }
}
