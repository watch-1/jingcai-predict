'use strict';
// 1.9.257: 赛程/比分「全部」列表按竞彩编号排序平铺，不按联赛分块（用户：按编号顺序而非联赛类型）。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/VERSION=1\.9\.268/.test(ver));
assert.ok(/VERSION_CODE=304/.test(ver));
assert.ok(/jc-v1\.9\.268/.test(swJs));
assert.strictEqual(pkg.version, '1.9.268');
assert.strictEqual(cfg.version, '1.9.268');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.268\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-304\}"/.test(apkSh));

const bodyFn = appJs.match(/function scheduleBodyHtml[\s\S]*?^}/m)?.[0] || '';
assert.ok(!/lg-group/.test(bodyFn), 'no league group headers in schedule body');
assert.ok(/function scheduleListRows/.test(appJs), 'scheduleListRows still sorts rows');

function matchNumSortKey(num) {
  const m = String(num || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}
function scheduleListRows(rows) {
  return rows.slice().sort((a, b) => {
    const finRank = k => (k === 'ft' ? 1 : 0);
    const d = finRank(a._kind) - finRank(b._kind);
    if (d) return d;
    const nk = matchNumSortKey(a.num) - matchNumSortKey(b.num);
    if (nk) return nk;
    return String(a.num || '').localeCompare(String(b.num || ''), 'zh');
  });
}

const mixed = scheduleListRows([
  { num: '周六021', league: '意甲', _kind: 'live' },
  { num: '周六009', league: '意甲', _kind: 'live' },
  { num: '周六010', league: '德甲', _kind: 'live' },
  { num: '周六025', league: '意甲', _kind: 'live' },
]);
assert.deepStrictEqual(
  mixed.map(x => x.num),
  ['周六009', '周六010', '周六021', '周六025'],
  'cross-league order follows issue serial not league blocks',
);

console.log('ui-257-test OK');
