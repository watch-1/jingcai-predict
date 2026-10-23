# 知识库大正文策略（10 万+ 字）

## 现状（1.9.161）

| 层级 | 行为 |
|------|------|
| **列表/画布** | `listItems({ includeBody: false })` 只下标题、坐标、`bodyLen`、`bodyPreview`（约 48 字） |
| **打开编辑** | `GET /kb/items/:id` 拉全量正文；命中 `jc_kb_item_body_v1` 且 `updatedAt` 一致则跳过网络 |
| **保存** | `PATCH /kb/items/:id` 防抖 400ms；服务端 `MAX_BODY=120000` |
| **个人预测** | `itemsByIds` 仍按选中 id 读库内全文（预测条数 ≤40，体积可控） |

## 为何先不做分片表

- 单 SQLite `TEXT` 列可存 12 万字符，满足当前产品上限且无迁移风险。
- 列表接口已去掉 `body`，瓶颈从「一次 JSON 塞满包」变为「按需单条」。

## 后续（需迁移时再开）

1. **表结构**：`kb_item_body`（`item_id`, `chunk_index`, `content`）或 `body_blob` 外链；列表 API 永不 join 大字段。
2. **流式/分页读**：`GET /kb/items/:id/body?offset=&limit=` 供编辑器分段加载；画布仍只用 `bodyPreview`。
3. **写入**：分块 `PATCH` + 服务端合并；客户端大粘贴用 `requestIdleCallback` 分片校验长度。
4. **缓存**：IndexedDB 存正文 blob，LS 只存索引元数据；导出 `kb/export` 走流式 zip。

## 客户端原则

- **Never** 在 pack 列表响应中要求全量 `body`。
- **Never** 在 KB 路由上与 DC soft 预取抢满连接池。
- 编辑超大正文时 UI 线程只做表单绑定；网络写入防抖/串行。
