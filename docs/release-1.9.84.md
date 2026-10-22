# 1.9.84 — 首页 Banner 三屏动态海报

## 产品
替换首页轮播为 **3 张动态海报**（自动轮播）：
1. **最近热门未赛**：按联赛优先级取最近即将开赛（或进行中）焦点场，队徽 + 对阵海报，点进赛事详情。
2. **体坛资讯**：最新带图资讯，标题叠在配图上，点进资讯详情。
3. **逆盘命中**：最近「表态命中且赔率热门未中」完场场次海报（比分 + 表态/热门对照），点进复盘。

无数据时各屏有赛程 / 资讯 / 开奖兜底。

## 技术
- `public/app.js`：`homeHeroSlides` / `fillHomeBanners` / `pickHotBannerMatch` / `pickContraBannerHit`
- `public/style.css`：`.bn-slide` / `.bn-bg` / `.bn-poster` 海报层
- SW 缓存加入 hero JPG

## Deploy
- `/opt/jingcai` **1.9.84**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.84.apk`（versionCode **121**）

## 验证
- `curl …/api/status` → `1.9.84`
- 首页 `.banner .hero-slide` 共 3 屏；第 1 屏含对阵、第 2 屏资讯标题、第 3 屏「逆盘命中」

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.84`
- Headless home：3 slides — 英超 利兹联 vs 曼联 21:00；资讯「巴萨官方…」；逆盘命中 马赛 0:1 奥林匹亚
- APK md5 `7a41216e22a92a896f1ebdf13277a4f0`；HTTP 200 size **6516079**；versionCode **121**
- 备份：`/opt/jingcai/backups/v1.9.83-prod-pre-20261018-083600.tgz`
