# 综合预测与 API-Football 配额策略（v1.8.5）

## 原则
- 免费档约 **100 请求/日**；预留 `QUOTA_RESERVE=20` 给绿茵屏/积分榜。
- **场次报告磁盘缓存**：`data/predict-reports/{matchId}.json`（默认 4h；开球前 6h 内 TTL=90min）。
- **伤停按 fixture 缓存 6h**：`data/predict-reports/injuries/{fixtureId}.json`。
- 战绩：**本地** `history/results.jsonl`，零配额（采集窗口默认 **18 个月**，`MONTHS` 可调）。
- 交锋：本地有则用；本地空则 `GET /fixtures/headtohead?h2h=A-B`（**勿传 `last`**，免费档会报错），
  磁盘缓存 `data/live-stats/h2h/{lo}-{hi}.json` **≥24h**；球队 ID `data/live-stats/team-id-cache.json` 永久缓存。
- 积分榜：复用 `league-tables` 6h 缓存。
- 长尾联赛无 fixture 映射时**不强行解析**，伤停写「暂无可靠来源」。
- AF 请求仅在剩余配额 **> 预留** 时发起；配额紧张可读陈旧 H2H 缓存（≤7 天）。

## 接口
- `GET /api/predict-report?matchId=` — 赛前情报简报
- `GET /api/match-stats?homeTeamId=&awayTeamId=` — 战绩/交锋（可带 `home`/`away` 中文名）
- `GET /api/predict-quota` — 策略 + 当日剩余配额

## 禁止
捏造伤停、比分、未发生新闻；无下注/支付/出票代码。
