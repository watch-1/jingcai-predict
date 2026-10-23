# 1.9.160 — 回退卡顿回归 + 球星身价金色 + 知识库 toast 串台

## 用户反馈（对照线上 1.9.159）

1. **越修越卡**：知识库长期骨架、数据页身价榜/球队身价榜骨架久；球星身价金额变成深蓝/黑而非金色。
2. **错误串台**：在「数据」Tab 弹出「知识库加载失败」toast。
3. **头像**：身价榜部分空白蓝圆或仅字母，与 API 已有 photo 不符（主线程与 `/api/logo` 风暴加重）。

## 根因（按影响排序）

| 问题 | 引入/加重版本 | 根因 |
|------|----------------|------|
| 数据页排队久 | 1.9.156–159 叠加 | `warmDataCenterPrefetch` 每次进入数据页为**当前联赛全部子榜 + 最多 5 个其它联赛**排队 soft refresh（仅 2 路并发），身价/球队身价等重接口被挤到队尾 → 骨架久。 |
| 身价榜打开后更卡 | 1.9.112+，159 仍触发 | `loadDataCenter` 成功后 `prefetchDetailWarm` 对身价榜仍发起 `detail-warm` + **3× `/api/team?enrich=1`（30s timeout）**，与身价列表、logo 代理争抢。 |
| Logo 代理风暴 | 1.9.157+ | `prefetchDcImages` 一次预热 **28** 张图，阻塞弱网主线程观感。 |
| KB 与首页抢连接 | **1.9.159** | `prefetchKbPacksOnBoot` 与 `refreshAccount` 内 **`Promise.all` 并行 `loadKbPacks`**，冷启动与数据页 API 同池竞争。 |
| KB toast 在数据页 | 1.9.131+ 逻辑 + 159 预热 | 用户在知识库路由发起加载后快速切到数据页，`ensureKbRouteData` 失败仍 **无条件 toast**。 |
| 球星身价非金色 | **1.9.157** | `.dc-sc-stat .dc-mv-amt { color: var(--t1) }` 为「中文金额不用 .num」修字体时误改颜色；球队身价 `.dc-mv-val` 仍为金棕色。 |

## 修复（1.9.160）

### 客户端 `public/app.js`
- **warmDataCenterPrefetch**：仅 soft 刷新当前 slice；兄弟子榜 `requestIdleCallback` 且仅补缺缓存；**身价榜/球队身价榜不做跨联赛预取**；其它榜跨联赛最多 1 个且延迟 8s。
- **prefetchDetailWarm**：`playervalues` / `clubvalues` **直接 return**，不再拉 team enrich。
- **prefetchDcImages**：最多 10 张、每批 3 张间隔 120ms，idle 后再跑。
- **KB**：`prefetchKbPacksOnBoot` 改为 idle/3s 延迟；`refreshAccount` **不再**把 `loadKbPacks` 塞进 `Promise.all`；失败 toast **仅当当前路由为 `#/kb`**。
- **头像**：榜单位 6 名以后 `loading="lazy"`；`.dc-avatar.letter` 样式保证 fallback 可读。

### 样式 `public/style.css`
- `.dc-mv-amt` 恢复 **`color: var(--gold)`**（`#e8a017`），字重 800。

### 服务端
- 无变更（保留 1.9.159 `enrichPlayervaluePhotos`）。

## 版本

- Web / `config.js` / `sw.js`：**1.9.160**（`jc-v1.9.160`）
- `VERSION.txt`：**1.9.160** / **VERSION_CODE=197**
- Android 默认：`VERSION_NAME=1.9.160`、`VERSION_CODE=197`

## 验证

1. `node test/ui-160-test.js`
2. `node test/kb-client-159-test.js`
3. `node test/cold-start-158-test.js`
4. `npm test`

## 加载路径（对照 1.9.159）

| 阶段 | 1.9.159 | 1.9.160 |
|------|---------|---------|
| 冷启动已登录 | 立即 `loadKbPacks` + account 并行再拉 KB | LS `hydrateKbPacksCache` 即绘；网络 KB **延迟 idle** |
| 打开数据·球星身价 | 骨架 + 队列里 4+5 路 soft + detail-warm 风暴 | 骨架 + **urgent 优先**；无 team enrich；logo 分批 |
| 知识库失败 | 任意页可能 toast | **仅 KB 页** toast + 重试空态 |
