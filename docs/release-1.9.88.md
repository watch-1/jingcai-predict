# 1.9.88 — 赛况「态度」Tab + 金豆改名云朵

## 产品
1. **赛事详情新 Tab「态度」**（默认首位）：拉取该 `matchId` 专栏态度帖，澳客风格卡片（作者、真实结算连红/近N中M、命中率%、已购人数、云朵价格），付费帖用云朵解锁。
2. **虚拟币更名**：用户可见文案 **金豆 → 云朵**（钱包/充值套餐/发帖定价/解锁按钮/不足提示等）。
3. **云朵图标**：`/icons/yun-duo.png`（白云透明底），用于价格与钱包展示。
4. **禁止投注/出票**（不变）。

## 技术
- `lib/column.js`：`currencyLabel=云朵`、`currencyIcon`；套餐/错误文案；`authorPickStats.hitPct`（≥3 场结算才展示%）
- `public/app.js`：`DETAIL_TABS_BASE` 插入 `attitude`；`matchAttitudeTabHtml` / `colMatchAttitudeCard` / `loadMatchAttitude`；`COL_COIN_ICO` → 云朵图
- `public/style.css`：`.col-macard` / `.col-hitpct` / `.col-coin-ico`
- SW `jc-v1.9.88`；APK versionCode **125**

## Deploy
- `/opt/jingcai` **1.9.88**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.88.apk`（versionCode **125**）

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.88`
- `/api/column/meta`：`currencyLabel=云朵`，`currencyIcon=/icons/yun-duo.png`，套餐「100 云朵」
- `/icons/yun-duo.png` HTTP 200，`Content-Type: image/png`，5968 bytes
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `/api/column/feed?tab=attitude&matchId=…` 按场过滤 OK
- APK md5 `143d870b47da1e331b3ef3c91c93fa40`；HTTP 200 size **6565549**；versionCode **125**
