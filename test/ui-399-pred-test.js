'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.strictEqual((indexHtml.match(/216mf401/g) || []).length, 6, 'index.html has 6× 216mf401');
assert.ok(/function prefCmpBlock/.test(appJs));
assert.ok(/function prefMaxGapKeys/.test(appJs));
assert.ok(/function prefGoalColsBlock/.test(appJs));
assert.ok(/function prefSplitBlock/.test(appJs));
assert.ok(/function prefStripBlock/.test(appJs));
assert.ok(/出入最大/.test(appJs));
assert.ok(/进球数预测/.test(appJs));
assert.ok(/大小预测（2\.5）/.test(appJs));
assert.ok(/比分预测概率/.test(appJs));
assert.ok(/半全场预测概率/.test(appJs));
assert.ok(/SportMonks 没有亚洲让球/.test(appJs));
assert.ok(!/亚洲预测/.test(appJs.slice(appJs.indexOf('function prematchRefHtml'), appJs.indexOf('function prematchRefHtml') + 16000)));
assert.ok(/prefCmpBlock\('胜平负'/.test(appJs));
assert.ok(/prefCmpBlock\(hhadTitle/.test(appJs));
assert.ok(/prefGoalColsBlock/.test(appJs));
assert.ok(/prefStripBlock\('比分预测概率'/.test(appJs));
assert.ok(/prefStripBlock\('半全场预测概率'/.test(appJs));
assert.ok(/\.pref-cmp/.test(css) && /\.pref-cols/.test(css) && /\.pref-split/.test(css) && /\.pref-strip/.test(css));
assert.ok(/\.pref-cmp-col\.is-gap/.test(css));

const start = appJs.indexOf('function prefBlock');
const end = appJs.indexOf('function smPredPackOf');
assert.ok(start > 0 && end > start, 'helper slice');
const sandbox = {
  prefHas: (v) => v != null && v !== '' && Number.isFinite(Number(v)),
  prefPct: (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return (n * 100).toFixed(n >= 0.1 || n === 0 ? 0 : 1) + '%';
  },
  esc: (s) => String(s),
};
vm.runInNewContext(appJs.slice(start, end), sandbox);
const gaps = sandbox.prefMaxGapKeys(
  { h: 0.36, d: 0.30, a: 0.34 },
  { h: 0.47, d: 0.27, a: 0.26 },
  ['h', 'd', 'a']
);
assert.deepStrictEqual(Object.keys(gaps), ['h']);
assert.ok(Math.abs(gaps.h - 0.11) < 1e-9);
assert.strictEqual(sandbox.prefGapPct(0.11), '+11%');
const hhad = sandbox.prefMaxGapKeys(
  { h: 0.15, d: 0.22, a: 0.63 },
  { h: 0.18, d: 0.26, a: 0.56 },
  ['h', 'd', 'a']
);
assert.deepStrictEqual(Object.keys(hhad), ['a']);
assert.ok(sandbox.prefGapPct(hhad.a).startsWith('−'));
const html = sandbox.prefCmpBlock('胜平负', '', [
  { key: 'h', lab: '主胜' },
  { key: 'd', lab: '平局' },
  { key: 'a', lab: '客胜' },
], { h: 0.36, d: 0.30, a: 0.34 }, { h: 0.47, d: 0.27, a: 0.26 });
assert.ok(/is-gap/.test(html) && /出入最大/.test(html) && /主胜/.test(html));
assert.ok(html.indexOf('is-gap') === html.lastIndexOf('is-gap') || (html.match(/is-gap/g) || []).length === 1);

function prefH(html, pctLabel) {
  const re = new RegExp('style="--pref-h:([0-9.]+)%"[^>]*>\\s*<b>' + pctLabel.replace('%', '\\%') + '\\s*</b>');
  const m = html.match(re);
  assert.ok(m, 'missing --pref-h for ' + pctLabel);
  return Number(m[1]);
}
const kashima = sandbox.prefCmpBlock('胜平负', '', [
  { key: 'h', lab: '主胜' },
  { key: 'd', lab: '平局' },
  { key: 'a', lab: '客胜' },
], { h: 0.70, d: 0.19, a: 0.11 }, { h: 0.63, d: 0.20, a: 0.17 });
assert.ok(/pref-cmp-track/.test(kashima), 'bars live in a dedicated track');
assert.strictEqual(prefH(kashima, '70%'), 100);
assert.strictEqual(prefH(kashima, '63%'), 90);
assert.strictEqual(prefH(kashima, '19%'), 27.1);
assert.strictEqual(prefH(kashima, '20%'), 28.6);
assert.strictEqual(prefH(kashima, '11%'), 15.7);
assert.strictEqual(prefH(kashima, '17%'), 24.3);
const sydney = sandbox.prefCmpBlock('胜平负', '', [
  { key: 'h', lab: '主胜' },
  { key: 'd', lab: '平局' },
  { key: 'a', lab: '客胜' },
], { h: 0.60, d: 0.20, a: 0.20 }, { h: 0.46, d: 0.23, a: 0.31 });
assert.strictEqual(prefH(sydney, '60%'), 100);
assert.strictEqual(prefH(sydney, '46%'), 76.7);
assert.strictEqual(prefH(sydney, '20%'), 33.3);
assert.strictEqual(prefH(sydney, '23%'), 38.3);
assert.strictEqual(prefH(sydney, '31%'), 51.7);
assert.ok(/\.pref-cmp-track/.test(css) && /--pref-h/.test(css), 'CSS scale uses --pref-h in a track');

console.log('ui-399-pred-test ok');
