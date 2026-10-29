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
assert.ok(/VERSION=1\.9\.247/.test(ver));
assert.ok(/VERSION_CODE=284/.test(ver));
assert.ok(/jc-v1\.9\.247/.test(swJs), 'SW VER 1.9.247');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.247');

assert.ok(/先为其余单式分配使预估奖金不低于优化金额/.test(appJs), '博冷 help copy break-even-then-cold');

const lineEstChunk = appJs.match(
  /function jcRoundOddsProd\(prod\) \{[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
const bonusChunk = appJs.match(
  /function distributeIntegerUnits\(weights, totalUnits\)[\s\S]*?function bonusOptTotals\(lines, mults\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(lineEstChunk && bonusChunk, 'bonus opt helpers extractable');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(`${lineEstChunk}\n${bonusChunk}`, ctx);

const { computeBonusOptMults, lineEstPrize, bonusOptUnitsFromAmount } = ctx;

function mockLine(oddsProd) {
  return { oddsProd, picks: [], parlay: 2 };
}

function sum(mults) { return mults.reduce((a, b) => a + b, 0); }

/** Official 2-line / 200元 / 100倍: ~39 + ~61, lower line 预估≈201.63 */
const twoLines = [
  mockLine(2.585),
  mockLine(4.418),
];
const m2 = computeBonusOptMults('cold', twoLines, 200, 1);
assert.strictEqual(sum(m2), 100);
assert.strictEqual(m2[0], 39, 'lower-odds break-even units');
assert.strictEqual(m2[1], 61, 'cold remainder');
const p2Low = lineEstPrize(twoLines[0], m2[0]);
const p2Cold = lineEstPrize(twoLines[1], m2[1]);
assert.ok(p2Low >= 200 && p2Low < 210, `2-line low prize ~201 got ${p2Low}`);
assert.ok(p2Cold > 500, `2-line cold prize ≫ stake got ${p2Cold}`);

/** Official 4-line / 200元: non-cold ~39/23/8, cold ~30 (让胜+3:0 highest odds) */
const fourLines = [
  mockLine(2.585),
  mockLine(23.67),
  mockLine(4.418),
  mockLine(13.86),
];
const m4 = computeBonusOptMults('cold', fourLines, 200, 1);
assert.strictEqual(sum(m4), 100);
assert.strictEqual(m4[1], 30, 'cold line gets remainder after break-even tails');
assert.strictEqual(m4[0], 39);
assert.strictEqual(m4[2], 23);
assert.strictEqual(m4[3], 8);
for (let i = 0; i < 4; i++) {
  if (i === 1) continue;
  const p = lineEstPrize(fourLines[i], m4[i]);
  assert.ok(p >= 200 && p < 230, `line ${i} break-even prize got ${p}`);
}
assert.ok(lineEstPrize(fourLines[1], m4[1]) > 1000, 'cold line high payout');

/** All-low odds: break-even exceeds budget → almost all-in cold, min 1 on others */
const lowLines = [mockLine(1.15), mockLine(1.18), mockLine(1.12), mockLine(1.2)];
const mLow = computeBonusOptMults('cold', lowLines, 200, 1);
assert.strictEqual(sum(mLow), 100);
const coldI = 3;
assert.strictEqual(mLow[coldI], 97, 'all-low cold almost all-in');
for (let i = 0; i < 4; i++) {
  if (i === coldI) continue;
  assert.strictEqual(mLow[i], 1);
}

/** 400元 / 200倍 2-line repro (was 14+186 wrong) */
const m400 = computeBonusOptMults('cold', twoLines, 400, 1);
assert.strictEqual(sum(m400), 200);
assert.ok(m400[0] >= 75, `400yuan low line needs ~78x got ${m400[0]}`);
assert.ok(lineEstPrize(twoLines[0], m400[0]) >= 400, '400yuan lower line covers stake');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.247\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-284\}"/.test(apkSh));

console.log('ui-238-test OK', { m2, m4, mLow, m400, units: bonusOptUnitsFromAmount(200) });
