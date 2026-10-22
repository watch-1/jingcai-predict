# 竞彩预测 v1.9.85（用户端）

竞彩足球 **赛事资讯 + 赔率概率预测** App：Node/Express 后端 + 静态前端（网页 / PWA）+ Android WebView APK。

> **硬性边界**：本项目**禁止**投注、下单、出票、购彩代下/代购/发单/跟单，也不会把方案发送给任何彩票店。
> **资讯会员**（v1.9.0）：定位为资讯/高级数据订阅；当前为 **mock 模拟支付**（不真实扣款），正式微信/支付宝须商户与类目审核后再接。
> 「保存方案」只是用户的个人记录（游客存本机，登录用户同步到自己的账号）。页脚固定显示：**仅供参考，理性购彩 · 本站不提供投注服务**。

## 功能

| 模块 | 内容 |
| --- | --- |
| 首页 | 轮播 Banner（`public/banners/*.jpg`，由 `tools/make-banners.js` 生成）、快捷入口（含资讯）、今日高信心预测、热门赛事、足球资讯摘要 |
| 赛程/比分 | 实时比分列表：日期条 + 热门/关注/全部 + 进行中/未开始/已结束筛选 + 联赛标签；进行中显示分钟与比分，完场显示终场，未开赛显示开球时间；短 TTL 批量拉取 sporttery 直播分（可叠加 API-Football live=all）；点击进详情；赔率在详情/预测页 |
| 赛事详情 | 情报 Tab：交锋/战绩表（近5/近10、主客筛选）+ 后续赛程卡片 + 赔率摘要；数据 Tab：绿茵屏；聊球/阵容/预测保留；关注按钮 |
| 预测 | **赛前情报简报**（背景/战绩进失球/交锋/伤停若有/日程 + 赔率参考项）+ 高信心 2串1 + 卡片；按信心排序（稳胆 ≥60% / 倾向 45–60% / 谨慎 <45%）；按场次磁盘缓存 |
| 开奖 | 按日期 + 联赛查看赛果、胜平负/让球结果、赔率热门命中统计 |
| 数据中心 | 底栏「数据」：五大联赛等积分榜 / 射手榜 / 助攻榜（真实队徽/头像经 `/api/logo` 代理缓存；点击进球队/球员详情；球队/球员页展示参考身价；API-Football 磁盘缓存约 6 小时；免费档为最近可用赛季） |
| 我的 | 头像/昵称、**会员中心**（月/季/年套餐、权益、模拟支付、订单）、我的方案、我的关注、个人资料、修改密码、设置 |
| 账号 | 手机号 + 密码注册/登录，**未接入短信验证码**（没有短信服务商，故不做假验证码）；游客浏览；注册需勾选协议 |

UI：蓝色体育风、底部 5 Tab（首页/赛程/预测/数据/我的；开奖仍可从首页快捷入口进入）、紧凑专业排版与卡片层级、预测页富文本卡片（模型说明/赔率解读/信心条）、骨架屏与空状态、彩色队徽；移动优先，宽屏居中 720px 版心、列表两栏。

## 后端 / 接口

