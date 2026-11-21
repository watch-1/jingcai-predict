'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pred = require('../lib/sm-predictions');

assert.strictEqual(typeof pred.pct01, 'function');
assert.ok(Math.abs(pred.pct01(34.9) - 0.349) < 1e-12);
assert.strictEqual(pred.pct01(null), null);
assert.strictEqual(pred.pct01(-1), null);

const santosPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/santos-compare/ww-after/predictions-probabilities-by-fixture.json'
);
const santosFxPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/santos-compare/ww-after/predictions-fixture-include.json'
);
const walesPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/portugal-dump/predictions-probabilities.json'
);
const walesFxPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/portugal-dump/predictions-include.json'
);

if (!fs.existsSync(santosPath)) {
  console.log('sm-predictions: Santos dump missing, skipped fixture parse');
  process.exit(0);
}

const santosRaw = JSON.parse(fs.readFileSync(santosPath, 'utf8'));
const pack = pred.buildPackFromPayload(santosRaw, {
  matchId: 'test-santos',
  home: '桑托斯',
  away: '弗鲁米嫩塞',
  now: Date.now(),
});

assert.strictEqual(pack.ok, true);
assert.strictEqual(pack.hasPredictions, true);
assert.strictEqual(pack.smFixtureId, 19621732);
assert.ok(pack.wdl, 'Fulltime Result should be present');
assert.ok(Math.abs(pack.wdl.h - 0.349) < 1e-12, 'FT home 34.9');
assert.ok(Math.abs(pack.wdl.d - 0.2459) < 1e-12, 'FT draw 24.59');
assert.ok(Math.abs(pack.wdl.a - 0.4051) < 1e-12, 'FT away 40.51');
assert.ok(pack.btts, 'BTTS should be present');
assert.ok(Math.abs(pack.btts.yes - 0.5929) < 1e-12, 'BTTS yes 59.29');
assert.ok(pack.ou25, 'O/U 2.5 should be present');
assert.ok(Math.abs(pack.ou25.over - 0.5542) < 1e-12, 'O/U 2.5 over 55.42');
assert.ok(Math.abs(pack.ou25.under - 0.4458) < 1e-12, 'O/U 2.5 under 44.58');
assert.ok(Array.isArray(pack.correctScore) && pack.correctScore.length > 0, 'correct score list');
const cs11 = pack.correctScore.find((s) => s.score === '1-1');
assert.ok(cs11, 'CS 1-1 present');
assert.ok(Math.abs(cs11.p - 0.1152) < 1e-12, 'CS 1-1 at 11.52');
assert.strictEqual(pack.correctScore.length, 6);
assert.ok(pack.scores, 'full correct-score map');
assert.strictEqual(Object.keys(pack.scores).length, 19);
assert.ok(Math.abs(pack.scores['1-1'] - 0.1152) < 1e-12);
assert.ok(Math.abs(pack.scores['Other_1'] - 0.0457) < 1e-12);
assert.ok(Math.abs(pack.scores['Other_2'] - 0.0629) < 1e-12);
assert.ok(Math.abs(pack.scores['Other_X'] - 0.0004) < 1e-12);
assert.strictEqual(pack.hhadPred, null, 'no official line → no derived HHAD');
assert.ok(pack.hafu && Math.abs(pack.hafu.hh - 0.2131) < 1e-12);
assert.ok(pack.firstHalf && Math.abs(pack.firstHalf.h - 0.3044) < 1e-12);
assert.ok(pack.doubleChance && Math.abs(pack.doubleChance.ha - 0.7541) < 1e-12);
assert.ok(pack.totals && pack.totals.s2 > 0, 'CS totals aggregated');
assert.ok(Array.isArray(pack.corners) && pack.corners.some((c) => c.line === 8));
assert.ok(!('_raw' in pack), 'pack must not carry _raw');

assert.strictEqual(typeof pred.deriveHhad, 'function');
assert.strictEqual(pred.deriveHhad(null, -1), null);
assert.strictEqual(pred.deriveHhad({}, -1), null);
assert.strictEqual(pred.deriveHhad(pack.scores, null), null);
assert.strictEqual(pred.deriveHhad(pack.correctScore, -1), null, 'top-6 list is not enough to derive HHAD');

function near(a, b, eps) {
  assert.ok(Math.abs(a - b) < (eps || 1e-6), 'expected ' + b + ' got ' + a);
}

