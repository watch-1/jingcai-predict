# 球员库回填（1.9.68）竞彩优先

## 默认策略
- `--prefer=jingcai`（默认）：只对竞彩映射场次做 AF 缺口；跳过 never-on-竞彩联赛
- 已有 non-竞彩 `af:` 壳：不删除；内部 UI 默认隐藏；未来回填降权
- `--player-gaps`：只填「有对照/硬仗、无球员行」的场次

## 用法
```bash
# 仅本地（跳过新建 af: 壳）
node tools/backfill-player-match-db.js

# 竞彩球员缺口（推荐）
node tools/backfill-player-match-db.js --af-cap=200 --players --player-gaps

# 显式允许非竞彩（旧行为）
node tools/backfill-player-match-db.js --af-cap=200 --prefer=mixed --include-non-jingcai --players
```

## Headroom
Pro 7500/day；`LIVE_RESERVE=3000`；硬底 800。cap≈1000 仅当用完后仍 ≥3000 remaining。
