# 1.9.15 过程数据对比逻辑修复 + UI 升级

## 问题
- 霍芬海姆 vs 贝西克塔「数据」页：主队有滚动过程数据，客队全「-」，但蓝色条仍以最小宽度 stub 出现，双柱布局误导。
- 页脚仍写「免费约 100 次/日」，账户已改为 Pro（约 7500/日）。
- 贝西克塔因缺英文 crest / 种子映射，无法解析 API-Football team id。

## 修复
1. **对比条逻辑**：仅当主客**双方都有数值**时画双柱；单侧有值只画该侧实心条，对侧为斜纹空态，不再 `Math.max(4, …)` 造假条。
2. **UI**：队徽 + 近 N 场标注、指标居中标签、卡片阴影、骨架屏、单侧缺失黄底说明。
3. **文案**：去掉「免费约 100 次/日」，改为按实际 `quota.limit/remaining` 提示（Pro）。
4. **映射**：`AF_TEAM_SEED` 增加 `158→167`（霍芬海姆）、`279→549`（贝西克塔）；`AF_ZH_EN` + crest 补全；赛季拉取优先当前赛季。

## APK
`dist/jingcai-predict-1.9.15.apk`（versionCode **55**）→ http://120.77.152.74:8088/jingcai-predict-1.9.15.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.15-prod-pre-20261015-201721
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
# crests.json if needed
systemctl restart jingcai
```
