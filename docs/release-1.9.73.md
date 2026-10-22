# 1.9.73 — 球迷专栏（真实用户 · 无假荐彩指标）

## 产品
灵感来自澳客严选「专栏作者」墙 +「比赛态度 / 互动」信息流，但**不是荐彩号**：

- 登录用户可开通个人专栏：简介、话题标签（首发 / 伤停 / 战报 / 赛况 / 分析 / 闲聊）
- 发帖：比赛态度（须关联 matchId）或互动（综合讨论）
- 首页 / 专栏页 2×2 作者墙；Feed 双 Tab「比赛态度」「互动」
- **明确不做**假「连红」「单选比例」等命中率徽章；仅展示真实 **阅读 / 点赞**
- 作者可删自己的帖；运营可在 `/admin` →「专栏管理」删帖；封禁仍走用户管理

## 打开方式
- App / 网页：底部快捷入口旁的 **首页「专栏」**，或「我的 → 球迷专栏」，路由 `#/column`
- 编辑资料：`#/column/edit`；发帖：`#/column/compose`
- 运营：`http://120.77.152.74:8088/admin` → 专栏管理

## API（前缀 `/api`）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/column/meta` | 话题与 Tab 说明 |
| GET | `/column/authors` | 作者墙 |
| GET | `/column/authors/:userId` | 作者主页 |
| GET/PUT | `/column/me` | 我的专栏资料（需登录） |
| GET | `/column/feed?tab=attitude\|interact` | 信息流 |
| POST | `/column/posts` | 发帖（轻量限流） |
| DELETE | `/column/posts/:id` | 作者删帖 |
| POST/DELETE | `/column/posts/:id/like` | 点赞 |
| GET/DELETE | `/admin/column/posts` | 运营列表 / 删帖 |

## 数据库
`column_profiles` · `column_posts` · `column_likes`（SQLite，生产 `/opt/jingcai/data/jingcai.db`）

## 容量（2C2G 阿里云）
约 **1000 注册 / 轻量并发浏览**可接受。写密集同时发帖时 SQLite 写锁与单机内存可能成为瓶颈——后续可加 Redis 缓存 Feed、或升配；v1 已对发帖做每分钟/每小时限流。

## 验证
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.73`
- `node test/column-test.js http://120.77.152.74:8088`
- Feed / meta 响应中**无** `连红` / `单选比例` / 命中率字段

## Deploy
- `/opt/jingcai` **1.9.73**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.73.apk`（versionCode **110**）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.73`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/meta` noteZh 含「不提供连红」；响应无 hitRate / winStreak / 单选比例字段
- APK md5 `419353d1f1b5356a73727e8d5fe95d39`；HTTP 200 size **6495599**
