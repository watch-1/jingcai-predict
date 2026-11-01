'use strict';
// 1.9.263: revert 261 horizontal hug; taller 赛程/比分 cards.
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

assert.ok(/VERSION=1\.9\.268/.test(ver));
assert.ok(/VERSION_CODE=304/.test(ver));
assert.ok(/jc-v1\.9\.268/.test(swJs));
assert.strictEqual(pkg.version, '1.9.268');
assert.strictEqual(cfg.version, '1.9.268');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.268\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-304\}"/.test(apkSh));

assert.ok(/--match-mid-col:\s*120px/.test(css), 'mid column unchanged from 260');

const mc = css.match(/\.mc \{[^}]+\}/);
assert.ok(mc && /padding:\s*10px 12px 12px/.test(mc[0]), 'taller mc padding');
assert.ok(!/\.mc \{[^}]*padding:\s*5px 12px 6px/.test(css), 'compact mc padding retired');

const ls = css.match(/\.ls-row \{[\s\S]*?\}/);
assert.ok(ls && /padding:\s*10px 12px 12px/.test(ls[0]), 'taller ls-row padding');

assert.ok(/\.match-meta \{[^}]*margin-bottom:\s*8px/.test(css), 'more gap under meta');
assert.ok(/\.ls-row \.match-meta \{[^}]*margin-bottom:\s*8px/.test(css), 'ls-row meta gap');

const lsH = css.match(/\.ls-side\.h \{[^}]+\}/);
const lsA = css.match(/\.ls-side\.a \{[^}]+\}/);
assert.ok(lsH && /flex-start/.test(lsH[0]), 'horizontal home = 260');
assert.ok(lsA && /flex-end/.test(lsA[0]), 'horizontal away = 260');
assert.ok(/\.mc-teams \.t \.n \{[^}]*flex:\s*1 1 auto/.test(css), 'name flex = 260');

console.log('ui-262-test OK');
