package com.tiicai.jingcai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;

/** Shared tray builder used by JS notifyGoal and (as fallback) JPush extras. */
final class GoalNotify {
    static final String CHANNEL = "goal_alerts";

    static void showChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL, "进球提醒", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("关注场次进球时提醒");
        ch.enableVibration(true);
        nm.createNotificationChannel(ch);
    }

    static void showJson(Context ctx, String json) {
        String title = "进球提醒";
        String body = "";
        String matchId = "";
        String scoreKey = "";
        try {
            JSONObject o = new JSONObject(json == null ? "{}" : json);
            if (o.has("title")) title = o.optString("title", title);
            if (o.has("body")) body = o.optString("body", "");
            if (o.has("matchId")) matchId = o.optString("matchId", "");
            if (o.has("scoreKey")) scoreKey = o.optString("scoreKey", "");
            if (scoreKey.length() == 0 && o.has("homeScore") && o.has("awayScore")) {
                scoreKey = o.optString("homeScore", "") + "-" + o.optString("awayScore", "");
            }
        } catch (Exception e) {
            return;
        }
        show(ctx, title, body, matchId, scoreKey);
    }

    static void show(Context ctx, String title, String body, String matchId, String scoreKey) {
        if (title == null || title.length() == 0) title = "进球提醒";
        if (body == null) body = "";
        if (title.length() > 40) title = title.substring(0, 40);
        if (body.length() > 120) body = body.substring(0, 120);
        if (!validMatchId(matchId)) matchId = "";
        if (matchId.length() > 0 && scoreKey != null && scoreKey.length() > 0) {
            if (!PushState.markSeen(ctx, matchId, scoreKey)) return;
        }
        showChannel(ctx);
        Intent tap = new Intent(ctx, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (matchId.length() > 0) tap.putExtra("match_id", matchId);
        int nid = matchId.length() > 0 ? matchId.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, nid, tap, flags);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(ctx, CHANNEL);
        } else {
            b = new Notification.Builder(ctx);
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        b.setSmallIcon(R.drawable.ic_notify_goal)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setDefaults(Notification.DEFAULT_ALL);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(nid, b.build());
    }

    static boolean validMatchId(String id) {
        return id != null && id.matches("[A-Za-z0-9:._-]{1,80}");
    }

    private GoalNotify() {}
}
