# 1.9.9 数据中心：射手头像 + 球员详情（ESPN）

## 问题（1.9.8 线上）
1. 射手/助攻榜只显示首字母占位，无真实头像。
2. 点击球员卡片进入「球队详情」并显示「暂无资料 / 未找到该球队资料」——把 ESPN 球员 id 当成了球队/旧 AF id。

## 修复
### 头像
- 列表走现有阵容照片管线：优先 ESPN headshot（足球侧常为空），否则 TheSportsDB 按 **姓名+俱乐部** 匹配（含俱乐部名单 `lookup_all_players` 回退），**不编造**。
- `enrichLeaderPhotos`：磁盘缓存同步填充（接口不阻塞）；后台队列补齐并写回 `scorers-*/assists-*` 磁盘缓存。
- `warmLeaderPhotos('epl', 20)` 预热；命中写入 `tsdb-photos.json`。

### 球员 / 球队详情
- `/api/af-player`：先走 `fetchEspnPlayerDetail`（ESPN athlete + 榜单 G/A + TSDB 照片），再回落 AF。
- `/api/team`：不再把 `pickSeason()` 强塞进 `getStandings`（避免跳过 ESPN）；ESPN 积分行命中后拉 `fetchTeamRoster`。
- 前端仍 `#/aplayer/:id` → 球员详情；俱乐部 `#/team/:id` → 球队详情。

## 验证（线上 2026-10-14，Asia/Shanghai）
- 英超射手榜 Top20 头像：**19/20（95%）**；缺 Pascal Gross（TSDB 无可用图）。
- 助攻榜 Top20：**17/20（85%）**。
- Headless：射手有图；点哈兰德 → `#/aplayer/253989` 球员详情（进球/助攻/俱乐部/位置有内容）；点俱乐部 → `#/team/382` 曼城详情（排名/积分/阵容 27 人）。
- João Pedro / 切尔西同样可用。

## APK
`dist/jingcai-predict-1.9.9.apk`（versionCode **49**）→ http://120.77.152.74:8088/jingcai-predict-1.9.9.apk  
（`jingcai-predict.apk` 已同步替换）

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.9-prod-pre-20261014-232501
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
