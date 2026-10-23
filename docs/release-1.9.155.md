# 1.9.155 赛程顶栏再点熄灭 + 数据中心首屏加速

## 变更

### A. 赛程顶栏 关注 / 未开始 / 已结束
- 再次点击当前已选中的顶栏按钮 → 取消状态筛选，进入 **`全部`**（`jc_sch_mode=全部`），三钮均无绿下划线高亮。
- 从「全部」态再点任一钮 → 恢复对应筛选。联赛 pills 与日期选择不受影响。

### B. 数据中心首屏（少闪骨架）
- **客户端**：`ensureDataCacheSlice` 同步从内存 + `jc_data_cache_v1` 取榜；有缓存则立即渲染表格，后台 `loadDataCenter({ soft })` 静默刷新；切联赛/子榜先 `softPatch` 再按需拉取。本地缓存上限 28 条（五大联赛 + 欧冠多子榜）。队徽 `loading="lazy"`，不阻塞表格出场。
- **服务端**：启动 **2s** 预热积分榜/球队身价/射手/球员身价（五大 + 欧冠），**10s** 全量 kinds，**48s** 与 ESPN 任务衔接二次全量；`prefetchDataCenter` 快速 pass 可与全量并行。

## 版本
- Web / `config.js` / `sw.js`：**1.9.155**（`jc-v1.9.155`）
- `VERSION.txt`：**1.9.155** / **VERSION_CODE=192**
- Android 默认：`VERSION_NAME=1.9.155`、`VERSION_CODE=192`

## 验证
1. `node tools/ui-test.js` — 赛程顶栏再点熄灭；数据页首屏/西甲/身价榜少骨架。
2. `node test/data-center-prefetch-test.js` — 服务端预取与缓存命中。
3. 手动：赛程未开始 → 再点 → 全部无绿线；数据页切西甲/意甲身价榜应先出表再补 logo。
