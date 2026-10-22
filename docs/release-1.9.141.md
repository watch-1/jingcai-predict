# 1.9.141 热修：APK 静态资源 + 知识库入口

## 问题（1.9.140）
GitHub `public/` 缺少仍在线上保留的静态文件，导致 **APK 内 WebView**：
- 首页轮播 `banners/slide-*.jpg` 裂图（`app.js` 的 `BN_HOT` / `BN_NEWS` / `BN_CONTRA`）
- 悬浮足球 `demos/assets/soccer_ball.glb` 加载失败 → 灰色大球占位

## 修复
- 恢复并提交：`slide-hot-match.jpg`、`slide-news.jpg`、`slide-contra.jpg`、`hero-*.jpg`、`demos/assets/soccer_ball.glb` 及 `soccer_tex/`（未提交 `.blend` 源文件）
- `android/build-apk.sh` 打包后校验上述 jpg + glb 必须存在
- `float-ball.js`：GLB 失败或超时 → 隐藏 Three 层并启用 `float-ball-fallback.js`；加载中不再显示灰色占位球
- 知识库入口：**我的** → **我的知识库** 保留；**预测** 双入口页与首页「比赛态度」旁增加 **我的知识库** → `#/kb`

## 版本
- Web / `config.js` / `sw.js`：**1.9.141**（`jc-v1.9.141`）
- Android 默认：`VERSION_NAME=1.9.141`、`VERSION_CODE=178`

## 验证
1. 本地 `public/banners/slide-hot-match.jpg` 与 `public/demos/assets/soccer_ball.glb` 存在且非空
2. 执行 `android/build-apk.sh` 不因缺资源退出
3. APK 或 `file://` 打开首页：轮播有图、悬浮足球为纹理球或 CSS 小球（非灰球）
4. **预测** Tab 门页与 **我的** 均可进入 **我的知识库**
