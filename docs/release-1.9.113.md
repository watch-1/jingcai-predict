# 1.9.113 — 球队赛程排版 redesign + 联赛中文名

## 问题
1.9.112 后球队详情「过去比赛」仍：队名单行 ellipsis（巴黎圣… / 斯特拉…）、队徽与队名间距不均；顶栏联赛显示英文 **Ligue 1** / **UEFA Champions League**，与 胜/负 徽章挤在一起。

## 根因
- ESPN `teamrecent` 只写 `league`（EN），`leagueZh` 为空；客户端 `fxRowHtml` 用 `fx.leagueZh || fx.league` 且**未**走 `forceLeagueZh`。
- CSS 队名 `white-space:nowrap` + ellipsis，窄栏必截断。

## 修复（不破坏 1.9.112 组装缓存速度）
1. **布局**：三列 grid `home | score | away` 保留；队徽与队名同在 `.fx-side`；队名改为最多 **2 行**（line-clamp）+ 略小字号，减少丑陋省略。
2. **顶栏**：`日期 | 中文联赛 | 胜/平/负`；联赛 `flex:1` ellipsis，徽章 `margin-left:auto`，不再与联赛碰撞。
3. **联赛中文**：
   - 客户端 `fxRowHtml` → `forceLeagueZh(...)`；未来场缺联赛时回退球队 `leagueZh`。
   - 扩 `FORCE_LEAGUE_ZH` / 启发式（法甲/欧冠/欧联…）。
   - 服务端 `mapEspnFormRows` / `fetchTeamRecent` 填 `leagueZh()`；`cloneAssembled` 读缓存时轻量 normalize（不重建、不打 ESPN）。

## 时延（prod localhost）
| 场景 | 结果 |
|------|------|
| 球队详情 warm mem | **~2ms**（与 1.9.112 同级） |
| PSG recent | `Ligue 1→法甲`，`UEFA Champions League→欧冠` |
| upcoming 空联赛 | 回退 **法甲** |
| 身价 / 阵容 | 保留（PSG 13.63亿欧，25 人） |

## 版本
- versionName **1.9.113** / versionCode **150**
- 合作包 versionName **1.9.113-test**
- `sw.js` VER `jc-v1.9.113`

## APK

| file | size | md5 |
|------|------|-----|
| jingcai-predict-1.9.113.apk | 7246621 | 57139f6a8d9496a44eff24f0b6e2af55 |
| jingcai-predict-1.9.113-partner.apk | 7246621 | beb27523685a4d5e8942f925cb2e9c99 |
| jingcai-predict.apk (→正式) | 7246621 | 57139f6a8d9496a44eff24f0b6e2af55 |

- http://120.77.152.74:8088/jingcai-predict-1.9.113.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.113-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk
