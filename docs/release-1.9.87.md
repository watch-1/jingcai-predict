# 1.9.87 — 赛程标题/日期横滑 + 资讯封面补全

## 产品
1. **赛程 Tab 顶栏标题**：由「比分」改为「赛程」，与底栏一致，居中显示。
2. **日期时间轴横滑**：修复主题水印样式把 `.dstrip` 设为 `overflow:hidden` 导致无法横向滑动的问题；恢复 `overflow-x:auto` + 触控惯性滚动。
3. **资讯列表缺封面**：中新网/人民网 RSS 常无 enclosure。服务端刷新后后台抓取正文页封面（og / `left_zw` 首图），写入列表 `thumb` + 磁盘/代理缓存；扩大图片 CDN 白名单（`image.chinanews.com`、`cnsimg.net`、`cns.com.cn` 等）；客户端无图/加载失败回退设计图 `banners/slide-news.jpg`。

## 技术
- `public/app.js`：`TITLES.schedule` / `pageSchedule` hdr →「赛程」；`newsCard` / `newsImgOnError('news')` 回退
- `public/style.css`：`.dstrip` 与水印规则解耦，保留横滑
- `lib/news.js`：`extractCoverFromHtml`、`fillMissingCnThumbs`；`mapListItem` 读文章缓存补封面；cover-only stub 不阻断正文抓取
- `server.js`：`NEWS_IMG_HOST_RE` / 路径白名单扩展
- SW `jc-v1.9.87`
- APK versionCode **124**

## 后续建议（更深赛前情报源，本版未实现）
可在后续版本接入/加深，不必阻塞本版：
1. **伤停权威源**：联赛官方/俱乐部伤报、Transfermarkt 伤停页（需配额与中文映射），补「暂无伤停」空洞。
2. **预期阵容**：赛前 24–48h 预期 XI（AF/ESPN predicted lineups）与已有阵容 Tab 合并展示。
3. **天气/球场**：开球地天气、草皮/球场因素短讯（对定位球/传中型球队有用）。
4. **裁判倾向**：主裁近期黄牌/点球率（公开统计），作风险提示而非断言。
5. **盘口异动时间线**：开售→临场欧赔/即时变化摘要（需合规许可的公开赔率快照）。
6. **媒体赛前瞻**：懂球帝/权威媒体「赛前瞻」摘要入库，与自有 evidence 并列、标明出处。

## Deploy
- `/opt/jingcai` **1.9.87**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.87.apk`（versionCode **124**）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.87`
- Headless `#/schedule`：顶栏 h1=「赛程」、`.hdr.center`、`text-align:center`；`.dstrip` `overflow-x:auto`、`scrollWidth 722 > clientWidth 390`（可横滑）
- `#/news`：中新网条目封面经 `/api/news-image` 加载成功（`naturalWidth` 700）；force 刷新后后台补封面，约数秒内 top 列表缺图归零
- `/api/news-image` 中新网 `i2.chinanews.com.cn/simg/ypt/…` → HTTP 200、`X-News-Image-Cache: hit`
- APK md5 `f0a136b8a8d8fdc944514d0dcaa9778e`；HTTP 200 size **6561379**；versionCode **124**
- 备份：`/opt/jingcai/backups/v1.9.86-prod-pre-20261018-085944.tgz`
