# 1.9.129 — 开奖/详情防闪 + 深蓝包裹试装

## 用户诉求
1. **修闪**：开奖页狂点日期/联赛 chips，赛事详情狂点 Tab，会短暂闪出深蓝底盖住白列表（Fig2）——视为 bug。
2. **再改设计**：修完后，列表区改为白卡浮在**深蓝包裹**上（分层分离），深蓝对齐 Fig3 赛事详情队标区；出一版试装 APK 由用户看观感。

## 根因
同路由频繁 `render({ force: true })` → `applyViewHtml` 走子页 **paint-hold**：
1. `#view` 加 `.paint-hold` → 背景整屏 `#1B2A4A`（与 html/body/app 启动海军蓝一致）
2. `innerHTML` 清空白底内容 → 露出海军蓝（Fig2 闪）
3. 两帧 rAF 后去掉 paint-hold，白列表回来

1.9.124–128 的 curSig / paint-hold 防的是冷启动/Tab 切换；**开奖 chips 与 detailTab 仍整页替换**，故狂点必闪。

## 修复（防闪）
- **开奖**：`softPatchResults()` — 就地更新 `#dstrip` / `.chips` / `#rsBody`，不再 wipe `#view`
- **赛事详情 Tab**：`softPatchDetailTab()` — 只改 `.dtabs` 选中态 + `#detail-pane-*`，保留 hero/header
- 回退路径：`applyViewHtml(..., softSame)` 同路由重建也不再套 navy paint-hold

## 设计（深蓝包裹）
- 采样 Fig3 队标区 ≈ `#182643`；与现有 `--pri-d` / `.hero` 底 **`#1B2A4A`** 一致（Fig2 闪底同色）
- CSS `--wrap-navy: #1B2A4A`
- `.view.sub.rs-wrap`（开奖）、`.view.sub.md-wrap`（详情）：列表/内容区海军蓝；白卡保留圆角阴影；chips / `.dtabs` 维持白条（Fig2）
- 未改投注相关逻辑

## 版本
- versionName **1.9.129** / versionCode **166**
- 合作包 versionName **1.9.129-test**
- `sw.js` VER `jc-v1.9.129`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.129.apk | 9516040 | 86b7ec987e249cdfc5749cd712fc50c8 |
| jingcai-predict-1.9.129-partner.apk | 9516040 | d2550d1b32ea26e1f27911700e2e7885 |
| jingcai-predict.apk (→正式) | 9516040 | 86b7ec987e249cdfc5749cd712fc50c8 |

- http://120.77.152.74:8088/jingcai-predict-1.9.129.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.129-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.129**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.128-prod-pre-20261022-221504.tgz`
- 客户端：`public/app.js`、`style.css`、`sw.js`、`config.js`、`index.html`、`package.json`
- 服务端业务逻辑未改

## 验证建议
- 开奖：狂点日期/联赛 chips —— **不应再闪**整屏深蓝盖白卡；稳态为白卡浮在 `#1B2A4A` 上
- 赛事详情：狂点态度/情报/赔率/数据等 Tab —— 同上；内容区深蓝与队标区同色
- 观感由用户拍板（仅此一版试装）
