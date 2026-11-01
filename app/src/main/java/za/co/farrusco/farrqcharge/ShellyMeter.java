package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Shelly EM Gen3 over local Wi-Fi, shown to the rest of the app exactly like the ESP32 meter (docs/meter-contract.md).
 * Live watts and the energy total come from one request (Shelly.GetStatus). Finished sessions are rebuilt from the
 * meter's own stored minute records (EM1Data.GetData), so nothing is lost while the phone is away.
 * Never calls DeleteAllData or ResetCounters. AUTO is not available with this meter (nothing runs on it).
 */
final class ShellyMeter extends MeterApi {
    private static final Object LOCK = new Object();
    private static final String KEY = "shellyState";
    private static final long ALERT_EVERY_MS = 6L * 3600_000L;

    private final Context c;
    private final String base;

    ShellyMeter(Context c, String base) { this.c = c.getApplicationContext(); this.base = base; }

    boolean isDemo() { return false; }

    private JSONObject get(String path, int timeoutMs) throws IOException {
        try {
            return parse(Net.request("GET", base + path, null, null, timeoutMs));
        } catch (Net.HttpError e) {
            if (e.code == 401)
                throw new IOException("The Shelly asks for a password. Turn off its authentication in the Shelly web page so the app can read it.");
            throw e;
        }
    }

    /* ================= saved state ================= */
    private static JSONObject defaultCfg() {
        JSONObject o = new JSONObject();
        try {
            o.put("meter_type", "shelly");
            o.put("cal_factor", 1.0); o.put("start_w", 100); o.put("start_s", 10); o.put("end_w", 50); o.put("end_s", 60);
            o.put("mode", "MANUAL"); o.put("auto_off_w", 100); o.put("auto_off_s", 60); o.put("auto_nostart_min", 10); o.put("overcurrent_a", 14.0);
            o.put("tariff", 3.88); o.put("relay_url", "http://192.168.1.120"); o.put("relay_token_set", false);
            o.put("mqtt_enabled", false); o.put("mqtt_host", "192.168.1.102"); o.put("mqtt_port", 1883); o.put("mqtt_user", "ICM"); o.put("mqtt_pass_set", false);
        } catch (JSONException ignored) {}
        return o;
    }

    private JSONObject state() {
        JSONObject st = Store.object(c, KEY);
        try {
            if (st.optJSONObject("cfg") == null) st.put("cfg", defaultCfg());
            if (st.optJSONArray("sessions") == null) st.put("sessions", new JSONArray());
            if (st.optJSONArray("events") == null) st.put("events", new JSONArray());
        } catch (JSONException ignored) {}
        return st;
    }

    private void save(JSONObject st) { Store.putObject(c, KEY, st); }

    private static ShellyLogic.State logicState(JSONObject st) {
        ShellyLogic.State s = new ShellyLogic.State();
        s.open = st.optBoolean("open"); s.startTs = st.optLong("startTs"); s.wh = st.optDouble("wh", 0);
        s.peakW = st.optDouble("peakW", 0); s.minutes = st.optInt("minutes"); s.lastTs = st.optLong("lastTs");
        return s;
    }

    private static void putLogic(JSONObject st, ShellyLogic.State s) throws JSONException {
        st.put("open", s.open); st.put("startTs", s.startTs); st.put("wh", s.wh);
        st.put("peakW", s.peakW); st.put("minutes", s.minutes); st.put("lastTs", s.lastTs);
    }

    private static void addEvent(JSONObject st, long tsMs, String type, String level, String text) throws JSONException {
        long seq = st.optLong("eventSeq") + 1; st.put("eventSeq", seq);
        JSONObject e = new JSONObject();
        e.put("seq", seq); e.put("ts_ms", tsMs); e.put("type", type); e.put("level", level); e.put("text", text); e.put("data", new JSONObject());
        JSONArray ev = st.optJSONArray("events");
        ev.put(e);
        while (ev.length() > 300) ev.remove(0);
    }

