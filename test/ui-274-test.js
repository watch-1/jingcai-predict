'use strict';
// 2.1.1: empty calculator must not fall through to sample while the live issue list
// still has Selling (even after midnight kickoff) or Define rows without odds yet.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');

assert.ok(/VERSION=2.1.1/.test(ver));
assert.ok(/VERSION_CODE=328/.test(ver));
assert.ok(/jc-v2.1.1/.test(swJs));
assert.strictEqual(pkg.version, '2.1.1');
assert.strictEqual(cfg.version, '2.1.1');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2.1.1\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-328\}"/.test(apkSh));
assert.ok(/android:versionCode="328"/.test(androidManifest));
assert.ok(/android:versionName="2\.1\.1"/.test(androidManifest));

assert.ok(/scheduleRowEligibleForEmptyCalculatorSalvage/.test(serverJs), 'loose salvage helper');
assert.ok(/salvageEmptyCalculator: true/.test(serverJs), 'empty calculator uses loose salvage');
assert.ok(/schedPayload\.source !== 'live'/.test(serverJs), 'sample schedule is not promoted to live matches');
assert.ok(/calculatorEmpty: true/.test(serverJs), 'meta notes calculator empty');

const {
  scheduleRowEligibleForMatchesBackfill,
  scheduleRowEligibleForEmptyCalculatorSalvage,
} = require('../server.js');

const now = Date.parse('2026-11-09T07:34:00+08:00');
const had = { h: 5, d: 4.2, a: 1.55 };
const leman = {
  id: '2042631', num: '周日020', home: '勒芒', away: '摩纳哥',
  date: '2026-11-09', time: '00:15', businessDate: '2026-11-08', status: 'Selling', had,
};
const defineNoOdds = {
  id: '2043001', status: 'Define', date: '2026-11-11', time: '18:00',
  businessDate: '2026-11-11', home: '横滨水手', away: '鹿岛鹿角', had: null,
};
const seenOld = {
  id: 'old', status: 'Selling', date: '2026-10-26', time: '20:00',
  businessDate: '2026-10-26', _backfill: 'seen', had,
};
const seenFutureNoOdds = {
  id: 'sn', status: 'Define', date: '2026-11-12', time: '20:00', _backfill: 'seen', had: null,
};
const futureSell = { id: 'f', status: 'Selling', date: '2026-11-12', time: '20:00', had };
const seenFuture = { ...futureSell, id: 'sf', _backfill: 'seen' };
const finished = { id: 'fin', status: 'Finished', date: '2026-11-12', time: '20:00', had, full: '1:0' };
const sampleRow = { id: 'S00', status: 'Selling', date: '2026-11-09', time: '20:00', had, sample: true };

assert.strictEqual(scheduleRowEligibleForMatchesBackfill(leman, now), false, 'strict backfill skips kicked-off Selling');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(leman, now), true, 'overnight Selling stays on the live list');
assert.strictEqual(scheduleRowEligibleForMatchesBackfill(defineNoOdds, now), false, 'strict backfill still requires odds');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(defineNoOdds, now), true, 'listed Define without odds is real');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(seenOld, now), false, 'ancient seen-cache stays out');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(seenFutureNoOdds, now), false, 'odds-less seen-cache stays out');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(seenFuture, now), true, 'seen row with future odds still eligible');
assert.strictEqual(scheduleRowEligibleForMatchesBackfill(futureSell, now), true, 'future Selling+odds unchanged');
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(futureSell, now), true);
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(finished, now), false);
assert.strictEqual(scheduleRowEligibleForEmptyCalculatorSalvage(sampleRow, now), false, 'sample rows never become live');

function extractFunction(src, name) {
  const key = 'function ' + name;
  const start = src.indexOf(key);
  assert.ok(start >= 0, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const ISSUE_WEEK = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
const dayApi = new Function(
  'ISSUE_WEEK',
  extractFunction(appJs, 'issueDate') + '\n' + extractFunction(appJs, 'matchOnScheduleDay') + '\nreturn matchOnScheduleDay;',
)(ISSUE_WEEK);

assert.strictEqual(dayApi(leman, '2026-11-09'), true, '今天 includes kickoff calendar date');
assert.strictEqual(dayApi(leman, '2026-11-08'), true, '昨天 still includes the issue day');
assert.strictEqual(dayApi(leman, '2026-11-10'), false);
assert.ok(/onDay\(today\) \? today/.test(appJs), 'date strip prefers today when that day has matches');
assert.ok(/matchOnScheduleDay\(m, S\.schDate\)/.test(appJs), 'schedule list uses calendar or issue day');
assert.ok(/matchOnScheduleDay\(r, S\.schDate\)/.test(appJs), 'results on the same day follow the same rule');

const prodPath = '/tmp/sched.json';
if (fs.existsSync(prodPath)) {
  const rows = JSON.parse(fs.readFileSync(prodPath, 'utf8')).data;
  const loose = rows.filter(r => scheduleRowEligibleForEmptyCalculatorSalvage(r, now));
  const strict = rows.filter(r => scheduleRowEligibleForMatchesBackfill(r, now));
  assert.strictEqual(strict.length, 0, 'prod snapshot has no strict-eligible row');
  assert.ok(loose.length >= 20, 'prod snapshot salvages the live issue list');
  assert.ok(loose.some(r => r.home === '勒芒' && r.away === '摩纳哥'));
  assert.ok(!loose.some(r => r._backfill === 'seen'), 'seen-cache history is not salvaged');
  const todayN = rows.filter(r => dayApi(r, '2026-11-09')).length;
  assert.ok(todayN >= 10, '今天 is not empty for kickoff date 2026-11-09');
}

console.log('ui-274-test OK');
