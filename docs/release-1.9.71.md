# 1.9.71 — 比分 1H 伤停补时误标「下半场」

## 问题
布伦特福德 vs 利物浦仍在**上半场伤停补时**，列表显示「下半场 46'」；同屏其它场次正确为「上半场 45'/43'」。

## 根因
`inferClockPhase`（1.9.54 为修 ph=2 粘中场）用 **`minute >= 46 → 下半场`**。上半场补时常见 elapsed=46/47，无时钟 phase 时被误判为 2H。前端 `scoreMinuteLab` 也用 `minute>=46` 把「中场」升成「下半场」。

## 修复
1. **分钟 alone 不再翻半场**：仅显式 phase 名 / AF status / 全场相对半场比分可判定 2H。
2. 46–49 且比分未过半场 → 保持「上半场」（伤停）；≥50 无状态 →「进行中」（不臆造 2H；AF 叠加可纠正）。
3. 展示：`45+N'` / `90+N'`；2H 补时不因分钟变成「加时」。
4. AF 叠加：半场冲突（sporttery 误 2H、AF 仍 1H 等）优先 AF 时钟。
5. 测试：`test/live-scores-phase-test.js` 覆盖 1H stoppage vs 2H。

## 标签对照
| 场景 | Before | After |
| --- | --- | --- |
| 1H 补时 elapsed 46'（比分=半场） | 下半场 46' | 上半场 45+1' |
| HT rest minute 47 | 中场（ok） | 中场 |
| 显式下半场 / score past half | 下半场 | 下半场 |
| 2H 补时 92' | 下半场 | 下半场 90+2'（非加时） |

## Live verify（2026-10-17 ~22:53–23:02 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.71`
- `node test/live-scores-phase-test.js` on server：all passed（含 1H stoppage 46' → 上半场）
- APK md5 `78652a53…`；HTTP 200 size **6478999**

## Deploy
- `/opt/jingcai` **1.9.71**，systemd active
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.71.apk`（versionCode **109**）
