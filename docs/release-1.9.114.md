# 1.9.114 — 球队赛程紧凑排版（短队名贴比分）

## 问题
1.9.113 后球队详情「未来/过去」场次卡：短队名（里尔 / 曼城 / 雷恩）被 `1fr | auto | 1fr` 侧栏 + `justify-content` 外推 + `.fx-name{flex:1}` 拉满，队名贴屏幕两侧、中间比分两侧大片空白。

## CSS 策略
保留三列 grid `minmax(0,1fr) auto minmax(0,1fr)`（两侧仍可吃剩余宽度），但：
1. **主队侧** `justify-content: flex-end`（内容朝比分靠）
2. **客队侧** `justify-content: flex-start`（内容朝比分靠）
3. **队名** `.fx-name { flex: 0 1 auto }`（按内容宽度，禁止再 flex-grow 把字撑到外缘）
4. **顶栏** 联赛改为 `flex: 0 1 auto`，日期+联赛左贴；胜/平/负仍 `margin-left:auto` 贴右

不改 HTML 结构 / 不碰组装缓存 / 联赛中文逻辑沿用 1.9.113。

## 版本
- versionName **1.9.114** / versionCode **151**
- 合作包 versionName **1.9.114-test**
- `sw.js` VER `jc-v1.9.114`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.114.apk | 7414784 | bf8ab78c032e66503e01a6668bb39525 |
| jingcai-predict-1.9.114-partner.apk | 7414784 | 1309657c8073beab5220d52ad46e57a3 |
| jingcai-predict.apk (→正式) | 7414784 | bf8ab78c032e66503e01a6668bb39525 |

- http://120.77.152.74:8088/jingcai-predict-1.9.114.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.114-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.114**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.113-prod-pre-20261022-031759.tgz`
