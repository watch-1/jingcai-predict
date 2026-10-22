# 1.9.69 — 自有检验卡片可读性

## 用户反馈修复（预测页「自有检验」）
1. **去掉角标文案**：移除「本程序硬仗记忆 · 非千篇一律 API」
2. **对阵清晰**：标题改为「球队 · 对阵 对手」
3. **中文队名**：卡片与摘要只用中文（`teamZh` / crests / 小表兜底）；不再出现 Real Betis / FC Porto 等
4. **去掉 SI**：用「对手偏强 / 中等 / 偏弱」替代 `(SI 1.22)`
5. **白话摘要**：保留硬仗能否产机会、过程回落、水分、能否采信近况场均等含义，去掉英文+SI+标签复读
6. **按赛程远近排序**：相对**当前查看场次日期**近→远（不再按水分档乱序）
7. **标签分色**：
   - `ht-low` 硬仗仍能产机会 → 青绿
   - `ht-mid` 水分中等 / 过程回落 → 琥珀
   - `ht-high` 水分大 → 红
   - `ht-na` 非硬仗样本 → 灰蓝

## 实现要点
- `lib/team-evidence.js`：`toTeamZh` / `buildPlainSummaryZh` / `formatEpisodeForUi` / `sortEpisodesByRecencyToMatch`；渲染时重写旧库存文案（无需批量 DeepSeek）
- `public/style.css`：`.pmr-tag.ht-*`（含 pitch 主题）
- `lib/league-tables.js`：补马里迪莫等常见硬仗样本队名
- 无新增投注/出票功能；无大规模 DeepSeek 重生成

## Deploy
- `/opt/jingcai` **1.9.69**，systemd active
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.69.apk`（versionCode **107**）
