# 1.9.95 — 标题真居中 + 艺术红白点缀 + 首页队名完整

## 1. 标题居中
- 根因：1.9.94 grid+absolute 混用，首页 logo 不对称。
- 修复：`.hdr.center` 用 flex + **绝对铺满居中**的 `.hdr-title`（`left:0;right:0; justify-content:center`），左右 `.hdr-side` 只放控件；首页也改同一结构。数据页标题改为「数据」。

## 2. 顶栏图案
- 去掉斜线 `repeating-linear-gradient(125deg…)`。
- 蓝黑主色 + 横向红白丝带/chevron 色带 + 顶部细白线 + 柔和红/白径向光；右侧 `::after` 红白丝带尖。

## 3. 队名
- 赛程/首页 `matchCard` 去掉行内 `[英超 n]`；队徽约缩 15%（34px），优先完整中文队名。

versionName **1.9.95** · versionCode **132**


## Live artifacts (2026-10-18 Asia/Shanghai)

| File | Size | MD5 |
|------|------|-----|
| jingcai-predict-1.9.95.apk | 6,577,991 | 99d756951f5760cd614fb3b1fdbb9778 |
| jingcai-predict-1.9.95-partner.apk | 6,577,991 | 88f31a947744cba34cbda31c4ad176c0 |
| jingcai-predict.apk | 6,577,991 | 99d756951f5760cd614fb3b1fdbb9778 |

- http://120.77.152.74:8088/jingcai-predict-1.9.95.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.95-partner.apk
