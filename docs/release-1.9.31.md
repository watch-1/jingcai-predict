# 1.9.31 数据中心增加欧冠（联赛阶段）

## 需求
用户：最近的欧冠数据有么，可以加在里面么。原先联赛 pills 仅国内/五大联赛等 8 项，无欧冠。

## ESPN 能力（已核实）
- slug：`uefa.champions`
- **积分榜**：`/standings` → children「League Phase」**36 队单表**（现行赛制，非旧式小组赛）。分区备注：1–8 直接晋级16强；9–16 附加赛种子；17–24 附加赛非种子；25–36 淘汰。
- **射手 / 助攻**：`/statistics` → `goalsLeaders` / `assistsLeaders`（本赛季联赛阶段，各约 50 人）。
- 与五大联赛同一套公开接口，可走现有磁盘缓存 + 日更/6h/赛后刷新管道。

## 改动
1. `lib/espn-tables.js`：`ucl → uefa.champions`；积分榜优先取 League Phase；保留 ESPN `note.description`。
2. `lib/league-tables.js`：LEAGUES 增加欧冠（key=`ucl`，AF id=2）；联赛阶段中文分组与说明；俱乐部中文名补全。
3. `server.js`：`DC_LEAGUE_BY_ABBR` 增加 `欧冠` / `UEFA Champions League` → 竞彩完场触发该联赛积分+射手+助攻刷新。
4. `public/app.js`：pill「欧冠」（五大联赛后）；联赛阶段分区色带图例。

## APK
`dist/jingcai-predict-1.9.31.apk`（versionCode **71**）→ http://120.77.152.74:8088/jingcai-predict-1.9.31.apk
