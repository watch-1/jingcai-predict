'use strict';
const assert = require('assert');
const pmr = require('../lib/post-match-review');

assert.strictEqual(pmr.resultFromScore('2:1'), 'h');
assert.strictEqual(pmr.resultFromScore('0:0'), 'd');
assert.strictEqual(pmr.resultFromScore('1:3'), 'a');
assert.strictEqual(pmr.resultFromScore(''), null);

const deltas = pmr.computeSideDeltas(
  { possession: 50, shots: 8, shotsOnTarget: 3, passesPct: 80, corners: 4, expectedGoals: 1.2 },
  { possession: 70, shots: 12, shotsOnTarget: 4, passesPct: 85, corners: 5, expectedGoals: 1.5 }
);
assert.strictEqual(deltas.possession.delta, -20);
assert.ok(deltas.possession.delta <= -6);
assert.strictEqual(deltas.shots.actual, 8);
assert.ok(deltas.expectedGoals.delta < 0);

const hyps = pmr.buildHypotheses({
  homeName: '主队A',
  awayName: '客队B',
  homeDeltas: deltas,
  awayDeltas: pmr.computeSideDeltas(
    { possession: 50, shots: 10, shotsOnTarget: 5, passesPct: 78, corners: 6, expectedGoals: 1.8 },
    { possession: 45, shots: 9, shotsOnTarget: 3, passesPct: 76, corners: 4, expectedGoals: 1.0 }
  ),
  result: 'a',
  homeActual: { possession: 50, shots: 8, expectedGoals: 1.2 },
  awayActual: { possession: 50, shots: 10, expectedGoals: 1.8 },
});
assert.ok(Array.isArray(hyps) && hyps.length >= 1);
assert.ok(hyps.every(h => h.labeled && /分析/.test(h.text + h.tag) || h.tag));

const reviewStub = {
  home: '主队A', away: '客队B', ft: '1:2',
  angles: [
    { key: 'prediction', hasData: true, text: '赛前倾向主胜，赛果客胜，预测未命中。' },
    { key: 'process_vs_baseline', hasData: true, lines: ['主队A控球率明显低于近况均值'] },
    { key: 'hypotheses', items: [{ tag: '克制', text: '或被客队压制（分析假说）。' }] },
  ],
};
const snips = pmr.buildIntelSnippets(reviewStub);
assert.ok(snips.length >= 1 && snips.length <= 3);
assert.ok(snips[0].includes('主队A'));

const html = pmr.renderReviewHtml({
  ok: true, home: '主队A', away: '客队B', ft: '1:2', league: '英超',
  generatedAtLocal: '2026/10/16 03:00:00 CST',
  noteZh: '测试',
  deltas: { home: deltas, away: null },
  angles: reviewStub.angles.concat([
    { key: 'vs_opponent', title: '本场对位', text: '客队射门占优。', hasData: true },
    { key: 'odds', title: '赔率', text: '市场倾向主胜。', hasData: true },
    { key: 'hypotheses', title: '假说', hasData: true, items: hyps },
  ]),
});
assert.ok(html.includes('赛后复盘'));
assert.ok(html.includes('主队A'));
assert.ok(!html.includes('<script'));

assert.strictEqual(pmr.pairKey('15', '44'), pmr.pairKey('44', '15'));

console.log('post-match-review-test OK');

// 1.9.25: incomplete one-sided baseline must trigger backfill
assert.strictEqual(pmr.needsBaselineBackfill(null), false);
assert.strictEqual(pmr.needsBaselineBackfill({ ok: true, actual: {}, baselines: {}, deltas: {} }), false);
assert.strictEqual(pmr.needsBaselineBackfill({
  ok: true,
  actual: {
    home: { possession: 54, shots: 14 },
    away: { possession: 46, shots: 16 },
  },
  baselines: {
    home: null,
    away: { n: 10, averages: { possession: 49.9, shots: 17.7 } },
  },
  deltas: {
    home: { possession: { actual: 54, baseline: null, delta: null, missing: true } },
    away: { possession: { actual: 46, baseline: 49.9, delta: -3.9, missing: false } },
  },
}), true, 'Roma-like one-sided baseline should need backfill');
assert.strictEqual(pmr.needsBaselineBackfill({
  ok: true,
  actual: {
    home: { possession: 54 },
    away: { possession: 46 },
  },
  baselines: {
    home: { averages: { possession: 55 } },
    away: { averages: { possession: 50 } },
  },
  deltas: {
    home: { possession: { actual: 54, baseline: 55, delta: -1, missing: false } },
    away: { possession: { actual: 46, baseline: 50, delta: -4, missing: false } },
  },
}), false);

console.log('post-match-review-test backfill OK');
