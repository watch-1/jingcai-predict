# 1.9.33 UI 抛光：双主题色板 + 高清 Hero

## 问题（1.9.32）
用户反馈比 mockup 差：颜色杂乱、Hero 粗糙。
- 状态栏亮蓝 vs 深色 chrome；暗底白卡刺眼；联赛彩虹标签；暗底白赔率格对比差；数据中心白 pill；射手名浅灰不可读。
- Hero 用 CSS/SVG clay 球/柱，廉价感。

## 改动
1. **Hero 资源**：`public/banners/hero-data-luxury.jpg`、`hero-pitch-night.jpg` 替换 CSS/SVG 主视觉（左侧留白放文案）。
2. **Theme A 轻奢数据感**：bg `#F5F7FB`、navy chrome `#1B2A4A`、唯一强调色 `#2F6FED`；白卡软阴影。
3. **Theme B 绿茵沉浸感**：表面 `#0B1220` / `#121A2B`，抬升面板 `#1A2336`（禁止纯白大块）；唯一强调色 **emerald `#2BB673`**（底栏/chips）；赔率格深色 inset；联赛标签 `tag-muted` 单色；射手名等对比加强。
4. **全局**：`data-theme=pitch` 覆盖首页/赛程/预测/数据/我的；`theme-color` 与 chrome 对齐（A `#1B2A4A` / B `#0B1220`）；双主题切换保留。

## APK
`dist/jingcai-predict-1.9.33.apk`（versionCode **73**）→ http://120.77.152.74:8088/jingcai-predict-1.9.33.apk
