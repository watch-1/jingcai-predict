# 1.9.109 — 联赛身价榜 + 球队阵容身价排名

## 产品
1. **数据中心「身价榜」**：与积分榜/射手榜/助攻榜并列第四 Tab；按所选联赛球队**阵容总身价**排序（表格：# / 球队 / 总身价 / 人数）。点球队进详情。
2. **球队详情阵容**：默认按身价排名展示（#、姓名、身价），暂无匹配排末尾；不再只埋在副标题标签里。

## 技术
- `GET /api/club-values?league=`：积分榜球队名册 + `lib/market-value` 索引
- `enrichTeam` → `rankSquadPlayers` 按 `marketValueEur` 降序并写 `marketValueRank`
- 复用 1.9.108 索引 `data/market-value/index.json.gz`；文案 `亿欧` / `万欧`
- 无下注文案；不破坏原有三榜

## 版本
- versionName **1.9.109** / versionCode **146**
- 合作包 versionName **1.9.109-test**
- `sw.js` VER `jc-v1.9.109`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.109.apk | 6914317 | eae40934ed546bb540a1cf1fdbff5eab |
| jingcai-predict-1.9.109-partner.apk | 6914317 | ad5ed7b7733c4977fa6df5bd0baac65d |
| jingcai-predict.apk (→正式) | 6914317 | eae40934ed546bb540a1cf1fdbff5eab |

- http://120.77.152.74:8088/jingcai-predict-1.9.109.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.109-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionCode **146**；合作包 versionName **1.9.109-test**

## Smoke (prod Asia/Shanghai)
- `/api/club-values?league=epl` → 20 队，曼城 13.84亿欧 第1
- `/api/team?id=382&league=epl` 曼城 → 阵容按身价排名（哈兰德第1）；点开可见 #/姓名/身价
- 积分榜/射手榜/助攻榜未改
- 身价榜 Tab：数据页 `DATA_KINDS` 第四项
