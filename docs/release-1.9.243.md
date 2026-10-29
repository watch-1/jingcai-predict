# 1.9.243（VERSION_CODE 280）

## Bug：直播 0-0 事件页永远停在「事件加载中…」

用户截图：埃弗顿 vs 纽卡斯尔，上半场 11'，比分 0:0，事件 Tab 一直显示 spinner「事件加载中…」。

**根因**
- `public/app.js` `liveStatsNeedsEventsRetry` 中有一条 `live.live && elapsed >= 5` 的兜底分支：只要比赛进行中且已过 5 分钟，即使 `/api/live-stats` 成功返回且 events 为空、比分 0-0、无 `eventsError`/`eventsScoreGap`，也会被判定为「事件缺口」，空态永远走 spinner 分支，不会切到「暂无事件记录…」。
- 0-0 且尚未产生牌/换人时，空 events 是合法终态，不应视作缺口。

**修复**
- 删除 `liveStatsNeedsEventsRetry` 中的 `live.live && elapsed >= 5` 分支。成功返回且无缺口（比分 0-0 或 events 已追平比分）时返回 `false`，事件 Tab 空态显示「暂无事件记录（未开赛、无数据源或尚未产生进球/牌/换人）。」
- 保留真实等待场景：`eventsError`、服务端 `eventsScoreGap`、events 落后于比分（1.9.242 Frosinone–Lecce 类缺口）仍返回 `true`，继续显示 spinner /「进球事件同步中…」并退避重拉。
- 首次加载（`live` 尚未返回）仍短暂显示「加载比赛事件…」spinner；直播中的后台轮询（`ensureLivePoll`，`live.live` 即轮询）不受影响，页面静默自动刷新，不再假装「加载中」。
- 不伪造事件。

**测试**
- 新增 `test/ui-243-test.js`：
  - `liveStatsNeedsEventsRetry` 对「live、elapsed≥5、events 空、0-0、ok、无 error/gap」返回 `false`（含下半场 67' 场景）；
  - 比分有进球但 events 空/落后、`eventsError`、`eventsScoreGap` 时仍返回 `true`；
  - `eventsTabHtml` 空态分支：spinner 仅在 eventsGap 下出现，否则为「暂无事件记录…」文案。
