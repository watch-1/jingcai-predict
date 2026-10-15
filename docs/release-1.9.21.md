# 1.9.21 赛后复盘（过程均值 vs 本场统计）

## 用户价值
完场后对比「赛前滚动过程均值」与「本场 AF 技术统计」，生成多角度中文复盘（过程/对位/预测命中/赔率对照/分析假说），写入知识库，并在后续预测简报中注入 1–3 条历史复盘要点。

## 改动
1. **`lib/post-match-review.js`**（新）：计算控球/射门/射正/传球%/角球/xG 的 Δ；中文多角度复盘；JSON（`data/post-match-reviews/`）+ SQLite `post_match_intel`；假说均标注为分析非事实。
2. **`server.js`**：`GET /api/post-match-review?matchId=`、`GET /api/post-match-reviews`。
3. **`lib/predict-report.js`**：若存在同队/交锋历史复盘，注入「历史赛后复盘」节与依据条目。
4. **`public/app.js` + `style.css`**：完场详情新增 Tab「赛后复盘」+ 近期复盘列表。
5. AF 统计缺失时优雅降级（仍可做预测/赔率对照）；不编造数据；无购彩建议。

## APK
`dist/jingcai-predict-1.9.21.apk`（versionCode **61**）→ http://120.77.152.74:8088/jingcai-predict-1.9.21.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.21-prod-pre-20261016-033803
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
