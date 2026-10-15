# 1.9.26 预测页精简：隐藏「预测模型说明」卡片

## 用户价值
预测列表页不再展示「预测模型说明」大卡片（方法论文案、稳胆/倾向/谨慎阈值说明、历史样本/命中率/ROI 三栏、关于·历史实测入口），页面更干净。筛选 chips、稳胆计数条、推荐列表与详情情报简报逻辑不变。

## 变更
- `public/app.js`：删除 `modelPanelHtml()` 及其在 `pagePredict()` 中的调用。
- `public/style.css`：移除 `.model-panel` / `.model-stats` 样式。
- 「关于」页 `#/about` 内「历史实测（基线）」仍保留；`/api/baseline` 与后端预测逻辑不动。

## APK
`dist/jingcai-predict-1.9.26.apk`（versionCode **66**）→ http://120.77.152.74:8088/jingcai-predict-1.9.26.apk
