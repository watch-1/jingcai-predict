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

assert.ok(/function calcTypeBarLabel/.test(appJs), 'calcbar label for multi pass ways');
assert.ok(/function calcComboSheetOpen/.test(appJs), 'combo sheet stays open on multi-toggle');
assert.ok(/calcComboBtnsHtml\(c\.avail, S\.calcTypes, 'calcType'\)/.test(appJs), 'combo sheet multi-select chips');
assert.ok(/calcTypes = S\.calcTypes\.includes\(n\) \? S\.calcTypes\.filter/.test(appJs), 'calcTypePick multi-toggle');

const calcBlock = appJs.match(
  /function selMatchesFrom\(sel\)[\s\S]*?function expandCalcDanShiLines\(sel, types\) \{[\s\S]*?\n\}/
)?.[0];
const prizeChunk = appJs.match(
  /function pickKeyTrueAtScore[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
const simFn = appJs.match(/function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(calcBlock && prizeChunk && simFn, 'calc + prize helpers extractable');

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
function calcTypeBarLabel(types) {
  const sorted = (types || []).filter(t => t >= 1).sort((a, b) => a - b);
  if (!sorted.length) return '过关';
  if (sorted.length === 1) return typeName(sorted[0]);
  return \`\${typeName(sorted[0])}等\`;
}
`, ctx);

const sel = {
  a: { hadh: 1.57, hhadh: 2.74 },
  b: { hadh: 1.24, hhadh: 1.81 },
  c: { hadh: 4.65 },
};
const mult = 20;

const only2 = ctx.calcFrom(sel, [2], mult);
assert.strictEqual(only2.bets, 8, '2串1 only: 8 bets');
assert.strictEqual(only2.cost, 320, '2串1 only: 320 yuan at 20x');

const both = ctx.calcFrom(sel, [2, 3], mult);
assert.strictEqual(both.bets, 12, '2+3串1: 12 bets');
assert.strictEqual(both.cost, 480, '2+3串1: 480 yuan at 20x');

assert.ok(both.min > 75 && both.min < 82, `min prize near official ~77.80, got ${both.min}`);
assert.ok(both.max > 1850 && both.max < 1920, `max prize near official ~1894.60, got ${both.max}`);

const emptyDefault = ctx.calcFrom(sel, [], mult);
assert.ok(emptyDefault.types.includes(2) && emptyDefault.types.includes(3), 'default pass ways: all M串1 for 3 matches');
assert.strictEqual(emptyDefault.cost, 480, 'default types yield official-like 480');

assert.strictEqual(ctx.calcTypeBarLabel([2]), '2串1');
assert.strictEqual(ctx.calcTypeBarLabel([2, 3]), '2串1等');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.237\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-274\}"/.test(apkSh));

console.log('ui-235-test OK', { only2: { bets: only2.bets, cost: only2.cost }, both: { bets: both.bets, cost: both.cost, min: both.min, max: both.max } });
