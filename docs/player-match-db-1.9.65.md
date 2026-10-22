# 结构化赛后辅助数据（1.9.65）

## 表
| 表 | 内容 |
| --- | --- |
| match_process_compare | 指标对照 actual / recent_avg / delta |
| hard_test_episodes | 硬仗 SI、水分标签、mechanismTags、metrics_json |
| match_outcomes | 表态/命中/短摘要（≤280，非 HTML） |

## 不入库
AI 长文分析 / HTML 复盘正文 → 仍在 `data/post-match-reviews/*.json` 与 DeepSeek 缓存。

## 预测读取
`team-evidence.getTeamEpisodes` → SQLite 优先；无行再回落 `team-evidence.json`。
