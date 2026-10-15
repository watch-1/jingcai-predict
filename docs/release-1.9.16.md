# 1.9.16 队徽/球员照片清晰度与覆盖率

## 问题
- 欧罗巴等多场显示字母圆：托林斯、桑德兰、波兹南、圣吉联合、萨尔茨堡、克拉约瓦、奥林匹亚、格风暴、凯尔特人、哥本哈根等 sporttery CDN 队徽 404/567。
- 「托林斯」被误认为托特纳姆；实为葡萄牙 **Torreense**（AF 4799）。托特纳姆仍为 sporttery `19`。
- API-Football `media.api-sports.io` 队徽/头像约 150px，在视网膜圆标上易糊；TheSportsDB badge/cutout ≈512、ESPN teamlogo 500 更清晰。

## 修复
1. **crests.json**：补全上述队 + 利雅胜利；贝西克塔/加拉塔萨雷改用 TSDB 高清；写入 `afTeamId` 便于反查。
2. **映射**：`AF_TEAM_SEED` / `AF_ZH_EN` / `ESPN_ZH_EN` / `TEAM_ZH`（托林斯≠托特纳姆）。
3. **清晰度**：队徽优先 TSDB→ESPN500→AF；站位榜/射手榜 AF logo 可升到已映射高清；ESPN combiner 缩略图升到 ≥256；射手若仅有 AF 150 头像则后台用 TSDB cutout 升级，AF 作 `photoAlt`。
4. **CSS**：略增大 badge/头像；`image-rendering` + GPU 层减轻 WebView 糊边。

## 今晚欧罗巴队徽覆盖
- 修复前：约 **14/24** 有真实队徽（10 队走 sporttery 占位）
- 修复后：**24/24**（均为已校验 TSDB badge，非臆造）

## APK
`dist/jingcai-predict-1.9.16.apk`（versionCode **56**）→ http://120.77.152.74:8088/jingcai-predict-1.9.16.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.16-prod-pre-20261015-203431
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
cp -a $B/data/crests.json /opt/jingcai/data/crests.json
systemctl restart jingcai
```
