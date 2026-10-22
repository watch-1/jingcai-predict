# 1.9.57 比分/赛程列表队徽竖列对齐

## 现象
比分列表（赛程 tab）中，中文队名长短不一导致主/客队徽左右漂移（如「珀斯 vs 纽喷气机」客队徽跳动；「曼城 vs 纽卡斯尔」主队徽错位）。

## 根因
`.ls-body` 为 `1fr auto 1fr`，两侧 `.ls-side` 用 flex 把「队徽+队名」整组推靠中线；短队名时队徽跟着组一起向中心移动，无法形成固定竖列。

## 修复
- 列表行改为五列 CSS Grid：`auto 1fr auto 1fr auto` → `[主队徽 | 主队名…] [VS/比分] […客队名 | 客队徽]`
- 队徽固定尺寸列；队名 `ellipsis` + 主队右对齐 / 客队左对齐（队徽在外、队名朝中）
- 中间 VS / 开球时间 / 比分 / 进行中状态仍居中
- `scoreCard` 共用 markup（赛程=比分列表）一并生效

## 版本 / 部署
- Web + APK：**1.9.57** / versionCode **97**
- APK：`/jingcai-predict-1.9.57.apk` 与 `/jingcai-predict.apk`
