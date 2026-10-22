# 1.9.48 足球弹弓试玩入口

## 用户价值
1. **我的 → 足球弹弓**：应用内全屏试玩弹弓射门 Demo（Three.js iframe）。
2. **返回**：Demo 左上角「← 返回」回到「我的」；底部 Tab 在此页隐藏。
3. 与独立页共用同一套玩法（拖动惯性、底部蓄力、进球判定、进球后回底）。

## 改动
- `public/app.js`：`pageSlingshot`、`#/slingshot`、我的菜单入口。
- `public/style.css`：沉浸式 `.slingshot-view`。
- `public/demos/football-slingshot.html`：`?embed=1` 隐藏 STANDALONE 标签并显示返回。
- 版本 **1.9.48**（versionCode **88**）。

## APK
`dist/jingcai-predict-1.9.48.apk` → http://120.77.152.74:8088/jingcai-predict-1.9.48.apk

## 验证
- Web：`#/me` → 足球弹弓 → 可玩 → 返回我的。
- 直链 Demo：`/demos/football-slingshot.html?v=20261017-v14&embed=1`
