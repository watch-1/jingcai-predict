# 1.9.125 — 冷启动屏闪（process-kill）：home HTML 快照 + boot-shell

## 问题
用户：「关闭软件重新打开软件时还是会出现屏闪的问题，请继续检查并修复」
截图：搜索栏正常，banner 半海军半球场、空白白卡、桑德兰队徽悬浮、预测卡半截 + 悬浮球 —— classic multi-pass first paint。

## 为何 1.9.124 不够
1. **TAB_KEEP 仅内存**：杀进程 / 关软件重开后全部丢失。
2. **hydrateFromCache 只灌 JSON**：`render({force})` 仍用 `pageHome()` **重建 DOM**；banner JPG / crest 异步解码 → 半渲染帧可见。
3. **paint-hold 仅 2 帧**：约 32ms 后揭开，图片远未到位。
4. **predictCache 未持久化**：高信心区先 pending，prefetch 回流再 `render()` → 又闪。
5. **fillHomeBanners** 异步整段替换 track → banner 再闪一次。

## 修复（1.9.125）
1. **`jc_home_snap_v1`**：首页完整 HTML 快照写入 LS（主题/签名/滚动）；杀进程后冷启动 **一次提交还原**。
2. **`jc_pred_cache_v1`**：精简 predict 报告灌回，使 `tabContentSig` 与快照对齐，避免立刻 force 重绘。
3. **`#boot-shell`**：不透明海军遮罩盖住 WebView，直到 above-fold 图（banner/crest）load/error 或 ≤520ms timeout，再 `revealBootShell()` 单次揭开。
4. 冷路径：`paint-hold` 在 boot-shell 期间不提前移除；网络 `reloadData` 后同签名 **no-op**。
5. 清缓存时一并清除 snap/pred cache。

## 版本
- versionName **1.9.125** / versionCode **162**
- 合作包 versionName **1.9.125-test**
- `sw.js` VER `jc-v1.9.125`

## 验证
- 强制停止 App 再开：应海军 splash → **一次**完整首页，无半 banner / 悬浮队徽 / 空白卡连闪
- 底栏切换仍走 1.9.124 keep-alive

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.125.apk | 8925376 | de7bb041bf976c8dd45fd712af2e6130 |
| jingcai-predict-1.9.125-partner.apk | 8925376 | a14a6f6a5367526d398e77db2f160b1f |
| jingcai-predict.apk (→正式) | 8925376 | de7bb041bf976c8dd45fd712af2e6130 |

- http://120.77.152.74:8088/jingcai-predict-1.9.125.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.125-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.125**，systemd `jingcai` active
- 备份：/opt/jingcai/backups/v1.9.124-prod-pre-20261022-081157.tgz
