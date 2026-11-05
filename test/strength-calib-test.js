'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sc = require('../lib/strength-calib');
const heat = require('../lib/heat-pitch');
const surface = require('../lib/predict-surface');
const pr = require('../lib/predict-report');

const games = [
  { gf: 2, ga: 0, oppStr: 0.95, venue: 'home' },
  { gf: 2, ga: 0, oppStr: 0.9, venue: 'home' },
  { gf: 2, ga: 0, oppStr: 0.85, venue: 'away' },
  { gf: 2, ga: 0, oppStr: 0.9, venue: 'away' },
  { gf: 2, ga: 0, oppStr: 0.92, venue: 'home' },
  { gf: 2, ga: 0, oppStr: 0.88, venue: 'away' },
];

const early = sc.calibrateSide(games, { early: true });
const warm = sc.calibrateSide(games, { early: false });
assert.strictEqual(early.rawGf, 2);
assert.ok(early.shrink < warm.shrink, 'early season shrinks the strength weight');
assert.ok(early.shrink <= sc.EARLY_SHRINK + 1e-9);
assert.ok(Math.abs(early.adjGf - early.rawGf) < Math.abs(warm.adjGf - warm.rawGf));
assert.ok(warm.adjGf > early.adjGf, 'warm adjustment moves further from raw');

const thin = sc.calibrateSide(games.slice(0, 2), { early: false });
assert.ok(thin.nOpp < 5);
assert.ok(thin.shrink < 0.5);
assert.ok(Math.abs(thin.adjGf - thin.rawGf) < Math.abs(warm.adjGf - warm.rawGf));

const bothThinAndEarly = sc.calibrateSide(games.slice(0, 2), { early: true });
assert.ok(bothThinAndEarly.shrink < thin.shrink);

const hotTable = sc.blendOppStr({
  early: true, prior: 0.2, tablePct: 0.95, eloPct: 0.9, eloGames: 10,
});
assert.strictEqual(hotTable.source, 'prior');
assert.ok(hotTable.weightTable <= 0.1);
assert.ok(hotTable.oppStr < 0.35, 'early table must not dominate a weak prior');
assert.ok(Math.abs(hotTable.oppStr - (0.2 * 0.9 + 0.95 * 0.1)) < 1e-9);

const noPrior = sc.blendOppStr({ early: true, prior: null, tablePct: 0.95, eloPct: 0.8, eloGames: 8 });
assert.strictEqual(noPrior.oppStr, null, 'early season does not use the table alone');

const warmed = sc.blendOppStr({ early: false, prior: 0.2, tablePct: 0.4, eloPct: 0.8, eloGames: 8 });
assert.strictEqual(warmed.source, 'elo');
assert.strictEqual(warmed.oppStr, 0.8);

const strongGoal = sc.adjustContribution(1, 0, 1);
const weakGoal = sc.adjustContribution(1, 0, 0);
assert.ok(strongGoal.gf > weakGoal.gf);
const concedeWeak = sc.adjustContribution(0, 1, 0);
const concedeStrong = sc.adjustContribution(0, 1, 1);
assert.ok(concedeWeak.ga > concedeStrong.ga);

assert.strictEqual(sc.contextualOppStr(0.9, { sampleLeague: '西甲', focusLeague: '英超' }), null);
const cup = sc.contextualOppStr(0.9, { sampleLeague: '欧冠', focusLeague: '英超' });
assert.ok(cup < 0.9 && cup > 0.5);

const draw = sc.eloFromResults([
  { homeId: 'A', awayId: 'B', homeGoals: 1, awayGoals: 1 },
], { homeEdge: 70 });
assert.ok(draw.elo.get('A') < 1500, 'home draw is below a 70-point home edge');
assert.ok(draw.elo.get('B') > 1500);

assert.strictEqual(sc.isEarlySeason({ roundsPlayed: 6, leagueSize: 20, oppSample: 12 }), true);
assert.strictEqual(sc.isEarlySeason({ roundsPlayed: 12, leagueSize: 20, oppSample: 6 }), true);
assert.strictEqual(sc.isEarlySeason({ roundsPlayed: 12, leagueSize: 20, oppSample: 14 }), false);

const fx = {
  id: 1,
  participants: [
    { id: 10, meta: { location: 'home' } },
    { id: 20, meta: { location: 'away' } },
  ],
  periods: [{ id: 1, description: '1st-half' }],
  ballcoordinates: Array.from({ length: 30 }, () => ({ x: 0.84, y: 0.12, period_id: 1 })),
};
const atk = heat.aggregateAttackHeat([fx], 10);
assert.strictEqual(atk.available, true);
assert.strictEqual(atk.dominant, 'left');
const paths = heat.attackPaths(atk.cells);
assert.ok(paths.length >= 1);
assert.ok(!paths.some(p => p.band === 'right' && p.share > 0.5));

