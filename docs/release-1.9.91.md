# 1.9.91 — 队标更清晰 + 射手照片补全 + 球队详情赛程/简介

## 产品
1. **队标**：首页热门 / 积分榜 / 球队头图略放大，去掉会糊化的 WebView 对比度渲染，源图仍用 TSDB≈512 / ESPN 500。
2. **数据中心射手/助攻**：缺头像时用公开球员图按 id 回填，减少字母占位（常见五大联赛）。
3. **球队详情**：Tab **赛程 | 简介**。赛程含过去比赛（胜/平/负）+ 未来赛程；简介含成立/主场/地区 + 球队介绍。优先 ESPN 赛程缓存 + TheSportsDB/公开资料补全成立与主场（界面不展示供应商名）。
4. **禁止投注/出票**（不变）。

## 技术
- `public/style.css` / `app.js` `badge`：40/30/72px，intrinsic 160
- `lib/espn-tables.js`：`enrichLeaderPhotosSync` AF id photo fallback
- `lib/league-tables.js`：`fetchTsdbTeamMeta` / `loadEspnTeamFixtures` / `buildIntroZh`；`getTeamDetail` enrich
- SW `jc-v1.9.91`；APK versionCode **128**

## Deploy
- `/opt/jingcai` **1.9.91**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.91.apk`
- 备份：`/opt/jingcai/backups/v1.9.90-prod-pre-20261018-100806.tgz`

## Live verify（2026-10-18 Asia/Shanghai）
- `api/status` → `1.9.91`
- `/api/team?id=88&league=laliga&enrich=1`：founded=1900，venue 有值，recent≥12，upcoming≥1，introZh 有中文导语
- `/api/topscorers?league=laliga`：50/50 有 photo；扎比里/布迪米尔 `af-id-fallback`
- APK md5 `240e22a5c24e2f15665b707bf9e82e00`；size **6569645**；versionCode **128**
