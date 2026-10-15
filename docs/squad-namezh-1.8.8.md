# 1.8.8 阵容 / 中文名修复

## 根因
1. **里尔空阵容**：`crests` 有 sporttery `180→Lille`，但 `_idmap` 缺失；TheSportsDB 搜 `Lille` 只返回曲棍球队，足球队需 `Lille OSC`（idTeam `133711`）。`resolveTeam` 失败 →「球员库暂无该队完整阵容」。国安/海港/朗斯/里昂/马赛/摩纳哥/尼斯/加拉塔萨雷等同理缺映射。
2. **巴萨全英文**：`_namezh.json` 未覆盖当前 TheSportsDB 返回的 10 人名单（Livaković、Balde、de Jong 等）；且缓存命中虽会 `applyNameZh`，映射本身缺失。Wikidata `zh-cn` 偶发错误（如 Christensen），已改为优先搜索结果中文 label / `zh`。
3. **TheSportsDB 免费 key 名单约 10 人**：各大热门队同样偏短。已加 **API-Football squad 回退**（`players.length < 12` 时），但部署时若 AF key 不可用则仍用 TSDB 短名单。
4. **姓氏误匹配**：`Mbappé` 等共享姓曾把 Ethan 标成基利安；现仅对缩写名（`D. Livaković`）做姓氏匹配。

## 修复
- `lib/squad.js`：Lille OSC 等 aliases；`ZH_TO_EN`；seed `_idmap`；稀疏名单 AF 回退 + `_afmap` 缓存；更安全的 `applyNameZh` / `lookupNameZh`。
- `lib/wikidata-zh.js`：优先搜索 CJK label；实体标签优先 `zh` 而非不可靠 `zh-cn`。
- `lib/league-tables.js`：`playerZh` 姓氏匹配与阵容一致。
- `data/squads/_idmap.json`：补里尔/里昂/马赛/摩纳哥/尼斯/朗斯/国安/海港/加拉塔萨雷/PSV/莱比锡等。
- `data/crests.json`：补加拉塔萨雷等。
- `data/squads/_namezh.json`：扩大（Wikidata，不编造；无可靠译名保留英文，如 Álvaro Cortés）。
- `tools/prefetch-namezh.js` / `tools/namezh-hitrate.js` / `tools/fill-namezh-list.js`。

## 里尔修复方式
写入 `_idmap["180"] = { idTeam: "133711", strTeam: "Lille" }`，并在 `variants("Lille")` 增加 `Lille OSC`。清失败缓存后 `loadSquad` 返回约 9–10 人（TSDB 上限）；AF key 可用时自动扩到完整名单。

## namezh
见部署后 `namezh-hitrate` 与巴萨样例。

## APK / 回滚
- APK：`dist/jingcai-predict-1.8.8.apk`（versionCode 37）
- 回滚：恢复 `/opt/jingcai/backups/v1.8.8-pre-squad-namezh/` 后 `systemctl restart jingcai`

## 部署结果（2026-10-13）
- 线上：`120.77.152.74:8088` 已跑 **v1.8.8**
- `_namezh.json`：约 **527** keys / **219** 独特中文名（1.8.7 约 227/166）
- 巴萨样例（线上）：Livaković→多米尼克·利瓦科维奇，Balde→亚历杭德罗·巴尔德，Christensen→安德雷斯·克里斯滕森，de Jong→弗兰基·德容，Olmo→达尼·奥尔莫，Gordon→安东尼·戈登，Fermín→费尔明·洛佩斯；Álvaro Cortés 无可靠维基译名保留英文
- 里尔：由空阵容 → TheSportsDB 约 9 人（免费 key 名单上限约 10）；AF 回退代码已就位，当前 key 若不可用则不切换
- APK：`http://120.77.152.74:8088/jingcai-predict-1.8.8.apk`（versionCode 37）
- 回滚：`/opt/jingcai/backups/v1.8.8-pre-squad-namezh-*` 或本地 `backups/v1.8.8-pre-squad-namezh-20261013-162906`
