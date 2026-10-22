# 1.9.85 — 首页 Banner 设计图替换（去玻璃柱/球）

## 产品
首页轮播背景替换为设计图，去掉抽象玻璃柱/金属球：
1. **今日热门**：`banners/slide-hot-match.jpg`（球场夜景）
2. **体坛资讯**：`banners/slide-news.jpg`（夜景加深裁切，适合标题叠字）
3. **逆盘命中**：`banners/slide-contra.jpg`（青绿数据/对勾分析风）

海报文案层与对阵/资讯/逆盘逻辑不变；仅背景与遮罩微调。

## 技术
- `public/banners/slide-*.jpg` 新资源；旧 `hero-data-luxury.jpg`（玻璃柱）已覆盖
- `public/app.js`：`BN_HOT` / `BN_NEWS` / `BN_CONTRA`
- `public/style.css`：`.bn-shade*` 减轻叠色，保留左侧可读区
- SW `jc-v1.9.85` 预缓存新 JPG

## Deploy
- `/opt/jingcai` **1.9.85**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.85.apk`（versionCode **122**）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.85`
- Banner BGs：`slide-hot-match.jpg` / `slide-news.jpg` / `slide-contra.jpg`（HTTP 200）
- Headless DOM：3 屏 src 分别为 stadium / news-dark / teal-analytics；无玻璃柱 `hero-data-luxury` 抽像背景
- APK md5 `e7a022c26d696b11ac572dc07bcf9f14`；HTTP 200 size **6557283**；versionCode **122**
- 备份：`/opt/jingcai/backups/v1.9.84-prod-pre-20261018-084356.tgz`
