package za.co.farrusco.farrqcharge;

import java.util.ArrayList;
import java.util.List;

/**
 * Session rules for the Shelly EM Gen3 meter. Pure Java (no Android, no JSON) so it can be tested on a PC.
 * The Shelly keeps one record per minute (energy in Wh and peak watts). A minute is "charging" when its average
 * power is above start_w, and a session ends after one minute below end_w. This matches the contract rules
 * (start above 100 W, end below 50 W for 60 s) at the Shelly's one-minute resolution.
 */
final class ShellyLogic {
    private ShellyLogic() {}

    /** One stored minute from EM1Data.GetData. ts is the start of the minute in epoch seconds. */
    static final class Minute {
        final long ts; final double wh; final double maxW;
        Minute(long ts, double wh, double maxW) { this.ts = ts; this.wh = wh; this.maxW = maxW; }
    }

    /** A finished session. Times are epoch seconds. */
    static final class Done {
        long startTs, endTs; double wh, peakW; int minutes; String reason;
    }

    /** Running state, kept between checks (the app saves it as JSON). */
    static final class State {
        boolean open;
        long startTs;
        double wh, peakW;
        int minutes;
        long lastTs;      // start of the last minute that was processed (0 = none yet)
    }

    static final long MINUTE = 60;
    static final long GAP = 90;   // more than this between two records means the meter lost power or time

    /**
     * Feeds new minutes (oldest first) into the state. Minutes at or before state.lastTs are ignored.
     * Returns the sessions that finished while processing.
     */
    static List<Done> feed(State st, List<Minute> mins, double startW, double endW, double cal) {
        List<Done> out = new ArrayList<>();
        for (Minute m : mins) {
            if (m.ts <= st.lastTs) continue;
            if (st.open && st.lastTs > 0 && m.ts - st.lastTs > GAP) {
                out.add(close(st, st.lastTs + MINUTE, "meter_gap"));
            }
            double wh = Math.max(0, m.wh) * cal;
            double avgW = wh * 60.0;
            double peak = Math.max(m.maxW * cal, avgW);
            if (!st.open) {
                if (avgW > startW) {
                    st.open = true; st.startTs = m.ts; st.wh = wh; st.peakW = peak; st.minutes = 1;
                }
            } else {
                st.wh += wh; st.minutes++; st.peakW = Math.max(st.peakW, peak);
                if (avgW < endW) out.add(close(st, m.ts + MINUTE, "below_threshold"));
            }
            st.lastTs = m.ts;
        }
        return out;
    }

    private static Done close(State st, long endTs, String reason) {
        Done d = new Done();
        d.startTs = st.startTs; d.endTs = endTs; d.wh = st.wh; d.peakW = st.peakW; d.minutes = st.minutes; d.reason = reason;
        st.open = false; st.wh = 0; st.peakW = 0; st.minutes = 0; st.startTs = 0;
        return d;
    }

    /** Average watts of a finished session. */
    static double avgW(Done d) {
        long s = Math.max(1, d.endTs - d.startTs);
        return d.wh * 3600.0 / s;
    }

    /** kWh of the running session, including the minute that is still in progress (estimated from live watts). */
    static double runningKwh(State st, double liveW, long nowSec) {
        double wh = st.wh;
        long minuteStart = st.lastTs + MINUTE;
        long into = nowSec - minuteStart;
        if (into > 0 && into < 120) wh += Math.max(0, liveW) * into / 3600.0;
        return wh / 1000.0;
    }
}
