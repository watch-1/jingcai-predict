# 1.9.54 比分列表「中场」卡死

## 现象
赛程/比分列表在下半场仍显示「中场」（刷新无效）；详情页绿茵屏正确显示「下半场 83'」。

## 根因
`lib/live-scores.js` `fromSporttery` 把 sporttery `matchPhaseTc === '2'` 当成中场。
实际上 ph=2 的 `matchPhaseTcName` 常为「季后赛」（赛季阶段），不是时钟阶段；
真中场是 ph=10「中场休息」。比分/分钟已更新到下半场时 phase 仍钉在 HT。
API-Football 叠加层在 sporttery 已有 minute 时也不覆盖 phase，细节页 `/api/live-stats` 直接用 AF 故正确。

## 修复
1. 时钟阶段优先看 phaseName / 分钟 / 全场 vs 半场；不再把 ph=1/2 单独映射为上半/中场。
2. AF 叠加：sporttery 卡在 HT 而 AF 为 1H/2H 时采用 AF 时钟。
3. 列表 `scoreMinuteLab` 与详情对齐为「下半场 88'」，并防御残留「中场」。

版本 **1.9.54** / vc **94**。
