package com.tiicai.jingcai;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
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
 * 云球迷: WebView shell. Frontend is bundled in assets/www and served from
 * https://appassets.androidplatform.net/www/ (reserved host, never hits the network),
 * so the page has a normal origin with working localStorage; API calls go to the fixed
 * build-time API_BASE server (see www/config.js, network_security_config.xml).
 * Info & prediction only: no betting / payment / ticket submission.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/www/index.html";
    /** Light splash / first-paint fill so the old navy centered-icon look never flashes. */
    static final int CHROME = Color.parseColor("#F7F7F8");
    private static final int FILE_CHOOSER_REQUEST = 9101;
    private static final int REQ_POST_NOTIF = 9102;
    static final String GOAL_CHANNEL = "goal_alerts"; // 进球提醒
    private static MainActivity alive;
    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingOpenHash;
    private boolean pageReady;
    private View splashBrand;
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
        // Light fill so splash→HTML first paint stays one color (no navy / centered icon).
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
            public void onPageCommitVisible(WebView view, String url) {
                hideNativeSplashBrand();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                injectSafeAreaTop();
                injectOpenHash();
                hideNativeSplashBrand();
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
        setContentView(buildSplashRoot(web));
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START);
        alive = this;
        applyOpenHash(getIntent());
        GoalNotify.showChannel(this);
        maybeStartPush();
    }

    /**
     * 1.9.121: immersive edge-to-edge. Transparent status bar so header gradients
     * (home / 赛程 / 预测 / 数据 / 我的 / 详情) paint continuously under system icons —
     * same "one surface" feel as 澳客 reference. CSS pads with --sat (injected below).
     * Dark status icons on the light splash; JS later sets per-route icon color.
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        decor.setSystemUiVisibility(flags);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /** Light full-screen + bottom-center Design G icon and 「云球迷」 until HTML splash paints. */
    private View buildSplashRoot(WebView webView) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(CHROME);
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        final int iconPx = dp(40);
        ImageView icon = new ImageView(this);
        // Same Design G PNG as HTML icon-192 — adaptive ic_launcher has inset and jumps on handoff.
        icon.setImageResource(R.drawable.splash_brand_icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(iconPx, iconPx);
        icon.setLayoutParams(iconLp);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            icon.setOutlineProvider(new ViewOutlineProvider() {
                @Override public void getOutline(View view, Outline outline) {
                    outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(11));
                }
            });
            icon.setClipToOutline(true);
        }

        TextView name = new TextView(this);
        name.setText("云球迷");
        name.setTextColor(Color.parseColor("#1A1A1A"));
        // CSS 22px == 22dp (not sp) so user font scale cannot shift the lockup vs HTML.
        name.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 22);
        name.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        name.setIncludeFontPadding(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            name.setLetterSpacing(0.02f);
        }
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nameLp.leftMargin = dp(10);
        name.setLayoutParams(nameLp);

        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.HORIZONTAL);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        brand.addView(icon);
        brand.addView(name);

        FrameLayout.LayoutParams brandLp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        brandLp.bottomMargin = dp(56);
        root.addView(brand, brandLp);
        splashBrand = brand;
        return root;
    }

    private void hideNativeSplashBrand() {
        if (splashBrand == null) return;
        final View brand = splashBrand;
        splashBrand = null;
        // Instant remove — a 160ms fade of a slightly-offset copy looks like a jump.
        brand.setVisibility(View.GONE);
        ViewGroup parent = (ViewGroup) brand.getParent();
        if (parent != null) parent.removeView(brand);
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
            + "if(window.syncTopChromeHeight)window.syncTopChromeHeight();"
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
         * JSON: { matchId, title, body, scoreKey }. Web-only callers never hit this.
         * Same score must be de-duplicated in JS before calling.
         */
        @JavascriptInterface
        public void notifyGoal(String json) {
            final String raw = json;
            runOnUiThread(new Runnable() {
                @Override public void run() { showGoalNotification(raw); }
            });
        }

        @JavascriptInterface
        public void startPush() {
            runOnUiThread(new Runnable() {
                @Override public void run() { maybeStartPush(); }
            });
        }

        @JavascriptInterface
        public String getPushRegId() {
            return PushBootstrap.registrationId(MainActivity.this);
        }

        @JavascriptInterface
        public String getPushDeviceId() {
            return PushState.ensureDeviceId(MainActivity.this);
        }

        @JavascriptInterface
        public String getPushDeviceSecret() {
            String s = PushState.deviceSecret(MainActivity.this);
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public void setPushDeviceSecret(String secret) {
            PushState.storeSecret(MainActivity.this, secret);
        }

        @JavascriptInterface
        public boolean isPushReady() {
            String r = PushState.regId(MainActivity.this);
            return r != null && r.length() > 0 && PushBootstrap.hasAppKey();
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
        GoalNotify.showChannel(this);
    }

    void maybeStartPush() {
        if (!hasGoalNotifyPermission()) return;
        if (!PushBootstrap.hasAppKey()) return;
        PushBootstrap.start(this);
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
        if (!validMatchId(matchId)) {
            // JPush default tap extra (JSON string)
            String extra = intent.getStringExtra("cn.jpush.android.EXTRA_EXTRA");
            if (extra == null) extra = intent.getStringExtra("JMessageExtra");
            if (extra != null && extra.length() > 2) {
                try {
                    JSONObject o = new JSONObject(extra);
                    matchId = o.optString("matchId", "");
                } catch (Exception ignored) { }
            }
        }
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
        GoalNotify.showJson(this, json);
    }

    static void deliverPushRegId(final String regId) {
        final MainActivity a = alive;
        if (a == null || a.web == null || regId == null) return;
        a.runOnUiThread(new Runnable() {
            @Override public void run() {
                a.web.evaluateJavascript(
                    "(function(){try{if(window.__onJPushRegId)window.__onJPushRegId("
                        + jsonEscape(regId) + ");}catch(e){}})();",
                    null);
            }
        });
    }

    static void deliverPushGoal(final String matchId, final String scoreKey) {
        final MainActivity a = alive;
        if (a == null || a.web == null) return;
        a.runOnUiThread(new Runnable() {
            @Override public void run() {
                a.web.evaluateJavascript(
                    "(function(){try{if(window.__onJPushGoal)window.__onJPushGoal("
                        + jsonEscape(matchId) + "," + jsonEscape(scoreKey)
                        + ");}catch(e){}})();",
                    null);
            }
        });
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
        maybeStartPush();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_POST_NOTIF && hasGoalNotifyPermission()) {
            maybeStartPush();
        }
    }

    @Override
    protected void onDestroy() {
        bgHandler.removeCallbacks(bgFavGoalTick);
        if (alive == this) alive = null;
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // let the web app handle back (close dialog/sheet, sub page -> previous, tab -> 首页); exit when it returns 0
        web.evaluateJavascript("(function(){try{return window.__appBack?window.__appBack():0}catch(e){return 0}})()",
            v -> { if (!"1".equals(v)) finish(); });
    }
}
