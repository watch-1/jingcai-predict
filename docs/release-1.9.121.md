# 1.9.121 — 顶部条丝滑衔接（immersive）+ 主页屏闪

## 问题
用户（1.9.120 后）：「现在有两个问题，一个是主页屏闪，第二个是顶部条无法丝滑衔接，可以看到如图，请做到类似图123一样过度丝滑」
1. **主页屏闪**：冷启动 / 路由重绘时白屏或半渲染（图4：海军状态栏 + 空白内容 + 底栏 + 残片）。
2. **顶部条无法丝滑衔接**：状态栏与 header 仍是两条色带（图5–9）。1.9.120 仅把 `setStatusBarColor` 从亮蓝 `#2a74f7` 改为 `#1B2A4A`，WebView 仍在状态栏**下方**，opaque 色块与 header 渐变无法连成一面；部分机型 / 旧包「我的」仍见亮蓝条（主题默认 Material 蓝）。

图1–3 = 澳客参考（内容/渐变延伸到状态栏图标下）。图4 = 屏闪帧。图5–9 = 首页/我的/数据/预测/球队详情硬缝。

## 根因
1. **非 immersive**：`MainActivity` 用不透明 `STATUS_BAR=#1B2A4A` + 非 overlay 布局 → 系统栏永远是独立色带；CSS `env(safe-area-inset-top)` 在 Android WebView 常为 0。
2. **主题闪白**：`Theme.Material.Light.NoActionBar` 默认白窗 + WebView 默认白底 + `html/body/#E8ECF4` + SPA `view.innerHTML=` 整页擦写 → 冷启动与首页重绘白闪。
3. **亮蓝残留**：旧 APK 仍写 `#2a74f7`；未改 theme 时启动瞬间也可能闪 Material 蓝。

## 修复
### Android（edge-to-edge）
- `res/values/styles.xml`：`AppTheme` — `windowBackground=#1B2A4A`、`statusBarColor=transparent`、`windowLightStatusBar=false`
- `AndroidManifest` → `@style/AppTheme`
- `MainActivity.applyEdgeToEdge()`：透明状态栏 + `LAYOUT_STABLE|LAYOUT_FULLSCREEN`，内容画到图标后方
- `WebView.setBackgroundColor(#1B2A4A)` 防白闪
- `injectSafeAreaTop()`：把 `status_bar_height` 写入 CSS `--sat`（WebView 不填 env 时的兜底）
- `JingcaiChrome` JS bridge：`statusBarStyle('light'|'dark')`、`refreshSafeArea()`（搜索白顶用深色图标）

### CSS / Web
- `:root --sat`；所有原 `env(safe-area-inset-top)` → `var(--sat)`（`.hdr` / `.me-hd` / `.auth-hd` / home-search / search）
- `html/body` 首屏海军；`html[data-ready=1] .app` 才切浅底
- `.view` 顶部海军 paint-hold 带；`render()` 擦写时加 `.paint-hold`
- `index.html` critical-chrome + Android UA 下 `--sat` 默认 24px 并拉 `refreshSafeArea`

### 版本
- versionName **1.9.121** / versionCode **158**
- 合作包 versionName **1.9.121-test**
- `sw.js` VER `jc-v1.9.121`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.121.apk | 8313253 | 4f69df86a032ee4b26a2cd571c8c99ee |
| jingcai-predict-1.9.121-partner.apk | 8313253 | 2d89b322befb4eff0b7522e81bc66c0a |
| jingcai-predict.apk (→正式) | 8313253 | 4f69df86a032ee4b26a2cd571c8c99ee |

- http://120.77.152.74:8088/jingcai-predict-1.9.121.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.121-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.121**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.120-prod-pre-20261022-070304.tgz`

## 验证建议
- 装正式包后看 首页 / 赛程 / 预测 / 数据 / 我的 / 球队详情：状态栏图标压在 header 渐变上，无第二色带
- 冷启动：海军底 → 首页，不应再闪大块白屏
- 「我的」不再出现亮蓝条（需装 1.9.121，勿留 1.9.119 及更早）