    /* ================= live reading ================= */
    JSONObject live() throws IOException {
        JSONObject S = get("/rpc/Shelly.GetStatus", 3000);
        JSONObject em = S.optJSONObject("em1:0");
        if (em == null) throw new IOException("This Shelly has no energy channel (em1:0). Is it a Shelly EM Gen3?");
        JSONObject ed = S.optJSONObject("em1data:0");
        double totalWh = ed != null ? ed.optDouble("total_act_energy", 0)
                : get("/rpc/EM1Data.GetStatus?id=0", 2500).optDouble("total_act_energy", 0);
        JSONObject sys = S.optJSONObject("sys") != null ? S.optJSONObject("sys") : new JSONObject();
        JSONObject wf = S.optJSONObject("wifi") != null ? S.optJSONObject("wifi") : new JSONObject();

        long phoneMs = System.currentTimeMillis();
        long devSec = sys.optLong("unixtime", 0);
        boolean timeValid = devSec > 1_600_000_000L;
        long nowSec = timeValid ? devSec : phoneMs / 1000;

        synchronized (LOCK) {
            JSONObject st = state();
            JSONObject cfg = st.optJSONObject("cfg");
            double cal = cfg.optDouble("cal_factor", 1.0);
            double startW = cfg.optDouble("start_w", 100), endW = cfg.optDouble("end_w", 50);
            double rawW = em.optDouble("act_power", 0);
            double watts = rawW * cal;
            double amps = Math.abs(em.optDouble("current", 0)) * cal;
            JSONObject o = new JSONObject();
            try {
                String mac = sys.optString("mac", "");
                String sid = "sh" + (mac.length() >= 6 ? mac.substring(mac.length() - 6).toLowerCase(Locale.US) : "meter");
                st.put("storeId", sid);

                ShellyLogic.State ls = logicState(st);
                long lastCatch = st.optLong("lastCatch");
                boolean due = timeValid && (phoneMs - lastCatch >= 60_000L)
                        && (ls.open || Math.abs(watts) >= endW || phoneMs - lastCatch >= 10 * 60_000L);
                if (due) {
                    try { catchUp(st, ls, nowSec, cal, startW, endW, cfg); st.put("lastCatch", phoneMs); }
                    catch (IOException | JSONException ignored) { /* keep what we have; try again at the next check */ }
                }

                JSONArray errs = em.optJSONArray("errors");
                JSONArray meterErrors = new JSONArray();
                if (errs != null) for (int i = 0; i < errs.length(); i++) {
                    String e = errs.optString(i);
                    if (e.startsWith("out_of_range")) continue;   // a high or low reading is not a fault by itself
                    meterErrors.put(e);
                }
                long nowMs = phoneMs;
                if (meterErrors.length() > 0 && nowMs - st.optLong("errAlertAt") > ALERT_EVERY_MS) {
                    boolean ct = meterErrors.toString().contains("ct_type_not_set");
                    addEvent(st, nowMs, "meter_error", "warning", ct
                            ? "Shelly: clamp type is not set. Set the CT type to 50AEMG3 on the meter (this meter accepts 50AEMG3 or 80A)."
                            : "Shelly reports a fault: " + meterErrors.toString());
                    st.put("errAlertAt", nowMs);
                }
                if (rawW < -50 && nowMs - st.optLong("revAlertAt") > ALERT_EVERY_MS) {
                    addEvent(st, nowMs, "meter_reversed", "warning", "Shelly: watts read negative. The clamp is on backwards (K to L) or Reverse must be set.");
                    st.put("revAlertAt", nowMs);
                }
                save(st);

                ls = logicState(st);
                boolean charging = (ls.open && watts >= endW) || watts > startW;
                double today = 0, month = 0;
                Calendar d0 = Calendar.getInstance();
                d0.set(Calendar.HOUR_OF_DAY, 0); d0.set(Calendar.MINUTE, 0); d0.set(Calendar.SECOND, 0); d0.set(Calendar.MILLISECOND, 0);
                long dayMs = d0.getTimeInMillis();
                d0.set(Calendar.DAY_OF_MONTH, 1);
                long monthMs = d0.getTimeInMillis();
                JSONArray ss = st.optJSONArray("sessions");
                for (int i = 0; i < ss.length(); i++) {
                    JSONObject s = ss.optJSONObject(i);
                    if (s == null) continue;
                    long end = s.optLong("end_ms");
                    if (end >= dayMs) today += s.optDouble("kwh");
                    if (end >= monthMs) month += s.optDouble("kwh");
                }

                o.put("contract", 1); o.put("fw", "Shelly EM Gen3"); o.put("device", "shelly-em-gen3"); o.put("store_id", sid);
                o.put("meter_type", "shelly");
                o.put("boot", 1); o.put("uptime_s", sys.optLong("uptime", 0)); o.put("time_valid", timeValid); o.put("now_ms", nowSec * 1000L);
                o.put("watts", Math.round(watts * 10) / 10.0); o.put("amps", Math.round(amps * 100) / 100.0);
                o.put("raw", Math.round(Math.abs(em.optDouble("current", 0)) * 10000) / 10000.0);
                o.put("cal_factor", cal); o.put("volts_nominal", 230);
                o.put("volts", Math.round(em.optDouble("voltage", 0) * 10) / 10.0);
                o.put("pf", em.optDouble("pf", 0)); o.put("freq", em.optDouble("freq", 0));
                o.put("meter_errors", meterErrors);
                o.put("charging", charging);
                double runKwh = 0;
                if (charging) {
                    JSONObject se = new JSONObject();
                    long startSec = ls.open ? ls.startTs : nowSec;
                    runKwh = ls.open ? ShellyLogic.runningKwh(ls, watts, nowSec) : 0;
                    long dur = Math.max(0, nowSec - startSec);
                    se.put("seq", st.optLong("seq") + 1); se.put("start_ms", startSec * 1000L); se.put("duration_s", dur);
                    se.put("kwh", Math.round(runKwh * 1000) / 1000.0);
                    se.put("peak_w", Math.round(Math.max(ls.peakW, watts)));
                    se.put("avg_w", dur > 0 ? Math.round(runKwh * 3.6e6 / dur) : Math.round(watts));
                    o.put("session", se);
                } else o.put("session", JSONObject.NULL);
                o.put("today_kwh", Math.round((today + runKwh) * 1000) / 1000.0);
                o.put("month_kwh", Math.round((month + runKwh) * 1000) / 1000.0);
                o.put("total_kwh", Math.round(totalWh * cal) / 1000.0);
                o.put("mode", "MANUAL");
                JSONObject a = new JSONObject(); a.put("state", "off"); a.put("below_s", 0); o.put("auto", a);
                JSONObject r = new JSONObject();
                r.put("reachable", false); r.put("relay1_on", false); r.put("relay2_on", false); r.put("last_cmd", ""); r.put("last_result", ""); r.put("last_ms", 0);
                o.put("relay", r);
                o.put("last_session_seq", st.optLong("seq")); o.put("last_event_seq", st.optLong("eventSeq"));
                JSONObject w = new JSONObject();
                w.put("ssid", wf.optString("ssid")); w.put("rssi", wf.optInt("rssi")); w.put("channel", 0); w.put("ip", wf.optString("sta_ip")); w.put("mac", mac);
                o.put("wifi", w);
                JSONObject mq = new JSONObject(); mq.put("enabled", false); mq.put("connected", false); mq.put("last_error", "");
                o.put("mqtt", mq);
                JSONObject en = new JSONObject(); en.put("tx_dbm", 0); en.put("sent", 0); en.put("fail", 0);
                o.put("espnow", en);
            } catch (JSONException e) { throw new IOException("Could not read the Shelly reply"); }
            return o;
        }
    }

