# 1.9.32 首页双主题：轻奢数据感 / 绿茵沉浸感

## 需求
用户确认 mockup 后两边各改一版：
- **A 轻奢数据感**：浅色、统一线框图标、light-3D 数据主视觉、焦点对阵卡
- **B 绿茵沉浸感**：暗夜球场、软质足球主视觉、磨砂深色磁贴

## 改动
1. `public/app.js`：首页 Hero 改为 CSS/SVG 轮播（不再依赖扁平 clipart JPG）；A 焦点双卡 + 统一线图标；B 磨砂四宫格 + 单条焦点对阵；本机持久化 `jc_home_theme`。
2. `public/style.css`：两套主题样式；`data-theme=pitch` 时全局暗色 chrome。
3. `public/index.html`：首屏前注入主题，避免闪白。
4. 「我的 → 设置」外观/主题双选；首页主题条可一键切换。

## 切换方式
- **我的 → 设置 → 外观/主题** 点选「轻奢数据感」或「绿茵沉浸感」
- 或首页主题条（「轻奢数据感 / 绿茵沉浸感」）点击切换
- 选择写入本机 localStorage，下次打开仍生效

## APK
`dist/jingcai-predict-1.9.32.apk`（versionCode **72**）→ http://120.77.152.74:8088/jingcai-predict-1.9.32.apk
