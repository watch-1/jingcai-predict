const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const surface = require('../lib/sm-surface');

const fx = (id, teamId, opp, shots, rating) => ({
  id,
  participants: [
    { id: teamId, meta: { location: 'home' } },
    { id: opp, meta: { location: 'away' } },
  ],
  statistics: [
    { type_id: 45, participant_id: teamId, data: { value: 60 }, location: 'home', type: { code: 'ball-possession' } },
    { type_id: 42, participant_id: teamId, data: { value: shots }, location: 'home', type: { code: 'shots-total' } },
    { type_id: 86, participant_id: teamId, data: { value: 4 }, location: 'home', type: { code: 'shots-on-target' } },
    { type_id: 34, participant_id: teamId, data: { value: 5 }, location: 'home', type: { code: 'corners' } },
    { type_id: 56, participant_id: teamId, data: { value: 11 }, location: 'home', type: { code: 'fouls' } },
    { type_id: 84, participant_id: teamId, data: { value: 2 }, location: 'home', type: { code: 'yellowcards' } },
  ],
  lineups: [{
    team_id: teamId,
    player_id: 7,
    player_name: 'Griezmann',
    jersey_number: 7,
    player: { image_path: 'https://cdn.sportmonks.com/images/soccer/players/7/7.png' },
    details: [
      { type_id: 118, data: { value: rating } },
      { code: 'minutes-played', value: 80 },
      { type_id: 42, data: { value: 3 } },
      { type_id: 80, data: { value: 20 } },
      { code: 'accurate-passes', value: 16 },
      { type_id: 78, data: { value: 1 } },
      { type_id: 52, data: { value: 1 } },
      { type_id: 79, data: { value: 0 } },
    ],
  }],
});

const players = surface.aggregatePlayers([fx(1, 10, 99, 12, 7.4), fx(2, 10, 98, 8, 7.0)], 10);
assert.strictEqual(players.length, 1);
assert.strictEqual(players[0].name, 'Griezmann');
assert.strictEqual(players[0].label, '近2场有数据');
assert.strictEqual(players[0].goals, 2);
assert.strictEqual(players[0].passPct, 80);
assert.ok(players[0].rating > 7);
assert.strictEqual(surface.aggregatePlayers([{ lineups: [{ team_id: 10, player_id: 1, details: [] }] }], 10).length, 0);

const bars = surface.barsFromSides(
  { fixtures: [fx(1, 10, 99, 12, 7), fx(2, 10, 98, 8, 7)] },
  { fixtures: [fx(3, 20, 97, 6, 6.5)] },
  10,
  20,
  '近况场均',
);
assert.strictEqual(bars.mode, '近况场均');
const poss = bars.rows.find(r => r.label === '控球率');
const shots = bars.rows.find(r => r.label === '射门');
assert.strictEqual(poss.home, 60);
assert.strictEqual(shots.home, 10);
assert.strictEqual(shots.away, 6);
const live = surface.currentBars({
  statistics: [
    { type_id: 45, participant_id: 10, data: { value: 55 }, location: 'home' },
    { type_id: 45, participant_id: 20, data: { value: 45 }, location: 'away' },
  ],
}, 10, 20);
assert.strictEqual(live.mode, '本场');
assert.strictEqual(live.rows[0].home, 55);

const html = surface.renderFormHtml({ players: { home: players, away: [] } });
const barHtml = surface.renderBarsHtml({ bars });
assert.ok(html.includes('ps-row'));
assert.ok(html.includes('/api/logo?url='));
assert.ok(html.includes('近2场有数据'));
assert.ok(barHtml.includes('控球率'));
assert.ok(barHtml.includes('stat-row'));
assert.ok(!/触发：|要点覆盖|Pipeline|近况积分/.test(html + barHtml));
assert.ok(surface.renderBarsHtml({ bars: { rows: [] }, barNote: '近期完场没有这项统计。' }).includes('没有这项统计'));

