# 1.9.245（VERSION_CODE 282）

## Bug：赛程「比分」列表下拉刷新仍显示旧比分/分钟，必须点进场次详情才会更新

用户截图：英联赛杯 埃弗顿 vs 纽卡斯尔。
1. 赛程比分列表显示 **0:0 / 上半场 29'**（实际已 1:0 / 39'），下拉刷新无效。
2. 点进详情「事件」页，比分/时间正确（1:0 / 39'，加内尔 34' 进球）。
3. 退回列表后该行才「追上时间」。

**根因（两层）**
- 下拉刷新手势只调用 `reloadData(true)`（matches/schedule/results 三个赛程源），完全没有触碰 `/api/live-scores`：客户端 `loadLiveScores` 有 35s TTL，服务端 `getLiveScores` 还有 45s 载荷缓存且**没有任何 bypass 参数**。所以手势刷新后列表拿到的仍是旧的实时比分覆盖层。
- 更深一层（解释 10 分钟级滞后）：体彩官方 `getMatchLiveV1` 的比分/分钟经常滞后，服务端本有 API-Football 实时 overlay 可以纠正，但该 overlay 只对 `fixture-map.json` 中**已映射**的场次生效——而映射此前只在用户打开场次详情（`live-stats.resolveFixture`）时才建立。于是「必须点进场次里才能刷新出实时的信息」；退出后列表靠 `syncLiveScoreFromStats`（1.9.101）回写才一致。

**修复**
- 服务端 `lib/live-scores.js`：
  - `getLiveScores` 新增 `force`：跳过 45s 载荷缓存强制重抓体彩实时源；AF 侧的 `AF_LIVE_TTL`（60s）等配额保护缓存不受影响。
  - 新增 `resolveUnmappedLiveFixtures` / `pickUnmappedLiveIds`：列表轮询路径上，对「进行中/有比分但未完场、且未映射」的场次惰性调用 `live-stats.resolveFixture` 建立 AF fixture 映射（复用按日缓存的 fixtures 列表），每次请求最多 3 场、失败 10 分钟冷却，保护免费 AF 配额。映射建立后同一次请求内 AF overlay 即生效，无需进详情。
- 服务端 `server.js` `/api/live-scores`：
  - 解析 `refresh=1` / `force=1` → `force`；
  - 从 schedule/matches 缓存为请求的 ids 组装 `resolveMeta`（主客队名/ID、日期时间），传给上面的惰性映射。
- 客户端 `public/app.js`：
  - `loadLiveScores` 新增 `bust` 选项：请求追加 `&refresh=1`，同时跳过服务端缓存；
  - 新增 `pullRefreshScheduleLiveScores()`：赛程页下拉刷新时将当日全部场次 ids 以 `{ force: true, bust: true }` 强刷，加入手势刷新的 `Promise.all`（与 `reloadData`、`refreshAccount` 并行），刷新完成后的 `render({ force: true })` 用新 overlay 重绘列表行；
  - 「schRefresh」按钮同样加 `bust: true`。
  - 列表可见时的 50s 实时轮询、计算器模式、联赛筛选、日期条、完场排序逻辑均不改动。

**测试**
- 新增 `test/ui-245-test.js`：
  - 功能性：`getLiveScores` 同 TTL 内不带 `force` 返回缓存旧比分（0:0/29'），带 `force` 重抓上游并返回 1:0/39'；`pickUnmappedLiveIds` 只挑「进行中+未映射+不在冷却期」的场次，冷却过期可重试；无 `API_FOOTBALL_KEY` 时 resolve 为 no-op（配额保护）。
  - 静态断言：手势刷新 `Promise.all` 含 `pullRefreshScheduleLiveScores()`；`bust` 追加 `refresh=1`；endpoint 解析 `refresh/force` 并传 `resolveMeta`；列表行构建（`classifyScoreRow`）优先使用 live overlay。
  - 版本号 1.9.245 / VERSION_CODE 282 在 VERSION.txt、package.json、config.js、sw.js、build-apk.sh 同步。

**既有失败（与本次无关，main 基线同样失败）**
- `market-value-match-test`（缺外部 `data/market-value/index.json.gz` 数据包）、`ui-166`/`ui-193`/`ui-199`（陈旧断言，main 上同样失败）；`column/tribe/user-follow/api` 等需本地起服务的测试在服务运行时全部通过。
