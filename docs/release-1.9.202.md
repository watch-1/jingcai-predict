# 1.9.202 部落队徽打进 APK（本地零网络首屏）

## 用户反馈
1.9.201 用 IndexedDB 缓存远程队徽后，首装仍依赖 `/api/logo` + ESPN/CDN，部落格大量空白或字母占位；`warmCrestCacheForTeams` 在 paint 前等 IDB 预热，`hydrateTribeCrests` 批量 await 远程，与帖子流抢带宽，首页态度骨架、巴萨圈子帖子转圈。

## 根因
- Capacitor App 不走 SW，冷启动无本地 crest 文件。
- 部落 catalog settle 时 `warmCrestCacheForTeams(...).then(paint)` 延迟首绘。
- `hydrateTribeCrests` 在 render 路径上 `await Promise.all` 远程拉徽。

## 修复（1.9.202）
- **`public/assets/crests/{teamId}.png`**：从 `data-center-boot.json` 积分榜抽取 TRIBE_LEAGUES 球队（约 100 支），`tools/sync-bundled-crests.js` 同步 ESPN 500px PNG；`android/build-apk.sh` 随 `public/` 一并打进 APK。
- **`bundledCrestPath` / `badge()`**：有 `teamId` 时优先 `assets/crests/{id}.png`（零网络）；失败 `data-fb` 回退 `/api/logo`；再失败字母占位。IndexedDB 仅作非打包球队可选叠加。
- **不阻塞 UI**：catalog `paint()` 立即执行；`warmCrestCacheForTeams` 后台跑；`hydrateTribeCrests` 改为 fire-and-forget。
- 帖子/赛程 API 仍为实时网络，未改业务逻辑。

## 版本
**1.9.202** / **VERSION_CODE=239**

## 自测
- `node test/ui-202-test.js`
- `node tools/sync-bundled-crests.js`（boot 包更新后重同步队徽）

## APK 体积（估算）
- 队徽目录约 **5.7 MB** 未压缩（100 PNG + manifest）；打进 APK 后 zip 约 **+3–4 MB**（相对 1.9.201 约 6.2 MB 包体）。