// Santos official-style 主队让 1 球 (goalLine = -1)
// Listed only: 让胜 11.18, 让平 19.15, 让负 65.10; Other_1 4.57 unassigned.
const hhadM1 = pred.deriveHhad(pack.scores, -1);
assert.ok(hhadM1, 'coverage should clear 0.90 with Other_1 unassigned');
assert.strictEqual(hhadM1.source, 'correct-score');
assert.strictEqual(hhadM1.goalLine, -1);
near(hhadM1.coverage, 0.9543);
near(hhadM1.unassigned, 0.0457);
near(hhadM1.h, 0.1118 / 0.9543);
near(hhadM1.d, 0.1915 / 0.9543);
near(hhadM1.a, 0.6510 / 0.9543);
near(hhadM1.h, 0.1172, 5e-5);
near(hhadM1.d, 0.2007, 5e-5);
near(hhadM1.a, 0.6822, 5e-5);

const packedM1 = pred.buildPackFromPayload(santosRaw, {
  matchId: 'test-santos-hhad',
  home: '桑托斯',
  away: '弗鲁米嫩塞',
  now: Date.now(),
  goalLine: -1,
});
assert.ok(packedM1.hhadPred);
assert.strictEqual(packedM1.hhadPred.goalLine, -1);
assert.strictEqual(packedM1.correctScore.length, 6);
near(packedM1.hhadPred.h, hhadM1.h, 1e-12);
near(packedM1.hhadPred.d, hhadM1.d, 1e-12);
near(packedM1.hhadPred.a, hhadM1.a, 1e-12);
const cs11b = packedM1.correctScore.find((s) => s.score === '1-1');
assert.ok(cs11b && Math.abs(cs11b.p - 0.1152) < 1e-12);

// gl = 0 must follow the same scores (1X2 from CS), not pack.wdl
const hhad0 = pred.deriveHhad(pack.scores, 0);
assert.ok(hhad0);
assert.strictEqual(hhad0.goalLine, 0);
near(hhad0.coverage, 1);
near(hhad0.unassigned, 0);
near(hhad0.h, pack.scores['1-0'] + pack.scores['2-0'] + pack.scores['2-1'] + pack.scores['3-0'] + pack.scores['3-1'] + pack.scores['3-2'] + pack.scores['Other_1']);
near(hhad0.d, pack.scores['0-0'] + pack.scores['1-1'] + pack.scores['2-2'] + pack.scores['3-3'] + pack.scores['Other_X']);
near(hhad0.a, pack.scores['0-1'] + pack.scores['0-2'] + pack.scores['0-3'] + pack.scores['1-2'] + pack.scores['1-3'] + pack.scores['2-3'] + pack.scores['Other_2']);

// gl = +1: Other_2 is ambiguous (away win-by-1 让平 vs win-by-2+ 让负)
const hhadP1 = pred.deriveHhad(pack.scores, 1);
assert.ok(hhadP1);
assert.strictEqual(hhadP1.goalLine, 1);
near(hhadP1.unassigned, 0.0629);
assert.ok(hhadP1.coverage + 1e-12 >= pred.HHAD_COVERAGE_MIN);
const winBy1 = pack.scores['0-1'] + pack.scores['1-2'] + pack.scores['2-3'];
const winBy2p = pack.scores['0-2'] + pack.scores['0-3'] + pack.scores['1-3'];
const homeAndDraw = hhad0.h + hhad0.d; // home wins + draws, including Other_1 / Other_X
near(hhadP1.coverage, homeAndDraw + winBy1 + winBy2p);
near(hhadP1.h, homeAndDraw / hhadP1.coverage);
near(hhadP1.d, winBy1 / hhadP1.coverage);
near(hhadP1.a, winBy2p / hhadP1.coverage);


if (fs.existsSync(santosFxPath)) {
  const fxRaw = JSON.parse(fs.readFileSync(santosFxPath, 'utf8'));
  const fxPack = pred.buildPackFromPayload(fxRaw, {
    matchId: 'test-santos-fx',
    home: '桑托斯',
    away: '弗鲁米嫩塞',
    now: Date.now(),
  });
  assert.strictEqual(fxPack.hasPredictions, true);
  assert.ok(Math.abs(fxPack.wdl.h - 0.349) < 1e-12, 'fixture-include FT home 34.9');
  assert.ok(Math.abs(fxPack.btts.yes - 0.5929) < 1e-12, 'fixture-include BTTS yes');
  const fxCs = fxPack.correctScore.find((s) => s.score === '1-1');
  assert.ok(fxCs && Math.abs(fxCs.p - 0.1152) < 1e-12);
}

