'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/function hydrateResultScores/.test(appJs), '开奖: hydrate scores from schedule');
assert.ok(/results-archive/.test(serverJs) && /completeResults/.test(serverJs), 'server merges results archive');
assert.ok(/half: m\.half \|\| ''/.test(serverJs.split('function pruneAndSaveScheduleSeen')[1] || ''), 'schedule-seen persists full/half');

assert.ok(/jc-v1\.9\.218/.test(swJs), 'SW VER 1.9.218');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.218');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.218/.test(ver));
assert.ok(/VERSION_CODE=255/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.218');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.218\}"/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-255\}"/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-218-test OK');
