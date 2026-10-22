# 1.9.128 — 开奖日期/联赛筛选点击无响应

## 问题
用户：开奖页顶部日期 chips（周六10-17…今天10-22）与联赛 pills（全部/欧冠/亚冠精英/英冠）点击无任何反应；列表仍停在 2026-10-13。

## 根因（与 1.9.125/126 同型）
1.9.124/125 引入 `render()` 同路由 + `curSig` 短路（防闪）。
- 赛程 tab 的 `tabContentSig('schedule')` **已包含** `schDate` / `schLeague`，故赛程筛选正常。
- 开奖是子页 `#/results`，`curSig` 仅为 `results::{}`，**不含** `S.rsDate` / `S.rsLeague`。
- 点击 `data-rdate` / `data-rlg` 会改 state 并 `render()`，但 hash 不变且 sig 不变 → **early return 空操作**。
（1.9.126 已对赛事详情 `detailTab` 做过同类修复。）

截图中日期条显示近几天、正文却是 10-13：默认选中「最近有结果的期」常为更早日期，chip「on」可能滚出可视区；点「今天」本应切换，却被上述短路吞掉。

## 修复
- `curSig`：`results` 路由纳入 `results.length`、`schedule.length`、`rsDate`、`rsLeague`。
- `data-rdate` / `data-rlg`：`render({ force: true })`（与 detailTab 一致，双保险）。

## 版本
- versionName **1.9.128** / versionCode **165**
- 合作包 versionName **1.9.128-test**
- `sw.js` VER `jc-v1.9.128`

## 验证
- 开奖页点日期 chip：选中态移动，列表 meta 日期与场次随日期变。
- 点联赛 pill：列表按联赛过滤；「全部」恢复。

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.128.apk | 9327240 | c065b13508e2e4700139a3b6cd1b7fee |
| jingcai-predict-1.9.128-partner.apk | 9327240 | b62c0ba73fe2e1d93b988b48528d14a8 |
| jingcai-predict.apk (→正式) | 9327240 | c065b13508e2e4700139a3b6cd1b7fee |

- http://120.77.152.74:8088/jingcai-predict-1.9.128.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.128-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.128**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.127-prod-pre-20261022-212229.tgz`
- 仅客户端 `public/app.js`（+ sw/config/index/package）；服务端逻辑未改
