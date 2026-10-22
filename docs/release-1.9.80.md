# 1.9.80 — 用户可见数据源品牌脱敏

## 产品
全站用户端文案去掉数据 API / 供应商品牌点名（API-Football、ESPN、sporttery.cn 域名、DeepSeek、Opta、TheSportsDB 等），改为中性表述（如「综合赛程与技术统计」「综合交锋库」「公开名单」）。**抓取与缓存逻辑不变**，仅展示标签脱敏。

截图类说明示例：
- 「（API-Football，若可用）」→「（若可用）」
- 「近期战绩来自 ESPN 公开赛程」→「近期战绩来自综合赛程」
- 「来自 API-Football 完场技术统计均值」→「来自综合赛程与技术统计均值」

服务端 `lib/scrub-vendor-labels.js` + 前端 `esc()` 二次清洗，覆盖磁盘缓存旧文案。

## Deploy
- `/opt/jingcai` **1.9.80**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.80.apk`（versionCode **117**）

## 验证
- `curl …/api/status` → `1.9.80`
- 公共 JS / 赛况 noteZh：**无** `API-Football` / `ESPN` / `sporttery.cn`（新闻单篇出处名除外）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.80`
- `/api/match-stats` noteZh：**无** `API-Football` / `ESPN` / `sporttery.cn`；含「综合赛程」「综合赛程与技术统计均值」「综合交锋库」
- APK md5 `22de5aab32189ee3c3c9a91a221a896d`；HTTP 200 size **6507887**
- 备份：`/opt/jingcai/backups/v1.9.80-prod-pre-20261018-074453`
