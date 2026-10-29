'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.247/.test(ver));
assert.ok(/VERSION_CODE=284/.test(ver));
assert.ok(/jc-v1\.9\.247/.test(swJs));
assert.strictEqual(pkg.version, '1.9.247');
assert.strictEqual(cfg.version, '1.9.247');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.247\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-284\}"/.test(apkSh));

// --- 1.9.246 赛后复盘排版：所有主要区块统一 16px 水平留白，正文/卡片不再顶格 ---

// Helper: all declaration blocks whose selector list contains the selector.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
function blocksFor(selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cssNoComments))) {
    const sels = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '));
    if (sels.includes(selector)) out.push(m[2]);
  }
  assert.ok(out.length, 'CSS block(s) found for selector: ' + selector);
  return out;
}
function someBlock(selector, test, msg) {
  assert.ok(blocksFor(selector).some(test), msg);
}

// 1) Review pane declares the 16px gutter token.
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review',
  (b) => /--pmr-gutter:\s*16px/.test(b),
  'review pane declares --pmr-gutter: 16px'
);

// 2) Every flattened review section (.dsec) gets the gutter on both sides.
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review > .dsec',
  (b) => /padding-left:\s*var\(--pmr-gutter(?:,\s*16px)?\)/.test(b)
    && /padding-right:\s*var\(--pmr-gutter(?:,\s*16px)?\)/.test(b)
    && /margin-left:\s*0/.test(b) && /margin-right:\s*0/.test(b),
  'review .dsec: 16px gutter padding on both sides, no side margins'
);

// 3) Source bar keeps the same gutter.
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review .pr-src-bar',
  (b) => /margin:\s*8px var\(--pmr-gutter(?:,\s*16px)?\) 0/.test(b),
  'pr-src-bar aligned to the review gutter'
);

// 4) Tinted section cards (主因解读 / 赛前表态反馈) must not bleed to the bezel:
//    no negative side margins inside the review pane, and inner side padding >= 12px.
for (const sel of [
  '.view.sub.md-wrap--review .detail-pane--review .pmr-sec.pmr-feedback',
  '.view.sub.md-wrap--review .detail-pane--review .pmr-sec.pmr-main',
]) {
  someBlock(
    sel,
    (b) => /margin-left:\s*0/.test(b) && /margin-right:\s*0/.test(b)
      && /padding-left:\s*12px/.test(b) && /padding-right:\s*12px/.test(b)
      && !/-\d+px/.test(b),
    sel + ': inside gutter, 12px inner padding, no negative margins'
  );
}

// 5) 硬仗检验 card stays inside the gutter with comfortable inner padding;
//    its per-team sub-cards get 12px padding so inner table labels are not cramped.
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review .pmr-hard',
  (b) => /margin-left:\s*0/.test(b) && /margin-right:\s*0/.test(b)
    && /padding-left:\s*12px/.test(b) && /padding-right:\s*12px/.test(b)
    && !/-\d+px/.test(b),
  'pmr-hard card inside gutter with 12px inner padding'
);
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review .pmr-hard-side',
  (b) => /padding:\s*12px/.test(b),
  'pmr-hard-side 12px inner padding'
);

// 6) 指标对照 first/last columns keep their 1.9.244 inner padding (>= 8px).
assert.ok(
  /\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table th:first-child,\s*\n\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table td:first-child\s*\{[^}]*padding-left:\s*(?:8|1[0-6])px/.test(css),
  'first column padded from left edge'
);
assert.ok(
  /\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table th:last-child,\s*\n\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table td:last-child\s*\{[^}]*padding-right:\s*(?:8|1[0-6])px/.test(css),
  'last column padded from right edge'
);

// 7) Review tab strip buttons get side padding so 「赛后复盘」 is not flush to the strip edge.
someBlock(
  '.view.sub.md-wrap--review .dtabs button',
  (b) => /padding-left:\s*12px/.test(b) && /padding-right:\s*12px/.test(b),
  'review dtabs buttons have 12px side padding'
);

// 8) 1.9.244 overscroll guards must survive the re-layout.
assert.ok(
  /\.view\.sub\.md-wrap--review\s*\{[^}]*overflow-x:\s*clip;[^}]*overscroll-behavior-x:\s*none/.test(css),
  'review root keeps overflow-x clip + overscroll-behavior-x none'
);
someBlock(
  '.view.sub.md-wrap--review .detail-pane--review',
  (b) => /overflow-x:\s*clip/.test(b) && /overscroll-behavior-x:\s*none/.test(b),
  'review pane keeps clip + overscroll guards'
);
someBlock(
  '.pmr-table-wrap',
  (b) => /overflow-x:\s*auto/.test(b) && /overscroll-behavior-x:\s*contain/.test(b),
  'pmr-table-wrap keeps scrollable + contained overscroll'
);

console.log('ui-246-test OK');
