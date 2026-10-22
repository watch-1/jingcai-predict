# 1.9.107 — 阵容缓存加速 + 事件·聊球合并

## 1) 阵容 Tab 打开慢
首发未公布时也会拉 ESPN 事件匹配、上一场 XI、照片匹配，首次点「阵容」常需数秒。

### 方案
- **组装结果缓存**（非仅 ESPN summary）：`data/live-stats/espn/lineup/match-{id}.json` + 内存 Map
- `GET /api/lineup` 优先命中缓存；过期后 **stale-while-revalidate**（最多再服 45 分钟）并后台刷新
- TTL：完场 24h；已公布/进行中近开赛 3min；pending 在开赛前 ~90min 内 3min（捕捉官方首发），其余 20min～2h
- **服务端预热**：在售/赛程开赛前后 36h 内场次，启动 90s 后 + 每 12min `warmUpcoming`（限 24 场）
- **客户端**：打开赛事详情即 `ensureLineup` 预取，点「阵容」走本地 `S.lineupCache`

### 延迟（prod，皇马 vs 莱红牛 `2042112`，Asia/Shanghai）
| | time |
|--|--|
| 强制刷新 miss | ~7.8s |
| 缓存 hit（本机→8088） | ~0.66s（RTT） |
| 缓存 hit（服务器 localhost） | **~3ms** |

文件：`lib/espn-lineup.js`、`server.js`、`public/app.js`

## 2) 聊球 + 事件 → 单一「事件」Tab
- 导航去掉独立「聊球」
- 「事件」：上方事件树，下方 AI 聊球 + 聊球房（复用原 UI/轮询/SSE）
- 旧 `detailTab=chat` / 点聊球 → 打开「事件」并滚动到聊球锚点
- 事件直播刷新只替换树，保留聊天滚动位置
- CSS：`.events-chat-stack` 限制聊天高度，避免压扁事件树

文件：`public/app.js`、`public/style.css`

## 版本
- versionName **1.9.107** / versionCode **144**
- 合作包 versionName **1.9.107-test**
- `sw.js` VER `jc-v1.9.107`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.107.apk | 6750250 | 3fc17568129d28d6cd8a8b39c756fcd9 |
| jingcai-predict-1.9.107-partner.apk | 6750250 | 097a4aaba6a16d06e4557e9422d59ae9 |
| jingcai-predict.apk (→正式) | 6750250 | 3fc17568129d28d6cd8a8b39c756fcd9 |

- http://120.77.152.74:8088/jingcai-predict-1.9.107.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.107-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk
