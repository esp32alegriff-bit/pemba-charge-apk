package org.json;
class JSONParser {
    private final String s; private int p = 0;
    JSONParser(String s) { this.s = s; }
    private void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
    Object value() throws JSONException {
        ws(); if (p >= s.length()) throw new JSONException("end");
        char c = s.charAt(p);
        if (c == '{') { p++; JSONObject o = new JSONObject(); ws(); if (s.charAt(p) == '}') { p++; return o; }
            while (true) { ws(); String k = (String) value(); ws(); if (s.charAt(p++) != ':') throw new JSONException(":"); o.m.put(k, value()); ws(); char d = s.charAt(p++); if (d == '}') return o; if (d != ',') throw new JSONException(","); } }
        if (c == '[') { p++; JSONArray a = new JSONArray(); ws(); if (s.charAt(p) == ']') { p++; return a; }
            while (true) { a.l.add(value()); ws(); char d = s.charAt(p++); if (d == ']') return a; if (d != ',') throw new JSONException(","); } }
        if (c == '"') { p++; StringBuilder b = new StringBuilder(); while (s.charAt(p) != '"') { char x = s.charAt(p++); if (x == '\\') { char e = s.charAt(p++); b.append(e == 'n' ? '\n' : e); } else b.append(x); } p++; return b.toString(); }
        if (s.startsWith("true", p)) { p += 4; return Boolean.TRUE; }
        if (s.startsWith("false", p)) { p += 5; return Boolean.FALSE; }
        if (s.startsWith("null", p)) { p += 4; return JSONObject.NULL; }
        int q = p; while (q < s.length() && "+-0123456789.eE".indexOf(s.charAt(q)) >= 0) q++;
        String n = s.substring(p, q); p = q;
        try { return n.contains(".") || n.contains("e") || n.contains("E") ? (Object) Double.valueOf(n) : (Object) Long.valueOf(n); } catch (NumberFormatException e) { throw new JSONException("number " + n); }
    }
}
