# 1.9.206 球星头像打包修复

## 症状（1.9.205）
重装后射手/助攻/身价榜大量灰色占位或「NO PHOTO」；队徽正常。

## 根因
1. `sync-bundled-players.js` 在 TheSportsDB cutout（~228KB）超过旧 140KB 上限后，回退到 `media.api-sports.io/football/players/{espnPlayerId}.png`，得到 **5192 字节** 的 AF 占位图并写入 APK。
2. 打包名单仅 boot 子集（~122 人），未覆盖全部球星榜行。
3. 服务端 `enrichLeaderPhotosSync` 用 ESPN id 拼 AF URL，加剧 boot/API 中的无效 `photo` 字段。

## 修复
- **sync**：全榜采集（射手/助攻/身价各联赛 boot 行 + ESPN 磁盘榜 + `--live` 时 ESPN leaders API / 门神榜）；拒绝 AF 占位；cutout/thumb/ESPN headshot 多源；`sharp` 压至 150×150（约 **1.7MB / ~188 人**）。
- **客户端**：`isAfEspnIdPhotoUrl` / `pickDcNetworkPhoto`；本地 `assets/players/{id}.png` 仍优先。
- **服务端**：移除 ESPN id → AF CDN 的错误回退。
- **boot 工具**：`gen-data-center-boot.js` 增加 `topkeepers` slice（供后续打包扩展）。

## 发版前
```bash
node tools/sync-bundled-players.js --live   # 需外网；更新 manifest + config bundledPlayerIds
node test/ui-206-test.js
```
