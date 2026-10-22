# 1.9.60 硬仗检验「暂无」修复 + AI赛前解读

## Bug A — 硬仗检验裸「暂无」
- **根因**：赛果路径丢掉 `homeTeamId`/`awayTeamId`（空串）时，`buildEpisodeForSide` 直接 `return null`，而对照表仍用 `deltas` 渲染 → 双侧硬仗盒显示「暂无」。
- **修复**：
  1. `ensureTeamIds` 从 `schedule-seen` / odds-snapshots / crests 回填队 id
  2. 有 deltas 即可建 episode（缺 id 用合成 key，记忆库跳过 `name:`）
  3. `renderHardTestHtml` 缺 ep 时现场重建；有实际+近况时永不裸「暂无」（含「不作硬仗水分定性」）
  4. 缓存命中 soft-repair + `needsReviewUpgrade` 触发

## Feature B — AI赛前解读（DeepSeek）
- `lib/deepseek-prematch.js`：打包盘口/近况/过程(含SoS)/交锋/伤停/硬仗记忆/本地表态 → 一次低 token 调用
- 输出：判断方向 + 信心 + 中长文纯中文（≥6 行，禁英文 Lean 码）
- 本地 lean / 62% 选择性表态为真相源；AI 对齐解说，不发明赔率
- 证据过薄跳过；磁盘强缓存；默认后台生成不阻塞首屏；预测页轮询 pending
- 预测页「AI赛前解读」块

## 版本
- Web/服务端：`1.9.60`
- APK：`jingcai-predict-1.9.60.apk` / `jingcai-predict.apk`（versionCode 100）

## 验证
1. 弗洛西诺 vs 萨索洛（2042008）赛后复盘 → 硬仗检验双侧有水分标签/摘要，无裸「暂无」
2. 任选未开赛且过程数据较全的在售场 → 预测页见「AI赛前解读」（或先「生成中」再刷新出现）

## 生产验证（2026-10-17 Asia/Shanghai）
- 部署：`root@120.77.152.74:/opt/jingcai`，systemd `jingcai` active，version 1.9.60
- 硬仗修复脚本：scanned 18 / fixed 17（含 2042008 弗洛西诺/萨索洛 → 双侧「非硬仗样本」+「不作硬仗水分定性」，无裸「暂无」）
- AI：埃弗顿 vs 切尔西（2042024）、威尼斯 vs 那不勒斯（2042028）均生成「AI赛前解读」中长文
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.60.apk`（及 `/jingcai-predict.apk`）
