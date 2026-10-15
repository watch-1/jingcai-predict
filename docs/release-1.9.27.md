# 1.9.27 选择性表态 + 赛后反馈 + 可用性条

## 用户价值
1. **少而准**：多数场次显示「与盘口一致 / 信息不足，不额外表态」；仅当过程/近况/伤停/赛程与盘口冲突或出现冲击信号时给出稳胆/倾向级「额外表态」。
2. **赛后反馈**：完场复盘新增「赛前表态反馈」，记录表态对错与误导/支撑情报块，写入 `data/history/lean-feedback.json` 供后续权重提示。
3. **可用性条**：预测页轻量指标条（高信心命中、与盘口一致占比、分歧场/表态命中），不恢复已下线的「预测模型说明」大卡片。

## 变更
- `lib/predict-report.js`：`speakMode` amplify/align/abstain；芯片与结论文案；轻量过程权重反馈。
- `lib/post-match-review.js`：`buildLeanFeedback` / `recordLeanFeedback` / `getUsefulnessStats`。
- `server.js`：`GET /api/usefulness`。
- `public/app.js` + `style.css`：筛选改为 全部/表态/观望；可用性条；卡片观望样式。

## APK
`dist/jingcai-predict-1.9.27.apk`（versionCode **67**）→ http://120.77.152.74:8088/jingcai-predict-1.9.27.apk
