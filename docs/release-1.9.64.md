# 1.9.64 自有库加厚 + 移除「近期复盘」用户 UI

## 变更
### A) 本地缓存全量回填（不烧 API / DeepSeek）
- `data/live-stats/fixture-players/*.json` → `player_match_stats`
- `data/post-match-reviews/*.json` → 新表 `match_outcomes`（表态/信心/命中/比分/短摘要，**不含 HTML**）
- `data/history/results.jsonl` → `matches` 场次元数据壳
- 复盘里已有硬仗检验的，回填时重写 `team-evidence`
- 工具：`node tools/backfill-player-match-db.js` → `fullBackfillFromLocalCaches()`
- 赛后复盘落盘时同步 `upsertOutcomeFromReview`

### B) 移除用户端「近期复盘」
- 赛事详情「赛后复盘」页不再展示「近期复盘 / 知识库」列表
- 数据保留在 `match_outcomes`；内部 `/db/players?key=…` 增加「复盘结果」区（同 PLAYER_DB_VIEW_KEY）

### C) 版本
- Web/服务端 `1.9.64`；APK versionCode **104**

## 约束确认
- 回填路径**不调用** API-Football、**不调用** DeepSeek
- 库文件仍保持轻量（事实表；无巨大 HTML 副本）
