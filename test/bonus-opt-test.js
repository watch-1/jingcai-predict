'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

const chunk = appJs.match(
  /function distributeIntegerUnits\(weights, totalUnits\)[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(chunk, 'bonus-opt helpers present in app.js');

const simChunk = appJs.match(
  /function pickKeyTrueAtScore[\s\S]*?function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(simChunk, 'simultaneousWinPrizeRange present in app.js');

const ctx = {
  console,
  LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } },
  S: { matches: [], schedule: [] },
  findMatchByNum: () => null,
};
vm.createContext(ctx);
vm.runInContext(chunk + simChunk + `
globalThis.computeBonusOptMults = computeBonusOptMults;
globalThis.lineEstPrize = lineEstPrize;
globalThis.simultaneousWinPrizeRange = simultaneousWinPrizeRange;
`, ctx);

const lines = [
  { oddsProd: 4.3 },
  { oddsProd: 2.2 },
  { oddsProd: 8.5 },
  { oddsProd: 15.0 },
];
const amount = 200;
const units = 100;

const none = ctx.computeBonusOptMults('none', lines, amount, 1);
assert.strictEqual(none.reduce((a, b) => a + b, 0), units);
assert.deepStrictEqual(none, [25, 25, 25, 25]);

const avg = ctx.computeBonusOptMults('avg', lines, amount, 1);
const cold = ctx.computeBonusOptMults('cold', lines, amount, 1);
assert.strictEqual(avg.reduce((a, b) => a + b, 0), units);
assert.strictEqual(cold.reduce((a, b) => a + b, 0), units);

const avgPrizes = lines.map((l, i) => ctx.lineEstPrize(l, avg[i]));
const coldPrizes = lines.map((l, i) => ctx.lineEstPrize(l, cold[i]));
const avgSpread = Math.max(...avgPrizes) - Math.min(...avgPrizes);
const coldSpread = Math.max(...coldPrizes) - Math.min(...coldPrizes);
assert.ok(avgSpread < coldSpread * 0.5, 'avg should equalize prizes more than cold spread');

assert.ok(cold[3] > cold[0] * 3, 'cold should heavily favor highest odds line');
assert.ok(cold[3] > avg[3] * 2, 'cold allocates much more to long shot than avg');
assert.ok(cold[3] >= 65, 'cold coldest line should hold majority of units');

const officialLike = [
  { oddsProd: 9.055 },
  { oddsProd: 13.215 },
  { oddsProd: 15.8 },
  { oddsProd: 23.06 },
];
const coldOff = ctx.computeBonusOptMults('cold', officialLike, 200, 1);
assert.strictEqual(coldOff.reduce((a, b) => a + b, 0), 100);
assert.ok(coldOff[3] >= 70, 'official-like slip: coldest line ~70%+ units');
assert.ok(coldOff[0] >= 10 && coldOff[1] >= 6 && coldOff[2] >= 5, 'official-like tail coverage');

const mkLine = (picks, oddsProd) => ({ picks, oddsProd });
const nested = [
  mkLine([{ num: '001', key: 'hadh' }, { num: '002', key: 'hadh' }], 10),
  mkLine([{ num: '001', key: 'hadh' }, { num: '003', key: 'hadh' }], 8),
  mkLine([{ num: '001', key: 'hadd' }, { num: '002', key: 'hadh' }], 12),
];
const mults = [10, 10, 10];
const singleExtrema = {
  min: Math.min(...nested.map((l, i) => ctx.lineEstPrize(l, mults[i]))),
  max: Math.max(...nested.map((l, i) => ctx.lineEstPrize(l, mults[i]))),
};
const sim = ctx.simultaneousWinPrizeRange(nested, mults);
assert.ok(sim.max > singleExtrema.max, 'max should exceed largest single-line prize when lines hit together');
assert.ok(sim.max === ctx.lineEstPrize(nested[0], 10) + ctx.lineEstPrize(nested[1], 10), 'best outcome sums compatible 001胜 lines');
assert.ok(sim.min > 0 && sim.min < sim.max, 'min is positive simultaneous total below max');
assert.ok(sim.min !== singleExtrema.max || sim.max > singleExtrema.max, 'range is not single-line extrema only');

const appStr = appJs;
assert.ok(/data-act="openBonusOpt"/.test(appStr), 'trial sheet: 优化方案 button');
assert.ok(/奖金优化/.test(appStr) && /未做优化/.test(appStr) && /平均优化/.test(appStr) && /博冷优化/.test(appStr), 'bonus opt modes');
assert.ok(/function expandCalcDanShiLines/.test(appStr), 'expand 单式 lines');
assert.ok(/function simultaneousWinPrizeRange/.test(appStr), 'simultaneous prize range helper');
assert.ok(/bonus-opt-disclaimer/.test(appStr), 'bonus opt page disclaimer at bottom');
assert.ok(/calc-panel[\s\S]*calc-list[\s\S]*calc-edu-note/.test(appStr), 'calc disclaimer after match list');
assert.ok(!/calc-date-row[\s\S]{0,120}calc-edu-note/.test(appStr), 'calc disclaimer not under date row');
assert.ok(/var\(--sat\)/.test(fs.readFileSync(path.join(root, 'public/style.css'), 'utf8')), 'bonus opt header uses safe-area top');

console.log('bonus-opt-test OK', { none, avg, cold, coldOff, sim, singleExtrema });
