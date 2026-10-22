# 1.9.45 更长赛后 AI 叙事 + AI 聊球

## 用户价值
1. **更长主因叙事**：DeepSeek `max_tokens` 提到约 520；提示要求 ≥6 行中文并用换行；evidence 有 Top 球员时点名过程行为（进球/助攻/扑救/关键传/射门）。缓存保留；`narrRev` 与短文检测 → 旧短缓存在刷新/`?refresh=1` 时自动重写。
2. **AI 聊球**：赛事详情「聊球」Tab 上方新增 AI 面板，仅就本场紧凑上下文（队名/比分/赔率快照/复盘标签）对话。
3. **安全与限额**：中英关键词/正则 + 系统提示拒绝赌诱、未成年色情、暴力、政治煽动、越狱、窃密；软拒绝文案。限额：普通 **4 条/分 · 30 条/日**，会员 **6 条/分 · 60 条/日**；用尽返回「今日次数已用完」。用量计数入库，不存完整 prompt；服务端保留最近 K 轮短历史。

## 改动
- `lib/deepseek-review.js`：MAX_TOKENS、prompt、`narrRev`/`needsAiEnrich`/`isShortNarrative`
- `lib/deepseek-match-chat.js`：新增 `/api/ai-match-chat*`
- `lib/post-match-review.js`：version 1.9.45
- `public/app.js` / `style.css`：AI 聊球 UI
- `server.js`：挂载路由
- 测试：短叙事/安全/限额常量

## 限额（已选）
| | 每分钟 | 每日（上海日） |
|--|--|--|
| 游客/登录非会员 | 4 | 30 |
| 会员 | 6 | 60 |
| 连发间隔 | ≥2.5s | |

主体键：登录用户 `u:id`，否则 `X-Device-Id` / `deviceId`，再否则 IP；另有 IP 分钟软顶。

## APK
`dist/jingcai-predict-1.9.45.apk`（versionCode **85**）→ http://120.77.152.74:8088/jingcai-predict-1.9.45.apk

## 密钥
生产 `/opt/jingcai/.env` 已有 `DEEPSEEK_API_KEY`（勿 echo）。

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.45-prod-pre-20261016-110132
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/*.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
