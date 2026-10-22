# 1.9.111 — 数据中心球队阵容球员照片

## 根因
1.9.110 为修 Vitebsk 错队，球队阵容改为优先 **ESPN roster**（正确俱乐部）。但 ESPN soccer roster API 几乎不返回 `headshot`（曼城 1/27），UI 只剩字母占位。

AF `/players/squads` 有完整 `photo`（media.api-sports.io），且 AF team id ≠ ESPN team id（曼城 AF=50 / ESPN=382），不能把 ESPN athleteId 当成 AF player id 拼图片 URL。

## 修复
1. **`enrichSquadPhotos`**：在 ESPN（或其它）阵容上按 **姓名 / 球衣号** 合并 AF 照片；禁止 ESPN id → AF `/players/{id}.png`。
2. 次选本地 TSDB / squads 照片索引；少量缺口再 TSDB 搜索。
3. 阵容磁盘缓存照片命中率 &lt; 85% 时自动补齐并回写缓存（打开球队页即可暖图）。
4. 保留 1.9.110 的 AF id 解析 / 毒缓存作废 / 身价排名逻辑。
5. `start.sh` 改为 source `.env`（仍推荐 `systemctl restart jingcai`）。

## 照片命中率（prod Asia/Shanghai）
| 球队 | 修复前 | 修复后 |
|------|--------|--------|
| 曼城 ESPN 382 | **1/27 (4%)** | **26/27 (96%)** |
| 皇马 ESPN 86 | 26/35 (74%) | **33/35 (94%)** |
| 阿森纳 / 切尔西 | — | **100%** |

身价匹配率不变：曼城 16/27（59%），哈兰德仍第1。

## 版本
- versionName **1.9.111** / versionCode **148**
- 合作包 versionName **1.9.111-test**
- `sw.js` VER `jc-v1.9.111`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.111.apk | 6914391 | 70c42b3817a1cf536df6da7a67934ac6 |
| jingcai-predict-1.9.111-partner.apk | 6914391 | e2a4a1f90ac14e6830fe4fea97ceebb0 |
| jingcai-predict.apk (→正式) | 6914391 | 70c42b3817a1cf536df6da7a67934ac6 |

- http://120.77.152.74:8088/jingcai-predict-1.9.111.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.111-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## Smoke
- `/api/team?id=382&squad=1&league=epl` → squadSource=espn，照片 26/27，多数 `photoSrc=api-football`
- 身价榜 / 1.9.110 roster 正确性未回退
