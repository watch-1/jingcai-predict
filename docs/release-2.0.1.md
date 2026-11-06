# 云球迷 2.0.1（VERSION_CODE 318）

## Task A — 完场场次「预测」调试（赛前快照）

- **问题**：`predTabHtml` 在 `m.full` 时直接返回「比赛已完场…」，无法在完场页调试综合简报。
- **处理**：完场且打开预测 Tab 时，客户端请求 `GET /api/predict-report?prematchSnapshot=1`。服务端 `buildReport` 在 `prematchSnapshot` 模式下：
  - **跳过**赛后复盘条目的注入（`post-match-review` / `fixture-players` 关键球员 / `team-evidence` / `match_outcomes` 软补全等），降低赛果后信息混入风险。
  - **写入独立磁盘缓存** `data/predict-reports/prematch-snapshots/{matchId}.json`，与普通 `predict-reports/{matchId}.json` 分离；不触发主缓存路径，避免旧报告里已混入的赛后内容。
  - **不跑** DeepSeek 赛前解读后台任务，避免赛后语境污染。
- **诚实标注**：响应含 `prematchSnapshot: true`；UI 顶部灰字说明「赛前快照·完场调试」及赔率/输入边界。
- **赔率**：仍使用赛程 JSON 中的 `had`/`hhad`（即平台在售/快照数据），**不是滚球**；符合「截止到最终买入前」取向。

## Task B — 「数据」Tab 慢 / 一直「正在整理…」

- **机制**：`/api/sm-surface`（`lib/sm-surface.js`）无 token 时短 TTL（约 20m）空包；有 token 时需 **队名解析 + 多场 Fixture 拉取**，冷启动可能数十秒至两分钟；`reason` 可为 `no-token` / `no-team` / `lookup-failed`。
- **客户端**：
  - 请求超时 **120s**；加载中显示明确说明（解析/冷启动可能较慢），避免误以为卡死。
  - 失败时按 `smReason` 展示 **可理解文案**（无密钥、队名无法映射等）+ **重试**。
  - 防重复并发：进行中的请求不重复发起。
- **服务端**：`sm-surface` JSON 增加 **`smReason`**（与 `reason` 同源），便于前端展示。

## Task C — 球员行点击明细（对齐 UI kit）

- `renderFormHtml` 中球员行增加 `data-act="smPlayerDetail"`，载荷为 **URL 编码 JSON**（不含英文原名，避免页面泄漏音译名）。
- `aggregatePlayers` 汇总 **射正、抢断成功** 等明细；弹层展示环形率（射正率 / 传球成功率 / 抢断成功率）与网格；缺项为「—」。
- 样式：`public/style.css` 中 `.sheet.sm-player-sheet`、`.sm-pd-*`。

## 版本

- `VERSION.txt` / `package.json` / `public/config.js` / `public/sw.js` / `android/*`：**2.0.1 / 318**
- APK 默认输出名仍为 `dist/jingcai-predict.apk`；按版本复制为 `jingcai-predict-2.0.1.apk` 即可区分（**本文档与脚本未添加复制到 Desktop 的步骤**）。
