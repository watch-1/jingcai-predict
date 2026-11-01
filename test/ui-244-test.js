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

assert.ok(/VERSION=1\.9\.272/.test(ver));
assert.ok(/VERSION_CODE=308/.test(ver));
assert.ok(/jc-v1\.9\.272/.test(swJs));
assert.strictEqual(pkg.version, '1.9.272');
assert.strictEqual(cfg.version, '1.9.272');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.272\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-308\}"/.test(apkSh));

// --- 1.9.244 赛后复盘: horizontal pan must not stretch/expand the page ---

// Helper: extract the first declaration block for a selector (exact selector line).
function block(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(?:^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  assert.ok(m, 'CSS block found for selector: ' + selector);
  return m[1];
}

// 1) Root guard: no horizontal overscroll rubber-band / stretch on the page.
assert.ok(/html\s*\{[^}]*overscroll-behavior-x:\s*none/.test(css), 'html blocks horizontal overscroll');
const bodyBlock = css.match(/\nbody\s*\{([^}]*)\}/);
assert.ok(bodyBlock && /overscroll-behavior-x:\s*none/.test(bodyBlock[1]), 'body blocks horizontal overscroll');

// 2) Review view root clips horizontal overflow and blocks overscroll-x.
const reviewRoot = block('.view.sub.md-wrap--review');
// the first .md-wrap--review block only sets background; the 1.9.244 guard block must exist too
assert.ok(
  /\.view\.sub\.md-wrap--review\s*\{[^}]*overflow-x:\s*clip;[^}]*overscroll-behavior-x:\s*none/.test(css),
  'review root: overflow-x clip + overscroll-behavior-x none'
);
assert.ok(reviewRoot != null);

// 3) Review content pane: no overflow-x visible (was the stretch leak), clip + no overscroll-x.
const pane = block('.view.sub.md-wrap--review .detail-pane--review');
assert.ok(/overflow-x:\s*clip/.test(pane), 'review pane clips horizontal overflow');
assert.ok(/overscroll-behavior-x:\s*none/.test(pane), 'review pane blocks horizontal overscroll');
assert.ok(!/overflow-x:\s*visible/.test(pane), 'review pane no longer overflow-x: visible');

// 4) Wide 指标对照 table keeps its own horizontal scroll but contains overscroll.
const tw = block('.pmr-table-wrap');
assert.ok(/overflow-x:\s*auto/.test(tw), 'pmr-table-wrap still horizontally scrollable');
assert.ok(/overscroll-behavior-x:\s*contain/.test(tw), 'pmr-table-wrap contains overscroll-x (no chain to page)');
assert.ok(/touch-action:\s*pan-x pan-y/.test(tw), 'pmr-table-wrap touch-action pan only (no pinch stretch)');

// 5) Review tabs strip (overflow-x: auto) also contains overscroll-x.
const dtabs = block('.view.sub.md-wrap--review .dtabs');
assert.ok(/overscroll-behavior-x:\s*contain/.test(dtabs), 'review dtabs contain overscroll-x');

// --- 1.9.244 指标对照 edge padding: values must not hug the screen edges ---

// 6) No negative side margins pulling the compare table to the bezel.
const reviewTw = block('.view.sub.md-wrap--review .detail-pane--review .pmr-table-wrap');
assert.ok(/margin-left:\s*0/.test(reviewTw), 'review pmr-table-wrap margin-left 0 (was -4px)');
assert.ok(/margin-right:\s*0/.test(reviewTw), 'review pmr-table-wrap margin-right 0 (was -4px)');
assert.ok(!/-4px/.test(reviewTw), 'negative edge margins removed');

// 7) First/last columns get extra inner padding inside the review pane.
assert.ok(
  /\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table th:first-child,\s*\n\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table td:first-child\s*\{[^}]*padding-left:\s*8px/.test(css),
  'first column padded from left edge'
);
assert.ok(
  /\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table th:last-child,\s*\n\.view\.sub\.md-wrap--review \.detail-pane--review \.pmr-table td:last-child\s*\{[^}]*padding-right:\s*8px/.test(css),
  'last column padded from right edge'
);

console.log('ui-244-test OK');
