# 1.9.271 — 赛程卡片开球时间对齐 + 列表进度滞后

## 改什么
- **收藏星不再挤开开球时间**：`match-meta` 右侧固定预留星标列，关注/未关注场次的开球时间同一水平位置右对齐。队名外对齐、完整队名、进行中蓝比分、已结束隔断保持不变。
- **列表比分/分钟滞后（已确认的客户端/服务端缺口）**：
  - 赛程 `render`/搜索/切联赛不再重置 30s 心跳（原先每次 DOM patch 都把 interval 归零，交互越勤越不刷新）。
  - 客户端 `loadLiveScores` 的 35s 全局 TTL 不再挡住「当日 ids 尚未入缓存」的请求（切日期会漏拉）。
  - 切日期、从其它 Tab/TAB_KEEP 回到赛程、前台/pageshow 立刻强刷当日 live-scores。
  - 场次 ns↔ft 时不再只改中列：回退整表，让「已结束」隔断跟上。
  - sporttery 仍标未开赛/漏场但已过开球时，列表路径也会打 AF `live=all`（有 resolveMeta）。
  - 「我的关注」进入时补一次 live-scores，避免只看收藏页时卡片冻住。

## 版本
- **1.9.271** / VERSION_CODE **307**
- 包名仍为 `com.tiicai.jingcai`，显示名「云球迷」。JPush 未改。
- 不部署、不打 APK、不合并。

## 测试
- `test/ui-271-test.js`
- `test/live-scores-sync-271-test.js`
- 既有 `test/ui-247-test.js` / `test/ui-258-test.js` / `test/live-scores-sync-258-test.js`
