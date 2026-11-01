'use strict';
// 1.9.258: schedule list score/status sync with match detail (AF FT verify + reconcile poll).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const lsJs = fs.readFileSync(path.join(root, 'lib/live-scores.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.270/.test(ver));
assert.ok(/VERSION_CODE=306/.test(ver));
assert.ok(/jc-v1\.9\.270/.test(swJs));
assert.strictEqual(pkg.version, '1.9.270');
assert.strictEqual(cfg.version, '1.9.270');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.270\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-306\}"/.test(apkSh));

assert.ok(/function scheduleLiveScoreNeedsReconcile\(/.test(appJs), 'reconcile helper');
assert.ok(/scheduleHasPendingLive\(classifiedDay\)[\s\S]{0,120}scheduleLiveScoreNeedsReconcile/.test(appJs)
  || /scheduleLiveScoreNeedsReconcile\(x\)/.test(appJs), 'heartbeat while sporttery-only FT stale');
assert.ok(/sporttery payload still「进行中」long after KO/.test(appJs), 'client stale-live FT guard');

assert.ok(/1\.9\.258: also refresh mapped fixtures/.test(lsJs), 'AF FT verify finished rows');
assert.ok(/function applyResultsSeenOverlay\(/.test(lsJs), 'results-seen overlay on list path');
assert.ok(/afSum != null && curSum != null && afSum > curSum/.test(lsJs), 'AF wins when sporttery frozen early');

console.log('ui-258-test OK');
