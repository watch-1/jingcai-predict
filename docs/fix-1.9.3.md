# 1.9.3 修复：开奖页无法返回 + 阵容改用 ESPN 名单

## 1) 开奖页返回失效
**根因**
- `#/results` 不在 `TABS`，所以底部栏被隐藏（按子页面处理）；但 `pageResults` 的头部写了 `hdr('开奖', { back: false })`，页面上也没有返回按钮，用户被困在这一页。
- Android 返回键走 `window.__appBack → back()`，`back()` 靠 `S.navDepth` 计数器：`hashchange` 前进和后退都会 +1，`back()` 里 -2 再 `history.back()`，`go(h, true)`（replaceState）也不计入，计数会漂移。一旦 navDepth ≤ 0 或与 WebView 历史不一致，就会出现返回无反应或跳错页。

**修复（public/app.js）**
- 用显式页面栈 `NAV` 代替 navDepth：`hashchange` 时，如果新 hash 等于栈中上一项就视为后退（pop），否则入栈。`back()` 直接 `replaceState` 到上一项并重新渲染，不再依赖 WebView 的 `history.back()`。`go(h, true)` 只替换栈顶。
- `__appBack`：弹窗/底部面板优先关闭；不在首页时 `back()` 回到上一页，没有上一页就回首页；在首页返回 0，原生层 `finish()` 退出（行为同旧版，原生代码未改）。
- 开奖页头部恢复返回按钮。
- 冷启动直接进子页（WebView 恢复状态）时，栈底会预置 `#/home`。

**验证**（headless Chrome，对线上执行）：首页→开奖→返回=首页；赛程→开奖→数据，依次返回：开奖→赛程→首页→（返回 0 = 退出）。

## 2) 阵容（LASK 无阵容、利物浦 9 人）
**根因**：只有 TheSportsDB 免费档（名单常不全，LASK 映射不到），AF 回退又因账号 suspended/免费档不可用。

**修复**
- `lib/espn-form.js` 新增 `fetchRoster`：`/{league}/teams/{id}/roster`，复用 1.9.2 的球队映射，缓存 24h（`data/live-stats/espn/roster/`）；`findRosterPlayer` 供球员详情使用。
- `lib/squad.js`：`loadSquad` 先取 ESPN（人数 ≥12 才采用），否则回退原 TSDB → AF 逻辑（`loadSquadLegacy`）。字段包括号码、位置、国籍、出生日期、年龄、身高（英寸换算成 cm）、头像（如有）、本赛季出场/进球/助攻、伤病标记。中文名沿用 `_namezh`（按英文名匹配），`/api/squad-zh` 的维基补全照旧。
- 球员 id 为 `espn:<id>`；`/api/player` 支持从名单缓存出详情卡。
- `lib/match-stats.js` 导出 `espnCandidates`。

**验证（线上）**
- LASK林茨：espn，28 人（有头像 4 人）
- 利物浦：espn，33 人（已有中文名 11 人，其余由 squad-zh 异步补）
- 抽样 40 支近期竞彩球队：ESPN 30、TSDB/其他 4、无阵容 6（藤枝MYFC、布城、沙特/卡塔尔/智利球队等，ESPN 未收录）

## 限制
- ESPN 头像覆盖率低（多数球员没有 headshot），前端照旧显示占位图。
- 日职乙、韩K、沙特、卡塔尔等联赛 ESPN 未收录，这些队仍走 TSDB/AF，可能不全或为空。
- ESPN 为非官方接口；请求失败时先用上次的名单缓存（不限时长），没有缓存则回退原数据源。

## APK
`dist/jingcai-predict-1.9.3.apk`（versionCode 43）→ http://120.77.152.74:8088/jingcai-predict-1.9.3.apk；`jingcai-predict.apk` 已同步替换。

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.3-prod-pre-20261014-183753
cp -a $B/package.json /opt/jingcai/ && cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
本地备份：`backups/v1.9.3-pre-20261014-183658`
