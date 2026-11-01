'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/function homeFocusMatchRows/.test(appJs), 'home focus merges schedule+matches');
assert.ok(/function homeFocusLiveScoreIds/.test(appJs), 'home live-score id window');
assert.ok(/S\.schedule \|\| \[\]\), \.\.\.\(S\.matches/.test(appJs), 'schedule union in focus pool');
assert.ok(/function patchHomeHeroHotMatch/.test(appJs), 'hero hot slide patch after live scores');
assert.ok(/function scheduleHomeAttitudeFill/.test(appJs), 'deferred attitude fill when busy');
assert.ok(/homeAttitudeFeedStillSkeleton/.test(appJs), 'skeleton must not hang forever');
assert.ok(/function ensureHomeLiveScorePoll/.test(appJs), 'home live score poll while in-play');
assert.ok(/const live = pool\.find\(m => classifyScoreRow\(m\)\._kind === 'live'\)/.test(appJs), 'banner prefers live');

assert.ok(/jc-v1\.9\.2[4-6]\d/.test(swJs), 'SW VER current');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.2[4-6]\d/.test(pkg.version), 'package version 1.9.24x');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.2[4-6]\d/.test(ver));
assert.ok(/VERSION_CODE=27\d/.test(ver) || /VERSION_CODE=28\d/.test(ver) || /VERSION_CODE=30\d/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.ok(/^1\.9\.2[4-6]\d/.test(cfg.version), 'config version');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.2/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-217-test OK');
