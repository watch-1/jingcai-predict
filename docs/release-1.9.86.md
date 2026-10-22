# 1.9.86 — 资讯轮播用文章封面 + 去掉 Banner/首页条「仅供参考」

## 产品
1. **首页资讯轮播**：背景改用该资讯自身封面图（`thumbFull`/`thumb`，经 `/api/news-image` 全尺寸代理）；无图时回退 `banners/slide-news.jpg`；加载失败 `onerror` 回退设计图。
2. **去掉 Banner 脚注文案「仅供参考」**（三屏 `hero-tip` 全部移除）。
3. **首页「综合情报预测」条**：去掉文末「仅供参考」与重复免责声明行（保留功能说明）。

## 技术
- `public/app.js`：`slideNews` 用 `newsImgSrc(..., 'full')`；home-strip 文案精简
- SW `jc-v1.9.86`
- APK versionCode **123**

## Deploy
- `/opt/jingcai` **1.9.86**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.86.apk`（versionCode **123**）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.86`
- Headless home：资讯屏 `src` 为 `/api/news-image?url=…`（巴萨滞留塞维利亚封面），非 `slide-news.jpg` stadium crop
- Banner 无 `.hero-tip`；home-strip 无「仅供参考」
- APK md5 `5b7c108f3db097b9e86cd967bc048ccc`；HTTP 200 size **6557283**；versionCode **123**
- 备份：`/opt/jingcai/backups/v1.9.85-prod-pre-20261018-085053.tgz`