if (fs.existsSync(walesPath)) {
  const walesRaw = JSON.parse(fs.readFileSync(walesPath, 'utf8'));
  const empty = pred.buildPackFromPayload(walesRaw, {
    matchId: 'test-007',
    home: '威尔士',
    away: '葡萄牙',
    now: Date.now(),
  });
  assert.strictEqual(empty.hasPredictions, false, 'empty probabilities must not invent numbers');
  assert.strictEqual(empty.wdl, null);
  assert.strictEqual(empty.btts, null);
  assert.strictEqual(empty.ou25, null);
  assert.strictEqual(empty.correctScore, null);
  assert.strictEqual(empty.scores, null);
  assert.strictEqual(empty.hhadPred, null, 'empty pack must not invent 让球预测');
  assert.strictEqual(pred.deriveHhad(empty.scores, -1), null);
  assert.strictEqual(empty.totals, null);
  assert.strictEqual(empty.hafu, null);
  assert.strictEqual(empty.firstHalf, null);
  assert.strictEqual(empty.doubleChance, null);
  assert.strictEqual(empty.corners, null);
  assert.notStrictEqual(empty.reason, '');
}

if (fs.existsSync(walesFxPath)) {
  const walesFx = JSON.parse(fs.readFileSync(walesFxPath, 'utf8'));
  const emptyFx = pred.buildPackFromPayload(walesFx, {
    matchId: 'test-007-fx',
    home: '威尔士',
    away: '葡萄牙',
    now: Date.now(),
  });
  assert.strictEqual(emptyFx.hasPredictions, false, 'empty fixture-include predictions must not invent numbers');
  assert.strictEqual(emptyFx.wdl, null);
  assert.strictEqual(emptyFx.btts, null);
  assert.strictEqual(emptyFx.ou25, null);
  assert.strictEqual(emptyFx.correctScore, null);
  assert.strictEqual(emptyFx.scores, null);
  assert.strictEqual(emptyFx.hhadPred, null);
}

const blank = pred.buildPackFromPayload({ data: [] }, { matchId: 'x', home: '甲', away: '乙' });
assert.strictEqual(blank.hasPredictions, false);
assert.strictEqual(blank.wdl, null);
assert.strictEqual(blank.scores, null);
assert.strictEqual(blank.hhadPred, null);
assert.strictEqual(blank.ok, true);

/* ----- close-of-betting snapshot helpers ----- */
const os = require('os');
const closeMs = Date.parse('2026-11-18T03:40:00+08:00');
const kickMs = Date.parse('2026-11-18T03:45:00+08:00');

assert.strictEqual(pred.parseBeijingMs('2026-11-18', '03:45'), kickMs);
assert.strictEqual(
  pred.officialCloseMsOf({ poolCloseDate: '2026-11-18', poolCloseTime: '03:40:00' }),
  closeMs,
  'canonical poolCloseDate+poolCloseTime'
);
assert.ok(!Number.isFinite(pred.officialCloseMsOf({ date: '2026-11-18', time: '03:45' })),
  'do not invent a close time from kickoff fields');
assert.strictEqual(pred.isClosedStatus('Close'), true);
assert.strictEqual(pred.isClosedStatus('停售'), true);
assert.strictEqual(pred.isClosedStatus('Payout'), true);
assert.strictEqual(pred.isClosedStatus('Selling'), false);
assert.strictEqual(pred.isClosedStatus('在售'), false);

const preClose = pred.resolveFreeze({
  date: '2026-11-18', time: '03:45',
  poolCloseDate: '2026-11-18', poolCloseTime: '03:40',
  status: 'Selling',
}, closeMs - 60 * 1000);
assert.strictEqual(preClose.frozen, false, 'still open before official close');

const atClose = pred.resolveFreeze({
  date: '2026-11-18', time: '03:45',
  poolCloseDate: '2026-11-18', poolCloseTime: '03:40',
  status: 'Selling',
}, closeMs);
assert.strictEqual(atClose.frozen, true);
assert.strictEqual(atClose.reason, 'sporttery-close');
assert.strictEqual(atClose.closeMs, closeMs);

