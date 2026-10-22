# 1.9.39 选择性表态规则 + 近况摘要去码

## 用户价值
1. **近况摘要可读**：信心/摘要里不再出现「近况 322/235」这类打包胜平负码（主队近况 W-D-L 数字串 / 客队近况 W-D-L）；改为「近况偏主胜 / 偏客胜 / 接近」。内部近况积分评分不变。
2. **表态规则**：
   - **逆盘口必放大**：模型 lean 与盘口 marketLean 反向时一律额外表态（不依赖其它冲击）。
   - **同向高信心也表态**：与盘口同向且信心 ≥ **0.62** 时额外表态（新路径）。
   - **稳胆门槛 0.62**（原 0.6）；倾向仍 0.45。低信心同向无冲击仍「与盘口一致 / 观望」（少说保留）。

## 改动
- `lib/predict-report.js`：`resolveSpeakStance`；`formPlainBit`；`CHIPS_UI_REV=5`；结论文案触发标签。
- `lib/post-match-review.js`：赛后 `high_conf*` 与 `highConf` 对齐 0.62。
- `public/app.js`：文案与本地稳胆色条门槛。
- `test/selective-speak-test.js`：逆盘 / 同向高信心 / 0.61 仍观望 / 稳胆门槛。

## APK
`dist/jingcai-predict-1.9.39.apk`（versionCode **79**）→ http://120.77.152.74:8088/jingcai-predict-1.9.39.apk


## 回滚

