# 1.9.43 赛后复盘升级 + 轻度信心耦合

## 用户价值
1. **复盘可读**：先列「本场 vs 近况 / 对位」数据对照，再给 **1–2 条**「备选 → 主因」人话解读；去掉堆叠的浅「叙述假说」模板。
2. **功课标签**：每场写出结构化 lesson（mechanism + process/form/market/injury 的 support|mislead|neutral + strength），供引擎引用。
3. **轻度信心耦合**：默认软权重约 **6%**；仅当同向功课≥2 或强机制时抬到约 **10–12%**；单条弱 specialty ≤5% 或仅打标签。单场净影响硬帽约 **±0.03–0.05**，旧功课衰减。复盘不主导（用户担心的 specialty 膨胀已克制）。
4. **少说规则不变**：逆盘口必表态；同向 conf≥0.62；稳胆 0.62；平局有效。

## 改动
- `lib/post-match-review.js`：`buildMainExplanations` / `buildLessonTags` / `recordLesson` / `getLessonConfBlend` / `needsReviewUpgrade`；UI 顺序与文案。
- `lib/predict-report.js`：`synthesize` 在表态前轻度叠加 `lessonBlend.deltaConf`；结论带 `lessonBlend` 摘要。
- `server.js`：缓存命中时若缺 lessonTags / 仍是旧假说格式则强制重建。
- `public/style.css`：主因解读样式。
- 测试：`test/post-match-review-test.js`。

## APK
`dist/jingcai-predict-1.9.43.apk`（versionCode **83**）→ http://120.77.152.74:8088/jingcai-predict-1.9.43.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.43-prod-pre-20261016-102803
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/post-match-review.js $B/lib/predict-report.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
