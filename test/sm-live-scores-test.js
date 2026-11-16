'use strict';
const assert = require('assert');
const sm = require('../lib/sm-live-scores');

function fx(partial) {
  return Object.assign({
    id: 18445580,
    participants: [
      { id: 11, meta: { location: 'home' }, name: 'Kashima Antlers' },
      { id: 22, meta: { location: 'away' }, name: 'Yokohama F. Marinos' },
    ],
    state: { developer_name: 'INPLAY_2ND_HALF' },
    scores: [
      { description: 'CURRENT', participant_id: 11, score: { goals: 3 } },
      { description: 'CURRENT', participant_id: 22, score: { goals: 2 } },
      { description: '1ST_HALF', participant_id: 11, score: { goals: 1 } },
      { description: '1ST_HALF', participant_id: 22, score: { goals: 0 } },
    ],
    periods: [{ ticking: true, minutes: 67, extra_minute: 0, description: '2nd Half' }],
    events: [
      { type_id: 14, participant_id: 11, minute: 12, player_name: 'Suzuki' },
      { type_id: 19, participant_id: 22, minute: 40 },
    ],
  }, partial || {});
}

const got = sm.fromSm(fx());
assert.ok(got, 'fromSm');
assert.strictEqual(got.phase, '2H');
assert.strictEqual(got.phaseZh, '下半场');
assert.strictEqual(got.live, true);
assert.strictEqual(got.finished, false);
assert.strictEqual(got.homeScore, 3);
assert.strictEqual(got.awayScore, 2);
assert.strictEqual(got.full, '3:2');
assert.strictEqual(got.half, '1:0');
assert.strictEqual(got.minute, 67);
assert.strictEqual(got.source, 'sportmonks');
assert.ok(got.events.some((e) => e.kind === 'goal' && e.side === 'home' && e.minute === 12));
assert.ok(got.cards && got.cards.yellow.away === 1);
assert.strictEqual(got.smFixtureId, '18445580');

const ns = sm.fromSm(fx({ state: { developer_name: 'NS' }, scores: [], periods: [], events: [] }));
assert.strictEqual(ns.phase, 'NS');
assert.strictEqual(ns.live, false);
assert.strictEqual(ns.homeScore, null);
assert.strictEqual(ns.full, '');

const ft = sm.fromSm(fx({ state: { developer_name: 'FT' }, periods: [] }));
assert.strictEqual(ft.finished, true);
assert.strictEqual(ft.live, false);
assert.strictEqual(ft.phase, 'FT');
assert.strictEqual(ft.homeScore, 3);

// Missing scores stay empty — do not invent 0-0.
const bare = sm.fromSm(fx({ scores: [], periods: [{ ticking: true, minutes: 10 }] }));
assert.strictEqual(bare.homeScore, null);
assert.strictEqual(bare.awayScore, null);
assert.strictEqual(bare.full, '');
assert.strictEqual(bare.minute, 10);

// Sporttery official score is kept when present; SM fills the clock.
const sporttery = {
  id: '2042002', source: 'sporttery', scoreSource: 'sporttery',
  live: true, finished: false, phase: 'LIVE', phaseZh: '进行中',
  minute: null, homeScore: 3, awayScore: 2, full: '3:2', half: '1:0', cards: null,
};
const mergedClock = sm.mergeSmOverlay(sporttery, got, '2042002', true);
assert.strictEqual(mergedClock.homeScore, 3);
assert.strictEqual(mergedClock.awayScore, 2);
assert.strictEqual(mergedClock.scoreSource, 'sporttery');
assert.strictEqual(mergedClock.phase, '2H');
assert.strictEqual(mergedClock.minute, 67);
assert.ok(mergedClock.source.indexOf('sm') >= 0 || mergedClock.source === 'sporttery+sm');

// Lag: sporttery frozen 1-0, SM live 3-2 ahead → correct lag, still not invented.
const lagging = Object.assign({}, sporttery, { homeScore: 1, awayScore: 0, full: '1:0' });
const mergedLag = sm.mergeSmOverlay(lagging, got, '2042002', true);
assert.strictEqual(mergedLag.homeScore, 3);
assert.strictEqual(mergedLag.awayScore, 2);
assert.strictEqual(mergedLag.scoreSource, 'sm');

// Finished official sporttery is kept when SM is not ahead.
const officialFt = {
  id: '2042002', source: 'sporttery', live: false, finished: true,
  phase: 'FT', phaseZh: '完场', homeScore: 3, awayScore: 2, full: '3:2', half: '1:0',
};
const smFt = sm.fromSm(fx({ state: { developer_name: 'FT' }, scores: [
  { description: 'CURRENT', participant_id: 11, score: { goals: 3 } },
  { description: 'CURRENT', participant_id: 22, score: { goals: 2 } },
] }));
const keepOff = sm.mergeSmOverlay(officialFt, smFt, '2042002', false);
assert.strictEqual(keepOff.homeScore, 3);
assert.strictEqual(keepOff.scoreSource, 'sporttery');

// Id clash safety: jingcai / AF ids are never treated as SM fixture ids.
assert.strictEqual(sm.isSafeSmFixtureId('359', '359'), false, 'must not use the 竞彩 matchId as an SM fixture id');
assert.strictEqual(sm.isSafeSmFixtureId('367', '367'), false, '367 clash: Cyprus / Tottenham class of error');
assert.strictEqual(sm.isSafeSmFixtureId('', '2042002'), false);
assert.strictEqual(sm.isSafeSmFixtureId('abc', '2042002'), false);
assert.ok(sm.isSafeSmFixtureId('18445580', '2042002'), 'a distinct SM fixture id is accepted');
assert.strictEqual(sm.smFixtureIdFromMap('no-such-match'), '');

const { fmtNum, meanMetric, barRow } = require('../lib/sm-surface');
assert.strictEqual(fmtNum(-1, '%'), '—', '-1% sentinel is not shown');
assert.strictEqual(fmtNum(79, '%'), '79');
assert.strictEqual(meanMetric([{ passPct: -1 }, { passPct: 79 }], 'passPct'), 79);
assert.ok(!/-1%/.test(barRow({ label: '传球成功率', unit: '%', home: -1, away: 79 })));
assert.ok(/—/.test(barRow({ label: '传球成功率', unit: '%', home: -1, away: 79 })));
assert.ok(/79%/.test(barRow({ label: '传球成功率', unit: '%', home: -1, away: 79 })));

console.log('sm-live-scores-test OK');
