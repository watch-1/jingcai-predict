# 1.9.62 球员库浏览 UI（只读）

## Feature
- 登录用户可在「我的 → 球员库浏览」查看 `data/player-match.sqlite`
- 入口 URL：`/db/players`（跳转 `#/player-db`），或 App 内 `#/player-db`
- 概览：场次 / 球员行 / 标签计数、路径、最近入库时间
- 搜索：球员中英文名、队名、matchId；最近场次列表
- 场次下钻：主客球员表（姓名、位置、分钟、进球、助攻、射门、射正、关键传、抢断、评分）
- 球员下钻：近场记录
- 只读；API：`/api/player-db/overview|search|recent-matches|matches/:id|players/:id`
- 访问控制：手机号登录 Bearer，或环境变量 `PLAYER_DB_VIEW_KEY`（`?key=` / `X-Player-Db-Key`）

## 版本
- Web/服务端：`1.9.62`
- APK：`jingcai-predict-1.9.62.apk` / `jingcai-predict.apk`（versionCode 102）

## 生产验证（2026-10-17 Asia/Shanghai）
- 部署：`root@120.77.152.74:/opt/jingcai`，systemd `jingcai` active，`/api/status` → version **1.9.62**
- `/api/player-db/overview` 未登录 → **401**；`/db/players` → **302** → `/#/player-db`
- 入口：App「我的 → 球员库浏览」或浏览器 `http://120.77.152.74:8088/db/players`（需登录）
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.62.apk`（及 `/jingcai-predict.apk`，versionCode 102）
