'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/function homeFocusBuckets/.test(appJs), 'home focus bucket helper');
assert.ok(/HOME_FOCUS_RECENT_MS/.test(appJs), 'recent kickoff window');
assert.ok(/function startHomeFocusRotate/.test(appJs) && /60000/.test(appJs), '60s home focus rotation');
assert.ok(/function stopHomeFocusRotate/.test(appJs), 'cleanup home focus rotation');
assert.ok(/TOP_TAB_DEF = \[\['tribe', '论坛'\]/.test(appJs), 'top tab 论坛');
assert.ok(/tribe: '论坛'/.test(appJs), 'tribe page title 论坛');

assert.ok(/jc-v1\.9\.216/.test(swJs), 'SW VER 1.9.216');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.216');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.216/.test(ver));
assert.ok(/VERSION_CODE=253/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.216');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.216\}"/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-253\}"/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-216-test OK');
