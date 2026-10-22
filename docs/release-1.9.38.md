# 1.9.38 开奖卡双标签：赔率热门 + 表态 / 逆盘命中

## 目标
开奖列表与详情赛果标签同时展示：
1. **赔率热门 … 命中/未中**（保留原语义，样式改为次要/弱化）
2. **表态 … 命中/未中**（有赛前额外表态缓存时；比赔率热门更醒目）
3. **逆盘命中**（表态命中且赔率热门未中）用更强绿色强调

## 改动
1. **`lib/post-match-review.js`**：`lean-feedback` byMatch 快照写入 `lean` / `marketLean` / `amplifyHit` / `pickText`；新增 `getLeanFeedbackMap()`（仅 amplify）；`/api/usefulness` 附带 `byMatch`。
2. **`server.js`**：`GET /api/lean-feedback-map`。
3. **`public/app.js`**：`resultTags` 双芯片；`S.leanByMatch` 来自 usefulness / 复盘；日汇总保留「赔率热门命中率」，可选附加「表态命中」行。无表态缓存的老场次只显示赔率热门。
4. **`public/style.css`**：`.mkt` 弱化、`.lean` 加粗、`.lean.contra` 逆盘高亮；Theme A/B 可读对比。

## 不改
- 「赔率热门命中率」日汇总分子分母与计算方式不变（仍按胜平负隐含概率最高项 vs 赛果）。

## 验证
- 欧罗巴 霍芬海姆 vs 贝西克塔（2041982，2:3）与 马赛 vs 奥林匹亚（2041983，0:1）：表态客胜命中 + 热门主胜未中 →「逆盘命中 · 表态 客胜」。

## APK
`dist/jingcai-predict-1.9.38.apk`（versionCode **78**）→ http://120.77.152.74:8088/jingcai-predict-1.9.38.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.38-prod-pre-20261016-092622
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/post-match-review.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
