# 1.9.7 数据中心：拒绝过期赛季，改用 ESPN 本赛季

## 现象
数据中心射手榜显示「英超 · 2024/25」，萨拉赫挂在利物浦名下 29 球。用户指出萨拉赫已不在利物浦。

## 根因
1. `lib/league-tables.js` 把 `FREE_SEASON = 2024` 当作默认赛季（`pickSeason` 取 `min(今年, 2024)`）。
2. API-Football **免费档硬限制 season ≤ 2024**，拿不到 2025/26、2026/27。
3. 磁盘缓存 `data/league-tables/*-2024.json` 长期当「当前」展示；UI 虽写了赛季标签，但没有标明「非本赛季 / 俱乐部可能已转会」。
4. 2024/25 赛季萨拉赫确在利物浦进 29 球——**对该历史赛季是对的**，但把整季榜当当前看就是错误 UX。

## 转会抽查（2026-10-14，来源 ESPN，非臆造）
| 球员 | ESPN 当前俱乐部 | 联赛 | 对比 2024/25 AF 射手榜 |
|---|---|---|---|
| Mohamed Salah | **Trabzonspor（特拉布宗体育）** | 土超 tur.1 | 利物浦 29 球（过期） |
| Alexander Isak | Liverpool | 英超 | 纽卡斯尔 23 球 |
| Florian Wirtz | Liverpool | 英超 | （不在该季英超榜前列） |
| Hugo Ekitike | Liverpool | 英超 | — |
| 利物浦名单 | 无 Salah；有 Isak / Wirtz / Ekitike / Kerkez / Frimpong | | |

说明：ESPN 检索与运动员页、土超名单均指向特拉布宗；利物浦 2026-27 roster 无 Salah。

## 全联赛审计（修复前 → 修复后）
修复前：八个联赛积分/射手/助攻全部落在 AF **2024** 缓存。  
修复后（线上 `/api/*`，来源 ESPN）：

| 联赛 | 赛季标签 | 积分榜榜首（抽样） | 射手榜第一（抽样） |
|---|---|---|---|
| 英超 | 2026/27 | 曼城 | 哈兰德（曼城，6） |
| 西甲 | 2026/27 | 巴塞罗那 | 拉菲尼亚（巴萨，12） |
| 德甲 | 2026/27 | 弗赖堡 | 席克（勒沃库森，5） |
| 意甲 | 2026/27 | 国际米兰 | 马伦（罗马，6） |
| 法甲 | 2026/27 | 摩纳哥 | 拉辛·西内奥科（Paris FC，4） |
| 中超 | **2026**（自然年） | 成都蓉城 | 马里图（云南玉昆，20） |
| 英冠 | 2026/27 | Swansea / 斯旺西 | 兰克希尔（米堡，8） |
| 荷甲 | 2026/27 | 费耶诺德 | 滕格斯特德特（前进之鹰，6） |

英超本赛季射手榜 **已无萨拉赫**。

## 修复
- 新增 `lib/espn-tables.js`：ESPN `…/standings`、`…/statistics`（goalsLeaders / assistsLeaders），缓存 3h。
- `getStandings` / `getTopScorers` / `getTopAssists`：**默认走 ESPN 本赛季**；日历护栏（欧陆 7 月切换赛季起始年；中超自然年）；拒绝把早于「上赛季」的数据当当前展示。
- AF 2024 仅在 `?season=2024` 显式请求时返回，并标 `pastSeason: true`；前端黄条提示「历史赛季，俱乐部以该季为准」。
- `listLeagues` 默认赛季改为日历本赛季；说明 AF 免费档不再当作当前。
- UI：赛季旁标注「ESPN 本赛季」；过期拒绝时展示诚实空态 + `noteZh`。
- 补部分队名中文（特拉布宗、斯旺西、巴黎FC、云南玉昆等）。

## 验证
- `/api/topscorers?league=epl` → espn 2026/27，哈兰德@曼城，无萨拉赫。
- `/api/topscorers?league=epl&season=2024` → api-football 2024/25，萨拉赫@利物浦 29（历史），`pastSeason:true`。
- 八联赛积分榜均可拉到 ESPN 本赛季。

## 限制
- ESPN 非官方接口，可能变更；失败时若无合格本赛季缓存，会诚实报错，而不是退回 2024/25 冒充当前。
- 部分小俱乐部中文名仍可能显示英文。
- 球员头像依赖 ESPN/既有源，可能空缺。
- AF 球队详情/球员详情若仍走 AF，可能仍偏旧赛季——本次未改详情路径。

## APK
`dist/jingcai-predict-1.9.7.apk`（versionCode 47）→ http://120.77.152.74:8088/jingcai-predict-1.9.7.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.7-prod-pre-20261014-212832
cp -a $B/package.json /opt/jingcai/ && cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
rm -f /opt/jingcai/lib/espn-tables.js; systemctl restart jingcai
```
本地：`backups/v1.9.7-pre-20261014-212242`
