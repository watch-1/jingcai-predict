# 1.9.244（VERSION_CODE 281）

## Bug：赛后复盘页左右拖动时画面「膨胀」；指标对照两侧字体贴边

用户截图：弗洛西诺内 5:1 莱切 · 意甲 · 赛后复盘 Tab。
1. 在复盘页左右拖动，整个画面出现明显的拉伸/膨胀（橡皮筋回弹感）。
2. 「指标对照」表两侧的数字和表头几乎贴住屏幕左右边缘。

**根因**
- `body` 只设置了 `overscroll-behavior-y: contain`，横向没有任何 overscroll 防护。Android 12+ WebView 对横向 overscroll 使用「stretch」视觉效果：一旦横向拖动传到根滚动容器，整页内容会被视觉拉伸，看起来就是「画面膨胀」。
- 复盘页内容面板 `.detail-pane--review` 为 `overflow-x: visible`，宽表（`.pmr-table` `min-width: 480px`，外层 `.pmr-table-wrap` `overflow-x: auto`）横滑到头后，拖动继续向页面链式传播（scroll chaining），触发上述根级拉伸；复盘页粘性标签条 `.dtabs` 也是 `overflow-x: auto`，同样会把到头的拖动传出去。
- 贴边：1.9.142 为了铺满宽表，给复盘页的 `.pmr-table-wrap` 加了 `margin-left/right: -4px` 负外边距，叠加表格单元格仅 `padding: 6px 4px`，首尾列距屏幕边缘只剩约 8px。

**修复（仅 CSS，不改数据/逻辑，不伪造指标）**
- `html` / `body` 增加 `overscroll-behavior-x: none`：页面本身不横滑，彻底关掉横向 overscroll 拉伸。
- 复盘页根 `.view.sub.md-wrap--review` 与内容面板 `.detail-pane--review`：`overflow-x: clip` + `overscroll-behavior-x: none`（面板原 `overflow-x: visible` 改为 `clip`；用 `clip` 而非 `hidden`，避免把面板变成新的滚动容器影响粘性标签条）。
- 宽表外层 `.pmr-table-wrap`：保留 `overflow-x: auto` 横滑能力，新增 `overscroll-behavior-x: contain`（滑到头不再把拖动链式传给页面）和 `touch-action: pan-x pan-y`（只允许平移手势）。复盘页标签条 `.dtabs` 同样加 `overscroll-behavior-x: contain`。
- 贴边：去掉复盘页 `.pmr-table-wrap` 的 `-4px` 负外边距（恢复 `.dsec` 的 12px 内边距），并给指标对照表首列加 `padding-left: 8px`、末列加 `padding-right: 8px`，两侧有效留白约 20px，与其它详情 Tab 的卡片内边距观感一致。竖向滚动不受影响。

**测试**
- 新增 `test/ui-244-test.js`：
  - `html`/`body` 含 `overscroll-behavior-x: none`；
  - 复盘根与 `.detail-pane--review` 为 `overflow-x: clip` + `overscroll-behavior-x: none`，且面板不再是 `overflow-x: visible`；
  - `.pmr-table-wrap` 保留 `overflow-x: auto`，并含 `overscroll-behavior-x: contain` 与 `touch-action: pan-x pan-y`；复盘 `.dtabs` 含 `overscroll-behavior-x: contain`；
  - 复盘页 `.pmr-table-wrap` 左右外边距为 0（负边距移除），指标表首/末列有 8px 边缘内边距；
  - 版本号 1.9.244 / VERSION_CODE 281 在 VERSION.txt、package.json、config.js、sw.js、build-apk.sh 同步。

**既有失败（与本次无关，main 基线同样失败）**
- `market-value-match-test`（缺外部 `data/market-value/index.json.gz` 数据包）、`ui-166`/`ui-193`/`ui-199`（陈旧断言，main 上同样失败）。
