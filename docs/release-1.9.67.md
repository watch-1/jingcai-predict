# 1.9.67 — AI 赛前叙事重心 + AF 结构化续填

## B) AI pre-match narrative focus
- `AI_PREMATCH_REV` **2 → 3**（旧缓存自动重生成）
- 盘口/市场概率：**全文最多一句**
- 主体：过程/SoS、球员近场表、伤停映射关键人、硬仗记忆、交锋补充
- 纯中文；禁止英文 Lean 码

## A) AF backfill
- `--af-cap=1000 --resume --players --prefer=jingcai`
- `LIVE_RESERVE` **2500 → 3000**（live headroom）
- 无 DeepSeek

## Deploy
- `root@120.77.152.74:/opt/jingcai` version **1.9.67**
- Sample regen: 斯特拉斯 vs 巴黎圣曼 `2042039` → rev 3
