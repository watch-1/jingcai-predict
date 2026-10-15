# 1.9.17 积分榜队徽视网膜清晰度

## 问题
- 1.9.16 后数据中心「积分榜」行内队徽（英超 曼城/阿森纳/布莱顿等）在视网膜手机上仍显糊。
- 根因：① 积分榜 CSS 仍强制 `.dc-table .tm-in .badge` **26px**（通用 badge 已 36px）；② ESPN 积分榜行未走 crests.json 高清升级，仍用 ESPN 源图（虽已 500，缩到 26px 圆标易糊）；③ 布莱顿/诺丁汉森林缺 TSDB 映射。

## 修复
1. **积分榜 / 同表 UI**：行内 crest **26→36 CSS px**；射手榜副队徽 18→22；badge `<img>` 固有尺寸 **64→108**（≈3×）；`image-rendering` 以 `-webkit-optimize-contrast` 为准。
2. **高清源**：积分榜/射手榜在服务端按队名/AF id 升级为 **TheSportsDB badge（≈512）**，否则 ESPN `/soccer/500/`，再否则 AF。
3. **crests.json**：补布莱顿（AF 51）、诺丁汉森林（AF 65）TSDB badge。
4. **espn-tables `logoOf`**：有 team id 时固定走 ESPN 500，避免 combiner 小图。

## 验证
- 线上 `GET /api/standings?league=epl`：曼城/阿森纳/布莱顿等 logo 均为 `r2.thesportsdb.com` 512 PNG。
- `/api/logo` 代理返回 512×512。

## APK
`dist/jingcai-predict-1.9.17.apk`（versionCode **57**）→ http://120.77.152.74:8088/jingcai-predict-1.9.17.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.17-prod-pre-20261015-210240
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
cp -a $B/crests.json /opt/jingcai/data/crests.json
systemctl restart jingcai
```