- 数据：`GET /api/matches`、`GET /api/results`（代理 sporttery.cn，缓存 3 分钟；不可达时返回明确标注的示例数据）、`GET /api/status`
- 资讯：`GET /api/news`（体坛资讯页「国内｜外网」切换；默认国内：懂球帝 + 中新网/人民网；`?lang=en` 外网足球 RSS：天空体育/BBC/卫报/ESPN；缓存约 20 分钟，`?q=队名` 筛选；**持久存档**：每次抓取写入 SQLite + `data/news/archive-*.json`，`?before=`/`?offset=` 分页「加载更早」；配图磁盘缓存有数量/体积上限）、`GET /api/news/:id`（详情：服务器抓取正文并缓存；外网失败则摘要；存档可回看；配图走代理）、`GET /api/news/:id/translate`（外网一键译中文：MyMemory+重试/分块+有道备用，按文章 id 缓存）、`GET /api/news-image`（资讯配图代理，含外网 CDN，自动淘汰旧图）
- 聊球：`GET /api/match-chat?matchId=`（短轮询，`afterId` 增量）、`POST /api/match-chat`（登录，限流）、`GET /api/match-chat/stream`（SSE）
- 数据中心：`GET /api/leagues`、`GET /api/standings?league=epl|39`、`GET /api/topscorers`、`GET /api/topassists`、`GET /api/team?id=`、`GET /api/af-player?id=`（队/人详情含参考身价 `marketValue`；身价索引见 `GET /api/market-value-status`；榜单缓存约 6 小时；队徽/头像走 `/api/logo`）
- 实时比分（赛程页）：`GET /api/live-scores?ids=`（sporttery `getMatchLiveV1` 批量，缓存约 45 秒；可选叠加 API-Football `/fixtures?live=all` 一次请求补分钟，依赖已有 fixture-map）
- 综合预测简报：`GET /api/predict-report?matchId=`（赛前情报长文 + 结构化结论，磁盘缓存）；配额策略 `GET /api/predict-quota`
- 绿茵屏：`GET /api/live-stats` 附带 `events`（API-Football fixtures/events，重缓存；无真实球轨迹）
- 账号（JSON，`Authorization: Bearer <token>`）：
  - `POST /api/auth/register {phone,password,nickname?,agree:true}`、`POST /api/auth/login`、`POST /api/auth/logout`
  - `GET/PATCH/DELETE /api/me`（DELETE 需 `{password}`，级联删除方案/关注/会话/会员订单）、`POST /api/me/password`；`user` 含 `memberActive` / `memberUntil`
  - `GET/POST /api/plans`、`DELETE /api/plans/:id`；`GET /api/favorites`、`PUT/DELETE /api/favorites/:matchId`
  - `POST /api/sync {plans,favorites}`：登录后把游客本机数据合并进账号
- 资讯会员（mock，详见 `docs/membership-mock-1.9.0.md`）：
  - `GET /api/membership/plans`、`GET /api/membership/status`
  - `POST /api/membership/orders` → `POST /api/membership/orders/:id/pay`（模拟确认）
  - `GET /api/membership/orders`；正式回调 `POST /api/membership/notify/:provider` 预留（501）
- 存储：SQLite（better-sqlite3），`$DATA_DIR/jingcai.db`（生产：`/opt/jingcai/data`）；`users.member_until` + `membership_orders`

- 安全：scrypt 加盐哈希（Node 内置 crypto）；随机 256-bit 会话令牌，服务器只存 SHA-256，30 天有效，退出/改密/注销即失效；
  登录限流（每 IP 15 分钟 30 次；同一手机号连续 5 次密码错误锁定 15 分钟）、注册限流；手机号/密码/昵称/头像/方案大小校验；
  令牌走 Header 不用 Cookie，所以 CORS `*` 安全（APK 的页面源是 `https://appassets.androidplatform.net`）。
  限流计数在内存中，服务重启会清零。

**运营后台**（v1.9.72）：`/admin` 独立暗色控制台（用户/订单/功能开关/监控），密码见服务器 `.env` 的 `ADMIN_PASSWORD`，文档 `docs/admin-console-1.9.72.md`。与 App「我的」隔离。

球迷专栏（1.9.75）：`#/column` sticky pastel 专栏；可选胜平负表态关联 matchId，完场后自动结算，作者卡展示真实近N中M/连红（无结算则不展示）。内容仅供参考；付费帖已上线。运营删帖见 `/admin`「专栏管理」。

球员库只读浏览（`/db/players`、`/api/player-db/*`）为**内部自用工具**（自 1.9.63）：不出现在「我的」菜单；须环境变量 `PLAYER_DB_VIEW_KEY`（`?key=` / `X-Player-Db-Key`）；未配置则 404；手机登录无效。 自 1.9.64 起用户端「近期复盘」列表移除；1.9.65 起指标对照/硬仗检验结构化入库，预测优先读库，表态命中等事实迁入 `match_outcomes`，仅内部球员库可见。

## 部署（当前服务器 120.77.152.74）

```bash
# 服务器：/opt/jingcai，systemd 服务 jingcai，端口 8088，数据 /opt/jingcai/data
cd /opt/jingcai && npm install --omit=dev --registry=https://registry.npmmirror.com   # better-sqlite3 在服务器上源码编译（需 gcc/make/python3，约 2 分钟）
systemctl restart jingcai && systemctl status jingcai
```
systemd 单元包含 `Environment=PORT=8088`、`DATA_DIR=/opt/jingcai/data`、`NODE_ENV=production`。升级时不要删除 `data/`。
外网资讯：在可访问 Sky/BBC/Guardian/ESPN 的机器（如本 box）定期执行 `DATA_DIR=/opt/jingcai/data npm run prefetch:en`，
再把 `data/news/` 与 `data/news-images/` 同步到阿里云；国内手机只请求 `120.77.152.74`，不直连外网。
阿里云本身可刷新天空体育 RSS/正文；ESPN 等若被墙则依赖上述预取缓存，失败时详情页显示摘要。
新服务器可解压 `dist/tiicai-site-server.zip` 后按上面步骤安装。建议后续配置 HTTPS（Nginx 反代 + 证书）——HTTP 明文传输密码和令牌存在被窃听风险。

