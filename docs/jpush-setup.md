# 极光 JPush 开通（关注场次进球，关 App 也弹系统窗）

1.9.267 用**极光推送**做国内 Android 杀进程通知。Google FCM / 仅靠 Foreground Service 在华为/小米/OPPO/vivo 上不够。

**不要把真实 AppKey / Master Secret 写进 git。** 只用环境变量。

## 控制台步骤（运营必须做一次）

1. 打开 [https://www.jiguang.cn/](https://www.jiguang.cn/) 注册/登录极光账号（有免费档）。
2. 控制台 → **创建应用**：
   - 应用名称：例如 `竞彩预测`
   - Android 包名（必须一致）：**`com.tiicai.jingcai`**
3. 进入应用 → **应用设置** → 抄下：
   - **AppKey** → 打 APK 用（`JPUSH_APPKEY`）
   - **Master Secret** → 只放服务器 `.env`（`JPUSH_MASTER_SECRET`）
4. （强烈建议，国内 ROM 杀进程才稳）同一应用里开通**厂商通道**，把各厂商的 AppID/AppKey/AppSecret 填进极光：
   - 华为 Push Kit / 荣耀
   - 小米开放平台推送
   - OPPO 推送
   - vivo 推送
   - 本仓库 MVP **只打了极光通道 AAR**。厂商通道 SDK 体积大、要各厂商开发者账号，后续 PR 再加。未接通厂商时，部分狠杀后台的机型仍可能丢推送；用户可在系统设置里把「竞彩预测」设为允许自启动 / 关联启动。

## 服务器 `/opt/jingcai/.env`

```
JPUSH_APPKEY=从极光控制台复制
JPUSH_MASTER_SECRET=从极光控制台复制
# 可选
# JPUSH_API=https://api.jpush.cn/v3/push
# JPUSH_CHANNEL=developer-default
# PUSH_GOALS_INTERVAL_MS=30000
# PUSH_DRY_RUN=1          # 只打日志不真正推
# PUSH_GOALS_WORKER=0     # 单测关闭后台轮询
```

改完后 `systemctl restart jingcai`。**不要**把 `.env` 同步进 git。

未配置这两项时：服务端仍会记录设备和关注场次、侦测进球，但 **不会调用极光**（进球事件会留下待重试，配上密钥后下一轮再推）；App 活着时仍走 1.9.264 的本地 `NotificationManager`（含切到后台但进程还在的情况）。

## 打 APK

```bash
JPUSH_APPKEY=从极光控制台复制 \
API_BASE=http://120.77.152.74:8088 \
./android/build-apk.sh
```

`build-apk.sh` 会从 Maven Central 拉 `jpush-6.3.0.aar` + `jcore-5.6.0.aar`（可预先放到 `android/libs/`）。`SKIP_JPUSH=1` 可打不含极光的包（关 App 无系统窗）。

## 客户端行为

- 用户授予 `POST_NOTIFICATIONS` 后才 `JPushInterface.init`。
- JS 把 `deviceId` + `regId` 登记到 `POST /api/push/register`，关注列表 `PUT /api/push/favs`。
- 服务端每 ~30s 对已登记关注场次拉 `/live-scores`，比分上升则对 `registration_id` 推通知（channel `goal_alerts`）。
- **去重**：极光 `display_foreground=0`（前台不弹极光窗）；前台仍用本地 notify；后台/被杀只靠极光。客户端仅在 **服务端已配极光密钥**（`pushEnabled`）且 native 已有 Registration ID 时，才在 `document.hidden` 下跳过本地窗——避免 `.env` 未配时后台进程也哑火。同一 `matchId+scoreKey` 服务端成功送达后只发一次；JPush 失败或尚未配密钥时下一轮会重试。进程内 SharedPreferences / JS `goalAlertSeen` 再挡一层。

## 手动验收

1. 用带 `JPUSH_APPKEY` 的 APK 安装，允许通知，关注一场进行中或即将开球的比赛。
2. 「我的 → 关于」应出现设备号；有网后应出现 Registration ID。
3. 服务器 `journalctl -u jingcai` 出现 `[push-goals] worker`；设备行写入 SQLite `push_devices` / `push_device_favs`。
4. **划掉 App**，等关注场次进球（或用极光控制台向该 Registration ID 发一条测试通知，extras：`{"matchId":"...","scoreKey":"1-0","kind":"fav_goal"}`）。
5. 系统托盘应弹出「进球提醒」；点开回到该场。
6. App 在前台时进球：只应看到 **一条** 通知（本地），不应极光+本地各一条。
