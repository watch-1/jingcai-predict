# 1.9.119 — 主页顶部搜索栏（球队 / 球员 / 比赛）

## 需求
用户：「把主页顶部位置的标题还有左上角软件图标删掉，换成一个搜索栏，类似图2，能够在搜索栏内搜具体球队信息，具体球员信息，相关球队比赛场次。并且能直接从搜索栏跳转过去」
- 图1：原主页深蓝 header（左图标 +「竞彩预测」）
- 图2：胶囊搜索栏参考
- 图3：搜索结果页参考（返回 + 输入 +「搜索」+ 分类 tab + 分组卡片）

## 改动
### UI
- `pageHome`：去掉 logo +「竞彩预测」，改为胶囊搜索入口（放大镜 +「请输入查询的内容」），适配轻奢/球场主题 header
- 新页 `#/search`：图3 风格（返回 / 胶囊输入 /「搜索」按钮；tab **全部 / 球队 / 球员 / 比赛**）
- 输入防抖 320ms；点结果跳转已有详情路由

### 数据 / API
- 新增 `lib/global-search.js` + `GET /api/search?q=&tab=&limit=`
- **球队**：ESPN 积分榜磁盘缓存 + TEAM_ZH → `#/team/:espnId?league=`
- **球员**：射手/助攻榜 + 阵容索引 → 优先 `#/aplayer/:id?league=`，否则 `#/player/:id`
- **比赛**：matches/schedule/results 池按队名匹配 → `#/match/:id`（客户端本地池补充）

### 版本
- versionName **1.9.119** / versionCode **156**
- 合作包 versionName **1.9.119-test**
- `sw.js` VER `jc-v1.9.119`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.119.apk | 8005442 | 86c9fff388d1c5aecd502c4864fa6fbc |
| jingcai-predict-1.9.119-partner.apk | 8005442 | c04c7a09819d342272ab0b05d45b8c4f |
| jingcai-predict.apk (→正式) | 8005442 | 86c9fff388d1c5aecd502c4864fa6fbc |

- http://120.77.152.74:8088/jingcai-predict-1.9.119.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.119-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

## 部署
- `/opt/jingcai` **1.9.119**，systemd `jingcai` active
- 备份：`/opt/jingcai/backups/v1.9.118-prod-pre-20261022-053157.tgz`

## Smoke (prod)
- `q=曼联` → 球队 `#/team/360?league=epl`；球员布鲁诺等 `#/aplayer/…`；比赛含科莫/利兹联/马竞/热刺 vs 曼联 `#/match/…`
- `q=Haaland` → `#/aplayer/253989?league=epl`
