# 1.9.267 — 关注场次进球：杀进程也弹系统通知

## 问题
1.9.264/266 只有 WebView 活着时的本地 `NotificationManager`（JS 每 30s 拉 `/live-scores`）。用户划掉 App 后进程没了，关注场次进球不会出系统窗。国内 ROM 上纯 FCM 也经常不可用。

## 做法
- **极光 JPush**（国内聚合，REST 下发 + Android SDK）。不假装 Foreground Service / AlarmManager 能扛杀进程。
- 设备登记 `POST /api/push/register` + 关注同步 `PUT /api/push/favs`（游客/登录都行；登录会绑 `user_id`）。
- 服务端 worker 侦测比分上升，按 `registration_id` 推 `goal_alerts` 频道通知。
- 本地 poll 保留：无极光凭证时仍可用；有极光时前台走本地、后台/被杀走推送（`display_foreground=0` + `goalAlertSeen` / SharedPreferences 去重）。
- 范围：仅 **关注场次**，不做关注球队。

## 运营必做
见 **`docs/jpush-setup.md`**：极光控制台建应用（包名 `com.tiicai.jingcai`），`.env` 设 `JPUSH_APPKEY` / `JPUSH_MASTER_SECRET`，打 APK 时带 `JPUSH_APPKEY`。不要把密钥提交进 git。

## 版本
- **1.9.267** / VERSION_CODE **303**
- Web：部署 Node + 静态即可（worker 在 `server.js`）。
- 关 App 弹窗：**必须重打 APK**（且构建时写入 AppKey）。
- 本 PR 不合并、不部署、不产 APK。

## 测试
- `test/ui-267-test.js`
- `test/push-goals-test.js`
