# 1.9.105 — 未来比赛：综合赛程（API-Football）

## 问题
1.9.104 过滤过期场次后，「未来比赛」几乎为空：仅扫竞彩在售 + schedule-seen ~14 天缓存，大俱乐部联赛/杯赛后续场次不在池中。

## 方案
- 新增 `lib/next-fixtures.js` + `GET /api/next-fixtures`
- 优先 API-Football：`/fixtures?team=&next=`（Pro）或按赛季拉取；复用 `team-form` raw；磁盘缓存 **8h**（`data/live-stats/team-next/`）
- 失败回退在售/赛程池；排除本场（AF 双方 id + kickoff 邻近）
- 客户端弹窗与情报「后续赛程」优先服务端列表；文案改为「联赛与杯赛 · 综合赛程」

## 冒烟（皇马 vs 莱红牛 欧冠 周三007 / matchId 2042112）
- 皇马后续 **5** 场：客巴萨、客桑坦德、客 AEK 欧冠、客瓦伦、主塞尔塔…
- 莱红牛后续 **5** 场：主 Elversberg、客 Essen 杯、客沙尔克、主曼城 欧冠、主奥格斯堡…
- `source=api-football`，时间 Asia/Shanghai

## 配额
- 每队 miss 约 **1** 次 AF（`next=15`）；命中 8h 缓存 / team-form 复用为 **0**
- 与战绩共用 team 映射种子；保留配额预留 20

## APK
| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.105.apk | 6586183 | 8dd2a639f06ab146c52a55fa3092377e |
| jingcai-predict-1.9.105-partner.apk | 6586183 | 7dd7d2124b85ec199e9019cb20303dd0 |
| jingcai-predict.apk (→正式) | 6586183 | 8dd2a639f06ab146c52a55fa3092377e |

- http://120.77.152.74:8088/jingcai-predict-1.9.105.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.105-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionCode **142**；合作包 versionName **1.9.105-test**
