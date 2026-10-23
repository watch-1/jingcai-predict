# 1.9.163 — 赛事详情 Tab 栏滚动穿透修复

## 背景

赛事详情向上滚动时，数据 Tab 白卡（如「绿茵屏」）会叠在固定 Tab 条（态度 / 情报 / 赔率 / 数据…）文字上，Tab 底未完全遮挡下层内容（层叠 / 背景 / sticky 偏移问题）。

## 改动

1. **`public/style.css`**（`.view.sub.md-wrap` / `--review`）：
   - Tab 条 `position: sticky; top: 0; z-index: 32; isolation: isolate`，全宽不透明白底，`overflow-y: hidden`。
   - Tab 按钮默认 `background-color: #fff`（选中仍为 `#fff7f0`）。
   - `.detail-pane` 设 `position: relative; z-index: 0`，滚动内容从 Tab 条下方穿过。
   - Hero 保持 `z-index: 1`，低于 Tab 条；pitch 主题下 Tab 条/按钮使用深色实底。
2. **`test/ui-163-test.js`**：CSS 回归断言。

## 版本

- Web / `config.js` / `sw.js`：**1.9.163**（`jc-v1.9.163`）
- `VERSION.txt`：**1.9.163** / **VERSION_CODE=200**
- Android：`VERSION_NAME=1.9.163`、`VERSION_CODE=200`

## 验证

```bash
node test/ui-163-test.js
npm test
```

真机：进入任意赛事详情 → 数据 Tab → 向上滑动，白卡应消失在 Tab 条下方，Tab 文案不被内容盖住。
