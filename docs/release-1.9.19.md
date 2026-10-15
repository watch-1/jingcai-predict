# 1.9.19 预测结论芯片：白话标签 + 分歧说明

## 问题
- 用户喜欢芯片行，但「综合倾向主胜」对照「过程面客胜」不易懂。
- 「对齐 · 信号分歧」含义不清。

## 改动
1. **芯片标签白话化**
   - 综合倾向 → **综合更看好**
   - 过程面 → **近期过程更看好**
   - 近况 / 排名 / 竞彩参考 → **近期战绩更看好** / **排名更看好** / **竞彩盘口偏**
   - 对齐 → **各方是否一致**（值如「一致看好主胜」「过程与盘口不一致」「暂无过程对照」）
2. **信号不完全同向时**：芯片行下增加一句说明，例如「近况/排名/竞彩偏主胜，近期过程(xG等)偏客胜；综合仍「主胜」，因…」。
3. **缓存**：`CHIPS_UI_REV`，读旧报告时原地重写芯片 HTML，无需重拉 API-Football。
4. 列表摘要同步：过程面→近期过程偏×；信号有分歧→各方不完全一致。
5. 文案合规：仍为赛事理解参考，不含购彩建议。

## APK
`dist/jingcai-predict-1.9.19.apk`（versionCode **59**）→ http://120.77.152.74:8088/jingcai-predict-1.9.19.apk

## 回滚
```bash
B=/opt/jingcai/backups/v1.9.19-prod-pre-20261015-214004
cp -a $B/package.json /opt/jingcai/
cp -a $B/lib/* /opt/jingcai/lib/ && cp -a $B/public/* /opt/jingcai/public/
systemctl restart jingcai
```
