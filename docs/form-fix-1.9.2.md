# 1.9.2 情报页近期战绩：接入 ESPN 公开赛程（本赛季联赛+欧战）

## 现象
LASK林茨 近况仅「近3 · 竞彩历史」（3 场欧冠资格赛）；利物浦 近10 全来自竞彩历史，缺英超以外/竞彩未上架场次。

## 根因
1.8.10 的 AF 回退在线上从未生效（journalctl 证据）：
- `GET /fixtures?team=&season=2026` → `Free plans do not have access to this season, try from 2022 to 2024.`（当前赛季 2026/27 = AF season 2026）
- `/fixtures/headtohead` → `Your account is suspended`（时好时坏）
- 即使拉到 2022–2024 的数据，也会被 `AF_FORM_MAX_AGE_DAYS=120` 新鲜度检查拒绝（正确行为，不能用两年前的比赛冒充近况）。
- 另外 AF 回退只在「偏疏」时触发，利物浦这类竞彩样本不疏的队永远不会补联赛。
→ 免费 AF 在结构上无法提供本赛季近况。

## 方案
从阿里云服务器实测可达性：ESPN `site.api.espn.com` 200（免 key）；thesportsdb 免费档只给 1–5 场；sofascore 403；fotmob 404。选 ESPN。
- 新增 `lib/espn-form.js`：
  - 球队映射：抓 ~36 个联赛 `/{league}/teams` 建索引（缓存 7 天，`data/live-stats/espn/teams-index.json`），用 crests 英文名 / TEAM_ZH 反查 / AF team-id-cache 名 / 中文名中的英文片段 / `ESPN_ZH_EN` 小词表 精确或唯一匹配；`SEED` 固定 LASK=4411。
  - 赛果：`/{domestic}/teams/{id}/schedule` + `uefa.champions` / `uefa.europa` / `uefa.europa.conf`；仅取 `status.type.completed` 的真实比分；本赛季不足 10 场再补上赛季联赛。缓存 6h（`espn/form/{id}.json`），失败时 7 天内旧缓存兜底。
- `lib/match-stats.js`：`enrichForm` 对所有队先走 ESPN，并按日期（±1 天视为同场）合并竞彩历史中 ESPN 没有的场次（如英联赛杯、欧冠资格赛），日期降序截取近 N；ESPN 不可用时回退原逻辑（竞彩历史 → AF）。日期按北京时间。
- 来源标签：`source` = `espn` / `history+espn`（可与 `api-football` 组合）；前端显示「竞彩+ESPN赛程」，预测报告显示「竞彩历史库+ESPN 公开赛程」。
- `lib/league-tables.js` 导出 `TEAM_ZH`；`public/app.js` 标签函数 `formSrcZh`；`sw.js` 缓存版本 jc-v1.9.2。
- 包含 1.9.1 `completeMatches()`（server.js 已含）。

## 验证（线上 2026-10-14 18:3x CST）
`/api/match-stats?homeTeamId=1128&awayTeamId=11&limit=10` → `form:history+espn`
- LASK林茨 近10（5胜1平4负）：10-11 0:2 Rapid Vienna 奥甲、09-20 3:3 哈特贝格 奥甲、09-13 斯图姆格拉茨 奥甲、09-09 AEK 欧冠、…、08-26/08-20 凯尔特人 欧冠（竞彩历史）…
- 利物浦 近10（4胜4平2负）：10-11 0:3 曼城 英超、09-20 伯恩茅斯 英超、09-16 热刺 英联赛杯（竞彩历史）、09-10 马竞 欧冠、…
- 抽样 40 支近期竞彩球队：30/40 命中 ESPN；未命中的（藤枝MYFC、大宫松鼠、沙特/卡塔尔/智利等低级别或未收录联赛）保持竞彩历史并照旧标注。

## 限制
- ESPN 为非官方公开接口，可能变更/限流；有缓存兜底，失效时自动回退竞彩历史并标明来源。
- 国内杯赛（足总杯/国王杯等）未单独拉取，只有竞彩上架过的才会出现；对手名无中文映射时显示英文。
- 日职乙、沙特、卡塔尔、韩K、波兰等联赛 ESPN 未收录或 slug 404，这些队仍仅竞彩历史。
- AF 免费档仍无法获取 2025/26 及以后赛季；如购买付费档，原 AF 回退会自动生效。

## APK
前端改了标签 → `dist/jingcai-predict-1.9.2.apk`（versionCode 42）→ `http://120.77.152.74:8088/jingcai-predict-1.9.2.apk`（`jingcai-predict.apk` 同步更新）。

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.2-prod-pre-20261014-182756
cp -a $B/server.js $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && rm -f /opt/jingcai/lib/espn-form.js
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
本地：`backups/v1.9.2-pre-form-espn-20261014-182724`
（注：回滚 server.js 会同时撤销 1.9.1 的 completeMatches。）
