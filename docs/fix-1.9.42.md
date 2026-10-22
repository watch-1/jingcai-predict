# 1.9.42 情报摘要「近期战绩」去掉 WDL 字母串

## 现象
情报 Tab「情报摘要」近期战绩一行在胜平负场数后追加整串英文字母，例如 `(WDLWLLLWLDWDLLWWWLWD)`，难读且与报告正文风格不一致。

## 修复
- `public/app.js` `intelBullets`：只保留「N胜N平N负」计数，不再 `join` 赛果 outcome 字母串。
- `lib/predict-report.js` 正文此前（1.8.11）已不展示序列；JSON `facts.*.strip` 仍保留供调试，未改。

## APK
`dist/jingcai-predict-1.9.42.apk`（versionCode **82**）→ http://120.77.152.74:8088/jingcai-predict-1.9.42.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.42-prod-pre-20261016-101231
cp -a $B/package.json /opt/jingcai/
cp -a $B/public/app.js $B/public/config.js /opt/jingcai/public/
systemctl restart jingcai
```
