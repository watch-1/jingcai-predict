# 1.9.256 — 主队/客队战绩近期场次补全

## 根因

- `lib/match-stats.js` 的竞彩近况只读 `data/history/results.jsonl`（批量采集，常滞后数天）。
- 线上赛果管道会把近 **14 天**完场写入 `data/results-seen.json`（及带比分的 `schedule-seen.json`），但战绩 API **未合并**。
- ESPN 近况仅拉联赛 + 欧冠/欧联/欧协，**不含英联赛杯**；杯赛行若未进 JSONL，就会在「综合赛程 + 竞彩合并」路径上消失（维拉 2026-10-29 客负伯恩茅斯 3:0 即此例）。

## 修复

1. `lib/results-archive.js`：`loadRecentFormHistoryRows()` 将 seen / schedule-seen 转为 JSONL 同构行。
2. `lib/match-stats.js`：`loadRows()` 合并 archive 行（按 matchId，JSONL 优先）。
3. `lib/espn-form.js`：增加 `eng.league_cup`；表单缓存 `schema: 2` 使旧 6h 缓存自动刷新。

## 验证（生产）

1. 部署后任选含维拉场次 → 情报 → **客队战绩 · 维拉**（或主队视角下的维拉 sheet）。
2. 列表顶部应出现 **10-29 英联赛杯 伯恩茅斯 3:0 维拉**（结果 L），且在 10-24 英超对曼城之上。
3. 可选：`GET /api/match-stats?awayTeamId=2&away=维拉&limit=50` → `awayForm.matches[0]` 含该杯赛行。

## 数据回填

无需一次性 DB patch：服务端 `completeResults()` 持续写入 `results-seen.json`。若某场仍缺，确认该场已在比分/赛果接口有完整比分并触发一次赛果刷新即可。
