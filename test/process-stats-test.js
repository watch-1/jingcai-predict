'use strict';
const assert = require('assert');
const ps = require('../lib/process-stats');

// 1) AF omits Passes % but provides totals → derive
{
  const st = ps.sideStats([
    { type: 'Ball Possession', value: '55%' },
    { type: 'Total Shots', value: 12 },
    { type: 'Shots on Goal', value: 4 },
    { type: 'Corner Kicks', value: 5 },
    { type: 'Total passes', value: 469 },
    { type: 'Passes accurate', value: 388 },
  ]);
  assert.strictEqual(st.passesPct, 82.7, 'derive 388/469 → 82.7');
  assert.strictEqual(st.totalPasses, 469);
  assert.strictEqual(st.passesAccurate, 388);
}

// 2) Prefer explicit Passes % when present
{
  const st = ps.sideStats([
    { type: 'Passes %', value: '84%' },
    { type: 'Total passes', value: 425 },
    { type: 'Passes accurate', value: 355 },
  ]);
  assert.strictEqual(st.passesPct, 84);
}

// 3) Alternate AF key names (Pass Accuracy / case variants)
{
  const st = ps.sideStats([
    { type: 'Pass Accuracy', value: '88%' },
    { type: 'Total Passes', value: 100 },
    { type: 'Accurate Passes', value: 50 },
  ]);
  assert.strictEqual(st.passesPct, 88);
}

// 4) Partial samples: null passesPct on some fixtures must not blank the average
{
  const samples = [
    { stats: { possession: 50, shots: 10, passesPct: null, totalPasses: 400, passesAccurate: 320, corners: 4 } },
    { stats: { possession: 60, shots: 12, passesPct: 90, corners: 6 } },
    { stats: { possession: null, shots: 8, passesPct: null, corners: null } }, // sparse fixture
  ];
  const avg = ps.computeAverages(samples);
  assert.ok(avg.passesPct != null, 'partial pass% still averages');
  // sample0 derives 80, sample1 90 → mean 85
  assert.strictEqual(avg.passesPct, 85);
  assert.strictEqual(avg.possession, 55); // skips null
  assert.strictEqual(avg.shots, 10);
  assert.strictEqual(avg.corners, 5);
}

// 5) Rolling payload enrich fills null averages from sample totals
{
  const payload = {
    ok: true,
    n: 2,
    averages: { possession: 50, shots: 10, passesPct: null, corners: 5, shotsOnTarget: 3, attacks: null, dangerousAttacks: null, expectedGoals: 1.2 },
    samples: [
      { fixtureId: 1, stats: { possession: 50, shots: 10, passesPct: null, totalPasses: 500, passesAccurate: 400, corners: 5, shotsOnTarget: 3, expectedGoals: 1.2 } },
      { fixtureId: 2, stats: { possession: 50, shots: 10, passesPct: null, totalPasses: 600, passesAccurate: 510, corners: 5, shotsOnTarget: 3, expectedGoals: 1.2 } },
    ],
  };
  const en = ps.enrichRollingPayload(payload);
  assert.ok(en.averages.passesPct != null);
  // 80 and 85 → 82.5
  assert.strictEqual(en.averages.passesPct, 82.5);
}

// 6) derivePassesPct idempotent / no divide-by-zero
{
  assert.strictEqual(ps.derivePassesPct({ totalPasses: 0, passesAccurate: 0 }).passesPct, undefined);
  const filled = ps.derivePassesPct({ passesPct: 77, totalPasses: 100, passesAccurate: 50 });
  assert.strictEqual(filled.passesPct, 77);
}

console.log('process-stats-test: ok');

// 1.9.56 SoS opponent-strength adjustment
{
  const ucl = ps.estimateOpponentStrength({ opponent: 'Bayern Munich', league: 'UEFA Champions League' });
  assert.ok(ucl && ucl.si >= 1.1, 'UCL tougher');
  const bottom = ps.estimateOpponentStrength({ opponent: 'Borussia Mönchengladbach', league: 'Bundesliga' });
  assert.ok(bottom && bottom.si <= 0.9, 'bottom domestic weaker');
  const miss = ps.estimateOpponentStrength({ opponent: 'Totally Unknown XI 999', league: 'Mystery Cup Z' });
  assert.strictEqual(miss, null, 'no invent');

  const samples = [
    { opponent: 'Bayern Munich', league: 'UEFA Champions League', stats: { shots: 8, shotsOnTarget: 2, expectedGoals: 0.8, possession: 40, passesPct: 75, corners: 2 } },
    { opponent: 'Borussia Mönchengladbach', league: 'Bundesliga', stats: { shots: 20, shotsOnTarget: 8, expectedGoals: 2.4, possession: 60, passesPct: 86, corners: 8 } },
    { opponent: 'FC Cologne', league: 'Bundesliga', stats: { shots: 12, shotsOnTarget: 4, expectedGoals: 1.2, possession: 50, passesPct: 80, corners: 4 } },
  ];
  const sos = ps.computeSosAdjustedAverages(samples);
  assert.ok(sos.ok);
  assert.ok(sos.averagesAdjusted && sos.averagesAdjusted.shots != null);
  assert.ok(/已按对手强度修正/.test(sos.noteZh));

  const sparse = ps.computeSosAdjustedAverages([
    { opponent: 'Totally Unknown XI 999', league: 'Mystery Cup Z', stats: { shots: 10 } },
  ]);
  assert.ok(!sparse.ok);
  assert.strictEqual(sparse.averagesAdjusted, null);

  const lean = ps.scoreProcessLean({
    available: true,
    home: { ok: true, n: 3, averages: ps.computeAverages(samples), averagesAdjusted: sos.averagesAdjusted, sos: { ok: true } },
    away: { ok: true, n: 3, averages: ps.computeAverages(samples), averagesAdjusted: sos.averagesAdjusted, sos: { ok: true } },
  });
  assert.strictEqual(lean.usedSos, true);
}
