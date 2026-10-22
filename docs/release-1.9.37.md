# 1.9.37 情报页隐藏 API 日配额/剩余

## 问题
赛事详情「情报」→ 近期过程数据页脚展示：
`来自 API-Football… 日配额约 7500 次（剩余 NNNN），场次统计永久磁盘缓存`
用户不希望在客户端看到 API 剩余额度。

## 改动
1. **`lib/process-stats.js`**：`noteZh` 成功态不再拼接日配额/剩余；改为「来自 API-Football 完场技术统计均值；比赛统计已永久缓存到磁盘」。
2. JSON 仍可带 `quota` 字段供运维/调试；`/api/predict-quota` 与服务端日志不变。
3. 版本 bump → **1.9.37**（versionCode **77**）。

## 验证
- 源码与 APK 包内无 `日配额` 用户文案（仅 docs/预测缓存样例可能残留旧字串，不影响实时情报页）。
- 部署后 `/api/match-stats` / `/api/process-stats` 的 `process.noteZh` 不含「日配额」「剩余」。

## APK
`dist/jingcai-predict-1.9.37.apk`（versionCode **77**）→ http://120.77.152.74:8088/jingcai-predict-1.9.37.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.37-prod-pre-20261016-091815
cp -a $B/package.json $B/lib/process-stats.js /opt/jingcai/
cp -a $B/lib/process-stats.js /opt/jingcai/lib/
systemctl restart jingcai
```
