# 1.9.68 — 竞彩优先回填 + 球员缺口填充

## Policy
- 默认 `--prefer=jingcai`：只优先 sporttery/竞彩映射场次；跳过从未上竞彩的联赛（友谊赛/青年/预备等）
- 不批量删除已有 `af:` 壳；未来写入过滤 + 内部球员库默认软隐藏
- AF：`LIVE_RESERVE=3000`；cap≈1000 仅当用完后 remaining≥3000

## Player gaps（本轮）
- 竞彩「有对照/硬仗、暂无球员行」：27 → 填入 **26**（维拉 6:0 费内 `2041972` → 43 球员行）
- 剩余 1：里昂 vs 水晶宫 `2041975`（`ft` 空，AF 球员未就绪）
- 命令：`node tools/backfill-player-match-db.js --af-cap=100 --players --player-gaps`
- 另：遗留 1.9.67 `--af-cap=1000 --prefer=jingcai` 续跑至预算耗尽后已停

## AI 赛前
- 盘口最多一句；主体=整体近期数据 + 球员表 + 对手对比
- `AI_PREMATCH_REV` 保持 **3**（无大规模 DeepSeek 重生成）

## DB（live 约 2026-10-17 07:55 CST）
| | |
| --- | ---: |
| matches | 8248（竞彩 6873 / af壳 1375） |
| playerRows | 9536 |
| matches with players | 227 |
| 竞彩球员缺口（仍缺） | 1 |

## Deploy
- `/opt/jingcai` **1.9.68**，systemd active
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.68.apk`（versionCode **106**）
- AF remaining after ≈ **3175**/7500（≥3000 live headroom）
