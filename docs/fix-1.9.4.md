# 1.9.4 阵容 tab 改为「本场阵容」+ 球队映射补全

## 1) 费内巴切等无阵容
**根因**：ESPN 球队映射只能靠英文名候选（crests / TEAM_ZH / 小词表），费内巴切（sporttery 311）没有英文名，所以 ESPN 的 tur.1 索引虽然有该队（436），也匹配不上。
**修复**
- `ESPN_ZH_EN` 补充：费内巴切、加拉塔萨（雷）。
- **自动学习映射**（`espn-form.learnTeam` + `espn-lineup.findEvent`）：用 ESPN `all/scoreboard?dates=` 按开球时间（±75 分钟）找到本场；只要有一方能识别，另一方的 ESPN id 就从赛事里学到，再用联赛索引确定所属国内联赛，写入 `data/live-stats/espn/learned.json`。服务启动 20 秒后和之后每 6 小时，对赛程全量跑一遍（首次匹配到 113/129 场，新学到 18 队，如 哥本哈根、奥林匹亚科斯、萨尔茨堡、圣吉罗斯、博德闪耀 等）。

## 2) 阵容 tab = 本场阵容
- 新增 `lib/espn-lineup.js` 和 `GET /api/lineup?matchId=`（另接受 date/time/homeTeamId/awayTeamId/home/away 参数兜底）。
- 数据：ESPN `all/summary?event=` 的 `rosters`，包括阵型、首发 11 人（按 formationPlace 排序，带位置缩写）、替补、↑登场（换下谁）、↓被换下。
- 状态：
  - `final` / `live` / `announced`：显示本场真实阵容。
  - `pending`：显示「首发未公布（通常赛前约1小时）」，下面是**各队上一场实际首发**（标明日期、对手、比分、赛事），注明「非本场」。
  - `no-event`：ESPN 未收录本场，只给上一场参考（能取到的话）。
- 缓存：赛前 3 小时以外 30 分钟；赛前 3 小时内及进行中 3 分钟；完场 7 天；上一场阵容 7 天。前端缓存 2 分钟（完场 1 小时）。
- 中文名：用 `_namezh` 按英文名匹配，匹配不到就显示原文。
- 前端：默认显示本场阵容；全队名单折叠在「查看全队名单 ▼」里（沿用 1.9.3 的 ESPN 名单逻辑）。新增 `.lu-*` 样式。

## 验证（线上 2026-10-14 18:45 CST）
- 周一007 考文垂 vs 纽卡斯尔（完场，ESPN 401879267）：双方 4-2-3-1，首发 11 + 替补 9，各登场 5 人，含「↑ 换下 Matt Grimes」等。
- 周三006 LASK林茨 vs 利物浦（未开赛，ESPN 401915415）：pending。LASK 上一场 10-11 对 Rapid Vienna（5-3-2）首发 11 人；利物浦上一场 10-11 对曼城（4-2-3-1）首发 11 人。
- 周三012 维拉 vs 费内巴切（ESPN 401915409）：pending。费内巴切上一场 10-11 客场对 Rizespor（4-2-3-1）首发 11 人；`/api/squad?teamId=311` 现为 ESPN 29 人。
- headless Chrome 渲染核对通过（截图 `screenshots/lineup-2041966.png`、`lineup-2041927.png`）。

## 限制
- ESPN 未收录的赛事/联赛（日乙、韩K、沙特、卡塔尔、部分亚冠/杯赛）没有本场阵容，也可能没有上一场参考。
- 「上一场首发」只看 ESPN 收录的比赛（联赛+欧战）；如果真正的上一场是国内杯赛且未收录，会往前取更早一场（日期已标明）。
- 换人时间（分钟）暂不显示；首发公布时间取决于 ESPN 更新。

## APK
`dist/jingcai-predict-1.9.4.apk`（versionCode 44）→ http://120.77.152.74:8088/jingcai-predict-1.9.4.apk；`jingcai-predict.apk` 已同步替换。

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.4-prod-pre-20261014-184433
cp -a $B/server.js $B/package.json /opt/jingcai/ && cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
rm -f /opt/jingcai/lib/espn-lineup.js; systemctl restart jingcai
```
本地备份：`backups/v1.9.4-pre-20261014-184345`