## APK

```bash
API_BASE=http://120.77.152.74:8088 ./android/build-apk.sh     # 默认即此地址；VERSION_NAME=1.9.0 VERSION_CODE=41
# 输出 dist/jingcai-predict.apk，使用 android/release.keystore 签名（与旧版相同密钥，可覆盖安装）
```
API 地址在构建时写入 `www/config.js`，APP 内**没有**服务器地址设置。网页版同源调用 `/api`。

## 测试

```bash
node test/parse-test.js                               # 上游数据解析
node test/api-test.js http://120.77.152.74:8088       # 账号 API 全流程（自动创建并删除测试账号）；TEST_RATE_LIMIT=1 额外测锁定
node test/membership-test.js http://120.77.152.74:8088 # 会员套餐/mock 支付/续费/正式接口预留
node tools/ui-test.js http://120.77.152.74:8088       # 无头 Chrome 全流程 + 截图 screenshots/v2-*.png（自动注销测试账号）
node tools/test-app-bundle.js                         # APK 前端包（app 源）跨域访问 + PWA（需本地 PORT=8090 的 server.js）
```


## 赛程过滤规则（防漏场）

- 列表按 **竞彩期次日**（`businessDate` / 周几NNN）分组，不是开球日历日。凌晨场（如 `10-13 03:00`）仍归销售日（如 `10-12`）。
- 频道默认 **「全部」**（1.8.2 / 1.8.9 再次迁移 `jc_sch_ch_v3`）：展示该销售日全部竞彩足球场次，不按联赛丢弃。
- **「热门」** = `LEAGUE_PRIO` 白名单（五大联赛、欧战含欧协联、亚冠、中超、英冠、荷甲、葡超等）；长尾联赛（瑞超/挪超/巴甲/法乙等）会隐藏，UI 明示「已隐藏 N 场」并可一键「查看全部」。
- **「关注」** = 用户收藏；同样显示隐藏条数。
- **开赛后补全（1.8.9）**：sporttery `getMatchListV1` / 计算器在开球后会丢掉该场；服务端用赛果窗口（含未完场）+ `data/schedule-seen.json` 磁盘缓存回填，保证 `周几001…NNN` 不断号。`meta.backfill` / `meta.gaps` + 日志 `[schedule] backfill` / `MATCH NUM GAPS`。
- 服务端 `/api/schedule`、`/api/matches` 的 `meta.total` / `meta.byBusinessDate` 与冒烟 `node tools/smoke-schedule-filter.js http://120.77.152.74:8088 [YYYY-MM-DD]`（断言当日编号无缺口、含 001）。
- 预测页仍用 `/api/matches`（计算器在售），与赛程全量列表分离，避免误滤。

## 限制

- 无短信验证码，因此无法自助找回密码（「忘记密码」提示联系客服）；如需找回，需接入短信服务商后再实现。
- 当前为 HTTP；密码与令牌明文传输，建议尽快上 HTTPS。
- 用户协议 / 隐私政策为**模板文本**，需店主按实际主体与法规修改。
- 预测详情为服务端综合情报简报（本地历史战绩/交锋；交锋本地空时回落 API-Football headtohead 并磁盘缓存 + 积分榜缓存 + 可选 API-Football 伤停 + 官方赔率参考）；缺数据明示「暂无可靠来源」，不编造伤停/比分/新闻。列表未展开时可能仍显示赔率参考摘要。
- API-Football 免费档约 100 次/日：报告按场次缓存（默认 4h，临近开球 90min）；伤停按 fixture 缓存 6h；H2H 缓存≥24h；积分榜复用 6h 缓存；见 `GET /api/predict-quota`。
- 「热门赛事」按联赛优先级 + 开赛时间排序，不代表真实热度统计。
- iPhone 离线（Service Worker）仅在 HTTPS 下生效。
