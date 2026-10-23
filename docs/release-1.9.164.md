# 1.9.164 — 数据中心积分榜窄屏列裁切修复

## 背景

数据 → 球队 → 积分榜在约 360px 宽手机上，右侧「进/失」「积分」列被卡片 `overflow: hidden` 裁切，数字只剩半截。

## 改动

1. **`public/style.css`**：积分榜表 `table-layout: fixed` + 百分比列宽；队徽缩至 26px、队名 `ellipsis`；赛/胜/平/负/进失/积分列收紧字号与内边距。球队身价榜 `dc-mv` 同步 fixed 布局防溢出。
2. **`public/app.js`**：积分榜表头/单元格增加 `dc-st` / `gfga` 类便于列宽控制。

## 版本

- Web / `config.js` / `sw.js`：**1.9.164**（`jc-v1.9.164`）
- `VERSION.txt`：**1.9.164** / **VERSION_CODE=201**
- Android：`VERSION_NAME=1.9.164`、`VERSION_CODE=201`

## 验证

```bash
node test/ui-164-test.js
npm test
```

真机：数据 → 球队 → 荷甲/英冠积分榜，最右「积分」列应完整可见。
