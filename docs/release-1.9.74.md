# 1.9.74 — 球迷专栏 UI：澳客严选 pastel 对齐

## 产品
专栏路由 `#/column` 视觉对齐澳客严选「严选」页（浅色 pastel），**不再**跟绿茵沉浸（pitch）深蓝绿 pill 空态：

- 软 pastel 渐变底（橙/粉/绿 wash）
- 圆角搜索栏「请输入查询的内容」（本地过滤 Feed）
- 「专栏作者」白底 2×2 墙；无作者时保留虚位以待 chrome（首发紫/伤停橙/战报绿/赛况蓝）
- Tab「比赛态度 | 星球互动」：橙色下划线（**不用** `.dtabs` / pitch 翠绿胶囊）
- Feed 白卡片；关联比赛为灰色 chip；仅真实阅读/点赞（无连红/单选比例/已购/价格）
- 空态：浅色卡片 + 文档图标 +「暂无内容」+ 发帖 CTA

硬边界不变：禁止投注/出票；不做假荐彩指标。

## CSS / 布局 vs 1.9.73
| 之前 | 之后 |
| --- | --- |
| 共用 `.dtabs`，pitch 下成深绿胶囊 Tab | 独立 `.col-tabs`，橙下划线 |
| pitch 整页深蓝空态 | `.col-page` 强制浅色 pastel 岛（hdr 可仍跟壳） |
| 作者区散落卡片 / 一句空提示 | 白圆角墙卡片 + 2×2；空时虚位以待 |
| 比赛标签用主题蓝 | 灰色 chip |
| 无搜索 | 顶部圆角搜索 |

## Deploy
- `/opt/jingcai` **1.9.74**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.74.apk`（versionCode **111**）

## 验证
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.74`
- `node test/column-test.js http://120.77.152.74:8088`
- 网页 / APK 打开 `#/column`：浅色 pastel，橙 Tab，作者墙 chrome

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.74`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/meta` tabs 含「星球互动」；noteZh 含「不提供连红」
- 静态 `style.css` 含 `.col-page` / 橙 `#ff7a1a`；`app.js` 含「请输入查询的内容」「虚位以待」
- APK md5 `bcb6f13443755b3eedc028403cc02104`；HTTP 200 size **6495599**
- 备份：`/opt/jingcai/backups/v1.9.74-prod-pre-20261018-063558`
