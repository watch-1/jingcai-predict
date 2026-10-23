# 1.9.165 — 赛事详情「事件」不再显示英文 `fetch failed`

## 问题
进行中比赛详情「事件」Tab 偶发白卡片灰字 **`fetch failed`**（Node/undici 上游网络错误原文透传到 `live-stats.detail`）。

## 修复
- **`lib/live-stats.js`**：`upstreamMessageZh` 统一上游错误文案；`afFetch` 捕获网络/HTTP/JSON 失败；已映射场次在上游拉 fixture 失败时 **30 分钟内回退内存缓存**（仍展示事件时间轴）。
- **`public/app.js`**：`liveStatsUserMsg` — 事件 Tab / 绿茵屏不再直接渲染 `error`/`detail`/`eventsError` 英文字段。

## 版本
- Web / `config.js` / `sw.js`：**1.9.165**（`jc-v1.9.165`）
- `VERSION.txt`：**1.9.165** / **VERSION_CODE=202**
- Android：`VERSION_NAME=1.9.165`、`VERSION_CODE=202`

## 部署说明
- **服务端**：部署 `lib/live-stats.js`（及同 PR 的 `server.js` 无变更）后即可消除英文报错并改善短时上游抖动。
- **客户端**：建议发 **1.9.165 APK**（或等待用户刷新 Web/SW），旧包在服务端未升级时仍可能看到英文；升级后双保险。
