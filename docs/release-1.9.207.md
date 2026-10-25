# 1.9.207 — 事件 Tab 空态恢复 + 球星榜 boot 首屏

## Bug A：详情「事件」有比分但时间轴空白

**根因**
- `/api/live-stats` 在 25s 内会整包复用缓存；若某次上游 `fixtures/events` 失败或返回空数组，客户端仍 `ok: true` 且带比分，20s 内 `loadLiveStats` 也不会强刷。
- 客户端把「空 events + 有进球比分」当成终态，展示「暂无事件记录」，轮询也未覆盖该状态。

**修复**
- **服务端** `lib/live-stats.js`：识别「有比分/进行中但 events 为空」；缩短 events 空缓存 TTL；stats 缓存在该状态下约 5s 后重拉 events。
- **客户端** `liveStatsNeedsEventsRetry` + `scheduleLiveStatsRecover`（退避重试）；进入事件 Tab 强制 `loadLiveStats({ force: true })`；空态显示「事件加载中…」；`ensureLivePoll` 在 events gap 时继续轮询。

**冷启动首装（「实时数据连接失败，请稍后重试」）**
- 首装 APK 常在 `reloadData` / 网关探测完成前就请求 `/api/live-stats`，上游一次失败会写入 `liveStatsCache`，旧逻辑 **20s 内复用失败包** 且轮询 **45s 后才第一次重试**，事件 Tab 长期停在错误卡片。
- 仅对 **成功** 的 live-stats 做 20s 节流；失败/上游错误走 `scheduleLiveStatsRecover`（首装 0.5–5s 快重试 + `waitForLiveStatsNetworkReady`）。
- 已有比分/开球的比赛在恢复期间显示「连接实时数据中…」；`ensureLivePoll` 错误态 **600ms 首 tick**、12s 间隔。

## Bug B：数据 → 球星长时间骨架

**根因**
- Boot 包 `fetch` 首选用 `no-store` + 8s 超时，在部分 WebView 上本地 `data-center-boot.json` 首包慢/失败，而 LS 仅保留 28 条切片，助攻/身价等常被挤出。
- 进入球星榜时未在判定骨架前同步 `primeDataSliceFromBoot`；门神榜无 boot 切片会一直等网络。

**修复**
- Boot 加载：**先 `force-cache` 本地包**再后台 `no-store` 刷新。
- `primeDataSliceFromBoot` 在 `pageData` / 联赛·榜单切换时同步合并 boot。
- LS 持久化保留 `bootPack` 切片，淘汰时优先删非 boot 项。
- `data-center-boot.json` 增补各联赛 `topkeepers` 筹备态切片（即时展示筹备文案，非骨架）。

**1.9.207** / **VERSION_CODE=244**
