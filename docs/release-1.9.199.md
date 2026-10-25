# 1.9.199 部落「当前热门」无限转圈

## 用户反馈
装上 1.9.198 后部落「当前热门」左侧选中，主区只有蓝色转圈，永远不出球队也不出「暂无球队」；下拉刷新图标也会卡住。

## 根因
1. **1.9.198 `ensureTribeCatalog` 空目录回退门：** 仅当 `Object.keys(byId).length` 才短路；空目录每次 `pageTribe`/`softPatch` 再次进入 → `tribeCatBusy` 永真 → 主区 spinner 永不消失（198 前空目录会落到「暂无球队」）。
2. **boot fetch 无超时：** `await loadDataCenterBootPack()`（`cache: 'force-cache'`）在部分 WebView / 坏缓存上永不 settle，busy 永不清。
3. **PTR 无 finally：** `touchend` 里 `await reloadData/refreshAccount` 挂起时 loading 类与「正在刷新…」永留。

## 修复
- 空目录标记 `_settled`，非 `force` 不再重入；`finally` 必清 `tribeCatBusy`。
- 部落 boot 改 timed `no-store`（AbortController 8s）；失败仍 settle 空态并 `scheduleDataCenterRefresh`；standings 回填后 `rebuildTribeCatalogFromCache`。
- `tribeReload` 传 `{ force: true }`。
- PTR：`try/catch/finally` + 12s race，刷新图标必收。

## 版本
**1.9.199** / **VERSION_CODE=236**

## 自测
- `node test/ui-199-test.js`
