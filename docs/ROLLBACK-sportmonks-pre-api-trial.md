# Rollback：Sportmonks 时代 · API 数据源试用前（云球迷 1.9.273）

在开启 **14 天免费 API 数据源试用** 之前，Watch1 在此分支与标签上冻结 **Sportmonks 数据栈** 下的应用快照，便于试用不满意时整仓回退。

| 项 | 值 |
|---|---|
| **分支** | `backup/sportmonks-pre-api-trial` |
| **标签** | `rollback/yunqiumi-1.9.273-sportmonks-2026-11-04` |
| **提交 SHA** | `7f3cd241b3b13370df39966eb16b480ee8542673` |
| **应用版本** | 云球迷 **1.9.273**（VERSION_CODE **309**） |
| **日期** | 2026-11-04（Asia/Shanghai） |

标签附注：`pre API-source trial rollback; Sportmonks era; 云球迷 1.9.273; 2026-11-04 Asia/Shanghai`

## 本分支额外内容（相对标签 SHA）

标签指向 **1.9.273 应用代码** 的冻结点。分支在 SHA 之上另含：

- 本文档（回滚说明）
- `prototypes/pitch-live/` — 离线 HTML 球场原型 v10（**非** Capacitor 产物）

回滚 **生产/构建用代码** 时优先检出 **标签**；需要原型资源时用 **分支** 或标签后再 cherry-pick / 合并原型目录。

## 恢复步骤

### 只读对照（不改变当前工作区）

```bash
git fetch origin tag rollback/yunqiumi-1.9.273-sportmonks-2026-11-04
git show rollback/yunqiumi-1.9.273-sportmonks-2026-11-04:package.json   # 示例
```

### 整仓回到 Sportmonks 试用前代码（标签）

```bash
git fetch origin
git checkout -B restore-sportmonks rollback/yunqiumi-1.9.273-sportmonks-2026-11-04
# 按既有流程构建/部署；勿在此文档流程中改 API Key
```

### 使用备份分支（含 rollback 文档 + pitch 原型）

```bash
git fetch origin backup/sportmonks-pre-api-trial
git checkout backup/sportmonks-pre-api-trial
```

### 与 `main` 的关系

- **不要**将本分支合并进 `main`，除非团队明确决定永久放弃 API 试用并走正式回滚评审。
- 试用期间在其它分支继续开发；回滚时从标签或本分支拉恢复分支即可。

## 相关发布说明

- `docs/release-1.9.273.md` — 1.9.273 变更摘要（顶栏/开屏等）
