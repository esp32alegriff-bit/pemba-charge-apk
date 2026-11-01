package za.co.farrusco.farrqcharge;

import org.json.JSONArray;
import org.json.JSONObject;

/** 2.2.5: small pure rules for alerts that travel through the Google Sheet (no Android classes, so they can be tested on a laptop). */
final class AlertMerge {
    static final long SAME_MS = 5 * 60_000L;       // the same alert on two phones is within 5 minutes
    static final long LOOK_BACK_MS = 30 * 60_000L; // a pull asks a little further back than the last alert it saw
    static final int OUTBOX_MAX = 60;
    private AlertMerge() {}

    /** Alerts that only make sense on the phone that raised them (it may simply be away from home). */
    static boolean localOnly(String type) {
        return "meter_offline".equals(type) || "meter_online".equals(type);
    }

    /** True when the log already holds the same alert (same type, within 5 minutes). */
    static boolean duplicate(JSONArray log, String type, long ts, boolean onlySheetCopies) {
        if (log == null) return false;
        int n = Math.min(log.length(), 300);
        for (int i = 0; i < n; i++) {
            JSONObject o = log.optJSONObject(i);
            if (o == null || o.optBoolean("demo")) continue;
            if (onlySheetCopies && !o.optBoolean("from_sheet")) continue;
            if (type.equals(o.optString("type")) && Math.abs(o.optLong("ts") - ts) <= SAME_MS) return true;
        }
        return false;
    }

    /** The time to ask the Sheet from. 0 = first contact (nothing is replayed). */
    static long requestSince(long cursor) {
        return cursor <= 0 ? 0 : Math.max(1, cursor - LOOK_BACK_MS);
    }

    /** Keeps the newest OUTBOX_MAX entries. */
    static void trim(JSONArray outbox) {
        while (outbox.length() > OUTBOX_MAX) outbox.remove(0);
    }
}
