# 1.9.261 — 未开赛队名块向中心靠拢

## 问题
- 1.9.259/260 只加宽 `--match-mid-col`，两侧仍是 `flex-start` / `flex-end` 贴边，队名到队名的间距 ≈ 卡片宽 − 主客内容，中心加宽看不见。
- 用户指定懂球帝式参考：徽+名整组内收，左右留白对称，VS/比分居中。

## 修复
- `.ls-side.h` / `.mc-teams .t.h` → `flex-end`；客队 → `flex-start`。
- 队名 `flex: 0 1 auto`，整组按内容收缩后再靠中；长名仍 ellipsis。
- 中心轨仍是 `--match-mid-col: 120px`，VS 与 live/FT 比分共用。

## 版本
- **1.9.261** / VERSION_CODE **297**
- Web：部署静态资源即可；原生需重打 APK。

## 测试
- `test/ui-261-test.js`
