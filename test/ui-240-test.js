'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.245/.test(ver));
assert.ok(/VERSION_CODE=282/.test(ver));
assert.ok(/jc-v1\.9\.245/.test(swJs));
assert.strictEqual(pkg.version, '1.9.245');
assert.strictEqual(cfg.version, '1.9.245');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.245\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-282\}"/.test(apkSh));

// Empty calculator must not skip completeMatches / schedule salvage
assert.ok(
  /kind === 'matches'[\s\S]*API返回空赛程[\s\S]*data = \[\]/m.test(serverJs),
  'treat empty calculator as soft failure',
);
assert.ok(/completeMatches\(\[\]\)/.test(serverJs), 'schedule salvage when all calculator endpoints fail');
assert.ok(/calculatorEmpty/.test(serverJs), 'meta flag when salvaged from schedule');
assert.ok(/scheduleRowEligibleForMatchesBackfill/.test(serverJs), 'Define status eligible for schedule salvage');

console.log('ui-240-test OK');
