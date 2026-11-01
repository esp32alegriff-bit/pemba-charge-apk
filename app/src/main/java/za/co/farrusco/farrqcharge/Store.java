package za.co.farrusco.farrqcharge;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Everything the 1.7 layer keeps on the phone (the 1.6 screens keep their own data in WebView localStorage). */
final class Store {
    static final String APP_VERSION = "2.0.0.1";
    static final int MAX_SESSIONS = 5000;
    static final int MAX_ALERTS = 1000;

    private Store() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("farrq17", Context.MODE_PRIVATE);
    }

    /* ---------- config ---------- */
    static JSONObject defaults() {
        JSONObject o = new JSONObject();
        try {
            o.put("meterUrl", "http://192.168.1.128");
            o.put("relayUrl", "http://192.168.1.120");
            o.put("relayToken", "");
            o.put("mqttEnabled", false);
            o.put("mqttHost", "192.168.1.102");
            o.put("mqttPort", 1883);
            o.put("mqttUser", "ICM");
            o.put("mqttPass", "");
            o.put("tariff", 3.88);
            o.put("demo", false);
            o.put("demoRealRelay", false);
            o.put("pendingMeter", false);
            o.put("remoteUrl", "");
            o.put("remoteToken", "");
            o.put("remoteName", "");
            o.put("remoteLastOk", 0);
            o.put("remoteLastMsg", "");
        } catch (JSONException ignored) {}
        return o;
    }

    static synchronized JSONObject config(Context c) {
        JSONObject d = defaults();
        try {
            JSONObject saved = new JSONObject(prefs(c).getString("config", "{}"));
            JSONArray names = saved.names();
            if (names != null) for (int i = 0; i < names.length(); i++) {
                String k = names.getString(i);
                d.put(k, saved.get(k));
            }
        } catch (JSONException ignored) {}
        return d;
    }

    /** Merges the given keys into the stored config. Returns the full config. */
    static synchronized JSONObject mergeConfig(Context c, JSONObject patch) {
        JSONObject cfg = config(c);
        try {
            JSONArray names = patch.names();
            boolean meterKeys = false;
            if (names != null) for (int i = 0; i < names.length(); i++) {
                String k = names.getString(i);
                cfg.put(k, patch.get(k));
                if (k.equals("relayUrl") || k.equals("relayToken") || k.startsWith("mqtt") || k.equals("tariff")) meterKeys = true;
            }
            if (meterKeys) cfg.put("pendingMeter", true);
        } catch (JSONException ignored) {}
        prefs(c).edit().putString("config", cfg.toString()).apply();
        return cfg;
    }

    /** Merges keys without marking anything as waiting for the meter. */
    static synchronized JSONObject mergeConfigQuiet(Context c, JSONObject patch) {
        JSONObject cfg = config(c);
        try {
            JSONArray names = patch.names();
            if (names != null) for (int i = 0; i < names.length(); i++) cfg.put(names.getString(i), patch.get(names.getString(i)));
        } catch (JSONException ignored) {}
        prefs(c).edit().putString("config", cfg.toString()).apply();
        return cfg;
    }

    /* ---------- JSON arrays ---------- */
    static synchronized JSONArray array(Context c, String key) {
        try { return new JSONArray(prefs(c).getString(key, "[]")); }
        catch (JSONException e) { return new JSONArray(); }
    }

    static synchronized void putArray(Context c, String key, JSONArray a) {
        prefs(c).edit().putString(key, a.toString()).apply();
    }

    static synchronized JSONObject object(Context c, String key) {
        try { return new JSONObject(prefs(c).getString(key, "{}")); }
        catch (JSONException e) { return new JSONObject(); }
    }

    static synchronized void putObject(Context c, String key, JSONObject o) {
        prefs(c).edit().putString(key, o.toString()).apply();
    }

    static long getLong(Context c, String key, long def) { return prefs(c).getLong(key, def); }
    static void putLong(Context c, String key, long v) { prefs(c).edit().putLong(key, v).apply(); }
    static String getString(Context c, String key, String def) { return prefs(c).getString(key, def); }
    static void putString(Context c, String key, String v) { prefs(c).edit().putString(key, v).apply(); }

    /* ---------- measured sessions ---------- */
    /** Adds sessions that are not already stored (key = store_id + seq). Returns how many were new. */
    static synchronized int addSessions(Context c, String key, JSONArray incoming, String storeId, boolean demo) {
        JSONArray have = array(c, key);
        java.util.HashSet<String> keys = new java.util.HashSet<>();
        for (int i = 0; i < have.length(); i++) {
            JSONObject s = have.optJSONObject(i);
            if (s != null) keys.add(s.optString("store_id") + "#" + s.optLong("seq") + "#" + s.optLong("start_ms"));
        }
        int added = 0;
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject s = incoming.optJSONObject(i);
            if (s == null) continue;
            try {
                if (!s.has("store_id") && storeId != null) s.put("store_id", storeId);
                if (demo) s.put("demo", true);
            } catch (JSONException ignored) {}
            String k = s.optString("store_id") + "#" + s.optLong("seq") + "#" + s.optLong("start_ms");
            if (keys.add(k)) { have.put(s); added++; }
        }
        if (added > 0) {
            purgeSheetCopies(have);   // 2.2.4: a real session replaces the copy that came from the Sheet (and a copy that arrives after the real one is dropped)
            while (have.length() > MAX_SESSIONS) have.remove(0);
            putArray(c, key, have);
        }
        return added;
    }

    /** 2.2.4: removes sessions tagged from_sheet when this phone now holds a real (meter) session at the same time. */
    static boolean purgeSheetCopies(JSONArray have) {
        boolean changed = false;
        try {
            for (int i = have.length() - 1; i >= 0; i--) {
                JSONObject s = have.optJSONObject(i);
                if (s == null || !s.optBoolean("from_sheet")) continue;
                long a = s.optLong("start_ms"), b = s.optLong("end_ms");
                for (int j = 0; j < have.length(); j++) {
                    JSONObject r = have.optJSONObject(j);
                    if (r == null || r.optBoolean("from_sheet")) continue;
                    long ra = r.optLong("start_ms"), rb = r.optLong("end_ms");
                    if (Math.abs(ra - a) <= 60000L || (ra <= b && rb >= a)) { have.remove(i); changed = true; break; }
                }
            }
        } catch (Exception ignored) { /* never stops a session from being stored */ }
        return changed;
    }

    /** 2.2.3: sets one field on a stored session (found by its start time), for example the full-charge verdict. */
    static synchronized void setSessionField(Context c, String key, long startMs, String field, String value) {
        JSONArray have = array(c, key);
        boolean hit = false;
        for (int i = 0; i < have.length(); i++) {
            JSONObject s = have.optJSONObject(i);
            if (s != null && s.optLong("start_ms") == startMs) { try { s.put(field, value); hit = true; } catch (JSONException ignored) {} }
        }
        if (hit) putArray(c, key, have);
    }

    /** 2.2.3: copies a full-charge verdict onto a stored session that has none yet (used by the pasted backup). */
    static synchronized void setSessionFieldIfMissing(Context c, String key, long startMs, String field, String value) {
        JSONArray have = array(c, key);
        boolean hit = false;
        for (int i = 0; i < have.length(); i++) {
            JSONObject s = have.optJSONObject(i);
            if (s != null && s.optLong("start_ms") == startMs && !s.has(field)) { try { s.put(field, value); hit = true; } catch (JSONException ignored) {} }
        }
        if (hit) putArray(c, key, have);
    }
}
