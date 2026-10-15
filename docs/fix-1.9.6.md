# 1.9.6 球员中文名自动补全（维基 > 既有译名库 > 程序音译「译」）

## 先查了什么
- 服务器和 box 上都没有 LLM / 翻译 API key（只有 API_FOOTBALL_KEY、MYMEMORY_EMAIL；MyMemory 对人名不可靠，没用）。
- **阿里云服务器访问 Wikidata 超时**，所以维基译名改由 box 批量拉取后合并到服务器。

## 优先级
1. `_namezh.json` 既有译名（人工/历史维基结果，加上本次 box 批量写入的维基中文名）
2. Wikidata 中文 label（`tools/wiki-namezh-sync.js` 在 box 上跑，只新增、不覆盖；繁体用 opencc 转简体；单名如 Wesley/Danilo 有歧义，跳过）
3. 程序音译 `lib/name-auto.js`：简化新华译名音节表 + 分语种拼写规则（es/pt/fr/de/nl/tr/北欧/it/斯拉夫/英；按 ESPN 国籍判断语种，没有国籍时按字母特征猜）。结果存 `data/squads/_namezh_auto.json`，标 `nameZhSrc:'auto'`。服务端也有维基后台队列，但因网络不通实际不会生效。

## 作用范围
本场阵容（球场、替补）、全队名单 API、球员详情（显示原文 + 「中文为程序自动音译」）、数据中心（射手/助攻/球队名单/球员页，`playerZhAuto`）。音译名在前端带小号「译」角标。

## 截断修复
球场上原来取 `·` 后最后一段再截 6 字，「亚历山大-阿诺德」会变成「亚历山大-阿」。现在取完整姓氏（带连字符整体保留），超宽由 CSS 省略号处理。

## 本次维基同步
- 待查 1170 名，得到 445 个维基中文名，累计新增 506 条（另删掉 14 条单名误配，例如 Wesley→斯内德）；`_namezh.json` 现约 1030 条。
- 同步前的备份：`backups/v1.9.6-prod-pre-20261014-190947/data/_namezh.json`

## 样例（线上本场阵容 / 上一场首发）
| 原文 | 结果 | 来源 |
|---|---|---|
| Thibaut Courtois | 蒂博·库尔图瓦 | 维基 |
| Antonio Rüdiger | 安东尼奥·吕迪格 | 维基 |
| Arda Güler | 阿尔达·居莱尔 | 维基 |
| Federico Valverde | 费德里科·巴尔韦德 | 维基 |
| Aurélien Tchouaméni | 奥雷利安·楚阿梅尼 | 维基 |
| Florian Wirtz | 弗洛里安·维尔茨 | 维基 |
| Álvaro Carreras | 阿尔瓦罗·费尔南德斯 | 维基（是本人全名 Álvaro Fernández Carreras 的译名，习惯叫法是「卡雷拉斯」，有偏差） |
| Lukas Jungwirth | 卢卡斯·云格维特 | 音译（较合理） |
| Kasper Jørgensen | 卡斯佩尔·耶根森 | 音译（新华译法偏「约恩森」） |
| Christoph Lang | 克里斯托夫·兰格 | 音译（常见「朗」） |
| Alemão | 阿莱马奥 | 音译（常见「阿莱芒」） |
| Yan Diomande | 扬·迪奥曼德 | 音译 |
| Federico Valverde（纯规则对比） | 费德里科·巴尔贝德 | 规则版，维基是「巴尔韦德」 |

覆盖：皇马 22 人中 3 人为音译，罗马 6/21，利物浦 2/20，LASK 12/20。

## 质量评估（如实）
- 规则音译：大致读音对，多数能认出是谁；但用字常常和媒体惯用译名不同（瓦/韦、尔/勒等），法语/北欧/葡语的特殊发音只做了近似，复杂姓名（荷兰 ui、塞尔维亚 dž 等）误差较大。所以一律标「译」。
- 维基译名：权威度高，但偶有用全名或繁体/港台译法（繁体已转简体），个别取到本人的另一种全名。

## 截图
`screenshots/v196-lineup-2041968-away-{400,1024}.png`（皇马）、`screenshots/v196-lineup-2041966-home-{400,1024}.png`（LASK，可见「译」角标）

## 运维
- 定期在 box 上跑 `node tools/wiki-namezh-sync.js`（需要 ssh key；1000 多个名字约 30 分钟），把新球员的维基译名补进服务器。

## APK / 回滚
- `dist/jingcai-predict-1.9.6.apk`（versionCode 46）→ http://120.77.152.74:8088/jingcai-predict-1.9.6.apk；`jingcai-predict.apk` 已替换。
- 回滚：
```bash
B=/opt/jingcai/backups/v1.9.6-prod-pre-20261014-190947
cp -a $B/package.json /opt/jingcai/ && cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
cp -a $B/data/_namezh.json /opt/jingcai/data/squads/   # 可选：撤销维基同步
rm -f /opt/jingcai/lib/name-auto.js; systemctl restart jingcai
```
本地备份：`backups/v1.9.6-pre-20261014-190824`
