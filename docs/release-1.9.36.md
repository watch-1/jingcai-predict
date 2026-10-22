# 1.9.36 会员中心付费 CTA 固定底栏 + Theme B 去白雾

## 问题
会员中心「立即开通」底栏：
1. `position:sticky` 因栏后还有订单菜单/页脚，滚动时跟着内容走，未钉在视口底部
2. Theme B（绿茵沉浸感）下 footer 仍是浅色 `#eef1f6` 渐变，与暗色页冲突（白雾）

## 改动
1. `.vip-bar` 改为 `position:fixed`，钉在视口底（同 tabbar 思路）；`.view.has-vip` / `.view.sub.has-vip` 提供 `padding-bottom`，内容从底下滚过
2. Theme A 底栏改用 `var(--bg)`；Theme B `html[data-theme=pitch] .vip-bar` 改为 `#070B14` 暗色渐变
3. `render()` 在会员中心（已登录）与确认支付表单态切换 `has-vip`

## 验证（puppeteer / pitch）
`vip-bar` computed `position:fixed`；滚动后 top 不变、贴视口底；背景 `rgb(7,11,20)`，无 `#eef1f6`。

## APK
`dist/jingcai-predict-1.9.36.apk`（versionCode **76**）→ http://120.77.152.74:8088/jingcai-predict-1.9.36.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.36-prod-pre-20261016-083257
cp -a $B/package.json /opt/jingcai/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
