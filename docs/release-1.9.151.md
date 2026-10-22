# 1.9.151 赛事详情回退键去圆底

## 变更
1. **赛事详情左上回退**：`.hero-edge-nav .ic-btn.hero-ic` / `.md-back` 去掉深色半透明圆底与圆角；视觉上仅保留白色 chevron「＜」。
2. **点按**：热区维持 **32×32**（大于 18px 字形），按下时仅轻微透明度反馈，不再出现圆形底色。
3. **关注**：右侧「关注」按钮样式与行为未改。

## 版本
- Web / `config.js` / `sw.js`：**1.9.151**（`jc-v1.9.151`）
- `VERSION.txt`：**1.9.151** / **VERSION_CODE=188**
- Android 默认：`VERSION_NAME=1.9.151`、`VERSION_CODE=188`

## 验证
1. 赛事详情 hero：左上仅白 chevron，无圆底胶囊；点击仍可返回。
2. `node tools/ui-test.js` 通过。
