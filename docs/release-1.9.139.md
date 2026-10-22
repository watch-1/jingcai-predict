# 1.9.139 比赛态度同源（平台简报 ↔ 专栏帖）

## 产品
- 首页「比赛态度」与单场详情 **态度** 页展示同一套 **平台简报** `column_posts`（按 `matchId` 关联），不再仅首页用 `effectivePredict` 旁路渲染。
- 态度卡片展示真实元数据：**近N中M / 单选比例**（完场结算或复盘 lean-feedback 样本，样本不足时标 **样本不足**）、**人已购**（`purchase_count`）、**云朵** 解锁价（平台简报默认 **18** 云朵，走现有 `colBuy` 流程）。
- 免费 teaser 在卡片上可见；全文经云朵解锁（与用户付费态度帖一致）。

## 技术
- 新增 `lib/platform-attitude.js`：系统作者「平台简报」、`predict-report` 缓存写入时 upsert 态度帖、feed 按 `author=platform` / `matchId` 同步。
- 平台战绩优先来自已结算的平台表态帖；不足 3 场时回退 `data/history/lean-feedback.json` 的额外表态样本，仍不捏造命中率。

## 版本
- `config.js` / `sw.js` **1.9.139**；Android 默认 `VERSION_NAME=1.9.139`、`VERSION_CODE=176`。

## 验证
1. 首页比赛态度卡片显示 人已购 / 云朵价 / 战绩或「样本不足」。
2. 点进该场 → **态度** 页出现同一条平台简报（非空）。
3. 云朵解锁后正文与专栏帖详情一致。
