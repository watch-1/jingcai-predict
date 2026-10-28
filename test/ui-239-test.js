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
assert.ok(/VERSION=1\.9\.239/.test(ver));
assert.ok(/VERSION_CODE=276/.test(ver));
assert.ok(/jc-v1\.9\.239/.test(swJs), 'SW VER 1.9.239');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.239');

assert.ok(/function crsScoreInList/.test(appJs), 'CRS score lists for pickKeyTrueAtScore');
assert.ok(/key\.startsWith\('crs_'\)/.test(appJs), 'pickKeyTrueAtScore handles CRS keys');
assert.ok(
  !/onlyWdl[\s\S]*?return unique\.map\(k => \[k\]\)/.test(appJs),
  'must not collapse mixed-play keys to singleton subsets only'
);

const prizeChunk = appJs.match(
  /const CRS_MORE_WIN[\s\S]*?function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/
)?.[0];
const slipFn = appJs.match(/function slipPrizeRange\(lines, mults, parlayTypes\) \{[\s\S]*?\n\}/)?.[0];
const lineEstChunk = appJs.match(
  /function jcRoundOddsProd\(prod\) \{[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
assert.ok(prizeChunk && slipFn && lineEstChunk, 'prize helpers extractable');

const ctx = {
  console,
  LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } },
  S: {
    schedule: [
      { num: '周三001', hhad: { goalLine: '-1' } },
      { num: '周三002', hhad: { goalLine: '-1' } },
    ],
    matches: [],
  },
};
vm.createContext(ctx);
vm.runInContext(`
function findMatchByNum(num) {
  const s = String(num || '');
  return (S.schedule || []).find(m => String(m.num) === s) || null;
}
${lineEstChunk}
${prizeChunk}
${slipFn}
`, ctx);

/** User 图1-class: 2串1 mixing SPF/RQ + 比分3:0 on two matches (200元). */
const crs30 = 'crs_s03s00';
const lines = [
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: crs30 }],
    oddsProd: 13.5,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 2.44,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: crs30 }],
    oddsProd: 22.77,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 4.12,
  },
];
const mults = [8, 41, 26, 25];
const prizes = lines.map((line, i) => ctx.lineEstPrize(line, mults[i]));
assert.ok(Math.abs(prizes[0] - 216) < 0.02, `line1 prize ~216 got ${prizes[0]}`);
assert.ok(Math.abs(prizes[1] - 200.08) < 0.02, `line2 prize ~200.08 got ${prizes[1]}`);
assert.ok(Math.abs(prizes[2] - 1184.04) < 0.02, `line3 prize ~1184.04 got ${prizes[2]}`);
assert.ok(Math.abs(prizes[3] - 206) < 0.02, `line4 prize ~206 got ${prizes[3]}`);

const sumAll = prizes.reduce((a, b) => a + b, 0);
const range = ctx.slipPrizeRange(lines, mults);
assert.ok(Math.abs(range.min - 200.08) < 0.05, `min ~lowest line 200.08 got ${range.min}`);
assert.ok(
  Math.abs(range.max - sumAll) < 0.5,
  `max must sum all jointly winnable lines ~${sumAll.toFixed(2)} got ${range.max} (bug was ~1400.04)`
);
assert.ok(range.max > 1700, `max must exceed old 3:0-only sum 1400.04 got ${range.max}`);

/** 图3-class equal 25x: max = sum of four lines, not only two 3:0 lines. */
const eqMult = 25;
const eqLines = [
  { parlay: 2, picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: crs30 }], oddsProd: 13.5 },
  { parlay: 2, picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }], oddsProd: 2.44 },
  { parlay: 2, picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: crs30 }], oddsProd: 45.54 },
  { parlay: 2, picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }], oddsProd: 4.12 },
];
const eqMults = eqLines.map(() => eqMult);
const eqPrizes = eqLines.map((line, i) => ctx.lineEstPrize(line, eqMults[i]));
const eqSum = eqPrizes.reduce((a, b) => a + b, 0);
const eqRange = ctx.slipPrizeRange(eqLines, eqMults);
assert.ok(Math.abs(eqRange.max - eqSum) < 1, `equal-mult max ~${eqSum.toFixed(2)} got ${eqRange.max}`);
assert.ok(eqRange.max > 1900, `equal-mult max must beat old 675+1138.5 got ${eqRange.max}`);

/** SPF+RQ-only 2串1 still allows joint 胜+让胜 (ui-232 regression). */
const wdlLines = [
  { picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hadh' }], oddsProd: 1.57 * 1.24 },
  { picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }], oddsProd: 1.57 * 1.81 },
  { picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hadh' }], oddsProd: 2.74 * 1.24 },
  { picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }], oddsProd: 2.74 * 1.81 },
];
const wdlMults = wdlLines.map(() => 25);
const wdlRange = ctx.simultaneousWinPrizeRange(wdlLines, wdlMults);
assert.ok(wdlRange.max > 250, `WDL-only joint max got ${wdlRange.max}`);

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.239\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-276\}"/.test(apkSh));

console.log('ui-239-test OK', { range, sumAll, eqRange: { min: eqRange.min, max: eqRange.max } });