const emptySvg = heat.renderFullPitchSvg({ available: false, checked: true, note: '近期完场没有落点，画不出攻防路线。' });
assert.ok(emptySvg.includes('没有落点'));
assert.ok(!/<path /.test(emptySvg));

const svg = heat.renderFullPitchSvg({
  available: true,
  homeAttack: atk,
  awayAttack: { available: false, cells: null },
  homeDefend: heat.aggregateDefenseHeat([fx], 10),
  awayDefend: heat.aggregateDefenseHeat([fx], 20),
}, { home: '红队', away: '蓝队' });
assert.ok(svg.includes('<path '));
assert.ok(svg.includes('往这边打'));
assert.ok(!/要点覆盖|Pipeline|ballCoordinates|Sportmonks/.test(svg));

const html = surface.renderPredictSurface({
  home: '红队',
  away: '蓝队',
  concl: {
    lean: 'd', pickText: '平局', conf: 0.51, lvl: ['l2', '倾向'],
    speakMode: 'amplify', _speakResolved: true, speakLabel: '',
    value: { items: [{ side: 'h', isLean: true, our: 0.42, fair: 0.36, edge: 0.06 }] },
  },
  calib: {
    ok: true,
    note: '赛季还早，对手强弱主要看上赛季名次，校准往原始进球收了一截。',
    home: { rawGf: 1.8, adjGf: 1.4, nOpp: 3, shrink: 0.21 },
    away: { rawGf: 1.1, adjGf: 1.1, nOpp: 3, shrink: 0.21 },
  },
  heat: { available: false, checked: true, note: '近期完场没有落点，画不出攻防路线。' },
  oddsEdge: {
    exp: { expH: 1.2, expA: 0.9 },
    over25: 0.46,
    rq: {
      line: -1,
      rows: [
        { lab: '让胜', model: 0.28, fair: 0.34, deltaPp: -6 },
        { lab: '让平', model: 0.27, fair: 0.28, deltaPp: -1 },
        { lab: '让负', model: 0.45, fair: 0.38, deltaPp: 7 },
      ],
    },
  },
  market: {
    p: { h: 0.45, d: 0.28, a: 0.27 },
    had: { h: 2.1, d: 3.3, a: 3.5 },
    hhad: { h: 1.9, d: 3.4, a: 3.6, goalLine: '-1' },
  },
});
assert.ok(!html.includes('pr-brief-hd'));
assert.ok(!html.includes('赛前预测'));
assert.ok(html.includes('半全场'));
assert.ok(html.includes('先不排九宫'));
assert.ok(!html.includes('pr-htft"'));
assert.ok(html.includes('伤停 / 核心'));
assert.ok(html.includes('伤停和近况核心暂时没有'));
assert.ok(html.includes('胜平负 · 模型概率'));
assert.ok(html.includes('pr-1x2'));
assert.ok(html.includes('pr-value-table'));
assert.ok(html.includes('大小球'));
assert.ok(html.includes('额外表态'));
assert.ok(html.includes('首选'));
assert.ok(html.includes('信心 51%'));
assert.ok(html.includes('不是「平局」会发生的概率'));
assert.ok(html.includes('1.8 → 校准 1.4'));
assert.ok(html.includes('让胜'));
assert.ok(html.includes('让平'));
assert.ok(html.includes('让负'));
assert.ok(!/近况积分|触发：|要点覆盖|Pipeline|pr-reasons|射正/.test(html));

