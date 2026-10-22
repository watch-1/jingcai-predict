# 1.9.63 球员库浏览改为内部工具

## 变更
- **「我的 → 球员库浏览」已从 App/网页菜单移除**，端用户不可见
- `/db/players`、`/#/player-db`、`/api/player-db/*` **仅**接受环境变量 `PLAYER_DB_VIEW_KEY`（`?key=` 或请求头 `X-Player-Db-Key`）
- **手机号登录不足以访问**；未配置 `PLAYER_DB_VIEW_KEY` 时上述入口一律 **404**（API 同；错误密钥 **403**）
- 内部自用只读工具；不含投注功能
- 私有入口 URL（含密钥）仅保存在所有者部署报告中，不写入公开 UI

## 版本
- Web/服务端：`1.9.63`
- APK：`jingcai-predict-1.9.63.apk` / `jingcai-predict.apk`（versionCode 103）

## 生产验证（2026-10-17 Asia/Shanghai）
- 部署：`root@120.77.152.74:/opt/jingcai`，systemd `jingcai` active，`/api/status` → version **1.9.63**
- 「我的」菜单：**无**「球员库浏览」
- `/api/player-db/overview` 无 key → **403**；错误 key → **403**；正确 `?key=` → **200**
- `/db/players` 无 key → **404**；带正确 key → **302** → `/#/player-db?key=…`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.63.apk`（及 `/jingcai-predict.apk`，versionCode 103）
- 私有浏览 URL（仅所有者）：见部署报告（含 `PLAYER_DB_VIEW_KEY`）
