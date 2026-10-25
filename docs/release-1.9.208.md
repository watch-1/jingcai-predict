# 1.9.208 — 身价榜头像 + 门神榜 boot 陷阱 + 首装圈子热议

## 身价榜大量缺图（桌面审计 1.9.207）

**根因**
1. 身价行 `photo` 多为 `img.a.transfermarkt.technology/.../header/{tmId}.jpg`，客户端走 `/api/logo` 代理，但 `safeLogoTarget` 未放行 Transfermarkt 域名 → **HTTP 400「队徽地址无效」**（约 320 URL），头像回退蓝色字圈。
2. APK 内约 **10 张** `assets/players/*.png` 为 ESPN 灰底 **「NO PHOTO YET」**（sharp 后固定 **5969 字节**）。客户端本地优先 → 永久灰卡（如 Isak `235662`）。
3. Boot `topkeepers` 仅 `preparing:true`、0 行时仍被 `dataCacheRenderable` 视为可渲染 → 门神榜永远「筹备中」、不再打 `/api/topkeepers`。

**修复**
- **服务端**：`LOGO_HOSTS` + `safeLogoTarget` 允许 TM `portrait/header|big|medium/{id}.jpg`。
- **客户端**：`tmPortraitUrl` / `pickDcNetworkPhoto` 用 `tmId` 补 URL；头像 `data-net` 回退链；bundled 失败可再走代理。
- **sync**：拒绝 5969 字节灰占位；`playervalues` 纳入 leader 交叉图；扩大 boot 行采集；`--live` 重拉缺口。
- **Boot**：不再写入空 `topkeepers` 筹备切片；`mergeBootPackSlice` 忽略空 keeper boot；`playervalues` 生成失败时保留磁盘旧切片。

## 首装冷启动 / 圈子热议

**根因（APK）**
- `fillHomeTribeHot` 先 `await ensureTribeCatalog()`（最多 16s `no-store` boot）再请求 `/tribe/hot`；首会话失败无退避重试。
- `reloadData` 等在 `__partnerGateReady` 之后，首装首页 mid-tab 晚于二次启动。
- `ensureTribeCatalog` 空 catalog `_settled` 后 boot 到达不再重建。

**修复**
- Boot 切片 `global:tribeHot` + LS `jc_home_hot_v1` 首屏种子；`scheduleHomeTribeHotRecover`；`kickColdNetworkRefresh` 与 gate 并行。
- `ensureTribeCatalog`：`force-cache` 优先；空 catalog 在 boot 未就绪时不 `_settled`。
- Tribe catalog / home hot 在 `afterBootPackMerged` 补刷。

**1.9.208** / **VERSION_CODE=245**
