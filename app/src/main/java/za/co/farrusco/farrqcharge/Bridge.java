package za.co.farrusco.farrqcharge;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** window.FarrNative for farrq-17.js. sync() answers instantly from the phone; call() runs network work off the UI. */
final class Bridge {
    private final MainActivity act;
    private final WebView web;
    private final Context c;
    private final ExecutorService pool = Executors.newFixedThreadPool(2);

    Bridge(MainActivity act, WebView web) {
        this.act = act;
        this.web = web;
        this.c = act.getApplicationContext();
    }

    private static JSONObject args(String a) {
        try { return new JSONObject(a == null || a.isEmpty() ? "{}" : a); } catch (JSONException e) { return new JSONObject(); }
    }

    /* ================= instant answers ================= */
    @JavascriptInterface
    public String sync(String method, String argJson) {
        JSONObject a = args(argJson);
        try {
            switch (method) {
                case "config": return Store.config(c).toString();
                case "setConfig": return Store.mergeConfig(c, a).toString();
                case "sessions": {
                    JSONObject o = new JSONObject();
                    o.put("sessions", Store.array(c, "sessions"));
                    o.put("demo", Store.config(c).optBoolean("demo") ? Store.array(c, "demoSessions") : new JSONArray());
                    return o.toString();
                }
                case "alerts": {
                    JSONObject o = new JSONObject();
                    o.put("alerts", Store.array(c, "alerts"));
                    o.put("types", Alerts.typesJson());
                    o.put("off", Alerts.off(c));
                    o.put("unread", Store.getLong(c, "unread", 0));
                    return o.toString();
                }
                case "alertsRead": Store.putLong(c, "unread", 0); return "{}";
                case "setAlertType": Alerts.setOff(c, a.optString("type"), a.optBoolean("off")); return "{}";
                case "clearAlerts": Store.putArray(c, "alerts", new JSONArray()); Store.putLong(c, "unread", 0); return "{}";
                case "state": return state().toString();
                case "appInfo": return appInfo().toString();
                case "importExtra": importExtra(a.optString("kind"), a.optJSONObject("obj")); return "{}";
                default: return "{\"error\":\"unknown\"}";
            }
        } catch (Exception e) {
            return "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
        }
    }

