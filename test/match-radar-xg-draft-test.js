'use strict';
const assert = require('assert');
const radar = require('../lib/match-radar');

function sumOf(rows) {
  const sum = {};
  for (const r of rows) radar.accumulateRow(sum, r);
  const mins = rows.reduce((a, r) => a + Number(r.minutes || 0), 0);
  return { sum, mins, m: radar.metricsFromSum(sum, mins, 0, 0) };
}

{
  const { m } = sumOf([
    { minutes: 90, goals: 1, shots_on: 3, shots_total: 5, xg: 0.8, xgot: 1.1 },
    { minutes: 90, goals: 0, shots_on: 1, shots_total: 2, xg: 0.4, xgot: 0.2 },
  ]);
  assert.strictEqual(m.goals90, 0.5);
  assert.strictEqual(m.sot90, 2);
  assert.ok(Math.abs(m.xg90 - 0.6) < 1e-12, 'xg90 ' + m.xg90);
  assert.ok(Math.abs(m.xgot90 - 0.65) < 1e-12, 'xgot90 ' + m.xgot90);
  console.log('metricsFromSum xg90 / xgot90 OK');
}

{
  const { m } = sumOf([
    { minutes: 90, goals: 1, shots_on: 2, shots_total: 4 },
  ]);
  assert.strictEqual(m.xg90, null);
  assert.strictEqual(m.xgot90, null);
  console.log('missing xG stays null, not zero');
}

{
  assert.strictEqual(radar.useXgFinishingEnabled(), false);
  const plan = radar.rolePlan(27, 151);
  const agg = { league: '英超', m: { xg90: 0.7, sot90: 1, goals90: 0.4 } };
  const idx = { players: [{ league: '英超', minutes: 900, m: { xg90: 0.7 } }] };
  const off = radar.axesFor(plan, agg, idx);
  assert.strictEqual(off.xgMode, false);
  assert.strictEqual(off.axes, radar.HA_AXES);
  console.log('default flag keeps current axes');
}

{
  process.env.RADAR_USE_XG = '1';
  assert.strictEqual(radar.useXgFinishingEnabled(), true);
  const plan = radar.rolePlan(27, 151);
  const covered = [];
  for (let i = 0; i < 10; i++) {
    covered.push({ league: '英超', minutes: 900, m: { xg90: 0.4 + i * 0.05, sot90: 1, goals90: 0.3 } });
  }
  const idx = { players: covered };
  assert(radar.leagueHasXg(idx, '英超'));
  const hit = radar.axesFor(plan, { league: '英超', m: { xg90: 0.6 } }, idx);
  assert.strictEqual(hit.xgMode, true);
  assert.strictEqual(hit.axes, radar.HA_AXES_XG);
  const finish = hit.axes[0][2].map((p) => p[0]);
  assert.deepStrictEqual(finish, ['xg90', 'sot90', 'goals90']);
  assert.strictEqual(hit.axes[0][2][2][3], 0.5);

  const missing = radar.axesFor(plan, { league: '英超', m: { xg90: null, sot90: 1 } }, idx);
  assert.strictEqual(missing.xgMode, false);
  assert.strictEqual(missing.xgMissing, true);
  assert.strictEqual(missing.axes, radar.HA_AXES);

  const uncoveredIdx = { players: covered.map((p) => ({ ...p, league: '克甲', m: { sot90: 1 } })) };
  const uncovered = radar.axesFor(plan, { league: '克甲', m: { xg90: 0.5 } }, uncoveredIdx);
  assert.strictEqual(uncovered.xgMode, false);
  assert.strictEqual(uncovered.axes, radar.HA_AXES);

  const mid = radar.rolePlan(26, 150);
  const si = radar.axesFor(mid, { league: '英超', m: { xg90: 0.3 } }, idx);
  assert.strictEqual(si.xgMode, true);
  assert.strictEqual(si.axes, radar.SI_AXES_XG);
  const threat = si.axes.find((d) => d[0] === '前插威胁')[2].map((p) => p[0]);
  assert.deepStrictEqual(threat, ['xg90', 'shots90', 'sot90']);
  delete process.env.RADAR_USE_XG;
  console.log('RADAR_USE_XG axes + fallbacks OK');
}

{
  process.env.RADAR_USE_XG = '1';
  const me = { xg90: 1.2, sot90: 2, goals90: 0.6 };
  const pool = [
    { xg90: 0.3, sot90: 1, goals90: 0.2 },
    { xg90: 0.6, sot90: 1.5, goals90: 0.4 },
    me,
  ];
  const scored = radar.scoreAxes(me, radar.HA_AXES_XG, pool);
  assert(scored.details[0].score != null);
  const parts = Object.fromEntries(scored.details[0].parts.map((p) => [p.key, p]));
  assert.strictEqual(parts.xg90.weight, 1);
  assert.strictEqual(parts.goals90.weight, 0.5);
  assert(parts.xg90.percentile > parts.goals90.percentile - 20 || parts.xg90.percentile >= 50);
  delete process.env.RADAR_USE_XG;
  console.log('weighted 进攻终结 with xG scores OK');
}

console.log('match-radar xG draft tests passed');
