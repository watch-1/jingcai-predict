'use strict';
const assert = require('assert');
const att = require('../lib/lineup-attach');
const sq = require('../lib/squad');

const official = [
  { name: 'Bruno Fernandes', smId: 129602 },
  { name: 'Gonçalo Ramos', smId: 23278610 },
  { name: 'Bernardo Silva', smId: 96353 },
];
const before = { ...sq.nameZhMap() };
for (const r of official) {
  att.applyNameZh(r);
  assert.ok(/[\u4e00-\u9fff]/.test(r.nameZh || ''), 'official ' + r.name);
  assert.notStrictEqual(r.nameZhSrc, 'auto', r.name + ' should not be auto when in official map');
}
const dias = att.applyNameZh({ name: 'Rúben Dias', smId: 162536 });
assert.strictEqual(dias.nameZh, '鲁本·迪亚斯');

const miss = att.applyNameZh({ name: 'João Palhinha', smId: 160072 });
assert.ok(/[\u4e00-\u9fff]/.test(miss.nameZh || ''), 'Palhinha filled from official or wiki/auto pipeline');

const costa = att.applyNameZh({ name: 'Diogo Costa', smId: 163094 });
assert.ok(/[\u4e00-\u9fff]/.test(costa.nameZh || ''), 'Diogo Costa has a zh name');
assert.ok(!/赞帕|卢根/.test(costa.nameZh), 'Diogo Costa must not inherit another Costa');

// Request-time lookup must not rewrite existing official entries.
const after = sq.nameZhMap();
for (const [k, v] of Object.entries(before)) {
  assert.strictEqual(after[k], v, 'must not rewrite official ' + k);
}
console.log('lineup namezh tests OK', {
  official: official.map((r) => r.nameZh),
  palhinha: { zh: miss.nameZh, src: miss.nameZhSrc || 'official' },
  costa: { zh: costa.nameZh, src: costa.nameZhSrc || 'official' },
});
