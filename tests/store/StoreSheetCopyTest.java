import android.content.Context;
import org.json.*;
import za.co.farrusco.farrqcharge.StoreTestAccess;

/** Ver_FarrQ_2.2.5: Sheet copies of Shelly sessions are replaced by the real session and never double counted.
 *  Run: tests/store/run.sh  (compiles the real Store.java against tiny stubs of Android and org.json). */
public class StoreSheetCopyTest {
    static int fail = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fail++; }
    static JSONObject sess(String store, long seq, long start, long end, double kwh, boolean copy) throws Exception {
        JSONObject o = new JSONObject();
        o.put("store_id", store); o.put("seq", seq); o.put("start_ms", start); o.put("end_ms", end); o.put("kwh", kwh);
        if (copy) o.put("from_sheet", true);
        return o;
    }
    public static void main(String[] a) throws Exception {
        Context c = new Context();
        long T = 1_760_000_000_000L;
        // abroad: two copies from the Sheet
        JSONArray in = new JSONArray(); in.put(sess("sheet", 0, T, T + 3_600_000, 5.0, true)); in.put(sess("sheet", 0, T + 10_000_000, T + 12_000_000, 2.0, true));
        ok(StoreTestAccess.add(c, in, "sheet") == 2, "two copies stored");
        ok(StoreTestAccess.count(c) == 2, "two sessions held");
        // the same copies again: nothing added
        JSONArray again = new JSONArray(); again.put(sess("sheet", 0, T, T + 3_600_000, 5.0, true));
        ok(StoreTestAccess.add(c, again, "sheet") == 0, "same copy twice adds nothing");
        // home again: the Shelly's real session for the first charge arrives (a few ms apart is fine)
        JSONArray real = new JSONArray(); real.put(sess("meter-1", 7, T + 20, T + 3_600_020, 5.0, false));
        ok(StoreTestAccess.add(c, real, "meter-1") == 1, "real session stored");
        ok(StoreTestAccess.count(c) == 2, "its copy was removed (2 left: real + the other copy)");
        ok(StoreTestAccess.copies(c) == 1, "only the other copy is left");
        // the second real session arrives
        JSONArray real2 = new JSONArray(); real2.put(sess("meter-1", 8, T + 10_000_000, T + 12_000_000, 2.0, false));
        StoreTestAccess.add(c, real2, "meter-1");
        ok(StoreTestAccess.count(c) == 2 && StoreTestAccess.copies(c) == 0, "all copies gone, two real sessions");
        // a real session after a different copy (no overlap, over 60 s apart) does not remove it
        JSONArray cp = new JSONArray(); cp.put(sess("sheet", 0, T + 50_000_000, T + 51_000_000, 1.0, true));
        StoreTestAccess.add(c, cp, "sheet");
        JSONArray other = new JSONArray(); other.put(sess("meter-1", 9, T + 51_500_000, T + 51_800_000, 0.3, false));
        StoreTestAccess.add(c, other, "meter-1");
        ok(StoreTestAccess.copies(c) == 1, "a separate nearby charge keeps its copy");
        ok(StoreTestAccess.count(c) == 4, "four sessions held");
        // real sessions are never removed by the purge
        ok(StoreTestAccess.realCount(c) == 3, "three real sessions kept");
        // a copy that arrives AFTER the real session is dropped at once (no double count)
        JSONArray late = new JSONArray(); late.put(sess("sheet", 0, T + 100_000_000, T + 101_000_000, 3.0, true));
        JSONArray realLate = new JSONArray(); realLate.put(sess("meter-1", 10, T + 100_000_010, T + 101_000_010, 3.0, false));
        StoreTestAccess.add(c, realLate, "meter-1");
        StoreTestAccess.add(c, late, "sheet");
        ok(StoreTestAccess.copies(c) == 1 && StoreTestAccess.realCount(c) == 4, "late copy of an existing real session is dropped");
        System.out.println(fail == 0 ? "ALL PASS" : fail + " FAILED");
        System.exit(fail == 0 ? 0 : 1);
    }
}
