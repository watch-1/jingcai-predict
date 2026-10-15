# 1.9.1 预测页漏场：计算器缺 Selling 回填

## 现象
`/api/matches`（getMatchCalculatorV1）有时比 `/api/schedule` 少若干仍为 Selling 且带胜平负赔率的场次。预测页/首页热门只读 `matches`，会出现缺场（例：周三001 墨胜利、007 诺维奇、014 圣路易城）。

## 修复
`completeMatches()`：从已完整的 schedule 合并「Selling + 有 HAD + 开球未到」且计算器没有的场次；已开球的 seen 残留不会回流预测列表。

## 部署
只更新服务端 `server.js` 后 `systemctl restart jingcai`。前端/APK 无需重装。
