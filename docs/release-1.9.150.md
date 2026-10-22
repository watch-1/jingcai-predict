# 1.9.150 赛事详情去掉「隐形页眉」占位

## 根因
- 1.9.88 起 `.hero > * { position: relative }` 覆盖了 `.hero-edge-nav` 的 `position: absolute`，回退/关注落入 `padding-top: safe-area + 工具条` 预留区，状态栏下出现大块死蓝（像隐藏页眉仍占高）。

## 变更
1. **赛事详情 hero**：改为流式顶栏——`hero-edge-nav` 与联赛 meta/球队同一列，仅从 `env(safe-area-inset-top)` 起算一次内边距；去掉为绝对定位工具条预留的 hero 顶 padding。
2. **CSS 修复**：`.hero > *` 排除 `.hero-edge-nav`；`.view.sub.md-wrap` 显式 `padding-top: 0`。
3. **回退钮**：增加 `.md-back` 类，便于 UI 测量。
4. **UI 测试**：注入 `--sat: 24px`，断言 `md-back` 顶距 ≤ sat+8、hero 高度 < 170px、详情页不占 top-chrome 高度。

## 版本
- Web / `config.js` / `sw.js`：**1.9.150**（`jc-v1.9.150`）
- `VERSION.txt`：**1.9.150** / **VERSION_CODE=187**
- Android 默认：`VERSION_NAME=1.9.150`、`VERSION_CODE=187`

## 验证
1. 真机/Android：赛事详情回退与「关注」上沿紧贴状态栏下沿（红线），无整行空蓝。
2. `node tools/ui-test.js` 通过。
