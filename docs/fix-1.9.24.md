# 1.9.24 全盘队名映射审计与修复

## 审计范围
- 赛程+在售共 **241** 支球队；prod `team-id-cache` **52** 条 s: 映射逐条 `/teams?id=` 校验。
- 在售/待开售 **113** 场 `process-stats` 抽检。

## 错误映射（已修）
| sporttery | 中文 | 错误 AF | 正确 AF | 原因 |
|---|---|---|---|---|
| 132 | 罗马 | 22590 Roma (Slovenia) | 497 AS Roma | 短名 exact-match 同名壳队（1.9.23） |
| 937 | 波尔图 | 20782 Porto (Brazil) | 212 FC Porto | 短名 Porto 命中巴西同名队 |

其余已缓存 50 条与种子/检索一致（含 Olympiacos↔Olympiakos 拼写差异，553 正确）。

## 空数据主因（非映射错误）
113 场抽检（修复前）：**both 65 / one 33 / none 15**。
几乎全部空侧为 `no_af_team`：crest 无英文 + 中文短名未进 `AF_ZH_EN`，AF search 无法用中文。
少数 `no_stats`：AF 近期场次本身无技术统计（覆盖缺口）。

## 本版修复
1. `AF_TEAM_SEED` 扩至 ~133（英德法西意荷葡亚澳等赛程队）。
2. `AF_ZH_EN` 大批中文短名；`波尔图→FC Porto`、`吉达国民→Al Ahli Jeddah`。
3. `resolveAfTeamId`：ascii 清洗、查询变体（United→短名）、Porto 葡/巴加权。
4. crests EN 回填缺失队名；种子覆盖错误缓存。
5. 清 prod 错误缓存并重拉过程统计。

## 修复后抽检（同 113 场）
- **both 107 / one 3 / none 3**（双侧有数据从 57.5% → 94.7%）
- 剩余 6 场空侧全部为 `no_stats` 且 AF id 正确（日职/澳超等近期场次无技术统计缓存）——真实覆盖缺口，不造数。
- 波尔图 `937→212 FC Porto`；罗马 `132→497` 保持。
