package com.tiicai.jingcai;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;

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
                injectSafeAreaTop();
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
    public void onBackPressed() {
        // let the web app handle back (close dialog/sheet, sub page -> previous, tab -> 首页); exit when it returns 0
        web.evaluateJavascript("(function(){try{return window.__appBack?window.__appBack():0}catch(e){return 0}})()",
            v -> { if (!"1".equals(v)) finish(); });
    }
}
