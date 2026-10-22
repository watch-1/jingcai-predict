# 1.9.75 — 专栏真实表态战绩（去「不提供连红」横幅）

## 产品
用户反对专栏横幅「不提供连红、命中率…」。本版：

1. **移除**该免责横幅及同类「禁止展示连红/命中率」文案；保留 **禁止投注 / 出票 / 假荐彩号**。
2. **透明真实战绩**：发「比赛态度」时可选用胜平负表态（H/D/A）并关联 `matchId`；完场后按赛果自动结算 hit/miss。
3. 作者卡 / 帖头仅在有已结算表态时展示 **近N中M** / **连红**（默认近 5；连红 ≥2 才显示）。尚无结算 → **不展示任何 %**。
4. **付费帖不在本版上线**（`/api/column/meta.monetization.paidPosts=false`）；会员金币为后续阶段。

## 结算来源（只读真实赛果）
按序：`cache.results`（服务端注入）→ `data/history/results.jsonl` → `player-match.sqlite.match_outcomes`。客户端不可手填 hitRate/streak。

## 文案变更
| 位置 | 之前 | 之后 |
| --- | --- | --- |
| `#/column` 顶栏 | 「不提供连红、命中率」 | 完场结算说明；禁止投注出票 |
| `/api/column/meta` noteZh | 不提供连红、命中率… | 自动结算战绩 + 禁止投注/出票 |
| 发帖页 | 不展示连红/命中率 | 可选表态、完场结算；付费后续 |
| Admin 专栏 | 无连红指标 | 连红/近N中M仅完场结算 |

## API
- `POST /column/posts` 可选 `pick: H\|D\|A`（须有 matchId）
- Feed / authors / author：`author.stats.{recentLabel,streakLabel?}`；帖含 `pick` / `settleHit`
- `GET /column/meta`：`picks`、`monetization`

## DB
`column_posts` 增列：`pick` · `settle_result` · `settle_hit` · `settled_at`

## Deploy
- `/opt/jingcai` **1.9.75**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.75.apk`（versionCode **112**）

## 验证
- `curl …/api/status` → `1.9.75`
- `node test/column-test.js http://120.77.152.74:8088`
- meta noteZh **不含**「不提供连红」；含「禁止投注」

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.75`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/meta` noteZh **无**「不提供连红」；含「禁止投注/出票」；`monetization.paidPosts=false`
- `app.js` 顶栏改为完场结算说明；含 `col-badge` / `colPick`
- APK md5 `66661d4bb21b6735a813ab5e769234be`；HTTP 200 size **6499695**
- 备份：`/opt/jingcai/backups/v1.9.75-prod-pre-20261018-064705`
