# 1.9.34 赛事详情 Theme B 可读性修复

## 问题（1.9.33 绿茵主题）
赛事详情「赔率 / 情报 / 赛后复盘」在 Theme B 下：
1. 内容卡仍是白底，正文/赔率格却用浅色字 → 近乎不可读
2. 详情 Tab 中文被 height+overflow 压扁/裁切
3. 暗色 chrome + 白大块 + 翠绿高亮，色调割裂

根因：`data-theme=pitch` 把 `--t1/--t2` 切成浅色，但 `.ana-card` / `.os-sec` / `.os-cell` / `.pmr-*` 等仍硬编码白底或浅灰底，且未列入 1.9.33 抬升面板覆盖。

## 改动
1. **Theme B**：赛事详情抬升面板统一 `#1A2336`；赔率格 `.os-cell` 深色 inset + 浅色可读字；情报/复盘正文高对比；比分表/复盘列表/聊球同步暗色。
2. **Theme A**：仍用 `var(--card)` 白卡 + 深色字，不变浅色体验。
3. **审计**：卡片/正文改用 `var(--card)` / `var(--t1)`；pitch 专用覆盖补齐忽略 `[data-theme]` 的白底类。
4. **Tab**：`.dtabs` 允许横滑、`min-height:44px`、`line-height:1.45`、去掉会裁切中文的 overflow/固定 height。

## APK
`dist/jingcai-predict-1.9.34.apk`（versionCode **74**）→ http://120.77.152.74:8088/jingcai-predict-1.9.34.apk