const reportHtml = pr._renderHtml(
  { home: '红队', away: '蓝队' },
  {
    market: { p: { h: 0.4, d: 0.3, a: 0.3 } },
    heat: { available: false, checked: true, note: '近期完场没有落点，画不出攻防路线。' },
    strengthCalib: early && { ok: true, note: early && '赛季还早，校准往原始进球收了一截。', home: early, away: early },
  },
  {
    lean: 'h', pickText: '主胜', conf: 0.55, lvl: ['l2', '倾向'],
    speakMode: 'amplify', speakLabel: '', _speakResolved: true,
    reasons: ['双方近况接近（近况积分 21:18）'],
    risks: ['积分/排名信息不足'],
    text: '触发：过程与盘口分歧',
  }
);
assert.ok(/额外表态/.test(reportHtml));
assert.ok(!/近况积分|触发：|pr-reasons|要点覆盖/.test(reportHtml));
const sq = require('../lib/squad-source');
const coreRows = sq.scoreCores([{
  lineups: [{
    team_id: 10,
    player_id: 1,
    player_name: 'Goncalo Oliveira',
    player: { image_path: 'https://img.example/g.png' },
    details: [
      { type_id: 118, data: { value: 7.6 } },
      { type_id: 52, data: { value: 2 } },
      { type_id: 79, data: { value: 1 } },
    ],
  }],
}], 10);
assert.strictEqual(coreRows[0].name, 'Goncalo Oliveira');
assert.ok(coreRows[0].avg_rating >= 7);
const marked = sq.markCore(sq.mapSidelined([
  { participant_id: 10, player_id: 1, player: { display_name: 'Goncalo Oliveira', image_path: 'https://img.example/g.png' }, type: { name: 'Unknown Injury' } },
  { participant_id: 20, player_id: 9, player: { display_name: 'Other' }, type: { name: 'Knock' } },
], 10, 20), { home: coreRows, away: [] });
assert.strictEqual(marked[0].core, true);
assert.strictEqual(marked[0].reason, '伤病');
assert.strictEqual(marked[1].core, false);
const rich = surface.renderPredictSurface({
  home: '雷恩',
  away: '奥林匹亚科斯',
  concl: { lean: 'a', pickText: '客胜', conf: 0.7, speakMode: 'amplify', _speakResolved: true },
  squad: { available: true, sidelined: marked, cores: { home: coreRows, away: [] } },
  oddsEdge: { exp: { expH: 0.9, expA: 1.6 }, over25: 0.48 },
  market: { p: { h: 0.2, d: 0.24, a: 0.56 }, had: { h: 4.5, d: 3.4, a: 1.7 } },
  heat: { available: false, checked: true, note: '近期完场没有落点，画不出攻防路线。' },
});
assert.ok(rich.includes('pr-side core'));
assert.ok(rich.includes('pr-core-card'));
assert.ok(rich.includes('评分'));
assert.ok(rich.includes('主队近况核心'));
assert.ok(!rich.includes('Goncalo'));
assert.ok(!rich.includes('>G</i>'));
assert.ok(!rich.includes('img.example'));
assert.ok(!rich.includes('pr-brief-hd'));
assert.ok(!/触发：|要点覆盖|Pipeline|近况积分/.test(rich));
const smRich = surface.renderPredictSurface({
  home: '雷恩',
  away: '奥林匹亚科斯',
  concl: { lean: 'a', pickText: '客胜', conf: 0.7, speakMode: 'amplify', _speakResolved: true },
  squad: {
    available: true,
    sidelined: [{
      side: 'home', core: true, name: 'Goncalo Oliveira', reason: '伤病',
      image: 'https://cdn.sportmonks.com/images/soccer/players/2/18.png',
    }],
    cores: { home: [], away: [] },
    half: {
      home: { lead: 4, draw: 1, trail: 1, n: 6 },
      away: { lead: 1, draw: 2, trail: 3, n: 6 },
    },
  },
  oddsEdge: { exp: { expH: 0.9, expA: 1.6 }, over25: 0.48 },
  market: { p: { h: 0.2, d: 0.24, a: 0.56 }, had: { h: 4.5, d: 3.4, a: 1.7 } },
});
assert.ok(smRich.includes('class="pr-htft"'));
assert.ok(smRich.includes('/api/logo?url='));
assert.ok(smRich.includes('cdn.sportmonks.com'));
assert.ok(!smRich.includes('pr-brief-hd'));
assert.strictEqual(surface.htftGrid(null, smRich && {}), null);
const grid = surface.htftGrid(
  { h: 0.5, d: 0.25, a: 0.25 },
  { home: { lead: 4, draw: 1, trail: 1, n: 6 }, away: { lead: 1, draw: 2, trail: 3, n: 6 } }
);
const gridSum = Object.values(grid.cells).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(gridSum - 1) < 1e-6);
assert.strictEqual(surface.htftGrid({ h: 0.4, d: 0.3, a: 0.3 }, { home: { n: 1, lead: 1, draw: 0, trail: 0 }, away: { n: 6, lead: 1, draw: 2, trail: 3 } }), null);
const halfOnly = sq.tallyHalf([{
  participants: [
    { id: 10, meta: { location: 'home' } },
    { id: 20, meta: { location: 'away' } },
  ],
  scores: [
    { description: '1ST_HALF', score: { participant: 'home', goals: 1 } },
    { description: '1ST_HALF', score: { participant: 'away', goals: 0 } },
    { description: 'CURRENT', score: { participant: 'home', goals: 2 } },
  ],
}], 10);
assert.strictEqual(halfOnly.lead, 1);
assert.strictEqual(halfOnly.n, 1);
assert.strictEqual(sq.tallyHalf([{ scores: [] }], 10).n, 0);

