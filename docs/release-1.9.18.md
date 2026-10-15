# 1.9.18 预测简报：过程数据双栏对比 + 结论芯片

## 问题
- 详情「预测」页仍像旧蓝底段落模板，过程滚动场均未在简报中可视化分析。
- 即使有控球/射门/射正等数据，综合结论易表现为「跟盘」；过程与近况/排名/竞彩赔率的支撑或分歧未写清。

## 改动
1. **简报第三节**：有过程数据时展示主客 **场均双栏对比**（控球、射门、射正、传球成功率、角球、xG），缺一侧明示；文案含对比要点与缺项。
2. **综合倾向芯片**：综合倾向 / 信心 / 过程面 / 近况 / 排名 / 竞彩参考 / 对齐（同向或分歧）。
3. **推演**：过程 lean 与近况、排名、sporttery 隐含概率对照；冲突时降低置信并写明「非单纯跟盘」。无过程数据时结论明确「未纳入过程层」并列出已用信息源。
4. **列表摘要**：含「过程面× / 过程暂无」标签。
5. 文案合规：避免购彩建议措辞；强调仅供赛事理解参考。

## 构建备注
- `android/build-apk.sh` 排除 `public/*.apk`，避免把历史包打进 assets（曾导致 20MB+）。

## APK
`dist/jingcai-predict-1.9.18.apk`（versionCode **58**）→ http://120.77.152.74:8088/jingcai-predict-1.9.18.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.18-prod-pre-20261015-211954
cp -a $B/package.json $B/server.js /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
