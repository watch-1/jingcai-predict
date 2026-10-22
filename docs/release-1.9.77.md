# 1.9.77 — 专栏发帖限额上调 + 作者页澳客化 + 金豆付费帖

## 产品
1. **发帖限额**（明确不是 1 篇/天）：每分钟 10、每小时 20、每日（上海时区）**20**；连发间隔约 1.5 秒。见 `/api/column/meta.limits.postRate`。
2. **作者主页**对齐澳客参考：Tab「全部态度 / 足球态度 / 收费」；「最新表态」+「历史表态」白卡片；完场结算展示 **单选中 / 黑**；收费卡显示 **已购人数 + 金豆价格**。
3. **付费帖（虚拟金豆）**：发帖可选价格 0/8/18/38/68/98；读者用钱包金豆解锁正文（标题可预览）；作者本人始终可见全文；购买记 **已购** 计数。模拟充值同会员 mock，**不真实扣款**。**禁止投注/出票**。

## 金豆怎么用
- 入口：`#/column/wallet`（「我的」→ 金豆钱包 / 专栏页「金豆」）
- `GET /api/column/wallet` 余额 + 套餐；`POST /api/column/wallet/topup` `{ packId }` 模拟到账
- `POST /api/column/posts/:id/purchase` 扣豆解锁；不足返回 402
- 作者收益：读者支付金豆的 80% 记入作者余额（仍为虚拟币）

## DB
- `users.coin_balance`
- `column_posts.price_coins` · `purchase_count`
- `column_purchases` · `coin_topups`

## Deploy
- `/opt/jingcai` **1.9.77**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.77.apk`（versionCode **114**）

## 验证
- `curl …/api/status` → `1.9.77`
- `node test/column-test.js http://120.77.152.74:8088`
- meta：`monetization.paidPosts=true`；`limits.postRate.perDay=20`

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.77`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/meta`：`paidPosts=true`；`postRate.perDay=20`
- APK md5 `f97dd27678a75c9248cbf8ab01f75b79`；HTTP 200
- 备份：`/opt/jingcai/backups/v1.9.77-prod-pre-20261018-071344`
