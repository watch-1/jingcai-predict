# 1.9.268 — Android 启动图标换成「云球迷」Design G

## 改什么
- 用锁定的 **云球迷 G 稿**（圆形徽章：白云裹足球 + 金色弧，深海军底）替换 Android 桌面启动图标。
- 覆盖 `android/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`（48 / 72 / 96 / 144 / 192，铺满圆角方图，无黑边/letterbox）。
- 通知小图标 `ic_notify_goal`、`jpush_notification_icon` **未改**（仍是白圈矢量，不是启动图）。
- 应用显示名仍为「竞彩预测」；本 PR 只换图标。
- Web/PWA `public/icons` 同步为同一套稿，避免桌面图标与浏览器图标两套。

## 版本
- **1.9.268** / VERSION_CODE **304**
- 不部署 Aliyun，不打 APK。换图标需重装/覆盖安装后才出现在桌面。

## 测试
- `test/ui-268-test.js`