    /** Reads the minutes stored on the meter since the last check and turns them into sessions and alerts. */
    private void catchUp(JSONObject st, ShellyLogic.State ls, long nowSec, double cal, double startW, double endW, JSONObject cfg)
            throws IOException, JSONException {
        boolean firstTime = ls.lastTs == 0;
        long from = firstTime ? nowSec - 10L * 86400L : ls.lastTs + 1;
        List<ShellyLogic.Minute> mins = new ArrayList<>();
        for (int chunk = 0; chunk < 40; chunk++) {
            JSONObject r = get("/rpc/EM1Data.GetData?id=0&ts=" + from + "&end_ts=" + nowSec, 6000);
            JSONArray keys = r.optJSONArray("keys");
            int iWh = 0, iMax = 4;
            if (keys != null) for (int i = 0; i < keys.length(); i++) {
                if ("total_act_energy".equals(keys.optString(i))) iWh = i;
                if ("max_act_power".equals(keys.optString(i))) iMax = i;
            }
            JSONArray data = r.optJSONArray("data");
            int got = 0;
            if (data != null) for (int b = 0; b < data.length(); b++) {
                JSONObject blk = data.optJSONObject(b);
                if (blk == null) continue;
                long ts = blk.optLong("ts"), period = blk.optLong("period", 60);
                if (ts < 1_600_000_000L) continue;               // meter clock was not set for this block
                JSONArray vals = blk.optJSONArray("values");
                if (vals == null) continue;
                for (int i = 0; i < vals.length(); i++) {
                    JSONArray row = vals.optJSONArray(i);
                    if (row == null) continue;
                    long mts = ts + i * period;
                    if (mts + 60 > nowSec + 5) continue;          // minute not finished yet
                    mins.add(new ShellyLogic.Minute(mts, row.optDouble(iWh, 0), row.optDouble(iMax, 0)));
                    got++;
                }
            }
            long next = r.optLong("next_record_ts", 0);
            if (got == 0 || next <= from || next > nowSec) break;
            from = next;
        }
        java.util.Collections.sort(mins, new java.util.Comparator<ShellyLogic.Minute>() {
            public int compare(ShellyLogic.Minute x, ShellyLogic.Minute y) { return x.ts < y.ts ? -1 : (x.ts > y.ts ? 1 : 0); }
        });
        List<ShellyLogic.Done> done = ShellyLogic.feed(ls, mins, startW, endW, cal);
        double tariff = cfg.optDouble("tariff", 3.88);
        JSONArray ss = st.optJSONArray("sessions");
        long lastStartEv = st.optLong("lastStartEv");
        for (ShellyLogic.Done d : done) {
            if (firstTime) lastStartEv = Math.max(lastStartEv, d.startTs);
            if (!firstTime && d.startTs > lastStartEv) {
                addEvent(st, d.startTs * 1000L, "session_start", "info", "Charging started");
                lastStartEv = d.startTs;
            }
            double kwh = d.wh / 1000.0;
            long seq = st.optLong("seq") + 1; st.put("seq", seq);
            JSONObject s = new JSONObject();
            s.put("seq", seq); s.put("start_ms", d.startTs * 1000L); s.put("end_ms", d.endTs * 1000L);
            s.put("duration_s", d.endTs - d.startTs); s.put("kwh", Math.round(kwh * 1000) / 1000.0);
            s.put("peak_w", Math.round(d.peakW)); s.put("avg_w", Math.round(ShellyLogic.avgW(d)));
            s.put("tariff", tariff); s.put("cost", Math.round(kwh * tariff * 100) / 100.0);
            s.put("end_reason", d.reason); s.put("time_valid", true);
            ss.put(s);
            while (ss.length() > 500) ss.remove(0);
            if (!firstTime) addEvent(st, d.endTs * 1000L, "session_end", "info",
                    String.format(Locale.US, "Charging finished, %.2f kWh in %d min", kwh, (int) ((d.endTs - d.startTs) / 60)));
        }
        if (firstTime && ls.open) lastStartEv = Math.max(lastStartEv, ls.startTs);
        if (!firstTime && ls.open && ls.startTs > lastStartEv) {
            addEvent(st, ls.startTs * 1000L, "session_start", "info", "Charging started");
            lastStartEv = ls.startTs;
        }
        st.put("lastStartEv", lastStartEv);
        putLogic(st, ls);
    }

