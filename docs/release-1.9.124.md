# 1.9.124 — 丝滑切换 + 稳定首屏（keep-alive / 缓存首绘）

## 问题
用户：「在进行各个页面切换时，会有偶尔一闪一闪的感觉，但我看别人做的成熟的app程序就是很丝滑的。包括我们现在刚点开app进入时，主页也是会闪几下才正常，这会导致有廉价感，请修复这个问题」
截图：数据页「身价榜」整页 skeleton 占位 —— 典型 tab 切换 / 冷启动 mid-flash。

## 根因

### A. 冷启动多段闪（blank → skeleton → content）
1. Boot 先 `render()`（此时 `S.matches` 为空）→ 首页 skeleton。
2. `reloadData().then(render)` 再整页 `view.innerHTML=` → 第二闪。
3. live-scores / 资讯回流再 `render` → 第三闪。
4. `paint-hold` 海军底虽挡白屏，但「海军 ↔ 内容」本身也是可见闪动。
5. LS 里已有 `jc_cache_matches` 等，但从未在首绘前同步 hydrate。

### B. 底栏 tab 切换整页擦写
- `render()` 对每次 首页/赛程/预测/数据/我的 都 `view.innerHTML = pageX()`。
- 离开再回来即使内存里刚看过，也会重新骨架/重绘 → 「偶尔一闪」。
- 数据中心 `loadDataCenter` 成功后整页 `render()`；子 tab（积分/射手/身价）同样整页 wipe。

## 修复（1.9.124）

### 冷启动
- `hydrateFromCache()`：首绘前同步灌入 `jc_cache_{matches,schedule,results}` + `jc_data_cache_v1`。
- 首屏直接出上次内容（或稳定壳），网络返回后若内容签名未变则 **no-op**（不再二次擦写）。
- 仅真正空 DOM 的冷首绘保留短 `paint-hold` 海军衔接 splash。

### Tab keep-alive + 软更新
- `TAB_KEEP`：离开底栏 tab 时缓存 HTML + scroll + content signature。
- 回到同签名 tab → 直接 restore + 轻量 opacity crossfade（`.view-fade`），**不再**海军 wipe / skeleton。
- 同路由同签名的重复 `render()`（轮询 / boot 双触发）直接跳过。
- 数据中心：`softPatchDataBody` 只改 `#dcBody` + chips；成功结果 `persistDataCacheSlice` 写入 LS。
- 下拉刷新 / 清缓存：`invalidateTabKeep()` + `force` 重绘。

### 版本
- versionName **1.9.124** / versionCode **161**
- 合作包 versionName **1.9.124-test**
- `sw.js` VER `jc-v1.9.124`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.124.apk | 8740672 | e87de809fc0ebe8a17a12ad6b5adcaa6 |
| jingcai-predict-1.9.124-partner.apk | 8740672 | d8bfa18e5b5f6decdeab45618ec356ed |
| jingcai-predict.apk (→正式) | 8740672 | e87de809fc0ebe8a17a12ad6b5adcaa6 |

- http://120.77.152.74:8088/jingcai-predict-1.9.124.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.124-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.124**，systemd `jingcai` active
- 备份：/opt/jingcai/backups/v1.9.123-prod-pre-20261022-075343.tgz

## 验证建议
- 冷启动：海军 splash → 首页应一次到位（有缓存时无 skeleton 连闪）
- 底栏 首页↔赛程↔预测↔数据↔我的：应保留上次内容或短 crossfade，不应每次空白/骨架
- 数据页 积分/射手/身价 切换：只换列表区，顶栏/联赛 chips 不整页闪
