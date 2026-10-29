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
assert.ok(/VERSION=1\.9\.246/.test(ver));
assert.ok(/VERSION_CODE=283/.test(ver));
assert.ok(/jc-v1\.9\.246/.test(swJs), 'SW VER 1.9.246');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.246');

assert.ok(/function crsScoreInList/.test(appJs), 'CRS score lists for pickKeyTrueAtScore');
assert.ok(/key\.startsWith\('crs_'\)/.test(appJs), 'pickKeyTrueAtScore handles CRS keys');
assert.ok(/key\.startsWith\('hafu_'\)/.test(appJs), 'pickKeyTrueAtScore handles 半全场 keys');
assert.ok(/key\.startsWith\('ttg_'\)/.test(appJs), 'pickKeyTrueAtScore handles 总进球 keys');
assert.ok(/needHt/.test(appJs), 'achievable subsets enumerate HT×FT when 半全场 selected');
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

/** User follow-up: SPF/RQ + 半全场平胜 — max must sum all four, not only 让胜 pair on 002. */
const hafuDh = 'hafu_dh';
const hafuLines = [
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 219.6 / (2 * 45),
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: hafuDh }],
    oddsProd: 213.48 / (2 * 18),
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 214.24 / (2 * 26),
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: hafuDh }],
    oddsProd: 219.78 / (2 * 11),
  },
];
const hafuMults = [45, 18, 26, 11];
const hafuPrizes = hafuLines.map((line, i) => ctx.lineEstPrize(line, hafuMults[i]));
assert.ok(Math.abs(hafuPrizes[0] - 219.6) < 0.02);
assert.ok(Math.abs(hafuPrizes[1] - 213.48) < 0.02);
assert.ok(Math.abs(hafuPrizes[2] - 214.24) < 0.02);
assert.ok(Math.abs(hafuPrizes[3] - 219.78) < 0.02);
const hafuSum = hafuPrizes.reduce((a, b) => a + b, 0);
const hafuRange = ctx.slipPrizeRange(hafuLines, hafuMults);
assert.ok(Math.abs(hafuRange.min - 213.48) < 0.05, `hafu min ~213.48 got ${hafuRange.min}`);
assert.ok(
  Math.abs(hafuRange.max - hafuSum) < 0.5,
  `hafu max must sum all four ~867.10 got ${hafuRange.max} (bug was ~433.84)`
);
assert.ok(hafuRange.max > 800, `hafu max must beat 433.84 got ${hafuRange.max}`);

/** 总进球 + 胜/让球: 002 的 ttg_s3 与 hhadh 可在 3:0 同时成立，四注应全计入 max。 */
const ttg3 = 'ttg_s3';
const ttgLines = [
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: ttg3 }],
    oddsProd: 5,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 3,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: ttg3 }],
    oddsProd: 8,
  },
  {
    parlay: 2,
    picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }],
    oddsProd: 4,
  },
];
const ttgMults = [10, 10, 10, 10];
const ttgPrizes = ttgLines.map((line, i) => ctx.lineEstPrize(line, ttgMults[i]));
const ttgSum = ttgPrizes.reduce((a, b) => a + b, 0);
const ttgRange = ctx.slipPrizeRange(ttgLines, ttgMults);
assert.ok(Math.abs(ttgRange.max - ttgSum) < 0.02, `ttg max must sum all four ~${ttgSum} got ${ttgRange.max}`);
assert.ok(ttgRange.max > 300, `ttg max must beat ttg-only pair 260 got ${ttgRange.max}`);
const ttg002Subsets = ctx.achievableKeySubsetsForMatch([ttg3, 'hhadh'], '-1');
assert.ok(
  ttg002Subsets.some(s => s.includes(ttg3) && s.includes('hhadh')),
  'ttg_s3 and hhadh must appear in same achievable subset on one match'
);

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.246\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-283\}"/.test(apkSh));

console.log('ui-239-test OK', {
  range,
  sumAll,
  eqRange: { min: eqRange.min, max: eqRange.max },
  hafuRange: { min: hafuRange.min, max: hafuRange.max, sum: hafuSum },
});
