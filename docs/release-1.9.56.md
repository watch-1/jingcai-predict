# 1.9.56 赛后 AI 中文净化 + 过程场均对手强度修正（SoS）

## A) 赛后 AI 解读英文泄漏
### 根因
DeepSeek evidence pack 把 `processLean` / `formLean` / `marketLean` 与机制枚举（`xg_aligned`、`both_xg_down` 等）以英文 key 喂给模型；prompt 未禁止复述，亦无落盘前清洗。模型把内部字段名写进 `narrativeZh`（法兰克福 vs 科隆等可见）。

### 修复
- `lib/deepseek-review.js`
  - Prompt：禁止 camelCase / snake_case；机制对照中文名（过程吻合/节奏偏慢…）。
  - Evidence `pre` 改为中文键（过程倾向/状态倾向/盘口倾向…）。
  - `scrubNarrativeZh`：已知码表替换 + 残留英文 token 剥离；校验与渲染双路径。
  - `AI_NARR_REV=3` + `narrativeHasEnglishLeak` → 自动补跑含英文的旧缓存。
- `lib/post-match-review.js`：HTML 渲染再 scrub 一层。

## B) 过程场均 SoS 去水
### 方法（v1，不臆造）
- 对手强度指数 SI≈0.75–1.30：欧冠/欧联/欧协联竞赛加成；国内榜 ESPN 积分榜排名分位（上游抬、下游压）；未知对手/联赛 → 该场不参与修正。
- 修正场均 = 各场原始过程指标 × SI 后再平均；覆盖≥50% 且≥2 场才启用。
- `scoreProcessLean`：双侧均有 SoS 覆盖时优先用修正场均；单侧稀疏则回退原始并注明不对称。
- UI（详情过程卡 + 预测简报）：保留原始场均，增加「强度修正」行与「已按对手强度修正」说明。

## 版本 / 部署
- 服务端 + Web：`1.9.56`
- APK：`app.js`/`style.css` 有 SoS 文案 → 需打 `jingcai-predict-1.9.56.apk`

## 验证
1. 打开法兰克福 vs 科隆赛后复盘：AI解读无 `processLean`/`xg_aligned` 等英文。
2. 任意有过程数据的赛前页：过程卡可见「强度修正」或「未做强度修正」说明。
