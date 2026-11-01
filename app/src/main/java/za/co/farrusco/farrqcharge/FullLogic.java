package za.co.farrusco.farrqcharge;

/**
 * 2.2.3: the full-charge decision, pure Java so it can be tested without Android.
 * Rule: the Shelly at 25 W or less with relay 1 and relay 2 still ON for 5 minutes = full.
 * A relay switched OFF while the car was drawing power = not full.
 */
final class FullLogic {
    private FullLogic() {}

    static final double ZERO_W = 25.0;
    static final long WAIT_MS = 5 * 60_000L;
    static final long GIVE_UP_MS = 20 * 60_000L;

    static final int RELAY_UNREAD = -1, RELAY_NOT_BOTH_ON = 0, RELAY_BOTH_ON = 1;

    /** Reads the relay board only when the rule needs it. */
    interface RelayReader { int read(); }

    static final class State {
        long endMs;
        boolean first, relaysOnFirst;
    }

    /** Returns "full", "not_full", "unsure", or null when the charge is still being watched. */
    static String step(State s, long nowMs, boolean charging, double watts, RelayReader relay) {
        if (charging) return "not_full";                         // the car drew power again: the stop was a pause
        if (nowMs - s.endMs > GIVE_UP_MS) return "unsure";
        if (watts > ZERO_W) return null;                         // still drawing a little: keep watching
        if (!s.first) {
            int r = relay.read();
            if (r == RELAY_UNREAD) return null;                  // try again at the next check
            s.first = true;
            if (r != RELAY_BOTH_ON) return "not_full";           // a relay was off when the car stopped
            s.relaysOnFirst = true;
        }
        if (nowMs - s.endMs < WAIT_MS) return null;              // keep watching until 5 minutes have passed
        int r = relay.read();
        if (r == RELAY_UNREAD) return nowMs - s.endMs > WAIT_MS + 5 * 60_000L ? "unsure" : null;
        return r == RELAY_BOTH_ON ? "full" : "unsure";           // relay switched off before 5 minutes: unsure
    }

    /** 2.2.3: the 5% battery check used by the screens, kept here so it can be tested. */
    static boolean withinTolerance(double startPct, double kwhWall, double packKwh, double lossPct, double tolPct) {
        double stored = kwhWall / (1 + lossPct / 100.0);
        double end = startPct + stored / packKwh * 100.0;
        return Math.abs(end - 100.0) <= tolPct;
    }
}
