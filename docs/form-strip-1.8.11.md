# 1.8.11 预测报告「近期战绩」去掉 DWL 字母序列

## 改动
- `lib/predict-report.js`：`buildForm` 正文不再拼接「序列 DWLW…」，保留胜平负场数、进失球与来源说明（竞彩历史库 / API-Football 全赛程；偏疏仍会写权重下调）。
- JSON `facts.*.strip` 仍保留（未在报告 HTML 展示），便于调试。
- 前端预测页直接渲染服务端 `html`，无需改 `public/app.js`。

## 冒烟（国米 vs 布鲁日 `2041954`）
- 正文示例：`国际米兰 近 10 场 6胜3平1负（来源 竞彩历史库），进 25 失 16…`；`布鲁日 …（来源 竞彩历史库）…样本偏疏…`
- 无「序列」字样、无连续 W/D/L 字母串。

## 回滚
```bash
# 服务器
cp -a /opt/jingcai/backups/v1.8.11-prod-pre-20261014-030326/lib/predict-report.js /opt/jingcai/lib/
cp -a /opt/jingcai/backups/v1.8.11-prod-pre-20261014-030326/package.json /opt/jingcai/
cp -a /opt/jingcai/backups/v1.8.11-prod-pre-20261014-030326/public/config.js /opt/jingcai/public/
rm -f /opt/jingcai/data/predict-reports/*.json
systemctl restart jingcai
```
本地：`backups/v1.8.11-pre-form-strip-20261014-030308`

## 部署结果（2026-10-14 CST）
- 线上：`120.77.152.74:8088` **v1.8.11**
- 已清 `data/predict-reports/*.json`，新请求重生
- APK：`dist/jingcai-predict-1.8.11.apk`（versionCode 40）→ `http://120.77.152.74:8088/jingcai-predict-1.8.11.apk`
