# 1.9.108 — 数据中心球队/球星身价

## 结论
- **可以上**：API-Football **无** market value 字段；中国生产机访问不了 Transfermarkt / Wikidata。
- **方案**：打包公开社区数据集 [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets) 的球员/俱乐部市值快照（约至 **2026-06**），按英文名匹配，磁盘索引约 600KB gzip。

## 展示位置（数据中心，对用户公开）
- 球队详情：英雄区「身价」标签；简介「阵容身价」；加载阵容后球员卡副标题
- 球员详情：英雄区标签 + 资料「身价」行
- 无匹配时：**暂无身价**（不编造）
- 文案格式：`2亿欧（€200m）` / `7500万欧（€75m）`；标注参考、非实时

## 技术
- `lib/market-value.js` + `data/market-value/index.json.gz`
- `getTeamDetail` / `getAfPlayerDetail` 附加 `marketValue`
- `GET /api/market-value-status`
- 重建：`node tools/build-market-value-index.js`
- 不改动 `PLAYER_DB_VIEW_KEY` 内部球员库规则

## 版本
- versionName **1.9.108** / versionCode **145**
- 合作包 versionName **1.9.108-test**
- `sw.js` VER `jc-v1.9.108`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.108.apk | 6750250 | cfc74a94a103c6e6e956e5150bd87ead |
| jingcai-predict-1.9.108-partner.apk | 6750250 | 1975c53cd8ff051ad65a36097e38a8f8 |
| jingcai-predict.apk (→正式) | 6750250 | cfc74a94a103c6e6e956e5150bd87ead |

- http://120.77.152.74:8088/jingcai-predict-1.9.108.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.108-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionCode **145**；合作包 versionName **1.9.108-test**

## Smoke (prod Asia/Shanghai)
- `/api/market-value-status` → ok, players 22388, clubs 678, asOf 2026-06
- `/api/af-player?id=1100` 哈兰德 → 身价 2亿欧（€200m）
- `/api/team?id=50` 曼城 → 阵容身价 13.84亿欧（€1.38bn）
- `/api/team?id=541&squad=1` 皇马 → 12.62亿欧；阵容 38 人中 23 人有身价
