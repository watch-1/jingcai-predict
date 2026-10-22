# 自有球员库 + AI 切片投喂（1.9.61）

## 目标
- 建立**自有**球员×场次事实库，完场后持久保存完整记录，供日后召回。
- 赛前 DeepSeek 只喂**压缩切片**（近 N 场、每场 Top 贡献者 + 伤停交集），控制 token，减少公式化线对比空话。
- 事实 append/upsert；关键球员标签可重算。不编造统计。

## Schema（SQLite `data/player-match.sqlite`）

### matches
| 列 | 说明 |
| --- | --- |
| match_id | 竞彩 matchId（主键）；无则用 `f:{fixtureId}` |
| fixture_id | API-Football fixture id |
| date / home_* / away_* / ft | 场次元数据 |
| competition / opponent_si | 可选 |
| source / fetched_at | 溯源 |

### player_match_stats
主键 `(match_id, player_id)`。含 minutes/goals/assists/shots/shots_on/key_passes/tackles/rating/… + source/fetched_at。

### player_tags（可重算）
player_id → line(FWD/MID/DEF/GK)、key_player_score、appearances。

## 写入路径
1. `lib/fixture-players.js` → `saveCached` 后 `upsertFromFixturePayload`
2. `node tools/backfill-player-match-db.js` 从磁盘 `data/live-stats/fixture-players/*.json` 导入

## AI 切片
`buildPlayerSliceForMatch(m, { injuryItems, recentMatches=4, topPerMatch=5 })`
- 每队近 N 场已入库完场；每场取 Top K 贡献者（本地 score）
- 伤停名单与库内球员名交集 → 附加近场行 + 冲击说明
- 行数硬顶：每侧 24 / 总计 48；关键球员最多 8
- 表头：`日期|对手|球员|位置|射门|射正|关键传|抢断|进球|助攻|评分|分钟`
- 接入 `deepseek-prematch.js` evidence；`AI_PREMATCH_REV = 2` 迫使旧缓存重生
- 有切片时 AI 区显示「已引用自有球员近场表」

## 文件
- `lib/player-match-db.js`
- `lib/fixture-players.js`（upsert hook）
- `lib/deepseek-prematch.js`（rev2 + slice）
- `tools/backfill-player-match-db.js`
- `test/player-match-db-test.js`

## 验证
```bash
node tools/backfill-player-match-db.js
# 应能查到哈兰德等行
node test/player-match-db-test.js
node test/deepseek-prematch-test.js
```

## 浏览 UI（内部工具，自 1.9.63）
只读浏览界面与 `/api/player-db/*` **不对端用户开放**。须配置 `PLAYER_DB_VIEW_KEY`，通过带 `?key=` 的私有 URL 或 `X-Player-Db-Key` 访问。手机登录无效；App「我的」无入口。详见 `docs/release-1.9.63.md`。

## 1.9.64 加厚
见 `docs/player-match-db-1.9.64.md`：`match_outcomes` + 本地全量回填；用户端「近期复盘」已移除。
