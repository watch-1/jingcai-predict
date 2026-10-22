# 1.9.115 — 球队赛程卡对齐澳客参考

## 问题
1.9.114 后仍：主队徽在队名左侧、长名（巴黎圣日耳曼）两行断字、未开赛挤在中间；与竞品（曼城赛程/澳客）结构不一致。

## 改动（仅 UI；不碰 detail 组装缓存）
1. **比分行顺序（澳客）**
   - 主队：`[短队名][crest]` → 朝比分右对齐
   - 客队：`[crest][短队名]` → 朝比分左对齐
   - 比分/未开赛固定中栏 `3.6em`
2. **短中文队名** `fxTeamShort`（展示层）：巴黎圣日耳曼→巴黎圣曼、斯特拉斯堡→斯特拉斯、AEK雅典→雅典AEK…；缓存仍保留完整 `homeZh`
3. **顶栏日期** Asia/Shanghai：`MM/DD 周X HH:mm` + 联赛左贴；胜/平/负仍右钉
4. **队名单行** + ellipsis 兜底（去掉 2 行 clamp）
5. 缺 `result` 时按当前球队视角从比分推导 胜/平/负
6. 联赛中文沿用 1.9.113 `forceLeagueZh`

## 版本
- versionName **1.9.115** / versionCode **152**
- 合作包 versionName **1.9.115-test**
- `sw.js` VER `jc-v1.9.115`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.115.apk | 7583025 | 84d86f22c6b363c6432b39d544ed447b |
| jingcai-predict-1.9.115-partner.apk | 7583025 | a58b71b1305f73e669984df560427e60 |
| jingcai-predict.apk (→正式) | 7583025 | 84d86f22c6b363c6432b39d544ed447b |

- http://120.77.152.74:8088/jingcai-predict-1.9.115.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.115-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.115**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.114-prod-pre-.tgz`
- 本地冒烟截图：`screenshots/v1.9.115-psg-schedule.png`、`screenshots/v1.9.115-city-schedule.png`
