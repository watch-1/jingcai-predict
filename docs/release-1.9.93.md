# 1.9.93 — 顶栏去「实时」徽标 + 白红蓝条状渐变

## 变更
1. **去掉顶栏「实时 · HH:MM」pill**：`srcPill()` 改为对称占位，标题（赛程/预测/首页等）视觉居中；示例/离线仍走 `warnBar`。
2. **顶栏白→红→蓝对角条纹渐变**：`.hdr` / `.hdr-ext` / `.dstrip` 软对角 stripe + 渐变；标题白字 + 轻阴影保证可读；绿茵主题同步保留条纹。

## 版本
- versionName **1.9.93** · versionCode **130**
- 正式 + 合作测试 APK 同步构建


## Live artifacts (2026-10-18 Asia/Shanghai)

| File | Size | MD5 |
|------|------|-----|
| jingcai-predict-1.9.93.apk | 6,573,815 | 53c646e6de2be4dbe675dd7c74753bcf |
| jingcai-predict-1.9.93-partner.apk | 6,573,815 | 6f340d9e0f840fc79b3716f1f4cd0634 |
| jingcai-predict.apk (→正式) | 6,573,815 | 53c646e6de2be4dbe675dd7c74753bcf |

URLs:
- http://120.77.152.74:8088/jingcai-predict-1.9.93.apk
- http://120.77.152.74:8088/jingcai-predict-1.9.93-partner.apk
- http://120.77.152.74:8088/jingcai-predict.apk

Source zip (local, for handoff): `/workspace/jingcai-1.9.93-source.zip` (~26MB)
