'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

const chunk = appJs.match(
  /function distributeIntegerUnits\(weights, totalUnits\)[\s\S]*?function lineEstPrize\(line, mult\) \{ return line\.oddsProd \* 2 \* \(mult \|\| 0\); \}/
)?.[0];
assert.ok(chunk, 'bonus-opt helpers present in app.js');

const ctx = { console, LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } } };
vm.createContext(ctx);
vm.runInContext(chunk + `
globalThis.computeBonusOptMults = computeBonusOptMults;
globalThis.lineEstPrize = lineEstPrize;
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
assert.deepStrictEqual(none, [1, 1, 1, 1]);

const avg = ctx.computeBonusOptMults('avg', lines, amount, 1);
const cold = ctx.computeBonusOptMults('cold', lines, amount, 1);
assert.strictEqual(avg.reduce((a, b) => a + b, 0), units);
assert.strictEqual(cold.reduce((a, b) => a + b, 0), units);

const avgPrizes = lines.map((l, i) => ctx.lineEstPrize(l, avg[i]));
const coldPrizes = lines.map((l, i) => ctx.lineEstPrize(l, cold[i]));
const avgSpread = Math.max(...avgPrizes) - Math.min(...avgPrizes);
const coldSpread = Math.max(...coldPrizes) - Math.min(...coldPrizes);
assert.ok(avgSpread < coldSpread * 0.5, 'avg should equalize prizes more than cold spread');

assert.ok(cold[3] > cold[0], 'cold should favor higher odds line');
assert.ok(avg[3] < cold[3], 'cold allocates more to long shot than avg');

const appStr = appJs;
assert.ok(/data-act="openBonusOpt"/.test(appStr), 'trial sheet: 优化方案 button');
assert.ok(/奖金优化/.test(appStr) && /未做优化/.test(appStr) && /平均优化/.test(appStr) && /博冷优化/.test(appStr), 'bonus opt modes');
assert.ok(/function expandCalcDanShiLines/.test(appStr), 'expand 单式 lines');

console.log('bonus-opt-test OK');
