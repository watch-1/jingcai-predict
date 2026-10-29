# 1.9.246（VERSION_CODE 283）

> 版本说明：1.9.245 / VERSION_CODE 282 预留给并行进行中的「赛程比分列表刷新」PR；若该 PR 先合入 main，本 PR 直接 rebase 即可（版本号已避开）。若 245 未落地，246 跳号发布也无冲突。

## Bug：赛后复盘多个区块文字左右顶格（1.9.244 修了指标对照边缘，但其余区块仍贴边）

用户反馈（4 张截图，均为赛后复盘 Tab）：「复盘功能里有的文字左右过于顶格，请仔细排版」。
- 指标对照表首尾列仍偏紧；
- 「硬仗检验」引言段落贴左边；两张球队卡片几乎贴住屏幕左右边缘，卡内表格标签拥挤；
- 「本场 vs 近况」分析长段落两侧贴边；
- 「主因解读 / 赛前预测对照 / 赛前表态反馈 / 赔率倾向 vs 赛果」正文左右顶格；
- 标签条上「赛后复盘」字样贴条右缘。

**根因**
- 复盘页为了「铺平」卡片，`.detail-pane--review > .dsec` 只保留 12px 水平内边距，低于其它精修详情 Tab 的 16px 观感标准；所有正文段落（`.pmr-sec p`）直接继承这 12px，视觉上贴边。
- 带底色的小节卡片沿用了为旧卡片内边距设计的负外边距：`.pmr-sec.pmr-feedback` / `.pmr-sec.pmr-main` 为 `margin-left/right: -8px`，`.pmr-hard`（硬仗检验）为 `-4px`，把卡片进一步拉向屏幕边缘（距边仅 4–8px）。
- 硬仗检验球队子卡 `.pmr-hard-side` 内边距仅 10px，内层 `pmr-table`（单元格 `padding: 6px 4px`）标签显得拥挤。
- 复盘标签条按钮沿用基础 `.dtabs button` 的 10px 水平内边距，最后一个「赛后复盘」选中项贴条右缘。

**修复（仅 CSS，不改分析数据/文案，不伪造指标；保留 1.9.244 的横向 overscroll 防护）**
- 复盘内容面板声明 `--pmr-gutter: 16px`；`.detail-pane--review > .dsec` 与 `.pr-src-bar` 的水平留白从 12px 统一提到 `var(--pmr-gutter)`（16px，手机安全留白，与其它详情 Tab 一致）。所有小节标题、正文段落（主因解读、赛前预测对照、赛前表态反馈、赔率倾向 vs 赛果、本场 vs 近况等）随之获得整条 16px 侧边距。
- 复盘页内去掉三处负外边距：`.pmr-sec.pmr-feedback`、`.pmr-sec.pmr-main` 与 `.pmr-hard` 改为 `margin-left/right: 0`，水平内边距统一 12px——卡片外缘落在 16px 留白内，卡内文字距屏幕边缘约 28px。
- `.pmr-hard-side` 内边距 10px → 12px，硬仗检验卡内表格标签不再憋在卡边。
- 指标对照保留 1.9.244 的首列 `padding-left: 8px` / 末列 `padding-right: 8px`（叠加 16px 留白后两侧有效留白约 24px）；宽表仍可横滑，`overscroll-behavior-x: contain` / `touch-action: pan-x pan-y` 原样保留。
- 复盘标签条按钮水平内边距 10px → 12px，「赛后复盘」标签不再贴条边。
- 竖向滚动、粘性标签条与 1.9.244 的 `overflow-x: clip` + `overscroll-behavior-x: none` 防膨胀防护全部保留（ui-244 / ui-246 均有断言）。

**测试**
- 新增 `test/ui-246-test.js`（解析 CSS 块，锁定排版护栏，回归即红）：
  - 复盘面板声明 `--pmr-gutter: 16px`；`.dsec` 两侧 padding 使用该变量且无侧向外边距；`.pr-src-bar` 对齐同一留白；
  - `.pmr-sec.pmr-feedback` / `.pmr-sec.pmr-main` / `.pmr-hard` 在复盘页内无负外边距、两侧内边距 12px；`.pmr-hard-side` 内边距 12px；
  - 指标对照首/末列保留边缘内边距（≥8px）；
  - 复盘 `.dtabs button` 两侧 12px 内边距；
  - 1.9.244 防护仍在：复盘根/面板 `overflow-x: clip` + `overscroll-behavior-x: none`，`.pmr-table-wrap` 保持可横滑且 `overscroll-behavior-x: contain`；
  - 版本号 1.9.246 / VERSION_CODE 283 在 VERSION.txt、package.json、config.js、sw.js、build-apk.sh 同步。
- 既有钉版本的 ui 测试（ui-204 ~ ui-244）版本断言同步更新至 1.9.246 / 283，断言逻辑未动。

**既有失败（与本次无关，main 基线逐一复验同样失败）**
- `market-value-match-test`（缺外部 `data/market-value/index.json.gz` 数据包）、`column-test` / `ui-166` / `tribe-follow` / `user-follow` / `tribe-feed` / `ui-193` / `ui-199` / `api-test`（需在线服务或外部数据，main 上同样失败）。