const statusClose = pred.resolveFreeze({
  date: '2026-11-18', time: '03:45',
  kickoffMs: kickMs,
  poolStatus: 'Close',
}, closeMs - 5 * 60 * 1000);
assert.strictEqual(statusClose.frozen, true, 'official Close status freezes even before kickoff');
assert.strictEqual(statusClose.reason, 'sporttery-close');

const koFallback = pred.resolveFreeze({
  date: '2026-11-18', time: '03:45',
  status: 'Selling',
}, kickMs);
assert.strictEqual(koFallback.frozen, true);
assert.strictEqual(koFallback.reason, 'kickoff-fallback', 'missing official close time falls back to kickoff');

const beforeKo = pred.resolveFreeze({
  date: '2026-11-18', time: '03:45',
  status: 'Selling',
}, kickMs - 1000);
assert.strictEqual(beforeKo.frozen, false, 'still open before kickoff when close time is missing');

/* ----- disk cache: keep last good, freeze, honest empty ----- */
const tmpPred = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-sm-pred-'));
process.env.DATA_DIR = tmpPred;

const FT_ROWS = [
  { type_id: 237, predictions: { home: 62.1, draw: 22.2, away: 15.7 } },
];
const FT_ROWS_LIVE = [
  { type_id: 237, predictions: { home: 10, draw: 20, away: 70 } },
];

function predOpts(extra) {
  return Object.assign({
    matchId: '2042836',
    smFixtureId: 19676698,
    home: '爱尔兰',
    away: '科索沃',
    date: '2026-11-18',
    time: '03:45',
    kickoffMs: kickMs,
  }, extra || {});
}

