# 1.9.103 背景信号：动机可 lean + 杯赛显示中性

## 问题
1. `W.motivation=0.15` 但背景 lean 门槛 `|delta|>=0.2` → 单边保级/争冠永远 lean=null。
2. 仅有杯赛/洲际赛等非方向标签时，信号面板显示「无信号」，易误解为无背景信息。

## 改动
1. **背景 lean 门槛 = `W.motivation`（0.15）**：单边保级/争冠可输出 主胜/客胜；权重不变。
2. **信号面板**：无 lean 但有 detail（杯赛/德比等）→ 显示 **中性**（非「无信号」）；杯赛仍不进方向 chips。
3. `ENGINE_REV` **202**（缓存失效重算）。

## Before / After
| 场景 | Before | After |
|------|--------|-------|
| 单边主队保级（delta=0.15） | lean=null → UI「无信号」 | lean=`h` →「主胜」 |
| 单边客队保级 | lean=null | lean=`a` →「客胜」 |
| 双边保级（delta=0） | lean=null，有 detail | lean=null → UI「中性」+ detail |
| 仅杯赛/洲际赛标签 | lean=null →「无信号」 | lean=null →「中性」·「杯赛/洲际赛」 |

## 版本
- versionName **1.9.103** / versionCode **140**

## Live artifacts (2026-10-21 Asia/Shanghai)

| File | Size | MD5 |
|------|------|-----|
| jingcai-predict-1.9.103.apk | 6,586,183 | bd125d9c15e0a96ee27737fbc595337b |
| jingcai-predict-1.9.103-partner.apk | 6,586,183 | 062cf2c9b4468373e6f6c95cc8f21133 |
| jingcai-predict.apk | 6,586,183 | bd125d9c15e0a96ee27737fbc595337b |

- http://120.77.152.74:8088/jingcai-predict-1.9.103.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.103-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

versionName **1.9.103** · versionCode **140**

## Smoke（当前在售抽样，force 刷新后）
- 40 场（含杯赛优先）：背景 lean **1** / 中性(有 detail) **21** / 无信号 **18**
- 保级/争冠样例：埃尔切「主队保级」→ 主胜；乌德勒支「客队保级」→ 客胜；亚冠/欧冠仅标签 → 中性「杯赛/洲际赛」
