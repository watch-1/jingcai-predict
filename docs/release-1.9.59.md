# 1.9.59 赛程水分 / 硬仗检验 / 自有记忆（闭环）

## 产品意图
1. 软赛程灌水的过程场均，不能直接外推「弱队能打强队」。
2. 完场后对比 **本场 vs 近场均值**；若对手强/赛程软 + 多项过程崩盘 → 标记 **水分大**，写入自有记忆。
3. 下次预测该队时，优先展示「自有检验」，过程倾向遇水分记忆则降权，避免千篇一律套 API。

## 实现（仅 API-Football + 本地；未接 Opta/StatsBomb）

### A) 球队证据库
- `lib/team-evidence.js` + `data/team-evidence.json`（按 sporttery 队 id）
- 字段：matchId / date / opponent / opponentStrength(SI) / scheduleSoftnessBefore / 本场vs近场 deltas / moistureTag(高|中|低|—) / mechanismTags / briefSummaryZh / createdAt
- 完场复盘 FT+技术统计成功后由 `post-match-review` 自动写入

### B) 赛后复盘
- 新增「硬仗检验」：双侧本场 vs 近场均值表 + 水分/硬仗/赛程软硬标签
- 本地规则判定水分（多指标崩盘）；AI 叙事仍走原 DeepSeek 路径，不额外耗 token
- `needsReviewUpgrade`：有完场统计但缺 `hardTest` 时重建

### C) 赛前预测
- 过程节展示 **赛程软/硬**（SoS avgSi）+ 软赛程对强提示
- 「自有检验」卡：最近 1–3 条硬仗/水分记忆
- `processLean` 若偏向软赛程且记忆为水分大 → 降权为接近并标「过程误导」

### D) SoS 补强
- 联赛名「欧罗巴」纳入欧联 SI；对手强度可用 crests 英文名回退查找

## 版本 / 部署
- Web + 服务端：`1.9.59`
- APK：`jingcai-predict-1.9.59.apk` / `jingcai-predict.apk`（versionCode 99）

## 验证
1. **完场**：马赛 vs 奥林匹亚（2041983）→ 赛后复盘见「硬仗检验」；`data/team-evidence.json` 含 182/286。
2. **未开赛**：任选有过程数据的在售场 → 过程节见赛程软/硬；若该队有水分记忆则见「自有检验」。
3. 打开预测简报：不应出现英文 Lean 码；水分降权文案为中文。
