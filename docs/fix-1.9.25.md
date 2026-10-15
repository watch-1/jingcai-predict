# 1.9.25 Bugfix

## Bug 1 — 赛后复盘有概率丢失一侧近况/Δ
**现象**：罗马 vs 皇马 3:4，指标对照主队本场有值、近况与 Δ 全是「—」；过程 vs 近况基线只写客队。注记「基线取自近期滚动过程均值。无赛前预测缓存。」

**根因**：
1. 复盘生成时罗马 sporttery `132` 仍映射到错误 AF `22590`（斯洛文尼亚 Roma），滚动近况拉取失败；皇马侧正常 → 写入单向基线缓存。
2. `loadBaselines` 在赛前简报仅有一侧时会 early-return，不会为缺失侧补滚动均值。
3. `buildReview` / API 对 `ok` 缓存无条件命中，映射纠正后不会自动重建。

**修复**：
- `loadBaselines`：按侧合并赛前简报 + 滚动；缺侧再 `getTeamRolling` 重试映射；记录 `missingSides`。
- `needsBaselineBackfill`：有本场统计却无近况基线时强制重建。
- 已对 prod `2041968` 自动 backfill：双侧近况/Δ 齐全，过程文案含罗马与皇马。

## Bug 2 — 刚结束比赛「赛后复盘」Tab 要反复点才显现
**现象**：霍芬海姆 vs 贝西克塔斯 2:3，头栏仍「已开赛 · 待开奖」；情报/赔率首次打开可能看不到「赛后复盘」；切换 Tab 后才出现，内容偶发白屏。

**根因**：
1. `isMatchFinished` 只看赛果行 / `liveStatsCache` FT，而 `liveStats` 仅在「数据/聊球」Tab 才加载 → 情报/赔率首屏判定未完场，Tab 栏不插入复盘。
2. 切到数据后加载了 FT，但只重绘 pane，不重绘 `.dtabs`，需再点一次才 `render()` 出 Tab。
3. 头栏 `matchHero` 在无官方赛果对象时固定「已开赛 · 待开奖」，忽略绿茵屏已完场比分。

**修复**：
- `isMatchFinished` 兼认 `liveScores.finished` 与 live-stats FT/非直播有比分。
- 开球后任意 Tab 预热 `loadLiveStats`；FT 后 `refreshDetailTabs` 立刻插入「赛后复盘」。
- `ensureMatchStatusPoll` 完场前轮询状态，无需手动 thrashing。
- `matchHero` 展示 live/FT 比分与状态；复盘 Tab 加载中/失败有明确文案。
