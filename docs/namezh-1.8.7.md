# 1.8.7 阵容中文名修复

## 根因
1. `data/squads/_namezh.json` 仅约 32 条（多为尤文），国际米兰等热门队球员 ID/英文名未覆盖。
2. `loadSquad` 只套预计算 JSON，不在线查 Wikidata（国内曾被墙）；磁盘/内存缓存命中时**未再次套用** `_namezh.json`，即使后来扩了映射也不生效。
3. 前端 `/api/squad-zh` 懒加载依赖 Wikidata，阿里云侧常失败，故 UI 一直显示英文。
4. TheSportsDB 免费 key 名单不全（国米现仅约 9 人），与页脚说明一致。

## 修复
- `lib/squad.js`：统一 `applyNameZh`，缓存命中也重套映射；按 id / 英文名 / alt 查找。
- `lib/league-tables.js`：`playerZh` 优先读 `_namezh.json`（伤停/射手等同步中文）。
- `lib/wikidata-zh.js`：优先用搜索结果的中文 display label；不缓存空失败。
- `public/app.js`：有中文则主显中文，副标英文原文。
- `tools/prefetch-namezh.js`：可在能访问 Wikidata 的环境批量预计算。
- 扩大 `_namezh.json`（约 227 key / 166 独特中文名），覆盖五大联赛+欧冠常客明星及国米本场可见名单等。
- 补 Club Brugge（sporttery 225）到 crests/_idmap。

## 样例（Wikidata，非编造）
| 英文 | 中文 |
| --- | --- |
| Federico Dimarco | 费德里科·迪马尔科 |
| Alessandro Bastoni | 亚历山德罗·巴斯托尼 |
| Benjamin Pavard | 邦雅曼·帕瓦尔 |
| Lautaro Martinez | 劳塔罗·马丁内斯 |
| Erling Haaland | 埃尔林·哈兰德 |
| Mohamed Salah | 穆罕默德·萨拉赫 |

无维基中文译名者（如 Aleksandar Stankovic、Carlos Neves、Ange-Yoan Bonny）保留英文。

## APK / 回滚
- APK：`dist/jingcai-predict-1.8.7.apk`（versionCode 36），已同步 `http://120.77.152.74:8088/jingcai-predict-1.8.7.apk`
- 回滚：恢复 `/opt/jingcai/backups/v1.8.7-pre-namezh/` 内文件后 `systemctl restart jingcai`
