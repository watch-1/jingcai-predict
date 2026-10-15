# 1.9.10 积分榜队徽 + 欧战/降级分区

## 问题（1.9.9）
积分榜球队显示「曼」「阿」等字母圆标，队徽加载失败；缺少欧战资格区 / 降级区可视化与图例；球队详情分区说明不足。

## 根因
`/api/logo` 白名单未放行 `a.espncdn.com`，ESPN 队徽 URL 被判无效 → 前端 onerror 回退字母标。

## 修复
1. **队徽**：`server.js` `LOGO_HOSTS` 增加 ESPN CDN；路径限 `/i/teamlogos/` 等；积分榜行在缺 logo 时回退 `espncdn .../{teamId}.png`。
2. **分区色条 + 图例**（按近年名额惯例，非官方最终名额）：
   - 英超/西甲/意甲：1–4 欧冠、5 欧联、6 欧协联、18–20 降级
   - 德甲：1–4 / 5 / 6，16 降级附加赛，17–18 降级
   - 法甲：1–3 / 4 / 5，16 附加赛，17–18 降级
   - 中超：1–2 亚冠、3 亚冠二级、15–16 降级
   - 英冠：1–2 升级、3–6 升级附加赛、22–24 降级
   - 荷甲：1–2 / 3 / 4，16 附加赛，17–18 降级
3. **球队详情**：横幅「目前第N · 欧冠区 · N分」；近榜首/近降级区时附分差。
4. **榜单行**：左侧色条；前几名紧凑「榜首差」；靠近降级带显示「保级+」。

## 验证（2026-10-15 Asia/Shanghai）
- Headless 英超：20/20 队徽图，0 字母标；zone-cl×4 / el×1 / uecl×1 / rel×3；图例齐全。
- 曼城详情：队徽 +「目前第1 · 欧冠区 · 18分」。

## APK
`dist/jingcai-predict-1.9.10.apk`（versionCode **50**）→ http://120.77.152.74:8088/jingcai-predict-1.9.10.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.10-prod-pre-20261015-035637
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
