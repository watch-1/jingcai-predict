package com.tiicai.jingcai;

import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;
import cn.jpush.android.api.NotificationMessage;
import cn.jpush.android.service.JPushMessageReceiver;
import org.json.JSONObject;

/**
 * JPush 5.4+ event receiver. When the process is dead the OS/JPush tray is
 * shown from the notification payload. When the process is alive we mark the
 * score key so the JS 30s poll does not double-fire.
 */
public class GoalPushReceiver extends JPushMessageReceiver {
    @Override
    public void onRegister(Context context, String regId) {
        if (regId == null || regId.length() == 0) return;
        PushState.storeRegId(context, regId);
        PushBootstrap.trySetAlias(context, PushState.ensureDeviceId(context));
        MainActivity.deliverPushRegId(regId);
    }

    @Override
    public boolean isNeedShowNotification(Context context, NotificationMessage message, String s) {
        JSONObject extra = extrasOf(message);
        String matchId = extra.optString("matchId", "");
        String scoreKey = extra.optString("scoreKey", "");
        if (GoalNotify.validMatchId(matchId) && scoreKey.length() > 0
            && PushState.alreadySeen(context, matchId, scoreKey)) {
            return false;
        }
        return super.isNeedShowNotification(context, message, s);
    }

    @Override
    public void onNotifyMessageArrived(Context context, NotificationMessage message) {
        if (message == null) return;
        JSONObject extra = extrasOf(message);
        String matchId = extra.optString("matchId", "");
        String scoreKey = extra.optString("scoreKey", "");
        if (GoalNotify.validMatchId(matchId) && scoreKey.length() > 0) {
            if (PushState.alreadySeen(context, matchId, scoreKey)) {
                try {
                    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(message.notificationId);
                } catch (Throwable ignored) { }
            } else {
                PushState.markSeen(context, matchId, scoreKey);
            }
            MainActivity.deliverPushGoal(matchId, scoreKey);
        }
    }

    @Override
    public void onNotifyMessageOpened(Context context, NotificationMessage message) {
        JSONObject extra = extrasOf(message);
        String matchId = extra.optString("matchId", "");
        Intent i = new Intent(context, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (GoalNotify.validMatchId(matchId)) i.putExtra("match_id", matchId);
        context.startActivity(i);
    }

    static JSONObject extrasOf(NotificationMessage message) {
        String raw = "";
        try {
            if (message.notificationExtras != null) raw = message.notificationExtras;
        } catch (Throwable ignored) { }
        try { return new JSONObject(raw == null || raw.length() == 0 ? "{}" : raw); }
        catch (Exception e) { return new JSONObject(); }
    }
}
