'use strict';
const assert = require('assert');
const pref = require('../lib/slate-prefetch');

pref.resetState();

assert.strictEqual(pref.kickoffMs({ date: '2026-11-14', time: '01:00' }), Date.parse('2026-11-14T01:00:00+08:00'));
assert.ok(Number.isFinite(pref.kickoffMs({})));

const a = { id: '1', home: 'A' };
const b = { id: '2', home: 'B' };
const c = { id: '1', home: 'A-dup' };
assert.deepStrictEqual(pref.uniqMatches([[a, b], [c, b]]).map((m) => m.id), ['1', '2']);
assert.strictEqual(pref.uniqMatches([[a, b], [c]]).find((m) => m.id === '1').home, 'A');

const calls = { squad: 0, radar: 0, surface: 0, radarGotSquad: 0, predictions: 0, facts: 0 };
const stubs = {
  squadValue: {
    async forMatch(m) {
      calls.squad += 1;
      return { ok: true, matchId: m.id, home: { ok: true, players: [] }, away: { ok: true, players: [] } };
    },
  },
  matchRadar: {
    async forMatch(m, opts) {
      calls.radar += 1;
      if (opts && opts.squad) calls.radarGotSquad += 1;
      return { ok: true, matchId: m.id };
    },
  },
  smSurface: {
    async ensureSurface(args) {
      calls.surface += 1;
      assert.ok(args.matchId);
      assert.ok(Number.isFinite(args.kickoffMs));
      if (String(args.matchId) === '2042727') return { reason: 'no-team', players: { home: [], away: [] } };
      return { reason: '', players: { home: [{}], away: [{}] } };
    },
  },
  smPredictions: {
    async ensurePredictions(args) {
      calls.predictions += 1;
      assert.ok(args.matchId);
      assert.ok(Number.isFinite(args.kickoffMs));
      if (String(args.matchId) === '2042727') return { ok: true, hasPredictions: false, reason: 'no-team' };
      return { ok: true, hasPredictions: true, wdl: { h: 0.4, d: 0.3, a: 0.3 } };
    },
  },
  smMatchfacts: {
    async ensureMatchfacts(args) {
      calls.facts += 1;
      assert.ok(args.matchId);
      if (String(args.matchId) === '2042727') return { ok: true, hasFacts: false, reason: 'no-fixture' };
      return { ok: true, hasFacts: true, reason: '' };
    },
  },
  gapMs: 0,
  reason: 'test',
};

(async () => {
  const matches = [
    { id: '2042726', date: '2026-11-13', time: '20:00', home: '新加坡', away: '巴拉圭', homeTeamId: '917', awayTeamId: '418' },
    { id: '2042727', date: '2026-11-14', time: '01:00', home: '摩尔多瓦', away: '哈萨克', homeTeamId: '33', awayTeamId: '34' },
  ];
  const st = await pref.warmSlate(matches, stubs);
  assert.strictEqual(st.n, 2);
  assert.strictEqual(st.ok, 2);
  assert.strictEqual(st.fail, 0);
  assert.strictEqual(st.skippedRun, undefined);
  assert.strictEqual(calls.squad, 2);
  assert.strictEqual(calls.radar, 2);
  assert.strictEqual(calls.radarGotSquad, 2);
  assert.strictEqual(calls.surface, 2);
  assert.strictEqual(calls.predictions, 2);
  assert.strictEqual(calls.facts, 2);
  assert.strictEqual(st.rows[0].squad, 'ok');
  assert.strictEqual(st.rows[0].facts, 'ok');
  assert.strictEqual(st.rows[0].radar, 'ok');
  assert.strictEqual(st.rows[0].surface, 'ok');
  assert.strictEqual(st.rows[0].predictions, 'ok');
  assert.strictEqual(st.rows[1].surface, 'no-team');
  assert.strictEqual(st.rows[1].predictions, 'no-team');
  assert.strictEqual(st.rows[1].facts, 'no-fixture');
  assert.ok(st.rows[1].surface !== 'fail', 'honest no-team is a warmed empty, not a failure');

  // overlapping run is skipped
  let released;
  const hold = new Promise((resolve) => { released = resolve; });
  const blocking = {
    ...stubs,
    reason: 'hold',
    squadValue: {
      async forMatch(m) { await hold; return stubs.squadValue.forMatch(m); },
    },
  };
  pref.resetState();
  const firstP = pref.warmSlate([matches[0]], blocking);
  const skip = await pref.warmSlate([matches[0]], { ...stubs, reason: 'skip', gapMs: 0 });
  assert.strictEqual(skip.skippedRun, true);
  released();
  const first = await firstP;
  assert.strictEqual(first.n, 1);
  assert.ok(!first.skippedRun);

  const ps = pref.status();
  assert.strictEqual(ps.running, false);
  assert.strictEqual(ps.reason, 'hold');

  pref.resetState();
  calls.squad = calls.radar = calls.surface = calls.predictions = calls.facts = 0;
  const noPred = Object.assign({}, stubs, { smPredictions: { /* no ensurePredictions */ }, reason: 'no-pred-mod', gapMs: 0 });
  const skipped = await pref.warmSlate([matches[0]], noPred);
  assert.strictEqual(skipped.ok, 1);
  assert.strictEqual(skipped.fail, 0);
  assert.strictEqual(skipped.rows[0].predictions, 'skipped');
  assert.strictEqual(calls.predictions, 0);

  calls.squad = calls.radar = calls.surface = calls.predictions = calls.facts = 0;
  const noFacts = Object.assign({}, stubs, { smMatchfacts: { /* no ensureMatchfacts */ }, reason: 'no-facts-mod', gapMs: 0 });
  const skippedFacts = await pref.warmSlate([matches[0]], noFacts);
  assert.strictEqual(skippedFacts.ok, 1);
  assert.strictEqual(skippedFacts.fail, 0);
  assert.strictEqual(skippedFacts.rows[0].facts, 'skipped');
  assert.strictEqual(calls.facts, 0);

  console.log('slate-prefetch-test ok', { n: st.n, ok: st.ok, surfaces: st.rows.map((r) => r.surface) });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
