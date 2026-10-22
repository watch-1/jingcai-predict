# 1.9.92 — 视觉缝合修复 + 事件图标区分 + 合作测试版远程开关

## 产品 A：视觉
1. **足球背景缝**：赛事详情紫底快捷区去掉第二枚球纹（只保留顶部 hero 球纹）；赛程页顶栏去掉线稿球，只保留悬浮 3D 球，避免两套球不对齐。
2. **队标去白底**：`.badge.crest` 透明底 + drop-shadow，图标直接落在深色/浅色背景上（仍 `object-fit: contain`）。
3. **进球/点球/乌龙**：绿底球、橙底球+P、灰底球+OG，时间轴与图例一致。

## 产品 B：合作测试 APK
- 通道 `channel=partner-test`，请求头 `X-App-Channel` + `X-Partner-Key`
- Admin「功能开关」→ **合作测试版**（`partner_test`）：关闭即全员「测试已结束」
- 正式包不受影响；合作包启动/每分钟校验 `/api/client-gate`
- 水印「合作测试版 · buildId」；WebView 已禁 file/content access；API Base 构建期锁定

## 安全说明（诚实边界）
已做：通道密钥、远程停服、固定 API、水印、WebView 限制、不打包密钥到公开源（仅进 partner APK config）。
**不能**声称：防专业逆向/二次打包/抓包重放；无真正 DRM。

## APK
- 正式：`jingcai-predict-1.9.92.apk` versionCode **129**
- 合作：`jingcai-predict-1.9.92-partner.apk` versionName **1.9.92-test** versionCode **129**
