# 1.9.122 — 悬浮足球拖动屏闪 + 清晰度/帧率

## 问题
用户（1.9.121 后）：「还是会出现屏闪问题，尤其是当挪动足球时屏闪特别严重。并且足球本来的帧率就有点低顺带提高一些清晰度和帧数」
截图：首页右侧悬浮 3D 足球叠在「今日高信心预测」卡片上，边缘偏糊。

## 根因（拖动屏闪）
1. **每帧写 hit 区 width/height**：`syncCanvasAndHit` 在 rAF 里改布局尺寸 → 强制 reflow，WebView 连带重绘首页列表。
2. **热路径读布局**：`tabbarHeight()` 每帧 `getBoundingClientRect` / `getComputedStyle`（经 `minBallWorldY` 进入拖动/弹跳路径），与 transform 写交叉 → layout thrashing。
3. **全屏透明叠加层未隔离**：`.float-ball-root` 无独立合成层，缺 `contain`/`isolation`，拖动画布时底层预测卡一起脏矩形重绘。
4. **清晰度/帧率**：DPR 被压到 ≤1.5–2、本地画布偏小（~3.4×）、空闲隔帧跳过渲染。

## 修复
### `public/js/float-ball.js`
- 拖动只改 `translate3d`（canvas + hit）；hit 尺寸仅在 resize/show 更新。
- 缓存 tabbar 高度（resize/show 刷新）；拖动/tick 不再读 DOM 几何。
- pointermove 合并到每帧一次；拖动时降低阴影、加 `fb-dragging`。
- 更高 DPR（最高 3）、更大本地画布（~4.2× 球径，上限 288px）、更紧 ortho、各向异性 16、去空闲跳帧、`desynchronized` WebGL。

### CSS / fallback
- `.float-ball-root`：`translateZ(0)` + `isolation: isolate` + `contain: layout style`。
- canvas/hit：`will-change: transform`；fallback 同步 `translate3d` + rAF。

## 版本
- versionName **1.9.122** / versionCode **159**
- 合作包 versionName **1.9.122-test**
- `sw.js` VER `jc-v1.9.122`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.122.apk | 8371085 | b946037c1d5c3ccba99ac52a0c7dc634 |
| jingcai-predict-1.9.122-partner.apk | 8371085 | 1feb5d32b3197393fbe6ca47af314655 |
| jingcai-predict.apk (→正式) | 8371085 | b946037c1d5c3ccba99ac52a0c7dc634 |

- http://120.77.152.74:8088/jingcai-predict-1.9.122.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.122-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.122**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.121-prod-pre-20261022-073058.tgz`

## 验证建议
- 首页长按拖动悬浮球：预测卡/列表不应再整页闪白或闪一下。
- 球边缘应更清晰；静止慢转与拖动都应更跟手（满 rAF）。
