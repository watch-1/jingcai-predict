# 1.9.46 预测列表按竞彩日分组

## 用户价值
1. **按日分段**：预测页列表按竞彩 `businessDate`（Asia/Shanghai 期次日，`issueDate`）分组，今天 / 明天不再扁平滑在一起。
2. **日标题**：清晰区块头，如 `今天 10-16` / `明天 10-17` / `周六 10-18`（`dayName` + `MM-DD`）。
3. **筛选保留**：顶部「全部 / 表态 / 观望」chips 不变；筛选后再按日分组；日内仍先表态后信心排序。

## 改动
- `public/app.js`：`pagePredict` 按 `issueDate` 分组渲染 `.pr-day`
- `public/style.css`：`.pr-day` / `.pr-day-h` / `.pr-day-lab`（含 pitch 主题）
- `package.json` / `public/config.js` / `android/build-apk.sh` → **1.9.46**（versionCode **86**）

## APK
`dist/jingcai-predict-1.9.46.apk`（versionCode **86**）→ http://120.77.152.74:8088/jingcai-predict-1.9.46.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.46-prod-pre-20261016-193110
cp -a $B/package.json /opt/jingcai/
cp -a $B/public/app.js $B/public/style.css $B/public/config.js /opt/jingcai/public/
systemctl restart jingcai
```
