# 1.9.12 开赛赔率快照

## 功能
临近开赛自动抓取并保存中国体育彩票公开赔率（胜平负 / 让球 / 比分 / 总进球 / 半全场），赛后可在详情「赔率」页查阅。只读展示，无投注/出票。

## 数据源
`getMatchCalculatorV1.qry?poolCode=hhad,had,crs,ttg,hafu`（与现有赛程同源）。**不编造**；官方不再返回则无法补历史。

## 时机
- 开赛前 15 分钟内约每 60s 轮询；滚动保存 `pre-kick`。
- 开赛到达或状态离开 Selling：晋升为 `kickoff`（优先用计算器；否则用最近 pre-kick）。
- 启动时对今日已开赛、尚无快照的场次尝试一次 `backfill`（仅当接口仍返回赔率）。

## 存储 / API
- 目录：`data/odds-snapshots/{date}/{matchId}.json`，保留约 90 天。
- `GET /api/odds-snapshot?matchId=`；`GET /api/odds-snapshot?date=YYYY-MM-DD` 列表。

## UI
赛事详情新增 **赔率** Tab：分区展示胜平负/让球、比分网格、总进球、半全场。未抓取：未开赛提示「开赛后可查看」；历史缺失诚实空态。

## 验证（2026-10-15）
- 在售场 `2041973` 弗鲁米嫩 vs 帕梅拉斯：`had/hhad/crs/ttg/hafu` 齐全（pre-kick 结构验证）。
- API `ok:true`；调度已挂载（启动 ~55s 后 backfill + 每分钟 tick）。

## APK
`dist/jingcai-predict-1.9.12.apk`（versionCode **52**）→ http://120.77.152.74:8088/jingcai-predict-1.9.12.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.12-prod-pre-20261015-061141
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/odds-snapshot.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
