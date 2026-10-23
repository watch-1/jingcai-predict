# 1.9.157 — 离线静默、身价榜头像、加载回归修复

## 用户反馈（对照 1.9.156）

1. 首页黄条「网络不可用，显示上次缓存的数据」——应静默用缓存。
2. 球星身价榜头像全为字母圆、右侧金额字体发粗发怪。
3. 冷启动/数据页骨架更久，疑似 1.9.156 预热与并发回归。

## 根因

| 问题 | 根因 |
|------|------|
| 离线黄条 | `loadData` 回落 LS 时设置 `offline` + `warnBar()` 展示横幅；接口超时在服务端繁忙时易被误判为「无网」。 |
| 身价榜无头像 | `/api/player-values` 的 `buildPlayerMarketValues` **从未写入 `photo`**（恒为 `''`）；1.9.156 的字母占位层使问题更明显。 |
| 金额字体 | 身价中文金额套用了全局 `.num`（DIN Alternate 等），中文「亿欧」观感异常。 |
| 加载变慢 | **1.9.156 `bootWarmAllDataCenter()`** 在 partner gate 后最多排队 **30 路**数据中心请求（含沉重的 `playervalues`/`clubvalues`），与首页 `reloadData`、服务端 **500ms 身价预热** 争抢连接；`scheduleDataCenterRefresh` 无并发上限，易形成重试/排队风暴。boot 包本身**不含** `playervalues`，身价榜仍走慢路径。 |

## 修复

### 客户端
- **静默缓存**：回落 `jc_cache_*` 时仅标 `fromCache`，`warnBar()` 不再展示离线横幅。
- **去掉冷启动 DC 风暴**：`bootWarmAllDataCenter()` 改为空操作；身价/球队身价等**用户进入子榜时**再 `scheduleDataCenterRefresh`。
- **数据中心请求队列**：`scheduleDataCenterRefresh` 最多 **2 路并发**，紧急（无缓存）优先。
- **身价榜 UI**：恢复「有 `photo` 才 `<img>`，失败再字母」；金额用 `.dc-mv-amt`（系统字体），不用 `.num`。

### 服务端
- `buildPlayerMarketValues`：对榜单行调用 `enrichLeaderPhotosSync`（本地 TSDB/阵容索引），后台 `enrichLeaderPhotos` 补余。
- 启动快速预热 `fastKinds` 收窄为 **`standings` + `topscorers`**，不再在 500ms 抢跑全队/球员身价聚合。

## 版本
- Web / `config.js` / `sw.js`：**1.9.157**（`jc-v1.9.157`）
- `VERSION.txt`：**1.9.157** / **VERSION_CODE=194**
- Android 默认：`VERSION_NAME=1.9.157`、`VERSION_CODE=194`

## 加载路径（对照 1.9.155 / 1.9.156）

| 阶段 | 1.9.156 | 1.9.157 |
|------|---------|---------|
| 同步 | `hydrateFromCache()` | 同左 |
| 并行 | `loadDataCenterBootPack()`（积分榜/射手等，**无身价榜切片**） | 同左，**不再**跟 30 路 bootWarm |
| 打开数据页 | 有 boot/LS → 即绘；无 → 骨架 + API | 同左；API **≤2 并发** |
| 身价榜 | 无 photo → 字母；后台仍可能被 bootWarm 拖慢 | 服务端补 photo；**按需**拉取 |
| 首页赛事 | `reloadData` | 同左；失败**无黄条**，静默 LS |

## 验证
1. `node test/data-center-prefetch-test.js`
2. `node test/data-center-boot-test.js`
3. `node tools/ui-test.js`（环境允许时）
4. 手动：断网开首页 → 无离线黄条；数据页球星身价榜 → 头像与金额样式正常；西甲积分榜冷启动应先出 boot/缓存表而非长骨架。
