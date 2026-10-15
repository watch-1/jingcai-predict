# 1.9.20 绿茵屏事件芯片：球员中文名

## 问题
比赛详情「数据」页绿茵屏进球/换人等事件芯片仍显示英文名（如 Haris Tabaković、Adrien Rabiot），与阵容页中文名不一致。

## 改动
1. **`lib/live-stats.js`**：对 API-Football 事件的 `player` / `assist` 套用与阵容相同的 namezh → Wikidata → 程序音译管道（`squad.applyNameZh` / `name-auto`）；音译标 `playerZhAuto`。
2. **`public/app.js`**：绿茵屏事件芯片优先显示 `playerZh`，音译带小号「译」角标。
3. **`lib/squad.js`**：namezh 全名查找增加去重音匹配（`Gonçalo Ramos` → 既有 `Goncalo Ramos` 译名）。
4. **`lib/name-auto.js`**：拒绝把「多词英文 → 短无分隔中文」的可疑维基结果写入 `_namezh.json`（避免 Fikayo Tomori→「杜姆尼」类误配）。

## APK
`dist/jingcai-predict-1.9.20.apk`（versionCode **60**）→ http://120.77.152.74:8088/jingcai-predict-1.9.20.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.20-prod-pre-20261016-022322
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
