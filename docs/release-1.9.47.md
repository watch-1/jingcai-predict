# 1.9.47 过程数据传球成功率单侧缺口修复

## 用户价值
1. **传球成功率不再单侧「-」**：API-Football 部分场次只给「总传球 / 成功传球」、不给 `Passes %`（德乙科特布斯近况即如此）。现从总量推导场均传球成功率。
2. **部分样本不拖垮指标**：滚动均值仍跳过 null；有总量即可参与平均。
3. **展示**：双方都缺才隐藏该行（原逻辑保留）；一侧有值一侧暂无仍可对比。

## 原因
- AF `/fixtures/statistics` 对部分场次省略 `Passes %` / `Pass Accuracy`，但仍返回 `Total passes` + `Passes accurate`。
- `sideStats` 未从总量推导 → 科特布斯近 7 场 `passesPct` 全 null → 主队场均为 null，纽伦堡有官方 % → 界面主队「-」客队约 85%。
- 本地审计：148 侧样本中 68 侧缺 % 但均可由总量推导。

## 改动
- `lib/process-stats.js`：`pickStat` 多键名；`derivePassesPct`；加载 fixture / rolling 缓存时回填；`computeAverages` 跳过 null 且先 enrich。
- `test/process-stats-test.js`：推导 / 部分样本 / rolling enrich 回归。
- 版本 **1.9.47**（versionCode **87**）。

## APK
`dist/jingcai-predict-1.9.47.apk` → http://120.77.152.74:8088/jingcai-predict-1.9.47.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.47-prod-pre-20261016-194728
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/process-stats.js /opt/jingcai/lib/
cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```

## 验证
- 科特布斯 vs 纽伦堡 `limit=8`：主队传球成功率 **82.7%**（由 7 场总量推导），客队 **85.4%**（官方 %）。
- 生产回填：fixture-stats **275** 文件 / **550** 侧补全；rolling **29** 队缓存补全。
- APK：http://120.77.152.74:8088/jingcai-predict-1.9.47.apk
