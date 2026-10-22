# 自有库回填加厚（1.9.64）

## match_outcomes
| 列 | 说明 |
| --- | --- |
| match_id | 主键 |
| date / league / home_* / away_* / ft / result | 场次元数据 |
| pred_lean / pred_conf / pred_pick_text / speak_mode / market_lean | 赛前表态 |
| lean_hit / market_hit / amplify_hit | 命中（0/1/null） |
| snippet | 短摘要（≤280 字，非 HTML） |
| has_actual_stats / hard_test_available | 标志 |

## 回填
```bash
node tools/backfill-player-match-db.js
# 仅本地缓存；报告 before/after 行数与文件字节
```

## 内部浏览
`/api/player-db/outcomes` + 球员库页「复盘结果」区（需 `PLAYER_DB_VIEW_KEY`）
