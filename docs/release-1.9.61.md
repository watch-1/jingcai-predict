# 1.9.61 自有球员库 + AI 切片投喂

## Feature
- SQLite `data/player-match.sqlite`：完场球员事实全量入库（idempotent）
- 赛前 DeepSeek 证据包新增「自有球员近场」压缩表；禁止编造表外球员
- `AI_PREMATCH_REV=2`；有切片时 UI 提示「已引用自有球员近场表」
- 磁盘 fixture-players 缓存一键 backfill

## 版本
- Web/服务端：`1.9.61`
- APK：`jingcai-predict-1.9.61.apk` / `jingcai-predict.apk`（versionCode 101）

## 验证
1. `node tools/backfill-player-match-db.js` → 见哈兰德 2 球/8 射门行
2. 有球员历史的未开赛场 → 预测页 AI 解读点名关键球员，并显示「已引用自有球员近场表」
3. `GET /api/status` → version 1.9.61

## 生产验证（2026-10-17 Asia/Shanghai）
- 部署：`root@120.77.152.74:/opt/jingcai`，systemd `jingcai` active，`/api/status` → version **1.9.61**
- Backfill：14 场 / 619 球员行 / 278 tags；样本查询哈兰德（曼城 vs 巴黎圣曼）2 球 / 8 射门 / 评分 8.52
- AI 切片：曼城 vs 伊普斯（2042036）`playerSliceUsed=true`，叙事点名哈兰德，HTML 含「已引用自有球员近场表」，`AI_PREMATCH_REV=2`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.61.apk`（及 `/jingcai-predict.apk`，versionCode 101）
