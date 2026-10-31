package com.tiicai.jingcai;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * 竞彩预测: WebView shell. Frontend is bundled in assets/www and served from
 * https://appassets.androidplatform.net/www/ (reserved host, never hits the network),
 * so the page has a normal origin with working localStorage; API calls go to the fixed
 * build-time API_BASE server (see www/config.js, network_security_config.xml).
 * Info & prediction only: no betting / payment / ticket submission.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/www/index.html";
    /** CSS --pri-d / theme-color. Used as WebView/window fill while page paints. */
    static final int CHROME = Color.parseColor("#1B2A4A");
    private static final int FILE_CHOOSER_REQUEST = 9101;
    private static final int REQ_POST_NOTIF = 9102;
    static final String GOAL_CHANNEL = "goal_alerts";
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingOpenHash;
    private boolean pageReady;
    /** Session-level: only show the system POST_NOTIFICATIONS sheet once. */
    private boolean notifyPermAsked;
    private final Handler bgHandler = new Handler(Looper.getMainLooper());
    private final Runnable bgFavGoalTick = new Runnable() {
        @Override public void run() {
            if (web != null) {
                web.evaluateJavascript(
                    "(function(){try{if(window.__tickFavGoalPoll)window.__tickFavGoalPoll();}catch(e){}})();",
                    null);
            }
            bgHandler.postDelayed(this, 30000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyEdgeToEdge();
        web = new WebView(this);
        // Avoid white flash before first CSS/JS paint (cold start + route re-render gaps).
        web.setBackgroundColor(CHROME);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        // content:// URIs from the system image picker (tribe compose, etc.)
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        // page origin is https (bundled assets); allow calls to the http:// API server
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " JingcaiPredictApp/" + BuildConfigVersion.NAME);
        web.addJavascriptInterface(new ChromeBridge(), "JingcaiChrome");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || !path.startsWith("/www/")) return notFound();
                path = path.substring(1);
                if (path.endsWith("/")) path += "index.html";
                if (path.contains("..")) return notFound();
                try {
                    InputStream in = getAssets().open(path);
                    WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (Exception e) {
                    return notFound();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                injectSafeAreaTop();
                injectOpenHash();
                // 1.9.265: system notify dialog on first paint, even if JS boot is slow
                requestGoalNotifyPermission();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
        applyOpenHash(getIntent());
        ensureGoalChannel();
    }

    /**
     * 1.9.121: immersive edge-to-edge. Transparent status bar so header gradients
     * (home / 赛程 / 预测 / 数据 / 我的 / 详情) paint continuously under system icons —
     * same "one surface" feel as 澳客 reference. CSS pads with --sat (injected below).
     * Light status icons on dark chrome by default.
     */
    private void applyEdgeToEdge() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            w.setStatusBarColor(Color.TRANSPARENT);
        }
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility();
        flags |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        decor.setSystemUiVisibility(flags);
    }

    private int statusBarHeightPx() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id > 0) return getResources().getDimensionPixelSize(id);
        return Math.round(24f * getResources().getDisplayMetrics().density);
    }

    /** Push status-bar height into CSS --sat (Android WebView rarely fills env(safe-area-inset-top)). */
    private void injectSafeAreaTop() {
        if (web == null) return;
        final float density = getResources().getDisplayMetrics().density;
        final float cssPx = statusBarHeightPx() / density;
        final String js = "(function(){try{var r=document.documentElement;"
            + "r.style.setProperty('--sat','" + cssPx + "px');"
            + "r.setAttribute('data-edge','1');"
            + "}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    private void setLightStatusIcons(final boolean lightIcons) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                View decor = getWindow().getDecorView();
                int flags = decor.getSystemUiVisibility();
                // keep edge-to-edge layout flags
                flags |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
                if (lightIcons) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                decor.setSystemUiVisibility(flags);
            }
        });
    }

    /** JS bridge: statusBarStyle('light'|'dark') — icon color for dark/light headers. */
    private final class ChromeBridge {
        @JavascriptInterface
        public void statusBarStyle(String style) {
            // light = light icons (dark header); dark = dark icons (light header)
            boolean lightIcons = style == null || !"dark".equalsIgnoreCase(style);
            setLightStatusIcons(lightIcons);
        }

        @JavascriptInterface
        public void refreshSafeArea() {
            runOnUiThread(new Runnable() {
                @Override public void run() { injectSafeAreaTop(); }
            });
        }

        /** Android 13+ POST_NOTIFICATIONS. No-op if already granted or older OS. */
        @JavascriptInterface
        public void requestNotifyPermission() {
            runOnUiThread(new Runnable() {
                @Override public void run() { requestGoalNotifyPermission(); }
            });
        }

        @JavascriptInterface
        public boolean hasNotifyPermission() {
            return hasGoalNotifyPermission();
        }

        /**
         * JSON: { matchId, title, body }. Web-only callers never hit this.
         * Same score must be de-duplicated in JS before calling.
         */
        @JavascriptInterface
        public void notifyGoal(String json) {
            final String raw = json;
            runOnUiThread(new Runnable() {
                @Override public void run() { showGoalNotification(raw); }
            });
        }
    }

    boolean hasGoalNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    void requestGoalNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (hasGoalNotifyPermission()) return;
        if (notifyPermAsked) return;
        notifyPermAsked = true;
        requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQ_POST_NOTIF);
    }

    void ensureGoalChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
            GOAL_CHANNEL, "进球提醒", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("关注场次进球时提醒");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    static boolean validMatchId(String id) {
        return id != null && id.matches("[A-Za-z0-9:._-]{1,80}");
    }

    static String jsonEscape(String s) {
        if (s == null) return "\"\"";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "") + "\"";
    }

    void applyOpenHash(Intent intent) {
        if (intent == null) return;
        String matchId = intent.getStringExtra("match_id");
        if (validMatchId(matchId)) {
            pendingOpenHash = "#/match/" + Uri.encode(matchId);
            intent.removeExtra("match_id");
            injectOpenHash();
        }
    }

    void injectOpenHash() {
        if (pendingOpenHash == null || web == null || !pageReady) return;
        final String hash = pendingOpenHash;
        pendingOpenHash = null;
        final String js = "(function(){try{location.hash=" + jsonEscape(hash) + ";}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    void showGoalNotification(String json) {
        if (!hasGoalNotifyPermission()) return;
        String title = "进球提醒";
        String body = "";
        String matchId = "";
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            if (o.has("title")) title = o.optString("title", title);
            if (o.has("body")) body = o.optString("body", "");
            if (o.has("matchId")) matchId = o.optString("matchId", "");
        } catch (Exception ignored) {
            return;
        }
        if (title == null || title.length() == 0) title = "进球提醒";
        if (body == null) body = "";
        if (title.length() > 40) title = title.substring(0, 40);
        if (body.length() > 120) body = body.substring(0, 120);
        if (!validMatchId(matchId)) matchId = "";

        ensureGoalChannel();
        Intent tap = new Intent(this, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (matchId.length() > 0) tap.putExtra("match_id", matchId);
        int nid = matchId.length() > 0 ? matchId.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, nid, tap, flags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, GOAL_CHANNEL);
        } else {
            b = new Notification.Builder(this);
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        b.setSmallIcon(R.drawable.ic_notify_goal)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setDefaults(Notification.DEFAULT_ALL);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(nid, b.build());
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".glb")) return "model/gltf-binary";
        if (p.endsWith(".gltf")) return "model/gltf+json";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback != null) {
                Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        applyOpenHash(intent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Keep WebView JS running for fav-goal poll; native heartbeat in case timers freeze.
        bgHandler.removeCallbacks(bgFavGoalTick);
        bgHandler.postDelayed(bgFavGoalTick, 30000);
    }

    @Override
    protected void onResume() {
        super.onResume();
        bgHandler.removeCallbacks(bgFavGoalTick);
    }

    @Override
    protected void onDestroy() {
        bgHandler.removeCallbacks(bgFavGoalTick);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // let the web app handle back (close dialog/sheet, sub page -> previous, tab -> 首页); exit when it returns 0
        web.evaluateJavascript("(function(){try{return window.__appBack?window.__appBack():0}catch(e){return 0}})()",
            v -> { if (!"1".equals(v)) finish(); });
    }
}