(async () => {
  const prev = process.env.DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-'));
  process.env.DATA_DIR = dir;
  const calls = [];
  const fetchImpl = async (urlPath) => {
    const u = String(urlPath);
    calls.push(u);
    if (u.includes('/fixtures/between/') && u.includes('/10')) {
      return { data: [
        { id: 1, state: { short_name: 'FT' }, starting_at: '2026-11-01', participants: [{ id: 10 }, { id: 99 }] },
        { id: 2, state: { short_name: 'FT' }, starting_at: '2026-10-20', participants: [{ id: 10 }, { id: 98 }] },
      ] };
    }
    if (u.includes('/fixtures/between/') && u.includes('/20')) {
      return { data: [
        { id: 3, state: { short_name: 'FT' }, starting_at: '2026-11-02', participants: [{ id: 20 }, { id: 97 }] },
      ] };
    }
    if (u.includes('/fixtures/1')) return { data: fx(1, 10, 99, 12, 7.4) };
    if (u.includes('/fixtures/2')) return { data: fx(2, 10, 98, 8, 7.0) };
    if (u.includes('/fixtures/3')) return { data: fx(3, 20, 97, 6, 6.8) };
    if (u.includes('/fixtures/between/')) return { data: [] };
    throw new Error(u);
  };
  const pack = await surface.ensureSurface({
    matchId: 'm1',
    homeSmId: 10,
    awaySmId: 20,
    homeZh: '马竞',
    awayZh: '拜仁',
    kickoffMs: Date.parse('2026-11-05T12:00:00Z'),
    fetchImpl,
    now: Date.parse('2026-11-05T00:00:00Z'),
  });
  assert.strictEqual(pack.players.home[0].name, 'Griezmann');
  assert.ok(pack.bars.rows.some(r => r.label === '射正'));
  assert.strictEqual(pack.bars.mode, '近况场均');
  const again = await surface.ensureSurface({
    matchId: 'm1',
    homeSmId: 10,
    awaySmId: 20,
    fetchImpl: async () => { throw new Error('cache'); },
    now: Date.parse('2026-11-05T01:00:00Z'),
  });
  assert.strictEqual(again.players.home.length, 1);

  const hs = require('../lib/heat-source');
  const heat = await hs.ensureTeamHeat({
    teamId: 'shenhua',
    nameZh: '上海申花',
    fetchImpl: async (urlPath) => {
      const u = String(urlPath);
      if (u.includes('/teams/search/')) return { data: [{ id: 77, name: 'Shanghai Shenhua' }] };
      if (u.includes('/fixtures/between/')) return { data: [{ id: 5, state: { short_name: 'FT' }, starting_at: '2026-10-01' }] };
      if (u.includes('/fixtures/5')) return { data: { id: 5, participants: [], ballcoordinates: [], periods: [], events: [] } };
      throw new Error(u);
    },
    now: Date.parse('2026-11-05T00:00:00Z'),
  });
  assert.deepStrictEqual(heat.recentIds, [5]);
  assert.strictEqual(heat.fixtures.length, 0);

  const sq = require('../lib/squad-source');
  const seen = [];
  await sq.ensureSquad({
    matchId: 'machida',
    homeSmId: 10,
    awaySmId: 20,
    homeZh: '町田泽维',
    awayZh: '上海申花',
    kickoffMs: Date.parse('2026-11-08T12:00:00Z'),
    now: Date.parse('2026-11-05T00:00:00Z'),
    fetchImpl: async (urlPath) => {
      const u = String(urlPath);
      seen.push(u);
      if (u.includes('/fixtures/between/')) return { data: [] };
      throw new Error(u);
    },
  });
  assert.ok(seen.some(u => u.includes('/10')));
  assert.ok(seen.some(u => u.includes('/20')));
  if (prev == null) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prev;
  console.log('sm-surface-test OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
