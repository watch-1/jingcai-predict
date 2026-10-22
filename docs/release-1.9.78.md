# 1.9.78 — 去掉用户端「禁止下注/出票」类文案

## 产品
全站用户可见文案去掉禁止下注 / 出票 / 购彩代下 / 本站不提供投注服务 / 仍不出票不代打 等措辞，统一为中性 **「仅供参考」** 或删除。
- 页脚、首页条、专栏 intro/compose/wallet note、预测/赔率/聊球 note、会员/协议模板、meta description
- 服务端 `noteZh`（column / odds / chat / predict / news / league-tables）同步
- 专栏帖正文：发布与展示时剥离历史合规后缀（`sanitizeBanCopy`）
- **产品行为不变**：无出票/代打能力；聊球仍拦截诱导购彩类提问

## Deploy
- `/opt/jingcai` **1.9.78**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.78.apk`（versionCode **115**）

## 验证
- `curl …/api/status` → `1.9.78`
- `rg` 公共 HTML/JS：**无** `禁止下注|禁止投注出票|购彩代下|本站不提供投注|仍不出票|理性购彩`
- `node test/column-test.js http://120.77.152.74:8088`

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.78`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/meta` noteZh → `…仅供参考`（无禁止投注/出票）
- public HTML/JS grep：**无** banned literals（仅 sanitize 正则内匹配）
- APK md5 `0c43a42d17b09a9284b6a49c494ac8c8`；HTTP 200 size **6499695**
- 备份：`/opt/jingcai/backups/v1.9.78-prod-pre-20261018-072246.tgz`
- 生产 predict-reports scrubbed 88；column_posts body scrubbed 1
