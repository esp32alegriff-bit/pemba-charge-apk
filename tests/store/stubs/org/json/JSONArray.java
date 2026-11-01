package org.json;
import java.util.ArrayList;
/** Test stub of org.json.JSONArray (only what Store.java needs). */
public class JSONArray {
    final ArrayList<Object> l = new ArrayList<>();
    public JSONArray() {}
    public JSONArray(String s) throws JSONException { Object o = new JSONParser(s).value(); if (!(o instanceof JSONArray)) throw new JSONException("not an array"); l.addAll(((JSONArray) o).l); }
    public int length() { return l.size(); }
    public JSONArray put(Object o) { l.add(o); return this; }
    public Object opt(int i) { return i >= 0 && i < l.size() ? l.get(i) : null; }
    public JSONObject optJSONObject(int i) { Object o = opt(i); return o instanceof JSONObject ? (JSONObject) o : null; }
    public String getString(int i) throws JSONException { Object o = opt(i); if (o == null) throw new JSONException("missing"); return String.valueOf(o); }
    public Object remove(int i) { return i >= 0 && i < l.size() ? l.remove(i) : null; }
    @Override public String toString() { StringBuilder b = new StringBuilder("["); for (int i = 0; i < l.size(); i++) { if (i > 0) b.append(','); b.append(JSONObject.write(l.get(i))); } return b.append(']').toString(); }
}
