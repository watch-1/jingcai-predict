# 1.9.198 部落「当前热门」空列表 + 平台简报空白头

## 用户反馈
1. 部落「当前热门」显示「暂无球队」；重新加载无效。
2. 首页平台简报中间卡仍出现大块空白头（仅金边，正文仍可见）。

## 根因
1. **部落：** `jc_data_cache_v1` 里旧版积分榜行无 `teamId`，`dataCacheRenderable` 仍判为可渲染 → `mergeBootPackSlice` 跳过 boot JSON（含 teamId）→ `buildTribeCatalogFromSlices` 丢弃全部行 → 空目录；`tribeReload` 只清空 `tribeCat` 不清理坏 LS。
2. **简报：** 1.9.197 校验保证 DOM 有 `ha-hd`，但 `.ha-card > * { transform: translateZ(0) }` + `will-change` + 滚动 `--ha-card-glow` 在部分 Android WebView 上导致中间卡 header 层不合成（空白头、teaser 仍在）。

## 修复
- 优先合并带 `teamId` 的 standings；`purgeStandingsWithoutTeamIds`；空目录时 `no-store` 重拉 boot；`tribeReload` 清 inflight + 坏 LS。
- 去掉 ha-card 子节点 `translateZ` / `will-change`；`ha-hd` 强制可见；缓存键 `jc_home_att_v3`；paint suspect 检测后重建。

## 版本
**1.9.198** / **VERSION_CODE=235**

## 自测
- `node test/ui-198-test.js`
