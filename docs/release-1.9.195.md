# 1.9.195 比赛态度列表顶卡片可读边界

## 问题
1.9.194 在 `--ha-card-glow: 0`（贴近 `#homeAttitudeFeed` 顶部的卡片）时，边框/阴影与暖灰底对比过弱，列表头部卡片几乎「融进背景」；列表下方因 `g` 更大而边界更清晰。

## 实现
- 在 `.ha-card` 增加 **g=0 边界下限**（仍低于 `g→1` 的银灰边与阴影）：
  - `--ha-edge-border-soft: rgba(198, 190, 180, .82)`
  - `--ha-edge-shadow-a0: .026` / `--ha-edge-shadow-b0: .052`（`g=1` 仍为 `.035` / `.078`）
  - `--ha-edge-bg-blend: 20%`（原 34% 暖金混白，顶卡更偏白）
- 保留淡金→银灰 `::before` 与 `homeAttitudeCardGlow` 滚动插值，未改 Tab / `match_vote` 过滤。

## 版本
**1.9.195** / **VERSION_CODE=232**

## 自测
1. 首页「比赛态度」列表顶部：每张卡可见 1px 暖灰边 + 轻阴影。
2. 向下滚动：下方卡片仍比顶部更清晰（银边 + 更强阴影）。
3. `node test/ui-195-test.js`；`node test/ui-194-test.js` …
