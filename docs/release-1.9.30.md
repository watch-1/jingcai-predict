# 1.9.30 数据中心：完场触发刷新积分/射手/助攻

## 审计结论（改前）
- 策略：每日 06:10（上海时区）全量 + 每 6 小时全量 + 打开页时 >6h SWR；**无完场触发**。
- 线上日志几乎全是 `startup`（频繁重启）与偶发 `daily-0610`；`interval-6h` 很少出现。
- **Bug**：`scheduleEspnTablesJobs()` 被调用两次 → 双重定时器、双重 startup 拉 ESPN。
- UI「日更/约6h」与「X分钟前更新」本身准确；内容与 ESPN 当前一致，但赛后可能要等下一次 6h/日更才变。

## 改动
1. `lib/espn-tables.js`：`refreshLeagues(keys)` 按联赛刷新；`needsRefresh()`；`lastRefreshInfo` 跳过照片预热噪声。
2. `server.js`：去掉重复调度；startup 仅在缓存缺失/超过 6h 时全量；**每 3 分钟扫描赛果/赛程**，竞彩完场且属于数据中心 8 联赛时，延迟约 4 分钟后刷新该联赛积分+射手+助攻（同联赛 18 分钟冷却，礼貌限速）。
3. UI / `noteZh` / `/api/data-center-status`：文案改为「日更/赛后刷新」。
4. 仍保留每日 06:10 与 6h 全量兜底；不发明数据，只拉 ESPN 公开接口。

## APK
`dist/jingcai-predict-1.9.30.apk`（versionCode **70**）→ http://120.77.152.74:8088/jingcai-predict-1.9.30.apk
