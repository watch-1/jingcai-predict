# 1.9.50 悬浮球本地 Three.js

## 原因
1.9.49 从 `cdn.jsdelivr.net` 加载 Three.js；国内 WebView 常失败，ES module 整页不挂载 → 无悬浮球。

## 改动
- Vendor Three r170 到 `public/vendor/three/`（含 GLTFLoader + BufferGeometryUtils）
- `index.html` importmap 改为本地路径
- 模块失败时 CSS 回退球；启动后再次 `syncRoute`
- 版本 **1.9.50** / versionCode **90**

## APK
http://120.77.152.74:8088/jingcai-predict-1.9.50.apk
