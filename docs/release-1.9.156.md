# 1.9.156 冷启动秒开数据页

## 用户问题
杀掉 App 再进，数据页（尤其球星榜/未访问过的联赛）长时间骨架；射手榜文字已出但头像空白。

## 变更

### 客户端
- **`jc_data_cache_v1`**：启动时 `hydrateFromCache()` 仍同步灌入；新增 **`jc_data_snap_v1`** 持久化上次成功的 `#dcBody` HTML（杀进程后可秒绘，再 soft refresh）。
- **`data-center-boot.json`**：随包发布五大联赛+欧冠积分榜/射手/助攻/身价等精简切片；`loadDataCenterBootPack()` 在首屏前即 fetch，缺 LS 时合并进 `S.dataCache` 并写回 LS（非假数据，带 `updatedAt`）。
- **启动预取**：`bootWarmAllDataCenter()` 在 partner gate 通过后后台拉常用 slice，不必等用户点「数据」。
- **头像/队徽**：射手头像下加字母占位层 + `loading="lazy"`；`prefetchDcImages()` 空闲时预热代理 URL，表格不阻塞。
- **SW（Web）**：`stale-while-revalidate` 缓存数据中心 API 与 `/api/logo`。

### 服务端
- 数据中心预热：`startup-fast` 提前至 **500ms**（保留 2s 二次 pass）。

### 未改动
- 赛程顶栏再点熄灭（1.9.155）逻辑不变。

## 版本
- Web / `config.js` / `sw.js`：**1.9.156**（`jc-v1.9.156`）
- `VERSION.txt`：**1.9.156** / **VERSION_CODE=193**
- Android 默认：`VERSION_NAME=1.9.156`、`VERSION_CODE=193`

## 冷启动路径（数据页）
1. 同步 `hydrateFromCache()` → `jc_data_cache_v1` 进内存。
2. 并行 `loadDataCenterBootPack()` → 无缓存联赛也有表。
3. 打开数据：`pageData()` → `ensureDataCacheSlice` 立即渲染；无 slice 时用 `jc_data_snap_v1`；仍无则骨架。
4. `bootWarmAllDataCenter()` + `scheduleDataCenterRefresh({ soft })` 后台更新，meta 显示「更新于…」。

## 验证
1. `node tools/ui-test.js` — 含冷 reload 后进数据无骨架。
2. `node test/data-center-prefetch-test.js`
3. `node tools/gen-data-center-boot.js` — 发版前重生成 boot JSON（需本地 ESPN/缓存数据）。
