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
assert.ok(/VERSION=1\.9\.245/.test(ver));
assert.ok(/VERSION_CODE=282/.test(ver));
assert.ok(/jc-v1\.9\.245/.test(swJs), 'SW VER 1.9.245');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.245');

assert.ok(/function slipPrizeRange/.test(appJs), 'shared slip prize range helper');
assert.ok(/bonusOptTotals[\s\S]*?slipPrizeRange/.test(appJs), 'bonus opt footer uses slipPrizeRange');

const calcBlock = appJs.match(
  /function selMatchesFrom\(sel\)[\s\S]*?function expandCalcDanShiLines\(sel, types\) \{[\s\S]*?\n\}/
)?.[0];
const bonusChunk = appJs.match(
  /function distributeIntegerUnits\(weights, totalUnits\)[\s\S]*?function bonusOptTotals\(lines, mults\) \{[\s\S]*?\n\}/
)?.[0];
const prizeChunk = appJs.match(
  /function pickKeyTrueAtScore[\s\S]*?function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/
)?.[0];
const slipFn = appJs.match(/function slipPrizeRange\(lines, mults, parlayTypes\) \{[\s\S]*?\n\}/)?.[0];
const lineEstChunk = appJs.match(
  /function jcRoundOddsProd\(prod\) \{[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(calcBlock && bonusChunk && prizeChunk && slipFn && lineEstChunk, 'calc + bonus opt helpers extractable');

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
${lineEstChunk}
${calcBlock}
${prizeChunk}
${slipFn}
${bonusChunk}
`, ctx);

/** User repro: 2串1 only, 25x, 400 yuan, 8 bets */
const sel = {
  a: { hadh: 1.57, hhadh: 2.74 },
  b: { hadh: 1.24, hhadh: 1.81 },
  c: { hadh: 4.65 },
};
const mult = 25;
const calc = ctx.calcFrom(sel, [2], mult);
const lines = ctx.expandCalcDanShiLines(sel, [2]);
const noneMults = ctx.computeBonusOptMults('none', lines, 400, mult);
const totals = ctx.bonusOptTotals(lines, noneMults);

assert.strictEqual(calc.bets, 8);
assert.strictEqual(totals.bets, 8);
assert.strictEqual(totals.cost, 400);

const lowestLine = Math.min(...lines.map((line, i) => ctx.lineEstPrize(line, noneMults[i])));
assert.ok(Math.abs(lowestLine - 97.5) < 0.02, `lowest line prize ~97.50 got ${lowestLine}`);
assert.ok(Math.abs(totals.min - lowestLine) < 0.02, `footer min must match lowest line got ${totals.min}`);
assert.ok(Math.abs(calc.min - totals.min) < 0.02, 'calcbar and bonus-opt footer min agree');
assert.ok(Math.abs(calc.max - totals.max) < 0.02, 'calcbar and bonus-opt footer max agree');
assert.ok(Math.abs(totals.max - 2369) < 1, `max ~2369 got ${totals.max}`);
assert.ok(totals.min < 200, `footer min must not use simultaneous min (~751) got ${totals.min}`);

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.245\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-282\}"/.test(apkSh));

console.log('ui-237-test OK', {
  calc: { min: calc.min, max: calc.max },
  totals: { min: totals.min, max: totals.max },
  lowestLine,
});
