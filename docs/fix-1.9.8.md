# 1.9.8 数据中心刷新策略：日更 + 约 6 小时，非分钟级实时

## 结论（给用户）
**不能做成真正的实时（进球瞬间变）。** 数据中心用的是 ESPN 公开接口（无 key、无账单），不是付费直播源。做成「准实时」只会撞限流、拖慢打开速度，收益很小。

**当前策略：**
1. **每天 06:10（北京时间）** 全量刷新 8 个联赛的积分榜 + 射手榜 + 助攻榜。
2. **每 6 小时**再轻量刷一轮（开赛日积分变化能跟上）。
3. **打开数据中心**时：缓存未满 6 小时直接返回；超过 6 小时则先返回旧数据，后台更新（stale-while-revalidate）。
4. 界面标明「ESPN · 日更/约6h」，并显示「X分钟前更新」；文案写清「非分钟级实时」。

## 改动前 TTL
`espn-tables.js` 原先磁盘缓存新鲜窗口约 **3 小时**，无定时任务，全靠用户访问触发。

## 实现
- `lib/espn-tables.js`：`FRESH_MS=6h`、`SWR_MS=24h`；`refreshAll()` / `forceFetch`；刷新日志 `data/live-stats/espn/tables/_refresh-log.jsonl`；响应带 `updatedAt`。
- `server.js`：`scheduleEspnTablesJobs()` —— 算到下一个上海时区 06:10 的 `setTimeout`（可跨重启后重算），`setInterval` 6h，启动 45s 后 `startup` 预热；`GET /api/data-center-status` 返回策略与上次刷新摘要。
- `league-tables.js` / 前端：透传 `updatedAt`，`formatUpdatedAt` 显示相对时间；说明改为「每日自动更新 · 开赛日约6小时刷新」。

## 验证（线上 2026-10-14）
- 服务日志：`next daily refresh in 515 min (06:10 Asia/Shanghai)`。
- 手动 `refreshAll(verify)` → `ok=24 fail=0`（8×3）。
- `/api/topscorers?league=epl` → `updatedAt` 有值，`noteZh` 含日更说明，射手仍为哈兰德@曼城。
- `/api/data-center-status` → policy 文案正确，`lastRefresh` 在全量刷新后有记录。

## 为何不做分钟级
- ESPN 公开接口无 SLA，高频拉易 429/封禁。
- 积分/射手本来就是赛后统计，不是直播事件流。
- 免费、无账单：成本是礼貌限速，不是 API 费用。

## APK
`dist/jingcai-predict-1.9.8.apk`（versionCode 48）→ http://120.77.152.74:8088/jingcai-predict-1.9.8.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.8-prod-pre-20261014-213348
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
本地：`backups/v1.9.8-pre-20261014-213321`