    /** Minute records from the Shelly for a time range, as [ts_ms, avg W, avg A, max W]. Read-only. */
    JSONObject minutes(long fromSec, long toSec) throws IOException {
        JSONObject out = new JSONObject();
        JSONArray pts = new JSONArray();
        double cal;
        synchronized (LOCK) { cal = state().optJSONObject("cfg").optDouble("cal_factor", 1.0); }
        long from = Math.max(fromSec, 1_600_000_000L), to = toSec;
        try {
            for (int chunk = 0; chunk < 30 && from < to; chunk++) {
                JSONObject r = get("/rpc/EM1Data.GetData?id=0&ts=" + from + "&end_ts=" + to, 6000);
                JSONArray keys = r.optJSONArray("keys");
                int iWh = 0, iMax = 4, iAvgA = -1, iMaxA = -1;
                if (keys != null) for (int i = 0; i < keys.length(); i++) {
                    String k = keys.optString(i);
                    if ("total_act_energy".equals(k)) iWh = i;
                    else if ("max_act_power".equals(k)) iMax = i;
                    else if ("avg_current".equals(k)) iAvgA = i;
                    else if ("max_current".equals(k)) iMaxA = i;
                }
                JSONArray data = r.optJSONArray("data");
                int got = 0;
                if (data != null) for (int b = 0; b < data.length(); b++) {
                    JSONObject blk = data.optJSONObject(b);
                    if (blk == null) continue;
                    long ts = blk.optLong("ts"), period = blk.optLong("period", 60);
                    if (ts < 1_600_000_000L) continue;
                    JSONArray vals = blk.optJSONArray("values");
                    if (vals == null) continue;
                    for (int i = 0; i < vals.length(); i++) {
                        JSONArray row = vals.optJSONArray(i);
                        if (row == null) continue;
                        long mts = ts + i * period;
                        if (mts < fromSec || mts > to) continue;
                        double w = row.optDouble(iWh, 0) * cal * 60.0;
                        double a = iAvgA >= 0 ? Math.abs(row.optDouble(iAvgA, 0)) : (iMaxA >= 0 ? Math.abs(row.optDouble(iMaxA, 0)) : w / 230.0);
                        JSONArray p = new JSONArray();
                        p.put(mts * 1000L); p.put(Math.round(w)); p.put(Math.round(a * cal * 100) / 100.0); p.put(Math.round(row.optDouble(iMax, 0) * cal));
                        pts.put(p); got++;
                    }
                }
                long next = r.optLong("next_record_ts", 0);
                if (got == 0 || next <= from || next > to) break;
                from = next;
            }
            out.put("points", pts); out.put("from", fromSec); out.put("to", toSec);
        } catch (JSONException e) { throw new IOException("Could not read the Shelly reply"); }
        return out;
    }