    private JSONObject state() throws JSONException {
        boolean demo = Store.config(c).optBoolean("demo");
        String p = demo ? "demo_" : "";
        JSONObject o = new JSONObject();
        o.put("lastPoll", Store.getLong(c, "lastPoll", 0));
        o.put("lastSync", Store.getLong(c, p + "lastSync", 0));
        o.put("lastSeen", Store.getLong(c, p + "lastSeen", 0));
        o.put("onWifi", Net.onWifi(c));
        o.put("notifAllowed", Alerts.allowed(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        o.put("batteryExempt", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        long next = Store.getLong(c, "nextPollAt", 0);
        o.put("nextPollS", next > System.currentTimeMillis() ? (next - System.currentTimeMillis()) / 1000 : 0);
        JSONObject ll = Store.object(c, p + "lastLive");
        o.put("lastLive", ll.length() == 0 ? JSONObject.NULL : ll);
        return o;
    }

    private JSONObject appInfo() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("app", Store.APP_VERSION);
        try {
            android.content.pm.PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
            o.put("installed", new java.util.Date(pi.firstInstallTime).toString());
            o.put("updated", new java.util.Date(pi.lastUpdateTime).toString());
        } catch (Exception ignored) {}
        o.put("package", c.getPackageName());
        o.put("android", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        o.put("phone", Build.MANUFACTURER + " " + Build.MODEL);
        try {
            android.content.pm.PackageInfo wv = WebView.getCurrentWebViewPackage();
            if (wv != null) o.put("webview", wv.packageName + " " + wv.versionName);
        } catch (Exception ignored) {}
        o.put("download", "https://github.com/esp32alegriff-bit/farr-q-charge-apk/releases/latest");
        return o;
    }

    private void importExtra(String kind, JSONObject obj) {
        if (obj == null) return;
        try {
            if ("meter".equals(kind)) {
                if (obj.optBoolean("demo")) return;
                JSONArray a = new JSONArray(); a.put(obj);
                Store.addSessions(c, "sessions", a, obj.optString("store_id", null), false);
                if (obj.has("full")) Store.setSessionFieldIfMissing(c, "sessions", obj.optLong("start_ms"), "full", obj.optString("full"));
            } else if ("alert".equals(kind)) {
                JSONArray have = Store.array(c, "alerts");
                for (int i = 0; i < have.length(); i++) {
                    JSONObject h = have.optJSONObject(i);
                    if (h != null && h.optLong("ts") == obj.optLong("ts") && h.optString("text").equals(obj.optString("text"))) return;
                }
                JSONArray out = new JSONArray();
                boolean placed = false;
                for (int i = 0; i < have.length(); i++) {
                    JSONObject h = have.optJSONObject(i);
                    if (!placed && h != null && h.optLong("ts") < obj.optLong("ts")) { out.put(obj); placed = true; }
                    out.put(h);
                }
                if (!placed) out.put(obj);
                Store.putArray(c, "alerts", out);
            } else if ("settings17".equals(kind)) {
                JSONObject keep = new JSONObject();
                for (String k : new String[]{"meterUrl", "relayUrl", "mqttEnabled", "mqttHost", "mqttPort", "mqttUser", "tariff"})
                    if (obj.has(k)) keep.put(k, obj.get(k));
                Store.mergeConfigQuiet(c, keep);
            }
        } catch (JSONException ignored) {}
    }

    /* ================= network work ================= */
    @JavascriptInterface
    public void call(final int id, final String method, final String argJson) {
        final JSONObject a = args(argJson);
        pool.execute(() -> {
            boolean ok = true;
            String out;
            try {
                out = run(method, a).toString();
            } catch (Exception e) {
                ok = false;
                JSONObject err = new JSONObject();
                try { err.put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()); } catch (JSONException ignored) {}
                out = err.toString();
            }
            reply(id, ok, out);
        });
    }

    private JSONObject run(String method, JSONObject a) throws Exception {
        switch (method) {
            case "live": return Poller.live(c);
            case "sync": {
                JSONObject r = Poller.sync(c);
                Poller.schedule(c, Poller.nextDelay(r, c));
                Poller.watchWifi(c);
                return r;
            }
            case "meterConfig": return MeterApi.get(c).getConfig();
            case "meterConfigSet": {
                JSONObject cfg = MeterApi.get(c).setConfig(a);
                if (a.has("tariff")) { JSONObject t = new JSONObject(); t.put("tariff", a.get("tariff")); Store.mergeConfigQuiet(c, t); }
                return cfg;
            }
            case "meterMinutes": return MeterApi.get(c).minutes(a.optLong("from"), a.optLong("to"));
            case "meterDiag": return MeterApi.get(c).diag();
            case "mqttTest": {
                // make sure the meter has the latest broker settings before it tests them
                if (!Store.config(c).optBoolean("demo") && Store.config(c).optBoolean("pendingMeter")) Poller.sync(c);
                return MeterApi.get(c).mqttTest();
            }
            case "remotePush": return Remote.push(c, a);
            case "relayStatus": return Relay.status(c);
            case "relayDetails": return Relay.details(c);
            case "displayStatus": return Display.status(c);
            case "displayStart": return Display.start(c, a.optInt("pct", -1));
            case "relay": return Relay.command(c, a.optString("path"));
            case "demo": return demo(a.optBoolean("on"));
            case "notifPermission": act.runOnUiThread(act::askNotifications); return new JSONObject();
            case "batteryOpt": act.runOnUiThread(act::askBatteryExemption); return new JSONObject();
            default: throw new IllegalArgumentException("Unknown action " + method);
        }
    }

    private JSONObject demo(boolean on) throws JSONException {
        SharedPreferences.Editor ed = Store.prefs(c).edit();
        for (String k : Store.prefs(c).getAll().keySet())
            if (k.startsWith("demo_") || k.equals("demoSessions") || k.equals(MeterApi.DemoMeter.KEY)) ed.remove(k);
        ed.apply();
        if (on) MeterApi.DemoMeter.reset(c);
        else Alerts.removeDemo(c);
        JSONObject p = new JSONObject();
        p.put("demo", on);
        Store.mergeConfigQuiet(c, p);
        Poller.kick(c);
        return Store.config(c);
    }

    private void reply(int id, boolean ok, String json) {
        final String js = "window.__farrCb&&window.__farrCb(" + id + "," + ok + "," + jsString(json) + ")";
        act.runOnUiThread(() -> { try { web.evaluateJavascript(js, null); } catch (Exception ignored) {} });
    }

    static String jsString(String s) {
        return JSONObject.quote(s).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    }

    /* ================= sharing ================= */
    @JavascriptInterface
    public void shareText(String text, String title) {
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        act.runOnUiThread(() -> act.startActivity(Intent.createChooser(send, title == null || title.isEmpty() ? "Share" : title)));
    }

    @JavascriptInterface
    public void shareFile(String b64, String name, String mime, String title) {
        try {
            String safe = (name == null || name.isEmpty() ? "FARR_Q_file" : name).replaceAll("[^A-Za-z0-9._-]", "_");
            File dir = ShareProvider.dir(c);
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86_400_000L) //noinspection ResultOfMethodCallIgnored
                f.delete();
            File f = new File(dir, safe);
            try (FileOutputStream fo = new FileOutputStream(f)) { fo.write(Base64.decode(b64, Base64.DEFAULT)); }
            Uri uri = Uri.parse("content://" + ShareProvider.authority(c) + "/" + Uri.encode(safe));
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            Intent chooser = Intent.createChooser(send, title == null || title.isEmpty() ? "Share" : title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            act.runOnUiThread(() -> act.startActivity(chooser));
        } catch (Exception e) {
            act.runOnUiThread(() -> web.evaluateJavascript("try{toast(" + jsString("Could not share the file: " + e.getMessage()) + ")}catch(e){}", null));
        }
    }

    void shutdown() { pool.shutdownNow(); }

    static Intent batteryIntent(Context c) {
        return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
    }
}
