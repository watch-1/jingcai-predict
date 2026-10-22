# 1.9.90 — 首页轮播体坛新闻改用今日爬取资讯（排除战报切片）

## 产品
1. **首页轮播「体坛新闻」**：从今日爬取的足坛资讯中**随机**选取（懂球帝等），不再用平台/懂球帝「战报bot」比赛切片（阵容图+技术统计条）。
2. 点击进入正常资讯详情（可读正文），不是切片数据页。
3. 仍不显示来源徽章（1.9.89）。三 slide 结构不变：热门赛事 | 体坛新闻 | 逆盘命中。
4. **禁止投注/出票**（不变）。

## 技术
- `lib/news.js`：Dongqiudi 解析写入 `authorName` / `matchSlice`；`mapListItem` 透出
- `public/app.js`：`pickHomeBannerNews` — 过滤战报切片/个人集锦/非足球，优先今日+封面，随机一条；`/news?limit=50`
- SW `jc-v1.9.90`；APK versionCode **127**

## Deploy
- `/opt/jingcai` **1.9.90**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.90.apk`（versionCode **127**）
- 备份：`/opt/jingcai/backups/v1.9.89-prod-pre-20261018-094949.tgz`

## Live verify（2026-10-18 Asia/Shanghai）
- `curl …/api/status` → `version: 1.9.90`
- `/api/news?refresh=1`：`authorName`/`matchSlice` 已写入；纽约城战报 `matchSlice=true` 被排除
- 今日可随机池约 14 条（例：大马丁术后报平安、哈兰德纪录、喀什杯等）
- 样例详情无「球队阵容」「技术统计」切片块，正文可读
- APK md5 `2c686a919e74875f724daa3aceb9d9c0`；size **6569645**；versionName **1.9.90** versionCode **127**
