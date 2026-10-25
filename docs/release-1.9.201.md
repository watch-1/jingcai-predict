# 1.9.201 部落队徽本地持久缓存

## 用户反馈
部落列表（意甲等）第二次打开仍空白等 CDN；远程 ESPN 在国内 WebView 慢，首屏只有少量队徽。

## 根因
1. Capacitor App **不注册** Service Worker（`!IS_APP`），网页版 SW 的 `/api/logo` 缓存还随 `VER` 版本号被清掉。
2. 队徽每次都走 `/api/logo` → ESPN/CDN；冷启动/重开无本地 blob 持久化。

## 修复（1.9.201）
- **IndexedDB** `jc-crests-v1` 存 crest blob，键优先 `tid:{teamId}`，否则 `url:{logo}`；内存 Map 持有 `blob:` URL。
- `badge(..., { teamId })` 写入 `data-crest-key/logo/team-id`；命中 mem 则直接用本地 URL。
- 部落 catalog settle / rebuild 后 `warmCrestCacheForTeams`，再 softPatch；`hydrateTribeCrests` 在 softPatch、`pageTribe`/`tribe-club` render 后补全。
- 网页 SW：`/api/logo` 改用持久缓存名 `jc-crests-v1`，activate 时**不**随 `VER` 删除。
- `clearCache` 同步清空 crest IndexedDB（显式清缓存仍生效）。
- 写缓存失败 soft-fail，仍显示远程 `/api/logo`。

## 版本
**1.9.201** / **VERSION_CODE=238**

## 自测
- `node test/ui-201-test.js`
