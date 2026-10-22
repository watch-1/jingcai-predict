# Full-scope 结构化回填（1.9.66）

## 范围
完场场次结构化入库（竞彩 + non-竞彩），非竞彩亦有价值。

## 本地优先（零 AF / 零 DeepSeek）
1. `fixture-players` → player_match_stats
2. `post-match-reviews` → outcomes + compare + hard-test
3. **`fixture-stats` + `team-form` meta** → match shells / compare / hard-test / outcomes  
   - 有 fixture-map → 竞彩 match_id  
   - 否则 → `af:{fixtureId}`
4. `results.jsonl` → match shells

## AF 缺口（可选、限速）
```bash
# 先看配额
# AF /status：Pro 7500/day；预留 live ~2500，硬底 800

node tools/backfill-player-match-db.js                  # 仅本地
node tools/backfill-player-match-db.js --af-cap=400      # 缺口慢速拉 stats
node tools/backfill-player-match-db.js --af-cap=400 --resume
node tools/backfill-player-match-db.js --af-cap=200 --players --prefer=jingcai
```

状态：`data/backfill-state.json`（`--resume` 续跑）。

## 预测
`team-evidence.getTeamEpisodes` 仍优先读 SQLite hard_test_episodes。
