# 1.9.116 — 身价排名「匹配 n/m」但顶栏全暂无

## 现象
球队详情「身价排名」头栏「身价匹配 23/34 (68%)」/「17/28 (61%)」，但 #1–#7 全是「暂无」，并按中文名排序（阿利松、阿纳斯塔西奥斯·多维卡斯…）。

## 根因
1. **主因（1.9.112 照片后台 enrich）**：`scheduleSquadPhotoEnrich` 把无 `marketValueEur` 的 `teamsquad` **整表替换**进 `teamfull.squad`，抹掉身价字段，却保留 `squadMarketCoverage`。UI 显示「匹配 n/m」，按缺失 eur 中文名排序 → 暂无置顶。
2. **次因（匹配）**：阿利松在索引为单名 `Alisson`；斯米卡斯索引在罗马且正式名 Konstantinos；`requireClub` 拒转会漂移。

## 修复
1. 照片 enrich：**合并 photo**，禁止整表替换；合并后 `enrichTeam`。
2. `cloneAssembled`：每次下发同步 re-enrich；coverage>0 但全无 eur 时就地治愈。
3. 匹配：单名球星、diminutive（Kostas↔Konstantinos）、唯一姓氏允许俱乐部漂移。
4. 客户端：拒绝脏身价写入/绘制 LS。

## 版本
- versionName **1.9.116** / versionCode **153**
- 合作包 versionName **1.9.116-test**
- `sw.js` VER `jc-v1.9.116`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.116.apk | 7706054 | 735ed5a5efc5157dcff166b63fea8691 |
| jingcai-predict-1.9.116-partner.apk | 7706054 | b77561254c47a32cddeccc926f06feee |
| jingcai-predict.apk (→正式) | 7706054 | 735ed5a5efc5157dcff166b63fea8691 |

- http://120.77.152.74:8088/jingcai-predict-1.9.116.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.116-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.116**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.115-prod-pre-20261022-033420.tgz`
- 已清 `detail-teamfull-*.json` 组装缓存（下次按新逻辑 enrich）

## Smoke (prod Asia/Shanghai)

### 利物浦 ESPN 364 — before → after
| | before (截图/擦除态) | after 1.9.116 |
|--|--|--|
| 匹配 | 23/34 (68%)，顶栏全暂无 | **31/34 (91%)** |
| #1 | 阿利松·… 暂无 | 索博斯萊·多米尼克 **1亿欧** |
| #2 | （中文名序）暂无 | 弗洛里安·维尔茨 **1亿欧** |
| 阿利松 | 暂无（顶栏） | **1500万欧** #18 |
| 维尔茨 | 暂无（顶栏） | **1亿欧** #2 |
| 基耶萨 | 暂无 | **1300万欧** #21 |
| 斯米卡斯 | 暂无 | **450万欧** #24 |

### 曼城 382
哈兰德 **2亿欧** #1；匹配 19/27 (70%)；暂无仅末尾。

### 科莫 2572
尼科·帕斯 **8000万欧** #1；多维卡斯 **2500万欧** #9；匹配 24/28 (86%)（截图曾 17/28 顶栏全暂无）。

### 中游 伊普斯维奇 373
匹配 24/29；顶栏均为 €，暂无在底。
