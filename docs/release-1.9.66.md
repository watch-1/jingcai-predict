# 1.9.66 Full-scope 结构化回填

## 变更
- `backfillFromFixtureStatsCaches`：995+ fixture-stats × team-form → 结构化行（含 non-竞彩 `af:`）
- 回填工具：`--af-cap` 至 4000、AF `/status` 预检、headroom 预留、`--resume`、`--players`、`--prefer`
- 预测路径不变：仍优先读库

## 部署后
在 live `/opt/jingcai` 跑本地回填，再按配额 `--af-cap` 缺口填充。

## Live backfill result (2026-10-17 CST)
| | before | after |
| --- | ---: | ---: |
| matches | 6856 | 8000 |
| outcomes | 21 | 1171 |
| processCompare rows | 228 | 18628 |
| compare matches | 19 | 1169 |
| hard-test episodes | 38 | 2335 |
| DB size | 1.91 MiB | 7.72 MiB |
| AF day usage | ~2322 | **2864**/7500 |

Resume: `node tools/backfill-player-match-db.js --af-cap=400 --resume --prefer=jingcai --min-date=2025-08-01`
