# 运营后台 Admin Console（v1.9.72）

独立 Web 控制台，**仅运营人员**使用，不出现在 App「我的」。无投注/出票能力。

## 地址

- 生产：`http://120.77.152.74:8088/admin`（或 `/admin/`）
- API 前缀：`/api/admin/*`

## 首次配置管理员密码

在服务器 `/opt/jingcai/.env` 增加其一（重启服务后生效）：

```bash
# 任选其一；推荐随机长密码
ADMIN_PASSWORD='请换成足够长的随机串'
# 或
ADMIN_TOKEN='请换成足够长的随机串'
```

生成示例：

```bash
openssl rand -base64 24
```

然后：

```bash
systemctl restart jingcai
```

未配置时：`GET /api/admin/meta` 返回 `configured:false`，登录接口 503。

## 登录与会话

1. 打开 `/admin`，输入 `ADMIN_PASSWORD` 或 `ADMIN_TOKEN`。
2. 成功后下发 **HttpOnly Cookie** `jingcai_admin`，前端同时保存 Bearer token（localStorage）。
3. 会话存 SQLite `admin_sessions`（token 仅存 SHA-256），默认 **7 天**。
4. 非管理员访问受保护接口 → **401**。

与用户端手机号登录完全隔离。

## 模块（v1）

| 模块 | 能力 |
| --- | --- |
| 总览监控 | 版本/uptime、用户/会员/封禁数、订单状态汇总、AF 配额剩余、球员库缺口与最近入库、DeepSeek/AF Key 是否配置、功能开关摘要 |
| 用户管理 | 搜索（手机/ID/昵称）、筛选状态、详情、封禁/解禁（踢会话）、角色 `user/vip/tester`、延长/扣减会员天数 |
| 会员订单 | 列表筛选、标已付（延长会员）、取消待支付、退款标记（默认回退会员天数；mock 无真实退款） |
| 功能开关 | `ai_prematch` / `ai_match_chat` / `ai_review` / `predict_report`，写 `app_flags`，立即影响对应 API |

## 数据库变更

- `users.banned` INTEGER DEFAULT 0
- `users.role` TEXT DEFAULT `'user'`
- 表 `app_flags`、`admin_sessions`

封禁用户：登录与需登录 API 返回 403。

## 安全注意

- 当前生产为 **HTTP :8088**，Cookie 未标 Secure；建议后续 Nginx HTTPS。
- 勿把管理密码提交进仓库；`.env` 权限保持 `600`。
- 登录有 IP 限流（约 15 分钟 20 次）。

## 下一阶段（已知缺口）

- 审计日志（谁改了封禁/订单/开关）
- 订单导出 CSV、批量操作
- AF 配额历史曲线、一键触发球员库 backfill
- HTTPS + 可选 2FA / IP allowlist
- 与 `PLAYER_DB_VIEW_KEY` 球员库入口统一到本后台菜单
