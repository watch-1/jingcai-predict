# 1.9.101 列表比分与详情 VAR 取消进球一致

## 根因
- 赛程/首页卡片走 `/api/live-scores`：sporttery 比分优先，AF 仅补时钟。
- 详情英雄分+事件走 `/api/live-stats`（AF fixture goals + events）。
- 越位/VAR 取消后 AF 已改回 0:0，sporttery 仍短暂停留 1:0 → 列表 1:0、详情 0:0。

## 修复
1. `mergeAfOverlay`：进行中且 AF 有比分时以 AF 为准（完场仍用 sporttery 官方赛果）。
2. `scoreFromEvents` / `applyEventScore`：事件进球数少于 fixture 时按事件纠正（取消进球）。
3. 纠正后 `invalidateLiveScoresCache`；客户端 `syncLiveScoreFromStats` 把详情比分写回列表缓存。
