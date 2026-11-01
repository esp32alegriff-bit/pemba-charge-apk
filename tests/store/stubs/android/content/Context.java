package android.content;
import java.util.HashMap;
/** Test stub: just enough of Context for Store.java (an in-memory SharedPreferences). */
public class Context {
    public static final int MODE_PRIVATE = 0;
    private final HashMap<String, Object> m = new HashMap<>();
    public Context getApplicationContext() { return this; }
    public SharedPreferences getSharedPreferences(String n, int mode) {
        return new SharedPreferences() {
            public String getString(String k, String d) { Object v = m.get(k); return v instanceof String ? (String) v : d; }
            public long getLong(String k, long d) { Object v = m.get(k); return v instanceof Long ? (Long) v : d; }
            public Editor edit() {
                return new Editor() {
                    public Editor putString(String k, String v) { m.put(k, v); return this; }
                    public Editor putLong(String k, long v) { m.put(k, v); return this; }
                    public void apply() {}
                };
            }
        };
    }
}
