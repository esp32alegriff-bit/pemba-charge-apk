package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;

/** The meter, as described in docs/meter-contract.md. HttpMeter talks to the ESP32-S3, ShellyMeter to a Shelly EM Gen3; DemoMeter fakes it on the phone. */
abstract class MeterApi {
    abstract JSONObject live() throws IOException;
    abstract JSONObject sessionsAfter(long after) throws IOException;
    abstract JSONObject eventsAfter(long after) throws IOException;
    abstract JSONObject getConfig() throws IOException;
    abstract JSONObject setConfig(JSONObject patch) throws IOException;
    abstract JSONObject diag() throws IOException;
    abstract JSONObject mqttTest() throws IOException;
    abstract boolean isDemo();
    /** Per-minute points [ts_ms, avg W, avg A, max W] between two epoch-second times. Only the Shelly keeps these. */
    JSONObject minutes(long fromSec, long toSec) throws IOException { throw new IOException("Minute data is only available with the Shelly meter."); }

    static MeterApi get(Context c) {
        JSONObject cfg = Store.config(c);
        if (cfg.optBoolean("demo")) { retireDemo(c); cfg = Store.config(c); }   // 2.1.4: the demo meter is gone, the real meter is always used
        String base = Net.trimSlash(cfg.optString("meterUrl"));
        String type = cfg.optString("meterType", "auto");
        if (type.equals("auto")) type = Store.getString(c, "kind:" + base, "");
        if (type.equals("shelly")) return new ShellyMeter(c, base);
        if (type.equals("esp32")) return new HttpMeter(base);
        return new Detecting(c, base);
    }

    /** 2.1.4: removes the old demo meter data and switches the demo flag off for good. */
    static void retireDemo(Context c) {
        try {
            android.content.SharedPreferences.Editor ed = Store.prefs(c).edit();
            for (String k : Store.prefs(c).getAll().keySet())
                if (k.startsWith("demo_") || k.equals("demoSessions") || k.equals(DemoMeter.KEY)) ed.remove(k);
            ed.apply();
            Alerts.removeDemo(c);
            JSONObject p = new JSONObject();
            p.put("demo", false); p.put("demoRealRelay", false);
            Store.mergeConfigQuiet(c, p);
        } catch (Exception ignored) { }
    }

    static JSONObject parse(String s) throws IOException {
        try { return new JSONObject(s); } catch (JSONException e) { throw new IOException("Meter sent something that is not JSON"); }
    }

    /* ================= real meter ================= */
    static final class HttpMeter extends MeterApi {
        private final String base;
        HttpMeter(String base) { this.base = base; }
        private JSONObject get(String path, int t) throws IOException { return parse(Net.request("GET", base + path, null, null, t)); }
        JSONObject live() throws IOException { return get("/api/v1/meter", 2500); }
        JSONObject sessionsAfter(long a) throws IOException { return get("/api/v1/sessions?after=" + a + "&limit=50", 5000); }
        JSONObject eventsAfter(long a) throws IOException { return get("/api/v1/events?after=" + a + "&limit=50", 5000); }
        JSONObject getConfig() throws IOException { return get("/api/v1/config", 3000); }
        JSONObject setConfig(JSONObject p) throws IOException { return parse(Net.request("POST", base + "/api/v1/config", p.toString(), null, 4000)); }
        JSONObject diag() throws IOException { return get("/api/v1/diag", 3000); }
        JSONObject mqttTest() throws IOException { return parse(Net.request("POST", base + "/api/v1/mqtt/test", "{}", null, 12000)); }
        boolean isDemo() { return false; }
    }

    /* ================= not yet known: ask the device what it is, once ================= */
    /** Works out whether the address is a Shelly or the ESP32 meter, remembers it per address, then hands over. */
    static final class Detecting extends MeterApi {
        private final Context c; private final String base;
        Detecting(Context c, String base) { this.c = c.getApplicationContext(); this.base = base; }
        boolean isDemo() { return false; }

