'use strict';
const assert = require('assert');
const { mergeAfOverlay, fromSporttery, fromAf } = require('../lib/live-scores');
const { scoreFromEvents, applyEventScore } = require('../lib/live-stats');

// Sporttery still 1:0 after disallowed goal; AF corrected to 0:0 in 2H
const cur = {
  id: '2042', source: 'sporttery', live: true, finished: false,
  phase: '2H', phaseZh: '下半场', minute: 69,
  homeScore: 1, awayScore: 0, full: '1:0', half: '0:0',
};
const afn = {
  phase: '2H', phaseZh: '下半场', minute: 69, live: true, finished: false,
  homeScore: 0, awayScore: 0, source: 'api-football',
};
const m = mergeAfOverlay(cur, afn, '2042', true);
assert.strictEqual(m.homeScore, 0, 'AF live score wins on VAR cancel');
assert.strictEqual(m.awayScore, 0);
assert.strictEqual(m.full, '0:0');
assert.strictEqual(m.scoreSource, 'af');

// Finished: keep sporttery
const curFt = { ...cur, live: false, finished: true, phase: 'FT', phaseZh: '完场' };
const afFt = { ...afn, live: false, finished: true, phase: 'FT', homeScore: 0, awayScore: 0 };
const m2 = mergeAfOverlay(curFt, afFt, '2042', false);
assert.strictEqual(m2.homeScore, 1, 'finished keeps sporttery');

// Events: fixture says 1:0 but only yellow cards in events → 0:0
const base = {
  live: true,
  home: { id: 10 }, away: { id: 20 },
  score: { home: 1, away: 0 },
};
const events = [
  { type: 'Card', detail: 'Yellow Card', team: { id: 10 } },
  { type: 'Var', detail: 'Goal Disallowed - Offside', team: { id: 10 } },
];
applyEventScore(base, events);
assert.strictEqual(base.score.home, 0);
assert.strictEqual(base.score.away, 0);
assert.ok(base.scoreFromEvents);

// Own goal counts for opponent
assert.deepStrictEqual(
  scoreFromEvents([{ type: 'Goal', detail: 'Own Goal', team: { id: 10 } }], 10, 20),
  { home: 0, away: 1 }
);

console.log('live-score-var-test OK');
