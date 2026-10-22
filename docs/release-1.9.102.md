# 1.9.102 HHAD-only：让球对照作主分析

## 问题
部分场次（如欧冠大热门）只开售让球胜平负、胜平负为空。旧逻辑把「无胜平负」当成无法分析：情报死胡同文案、预测卡赔率条空白、服务端市场段只剩次要让球句。

## 改动
1. **让球对照 = 主分析**：HAD 缺失且 HHAD 有值时，市场/情报/赔率对照以盘口线 + 让胜/平/负隐含 + 市场倾向为主；胜平负区显示「未开售」。
2. **预测卡 `predOddsMini`**：无 HAD 时展示 HHAD 三档赔率条。
3. **情报**：替换「暂无法从赔率推导情报」为有用的让球对照文案。
4. **变盘展示**：无 HAD 历史时可用 HHAD 开盘→最新（仅展示；`pool:'hhad'`）。
5. **优势关注 / RQ 爆冷**：仍仅 HAD；`computeHhadEdge` stub 继续返回 null。
6. **高信心 2串1**：继续只要 `pool === 'had'`（隐含 ≥65%），HHAD-only 场次不入选（避免拿让球隐含当胜平负串）。

## 版本
- versionName **1.9.102** / versionCode **139**


## Live artifacts (2026-10-21 Asia/Shanghai)

| File | Size | MD5 |
|------|------|-----|
| jingcai-predict-1.9.102.apk | 6,586,183 | 01f65eeafc321c6dc463beb620e8f4dc |
| jingcai-predict-1.9.102-partner.apk | 6,586,183 | c07f11f5279759dbaf5d3d6f029e4450 |
| jingcai-predict.apk | 6,586,183 | 01f65eeafc321c6dc463beb620e8f4dc |

- http://120.77.152.74:8088/jingcai-predict-1.9.102.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.102-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionName **1.9.102** · versionCode **139**
