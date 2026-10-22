# 1.9.83 — 情报中文强制 + 战绩全量 sheet + 导航修复

## 产品
1. **强制中文队名/联赛名**：战绩 / 交锋 / 情报 / 自有检验 / 精选中不再残留 `Kashiwa Reysol`、`Tampines Rovers`、`Japanese J1 League` 等英文；`teamZh`/`leagueZh` 叠加 crests 中文回填与规范匹配。
2. **主队战绩 / 客队战绩**：情报快捷入口打开可关闭 sheet，展示 DB/缓存中该队**全部**完场（上限 50–80），分页「加载更多」，不再固定截断 5–10 且无入口。
3. **未来比赛**：sheet 展示**本场主/客队**后续赛程（当前在售/赛程缓存），不再跳转全局赛程页。
4. **积分排名**：sheet 内展示本场联赛积分榜（已接入联赛）；未接入联赛给出说明。点 ✕ / 遮罩 / 系统返回关闭，**不替换路由、不卡住返回栈**。

## Deploy
- `/opt/jingcai` **1.9.83**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.83.apk`（versionCode **120**）

## 验证
- `curl …/api/status` → `1.9.83`
- `/api/match-stats?…&limit=50` 战绩条数可 >10；队名/联赛为中文
- 情报 hub：主队/客队战绩、未来比赛、积分排名均为 sheet，关闭后仍在赛事详情

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.83`
- `/api/match-stats` 町田/福冈：homeN=50 awayN=45；联赛/对手为中文（日职、柏太阳神、横滨水手、千叶市原…）；英文残留 0
- `/app.js` 含 `openMatchHubSheet` / `hubFormMore`；积分/未来/战绩入口不再 `data-go` 跳转全局页
- APK md5 `95cf2e6c0246b7ecef1708630fac9e86`；HTTP 200 size **6511983**；versionCode **120**
- 备份：`/opt/jingcai/backups/v1.9.82-prod-pre-20261018-082246.tgz`
