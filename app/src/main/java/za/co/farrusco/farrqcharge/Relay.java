package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

/** The existing relay board LAN API (Estelle-Cherry-Q-Charging/docs/relay-api-contract.md). Firmware is not changed. */
final class Relay {
    private Relay() {}

    static final String[] ALLOWED = {
            "/api/v1/relay/1/on", "/api/v1/relay/1/off", "/api/v1/relay/2/on", "/api/v1/relay/2/off",
            "/api/v1/charge/start", "/api/v1/charge/stop"
    };

    static JSONObject status(Context c) { return run(c, "GET", "/api/v1/status"); }

    /** The full status JSON as the board sends it (LED, reset and radio details when the board has firmware 2.2). Read-only. */
    static JSONObject details(Context c) {
        Net.init(c);
        JSONObject cfg = Store.config(c);
        String base = Net.trimSlash(cfg.optString("relayUrl"));
        try {
            JSONObject j = new JSONObject(Net.request("GET", base + "/api/v1/status", null, cfg.optString("relayToken"), 4000));
            j.put("reachable", true); j.put("address", base); j.put("checkedAt", System.currentTimeMillis());
            return j;
        } catch (Exception e) {
            JSONObject o = new JSONObject();
            try { o.put("reachable", false); o.put("address", base); o.put("message", "Relay board not reachable"); } catch (JSONException ignored) {}
            return o;
        }
    }

    static JSONObject command(Context c, String path) {
        boolean ok = false;
        for (String a : ALLOWED) if (a.equals(path)) ok = true;
        if (!ok) return result(false, false, false, "Unknown relay command", null);
        JSONObject r = run(c, "POST", path);
        Store.putString(c, "relayLastCmd", path);
        Store.putString(c, "relayLastResult", r.optBoolean("connected") ? "ok" : r.optString("message"));
        Store.putLong(c, "relayLastCmdAt", System.currentTimeMillis());
        return r;
    }

    private static synchronized JSONObject run(Context c, String method, String path) {
        Net.init(c);
        JSONObject cfg = Store.config(c);
        String base = Net.trimSlash(cfg.optString("relayUrl"));
        try {
            String body;
            try {
                body = Net.request(method, base + path, "POST".equals(method) ? "" : null, cfg.optString("relayToken"), 5000);
            } catch (java.io.IOException first) {
                if (first instanceof Net.HttpError) throw first;
                // 2.1.6+: the relay board is a small ESP32 and can be slow when several phones and panels ask at once; wait and try once more
                try { Thread.sleep(600); } catch (InterruptedException ignored) {}
                body = Net.request(method, base + path, "POST".equals(method) ? "" : null, cfg.optString("relayToken"), 6000);
            }
            if ("POST".equals(method) && body.trim().isEmpty()) body = Net.request("GET", base + "/api/v1/status", null, cfg.optString("relayToken"), 5000);
            JSONObject j = new JSONObject(body);
            JSONObject r = result(true, j.optBoolean("relay1_on"), j.optBoolean("relay2_on"), j.optString("message", "Connected"), base);
            Store.putObject(c, "relayLast", r);
            return r;
        } catch (Net.HttpError e) {
            return result(false, false, false, e.code == 401 || e.code == 403 ? "Token refused (check the relay token in Connections)" : e.getMessage(), base);
        } catch (JSONException e) {
            return result(false, false, false, "Relay sent something that is not JSON", base);
        } catch (Exception e) {
            return result(false, false, false, "Not reachable at " + base + " (" + e.getClass().getSimpleName() + ")", base);
        }
    }

    private static JSONObject result(boolean connected, boolean r1, boolean r2, String msg, String base) {
        JSONObject o = new JSONObject();
        try {
            o.put("connected", connected); o.put("relay1On", r1); o.put("relay2On", r2); o.put("message", msg);
            o.put("address", base == null ? "" : base); o.put("checkedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {}
        return o;
    }
}
