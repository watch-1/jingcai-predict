'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.239/.test(ver));
assert.ok(/VERSION_CODE=276/.test(ver));
assert.ok(/jc-v1\.9\.239/.test(swJs), 'SW VER 1.9.239');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.239');

assert.ok(/function newsRouteDetailId/.test(appJs), 'news detail id helper');
const sigBlock = appJs.match(/if \(name === 'news'\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert.ok(/newsRouteDetailId\(\)/.test(sigBlock), 'tabContentSig distinguishes list vs detail');
assert.ok(/detailId \? 'd:' \+ detailId : 'l'/.test(sigBlock), 'tabContentSig uses d: id vs l list');
const saveKeep = appJs.match(/function saveTabKeep[\s\S]*?^}/m)?.[0] || '';
assert.ok(/never keep-alive article detail/.test(saveKeep), 'saveTabKeep skips news detail DOM');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.239\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-276\}"/.test(apkSh));

console.log('ui-233-test OK');
