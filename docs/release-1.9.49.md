# 1.9.49 悬浮足球叠加层

## 用户价值
1. **首页 / 赛程 / 预测**：透明 3D 足球浮在正常资讯 UI 上，无绿茵球场小游戏页。
2. **底部下拉蓄力**：出现顶部半透明「幽灵球门」；松开射门；进球轻微提示后球回底部。
3. **我的**不再主推「足球弹弓试玩」入口。

## 改动
- `public/js/float-ball.js`：Three.js 透明叠加层 + 拖动惯性 + 弹弓蓄力。
- `public/app.js` / `index.html` / `style.css`：路由同步、PTR 避让、`#/slingshot` 入口移除。
- 版本 **1.9.49**（versionCode **89**）。

## APK
`dist/jingcai-predict-1.9.49.apk` → http://120.77.152.74:8088/jingcai-predict-1.9.49.apk
