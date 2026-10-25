# 1.9.197 比赛态度：淡金略加强 + 简报空卡修复

## 用户反馈
1. 淡金→银灰包裹仍略淡，需「稍微再明显一点点」。
2. 偶发平台简报卡片上半空白（仅金光），场次条与推荐/价格仍正常。

## A) 视觉（小幅）
`.ha-card` / `::before`（rgba/calc，无 color-mix）：
- `::before` opacity：`calc(.44 + g*.46)` → `calc(.47 + g*.48)`
- 左上金径向 alpha：`0.52/0.38` → `0.55/0.40`，副色 `0.32/0.26` → `0.34/0.28`
- g=0 边界下限：`--ha-edge-border-soft` `.82`→`.84`；阴影 a0/b0 `.026/.052`→`.028/.056`
- 子节点 `z-index: 2` + `translateZ(0)`，避免 WebView 偶发把正文压在光晕下

## B) 空卡根因与修复
**根因：** `jc_home_att_v1` 与首页 snap 会持久化 `#homeAttitudeFeed` 的 HTML；历史上若写入**不完整卡片**（仅有 `ha-match-bar`/`ha-ft`、缺 `ha-hd`/`ha-teaser`），冷启动或接口失败时会直接展示「空上半」。失败分支在「已有任意 `.ha-card`」时提前 return，也会锁住坏 DOM。

**修复：**
- `homeAttitudeFeedHtmlValid` / `homeAttitudeFeedDomValid`：每张卡必须含 `ha-hd`、`ha-name`、`ha-teaser`
- 读写缓存、persist、API 失败回退、snap 读写均走校验；缓存键升为 `jc_home_att_v2`
- 仅 DOM 完整时才跳过错误回退；API 成功后仍强制重绘

## 版本
**1.9.197** / **VERSION_CODE=234**

## 自测
- `node test/ui-197-test.js`
- 首页比赛态度：顶卡淡金略清晰；滚动下方银灰边仍强于顶部
- 清数据后反复进出首页 / 断网：不应再出现「只有金光」的简报卡
