# 1.9.40 完场第三方场次映射修复（Olympiacos / 欧战漏映射）

## 现象
部分完场竞彩/欧战场次「数据」Tab 绿茵屏与球员统计提示「未能映射到数据源场次」；赛后复盘无本场技术统计（`hasActualStats:false`）。例：马赛 0:1 奥林匹亚（2041983，欧罗巴）。

## 根因
1. **拼写漂移**：crest/竞彩用 `Olympiacos`，API-Football 用 `Olympiakos Piraeus`；旧 `nameScore` 对 c/k 与后缀为 **0**，`pickFixture` 阈值 0.75 永不命中。
2. **同类模式**：`Union Saint-Gilloise`↔`Union St. Gilloise`（0.67）、`Bayern Munich`↔`Bayern München`、中英混名 `LASK林茨`、缺 crest 英文的费内巴切等。
3. **未用本地 AF 队 ID**：crests/`AF_TEAM_SEED` 已有 182→81、286→553 等，但 `resolveFixture` 只按英文名在日赛程里糊匹配。
4. **复盘缓存**：映射失败后写入无 `fixtureId` 的复盘，之后不会自动重建。

## 修复（泛化，非单场 hack）
1. `lib/live-stats.js`：`localAfTeamId`（crest → seed → cache）；`pickFixture` **优先按双边 AF team id** 命中；`nameTokens` 别名（olympiacos↔olympiakos、munich↔munchen、saint↔st）+ 去 CJK/后缀；`businessDate` / 未知开球时间扩日窗；中文短名 `zhEnFallback`。
2. `AF_TEAM_SEED` 补 `613→759`（维京）、`1128→1026`（LASK）；`crests.json` 回填费内/LASK/维京/博德等 `en`+`afTeamId`。
3. `post-match-review`：`needsStatsBackfill` — 无 `fixtureId`/无本场统计的缓存强制重建；仍保留 leanFeedback（映射失败时也有表态复盘）。
4. `server.js` / `fixture-players` 传入 `businessDate`。

## 审计（修复前 prod 完场抽检）
竞彩相关完场 34 场：`ok 27 / no_fixture 7`。7 场均已在本地用 AF 验过有 fixture：
2041983 马赛-奥林匹亚→1636295；2041978 圣吉-社会→1636328；2041972 维拉-费内→1635620；2041969 博德-多特→1635639；2041966 LASK-利物浦→1635674；2041957 维京-拜仁→1635742；2041967 诺维奇-南安→1563200。马赛场 AF **有**完场技术统计（17 项）。

## APK
`dist/jingcai-predict-1.9.40.apk`（versionCode **80**）→ http://120.77.152.74:8088/jingcai-predict-1.9.40.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.40-prod-pre-20261016-095152
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/live-stats.js $B/lib/post-match-review.js $B/lib/match-stats.js $B/lib/fixture-players.js /opt/jingcai/lib/
cp -a $B/data/crests.json /opt/jingcai/data/crests.json
systemctl restart jingcai
```
