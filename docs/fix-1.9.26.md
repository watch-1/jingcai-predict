# 1.9.26 UI：隐藏预测页「预测模型说明」

**诉求**：用户反馈预测页「预测模型说明」卡片显得杂乱，不希望终端用户看到。

**改动**：
- 删除 `public/app.js` 中 `modelPanelHtml()` 及 `pagePredict()` 对该卡片的渲染（方法论文案、档位说明、1857/命中率/ROI、关于·历史实测链接）。
- 删除对应 `.model-panel` / `.model-stats` CSS。
- 保留 `#/about` 历史实测、`/api/baseline`、预测算法与筛选 chips。

**部署**：prod `/opt/jingcai` 已更新；APK 1.9.26 (66)。
