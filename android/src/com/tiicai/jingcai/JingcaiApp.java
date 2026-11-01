package com.tiicai.jingcai;

import android.app.Application;
import android.content.Context;

/**
 * Process entry. JPush is started only after notification permission
 * (and a non-empty AppKey). OEM kill-App delivery needs the JPush SDK
 * process / vendor channel — not a Foreground Service.
 */
public class JingcaiApp extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        PushBootstrap.denyUntilConsent(this);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        GoalNotify.showChannel(this);
    }
}
