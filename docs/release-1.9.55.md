# 1.9.55 赛后复盘 AI 归因补跑（players_pending 卡死）

## 根因
1. 完场复盘常在「技术统计已有、球员包尚未落盘」时先生成，DeepSeek 路径打上 `aiAttribution.reason=players_pending`。
2. 失败一律按 6 小时退避，球员缓存随后就绪也不会再调 AI。
3. `/api/post-match-review` 在缓存完整时直接 `return`，绕过 `buildReview` 的 AI 补层。

用户看到的是规则模板「主因/备选」文案，而非 DeepSeek「AI解读」长叙事。

## 修复
- `server.js`：缓存命中若 `needsAiEnrich` 仍为真，继续走 `buildReview` 补 AI，不再盲返回。
- `lib/deepseek-review.js`：`players_pending` 软重试——球员盘缓存一就绪立即重试；约 8 分钟后再探；约 45 分钟仍无球员则允许空球员包调用，避免永久卡死。硬失败仍 6 小时退避。
- 部署后对今日完场且缺 AI 的场次触发补跑（含登博思 vs 奥斯）。

- `collectAllowedNumbers` 纳入球员分钟/评分等，避免合法 AI 叙事被误判 `weak_narrative`。

## APK
无需（服务端修复；Web/刷新即可）。
