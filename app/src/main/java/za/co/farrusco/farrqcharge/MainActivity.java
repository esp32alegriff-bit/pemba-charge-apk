package za.co.farrusco.farrqcharge;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Shows the unchanged FARR Q Charge screens (assets/web/index.html) in a WebView served from a fixed
 * https origin, so the 1.6 localStorage, layout and look behave exactly as in the browser.
 */
public class MainActivity extends Activity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    static final String START = ORIGIN + "/web/index.html";
    private static final int REQ_FILE = 41, REQ_NOTIF = 42;

    private WebView web;
    private Bridge bridge;
    private boolean pageReady;
    private String pendingImport;
    private String pendingScreen;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Net.init(this);
        Alerts.ensureChannel(this);
        getWindow().setStatusBarColor(Color.parseColor("#0b0f17"));
        getWindow().setNavigationBarColor(Color.parseColor("#121a28"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0b0f17"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
        bridge = new Bridge(this, web);
        web.addJavascriptInterface(bridge, "FarrNative");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        setContentView(web);

        handleIntent(getIntent());
        if (saved != null) web.restoreState(saved);
        if (web.getUrl() == null) web.loadUrl(START);

        Poller.kick(this);
        askNotificationsOnce();
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
        deliver();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Poller.watchWifi(this);
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.shutdown();
        if (web != null) { web.removeJavascriptInterface("FarrNative"); web.destroy(); }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (!pageReady) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.farrBack&&farrBack())?'yes':'no'", v -> {
            if (!"\"yes\"".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    /* ---------- backups shared into the app from WhatsApp ---------- */
    private void handleIntent(Intent i) {
        if (i == null) return;
        String screen = i.getStringExtra("openScreen");
        if (screen != null) pendingScreen = screen;
        if (!Intent.ACTION_SEND.equals(i.getAction())) return;
        String text = i.getStringExtra(Intent.EXTRA_TEXT);
        Uri stream = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream != null) {
            try (InputStream in = getContentResolver().openInputStream(stream)) {
                if (in != null) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0 && bo.size() < 20_000_000) bo.write(buf, 0, n);
                    text = bo.toString("UTF-8");
                }
            } catch (Exception ignored) {}
        }
        if (text != null && !text.trim().isEmpty()) pendingImport = text;
        i.setAction(null);
    }

    private void deliver() {
        if (!pageReady) return;
        if (pendingImport != null) {
            String t = pendingImport;
            pendingImport = null;
            web.evaluateJavascript("window.farrImportText&&farrImportText(" + Bridge.jsString(t) + ")", null);
        }
        if (pendingScreen != null) {
            String sc = pendingScreen.replaceAll("[^a-z]", "");
            pendingScreen = null;
            web.evaluateJavascript("try{go('" + sc + "')}catch(e){}", null);
        }
    }

    /* ---------- permissions ---------- */
    private void askNotificationsOnce() {
        if (Store.getLong(this, "askedNotif", 0) == 0) {
            Store.putLong(this, "askedNotif", 1);
            askNotifications();
        }
    }

    void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
        } else if (!Alerts.allowed(this)) {
            try {
                startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
            } catch (ActivityNotFoundException ignored) {}
        }
    }

    void askBatteryExemption() {
        try { startActivity(Bridge.batteryIntent(this)); }
        catch (Exception e) {
            try { startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception ignored) {}
        }
    }

    /* ---------- file picker for "Import backup" ---------- */
    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE || fileCallback == null) return;
        Uri[] out = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null && data.getClipData().getItemCount() > 0) out = new Uri[]{data.getClipData().getItemAt(0).getUri()};
            else if (data.getData() != null) out = new Uri[]{data.getData()};
        }
        fileCallback.onReceiveValue(out);
        fileCallback = null;
    }

    private final class Chrome extends WebChromeClient {
        @SuppressWarnings("deprecation")
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent i = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"text/csv", "text/comma-separated-values", "text/plain", "application/octet-stream"});
            try { startActivityForResult(Intent.createChooser(i, "Choose the FARR Q backup"), REQ_FILE); }
            catch (ActivityNotFoundException e) { fileCallback = null; return false; }
            return true;
        }
    }

    /* ---------- serves assets/web at a fixed https origin ---------- */
    private final class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if (!"appassets.androidplatform.net".equals(u.getHost())) return null;
            String path = u.getPath() == null ? "" : u.getPath();
            if (!path.startsWith("/web/") || path.contains("..")) return notFound();
            try {
                AssetManager am = getAssets();
                InputStream in = am.open(path.substring(1));
                WebResourceResponse resp = new WebResourceResponse(mime(path), mime(path).startsWith("text") || path.endsWith(".js") || path.endsWith(".json") ? "UTF-8" : null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                resp.setResponseHeaders(h);
                return resp;
            } catch (Exception e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            if ("appassets.androidplatform.net".equals(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            pageReady = true;
            deliver();
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
}
