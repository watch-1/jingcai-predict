# 1.9.11 射手/助攻榜头像覆盖

## 问题
数据中心射手榜大量字母占位。原因：ESPN 足球 headshot CDN 404；TheSportsDB 姓名/队名匹配失败；非英超未预热；空结果缓存过久。

## 修复（不编造）
1. 本地索引：`tsdb-photos.json` + `squads/*.json`（姓名|俱乐部；唯一全名可跨队）。
2. 队名别名 + 重音归一；俱乐部名单 `lookup_all_players` 优先。
3. `refreshAll`（日更/6h）后 `warmAllLeaderPhotos(top50)`，跨进程 lock。
4. UI：`photo` onerror 可重试 `photoAlt` 一次，再字母占位。

## 覆盖率（约 50 人/榜，预热后）

| 联赛 | 射手 前→后 | 助攻 前→后 |
|------|------------|------------|
| 英超 | 86%→92% | 56%→84% |
| 西甲 | 22%→80%+ | 22%→70%+ |
| 德甲 | 22%→84%+ | 12%→80%+ |
| 意甲 | 16%→68% | 10%→48% |
| 法甲 | 6%→68% | 8%→78% |
| 中超 | 6%→16% | 6%→16% |
| 英冠 | 6%→60% | 6%→62% |
| 荷甲 | 74%→96% | 86%→96% |

## 诚实上限
- ESPN 足球无稳定头像 URL，不能伪造 CDN 路径。
- TheSportsDB 免费限流；冷门/中超球员资料稀缺 → 字母占位正确。
- 预热在后台完成，首次打开可能仍见补图过程。

## APK
`dist/jingcai-predict-1.9.11.apk`（versionCode **51**）→ http://120.77.152.74:8088/jingcai-predict-1.9.11.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.11-prod-pre-20261015-041202
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
