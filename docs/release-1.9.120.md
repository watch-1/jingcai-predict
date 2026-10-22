# 1.9.120 — 取消顶部蓝条 + 完场误入「未开始」

## 问题
1. **顶部蓝条**：用户反馈状态栏下有一条亮/海军蓝带（与暗色 header 分层），问是否程序 UI 导致，要求取消。
2. **完场仍「未开始」**：赛程「未开始」中 西甲 周三006 莱万特 vs 毕尔巴鄂 仍显示 VS +「10-22 开球」；点进详情已是 **3:1 完场**（开球 2026-10-22 02:00）。

## 根因
1. **蓝条是我们画的**：`MainActivity.onCreate` 调用 `setStatusBarColor(#2a74f7)`（亮蓝），与 CSS header `--pri-d/#1B2A4A`、match hero 海军色不一致，形成多余色带。非纯系统默认。
2. **列表与详情数据源不一致**：
   - 赛程列表走 `/api/live-scores`：以 sporttery `getMatchLiveV1` 为主；AF 仅 `fixtures?live=all`（**不含已完场**）。
   - 该场 sporttery 赛程仍为 `Selling`、live 返回空 NS；开奖结果接口尚未收录。
   - 详情走 `/api/live-stats`（AF fixture）已正确 3:1 / FT。
   - 客户端 `classifyScoreRow` 在无比分时把久过开球场次仍归「未开始」。

## 修复
1. **Status bar**：`MainActivity` 改为 `#1B2A4A`（对齐 `theme-color` / `--pri-d`），取消亮蓝条；深色底 + 浅色状态图标。
2. **live-scores**：对 fixture-map 中 **开球日≤今天**、sporttery 尚未完场的场次，批量 `AF /fixtures?ids=` 叠完场/进行中比分（`afFtUsed`）；TTL 缓存控配额。
3. **客户端**：`classifyScoreRow` 对齐详情（`liveStatsCache` FT、status Finished/已完成、过开球 2.5h+ 有分→完场）；赛程卡 / 首页焦点卡 / 热门 banner / `matchCard` 同步；首页预拉 live-scores。

## 版本
- versionName **1.9.120** / versionCode **157**
- 合作包 versionName **1.9.120-test**
- `sw.js` VER `jc-v1.9.120`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.120.apk | 8136741 | 987f270ae07de260c1e1510985155b4c |
| jingcai-predict-1.9.120-partner.apk | 8136741 | 619ee3590c8801d3e8854d4e6286d1a2 |
| jingcai-predict.apk (→正式) | 8136741 | 987f270ae07de260c1e1510985155b4c |

- http://120.77.152.74:8088/jingcai-predict-1.9.120.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.120-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.120**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.119-prod-pre-20261022-064757.tgz`

## Smoke (prod)
- `GET /api/live-scores?ids=2042111` → `finished:true`, `full:"3:1"`, `phaseZh:"完场"`, `afFtUsed:true`
