# 1.9.44 DeepSeek 赛后主因 AI 解读

## 用户价值
1. **主因解读 AI 叙事**：完场且技术统计+球员就绪后，本地打包 compact evidence（过程 vs 基线、对位、赛前 lean/信号、各位置 Top 球员关键动作），调用 DeepSeek **一次**（`deepseek-chat`，max_tokens≈250，低温），缓存到复盘 JSON；UI「主因解读」优先展示 AI 中文叙事，数据对照区块仍在前。
2. **失败兜底**：无 key / 超时 / 非法 enum / 弱叙事 → 保留原规则 `buildMainExplanations`；置信度耦合仍只用结构化 tags（6%/10% 规则不变），叙事仅展示。
3. **校验**：mechanism/alt 必须落在既有 enum；signals 非法块回退规则；不把密钥写入 git/docs/public。

## 改动
- 新增 `lib/deepseek-review.js`：evidence pack / call / validate / enrich。
- `lib/post-match-review.js`：缓存命中或新建时 `enrichWithDeepSeek`；`renderReviewHtml` 展示 AI解读。
- `lib/fixture-players.js`：归一化增加 `saves`（门将扑救）。
- `public/style.css`：`.pmr-ai` 样式。
- 测试：`test/post-match-review-test.js` 离线校验。

## 密钥
- 本机：`process.env.DEEPSEEK_API_KEY`（长度校验，不打印值）。
- 生产：`/opt/jingcai/.env` → systemd `EnvironmentFile=-/opt/jingcai/.env`（jingcai 服务）。

## APK
`dist/jingcai-predict-1.9.44.apk`（versionCode **84**）→ http://120.77.152.74:8088/jingcai-predict-1.9.44.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.44-prod-pre-TIMESTAMP
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/*.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
# 可选：从 .env 去掉 DEEPSEEK_API_KEY 行
systemctl restart jingcai
```
