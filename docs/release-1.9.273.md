# 1.9.273 — 日期条顶栏重叠、开屏锁区不再跳

## 改什么
- **日期条被顶栏挡住**：真机 272 的 clamp / 4px padding 没解决纵向重叠。根因是固定顶栏实际高度（状态栏 inset + 中文 Tab 行高）大于预留的 `--top-chrome-h: 48px`，再叠加 `.dstrip` 的 `overflow-y: hidden` 裁掉「周六 / 昨天 / 今天」字头。273 把预留升到 56px、按实测 `#top-chrome` 高度写入 `--top-chrome-pad`，日期条上下各留 10px；赛程与开奖共用同一 `dateStrip`。
- **开屏错位后归位**：272 把锁区钉在 `bottom:56px` + `translateX(-50%)` 仍会跳。剩余原因是 transform 首帧/宽度变化、原生 `ic_launcher` 自适应图标与 HTML `icon-192` 不一致、`22sp` 随系统字号缩放、以及 160ms 淡出叠在略偏的副本上。273 改为 flex 底栏（无 transform）、原生改用同一张 Design G PNG + `22dp`、HTML 一帧可见即立刻摘掉原生锁区。
- **未改**：包名 `com.tiicai.jingcai`、JPush、场次卡片几何、272 的按编号搜索。

## 版本
- **1.9.273** / VERSION_CODE **309**
- 不部署、不打 APK、不合并。

## 测试
- `test/ui-273-test.js`
- 既有 `test/ui-272-test.js` / `test/ui-270-test.js` / `test/ui-271-test.js`
