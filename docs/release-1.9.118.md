# 1.9.118 — 球队详情赛程 → 赛事详情 + 日期 undefined 修复

## 需求
用户：「需要个功能，能够从数据中心点击过去比赛或者未来赛程可以进入到该场对局的界面，也就是类似图2」
- 图1：球队详情 · 赛程（未来赛程 / 过去比赛）
- 图2：赛事详情（比分板 + 情报/态度/赔率/数据/事件/阵容/赛后复盘）
- 顺带修赛程卡片日期行出现 `undefined`（如 `/2/26 undefined 19:30`）

## 改动
### 导航（复用现有 `#/match/:id`，不新做详情页）
- `public/app.js`：`fxRowHtml` 改为可点 `button.det-fx-go` + `data-go`
- `resolveFxMatchHref` 解析目标 id：
  1. 服务端附带的 `matchId` / `sportteryMatchId`（竞彩数字 id，或 fixture-map 里的 `af:` 壳）
  2. 客户端 `matchFxAgainstPools`：按北京日历日 + 队名对 `schedule/matches/results` 模糊匹配
  3. 否则 `af:` / `espn:` / `fx:` 薄壳（`stashFxShell` + sessionStorage），`pageMatch` 可读壳打开比分板，无赔率等 tab 内容时优雅空态
- `matchHero`：壳/带 `full` 的行也能画出比分

### 服务端 id 附着
- `lib/league-tables.js`：`attachSportteryIdsToFixtures`（在 `normalizeTeamFixturesLeagueZh` / `cloneAssembled` 每次下发时）
  - 优先 API-Football `fixtureId` → fixture-map
  - ESPN 行用 espnEventId，再按 BJ 日期 + 英文队名对 fixture-map 宽松匹配
- fixture 增加 `source: 'api-football' | 'espn'`

### 日期
- `bjYmdHm`：UTC+8 算术，不再依赖 `en-CA` Intl（部分 WebView 会产出 `2026/2/26` → slice 成 `/2/26` + `WEEK[NaN]=undefined`）
- `fxDateLabel` 使用 `bjYmdHm`

### 样式
- `button.det-fx-go` 全宽可点、:active 反馈（无大改版）

## 版本
- versionName **1.9.118** / versionCode **155**
- 合作包 versionName **1.9.118-test**
- `sw.js` VER `jc-v1.9.118`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.118.apk | 7833105 | 2375c81c61c610cc28d1cc42d9e19189 |
| jingcai-predict-1.9.118-partner.apk | 7833105 | e20ff4af54ee6d2098d57a1b2ee6e0ca |
| jingcai-predict.apk (→正式) | 7833105 | 2375c81c61c610cc28d1cc42d9e19189 |

- http://120.77.152.74:8088/jingcai-predict-1.9.118.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.118-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.118**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.117-prod-pre-20261022-044049.tgz`

## AF vs sporttery
- 有竞彩 id（fixture-map / 赛程池匹配）→ `#/match/<sportteryId>`，完整赛事详情
- 仅有 AF/ESPN、无竞彩 → `#/match/af:…` 或 `espn:…` 壳：比分板 + 空/弱 tab（不另做第二套 UI）
- 未来维拉 vs 曼城等尚未进竞彩赛程时走壳；进图后有竞彩再走数字 id
