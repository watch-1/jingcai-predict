# 1.9.162 — 过程数据空状态文案 + 部署保留 `.env`

## 背景

生产曾因 `/opt/jingcai/.env` 缺失导致 `GET /api/process-stats` 返回 `reason:"no_key"`，数据 Tab「近期过程数据」为空；密钥已在服务器恢复。本版避免用户端暴露「未配置密钥」等内部用语，并固化部署时**不得覆盖/删除** `.env` 的说明与同步脚本。

## 改动

1. **`public/app.js`**：过程数据不可用角标/侧栏原因改为中性文案（「暂未就绪」「数据源暂停」「过程数据源暂未就绪」）。
2. **`lib/process-stats.js`**：`no_key` 聚合 `noteZh` 与侧栏一致，去掉「配置后将自动点亮」。
3. **`docs/deploy-aliyun.md`** + **`tools/sync-prod.sh`**：`rsync --exclude .env` 与 `no_key` 运维排查清单。
4. **`README.md`**：部署节链接到上述文档。
5. **`test/ui-162-test.js`**：回归禁止密钥类 UI 文案。

## 版本

- Web / `config.js` / `sw.js`：**1.9.162**（`jc-v1.9.162`）
- `VERSION.txt`：**1.9.162** / **VERSION_CODE=199**
- Android：`VERSION_NAME=1.9.162`、`VERSION_CODE=199`

## 验证

```bash
node test/ui-162-test.js
npm test
```

## 生产（合并后由协调员执行）

```bash
./tools/sync-prod.sh root@120.77.152.74:/opt/jingcai/
ssh root@120.77.152.74 'cd /opt/jingcai && npm install --omit=dev --registry=https://registry.npmmirror.com && systemctl restart jingcai'
curl -sS 'http://127.0.0.1:8088/api/process-stats?homeTeamId=872&awayTeamId=1475&limit=5' | head -c 200
```

APK（可选，文案修复；数据本身依赖 API）：

```bash
VERSION_NAME=1.9.162 VERSION_CODE=199 API_BASE=http://120.77.152.74:8088 ./android/build-apk.sh
```
