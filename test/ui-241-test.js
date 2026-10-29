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

assert.ok(/VERSION=1\.9\.244/.test(ver));
assert.ok(/VERSION_CODE=281/.test(ver));
assert.ok(/jc-v1\.9\.244/.test(swJs));
assert.strictEqual(pkg.version, '1.9.244');
assert.strictEqual(cfg.version, '1.9.244');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.244\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-281\}"/.test(apkSh));

assert.ok(/Define/.test(serverJs.match(/MATCHES_SCHEDULE_BACKFILL_STATUSES[\s\S]*?\);/)?.[0] || ''), 'allow Define status in schedule salvage');
assert.ok(/scheduleRowEligibleForMatchesBackfill/.test(serverJs), 'exported eligibility helper');

const { scheduleRowEligibleForMatchesBackfill } = require('../server.js');
const now = Date.now();
const futureDate = new Date(now + 2 * 86400000).toISOString().slice(0, 10);
const pastDate = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
const had = { h: 1.62, d: 3.5, a: 4.2 };
const hhad = { h: 2.8, d: 3.1, a: 2.2, goalLine: '-1' };

assert.strictEqual(
  scheduleRowEligibleForMatchesBackfill({ id: '9001', status: 'Define', date: futureDate, time: '20:15', had, hhad }, now),
  true,
  'Define + future kickoff + HAD',
);
assert.strictEqual(
  scheduleRowEligibleForMatchesBackfill({ id: '9002', status: 'Selling', date: futureDate, time: '20:15', had }, now),
  true,
  'Selling still eligible',
);
assert.strictEqual(
  scheduleRowEligibleForMatchesBackfill({ id: '9003', status: 'Define', date: pastDate, time: '20:15', had }, now),
  false,
  'past kickoff excluded',
);
assert.strictEqual(
  scheduleRowEligibleForMatchesBackfill({ id: '9004', status: 'Finished', date: futureDate, time: '20:15', had, full: '2:1' }, now),
  false,
  'finished rows excluded',
);
assert.strictEqual(
  scheduleRowEligibleForMatchesBackfill({ id: '9005', status: 'Define', date: futureDate, time: '20:15', had: null }, now),
  false,
  'no invented odds without HAD',
);

console.log('ui-241-test OK');
