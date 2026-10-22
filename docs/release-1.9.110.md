# 1.9.110 — 阵容身价匹配率修复

## 根因
积分榜球队 id 来自 **ESPN**（曼城=382），但 `/players/squads` 误把同一 id 当作 **API-Football** id 拉取，导致曼城阵容变成白俄罗斯 Vitebsk，身价匹配 **~0%**。皇马等队因 AF 拉取失败回落 ESPN 名单，看起来「正常」。

## 修复
1. **squad 拉取**：解析 `afTeamId`（team-id-cache + crests.json）；ESPN 源优先用 ESPN roster；禁止在 ESPN 场景用 tid 直调 AF。
2. **毒缓存**：无 `source` / `afTeamIdUsed` 与当前 AF id 不一致的旧 `teamsquad` 缓存自动作废。
3. **匹配**：`stripNameJunk`、姓+俱乐部精确匹配、阵容 `requireClub`；展示匹配覆盖率（不宣称 100%）。
4. 真匹配失败仍显示「暂无身价」。

## 命中率（prod Asia/Shanghai）
| 球队 | 修复前 | 修复后 |
|------|--------|--------|
| 曼城 ESPN 382 | 0/26 (0%) | **16/27 (59%)** |
| 皇马 ESPN 86 | ~22/35 (~63%) | **22/35 (63%)** |

哈兰德 / 切尔基 / 塞梅诺 / 多库 / 福登 / 姆巴佩 / 维尼修斯 / 贝林厄姆等主力有身价。

## 版本
- versionName **1.9.110** / versionCode **147**
- 合作包 versionName **1.9.110-test**
- `sw.js` VER `jc-v1.9.110`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.110.apk | 6914317 | 5eac497a665b7ba391d5d1f92f04927c |
| jingcai-predict-1.9.110-partner.apk | 6914317 | 6d35e0e3e153152c12a685bd0d5e2a01 |
| jingcai-predict.apk (→正式) | 6914317 | 5eac497a665b7ba391d5d1f92f04927c |

- http://120.77.152.74:8088/jingcai-predict-1.9.110.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.110-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## Smoke
- `/api/team?id=382&squad=1&league=epl` → squadSource=espn，身价匹配 16/27（59%），哈兰德第1
- `/api/team?id=86&squad=1&league=laliga` → 22/35（63%），姆巴佩第1
- 身价榜 / 积分榜未改
