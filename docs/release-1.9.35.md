# 1.9.35 Theme B 预测页对比度 + 全屏审计

## 问题（用户截图：赛事详情 → 预测）
Theme B（绿茵沉浸感）下「赛前情报简报」仍是白底大卡：
1. `数据来源` meta：浅字（`--t3`）压在浅灰底 → 近乎不可见
2. 结论绿框：浅绿字（`--pri-d:#7DFFA8`）压在浅绿底 → light-on-light
3. 额外表态 chips / 伤停 / 过程对比等仍硬编码白/浅底

根因：1.9.34 抬升了 `.dsec`/`.ana-card`，但 `.pr-brief` / `.pr-chip*` / `.pr-concl` 等预测简报类仍硬编码 `#fff`/`#f5f8ff`，且正文用 `var(--pri-d)`/`var(--t3)`（pitch 下已切成浅色）。

## 改动
1. **预测简报**：`.pr-brief` 等改 `var(--card)`/`var(--t1)`；pitch 覆盖整卡 `#1A2336`、meta `#121A2B`+可读灰、结论框深绿底 + `#E8EEF8` 正文、chips 暗色 inset。
2. **审计补遗**：预测列表 rank、数据中心「开奖」pill、VIP 卡/支付/阵容卡等白底类。
3. **Theme A**：仍白卡 + 深字（CSS 变量路径不变）。
4. 去掉预测 Tab 内联 `#333d4f`。

## 验证（puppeteer / pitch）
首页、赛程、预测列表、数据、开奖、赛事详情→预测：无 light surface；简报 computed `bg #1A2336` / meta `#8B98AE` / concl `#E8EEF8`。

## APK
`dist/jingcai-predict-1.9.35.apk`（versionCode **75**）→ http://120.77.152.74:8088/jingcai-predict-1.9.35.apk