function emptyFetch() {
  return async (url) => {
    const u = String(url);
    if (u.includes('/football/predictions/probabilities/fixtures/')) return { data: [] };
    if (/\/football\/fixtures\//.test(u)) return { data: { id: 19676698, predictions: [] } };
    throw new Error('unexpected url ' + u);
  };
}

function rowsFetch(rows) {
  return async (url) => {
    const u = String(url);
    if (u.includes('/football/predictions/probabilities/fixtures/')) return { data: rows };
    if (/\/football\/fixtures\//.test(u)) return { data: { id: 19676698, predictions: rows } };
    throw new Error('unexpected url ' + u);
  };
}

(async () => {
  const mid = '2042836';
  const preNow = closeMs - 20 * 60 * 1000;

  const first = await pred.ensurePredictions(predOpts({
    now: preNow,
    status: 'Selling',
    fetchImpl: rowsFetch(FT_ROWS),
  }));
  assert.strictEqual(first.hasPredictions, true);
  assert.ok(!first.frozenAt, 'pre-close pack is not frozen yet');
  assert.ok(Math.abs(first.wdl.h - 0.621) < 1e-12);

  // FT / post-close empty must keep the last good snapshot
  const afterFt = await pred.ensurePredictions(predOpts({
    now: kickMs + 4 * 3600 * 1000,
    status: 'Payout',
    force: true,
    fetchImpl: emptyFetch(),
  }));
  assert.strictEqual(afterFt.hasPredictions, true, 'keep last good when FT API is empty');
  assert.ok(Math.abs(afterFt.wdl.h - 0.621) < 1e-12, 'numbers unchanged after empty FT refetch');
  assert.strictEqual(afterFt.frozenReason, 'sporttery-close');
  assert.ok(afterFt.frozenAt);
  const disk1 = JSON.parse(fs.readFileSync(path.join(tmpPred, 'sm-predictions', mid + '.json'), 'utf8'));
  assert.strictEqual(disk1.hasPredictions, true);
  assert.ok(Math.abs(disk1.wdl.h - 0.621) < 1e-12);
  assert.strictEqual(disk1.reason, '', 'disk must not be overwritten with no-predictions');

  // Post-close refetch with different SM numbers must not change the snapshot
  const later = await pred.ensurePredictions(predOpts({
    now: kickMs + 5 * 3600 * 1000,
    status: 'Payout',
    force: true,
    fetchImpl: rowsFetch(FT_ROWS_LIVE),
  }));
  assert.ok(Math.abs(later.wdl.h - 0.621) < 1e-12, 'post-close refetch does not change numbers');
  assert.ok(Math.abs(later.wdl.a - 0.157) < 1e-12);
  assert.strictEqual(later.frozenReason, 'sporttery-close');
  assert.ok(!later.scores, 'FT-only snapshot has no full score map');
  assert.ok(!later.hhadPred, 'do not invent 让球预测 from wdl');

  // Freeze at official close, even if kickoff has not arrived
  const midClose = '2042837';
  const closed = await pred.ensurePredictions(predOpts({
    matchId: midClose,
    now: closeMs,
    date: '2026-11-18',
    time: '03:45',
    kickoffMs: kickMs,
    poolCloseDate: '2026-11-18',
    poolCloseTime: '03:40',
    status: 'Selling',
    fetchImpl: rowsFetch(FT_ROWS),
  }));
  assert.strictEqual(closed.hasPredictions, true);
  assert.strictEqual(closed.frozenReason, 'sporttery-close');
  assert.strictEqual(closed.frozenCloseMs, closeMs);

  const closedAgain = await pred.ensurePredictions(predOpts({
    matchId: midClose,
    now: closeMs + 30 * 1000,
    kickoffMs: kickMs,
    poolCloseDate: '2026-11-18',
    poolCloseTime: '03:40',
    force: true,
    fetchImpl: rowsFetch(FT_ROWS_LIVE),
  }));
  assert.ok(Math.abs(closedAgain.wdl.h - 0.621) < 1e-12, 'after official close, SM in-play change is ignored');

  // Pre-close updates are still allowed
  const midLive = '2042838';
  const open1 = await pred.ensurePredictions(predOpts({
    matchId: midLive,
    now: closeMs - 30 * 60 * 1000,
    kickoffMs: kickMs,
    poolCloseDate: '2026-11-18',
    poolCloseTime: '03:40',
    status: 'Selling',
    fetchImpl: rowsFetch(FT_ROWS),
  }));
  assert.ok(!open1.frozenAt);
  const open2 = await pred.ensurePredictions(predOpts({
    matchId: midLive,
    now: closeMs - 10 * 60 * 1000,
    kickoffMs: kickMs,
    poolCloseDate: '2026-11-18',
    poolCloseTime: '03:40',
    status: 'Selling',
    force: true,
    fetchImpl: rowsFetch(FT_ROWS_LIVE),
  }));
  assert.ok(Math.abs(open2.wdl.h - 0.10) < 1e-12, 'pre-close refresh may update numbers');
  assert.ok(!open2.frozenAt);

  // Missing snapshot stays honest empty; do not invent
  const midEmpty = '2042999';
  const missing = await pred.ensurePredictions(predOpts({
    matchId: midEmpty,
    now: kickMs + 6 * 3600 * 1000,
    status: 'Payout',
    fetchImpl: emptyFetch(),
  }));
  assert.strictEqual(missing.hasPredictions, false, 'missing snapshot stays honest empty');
  assert.strictEqual(missing.wdl, null);
  assert.ok(!missing.frozenAt, 'empty pack is not marked as a prediction snapshot');
  assert.strictEqual(missing.reason, 'no-predictions');
  const diskEmpty = JSON.parse(fs.readFileSync(path.join(tmpPred, 'sm-predictions', midEmpty + '.json'), 'utf8'));
  assert.strictEqual(diskEmpty.hasPredictions, false);
  assert.strictEqual(diskEmpty.wdl, null);

  // Kickoff fallback freeze when official close fields are absent
  const midKo = '2042840';
  const preKo = await pred.ensurePredictions(predOpts({
    matchId: midKo,
    now: kickMs - 5 * 60 * 1000,
    status: 'Selling',
    fetchImpl: rowsFetch(FT_ROWS),
  }));
  assert.ok(!preKo.frozenAt);
  const postKo = await pred.ensurePredictions(predOpts({
    matchId: midKo,
    now: kickMs + 1000,
    status: 'Selling',
    force: true,
    fetchImpl: rowsFetch(FT_ROWS_LIVE),
  }));
  assert.strictEqual(postKo.frozenReason, 'kickoff-fallback');
  assert.ok(Math.abs(postKo.wdl.h - 0.621) < 1e-12, 'kickoff fallback keeps last pre-kick numbers');

  console.log('sm-predictions-test ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
