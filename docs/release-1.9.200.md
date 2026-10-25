# 1.9.200 部落冷启动缺队徽 / 联赛空态

## 用户反馈
卸载重装后第一次进入：推荐有队名与热度但队徽大面积空白圆；意甲等联赛显示「暂无球队」。强杀后再开则当前热门 / 意甲 / 法甲等正常（图4/图5）。

## 根因
1. **1.9.199 回填门过窄：** `loadDataCenter` 仅在 catalog **完全为空** 时 `rebuildTribeCatalogFromCache`。冷启动 boot 超时或先 settle 空目录后，首个联赛 standings 回填后 catalog 非空 → 后续意甲等到达不再 rebuild → 分类永久空直到重启。
2. **队徽：** 部落格子 `loading="lazy"` 在 Capacitor 首屏易留下透明 `.badge.crest` 空圆；且 catalog 未对缺 `logo` 的 `teamId` 行合成 ESPN URL。
3. **全局 boot pack：** `loadDataCenterBootPack` 合并切片后只刷新数据页，部落已 `_settled` 空/残缺时不重绘。

## 修复
- `tribeCatalogNeedsRebuildFromCache()`：缓存已有联赛而 catalog 缺联赛或缺 logo 时触发 rebuild。
- standings 回填与 boot pack 完成后均按该条件 rebuild + softPatch。
- 部落 crest `eager`；缺 logo 时用 ESPN teamId URL；`hardenTribeCrestImgs` 超时回落字母徽。

## 版本
**1.9.200** / **VERSION_CODE=237**

## 自测
- `node test/ui-200-test.js`
