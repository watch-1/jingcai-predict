# 1.9.82 — 澳客风足球元素背景（球纹 / 球场线）

## 产品
为赛事详情头图、球队详情卡、数据中心、顶栏/我的头图等 **扁平纯色区域** 增加极简、低对比的足球元素背景（澳客参考）：
- CSS/SVG 足球纹样水印 + 淡球场线（暗色头图用浅色纹、浅色卡片用深色纹）
- 保持白字/深字可读；绿茵主题下同步适配
- 详情「情报」快捷入口扩为 **2×3 澳客网格**（历史交锋 / 主队战绩 / 客队战绩 / 未来比赛 / 积分排名 / 赛事规则），紫底球纹面板；前三项滚动定位到对应情报区块

## Deploy
- `/opt/jingcai` **1.9.82**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.82.apk`（versionCode **119**）

## 验证
- `curl …/api/status` → `1.9.82`
- 赛事详情 `.hero` / 顶栏可见淡球纹；球队 `.det-hero`、数据中心表格区有浅纹
- 情报 Tab 含 6 个快捷入口与 `intel-hub`

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.82`
- `/style.css` 含 `fx-ball-w` / `intel-hub`；`/app.js` 含 `intelJump`
- APK md5 `ff8f59246afd7888d3a731438f2a2cfd`；HTTP 200 size **6507887**；versionCode **119**
- 备份：`/opt/jingcai/backups/v1.9.81-prod-pre-20261018-080923.tgz`
