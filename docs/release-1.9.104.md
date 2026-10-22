# 1.9.104 — 未来比赛过滤已过期场次

## 问题
情报「未来比赛」sheet / 后续赛程卡片取自 `S.schedule` + `S.matches`（竞彩在售 + `schedule-seen` 约 14 天缓存）。
`nextFixturesFor` 只排除 `m.full` 与本场 `excludeId`，**未按 kickoff > now 过滤**。
缓存中大量已开赛行没有比分回填（结果窗口 `RESULT_DAYS=3`，更早 Finished 行常 `full=null`），按开赛时间升序截断后就会把 10 天前的场次当成「未来」。

复现（2026-10-21，科莫 vs 曼联 `2042109`）：弹出 10-11 罗马 / 10-14 费耶诺德、10-10 热刺 / 10-13 马竞 —— 与线上缓存完全一致。

## 修复
- `public/app.js` `nextFixturesFor`：要求 `kickoff(m) > Date.now()`（`kickoff` 已按 Asia/Shanghai +08），并跳过 Finished/完场等状态。
- `lib/predict-report.js` `nextFixturesFromPool`：同上，避免预测报告「后续赛程」同样陈旧。

## 说明
- 数据源仍是「当前在售与赛程缓存」，不是 AF 全量未来赛程；过滤后若在售窗口内该队无其它未赛场次，会显示「暂无后续场次」（科莫/曼联本场即双方在售窗口内唯一彼此未赛场次时属正常）。

## 版本
- versionName **1.9.104** / versionCode **141**

## Live artifacts (2026-10-21 Asia/Shanghai)

| File | Size | MD5 |
|------|------|-----|
| jingcai-predict-1.9.104.apk | 6,586,183 | 00e08dcdc10f9e93a4c0e8896e521549 |
| jingcai-predict-1.9.104-partner.apk | 6,586,183 | 857013c68447bce4897ea2c0d6aea22d |
| jingcai-predict.apk | 6,586,183 | 00e08dcdc10f9e93a4c0e8896e521549 |

- http://120.77.152.74:8088/jingcai-predict-1.9.104.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.104-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionName **1.9.104** · versionCode **141**

## Deploy
- `/opt/jingcai` **1.9.104**，`sw.js` VER `jc-v1.9.104`，`android/build-apk.sh` defaults 1.9.104/141
- APK www 内嵌 `nextFixturesFor` 的 `kickoff(m) > now` 过滤（已用 `unzip -p … assets/www/app.js` 核对）
