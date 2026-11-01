# 1.9.269 — 启动图标改用锁定的 Design G 原图像素

## 改什么
- **1.9.268 的 SVG 重绘被弃用**：那一版是近似矢量，不是用户锁定的原图。
- 启动图标源改为用户附上的 **1024×1024 Design G 高清原图**（`tools/yunqiumi-icon-g-hires-master.jpg`），只做 Lanczos 缩小，不重画、不另造 SVG 标志。
- 覆盖 `android/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`（48 / 72 / 96 / 144 / 192）。铺满深海军方底（照片四角黑/白边填成海军，避免桌面露边），金色弧和云+球保持原图像素。圆角交给系统。
- Web/PWA `public/icons` 同样从这张 1024 原图缩小。
- 通知小图标 `ic_notify_goal`、`jpush_notification_icon` **未改**。
- `node tools/make-icons.js` 只缩放这张原图；旧的 `yunqiumi-icon.svg` / `build-yunqiumi-svg.js` / `render-yunqiumi-icon.js` 已删除。

## 版本
- **1.9.269** / VERSION_CODE **305**
- 不部署 Aliyun，不打 APK。换图标需重装/覆盖安装后才出现在桌面。

## 测试
- `test/ui-269-test.js`