        private MeterApi resolve() throws IOException {
            String kind;
            try {
                JSONObject i = parse(Net.request("GET", base + "/rpc/Shelly.GetDeviceInfo", null, null, 2500));
                kind = (i.has("gen") || i.has("app") || i.has("model")) ? "shelly" : "esp32";
            } catch (Net.HttpError e) {
                kind = e.code == 401 ? "shelly" : (e.code == 404 ? "esp32" : null);
                if (kind == null) throw e;
            } catch (IOException e) {
                if (e.getMessage() != null && e.getMessage().startsWith("Meter sent something")) kind = "esp32";
                else throw e;            // timeout or refused: the meter is simply not answering, ask again next time
            }
            Store.putString(c, "kind:" + base, kind);
            return kind.equals("shelly") ? new ShellyMeter(c, base) : new HttpMeter(base);
        }
        JSONObject live() throws IOException { return resolve().live(); }
        JSONObject sessionsAfter(long a) throws IOException { return resolve().sessionsAfter(a); }
        JSONObject eventsAfter(long a) throws IOException { return resolve().eventsAfter(a); }
        JSONObject getConfig() throws IOException { return resolve().getConfig(); }
        JSONObject setConfig(JSONObject p) throws IOException { return resolve().setConfig(p); }
        JSONObject diag() throws IOException { return resolve().diag(); }
        JSONObject mqttTest() throws IOException { return resolve().mqttTest(); }
        JSONObject minutes(long f, long t) throws IOException { return resolve().minutes(f, t); }
    }

    /* ================= demo meter ================= */
    static final class DemoMeter extends MeterApi {
        static final int CYCLE = 360;          // one fake charge every 6 minutes
        static final String KEY = "demoState";
        private final Context c;
        DemoMeter(Context c) { this.c = c.getApplicationContext(); }
        boolean isDemo() { return true; }

        static JSONObject defaultCfg() {
            JSONObject o = new JSONObject();
            try {
                o.put("cal_factor", 1.0); o.put("start_w", 100); o.put("start_s", 10); o.put("end_w", 50); o.put("end_s", 60);
                o.put("mode", "MANUAL"); o.put("auto_off_w", 100); o.put("auto_off_s", 60); o.put("auto_nostart_min", 10); o.put("overcurrent_a", 14.0);
                o.put("tariff", 3.88); o.put("relay_url", "http://192.168.1.120"); o.put("relay_token_set", false);
                o.put("mqtt_enabled", false); o.put("mqtt_host", "192.168.1.102"); o.put("mqtt_port", 1883); o.put("mqtt_user", "ICM"); o.put("mqtt_pass_set", false);
            } catch (JSONException ignored) {}
            return o;
        }

        /** Starts a fresh demo: called when the switch goes on. */
        static void reset(Context c) {
            JSONObject st = new JSONObject();
            try {
                st.put("startMs", System.currentTimeMillis());
                st.put("doneUntil", System.currentTimeMillis());
                st.put("cfg", defaultCfg());
                st.put("events", new JSONArray());
                st.put("sessions", new JSONArray());
                st.put("eventSeq", 0); st.put("sessionSeq", 0);
                st.put("storeId", "de" + Long.toHexString(System.currentTimeMillis() & 0xffffffL));
            } catch (JSONException ignored) {}
            Store.putObject(c, KEY, st);
        }

        private JSONObject state() {
            JSONObject st = Store.object(c, KEY);
            if (!st.has("startMs")) { reset(c); st = Store.object(c, KEY); }
            return st;
        }

        /* power curve for one cycle, t in seconds */
        static double watts(double t, double cal) {
            double w;
            if (t < 15) w = 0;
            else if (t < 25) w = (t - 15) * 300;
            else if (t < 200) w = 3000 + 18 * Math.sin(t * 0.7) + 9 * Math.sin(t * 2.3);
            else if (t < 260) w = 3000 - 49 * (t - 200);
            else if (t < 275) w = 60 - 4 * (t - 260);
            else w = 0;
            return Math.max(0, w) * cal;
        }
        static double kwhBetween(double a, double b, double cal) {
            double j = 0;
            for (double t = a; t < b; t += 1) j += watts(t + 0.5, cal) * Math.min(1, b - t);
            return j / 3.6e6;
        }
        static final double T_SESSION_START = 15, T_START_EVENT = 25, T_AUTO_OFF = 320, T_END = 323, T_RELAY_ON = 5, T_MANUAL_OFF = 345;

