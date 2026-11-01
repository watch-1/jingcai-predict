package com.tiicai.jingcai;

import android.content.Context;
import android.text.TextUtils;
import java.lang.reflect.Method;

/**
 * Reflection wrapper so the main sources compile without JPush on the
 * javac classpath (src-jpush + AARs are optional at APK build time).
 */
final class PushBootstrap {
    private static volatile boolean started;

    static boolean hasAppKey() {
        try {
            String k = BuildConfigVersion.JPUSH_APPKEY;
            return k != null && k.length() > 8 && !"YOUR_JPUSH_APPKEY".equals(k);
        } catch (Throwable t) {
            return false;
        }
    }

    static boolean sdkPresent() {
        try {
            Class.forName("cn.jpush.android.api.JPushInterface");
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static void denyUntilConsent(Context ctx) {
        if (!sdkPresent()) return;
        try {
            Class<?> auth = Class.forName("cn.jiguang.api.utils.JCollectionAuth");
            Method m = auth.getMethod("setAuth", Context.class, boolean.class);
            m.invoke(null, ctx.getApplicationContext(), Boolean.FALSE);
        } catch (Throwable ignored) { }
    }

    static synchronized boolean start(Context ctx) {
        if (started) return true;
        if (!hasAppKey() || !sdkPresent()) return false;
        Context app = ctx.getApplicationContext();
        try {
            Class<?> auth = Class.forName("cn.jiguang.api.utils.JCollectionAuth");
            auth.getMethod("setAuth", Context.class, boolean.class)
                .invoke(null, app, Boolean.TRUE);
        } catch (Throwable ignored) { }
        try {
            Class<?> jp = Class.forName("cn.jpush.android.api.JPushInterface");
            try {
                jp.getMethod("setDebugMode", boolean.class).invoke(null, Boolean.FALSE);
            } catch (Throwable ignored) { }
            jp.getMethod("init", Context.class).invoke(null, app);
            started = true;
            trySetAlias(app, PushState.ensureDeviceId(app));
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    static String registrationId(Context ctx) {
        String cached = PushState.regId(ctx);
        if (cached != null && cached.length() > 0) return cached;
        if (!sdkPresent()) return "";
        try {
            Class<?> jp = Class.forName("cn.jpush.android.api.JPushInterface");
            Object v = jp.getMethod("getRegistrationID", Context.class)
                .invoke(null, ctx.getApplicationContext());
            String s = v == null ? "" : String.valueOf(v);
            if (s.length() > 0) PushState.storeRegId(ctx, s);
            return s;
        } catch (Throwable t) {
            return cached == null ? "" : cached;
        }
    }

    static void trySetAlias(Context ctx, String deviceId) {
        if (!sdkPresent() || TextUtils.isEmpty(deviceId)) return;
        try {
            Class<?> jp = Class.forName("cn.jpush.android.api.JPushInterface");
            jp.getMethod("setAlias", Context.class, int.class, String.class)
                .invoke(null, ctx.getApplicationContext(), Integer.valueOf(1001), deviceId);
        } catch (Throwable ignored) { }
    }

    static boolean isStarted() { return started; }

    private PushBootstrap() {}
}
