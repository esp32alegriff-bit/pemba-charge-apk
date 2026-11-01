package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The FARRUSCO dot matrix display (ESP32-S3). Read-only status, plus one write: the start battery %.
 * The app never calls the display's /update, /api/orient or /api/say addresses.
 */
final class Display {
    private Display() {}

    static final String DEFAULT_URL = "http://192.168.1.117";

    static String base(Context c) {
        String u = Net.trimSlash(Store.getString(c, "displayUrl", DEFAULT_URL));
        return u.isEmpty() ? DEFAULT_URL : u;
    }

    /** GET /api/status. Always returns an object; "reachable" says whether the display answered. */
    static JSONObject status(Context c) {
        Net.init(c);
        JSONObject out = new JSONObject();
        try {
            out.put("address", base(c));
            if (!Net.onWifi(c)) { out.put("reachable", false); out.put("message", "This phone is not on Wi-Fi"); return out; }
            JSONObject j = new JSONObject(Net.request("GET", base(c) + "/api/status", null, null, 3000));
            j.put("reachable", true); j.put("address", base(c)); j.put("checkedAt", System.currentTimeMillis());
            return j;
        } catch (Exception e) {
            try { out.put("reachable", false); out.put("message", "Display not reachable"); } catch (JSONException ignored) {}
            return out;
        }
    }

    /** Sends the battery % at plug-in. Best effort: a failure never affects the app. */
    static JSONObject start(Context c, int pct) {
        Net.init(c);
        JSONObject out = new JSONObject();
        try {
            int p = Math.max(0, Math.min(100, pct));
            out.put("pct", p);
            if (!Net.onWifi(c)) { out.put("sent", false); out.put("message", "Not on Wi-Fi"); return out; }
            Net.request("GET", base(c) + "/api/start?pct=" + p, null, null, 3000);
            out.put("sent", true);
            Store.putLong(c, "displayStartAt", System.currentTimeMillis());
        } catch (Exception e) {
            try { out.put("sent", false); out.put("message", "Display not reachable"); } catch (JSONException ignored) {}
        }
        return out;
    }
}
