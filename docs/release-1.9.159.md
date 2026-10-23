# 1.9.159 — 知识库可恢复加载 + 身价榜头像 + 冷启动预热

## 用户反馈（对照 1.9.158 重装）

1. **我的知识库**：说明卡与「新建知识包」正常，下方长期灰色骨架，不出现已有知识包列表。
2. **数据 → 球星 → 身价榜**：名单与金额正常，左侧仍为蓝色字母圆，几乎看不出 1.9.157/158 的「头像修复」。
3. **整体偏慢**：冷启动无本地缓存时，知识库与数据页等待时间长。

## 根因

| 问题 | 根因 |
|------|------|
| 知识库永久骨架 | 1.9.158 将 `packs == null` 正确视为加载中，但 **`/kb/packs` 失败或超时后 `packs` 仍为 `null`**，`pending` 恒为 true → 无限骨架；无重试入口。冷启动仅在进入 KB 路由才拉列表，与 `reloadData` 串行感明显。 |
| 身价榜无头像 | 1.9.157 在 `buildPlayerMarketValues` 调用了 `enrichLeaderPhotosSync`，但身价行 **无 `playerId`**，本地 TSDB/阵容索引命中率极低；**未合并 ESPN 射手/助攻磁盘榜**（同机 `topscorers` API 已有 `photo`）。6h 磁盘缓存把「空 photo」响应长期固化。 |
| 加载慢 | 已登录用户冷启动未并行预热 KB；知识包详情失败同样只有骨架。 |

## 修复

### 服务端 `lib/espn-tables.js` + `lib/league-tables.js`
- 新增 `enrichPlayervaluePhotos`：同步读取联赛 **scorers/assists 磁盘榜** 按「姓名+俱乐部」合并头像，再走原有 `enrichLeaderPhotosSync`；可选 **Transfermarkt `tmId` 肖像 URL** 兜底。
- 身价行写入 `tmId`；`getPlayerMarketValues` 对缓存命中但缺 photo 的行 **再 enrich 一次**（无需等 6h TTL）。

### 客户端 `public/app.js`
- KB：`packsError` / `packItemsError`；失败显示 **可重试** 空态，不再永久骨架。
- 登录后 **`prefetchKbPacksOnBoot`**（与 `refreshAccount` 并行），缩短首进知识库等待。
- `kbRetryPacks` / `kbRetryPack` 操作。

## 版本

- Web / `config.js` / `sw.js`：**1.9.159**（`jc-v1.9.159`）
- `VERSION.txt`：**1.9.159** / **VERSION_CODE=196**
- Android 默认：`VERSION_NAME=1.9.159`、`VERSION_CODE=196`

## 验证

1. `node test/kb-client-159-test.js`
2. `node test/playervalues-photo-159-test.js`
3. `node test/cold-start-158-test.js`
4. `npm test`
5. 手动：已登录冷启动 → 知识库应在约 1–2s 内出现列表或明确失败+重试；数据页英超/德甲身价榜左侧应出现球员图（非纯字母圆）。
