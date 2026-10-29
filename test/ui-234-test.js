'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.244/.test(ver));
assert.ok(/VERSION_CODE=281/.test(ver));
assert.ok(/jc-v1\.9\.244/.test(swJs), 'SW VER 1.9.244');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.244');

const clickBlock = appJs.match(/document\.addEventListener\('click', async e => \{[\s\S]*?switch \(d\.act\)/)?.[0] || '';
assert.ok(/if \(d\.mid && d\.key\) return toggleSel/.test(clickBlock), 'plan odds cells need data-mid; mult pad keys must not hit toggleSel');
assert.ok(/d\.act !== 'calcType' && d\.act !== 'calcTypePick'/.test(clickBlock), 'calc combo sheet chips must reach calcTypePick');

assert.ok(/case 'calcTypePick':/.test(appJs) && /case 'calcMultKey':/.test(appJs), 'calc sheet actions in switch');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.244\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-281\}"/.test(apkSh));

console.log('ui-234-test OK');
