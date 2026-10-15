# 1.9.14 近期过程数据（API-Football 滚动场均）

## 目标
赛前在「情报 / 数据」页展示主客 **近期 N 场**（默认 5）过程指标对比：控球、射门、射正、传球成功率、角球、进攻/危险进攻、xG（若有），并写入综合预测推演。

## 数据与配额
- **仅用免费 API-Football**（`API_FOOTBALL_KEY` 或 `APISPORTS_KEY`），约 **100 次/日**。
- 战绩/阵容仍优先 **ESPN**；本层只补完场 `/fixtures/statistics`。
- 缓存策略：
  - 单场技术统计：`data/live-stats/fixture-stats/{fixtureId}.json` **永久**
  - 球队滚动均值：`data/live-stats/process-rolling/{afTeamId}-n{N}.json` **≥12h**
  - 复用 `team-form` 赛程缓存，避免重复拉 fixtures
  - 单次请求最多新拉约 6 场统计；剩余配额 ≤ 预留（25）时只读缓存
- **密钥缺失 / 账户暂停**：UI 保留「近期过程数据」壳 + 明确中文说明，战绩/赔率照常。

## API
- `GET /api/match-stats` → 新增 `process` 字段
- `GET /api/process-stats?homeTeamId=&awayTeamId=&home=&away=&limit=5`

## 预测
简报新增「三、近期过程数据」；综合倾向在射门/射正/危险进攻等有显著差异时引用过程指标（控球仅作风格提示）。

## 设置密钥
```bash
# /opt/jingcai/.env
API_FOOTBALL_KEY=你的免费密钥
# 或
APISPORTS_KEY=你的免费密钥
systemctl restart jingcai
```
密钥需在 https://dashboard.api-football.com 为 **未暂停** 状态。

## APK
`dist/jingcai-predict-1.9.14.apk`（versionCode **54**）→ http://120.77.152.74:8088/jingcai-predict-1.9.14.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.14-prod-pre-20261015-195318
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
