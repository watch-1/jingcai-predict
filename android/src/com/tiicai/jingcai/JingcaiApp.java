package com.tiicai.jingcai;

import android.app.Application;
import android.content.Context;

/** 进程入口。通知权限和 AppKey 都有了才初始化极光。杀进程送达靠极光通道，不另开前台服务。 */
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
