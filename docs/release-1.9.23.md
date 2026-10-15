# 1.9.23 修复罗马过程统计空缺（队名同名误映射）

## 用户价值
AS Roma vs Real Madrid 等场次，主队「场均对比」不再因错误映射到同名弱队而整侧空白；预测在单侧过程数据时更诚实降权。

## 改动
- `lib/match-stats.js`：`AF_TEAM_SEED` 增加 132→497（AS Roma）、664→541 等；种子覆盖错误缓存。
- `lib/live-stats.js`：`teamPickScore` 质量加权，避免 Roma(斯洛文尼亚) 压过 AS Roma。
- `lib/process-stats.js`：中文短名映射；种子覆盖。
- `data/crests.json`：132 EN `Roma`→`AS Roma`。
- `lib/predict-report.js`：单侧过程数据信心 −0.04。
- `public/app.js`：空态文案提示可能映射异常。

## APK
`dist/jingcai-predict-1.9.23.apk`（versionCode **63**）→ http://120.77.152.74:8088/jingcai-predict-1.9.23.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.23-prod-pre-$(ls -1dt /opt/jingcai/backups/v1.9.23-prod-pre-* 2>/dev/null | head -1 | xargs -I{} basename {})
# 或使用部署时打印的备份路径
systemctl restart jingcai
```
