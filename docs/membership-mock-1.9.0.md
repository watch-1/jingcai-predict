# 1.9.0 资讯会员 + 模拟支付（sandbox/mock）

## 定位
- 产品：竞足**资讯 / 预测** App。
- 支付：**资讯会员 / 高级数据**订阅，**禁止**下注、出票、购彩代下。
- 当前：**仅 mock 支付**，点选微信/支付宝图标后模拟成功，**不真实扣款**。
- 正式微信/支付宝：须商户入驻、经营类目确认、证书与回调后再接（接口位已预留）。

## 套餐（可改 `lib/membership.js` PLANS）
| 套餐 | 时长 | 价格 |
| --- | --- | --- |
| 月度会员 | 31 天 | ¥19.90 |
| 季度会员 | 93 天 | ¥49.90（默认高亮） |
| 年度会员 | 365 天 | ¥128.00 |

## 权益文案（按现有能力如实）
- 高级预测简报、数据中心完整、无广告纯净浏览、方案/关注云同步、资讯优先体验（占位）。
- **不承诺**购彩、代下、出票。

## API
- `GET /api/membership/plans` — 套餐/权益/渠道（公开，`mode: mock`）
- `GET /api/membership/status` — 当前会员状态（登录）
- `POST /api/membership/orders` — `{ planId, channel: wechat|alipay }` 创建待支付订单
- `POST /api/membership/orders/:id/pay` — **mock 确认支付**并延长 `users.member_until`
- `GET /api/membership/orders` — 订单列表
- `POST /api/membership/orders/:id/cancel` — 取消待支付
- `POST /api/membership/notify/:provider` — **正式回调预留**，当前 501
- `useRealProvider: true` 调 pay 时走 `createProviderPrepay` 预留位 → 501

## 存储
- SQLite：`users.member_until`；表 `membership_orders`
- 续费：在 `max(now, member_until)` 上叠加天数

## 前端
- 「我的」会员卡片 → `#/membership` → `#/pay` → 模拟成功 → 状态生效
- `#/orders` 订单记录；`#/member-terms` 协议占位

## 接真支付差距清单
1. 微信/支付宝**商户号**与主体资质  
2. 经营**类目**审核（资讯/软件服务等，勿走博彩类目）  
3. API 证书 / 密钥 / 应用 APPID  
4. 统一下单 + App 调起（或 H5/JSAPI）  
5. **支付结果异步回调**验签与幂等入账（替换 mock `/pay`）  
6. 退款/对账、HTTPS、隐私与协议定稿  
7. 应用市场上架对内购/第三方支付的合规说明  

## 测试
```bash
node test/membership-test.js http://127.0.0.1:8088
node test/membership-test.js http://120.77.152.74:8088
```

## 回滚
本地：`backups/v1.9.0-pre-membership-*`  
服务器：`/opt/jingcai/backups/v1.9.0-prod-pre-*` 恢复后 `systemctl restart jingcai`


## 部署结果（2026-10-14 CST）
- 线上：`120.77.152.74:8088` **v1.9.0**
- 生产备份：`/opt/jingcai/backups/v1.9.0-prod-pre-20261014-040957`
- 本地备份：`backups/v1.9.0-pre-membership-20261014-040602`
- API 冒烟：`node test/membership-test.js http://120.77.152.74:8088` → ALL PASSED
- APK：`dist/jingcai-predict-1.9.0.apk`（versionCode 41）→ `http://120.77.152.74:8088/jingcai-predict-1.9.0.apk`
