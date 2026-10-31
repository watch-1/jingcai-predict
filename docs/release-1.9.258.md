# 1.9.258 — 赛程列表比分/状态与详情同步

## 问题
- 列表 `/api/live-scores` 在 sporttery 仍标「进行中」时不会走 AF 完场回填（`live=all` 不含已结束场次，且 afFt 路径跳过 `cur.live`）。
- sporttery 提前标 **完场** 且比分冻结（如奥格斯堡 1:0）时，afFt 因 `cur.finished && score` 直接跳过；`mergeAfOverlay` 双方完场时仍保留 sporttery，与详情（AF/live-stats 1:2）不一致。

## 修复
1. **`lib/live-scores.js`**
   - afFt：对已映射场次，在 stale live（开球 +2.5h 仍进行中）或 sporttery 早完场时仍拉 AF `/fixtures?ids=` 校正比分/状态。
   - `mergeAfOverlay`：AF 已 FT 而 sporttery 仍 live；或双方完场但 AF 总进球更多 → 采用 AF。
   - `applyResultsSeenOverlay`：合并 `results-seen.json` 官方赛果（无额外 AF 配额）。
2. **`public/app.js`**
   - 列表展示：开球过久仍标 live 时按完场展示；心跳轮询在 sporttery-only 完场数据未与 AF/seen 对齐前继续 reconcile。

## 版本
- **1.9.258** / VERSION_CODE **294**
- Web：部署 server + 静态资源即可；原生需重打 APK（`android/build-apk.sh`）。

## 测试
- `test/live-scores-sync-258-test.js`
- `test/ui-258-test.js`
