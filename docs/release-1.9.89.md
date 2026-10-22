# 1.9.89 — 首页轮播图去掉文章来源徽章

## 产品
1. **首页轮播新闻 slide**：不再显示文章来源徽章（如「体坛资讯 · 懂球帝」），避免与白色标题叠字。
2. 保留：标题、`阅读全文`、分页点、封面图；热门赛事 / 逆盘命中 slide 不变。
3. 资讯列表与详情页来源展示不变。
4. **禁止投注/出票**（不变）。

## 技术
- `public/app.js`：`slideNews` 移除 `bn-kicker` 来源行
- SW `jc-v1.9.89`；APK versionCode **126**

## Deploy
- `/opt/jingcai` **1.9.89**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.89.apk`（versionCode **126**）
- 备份：`/opt/jingcai/backups/v1.9.88-prod-pre-20261018-094200.tgz`

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.89`
- Live `app.js` `slideNews`：无 `bn-kicker` / 无来源；仍有标题 +「阅读全文」
- 资讯列表 `news-src` 仍保留
- APK md5 `b2dc3d1fe16cff48950d5f63a312cb2e`；HTTP 200 size **6565549**；versionName **1.9.89** versionCode **126**
