# 阿里云生产部署（/opt/jingcai）

生产路径：`/opt/jingcai` · systemd 服务 `jingcai` · 端口 **8088** · 数据目录 **`/opt/jingcai/data`**（部署时**勿删、勿覆盖**）。

## 环境与密钥（必读）

- systemd 单元使用 `EnvironmentFile=-/opt/jingcai/.env`（前缀 `-` 表示文件缺失时仍启动，但**没有密钥时过程统计等接口会失败**）。
- 过程统计等上游能力依赖 `.env` 中的 `API_FOOTBALL_KEY`（以及可选 `DEEPSEEK_API_KEY` 等）。**不要把 `.env` 提交进 git。**
- 关注场次进球杀进程通知（1.9.267+）：`.env` 增加 `JPUSH_APPKEY` 与 `JPUSH_MASTER_SECRET`（极光控制台，步骤见 `docs/jpush-setup.md`）。未配置时 App 活着仍可本地提醒，划掉进程则无系统窗。
- 运维备份副本（仅服务器，不在仓库）：`/root/jingcai-secrets/jingcai.env` — 用于恢复，勿在文档/PR 中粘贴内容。

## 安全同步（推荐）

从本机或 CI 将代码推到服务器时，**必须排除**运行时文件：

```bash
# 在仓库根目录执行；DEST 为 root@120.77.152.74:/opt/jingcai/
DEST=root@120.77.152.74:/opt/jingcai/
rsync -avz --delete \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'android/build/' \
  --exclude 'dist/' \
  ./ "$DEST"
```

或使用仓库脚本（同等排除规则）：

```bash
./tools/sync-prod.sh root@120.77.152.74:/opt/jingcai/
```

**禁止**使用会清空目标目录且未排除 `.env` 的命令，例如：

- `rsync -avz --delete ./ /opt/jingcai/`（未 `--exclude .env` 时可能删掉服务器上的 `.env`）
- `cp -a public/* /opt/jingcai/public/` 不会动 `.env`，但若整目录替换或 `rsync --delete` 未排除则会丢密钥

部署后：

```bash
ssh root@120.77.152.74 'cd /opt/jingcai && npm install --omit=dev --registry=https://registry.npmmirror.com && systemctl restart jingcai && systemctl is-active jingcai'
```

发布前建议在服务器打备份（与历史 release 文档一致）：

```bash
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /opt/jingcai/backups/v1.9.XXX-prod-pre-$TS
cp -a /opt/jingcai/{package.json,server.js,lib,public} /opt/jingcai/backups/v1.9.XXX-prod-pre-$TS/
```

## 过程数据「暂未就绪」排查清单（给协调员 / Agent）

用户反馈：**数据 Tab → 近期过程数据** 为空，或 App 显示「暂未就绪」类文案时，**先查服务端密钥，再考虑发新 APK**（旧 APK 仍走同一 API）。

1. **确认 `.env` 存在且权限合理**
   ```bash
   test -f /opt/jingcai/.env && ls -la /opt/jingcai/.env
   # 期望：存在，通常 -rw------- root
   ```
   若缺失：从 `/root/jingcai-secrets/jingcai.env` 恢复到 `/opt/jingcai/.env`（勿把内容写入 git/PR）。

2. **确认 systemd 加载了环境变量**
   ```bash
   systemctl show jingcai -p EnvironmentFiles
   systemctl restart jingcai
   ```

3. **直接打 API（不经过 UI）**
   ```bash
   curl -sS 'http://127.0.0.1:8088/api/process-stats?homeTeamId=872&awayTeamId=1475&home=前进之鹰&away=特尔斯达&limit=5' | head -c 400
   ```
   - `reason:"no_key"` 或 `available:false` 且与密钥相关 → 修 `.env` / `API_FOOTBALL_KEY`，**不是**改客户端「未配置密钥」文案的首要手段。
   - `available:true` 且含 `home`/`away` 场均 → 服务端正常；若 App 仍空，再查缓存、队名 ID、或是否需要新 APK（一般不需要）。

4. **确认最近部署未删掉 `.env`**（对照 `backups/v*-prod-pre-*` 与部署日志）。

5. **客户端**：1.9.162+ 起空状态不再展示「未配置密钥」等内部用语；根因修复仍依赖服务端 `.env`。

## APK

构建见 `android/build-apk.sh`；`API_BASE` 默认 `http://120.77.152.74:8088`。APK 内**不**包含 `API_FOOTBALL_KEY`。

## 相关文档

- `README.md` — 总览与 `npm test`
- `docs/admin-console-1.9.72.md` — `ADMIN_PASSWORD` 等
- `docs/release-1.9.44.md` — `.env` 与 systemd 说明
