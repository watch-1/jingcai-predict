# 1.9.127 — 预测 tab「综合报告暂不可用（未知）」

## 问题
用户：「预测功能板块信息缺失严重，请检查」
截图：霍芬海姆 vs 里昂（欧罗巴）详情「预测」仅赔率参考层，文案「综合报告暂不可用（未知），先展示赔率参考层」。

## 根因（客户端，非欧罗巴/AF 数据缺失）
1. 服务端 `/api/predict-report?matchId=2042127` **正常**返回完整简报（html ~12KB，战绩/过程/交锋/伤停/表态齐全）。
2. **1.9.125** 为冷启动引入 `jc_pred_cache_v1` **精简**持久化：只存 `{ ok:true, predict, summary, engineRev }`，**无 html**。
3. 冷启动 `hydratePredictCache()` 把精简对象灌进 `S.predictCache`。
4. `loadPredictReport()` 见 `ok===true` 即短路，**不再请求**完整简报。
5. `predTabHtml()` 判断 `rep.ok && rep.html` 失败 → 走 else，且无 `error`/`reason` → 显示「（未知）」+ 赔率层。

## 修复
- 新增 `predictReportFull(j)`：必须 `ok && html` 才算完整简报。
- `loadPredictReport`：仅在完整简报时短路；精简缓存仍会打 API。
- `hydratePredictCache`：精简条目打 `_slim: true`。
- `predTabHtml`：`ok` 但无 `html` 时显示加载中，不再「未知」。
- 失败文案默认「加载失败」而非「未知」。

## 版本
- versionName **1.9.127** / versionCode **164**
- 合作包 versionName **1.9.127-test**
- `sw.js` VER `jc-v1.9.127`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.127.apk | 9191766 | b0355b6265b44bb7ea84b535a1680b2d |
| jingcai-predict-1.9.127-partner.apk | 9191766 | 61dbe2377220b66bf36305f6d177ad87 |
| jingcai-predict.apk (→正式) | 9191766 | b0355b6265b44bb7ea84b535a1680b2d |

- http://120.77.152.74:8088/jingcai-predict-1.9.127.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.127-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.127**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.126-prod-pre-20261022-101115.tgz`
- 仅客户端 `public/app.js`（+ sw/config/index/package）；服务端逻辑未改

## 验证
- 杀进程重开 → 打开霍芬海姆 vs 里昂「预测」：应先 spinner，再出完整赛前情报简报（非「未知」赔率层）
- 或清除应用数据 / 清 `jc_pred_cache_v1` 后同样验证
