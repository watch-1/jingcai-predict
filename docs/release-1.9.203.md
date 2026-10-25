# 1.9.203 数据 Tab 本地队徽 + 中超/欧冠打包 + 刷新超时

## 用户反馈（1.9.202 后）
- 下拉刷新长期停在「正在刷新…」
- 推荐/欧冠混用真队徽与字母圆（中超尤甚）
- **数据** 西甲/德甲积分榜队徽列全空（非字母占位）
- 球星榜队徽缺失；球员头像仍为网络占位（预期行为）

## 根因与冲突
| 冲突 | 说明 |
|------|------|
| **H1** | `renderStandingsTable` / `renderScorersList` / `renderClubValuesTable` 调用 `badge()` 未传 `teamId`，数据 Tab 永远走 `/api/logo`，挂起时显示空白 |
| **H2** | `data-center-boot.json` 无 `csl:*` slice，`sync-bundled-crests` 无法打包中超 PNG |
| **H3** | boot 内 `ucl:standings` 仅 20 行，联赛阶段 36 队中多数未进 manifest |
| **H4** | PTR `Promise.race` 12s 后仍 `await work`，`reloadData` 挂起则 spinner 永不结束 |
| **H5** | `hydrateTribeCrests` 在 bundled 尚未加载完成时用远程/空 blob 覆盖 `src` |
| **H6** | manifest 未加载时 `bundledCrestPath` 对任意 `teamId` 返回路径 → 404 → 错误回退链 |

球员头像（H7）：保持 `/api/logo` + `onerror` 字母占位，不阻塞列表绘制，不打进 APK。

## 修复
- 数据 Tab 积分榜/射手/助攻/身价榜：`badge(..., { teamId, eager })` 与部落格一致，优先 `assets/crests/{id}.png`。
- `gen-data-center-boot.js`：加入 **中超**；欧冠积分榜保留至多 40 行；重生成 boot。
- `sync-bundled-crests.js`：从 standings/topscorers/topassists/clubvalues 收集 ID；manifest 仅列出确有 PNG 的 ID。
- PTR：race 后不再无界 `await work`；`finally` 清 spinner。
- `bundledCrestPath`：manifest 未就绪返回空；就绪后仅已知 ID；加载后轻量 `render` 数据/部落页。
- `hydrateTribeCrests`：bundled 加载中不抢写远程；仅 `data-fb` 已试后才远程兜底。

## 版本
**1.9.203** / **VERSION_CODE=240**

## 自测
```bash
node test/ui-203-test.js
node test/ui-202-test.js
```

## 队徽包
运行 `node tools/sync-bundled-crests.js` 后见 `public/assets/crests/manifest.json` 的 `teamIds.length`（本版约 **127** 支，含中超 16 + 欧冠联赛阶段 36 + 五大联赛等）。

## APK 体积（估算）
相对 1.9.202（约 100 枚队徽）：新增约 27 枚 PNG，目录未压缩约 **+1.0–1.5 MB**；zip 后约 **+0.5–0.8 MB**（以父级 `build-apk.sh` 实测为准）。