        /** Generates every event and session up to now (only the last two cycles, so a long gap does not flood). */
        private JSONObject tick() {
            JSONObject st = state();
            long now = System.currentTimeMillis();
            long start = st.optLong("startMs");
            long from = Math.max(st.optLong("doneUntil"), now - 2L * CYCLE * 1000);
            JSONObject cfg = st.optJSONObject("cfg"); if (cfg == null) cfg = defaultCfg();
            boolean auto = "AUTO".equals(cfg.optString("mode"));
            double cal = cfg.optDouble("cal_factor", 1.0);
            JSONArray ev = st.optJSONArray("events"); if (ev == null) ev = new JSONArray();
            JSONArray ss = st.optJSONArray("sessions"); if (ss == null) ss = new JSONArray();
            long firstCycle = Math.max(0, (from - start) / 1000 / CYCLE);
            long lastCycle = (now - start) / 1000 / CYCLE;
            try {
                for (long k = firstCycle; k <= lastCycle; k++) {
                    long cs = start + k * CYCLE * 1000L;
                    double kwh = kwhBetween(0, CYCLE, cal);
                    if (k == 0) addEvent(st, ev, cs + 1000, from, now, "meter_boot", "info", "DEMO: meter started (demo mode)");
                    addEvent(st, ev, cs + (long) (T_START_EVENT * 1000), from, now, "session_start", "info", "DEMO: charging started");
                    if (auto) addEvent(st, ev, cs + (long) (T_AUTO_OFF * 1000), from, now, "auto_off", "info", "DEMO: AUTO switched the EV relay OFF, charging finished");
                    long endMs = cs + (long) (T_END * 1000);
                    if (endMs > from && endMs <= now) {
                        long seq = st.optLong("sessionSeq") + 1; st.put("sessionSeq", seq);
                        JSONObject s = new JSONObject();
                        s.put("seq", seq); s.put("start_ms", cs + (long) (T_SESSION_START * 1000)); s.put("end_ms", endMs);
                        s.put("duration_s", (int) (T_END - T_SESSION_START)); s.put("kwh", Math.round(kwh * 1000) / 1000.0);
                        s.put("peak_w", Math.round(3027 * cal)); s.put("avg_w", Math.round(kwh * 3.6e6 / (T_END - T_SESSION_START)));
                        s.put("tariff", cfg.optDouble("tariff", 3.88)); s.put("cost", Math.round(kwh * cfg.optDouble("tariff", 3.88) * 100) / 100.0);
                        s.put("end_reason", auto ? "auto_off" : "below_threshold"); s.put("time_valid", true);
                        ss.put(s);
                        while (ss.length() > 200) ss.remove(0);
                        addEvent(st, ev, endMs, from - 1, now, "session_end", "info",
                                String.format(java.util.Locale.US, "DEMO: charging finished, %.2f kWh in %d min", kwh, (int) ((T_END - T_SESSION_START) / 60)));
                    }
                    if (!auto) addEvent(st, ev, cs + (long) (T_AUTO_OFF * 1000) + 20000, from, now, "relay_off_power_flowing", "warning",
                            "DEMO: example warning, Relay OFF but power still flowing (no contactor fitted)");
                }
                while (ev.length() > 300) ev.remove(0);
                st.put("events", ev); st.put("sessions", ss); st.put("doneUntil", now);
            } catch (JSONException ignored) {}
            Store.putObject(c, KEY, st);
            return st;
        }

        private static void addEvent(JSONObject st, JSONArray ev, long ts, long from, long now, String type, String level, String text) throws JSONException {
            if (ts <= from || ts > now) return;
            long seq = st.optLong("eventSeq") + 1; st.put("eventSeq", seq);
            JSONObject e = new JSONObject();
            e.put("seq", seq); e.put("ts_ms", ts); e.put("type", type); e.put("level", level); e.put("text", text); e.put("data", new JSONObject());
            ev.put(e);
        }

