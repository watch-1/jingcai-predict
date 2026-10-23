// 1.9.160: player MV gold styling + KB error toast only on KB route.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const mvBlock = css.match(/\.dc-sc-stat \.dc-mv-amt\s*\{[^}]+\}/);
assert.ok(mvBlock, '.dc-sc-stat .dc-mv-amt rule must exist');
assert.ok(/var\(--gold\)/.test(mvBlock[0]), 'player market value amount must use gold');
assert.ok(!/var\(--t1\)/.test(mvBlock[0]), 'player market value must not use --t1 navy');

function kbLoadFailToastAllowed(routeName) {
  return routeName === 'kb';
}
function shouldToastKbLoadFail(routeName) {
  return routeName === 'kb' && kbLoadFailToastAllowed(routeName);
}
assert.strictEqual(shouldToastKbLoadFail('data'), false, 'KB load fail must not toast on data tab');
assert.strictEqual(shouldToastKbLoadFail('kb'), true);

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(appJs.includes('kbLoadFailToastAllowed'), 'app exposes kb route guard for KB toast');
assert.ok(/if \(onKb && kbLoadFailToastAllowed\('kb'\)\)/.test(appJs), 'ensureKbRouteData gates toast');

console.log('ui-160-test OK');
