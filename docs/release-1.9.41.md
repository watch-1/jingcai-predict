# 1.9.41 平局也是有效额外表态

## 现象
法兰克福 vs 科隆等场次模型推荐「平局」且已有「倾向 / 表态」芯片时，「平局」列表字重弱于「主胜 / 客胜」；且引擎在 lean=平局 时把逆盘口 / 同向高信心路径排除，平局常被压成观望或仅靠伤停冲击才表态。

## 根因
1. **`resolveSpeakStance`**：`reverseVsMarket` / `sameDirHighConf` 显式 `lean !== 'd' && mkt !== 'd'`，平局无法走逆盘或同向≥62% 放大。
2. **`conflict`**：基本面 vs 盘口分歧同样排除平局，冲击信号更少。
3. **UI**：`.pr-card.pr-speak .pr-pick b` 仅改颜色、未强制字重；观望卡有 `font-weight:650`，表态卡依赖浏览器默认 `<b>`，CJK「平局」视觉上更瘦。
4. **结算**：`buildLeanFeedback` 把所有 block 的 `'d'` 当中性跳过，导致盘口 lean=平局 命中时不算 `supportedBlocks.market`。

## 修复（不削弱真观望）
1. 平局与主/客同一套规则：逆盘口必放大、同向 conf≥0.62 放大、冲击/冲突放大；**同向低信心无冲击仍 align / 少说**。
2. process/form 的 `'d'` 仍表示「接近/中性」（不是平局表态）；market `'d'` 视为真实平局倾向。
3. 列表/首页表态卡强制 `font-weight:800` + `pick-d/h/a` 同权；pitch 主题同步。
4. 结算：market 平局命中计入 supported；amplifyHit 对 lean=d 正常。
5. `CHIPS_UI_REV=6` 重贴缓存芯片。

## 验证
- `node test/selective-speak-test.js`：平局逆盘 / 同向高信心 / 同向低信心观望 / 客胜 vs 盘口平局。
- leanFeedback：平局 amplify 命中 + market=d supported。

## APK
`dist/jingcai-predict-1.9.41.apk`（versionCode **81**）→ http://120.77.152.74:8088/jingcai-predict-1.9.41.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.41-prod-pre-20261016-100237
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/predict-report.js $B/lib/post-match-review.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
