package za.co.farrusco.farrqcharge;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 2.2.3: decides whether a finished charge was a FULL charge.
 *
 * The rule (from the owner): the plug cannot be removed while the relays are ON, so a car that stops by itself
 * leaves the Shelly at about 0 W with relay 1 and relay 2 still ON. That is a full charge.
 * A charge that ends because a relay was switched OFF while the car was drawing power is NOT a full charge.
 *
 * Steps for one finished session (all checks are read-only; nothing is ever switched):
 *  1. First check after the session ends: both relays ON and the Shelly at 25 W or less, or the verdict is "not_full".
 *  2. After 5 minutes at 25 W or less, both relays must still be ON: then "full". If a relay was switched off during
 *     those 5 minutes, or the relay board cannot be read, the verdict is "unsure" (kept in the log, left out of learning).
 *  3. If the car draws power again, the earlier stop was a pause: "not_full".
 * The app screens then add the 5% battery check before the session is used for learning.
 */
final class FullCharge {
    private FullCharge() {}

    static final long FRESH_MS = 20 * 60_000L;         // only sessions that ended this recently are judged (not old history)
    static final String KEY = "fcPending";

    static boolean pending(Context c) { return Store.object(c, KEY).has("start_ms"); }

    /** Called when new sessions were stored: the newest one that qualifies becomes the pending check. */
    static void onNewSessions(Context c, JSONArray added, long nowMs, boolean demo) {
        if (demo || added == null) return;
        JSONObject best = null;
        for (int i = 0; i < added.length(); i++) {
            JSONObject s = added.optJSONObject(i);
            if (s == null || s.has("full")) continue;
            if (s.optDouble("kwh") < 0.2 || s.optLong("duration_s") < 300) continue;
            if (nowMs - s.optLong("end_ms") > FRESH_MS) continue;
            if (best == null || s.optLong("end_ms") > best.optLong("end_ms")) best = s;
        }
        if (best == null) return;
        JSONObject old = Store.object(c, KEY);
        if (old.has("start_ms")) finish(c, old, "unsure", "A newer charge started before this one was decided.");
        JSONObject p = new JSONObject();
        try {
            p.put("start_ms", best.optLong("start_ms")); p.put("end_ms", best.optLong("end_ms"));
            p.put("kwh", best.optDouble("kwh")); p.put("first", false); p.put("relays_on_first", false);
        } catch (JSONException ignored) {}
        Store.putObject(c, KEY, p);
    }

    /** Runs on every background or screen sync while a check is pending. */
    static void tick(Context c, JSONObject live) {
        JSONObject p = Store.object(c, KEY);
        if (!p.has("start_ms") || live == null) return;
        long now = live.optLong("now_ms", 0); if (now <= 0) now = System.currentTimeMillis();
        FullLogic.State st = new FullLogic.State();
        st.endMs = p.optLong("end_ms"); st.first = p.optBoolean("first"); st.relaysOnFirst = p.optBoolean("relays_on_first");
        final String[] why = {""};
        String v = FullLogic.step(st, now, live.optBoolean("charging"), live.optDouble("watts", 0), () -> {
            JSONObject r = Relay.status(c);
            if (!r.optBoolean("connected")) return FullLogic.RELAY_UNREAD;
            return r.optBoolean("relay1On") && r.optBoolean("relay2On") ? FullLogic.RELAY_BOTH_ON : FullLogic.RELAY_NOT_BOTH_ON;
        });
        if (v == null) {
            try { p.put("first", st.first); p.put("relays_on_first", st.relaysOnFirst); } catch (JSONException ignored) {}
            Store.putObject(c, KEY, p);
            return;
        }
        if ("not_full".equals(v)) why[0] = live.optBoolean("charging") ? "The car started drawing power again, so the stop was a pause." : "A relay was switched off while the car was charging.";
        if ("unsure".equals(v)) why[0] = st.relaysOnFirst ? "A relay was switched off before 5 minutes had passed." : "Not decided in time.";
        finish(c, p, v, why[0]);
    }

    private static void finish(Context c, JSONObject p, String verdict, String why) {
        long start = p.optLong("start_ms");
        Store.setSessionField(c, "sessions", start, "full", verdict);
        Store.putObject(c, KEY, new JSONObject());
        double kwh = p.optDouble("kwh");
        String k = String.format(java.util.Locale.US, "%.2f kWh", kwh);
        if ("full".equals(verdict))
            Alerts.add(c, "charge_full", "info", "Full charge recorded, " + k + ". The car stopped by itself.", System.currentTimeMillis(), false, false);
        else if ("not_full".equals(verdict))
            Alerts.add(c, "charge_not_full", "info", "Charge ended before full, " + k + (why.isEmpty() ? "" : ". " + why), System.currentTimeMillis(), false, false);
        else
            Alerts.add(c, "charge_full_unsure", "info", "Charge ended, " + k + ", not sure it was full. " + why, System.currentTimeMillis(), false, false);
    }
}
