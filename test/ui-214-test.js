'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(!/sch-toolbar/.test(appJs.match(/function scheduleBodyHtml[\s\S]*?^}/m)?.[0] || ''), 'schedule: no day summary toolbar');
assert.ok(!/list-meta/.test(appJs.match(/function scheduleBodyHtml[\s\S]*?^}/m)?.[0] || ''), 'schedule: no list-meta under chips');
assert.ok(/function syncDateStripScroll/.test(appJs) && /dstrip-edge/.test(appJs), 'date strip edge scroll helper');
assert.ok(!/胜平负：\$\{LBL\.had/.test(appJs.match(/function resultCard[\s\S]*?^}/m)?.[0] || ''), '开奖 list: no 胜平负 result pill');
assert.ok(!/让球\(\$\{esc/.test(appJs.match(/function resultCard[\s\S]*?^}/m)?.[0] || ''), '开奖 list: no 让球 result pill');
assert.ok(!/赔率热门/.test(appJs.match(/function resultCard[\s\S]*?^}/m)?.[0] || ''), '开奖 list: no 赔率热门 pill');

assert.ok(/\.dstrip-edge/.test(css), 'dstrip edge inset CSS');
assert.ok(/\.view \.ls-list/.test(css) && /margin-left: 0/.test(css), 'schedule rows flush');
assert.ok(/\.daysum b \{[^}]*font-size: 14px/.test(css), 'smaller daysum hit ratio');
assert.ok(/1\.9\.213 compact/.test(css), 'keep 1.9.213 compact match typography');

assert.ok(/jc-v1\.9\.23\d/.test(swJs), 'SW VER current');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.23\d/.test(pkg.version), 'package version');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.23\d/.test(ver));
assert.ok(/VERSION_CODE=27\d/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.ok(/^1\.9\.23\d/.test(cfg.version), 'config version');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.23/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-27/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-214-test OK');
