import org.json.JSONArray;
import org.json.JSONObject;
import za.co.farrusco.farrqcharge.StoreTestAccess;

public class AlertMergeTest {
    static int fail = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fail++; }
    static JSONObject al(String type, long ts, boolean sheet) throws Exception {
        JSONObject o = new JSONObject(); o.put("type", type); o.put("ts", ts); if (sheet) o.put("from_sheet", true); return o;
    }
    public static void main(String[] a) throws Exception {
        long T = 1_000_000_000_000L;
        JSONArray log = new JSONArray();
        log.put(al("session_start", T, false));
        log.put(al("session_end", T + 60_000, true));
        ok(StoreTestAccess.dup(log, "session_start", T + 200_000, false), "same alert on the other phone, 200 s apart, is a duplicate");
        ok(!StoreTestAccess.dup(log, "session_start", T + 400_000, false), "6.6 minutes apart is a new alert");
        ok(!StoreTestAccess.dup(log, "session_end", T + 60_000, false) == false, "same type and time is a duplicate");
        ok(!StoreTestAccess.dup(log, "session_start", T, true), "a local alert is not a sheet copy");
        ok(StoreTestAccess.dup(log, "session_end", T + 90_000, true), "a sheet copy is found");
        ok(!StoreTestAccess.dup(log, "charge_full", T, false), "different type is new");
        ok(StoreTestAccess.localOnly("meter_offline") && StoreTestAccess.localOnly("meter_online") && !StoreTestAccess.localOnly("session_start"), "only meter offline/online stay local");
        ok(StoreTestAccess.since(0) == 0, "first contact asks from 0");
        ok(StoreTestAccess.since(T) == T - 30 * 60_000L, "later asks 30 minutes before the last alert");
        JSONArray box = new JSONArray();
        for (int i = 0; i < 75; i++) box.put(al("x", i, false));
        StoreTestAccess.trim(box);
        ok(box.length() == 60 && box.optJSONObject(59).optLong("ts") == 74 && box.optJSONObject(0).optLong("ts") == 15, "outbox keeps the newest 60");
        System.out.println(fail == 0 ? "ALL PASS" : "FAILED " + fail);
        System.exit(fail == 0 ? 0 : 1);
    }
}
