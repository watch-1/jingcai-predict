# 1.9.65 结构化赛后入库 + 预测即读库

## 变更
### A) Schema（`data/player-match.sqlite`）
- `match_process_compare`：指标对照（本场 actual / 近况 recent_avg / Δ），按 (match_id, side, metric)
- `hard_test_episodes`：硬仗检验 metrics+tags+SI（无 AI 长文）
- 保留 `match_outcomes`（表态/命中/短摘要）
- **不**把 AI 长文分析写入 SQLite（文件/缓存仍可）

### B) 写入路径
- 每次赛后复盘落盘 → `upsertOutcomeFromReview` 同步写 compare + hard-test
- `team-evidence.recordFromReview` 双写 JSON + SQLite
- 缓存命中亦补写结构化行，供预测立即可读

### C) 回填
```bash
node tools/backfill-player-match-db.js           # 仅本地缓存
node tools/backfill-player-match-db.js --af-cap=5 # 缺口可选慢速 AF 统计（skipAi，无 DeepSeek）
```

### D) 预测偏好库
- `getTeamEpisodes` / `getEvidenceForMatch` **优先 SQLite** hard_test_episodes
- predict-report 标注「自有硬仗检验(库)」；缺 postMatchIntel 时用 match_outcomes
- 球员切片仍走自有库

### E) 内部 `/db/players`
- 概览增加指标对照 / 硬仗检验行数
- 复盘结果列表展示 SI / 水分标签 / Δ 摘要
- 场次详情展示对照表 + 硬仗检验卡

### F) 版本
- Web/服务端 `1.9.65`；APK versionCode **105**
