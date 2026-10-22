# 1.9.70 — 预测 AI 文案产品化（去掉内部/开发者口吻）

## 问题
预测页「AI赛前解读」出现工程/元话语，例如：
- 「自有球员近场表显示…」「已引用自有球员近场表」
- 「全文仅此一句」
- 「本地规则为真相源；AI 仅作中文解说。不含投注建议。」

## 修复策略（优先展示层清洗，避免大规模 DeepSeek 重生成）
1. **展示清洗** `scrubNarrativeZh` / `productizeAiPrematchDisplay`：旧缓存 narrative + HTML 在服务端下发时改写
2. **客户端兜底** `productizePredictHtml`：预测 Tab 渲染前再 scrub 一次
3. **Prompt 产品化**：新生成禁止上述元话语；球员表述改为「近几场球员表现显示…」
4. **页脚**：统一为「以上为数据分析，仅供参考」
5. **`AI_PREMATCH_REV` 保持 3**：不触发全量 AI 重跑；旧文案靠清洗即时变干净

## 文案对照（AI 块）
| | Before | After |
| --- | --- | --- |
| 球员引用 | 自有球员近场表显示… / 已引用自有球员近场表 | 近几场球员表现显示…（角标删除） |
| 盘口元句 | …全文仅此一句 | 一句自然盘口短评，无元说明 |
| 页脚 | 本地规则为真相源；AI 仅作中文解说。不含投注建议。 | 以上为数据分析，仅供参考 |
| 小标题 | DeepSeek · 对齐本地表态 | 数据分析 |

## 涉及文件
- `lib/deepseek-prematch.js` — scrub / prompt / `renderAiPrematchHtml` / productize
- `lib/predict-report.js` — 缓存加载时 productize；简报头「仅供参考」
- `lib/player-match-db.js` — noteZh 产品化；evidence 键「近几场表现表」
- `lib/team-evidence.js` / `lib/post-match-review.js` — 去掉「本地规则」「不含投注建议」口吻
- `public/app.js` — `productizePredictHtml`
- `public/style.css` — 隐藏 `.pr-ai-slice-note`
- `public/sw.js` / `public/config.js` / `package.json` / `android/build-apk.sh` — **1.9.70** / versionCode **108**

## 旧缓存
- **自动清洗**：读缓存即 scrub narrative + 重渲 AI 块 HTML，无需用户点刷新、无需 DeepSeek
- 客户端 SW/内存里若仍有旧 HTML，预测 Tab 再 scrub 一次；硬刷新或装新 APK 更干净

## Live verify（2026-10-17 Asia/Shanghai）
- 缓存场次 `2042040`（博洛尼亚 vs 国际米兰）：`/api/predict-report` 返回 narrative 已把「自有球员近场表显示」→「近几场球员表现显示」；页脚为「以上为数据分析，仅供参考」；无「全文仅此一句 / 真相源 / 本地规则 / 已引用…」
- `AI_PREMATCH_REV` 仍为 **3**（未触发全量 DeepSeek）

## Deploy
- `/opt/jingcai` **1.9.70**，systemd active
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.70.apk`（versionCode **108**）
