'use strict';
// 1.9.261 hug was reverted in 1.9.262 — keep mid token; horizontal = 1.9.260.
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

assert.ok(/VERSION=1\.9\.262/.test(ver));
assert.ok(/VERSION_CODE=298/.test(ver));
assert.ok(/jc-v1\.9\.262/.test(swJs));
assert.strictEqual(pkg.version, '1.9.262');
assert.strictEqual(cfg.version, '1.9.262');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.262\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-298\}"/.test(apkSh));

assert.ok(/--match-mid-col:\s*120px/.test(css), 'keep shared mid token');

const lsH = css.match(/\.ls-side\.h \{[^}]+\}/);
const lsA = css.match(/\.ls-side\.a \{[^}]+\}/);
assert.ok(lsH && /justify-content:\s*flex-start/.test(lsH[0]), '260 home outer align');
assert.ok(lsA && /justify-content:\s*flex-end/.test(lsA[0]), '260 away outer align');

const mcH = css.match(/\.mc-teams \.t\.h \{[^}]+\}/);
const mcA = css.match(/\.mc-teams \.t\.a \{[^}]+\}/);
assert.ok(mcH && /justify-content:\s*flex-start/.test(mcH[0]), '260 mc home');
assert.ok(mcA && /justify-content:\s*flex-end/.test(mcA[0]), '260 mc away');

const mcN = css.match(/\.mc-teams \.t \.n \{[^}]+\}/);
assert.ok(mcN && /flex:\s*1 1 auto/.test(mcN[0]), '260 name flex restored');

console.log('ui-261-test OK');
