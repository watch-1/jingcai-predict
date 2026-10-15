# 1.9.5 阵容 tab：只保留本场阵容 + 球场阵型视图 + 球员照片

## 全队名单仍显示的原因
- APK 的前端打包在 assets 里（不走 sw.js），1.9.4 APK 里全队名单默认是折叠的。截图里的「28人·4有照片」网格是 **1.9.3 的默认视图**，所以基本可以判定用户机上仍是 1.9.3 APK（或网页版被 sw.js 的 stale-while-revalidate 先返回了旧 app.js）。
- 处理：
  - 彻底删除阵容 tab 的全队名单（包括折叠链接、rosterToggle 和 squad-box）。
  - `sw.js` 版本改为 jc-v1.9.5，并把 app shell 改成 **network-first**（离线时才用缓存），以后发版不会再先看到旧 UI。

## 本场阵容（球场视图）
- 主/客切换后，绿色球场按位置缩写分线：GK / 后卫（CD、LB、RB…）/ DM / 中场（CM、LM、RM）/ AM / 前锋，进攻端在上方；同一条线内按左→右排列（L…、-L、中、-R、R…）。
- 每名球员显示：头像（照片或首字）+ 号码角标 + 姓（有中文名时用中文），被换下的标 ↓。
- 球场下方是替补列表（小头像，↑ 登场并标出换下谁）。未公布首发时只显示「上一场首发」（标明非本场）。
- 宽度自适应：球员宽 19%，名字超长省略，`.lineup-sec` 设了 overflow:hidden。400px 和 1024px 下均无横向滚动（scrollWidth == clientWidth）。

## 照片来源（按优先级，绝不臆造）
1. ESPN 名单 headshot（按 ESPN 球员 id）。
2. 本地 TheSportsDB / API-Football 名单缓存，按全名、或「姓 + 号码」唯一匹配。
3. TheSportsDB `searchplayers.php?p=<全名>`，要求**全名和俱乐部名同时匹配**才采用。全局限速约 2.1 秒/次（免费档约 30 次/分钟），结果缓存在 `data/live-stats/espn/tsdb-photos.json`（命中 30 天，未命中 7 天）。首次打开最多等 12 秒，其余在后台继续补，下次打开就有了。
4. 都没有就显示首字头像。
- API-Football 头像链接格式（media.api-sports.io）：只有已有缓存 id 时才可能用到（第 2 条），不会按名字猜 id。ESPN 的 headshot 固定链接格式抽查返回 404，所以不用。

## 照片覆盖（线上，后台补全之后）
| 比赛 | 球队（上一场首发+替补） | 照片 | 首发 |
|---|---|---|---|
| LASK vs 利物浦 | LASK林茨 | 16/20 | 10/11 |
|  | 利物浦 | 18/20 | 9/11 |
| 维拉 vs 费内巴切 | 阿斯顿维拉 | 20/20 | 11/11 |
|  | 费内巴切 | 17/21 | 11/11 |
| 考文垂 vs 纽卡（完场，本场实际） | 考文垂 | 11/20 | 9/11 |
|  | 纽卡斯尔 | 4/20 | 0/11（后台仍在补） |

## 截图（headless Chrome）
`screenshots/v195-lineup-{2041966-home,2041966-away,2041972-away,2041927-home}-{400,1024}.png`

## 限制
- TheSportsDB 的照片可能是该球员在旧俱乐部时拍的（比如穆里奇的旧队球衣），但确实是本人。
- 首次打开冷门球队时照片要等后台限速队列补完（每人约 2 秒）。
- 换人分钟数暂不显示。

## APK
`dist/jingcai-predict-1.9.5.apk`（versionCode 45）→ http://120.77.152.74:8088/jingcai-predict-1.9.5.apk；`jingcai-predict.apk` 已替换。**用户需要卸载/覆盖安装 1.9.5**（截图看来仍是 1.9.3）。

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.5-prod-pre-20261014-185214
cp -a $B/package.json /opt/jingcai/ && cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/ && systemctl restart jingcai
```
本地备份：`backups/v1.9.5-pre-20261014-185138`
