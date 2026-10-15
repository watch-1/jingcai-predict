# 1.8.10 近况 / 近期战绩补全

## 现象
- **布鲁日**：近况仅欧冠，如 `2026-09-09 维拉` 后直接跳到 `2026-02-25 马竞`，间隔约 7 个月。
- **国际米兰**：密度尚可，但日期未严格降序（如 `09-06` 出现在 `09-09` 前）；夏歇 `05→08` 为联赛休赛期属正常。

## 根因
1. **数据源**：`lib/match-stats.js` 的 `formOf` 只读 `data/history/results.jsonl`（竞彩完场）。比甲等非竞彩主联赛几乎不上架 → 布鲁日历史库仅 **12 场且全是欧冠**。
2. **排序**：原实现按 JSONL **文件逆序**截取，采集分页顺序 ≠ 开球日顺序 → 国米错序。
3. **交锋已有 AF 回退，近况没有**：H2H 空时会打 `/fixtures/headtohead`；form 未补全。

间隔长是 **数据不全（竞彩样本偏疏）**，不是「真没比赛」。布鲁日同期仍有比甲等赛事。

## 修复
- `formOf` / `h2h`：**严格按日期降序**后再截取近 N 场。
- **稀疏检测**（均间隔 >18 天或跨度过大等）→ 优先用 API-Football  
  `GET /fixtures?team={id}&season={yyyy}`（**不用 `last=`**，免费档会拒），磁盘缓存 `data/live-stats/team-form/` ≥24h，控配额。
- UI / 预测报告标明来源：**竞彩历史 / 全赛程**；偏疏时降权、不作强硬近况对比。
- `league-tables.fetchTeamRecent` 同步去掉 `last=`。

## 样例对比（本地）
| 队 | 修复前 | 修复后（AF 可用时） |
| --- | --- | --- |
| 国米 | 09-06 排在 09-09 前 | 日期严格降序：09-20…09-09…09-06… |
| 布鲁日 | 仅欧冠，跨月大空洞 | 检测为偏疏；AF 全赛程补比甲等；AF 不可用时明示「竞彩历史偏疏」 |

## 限制（部署时）
- 当前 `API_FOOTBALL_KEY` **账号 suspended**；免费档赛季上限约 **2022–2024**，对 2025/26 近况补全仍需可用密钥/套餐。
- 密钥恢复后自动走缓存补全，无需再发版。

## 回滚
```bash
# 服务器
cp -a /opt/jingcai/backups/v1.8.10-prod-pre-<TS>/{lib/match-stats.js,lib/predict-report.js,lib/league-tables.js,public/app.js,public/config.js,package.json} /opt/jingcai/
systemctl restart jingcai
```
本地：`backups/v1.8.10-pre-form-af-20261013-173827`

## 部署结果（2026-10-13 CST）
- 线上：`120.77.152.74:8088` 已跑 **v1.8.10**
- 国米近况：日期严格降序（09-20 → 09-15 → 09-09 → 09-06 → …）
- 布鲁日：仍为竞彩欧冠样本（AF 账号 suspended / 免费档赛季上限），UI note 明示偏疏；密钥恢复后自动走 `team-form` 缓存补全
- APK：`http://120.77.152.74:8088/jingcai-predict-1.8.10.apk`（versionCode 39）
- 回滚：`/opt/jingcai/backups/v1.8.10-prod-pre-20261013-174042` 或本地 `backups/v1.8.10-pre-form-af-20261013-173827`