    /* ================= history for the app ================= */
    private JSONObject after(String arrKey, String outKey, long after) {
        synchronized (LOCK) {
            JSONObject st = state();
            JSONArray src = st.optJSONArray(arrKey), out = new JSONArray();
            boolean more = false;
            if (src != null) for (int i = 0; i < src.length(); i++) {
                JSONObject x = src.optJSONObject(i);
                if (x == null || x.optLong("seq") <= after) continue;
                if (out.length() < 50) out.put(x); else more = true;
            }
            JSONObject o = new JSONObject();
            try { o.put("store_id", st.optString("storeId")); o.put("more", more); o.put(outKey, out); } catch (JSONException ignored) {}
            return o;
        }
    }
    JSONObject sessionsAfter(long a) { return after("sessions", "sessions", a); }
    JSONObject eventsAfter(long a) { return after("events", "events", a); }

    /* ================= settings kept on the phone ================= */
    JSONObject getConfig() {
        synchronized (LOCK) { return state().optJSONObject("cfg"); }
    }

    JSONObject setConfig(JSONObject p) throws IOException {
        synchronized (LOCK) {
            JSONObject st = state();
            JSONObject cfg = st.optJSONObject("cfg");
            try {
                double f = p.optDouble("cal_factor", cfg.optDouble("cal_factor"));
                if (!(f > 0.05 && f < 20)) throw new IOException("cal_factor must be between 0.05 and 20");
                String m = p.optString("mode", cfg.optString("mode"));
                if (m.equals("AUTO")) throw new IOException("AUTO is not available with the Shelly meter yet. Charging is not affected.");
                if (!m.equals("MANUAL")) throw new IOException("mode must be MANUAL");
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
            save(st);
            return cfg;
        }
    }

    JSONObject diag() throws IOException {
        JSONObject o = new JSONObject();
        try {
            JSONObject i = get("/rpc/Shelly.GetDeviceInfo", 3000);
            o.put("note", "Shelly EM Gen3, read over local Wi-Fi. Sessions are rebuilt from the meter's stored minute records.");
            o.put("model", i.optString("model")); o.put("app", i.optString("app")); o.put("fw_id", i.optString("fw_id"));
            o.put("mac", i.optString("mac")); o.put("auth_enabled", i.optBoolean("auth_en"));
            try {
                JSONObject cc = get("/rpc/EM1.GetConfig?id=0", 3000);
                o.put("ct_type", cc.isNull("ct_type") ? "not set" : cc.optString("ct_type"));
                o.put("reverse", cc.optBoolean("reverse"));
            } catch (IOException e) { o.put("ct_type", "unknown: " + e.getMessage()); }
            synchronized (LOCK) {
                JSONObject st = state();
                o.put("sessions_stored", st.optJSONArray("sessions").length());
                o.put("events_stored", st.optJSONArray("events").length());
                o.put("last_minute_ts", st.optLong("lastTs"));
                o.put("last_catchup_ms", st.optLong("lastCatch"));
            }
        } catch (JSONException e) { throw new IOException("Could not read the Shelly reply"); }
        return o;
    }

    JSONObject mqttTest() throws IOException {
        throw new IOException("The MQTT test is only for the ESP32 meter. The Shelly has its own MQTT page.");
    }
}
