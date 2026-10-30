# 运营后台 Admin Console v2（1.9.251）

在 v1.9.72 控制台基础上扩展 **监控 / 数据 / 运营 / 系统** 分组导航与五项 P0 能力。入口仍为 `/admin`，鉴权 `ADMIN_PASSWORD` / `ADMIN_TOKEN`。

**1.9.251** 总览页视觉升级：三栏密集布局、KPI 卡片（ sparkline + 周环比 delta ）、归一化叠加面积趋势图、订单构成环形图、告警 chip 与侧栏 active 态 polish；数据仍来自 `/api/admin/dashboard`（新增 `charts.series14d` / `charts.deltas`）。

## 地址

- Web：`/admin/`（静态 `public/admin/`）
- API：`/api/admin/*`（`lib/admin.js`）
- 头条封面公开预览：`/news-covers/`（需登录后拉 `/api/admin/news-covers` 或使用后台「头条封面」）

## 导航与页面

| 分组 | 页面 | 说明 |
| --- | --- | --- |
| 监控 | 总览 | KPI 卡片 + **健康告警条** + **今日待办** + 14 日趋势（面积/柱/环） |
| 监控 | 浏览量 | `app_page_views` 汇总与 Top 路径 |
| 监控 | 赛事健康 | 今日/live 场次、事件滞后、AF 映射样本、球员库缺口 |
| 数据 | 数据浏览 | SQLite 各表行数只读 |
| 数据 | 备份 | 列出 `data/backups/`，一键复制 `jingcai.db` |
| 运营 | 用户 / 订单 / 专栏 | 与 v1 相同 |
| 运营 | 经营 | 付费漏斗、收入窗口、到期会员列表 |
| 运营 | 头条封面 | A/B 预览、锁定入库、驳回/隐藏 |
| 系统 | 功能开关 | 与 v1 相同 |
| 系统 | 审计日志 | `admin_audit_log` 分页筛选 |

## 新增 / 扩展 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/dashboard` | `health`、`pageViews.series14d`、`charts`（14 日合并序列与周环比 delta） |
| GET | `/api/admin/pageviews` | `?day=YYYY-MM-DD` |
| GET/POST | `/api/admin/backups` | 列表 / 创建备份 |
| GET | `/api/admin/data-browser` | 表行数 |
| GET | `/api/admin/membership` | 漏斗 + 收入 + 到期列表 |
| GET | `/api/admin/match-health` | 赛事数据健康报告 |
| GET | `/api/admin/news-covers` | 封面 catalog |
| POST | `/api/admin/news-covers/:slug/lock` | body: `{ variant: "A"|"B", note? }` |
| POST | `/api/admin/news-covers/:slug/reject` | |
| POST | `/api/admin/news-covers/:slug/hide` | |
| GET | `/api/admin/audit` | `?action=&from=&to=&limit=&offset=` |
| POST | `/api/analytics/page-view` | 公开 beacon，body `{ path: "#/home" }` |

## 数据库迁移（部署时自动 `db.js` 执行）

- `app_page_views(day, path, views, uniques, updated_at)` — 若线上仍为旧表 `(day, path, count)`，启动时会 **ADD COLUMN** 并 `count → views`，保留 `count` 列与历史数据；索引 `idx_page_views_day` 在列就绪后创建。
- `admin_audit_log(…)`
- `news_cover_assets(slug, variant, file_path, status, …)`

无需手工 SQL；首次启动新版本 Node 进程即可建表或就地升级。

## 审计埋点

登录/登出、用户封禁与 PATCH、订单标付/取消/退款、功能开关、备份创建、封面锁定/驳回/隐藏、专栏删除。

## 头条封面素材

- 磁盘：`public/news-covers/assets/{联赛}/…-a.jpg` 与 `…-b.jpg`
- 清单：`data/news-covers/manifest.json`（可与磁盘扫描合并）
- 批准后写入 `news_cover_assets` 与 `data/news-covers/active-rotation.json`（供后续 App 轮换接入；**完整头条 CMS 仍待产品迭代**）

## 测试

```bash
node test/admin-251-test.js
node test/admin-250-test.js
node test/admin-249-test.js
```

## 安全

与 v1 相同：管理密码仅环境变量；HTTP 生产环境 Cookie 未 Secure； destructive 操作仍依赖前端 `confirm`。

## v1 文档

仍可参考 `docs/admin-console-1.9.72.md` 中的密码配置与订单 mock 说明。
