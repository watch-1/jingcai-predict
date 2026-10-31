# 1.9.262 — 场次卡片加高，横向回到 1.9.260

## 问题
- 用户要的是卡片**纵向**变宽（更高），不是改左右队名对齐。
- 1.9.261 的中心靠拢应撤回。

## 修复
- 横向：`.ls-side` / `.mc-teams` 恢复 1.9.260 贴边对齐；队名 `flex: 1 1 auto`；`--match-mid-col` 仍 120px。
- 纵向：`.mc` / `.ls-row` padding `5px 12px 6px` → `10px 12px 12px`；`.match-meta` 下边距 4px → 8px。进行中/完场同行处理。

## 版本
- **1.9.262** / VERSION_CODE **298**
- Web：部署静态资源即可；原生需重打 APK。

## 测试
- `test/ui-262-test.js`
