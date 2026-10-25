# 1.9.204 部落法甲 / 中超队名 / 身价榜骨架 / 球星头像打包

## 用户反馈（1.9.203）
1. 部落侧栏「法甲」无球队（转圈后空态）
2. 「当前热门」中超等多队英文队名
3. 数据 Tab 球队/球星「身价榜」长期骨架
4. 球星榜头像浅蓝空圆（队徽正常）

## 根因
| 问题 | 根因 |
|------|------|
| 法甲空 | 积分榜刷新若丢失 `teamId`，部落目录按 `teamId` 建队会跳过法甲等联赛；目录 `_settled` 后未在切联赛侧栏时重建 |
| 英文队名 | ESPN 中超新队名（如 Dalian Yingbo、Shenzhen Xinpengcheng）未入 `TEAM_ZH`，boot 行 `teamZh` 回退英文 |
| 身价骨架 | `data-center-boot.json` 无 `playervalues`；部分 WebView `force-cache` 拉 boot 挂起；骨架无超时兜底 |
| 头像空圆 | 球星照仍走 `/api/logo` 代理，APK 离线/代理慢时只显示 `.dc-avatar` 底色 |

## 修复
- `mergeStandingsPreferTeamIds` + `loadDataCenter`/`mergeBootPackSlice`：保留/合并带 `teamId` 的积分榜，避免 API 覆盖 boot。
- 部落切联赛侧栏：缺队时拉 boot、urgent 刷新积分榜并 `rebuildTribeCatalogFromCache`。
- `loadDataCenterBootPack`：优先 `no-store` 限时拉 boot（与部落一致）。
- `TEAM_ZH` 补齐中超新队；重算 boot 内 `teamZh`。
- `scheduleDcBodyWatchdog`：骨架约 22s 后空态+重试；身价页同时 `loadDataCenterBootPack()`。
- `assets/players/{playerId}.png` + `sync-bundled-players.js`；`dcPlayerPhotoSrc` 优先本地。

## 球星照打包（约 **0.91 MB**，103 人）
- 来源：boot 各联赛射手榜前 12 + 助攻榜前 6（去重）。
- 单张 ≤140KB；失败 8 张仍走网络/代理。
- 管线：`node tools/sync-bundled-players.js`（在 `gen-data-center-boot.js` 之后）。

## 版本
**1.9.204** / **VERSION_CODE=241**

## 自测
```bash
node test/ui-204-test.js
node test/data-center-boot-test.js
```
