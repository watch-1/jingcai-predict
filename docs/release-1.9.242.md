# 1.9.242 — 事件 Tab 末球缺失 / 比分与 timeline 不一致

## 症状
完场比分（如 5:1）已显示，但事件时间线停在较早比分（如 82' 4-1），缺少最后一粒进球事件。

## 根因
1. **`liveEventsLikelyMissing` / `liveStatsNeedsEventsRetry` 只处理「事件列表为空」**，已有部分事件时不再重试。
2. **完场后事件缓存 TTL 为 10 分钟**：若在末球写入 API-Football 前已缓存 4 球版本，会与 fixture 终场比分长期不一致。
3. 头部比分来自 sporttery/schedule，事件来自 AF；末球延迟属上游时序问题，需持续 refetch 而非冻结缓存。

## 修复
- `eventsScoreBehindFixture`：fixture 进球总数 > 事件进球总数时视为 gap。
- 事件缓存 gap 时使用 **8s TTL**（`EVENTS_SCORE_GAP_MS`），stats 缓存继续用 `STATS_EVENTS_GAP_MS` 加速刷新。
- **`mergeEventLists`**：重拉时按 event id 合并，避免偶发短响应冲掉已有事件。
- 客户端 `liveStatsEventsBehindScore` + 完场仍 gap 时的说明文案；部分 timeline 时显示「进球事件同步中…」。

**1.9.242** / **VERSION_CODE=279**
