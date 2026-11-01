'use strict';
// 1.9.260: widen shared VS/score center column so 未开赛 rows have live-score air gap.
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

assert.ok(/VERSION=1\.9\.273/.test(ver));
assert.ok(/VERSION_CODE=309/.test(ver));
assert.ok(/jc-v1\.9\.273/.test(swJs));
assert.strictEqual(pkg.version, '1.9.273');
assert.strictEqual(cfg.version, '1.9.273');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.273\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-309\}"/.test(apkSh));

assert.ok(/--match-mid-col:\s*120px/.test(css), 'wider shared center column');
assert.ok(!/--match-mid-col:\s*88px/.test(css), '88px token retired');

const mcGrid = css.match(/\.mc-teams \{[^}]+\}/);
assert.ok(mcGrid && /var\(--match-mid-col\)/.test(mcGrid[0]), 'mc-teams still uses shared token');
const lsGrid = css.match(/\.ls-body \{[\s\S]*?\}/);
assert.ok(lsGrid && /var\(--match-mid-col\)/.test(lsGrid[0]), 'ls-body still uses shared token');

console.log('ui-260-test OK');
