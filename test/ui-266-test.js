'use strict';
// 1.9.266: full team names on phones — fluid mid column + 2-line wrap, keep 260 outer align.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.266/.test(ver));
assert.ok(/VERSION_CODE=302/.test(ver));
assert.ok(/jc-v1\.9\.266/.test(swJs));
assert.strictEqual(pkg.version, '1.9.266');
assert.strictEqual(cfg.version, '1.9.266');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.266\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-302\}"/.test(apkSh));

// Desktop / tablet token stays 120px (do not regress 260 air-gap on wide screens)
assert.ok(/--match-mid-col:\s*120px/.test(css), 'desktop mid token remains 120px');
assert.ok(!/--match-mid-col:\s*88px/.test(css), '88px token stays retired');

// Phones: fluid mid so name columns get the leftover width
const phoneMid = css.match(/@media \(max-width:\s*479px\) \{[\s\S]*?--match-mid-col:\s*([^;]+);/);
assert.ok(phoneMid, 'phone media query overrides mid col');
assert.ok(/clamp\(76px,\s*22vw,\s*100px\)/.test(phoneMid[1]), 'mid col is fluid 76–100px on phones');

assert.ok(/column-gap:\s*clamp\(6px,\s*2\.2vw,\s*10px\)/.test(css), 'team row gap is fluid on phones');

// Names wrap 2 lines instead of single-line ellipsis; last-resort clamp
assert.ok(/-webkit-line-clamp:\s*2/.test(css), '2-line clamp');
assert.ok(/white-space:\s*normal/.test(css), 'names may wrap');
assert.ok(/font-size:\s*clamp\(12px,\s*3\.65vw,\s*13\.5px\)/.test(css), 'name size fluid across phone widths');

// Shared by schedule list and match cards
const wrapBlock = css.slice(css.indexOf('1.9.266: prefer full team names'));
assert.ok(/\.mc-teams \.t \.n/.test(wrapBlock), '开奖/赛程 mc-teams names wrap');
assert.ok(/\.ls-body \.nm/.test(wrapBlock), '比分 ls-body names wrap');
assert.ok(/\.ls-side \.nm/.test(wrapBlock), 'ls-side names wrap');
assert.ok(/\.mc-teams \.t\.a \.n/.test(wrapBlock) && /\.ls-side\.a \.nm/.test(wrapBlock),
  'away names right-aligned when wrapping');

// Do not reintroduce 1.9.261 center-hug
const lsH = css.match(/\.ls-side\.h \{[^}]+\}/);
const lsA = css.match(/\.ls-side\.a \{[^}]+\}/);
assert.ok(lsH && /justify-content:\s*flex-start/.test(lsH[0]), 'home stays outer (flex-start)');
assert.ok(lsA && /justify-content:\s*flex-end/.test(lsA[0]), 'away stays outer (flex-end)');
assert.ok(!/\.ls-side\.h \{[^}]*justify-content:\s*flex-end/.test(css), 'no 261 home hug');
assert.ok(!/\.mc-teams \.t\.h \{[^}]*justify-content:\s*flex-end/.test(css), 'no 261 mc home hug');

const mcN = css.match(/\.mc-teams \.t \.n \{[^}]+\}/);
assert.ok(mcN && /flex:\s*1 1 auto/.test(mcN[0]), 'name still fills its column (not content-hug)');

// Markup still renders full names (no JS slice); title for last-resort ellipsis
assert.ok(/title="\$\{esc\(row\.home\)\}"/.test(appJs), 'schedule row home title');
assert.ok(/title="\$\{esc\(row\.away\)\}"/.test(appJs), 'schedule row away title');
assert.ok(!/row\.home\.slice|row\.away\.slice|home\.substring/.test(appJs.match(/function scoreCard[\s\S]*?^\}/m)[0]),
  'scoreCard does not slice team names');

console.log('ui-266-test OK');
