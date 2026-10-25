# 1.9.205 球星页首屏 / 身价榜 boot / 头像本地

## 用户反馈（1.9.204）
- 德甲射手榜等长期灰色骨架
- 西甲身价榜先骨架，名单出来后头牌头像仍浅蓝空圆（队徽正常）

## 根因
| 问题 | 根因 |
|------|------|
| 骨架慢 | `data-center-boot.json` 无 `playervalues` slice；球星页在 boot 合并前只画骨架；API 挂起时 watchdog 直接 return 不合并 boot；失败后 `loadDataCenterBootPack` 不重试 |
| 身价头像空 | 身价行 `playerId` 常为 null，`dcPlayerPhotoSrc` 无法命中 `assets/players/{id}.png`；204 打包仅射手/助攻；manifest 异步加载前不走本地路径 |

## 修复
- **boot**：`gen-data-center-boot.js` 写入各联赛 `playervalues` 前 20 行（无远程 photo URL，含 `playerId`/`tmId`/身价字段）；约 **+90KB** boot JSON。
- **enrich**：`enrichPlayervaluePhotos` 从射手/助攻磁盘榜合并 **ESPN playerId**（亚马尔 362150、姆巴佩 231388 等）。
- **打包**：`sync-bundled-players.js` 增加身价榜前 15 + 门神前 8；**122 人 / ~1.10 MB**（+19 张，约 +0.19 MB）。
- **客户端**：`tryMergeBootPackSlice` 首屏即合并 boot；watchdog 先 abort 挂起请求再强制 boot；`playerIdForBundledPhoto` + `config.js` 同步 `bundledPlayerIds`；APK 在 manifest 前可试本地路径；网络刷新 `mergeDcRowsPreferIdentity` 不抹掉已有头像字段。

## 版本
**1.9.205** / **VERSION_CODE=242**

## 自测
```bash
node test/ui-205-test.js
node test/ui-204-test.js
node test/data-center-boot-test.js
node test/playervalues-photo-159-test.js
# 发版前（需 market-value 索引）：
# node tools/build-market-value-index.js
# node tools/gen-data-center-boot.js
# node tools/sync-bundled-players.js
```
