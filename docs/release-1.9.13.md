# 1.9.13 赛前赔率分层近实时刷新

## 旧行为（1.9.12）
- 赛程/预测：`/api/matches` HAD/HHAD **固定约 3 分钟**缓存（有请求才刷新）。
- 详情「赔率」Tab：主要展示 **开赛快照**；开赛前 15 分钟内才为快照轮询全玩法，易被理解为「不开实时」。
- 开赛后冻结快照（保留）。

## 新行为
**服务器唯一轮询器**拉取全玩法计算器（HAD/HHAD/CRS/TTG/HAFU），全客户端共享缓存：

| 距开赛 | 刷新间隔 |
|--------|----------|
| >6h | ~45 分钟 |
| 6h–2h | ~12 分钟 |
| 2h–30min | ~5 分钟 |
| 末 30 分钟 | ~1.5 分钟 |
| 开赛后 | **停止** live；只保留开赛快照 |

- `GET /api/odds-live?matchId=` → 赛前全玩法 + `updatedAt` / `tier`
- `GET /api/odds-live?status=1` → 轮询器状态
- 详情「赔率」：开赛前显示 live +「X分钟前更新」，Tab 打开时约每 60s SWR（`ensureOddsLivePoll`）；开赛后改快照
- 同一次 live 拉取会写入临近开赛的 `pre-kick` 快照（不额外打官方）
- 遇 403/429/EdgeOne：**退避 10 分钟**
- HAD/HHAD 赛程缓存：靠近开赛时可短至约 90s（仍共享、非每用户）

## 压力说明
- 全站 **1 个** sporttery 全玩法拉取任务；客户端不直连官方。
- 远离子：45 分钟/次；末段才升到 ~1.5 分钟。
- 计算器当前在售场次通常很少（个位数～数十），单次响应轻。

## APK
`dist/jingcai-predict-1.9.13.apk`（versionCode **53**）→ http://120.77.152.74:8088/jingcai-predict-1.9.13.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.13-prod-pre-20261015-062855
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
