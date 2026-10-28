'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.239/.test(ver));
assert.ok(/VERSION_CODE=276/.test(ver));
assert.ok(/jc-v1\.9\.239/.test(swJs), 'SW VER 1.9.239');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.239');

assert.ok(/function achievableKeySubsetsForMatch/.test(appJs), 'simultaneous win: per-match key subsets');
assert.ok(/openCalcComboSheet/.test(appJs) && /\.calc-combo-btn/.test(css), 'combo picker bottom sheet');
assert.ok(/openCalcMultSheet/.test(appJs) && /\.calc-mult-pad/.test(css), 'mult numeric keypad sheet');
assert.ok(!/calcbarTypeSel/.test(appJs), 'calcbar: no native type select');

const prizeChunk = appJs.match(
  /function pickKeyTrueAtScore[\s\S]*?function lineEstPrize\(line, mult\) \{[\s\S]*?\n\}/
)?.[0];
const simFn = appJs.match(/function simultaneousWinPrizeRange\(lines, mults\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(prizeChunk && simFn, 'prize helpers extractable');
const ctx = {
  console,
  LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } },
  S: {
    schedule: [
      { num: '周三001', hhad: { goalLine: '-1' } },
      { num: '周三002', hhad: { goalLine: '-1' } },
      { num: '周三003', hhad: { goalLine: '+1' } },
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
${prizeChunk}
${simFn}
`, ctx);

const mult = 25;
const lines = [
  { picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hadh' }, { num: '周三003', key: 'hadh' }], oddsProd: 1.57 * 1.24 * 4.65 },
  { picks: [{ num: '周三001', key: 'hadh' }, { num: '周三002', key: 'hhadh' }, { num: '周三003', key: 'hadh' }], oddsProd: 1.57 * 1.81 * 4.65 },
  { picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hadh' }, { num: '周三003', key: 'hadh' }], oddsProd: 2.74 * 1.24 * 4.65 },
  { picks: [{ num: '周三001', key: 'hhadh' }, { num: '周三002', key: 'hhadh' }, { num: '周三003', key: 'hadh' }], oddsProd: 2.74 * 1.81 * 4.65 },
];
const mults = lines.map(() => mult);
const range = ctx.simultaneousWinPrizeRange(lines, mults);
assert.ok(range.max > 2500 && range.max < 3100, `max near official ~3056, got ${range.max}`);
assert.ok(range.min > 440 && range.min < 460, `min near official ~452.5, got ${range.min}`);
assert.ok(range.max > 1155, 'max exceeds single best 3串1 line (~1153)');

assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.239\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-276\}"/.test(apkSh));

console.log('ui-232-test OK', { range });