assert.ok(/没有落点/.test(reportHtml));
assert.ok(/胜平负 · 模型概率/.test(reportHtml));
assert.ok(/pr-value-table/.test(reportHtml));
assert.ok(!/要点覆盖|Pipeline|触发：/.test(reportHtml));

(async () => {
  const hs = require('../lib/heat-source');
  assert.strictEqual(hs.englishName('t-machida', '町田泽维'), 'Machida Zelvia');
  const prev = process.env.DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-'));
  process.env.DATA_DIR = dir;
  const coords = Array.from({ length: 24 }, () => ({ x: 0.82, y: 0.18, period_id: 1 }));
  const fx = {
    id: 7,
    state: { short_name: 'FT' },
    starting_at: '2026-11-01 12:00:00',
    participants: [
      { id: 99, meta: { location: 'home' } },
      { id: 50, meta: { location: 'away' } },
    ],
    periods: [{ id: 1, description: '1st-half' }],
    ballcoordinates: coords,
    events: [],
  };
  let calls = 0;
  const fetchImpl = async (urlPath) => {
    calls += 1;
    const u = String(urlPath);
    if (u.includes('/teams/search/')) return { data: [{ id: 99, name: 'Machida Zelvia' }] };
    if (u.includes('/fixtures/between/')) {
      return { data: [fx, { id: 8, state: { short_name: 'NS' }, starting_at: '2026-11-08 12:00:00' }] };
    }
    if (u.includes('/fixtures/7')) return { data: fx };
    throw new Error('unexpected ' + u);
  };
  const pack = await hs.ensureTeamHeat({
    teamId: 'machida',
    nameZh: '町田泽维',
    fetchImpl,
    now: Date.parse('2026-11-05T00:00:00Z'),
  });
  assert.strictEqual(pack.sideId, 99);
  assert.strictEqual(pack.fixtures.length, 1);
  assert.ok(pack.fixtures[0].ballcoordinates.length > 0);
  const built = heat.buildMatchHeat({
    homeId: pack.sideId,
    awayId: 1,
    homeFixtures: pack.fixtures,
    awayFixtures: [],
  });
  assert.strictEqual(built.available, true);
  const drawn = heat.renderFullPitchSvg(built, { home: '町田泽维', away: '上海申花' });
  assert.ok(drawn.includes('<path '));
  assert.ok(!/Sportmonks|ballCoordinates/.test(drawn));
  const again = await hs.ensureTeamHeat({
    teamId: 'machida',
    nameZh: '町田泽维',
    fetchImpl: async () => { throw new Error('should use cache'); },
    now: Date.parse('2026-11-05T02:00:00Z'),
  });
  assert.strictEqual(again.fixtures.length, 1);
  assert.ok(calls >= 2);
  const squadPack = await sq.ensureSquad({
    matchId: 'm-ren-oly',
    homeTeamId: 'h',
    awayTeamId: 'a',
    homeZh: '雷恩',
    awayZh: '奥林匹亚科斯',
    homeSmId: 10,
    awaySmId: 20,
    homeFixtureIds: [7],
    kickoffMs: Date.parse('2026-11-04T15:30:00Z'),
    now: Date.parse('2026-11-05T00:00:00Z'),
    fetchImpl: async (urlPath) => {
      const u = String(urlPath);
      if (u.includes('/fixtures/between/')) {
        return { data: [{ id: 99, participants: [{ id: 10 }, { id: 20 }] }] };
      }
      if (u.includes('/fixtures/99')) {
        return { data: { sidelined: [{ participant_id: 10, player_id: 1, player: { display_name: 'Goncalo Oliveira' }, type: { name: 'Unknown Injury' } }] } };
      }
      if (u.includes('/fixtures/7')) {
        return { data: {
          participants: [
            { id: 10, meta: { location: 'home' } },
            { id: 30, meta: { location: 'away' } },
          ],
          scores: [
            { description: '1ST_HALF', score: { participant: 'home', goals: 2 } },
            { description: '1ST_HALF', score: { participant: 'away', goals: 0 } },
          ],
          lineups: [{ team_id: 10, player_id: 1, player_name: 'Goncalo Oliveira', details: [{ type_id: 118, data: { value: 7.4 } }, { type_id: 52, data: { value: 1 } }] }],
        } };
      }
      throw new Error(u);
    },
  });
  assert.strictEqual(squadPack.available, true);
  assert.strictEqual(squadPack.sidelined[0].core, true);
  assert.ok(squadPack.cores.home[0].avg_rating >= 7);
  assert.strictEqual(squadPack.half.home.lead, 1);
  assert.strictEqual(squadPack.half.home.n, 1);
  assert.strictEqual(squadPack.half.away.n, 0);
  if (prev == null) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prev;
  console.log('strength-calib-test OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
