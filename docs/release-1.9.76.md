# 1.9.76 — 专栏发帖关联比赛选择持久化

## Bug
`#/column/compose`：用户选好「关联比赛」后，再点话题标签 / 胜平负表态 / 「比赛态度|星球互动」 tab，整页 `render()` 重建 `<select id="colMatchSel">`，但 `S.columnCompose.matchId` 从未从 DOM 写回，导致选中场次被清空，必须重选。

## Root cause
- 比赛 `<select>` 的值只存在于 DOM。
- `colComposeTopic` / `colPick` / `colKind` 只更新 topic/pick/kind 后调用 `render()`。
- `pageColumnCompose()` 用 `c.matchId`（仍为空）生成 options 的 `selected`，选择丢失。

## Fix
- 新增 `syncColumnComposeFromDom()`：从 `#colMatchSel` / `#colTitle` / `#colBody` 写回 `S.columnCompose`。
- `colKind` / `colComposeTopic` / `colPick` / `colPublish` 在改状态或提交前先 sync。
- `change` 监听器也对 match/title/body 即时 sync。
- 重绘时 `selected` 仍由 `c.matchId` 决定，故跨控件点击后场次保持。

## Deploy
- `/opt/jingcai` **1.9.76**，systemd `jingcai`
- APK：`http://120.77.152.74:8088/jingcai-predict-1.9.76.apk`（versionCode **113**）

## 验证
- `curl …/api/status` → `1.9.76`
- `app.js` 含 `syncColumnComposeFromDom`
- 发帖页：选场次 → 点「分析」/「平局」→ 关联比赛仍为所选场次

## Live verify（2026-10-18 Asia/Shanghai）
- `curl http://120.77.152.74:8088/api/status` → `version: 1.9.76`
- `node test/column-test.js http://120.77.152.74:8088` → OK
- `app.js` 含 `syncColumnComposeFromDom`；`colKind`/`colComposeTopic`/`colPick`/`colPublish` 均先 sync
- APK md5 `335fb98d5c2cf90630bc28e7e66eec8c`；HTTP 200 size **6499695**
- 备份：`/opt/jingcai/backups/v1.9.76-prod-pre-20261018-065719`
