# 1.9.158 — 冷启动知识库/首页态度竞态修复

## 现象

1. 冷启动进入「我的知识库」先显示「暂无知识」，稍后才有真实知识包（如 AC米兰）。
2. 从知识库返回首页时出现旧版黄条「网络不可用，显示上次缓存的数据…」，「比赛态度」长时间骨架或无内容。

## 根因

| 问题 | 根因 |
|------|------|
| 知识库首屏空态 | `S.kb.packs === null`（未拉取）被当成 `[]` 渲染空态；`ensureKbRouteData()` 在 `pageKbHome()` **之后**才跑，`loading` 首帧为 false；无本地快照，只能等网络。 |
| 首页黄条 | `jc_home_snap_v1` 仍可能恢复 **1.9.156 及更早** 写入的 HTML（含离线黄条）；1.9.157 已不再生成该文案，但 snap 未失效。 |
| 比赛态度骨架 | 冷启动恢复 home snap 时 **未调用** `fillHomePlatformAttitude()`；snap 在专栏作者已加载、态度仍为 `ha-skel` 时仍可能被持久化；网络失败时无上次 feed HTML 兜底。 |

## 修复

### 知识库
- 登录用户将 `/kb/packs` 列表缓存到 `jc_kb_packs_v1`（按 `user.id`），启动与进页前 `hydrateKbPacksCache()`。
- `packs == null` 视为**加载中**（骨架），仅 `packs === []` 且非 loading 才显示「暂无知识」。
- `render()` 在生成 KB HTML **之前**同步 `hydrateKbPacksCache()` + `ensureKbRouteData()`。

### 首页
- Home snap 版本升至 **ver 2**：拒绝/不持久化含「网络不可用」或 `ha-skel` 的 HTML；恢复时剥离遗留 warn-bar。
- 冷启动 snap 恢复后补调 `fillHomePlatformAttitude()`。
- 平台态度 feed 成功渲染后写入 `jc_home_att_v1`；请求失败时优先展示缓存 HTML，静默重试。

## 版本

- Web / `config.js` / `sw.js`：**1.9.158**（`jc-v1.9.158`）
- `VERSION.txt`：**1.9.158** / **VERSION_CODE=195**
- Android 默认：`VERSION_NAME=1.9.158`、`VERSION_CODE=195`

## 验证

1. `node test/cold-start-158-test.js`
2. `npm test`（或至少 kb + column 相关用例）
3. 手动（Android / PWA）：
   - 已登录且已有知识包 → 杀进程重开 → 进「我的知识库」应**首屏即见列表**（可先本地再刷新）。
   - 杀进程重开首页 → 无「网络不可用」黄条；「比赛态度」应显示上次内容或预测兜底，而非长期骨架。
   - 确认无网时也不**假造**知识包（仅展示曾同步过的列表）。
