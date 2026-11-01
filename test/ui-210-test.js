'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/function matchNumSortKey/.test(appJs), 'match num sort key');
assert.ok(/finRank\(a\._kind\) - finRank\(b\._kind\)/.test(appJs), 'finished matches sink to bottom');
assert.ok(/matchNumSortKey\(a\.num\) - matchNumSortKey\(b\.num\)/.test(appJs), 'sort by issue num within phase');

assert.ok(/jc-v1\.9\.2\d\d/.test(swJs), 'SW VER 1.9.2xx');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.2\d\d$/.test(pkg.version));
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.2\d\d/.test(ver));
assert.ok(/VERSION_CODE=2[5-9]\d/.test(ver) || /VERSION_CODE=30\d/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.ok(/^1\.9\.2\d\d$/.test(cfg.version));

// Sort behavior smoke (mirrors scheduleListRows)
function matchNumSortKey(num) {
  const m = String(num || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const finRank = k => (k === 'ft' ? 1 : 0);
    const d = finRank(a._kind) - finRank(b._kind);
    if (d) return d;
    const nk = matchNumSortKey(a.num) - matchNumSortKey(b.num);
    if (nk) return nk;
    return String(a.num || '').localeCompare(String(b.num || ''), 'zh');
  });
}
const sample = sortRows([
  { num: '周日026', _kind: 'live' },
  { num: '周日023', _kind: 'ft' },
  { num: '周日015', _kind: 'ft' },
  { num: '周日016', _kind: 'ft' },
  { num: '周日006', _kind: 'ft' },
]);
assert.deepStrictEqual(
  sample.map((x) => x.num),
  ['周日026', '周日006', '周日015', '周日016', '周日023'],
);

console.log('ui-210-test OK');
