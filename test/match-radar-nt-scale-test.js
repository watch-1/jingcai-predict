'use strict';
const assert = require('assert');
const radar = require('../lib/match-radar');

{
  assert.strictEqual(radar.isCompetitiveNt('欧国联'), true);
  assert.strictEqual(radar.isCompetitiveNt('国际友谊赛'), false);
  assert.strictEqual(radar.isCompetitiveNt('Friendly'), false);
  assert.strictEqual(radar.isCompetitiveNt('世界杯预选赛'), true);
  console.log('isCompetitiveNt filters friendlies');
}

{
  const thin = radar.scoreNtPlayerForm({}, null, [
    { competition: '欧国联', minutes: 90, goals: 1 },
  ]);
  assert.strictEqual(thin.ok, false);
  assert.ok(thin.noteZh.includes('暂无'));

  const rows = [];
  for (let i = 0; i < 4; i++) {
    rows.push({ competition: '欧国联', minutes: 90, goals: 1, shots_on: 2 });
  }
  const form = radar.scoreNtPlayerForm({ smId: 1, name: 'A', posId: 27, dpos: 151 }, null, rows);
  assert.strictEqual(form.ok, false, 'no forced true-level hex when NT peer pool is missing');
  assert.strictEqual(form.chartKind, 'nt-form');
  assert.ok(form.windowLabel.includes('4 场'));
  assert.ok(form.windowLabel.includes('360'));
  assert.ok(form.noteZh.includes('不含友谊赛'));
  console.log('NT player form stays 暂无 without a peer pool');
}

{
  const cmp = radar.shootingCompare({ xg90: 0.6, xgot90: 0.7, goals90: 0.4 });
  assert.strictEqual(cmp.xg90, 0.6);
  assert.ok(cmp.noteZh.includes('不单独占六围轴'));
  assert.strictEqual(radar.shootingCompare({ goals90: 0.4 }), null);
  console.log('shootingCompare is 对照 only');
}

{
  delete process.env.RADAR_USE_XG;
  const team = {
    ok: true,
    kind: 'best-xi',
    home: { ok: true, scores: [100, 80, 70, 60, 50, 40], details: [] },
    away: { ok: true, scores: [50, 40, 30, 20, 10, 0], details: [] },
  };
  const out = radar.applyFixedClubScale(JSON.parse(JSON.stringify(team)), { players: [] });
  assert.strictEqual(out.scale, 'relative');
  assert.deepStrictEqual(out.home.scores, team.home.scores);
  console.log('flag off keeps relative club scale');
}

{
  process.env.RADAR_USE_XG = '1';
  const team = {
    ok: true,
    kind: 'best-xi',
    home: { ok: true, scores: [100, 80], details: [] },
    away: { ok: true, scores: [50, 40], details: [] },
  };
  const out = radar.applyFixedClubScale(team, { players: [] });
  assert.strictEqual(out.scale, 'relative');
  assert.strictEqual(out.scaleHook, 'fixed-club');
  assert.ok(out.scaleNoteZh && out.scaleNoteZh.includes('样本不足'));
  delete process.env.RADAR_USE_XG;
  console.log('thin fixed-club pool falls back without breaking drawable teams');
}

console.log('match-radar NT / scale tests passed');
