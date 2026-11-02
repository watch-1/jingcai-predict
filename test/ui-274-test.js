'use strict';
// 1.9.274: 赛程顶栏「开奖」不再跳进首页顶栏；首页/预测去掉开奖入口。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');

assert.ok(/VERSION=1\.9\.274/.test(ver));
assert.ok(/VERSION_CODE=310/.test(ver));
assert.ok(/jc-v1\.9\.274/.test(swJs));
assert.strictEqual(pkg.version, '1.9.274');
assert.strictEqual(cfg.version, '1.9.274');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.274\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-310\}"/.test(apkSh));
assert.ok(/android:versionCode="310"/.test(androidManifest));
assert.ok(/android:versionName="1\.9\.274"/.test(androidManifest));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.274.md')));

const topDef = appJs.match(/const TOP_TAB_DEF = \[[^\]]+\]/);
assert.ok(topDef && !/results/.test(topDef[0]), 'home top tabs: no 开奖');
assert.ok(/const TOP_TABS = \['tribe', 'news'\]/.test(appJs), 'TOP_TABS without results route shell');

const schTop = appJs.match(/function topChromeCenterHtml[\s\S]*?if \(rName === 'schedule'\) \{[\s\S]*?return `<nav class="tc-tabs tc-tabs--schedule/);
assert.ok(schTop, 'schedule top chrome block');
assert.ok(!/data-go="#\/results"/.test(schTop[0]), 'schedule 开奖 uses schChannel not #/results');
assert.ok(/\['results', '开奖'\]/.test(schTop[0]), 'schedule top includes 开奖 channel key');
assert.ok(/function scheduleResultsHtml/.test(appJs), '开奖 content embedded in schedule route');
assert.ok(/dest\.name === 'results'/.test(appJs.match(/function go\([\s\S]*?\n\}/)[0]), 'legacy #/results redirects to schedule');

console.log('ui-274-test OK');