        JSONObject live() {
            JSONObject st = tick();
            JSONObject cfg = st.optJSONObject("cfg"); if (cfg == null) cfg = defaultCfg();
            long now = System.currentTimeMillis(), start = st.optLong("startMs");
            double t = ((now - start) / 1000.0) % CYCLE;
            long cs = now - (long) (t * 1000);
            double cal = cfg.optDouble("cal_factor", 1.0);
            boolean auto = "AUTO".equals(cfg.optString("mode"));
            double w = watts(t, cal);
            boolean charging = t >= T_SESSION_START && t < T_END;
            boolean relay2 = t >= T_RELAY_ON && t < (auto ? T_AUTO_OFF : T_MANUAL_OFF);
            JSONObject o = new JSONObject();
            try {
                o.put("contract", 1); o.put("fw", "DEMO"); o.put("device", "farrusco-ev-meter (demo)"); o.put("store_id", st.optString("storeId"));
                o.put("demo", true); o.put("boot", 1); o.put("uptime_s", (now - start) / 1000); o.put("time_valid", true); o.put("now_ms", now);
                o.put("watts", Math.round(w * 10) / 10.0); o.put("amps", Math.round(w / 230 * 100) / 100.0);
                o.put("raw", Math.round(w / 230 / cal * 10000) / 10000.0); o.put("cal_factor", cal); o.put("volts_nominal", 230);
                o.put("charging", charging);
                double todayDone = 0;
                JSONArray ss = st.optJSONArray("sessions");
                java.util.Calendar cal0 = java.util.Calendar.getInstance();
                cal0.set(java.util.Calendar.HOUR_OF_DAY, 0); cal0.set(java.util.Calendar.MINUTE, 0); cal0.set(java.util.Calendar.SECOND, 0);
                if (ss != null) for (int i = 0; i < ss.length(); i++) {
                    JSONObject s = ss.optJSONObject(i);
                    if (s != null && s.optLong("end_ms") >= cal0.getTimeInMillis()) todayDone += s.optDouble("kwh");
                }
                if (charging) {
                    JSONObject se = new JSONObject();
                    double k = kwhBetween(T_SESSION_START, t, cal);
                    se.put("seq", st.optLong("sessionSeq") + 1); se.put("start_ms", cs + (long) (T_SESSION_START * 1000));
                    se.put("duration_s", (int) (t - T_SESSION_START)); se.put("kwh", Math.round(k * 1000) / 1000.0);
                    se.put("peak_w", Math.round(Math.min(3027, watts(Math.min(t, 199), 1)) * cal)); se.put("avg_w", Math.round(k * 3.6e6 / Math.max(1, t - T_SESSION_START)));
                    o.put("session", se);
                    todayDone += k;
                } else o.put("session", JSONObject.NULL);
                o.put("today_kwh", Math.round(todayDone * 1000) / 1000.0); o.put("month_kwh", Math.round(todayDone * 1000) / 1000.0); o.put("total_kwh", Math.round(todayDone * 1000) / 1000.0);
                o.put("mode", cfg.optString("mode", "MANUAL"));
                JSONObject a = new JSONObject();
                String state = !auto ? "off" : !relay2 ? (t >= T_AUTO_OFF ? "sent" : "idle") : !charging ? "armed" : w <= cfg.optDouble("auto_off_w", 100) ? "below" : "watching";
                a.put("state", state); a.put("below_s", "below".equals(state) ? (int) Math.max(0, t - 259.2) : 0);
                o.put("auto", a);
                JSONObject r = new JSONObject();
                r.put("reachable", true); r.put("relay1_on", true); r.put("relay2_on", relay2); r.put("last_cmd", auto && t >= T_AUTO_OFF ? "relay/2/off" : ""); r.put("last_result", auto && t >= T_AUTO_OFF ? "ok" : ""); r.put("last_ms", 0);
                o.put("relay", r);
                o.put("last_session_seq", st.optLong("sessionSeq")); o.put("last_event_seq", st.optLong("eventSeq"));
                JSONObject wi = new JSONObject(); wi.put("ssid", "Farrusco"); wi.put("rssi", -58); wi.put("channel", 6); wi.put("ip", "192.168.1.128"); wi.put("mac", "DE:MO:00:00:00:00");
                o.put("wifi", wi);
                JSONObject mq = new JSONObject(); mq.put("enabled", cfg.optBoolean("mqtt_enabled")); mq.put("connected", cfg.optBoolean("mqtt_enabled")); mq.put("last_error", "");
                o.put("mqtt", mq);
                JSONObject en = new JSONObject(); en.put("tx_dbm", 20); en.put("sent", (now - start) / 2000); en.put("fail", 0);
                o.put("espnow", en);
            } catch (JSONException ignored) {}
            return o;
        }

