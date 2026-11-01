package org.json;
import java.util.LinkedHashMap;
/** Test stub of org.json.JSONObject (only what Store.java needs). */
public class JSONObject {
    public static final Object NULL = new Object() { @Override public String toString() { return "null"; } };
    final LinkedHashMap<String, Object> m = new LinkedHashMap<>();
    public JSONObject() {}
    public JSONObject(String s) throws JSONException { Object o = new JSONParser(s).value(); if (!(o instanceof JSONObject)) throw new JSONException("not an object"); m.putAll(((JSONObject) o).m); }
    public JSONObject put(String k, Object v) throws JSONException { m.put(k, v); return this; }
    public JSONObject put(String k, long v) throws JSONException { m.put(k, v); return this; }
    public JSONObject put(String k, double v) throws JSONException { m.put(k, v); return this; }
    public JSONObject put(String k, boolean v) throws JSONException { m.put(k, v); return this; }
    public Object get(String k) throws JSONException { if (!m.containsKey(k)) throw new JSONException("missing " + k); return m.get(k); }
    public boolean has(String k) { return m.containsKey(k); }
    public int length() { return m.size(); }
    public JSONArray names() { if (m.isEmpty()) return null; JSONArray a = new JSONArray(); for (String k : m.keySet()) a.put(k); return a; }
    public String getString(String k) throws JSONException { return String.valueOf(get(k)); }
    public String optString(String k) { return optString(k, ""); }
    public String optString(String k, String d) { Object v = m.get(k); return v == null || v == NULL ? d : String.valueOf(v); }
    public long optLong(String k) { Object v = m.get(k); return v instanceof Number ? ((Number) v).longValue() : 0L; }
    public int optInt(String k, int d) { Object v = m.get(k); return v instanceof Number ? ((Number) v).intValue() : d; }
    public double optDouble(String k, double d) { Object v = m.get(k); return v instanceof Number ? ((Number) v).doubleValue() : d; }
    public boolean optBoolean(String k) { Object v = m.get(k); return v instanceof Boolean && (Boolean) v; }
    public boolean optBoolean(String k, boolean d) { Object v = m.get(k); return v instanceof Boolean ? (Boolean) v : d; }
    public JSONArray optJSONArray(String k) { Object v = m.get(k); return v instanceof JSONArray ? (JSONArray) v : null; }
    public JSONObject optJSONObject(String k) { Object v = m.get(k); return v instanceof JSONObject ? (JSONObject) v : null; }
    public static String quote(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
    static String write(Object o) {
        if (o == null || o == NULL) return "null";
        if (o instanceof String) return quote((String) o);
        return o.toString();
    }
    @Override public String toString() { StringBuilder b = new StringBuilder("{"); boolean f = true; for (String k : m.keySet()) { if (!f) b.append(','); f = false; b.append(quote(k)).append(':').append(write(m.get(k))); } return b.append('}').toString(); }
}
