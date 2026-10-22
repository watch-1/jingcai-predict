# 1.9.112 — 球队赛程排版 + 球队/球星详情加速

## 排版根因
未来赛程 / 过去比赛的 `.fx-teams` 使用 `display:flex; flex-wrap:wrap`，队徽与队名是**独立 flex 子项**。长中文名（比利亚雷亚尔、巴黎圣日耳曼）时队徽与队名被拆到不同行：客队名与「未开赛」挤在一行，PSG 队徽落到下一行 orphan。

## 排版修复
- HTML：每侧包成 `.fx-side`（crest + name 同组），中间 `.fx-mid` 放比分/未开赛
- CSS：三列 grid `1fr auto 1fr`；队名 ellipsis；禁止 crest 落到队名下方
- 过去比赛同一套结构，对齐一致

## 速度根因
1. 每次打开球队详情都打 ESPN schedule/team（即使 `teamrecent` 磁盘仍新鲜）
2. 阵容照片 enrich（AF 网络 + TSDB）阻塞首包
3. 客户端在首屏前还串行等 `/standings` 缺口提示
4. 无「组装后」的 team/player JSON 整包缓存

## 缓存策略（1.9.112）
| 层 | TTL | 行为 |
|----|-----|------|
| 内存 `memAssembled` | 3h | 命中即返回（目标 &lt;10ms） |
| 磁盘 `detail-teamfull-*` / `detail-playerfull-*` | 3h fresh / 36h soft-stale | 过期 soft-serve + 后台重建 |
| 客户端 `localStorage` `jc_td_*` / `jc_pd_*` | ~6h | 先画缓存骨架，后台刷新 |
| 部件缓存 | 沿用 | teammeta / teamrecent / teamsquad 不变 |

其它：
- `teamrecent` 新鲜时**跳过** ESPN fixtures 网络
- 照片：首包仅 disk/local merge；不足 85% 时后台 `enrichSquadPhotos`（不阻塞首屏）
- 数据中心积分榜/身价榜/射手榜加载后 `POST /api/detail-warm` + 预取前几支球队写入 LS
- 身价榜 / 队内身价 / 照片 enrich **不回退**（PSG 队内 18/25 有身价，照片 24/25）

## 时延（prod Asia/Shanghai，PSG ESPN 160 / 维蒂尼亚 288897）

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 球队详情 cold/force | ~2.2–3.9s | **~1.0s** |
| 球队详情 warm（组装缓存） | ~0.96s | **~3ms** |
| 球员详情 warm | ~1ms–1s | **~2ms** |

客户端：有 LS 缓存时打开即画，感知接近即时；冷启动也明显快于「许久」。

## 版本
- versionName **1.9.112** / versionCode **149**
- 合作包 versionName **1.9.112-test**
- `sw.js` VER `jc-v1.9.112`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.112.apk | 7082554 | 7c6b8bf5a5ed52fb980532866c28e3d4 |
| jingcai-predict-1.9.112-partner.apk | 7082554 | 0195d04abde1011c245390a64e63c2a9 |
| jingcai-predict.apk (→正式) | 7082554 | 7c6b8bf5a5ed52fb980532866c28e3d4 |

- http://120.77.152.74:8088/jingcai-predict-1.9.112.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.112-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## Smoke
- `/api/team?id=160&league=ligue1` → assembledCache=mem，upcoming/recent 正常，身价与照片保留
- `/api/af-player?id=288897&league=ligue1` → mem 命中
- `/api/club-values?league=ligue1` → 巴黎圣日耳曼仍榜首
