# 1.9.193 比赛态度卡片滚动包裹渐变（图2→图3）

## 意图
- 每张平台简报卡根据**在列表中的垂直位置**连续插值，而非「靠近顶部才变蓝」。
- **图2（融合）**：贴近 feed 顶部的卡片，浅蓝包裹与灰底融为一体、边界弱。
- **图3（独立）**：越靠下的卡片，蓝色光晕越强、白底与背景对比越清晰。

## 实现
- `homeAttitudeCardGlow(card, anchorY)`：`anchorY = #homeAttitudeFeed` 顶边；`offset = card.top - anchorY`。
  - `offset = 0` → `--ha-card-glow = 0`（图2）
  - `offset` 增大至约 `max(cardHeight×0.9, 108px)` → `g → 1`（图3，smoothstep 缓动）
  - `offset < 0`（卡片滚出 feed 顶上方）→ `g` 回落，避免顶栏外残留高对比。
- CSS：`--ha-g` 同时驱动 `::before` 径向光、卡片底色 `color-mix`、边框与 `box-shadow` 分离感。
- 保留 1.9.192：无区块级渐变、Tab 切换 `requestAnimationFrame` 重算、紧凑 Tab + `match_vote` 过滤。

## 版本
**1.9.193** / **VERSION_CODE=230**

## 自测
1. 首页「比赛态度」上下滚动：首张偏融合，向下每张逐渐更「独立蓝包裹」。
2. Tab 与「圈子热议」切换无整块闪蓝。
3. `node test/ui-193-test.js`
