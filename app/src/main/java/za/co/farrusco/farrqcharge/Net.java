package za.co.farrusco.farrqcharge;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Small blocking HTTP helper for the home network. Never call on the main thread. */
final class Net {
    private Net() {}

    private static volatile Context app;
    static void init(Context c) { if (app == null) app = c.getApplicationContext(); }

    /** The Wi-Fi network, if any. Requests go over it so home addresses work even when Wi-Fi has no internet. */
    static Network wifiNetwork(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(n);
                if (nc != null && nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return n;
            }
        } catch (Exception ignored) {}
        return null;
    }

    static final class HttpError extends IOException {
        final int code;
        HttpError(int code, String body) { super("HTTP " + code + (body == null || body.isEmpty() ? "" : ": " + shorten(body))); this.code = code; }
    }

    private static String shorten(String s) { return s.length() > 160 ? s.substring(0, 160) + "…" : s; }

    static String request(String method, String url, String body, String token, int timeoutMs) throws IOException {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://")))
            throw new IOException("Address must start with http://");
        Network wifi = app != null && url.startsWith("http://") ? wifiNetwork(app) : null;   // 2.2.5: web addresses (Google) use whatever network has internet; home devices use Wi-Fi
        URL u = new URL(url);
        HttpURLConnection c = (HttpURLConnection) (wifi != null ? wifi.openConnection(u) : u.openConnection());
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(timeoutMs);
            c.setReadTimeout(timeoutMs);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("Connection", "close");
            if (token != null && !token.isEmpty()) c.setRequestProperty("X-Farrusco-Token", token);
            if ("POST".equals(method)) {
                byte[] data = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setFixedLengthStreamingMode(data.length);
                try (OutputStream os = c.getOutputStream()) { os.write(data); }
            }
            int code = c.getResponseCode();
            InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
            String text = read(in);
            if (code < 200 || code >= 300) throw new HttpError(code, text);
            return text;
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream is = in) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > 2_000_000) throw new IOException("Reply too large");
            }
            return bo.toString("UTF-8");
        }
    }

    static String trimSlash(String u) {
        if (u == null) return "";
        u = u.trim();
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        return u;
    }

    /** True when the phone is connected to Wi-Fi (any band). No location permission needed. */
    static boolean onWifi(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            return wifiNetwork(ctx) != null;
        } catch (Exception e) {
            return false;
        }
    }
}
