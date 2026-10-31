# 1.9.257（VERSION_CODE 293）

## 赛程「全部」按竞彩编号排序，取消联赛分块

用户反馈：赛程界面希望按编号顺序排列，而不是按联赛类型。截图中「全部 28」下列表先出现「意甲 3 场」区块（009、021、025），再出现「德甲 6 场」（010…），全局编号被联赛分组打断。

**根因（客户端 `public/app.js`）**
- `scheduleListRows` 已按 `_kind`（未结束优先）+ `matchNumSortKey`（场次末尾数字）排序。
- `scheduleBodyHtml` 在 `S.schLeague === '全部'` 时又把已排序行按 `league` 重新分组成 `lg-group` 区块，导致全局顺序变回「联赛块」而非 009→010→011…
- 服务端 `/api/matches` 已按 `businessDate` + `num` 排序，无需改 server。

**修复**
- 「全部」与单联赛筛选均输出同一套平铺 `ls-list`；联赛名仍显示在每条 `scoreCard` 行内。
- 联赛筛选 chips 不变；计算器 tab 本就使用 `scheduleListRows` 平铺列表。

**测试**
- `test/admin-257-test.js`、`test/ui-257-test.js`

**发布**
- 合并后请执行 APK 重建（`npm run build:apk` 或 CI），用户可见 UI 变更。
