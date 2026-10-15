# 1.9.22 本场球员（完场球员统计）

## 用户价值
完场后展示双方出场球员的照片、中文名、出场时间、评分、进球/助攻/射门/关键传；突出本场最佳；赛前预测简报可注入近期关键球员要点（仅用已缓存核心子集，零额外配额）。

## 改动
1. **`lib/fixture-players.js`**（新）：`GET /fixtures/players`，仅完场拉取；`data/live-stats/fixture-players/{fixtureId}.json` 永久缓存；每场约 1–2 次 AF 请求；核心子集 + 预测轻量要点。
2. **`server.js`**：`GET /api/fixture-players?matchId=`。
3. **`lib/predict-report.js`**：注入「近期关键球员」参考节（磁盘缓存，不烧配额）。
4. **`public/app.js` + `style.css`**：数据 Tab 精美「本场球员」双队切换、MOTM 高亮、空/加载态。
5. 中文、无购彩建议；配额紧张时优雅降级。

## APK
`dist/jingcai-predict-1.9.22.apk`（versionCode **62**）→ http://120.77.152.74:8088/jingcai-predict-1.9.22.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.22-prod-pre-20261016-040503
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
