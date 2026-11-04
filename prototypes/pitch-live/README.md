# 云球迷 · 球场传球动画（离线 HTML 原型 v10）

本目录为 **离线单页 HTML 原型**（`yunqiumi-pitch-pass-v10.html`），用于小屏落点对齐、持球跑动（带球）等交互验证。

- **版本**：pitch-pass **v10**（2026-11-04）
- **形态**：浏览器打开 HTML + 本地 PNG 资源；**尚未**接入 Capacitor / 正式 App WebView 构建链
- **说明**：`V10-REPORT.txt`；Blender / Playwright 辅助文件在 `pitch-blender/`

## 本地预览

```bash
cd prototypes/pitch-live
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/yunqiumi-pitch-pass-v10.html
```

或直接双击 `yunqiumi-pitch-pass-v10.html`（需同目录下的 `pitch45_v9d*.png` 等资源）。
