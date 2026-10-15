# 1.8.9 赛程 001 丢失修复

## 001 是哪场
- **周二001**｜亚冠精英｜纽喷气机（纽卡斯尔喷气机）vs 大阪钢巴
- 开球：2026-10-13 15:45（北京时间）｜matchId `2041988`

## 根因
sporttery `getMatchListV1` / `getMatchCalculatorV1` 在开球后把该场从列表中移除（仅保留 Selling）。
代码注释曾误写「schedule 含开赛后场次」。`/api/results` 的 normalize 又用 `sectionsNo999` 过滤掉未完场行，
导致进行中的 001 在 schedule 与 results 双侧都不可见。热门频道不是本次根因（1.8.2 已改默认全部）。

## 漏斗清单
| 层 | 行为 | 本次 |
| --- | --- | --- |
| sporttery list/calc | 开赛后丢场 | 源侧丢 001 |
| sporttery results | 含未完场（status=1，空比分） | 有 001 |
| server normalizeResults | 要求有比分 → 丢未完场 | 旧逻辑丢 |
| server schedule | 仅 list | 旧逻辑丢 |
| 磁盘缓存 | 无 | 旧无 |
| 前端热门/关注 | 明示隐藏 | 非根因；v3 再迁默认全部 |
| 联赛 chips / 状态条 | 明示 | 非根因 |
| localStorage 旧热门 | 1.8.2 v2 迁移 | 1.8.9 再做 v3 |
| 分页 | results pageSize=100 | 今日够用 |
| live-scores | 需有 id | 有 id 后可刷比分 |

## 修复
- `completeSchedule()`：results 窗口回填（含未完场）+ `data/schedule-seen.json` 持久化 + live 补开球时间
- `meta.backfill` / `meta.gaps` + 日志；近两日编号缺口告警
- 前端 `jc_sch_ch_v3` 再迁默认「全部」；缺口 banner
- 冒烟断言当日 `001..max` 连续

## 回滚
```bash
# 服务器
cp -a /opt/jingcai/backups/v1.8.9-prod-pre-<TS>/{server.js,package.json,public/*} /opt/jingcai/  # 按实际备份名
systemctl restart jingcai
```
本地备份：`backups/v1.8.9-pre-schedule-001-backfill-20261013-165457`
