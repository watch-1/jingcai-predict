# 1.9.154 赛程联赛熄灭修复 + 数据中心预加载

## 变更

### A. 赛程联赛标签再点熄灭（修复 1.9.153 未生效场景）
- 联赛 pill 点击走 `applySchLeagueFromChip` + `softPatchSchedule`：即时更新 chips 与 `#schBody` 列表，并 `invalidateTabKeep('schedule')` + `render({ force: true })` 兜底。
- `chips button small` 增加 `pointer-events: none`，避免点小计区域时事件异常。
- UI 测试：关注 / 未开始 / 已结束 三种顶栏模式均验证「选联赛 → 再点同联赛 → 回到全部」。

### B. 数据中心服务端预加载
- `lib/league-tables.js`：`prefetchDataCenter()` 启动时预取五大联赛 + 欧冠的积分榜 / 射手 / 助攻 / 球队身价 / 球员身价 / 门神占位。
- 球队/球员身价榜增加磁盘 + 内存缓存（键：`clubvalues|playervalues-{leagueId}-{season}`，TTL 6h）。
- 服务启动 8s / 55s 两次预热；`/api/data-center-status` 返回 `prefetch` 状态。
- 数据 API 响应头 `X-JC-Data-Cache`：`mem` / `disk` / `compute` / `cached` / `fresh` 等。

## 版本
- Web / `config.js` / `sw.js`：**1.9.154**（`jc-v1.9.154`）
- `VERSION.txt`：**1.9.154** / **VERSION_CODE=191**
- Android 默认：`VERSION_NAME=1.9.154`、`VERSION_CODE=191`

## 验证
1. `node tools/ui-test.js` — 赛程联赛再点熄灭（三模式）。
2. `node test/data-center-prefetch-test.js` — 预取与身价榜缓存命中。
3. `curl -sI 'http://127.0.0.1:8088/api/standings?league=epl' | grep -i x-jc-data-cache` 应有缓存头。