        private JSONObject after(String arrKey, String outKey, long after) {
            JSONObject st = tick();
            JSONArray src = st.optJSONArray(arrKey), out = new JSONArray();
            if (src != null) for (int i = 0; i < src.length(); i++) {
                JSONObject x = src.optJSONObject(i);
                if (x != null && x.optLong("seq") > after && out.length() < 50) out.put(x);
            }
            JSONObject o = new JSONObject();
            try { o.put("store_id", st.optString("storeId")); o.put("more", false); o.put(outKey, out); } catch (JSONException ignored) {}
            return o;
        }
        JSONObject sessionsAfter(long a) { return after("sessions", "sessions", a); }
        JSONObject eventsAfter(long a) { return after("events", "events", a); }

        JSONObject getConfig() {
            JSONObject cfg = state().optJSONObject("cfg");
            return cfg != null ? cfg : defaultCfg();
        }
        JSONObject setConfig(JSONObject p) throws IOException {
            JSONObject st = state();
            JSONObject cfg = st.optJSONObject("cfg"); if (cfg == null) cfg = defaultCfg();
            try {
                double f = p.optDouble("cal_factor", cfg.optDouble("cal_factor"));
                if (!(f > 0.05 && f < 20)) throw new IOException("cal_factor must be between 0.05 and 20");
                String m = p.optString("mode", cfg.optString("mode"));
                if (!m.equals("MANUAL") && !m.equals("AUTO")) throw new IOException("mode must be MANUAL or AUTO");
                JSONArray names = p.names();
                if (names != null) for (int i = 0; i < names.length(); i++) {
                    String k = names.getString(i);
                    if (k.equals("relay_token")) cfg.put("relay_token_set", !p.optString(k).isEmpty());
                    else if (k.equals("mqtt_pass")) cfg.put("mqtt_pass_set", !p.optString(k).isEmpty());
                    else cfg.put(k, p.get(k));
                }
                if (cfg.optDouble("end_w") > cfg.optDouble("start_w")) throw new IOException("end_w must be at or below start_w");
                st.put("cfg", cfg);
            } catch (JSONException e) { throw new IOException(e.getMessage()); }
            Store.putObject(c, KEY, st);
            return cfg;
        }
        JSONObject diag() {
            JSONObject o = new JSONObject();
            try {
                o.put("note", "DEMO meter running on this phone. No hardware is connected.");
                o.put("heap_free", 211000); o.put("flash_used", 18432); o.put("flash_total", 1441792);
                o.put("reset_reason", "demo"); o.put("sessions_stored", state().optLong("sessionSeq")); o.put("events_stored", state().optLong("eventSeq"));
                o.put("adc_pin", "GPIO4 (planned)"); o.put("sample_rate", "demo"); o.put("ntp_server", "pool.ntp.org");
            } catch (JSONException ignored) {}
            return o;
        }
        JSONObject mqttTest() {
            JSONObject o = new JSONObject();
            try { o.put("ok", true); o.put("message", "DEMO: pretend connection to " + getConfig().optString("mqtt_host") + ":" + getConfig().optInt("mqtt_port")); } catch (JSONException ignored) {}
            return o;
        }
    }
}
