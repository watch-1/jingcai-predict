# 1.9.81 — 恢复队徽 + 统一球员照片源

## 根因
1.9.80 用户可见品牌脱敏（`scrubVendorLabels` / 前端 `esc()`→`scrubVendorLabelsClient`）对 **含 ESPN / TheSportsDB / sporttery.cn 的字符串一律替换**，队徽与头像 URL（如 `a.espncdn.com`、`r2.thesportsdb.com`、`static.sporttery.cn`）被改写 → `/api/logo` 404 → 字母圆圈占位。

## 修复
1. **队徽**：服务端 + 客户端 scrub **跳过 URL / `/api/logo?` / 编码后的 http(s)**；HTML 内嵌 URL 先保护再替换品牌词。厂商文案仍脱敏。
2. **球员照片统一**：阵容 `photoPool` 优先并入 API-Football 阵容照（`media.api-sports.io`，与赛后复盘「本场球员」同 CDN）；完场若有 `fixture-players` 磁盘缓存则覆盖为与复盘相同的 photo URL。ESPN / TheSportsDB 仅作缺口回退。

## Deploy
- `/opt/jingcai` **1.9.81**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.81.apk`（versionCode **118**）

## 验证
- `curl …/api/status` → `1.9.81`
- `node test/scrub-vendor-labels-test.js`
- 首页/赛程队徽：`homeLogo` 含 espncdn/thesportsdb 时不再被改写；字母圆圈应消失（有缓存队徽时）
- 完场阵容 `photoCount` 接近 fixture-players 有照片人数；photo URL 与复盘一致（api-sports.io）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.81`
- `/api/matches` logos：espncdn / thesportsdb 原文未改写；`/api/logo` espncdn → 200 image/png
- 完场阵容 `matchId=2042024`：home/away **照片 20/20**，`photoSrc=api-football-fixture`，与 `/api/fixture-players` **40/40 URL 一致**（修复前约 5–6/20）
- APK md5 `b35c8d426e09457b207c87f02d98e365`；HTTP 200 size **6507887**；versionCode **118**
- 备份：`/opt/jingcai/backups/v1.9.81-prod-pre-20261018-075633.tgz`
- `node test/scrub-vendor-labels-test.js` → ok
