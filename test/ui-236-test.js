'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.237/.test(ver));
assert.ok(/VERSION_CODE=274/.test(ver));
assert.ok(/jc-v1\.9\.237/.test(swJs), 'SW VER 1.9.237');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.237');

assert.ok(
  /function openCalcComboSheet\(\) \{[\s\S]*?openSheetHtml\([\s\S]*?\);\s*renderCalcBar\(\);/.test(appJs),
  'combo sheet toggle must refresh calcbar immediately'
);
assert.ok(
  /function openCalcSubmitSheet\(\) \{[\s\S]*?openSheetHtml\([\s\S]*?\);\s*renderCalcBar\(\);/.test(appJs),
  'submit sheet combo toggle must refresh calcbar'
);

const calcBlock = appJs.match(
  /function selMatchesFrom\(sel\)[\s\S]*?function expandCalcDanShiLines\(sel, types\) \{[\s\S]*?\n\}/
)?.[0];
const prizeChunk = appJs.match(
  /function pickKeyTrueAtScore[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
const simFn = appJs.match(/function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/)?.[0];
const labelFn = appJs.match(/function calcTypeBarLabel\(types\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(calcBlock && prizeChunk && simFn && labelFn, 'calc helpers extractable');

const ctx = {
  console,
  LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } },
  S: {
    schedule: [
      { id: 'a', num: '周三001', hhad: { goalLine: '-1' } },
      { id: 'b', num: '周三002', hhad: { goalLine: '-1' } },
      { id: 'c', num: '周三003', hhad: { goalLine: '+1' } },
    ],
    matches: [],
  },
};
vm.createContext(ctx);
vm.runInContext(`
function findMatch(id) {
  return (S.schedule || []).find(m => m.id === String(id)) || null;
}
function findMatchByNum(num) {
  const s = String(num || '');
  return (S.schedule || []).find(m => String(m.num) === s) || null;
}
function oddsForSelKey(m, key, stored) {
  if (typeof stored === 'number' && stored >= 1.01) return stored;
  return Number(stored) || 0;
}
function calcSelLabel(key) { return key; }
${calcBlock}
${prizeChunk}
${simFn}
${labelFn}
`, ctx);

/** User screenshot: 3 matches 2/2/1 options, mult 25 */
const sel = {
  a: { hadh: 1.57, hhadh: 2.74 },
  b: { hadh: 1.24, hhadh: 1.81 },
  c: { hada: 1.53 },
};
const mult = 25;

const only2 = ctx.calcFrom(sel, [2], mult);
assert.strictEqual(only2.bets, 8, '2串1 only: 8 bets');
assert.strictEqual(only2.cost, 400, '2串1 only: 400 yuan at 25x');

const only3 = ctx.calcFrom(sel, [3], mult);
assert.strictEqual(only3.bets, 4, '3串1 only: 4 bets');
assert.strictEqual(only3.cost, 200, '3串1 only: 200 yuan at 25x');

const both = ctx.calcFrom(sel, [2, 3], mult);
assert.strictEqual(both.bets, 12, '2+3串1: 12 bets');
assert.strictEqual(both.cost, 600, '2+3串1: 600 yuan at 25x');

assert.strictEqual(ctx.calcTypeBarLabel([2]), '2串1');
assert.strictEqual(ctx.calcTypeBarLabel([3]), '3串1');
assert.strictEqual(ctx.calcTypeBarLabel([2, 3]), '2串1等');

assert.ok(only2.min < only3.min || only2.max !== both.max, 'prize range differs by pass-way set');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.237\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-274\}"/.test(apkSh));

console.log('ui-236-test OK', {
  only2: { cost: only2.cost, min: only2.min, max: only2.max },
  only3: { cost: only3.cost, min: only3.min, max: only3.max },
  both: { cost: both.cost, min: both.min, max: both.max },
});
