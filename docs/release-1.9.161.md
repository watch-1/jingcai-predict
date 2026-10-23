# 1.9.161 — 数据页并行加载 + 知识库优先 + 大正文基础

## 用户诉求

- 数据榜加载慢：希望在**当前可见**榜单上提高并行，后台预取保持克制。
- **知识库是核心**：进入 `#/kb` 时，知识包列表/条目应优先于数据中心 warm/预取。
- 未来单条笔记可达 **10 万+ 字**：需要可扩展的懒加载与本地缓存基础。

## 并行模型（数据中心）

| 类型 | 并发上限 | 说明 |
|------|----------|------|
| **urgent**（当前视图无缓存、用户触发的刷新） | **5** | 与 `DC_REFRESH_MAX_TOTAL=6` 配合，优先占用槽位 |
| **soft**（idle/跨联赛/兄弟子榜预取） | **2** | 仅在 KB 未占用、且非 `#/kb` 路由时入队 |
| **可见 slice 优先** | — | 队列排序：当前 `联赛:子榜` > urgent > FIFO |

### 取消过时 soft 请求

- 切换联赛/子榜或离开数据页：从队列移除其它 slice 的 **soft** 任务；对进行中的 soft 请求 **`AbortController` 取消**。
- urgent 任务保留，避免用户刚点开又立刻被掐断。

### 保留 1.9.160 防风暴策略

- 无 `bootWarmAllDataCenter` 风暴；身价榜无 `detail-warm` / team enrich；logo 分批 `prefetchDcImages`；离线静默；球星身价 `.dc-mv-amt` 金色。

## 知识库优先

- `dcKbBlocksQueue()`：`#/kb` 路由或 KB API **in-flight** 时 **暂停** `pumpDataCenterRefreshQueue`。
- soft 的 `scheduleDataCenterRefresh` 在 KB 活跃时 **直接不入队**。
- `loadKbPacks` / `loadKbPicker` / `loadKbPackItems` / `ensureKbItemBody` 用 `_kbInflight` 计数；结束后若离开 KB 再恢复 DC 队列。
- 失败 toast 仍 **仅 KB 路由**（延续 1.9.160）。

## 大正文（首版）

- **列表**：`GET /kb/packs/:id/items` 默认 **metaOnly**（`bodyLen` + `bodyPreview`，无 `body`）；`?full=1` 兼容全量。
- **详情**：`GET /kb/items/:id` 按需拉正文；客户端 `localStorage` `jc_kb_item_body_v1` 按 `updatedAt` 缓存，避免重复下载。
- **编辑**：打开节点先 `ensureKbItemBody`；保存 **400ms 防抖**，避免大正文连点阻塞 UI。
- **上限**：单条 `MAX_BODY=120000`（无 schema 迁移）；更长正文的分片存储见 `docs/kb-large-content.md`。

## 版本

- Web / `config.js` / `sw.js`：**1.9.161**（`jc-v1.9.161`）
- `VERSION.txt`：**1.9.161** / **VERSION_CODE=198**
- Android：`VERSION_NAME=1.9.161`、`VERSION_CODE=198`

## 验证

1. `node test/dc-kb-161-test.js`
2. `node test/ui-160-test.js`
3. `node test/kb-test.js`
4. `npm test`
