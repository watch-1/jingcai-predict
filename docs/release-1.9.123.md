# 1.9.123 — 足球变大/更卡 + 屏闪根因回滚

## 问题
用户（1.9.122 后）：「足球变大了而且更卡，以及屏闪问题依然没有解决，请全盘检查是什么原因」
截图：首页几乎空白（浅底 + 一张空白卡片），右下角超大悬浮足球压在底栏上。

## 根因（有代码证据，非猜测）

### A. 球变大（1.9.122 渲染“清晰度”误伤）
视觉直径由 `localCss / (ORTHO_HALF/BALL_R)` 决定，与物理 `ballScreenR` 无关：

| 版本 | ORTHO 倍数 | canvas 公式 | 典型 diam (360宽) | GPU buffer @DPR |
|------|------------|-------------|-------------------|-----------------|
| 1.9.121 | 2.75 | `clamp(150–220, r×3.4)` | **54.5px** | 150×2=**300** |
| 1.9.122 | **2.45**（更紧→球更大） | `clamp(180–288, r×4.2)` | **73.5px**（+35%） | 180×3=**540**（×1.8） |

`float-ball.js` `resizeLocalCanvas` + `ORTHO_HALF` + `pickDpr`（DPR 封顶 3）直接造成「变大 + 更卡」。

### B. 更卡 / 屏闪（WebView GPU thrashing）
1.9.122 叠加：`desynchronized: true`、各向异性 16、空闲也每帧 `renderer.render`、更大 WebGL 缓冲。
全屏透明 `.float-ball-root` + 重 WebGL 时，Android WebView 合成层易丢首页内容 → **只剩底栏 + 大球的空白帧**（与截图一致）。

### C. 首页仍整页擦写
`render()` 仍 `view.innerHTML = …`；首页 `loadLiveScores().then(render)` 与 live-stats 回流再次整页擦写。
1.9.121 的 `.paint-hold` 只撑 **1 个 rAF**，GPU 忙时会露出浅底空卡。

## 修复（优先回滚有害 upsizing，保留 122 拖动隔离）

### 回滚（有害）
- `ORTHO_HALF` → `BALL_R * 2.75`
- canvas → `r×3.4` / max **220**（视觉恢复 ~54px）
- DPR → ≤2 / 1.75 / 1.5（**不**靠放大 CSS 提清晰度）
- 去掉 `desynchronized`
- 各向异性 → 8；空闲高 DPR 隔帧渲染

### 保留（有益）
- 拖动只改 `translate3d`；hit 尺寸不在每帧改
- tabbar 高度缓存；pointermove 合并到每帧一次；`fb-dragging` 降阴影

### 屏闪额外
- `paint-hold` 持有到 **连续 2 个 rAF**
- 首页 live-scores / live-stats 回流：`softPatchLiveScoreCards()` 原地改比分，避免整页 wipe
- `.float-ball-root { contain: layout style paint }`

## 版本
- versionName **1.9.123** / versionCode **160**
- 合作包 versionName **1.9.123-test**
- `sw.js` VER `jc-v1.9.123`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.123.apk | 8560064 | d69ea42012e0491bc4367713dd6c12cc |
| jingcai-predict-1.9.123-partner.apk | 8560064 | 8eb6c6bf8691849a2df7c70d0cea7b3b |
| jingcai-predict.apk (→正式) | 8560064 | d69ea42012e0491bc4367713dd6c12cc |

- http://120.77.152.74:8088/jingcai-predict-1.9.123.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.123-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.123**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.122-prod-pre-20261022-073857.tgz`

## 验证建议
- 球视觉大小应回到 1.9.121 量级（明显小于 1.9.122）
- 拖动/静止应更跟手，首页列表不应整页闪白
- 冷启动 / 比分刷新：不应再出现「只有大球+底栏」的空白帧
