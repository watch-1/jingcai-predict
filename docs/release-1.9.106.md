# 1.9.106 — 队名中文化补齐 + 自有检验比分

## Issue 1 — 未来比赛 / 近期战绩英文队名
API-Football 赛程与战绩对手名未命中 `TEAM_ZH` / crest 时原样英文（如 SV Elversberg、Rot-Weiß Essen、FC Schalke 04、Hamburg SV、DFB Pokal）。

### 修复
- `lib/league-tables.js`：补德甲/德乙/杯赛常见别名；`teamZh` 去 FC/SV 等前后缀后匹配 crest；`leagueZh` 识别 DFB Pokal → **德国杯**
- `lib/next-fixtures.js` / `lib/match-stats.js` 仍走 `teamZh`/`leagueZh`（未来比赛 + 战绩共用）
- `public/app.js` FORCE_* 客户端 scrub 同步上述别名
- `lib/team-evidence.js` FALLBACK_TEAM_ZH 同步

### 新增别名（截图相关 + 常见德系）
| EN | ZH |
|----|-----|
| SV Elversberg / Elversberg | 埃沃斯堡（crest 既有） |
| Rot-Weiß Essen 等 | 红白埃森 |
| FC Schalke 04 / Schalke 04 | 沙尔克04 |
| Hamburg SV / Hamburger SV / HSV | 汉堡 |
| DFB Pokal / DFB-Pokal | 德国杯 |
| 2. Bundesliga | 德乙 |

## Issue 2 — 自有检验无比分 / 胜平负
硬仗样本卡仅有水分标签，缺完场比分与相对焦点队的 胜/平/负。

### 修复
- `formatEpisodeForUi` / `renderEvidenceHtml`：展示 `ft · 胜|平|负`（按 episode.side + 比分推导）
- 缺 ft 时尝试 match_outcomes / post-match-reviews
- `getTeamEpisodes`：sporttery id 合并 `AF_TEAM_SEED` 下硬仗样本（皇马 664↔541），±2 天同对手去重
- `ENGINE_REV` **203** 刷新预测报告缓存 HTML
- CSS `.pr-ev-score` / `.ev-w|d|l`

## 版本
- versionName **1.9.106** / versionCode **143**
- 合作包 versionName **1.9.106-test**


## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.106.apk | 6586183 | 601ff87df8e006d207308ab93faafa17 |
| jingcai-predict-1.9.106-partner.apk | 6586183 | b5a9c664c74b2224f37c34e9b7123ee8 |
| jingcai-predict.apk (→正式) | 6586183 | 601ff87df8e006d207308ab93faafa17 |

- http://120.77.152.74:8088/jingcai-predict-1.9.106.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.106-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionCode **143**；合作包 versionName **1.9.106-test**

## Smoke (prod 2026-10-21 Asia/Shanghai)
- 莱红牛 next：埃沃斯堡 / 红白埃森·德国杯 / 沙尔克04 / 曼城 / 奥格斯堡 — 无英文残留
- 莱红牛 form：…汉堡 5:0… — Hamburg SV → 汉堡
- 皇马 自有检验：罗马 3:4·胜 / 比利亚雷 1:0·胜 / 马竞 2:1·负
