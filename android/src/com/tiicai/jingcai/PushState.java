package com.tiicai.jingcai;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import org.json.JSONObject;

/** Device id / JPush regId / last-notified score keys. No JPush imports. */
final class PushState {
    static final String PREFS = "jc_push";
    static final String KEY_DEVICE = "device_id";
    static final String KEY_SECRET = "device_secret";
    static final String KEY_REG = "reg_id";
    static final String KEY_SEEN = "goal_seen";

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String ensureDeviceId(Context c) {
        SharedPreferences sp = p(c);
        String id = sp.getString(KEY_DEVICE, "");
        if (id != null && id.length() >= 16) return id;
        id = ("jc" + UUID.randomUUID().toString().replace("-", "")).substring(0, 24);
        sp.edit().putString(KEY_DEVICE, id).apply();
        return id;
    }

    static void storeSecret(Context c, String secret) {
        if (secret == null || secret.length() < 8) return;
        p(c).edit().putString(KEY_SECRET, secret).apply();
    }

    static String deviceSecret(Context c) {
        return p(c).getString(KEY_SECRET, "");
    }

    static void storeRegId(Context c, String regId) {
        if (regId == null) return;
        p(c).edit().putString(KEY_REG, regId).apply();
    }

    static String regId(Context c) {
        return p(c).getString(KEY_REG, "");
    }

    static boolean markSeen(Context c, String matchId, String scoreKey) {
        if (matchId == null || matchId.length() == 0 || scoreKey == null || scoreKey.length() == 0) {
            return false;
        }
        SharedPreferences sp = p(c);
        JSONObject o;
        try { o = new JSONObject(sp.getString(KEY_SEEN, "{}")); }
        catch (Exception e) { o = new JSONObject(); }
        String prev = o.optString(matchId, "");
        if (scoreKey.equals(prev)) return false;
        try { o.put(matchId, scoreKey); } catch (Exception ignored) {}
        if (o.length() > 80) {
            // drop oldest-ish: JSONObject has no order; cap by rewriting last 80 is not
            // worth it — keys stay small.
        }
        sp.edit().putString(KEY_SEEN, o.toString()).apply();
        return true;
    }

    static boolean alreadySeen(Context c, String matchId, String scoreKey) {
        if (matchId == null || scoreKey == null) return false;
        try {
            JSONObject o = new JSONObject(p(c).getString(KEY_SEEN, "{}"));
            return scoreKey.equals(o.optString(matchId, ""));
        } catch (Exception e) {
            return false;
        }
    }

    private PushState() {}
}
