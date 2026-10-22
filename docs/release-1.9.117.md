# 1.9.117 — 主页去掉主题 tip 与情报条

## 需求
用户：「把主页这两条东西取消显示」
1. 主题 tip pill：「轻奢数据感」+「外观可在「我的 → 设置」中更改并记住」
2. 情报条：「综合情报预测 · 战绩/过程数据/交锋/积分/伤停（若有）+ 赔率参考，生成赛前简报。」

## 改动
- `public/app.js` `pageHome()`：不再渲染 `home-theme-bar` / `home-strip`
- 删除仅服务该 tip 的 `homeThemeToggle()`（设置页 `setTheme` 保留）
- 版本 bump：`1.9.117` / versionCode **154**；`sw.js` VER `jc-v1.9.117`

## 版本
- versionName **1.9.117** / versionCode **154**
- 合作包 versionName **1.9.117-test**
- `sw.js` VER `jc-v1.9.117`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.117.apk | 7829009 | 8cd4469f2762772d6d801125ec6a4991 |
| jingcai-predict-1.9.117-partner.apk | 7829009 | 30602b5e52af702afabbf145056aa346 |
| jingcai-predict.apk (→正式) | 7829009 | 8cd4469f2762772d6d801125ec6a4991 |

- http://120.77.152.74:8088/jingcai-predict-1.9.117.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.117-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.117**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.116-prod-pre-20261022-043136.tgz`
