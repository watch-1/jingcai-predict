'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-sm-ft-'));
process.env.DATA_DIR = tmp;
delete process.env.ALLOW_AF_HTTP;
delete process.env.API_FOOTBALL_KEY;
delete process.env.APISPORTS_KEY;

const origFetch = global.fetch;
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('v3.football.api-sports.io')) {
    throw new Error('API-Football HTTP is disabled on live paths: ' + u);
  }
  if (typeof origFetch === 'function') return origFetch(url);
  return { ok: true, headers: { get: () => null }, json: async () => ({}) };
};

function loadFresh(rel) {
  const fp = require.resolve(rel);
  delete require.cache[fp];
  return require(rel);
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
}

function smFixture({
  id, homeId, awayId, homeName, awayName, at, state = 'FT', gh, ga,
}) {
  const ms = Date.parse(at);
  return {
    id,
    starting_at: at,
    starting_at_timestamp: Math.floor(ms / 1000),
    state: { id: 5, developer_name: state, short_name: state, name: state },
    participants: [
      { id: homeId, name: homeName, meta: { location: 'home' }, image_path: '' },
      { id: awayId, name: awayName, meta: { location: 'away' }, image_path: '' },
    ],
    scores: [
      { description: 'CURRENT', score: { goals: gh, participant: 'home' }, participant_id: homeId },
      { description: 'CURRENT', score: { goals: ga, participant: 'away' }, participant_id: awayId },
      { description: '2ND_HALF', score: { goals: gh, participant: 'home' }, participant_id: homeId },
      { description: '2ND_HALF', score: { goals: ga, participant: 'away' }, participant_id: awayId },
    ],
    statistics: [
      { participant_id: homeId, type_id: 45, type: { id: 45, code: 'ball-possession', name: 'Ball Possession %' }, data: { value: 62 } },
      { participant_id: awayId, type_id: 45, type: { id: 45, code: 'ball-possession', name: 'Ball Possession %' }, data: { value: 38 } },
      { participant_id: homeId, type_id: 42, type: { id: 42, code: 'shots-total', name: 'Shots Total' }, data: { value: 14 } },
      { participant_id: awayId, type_id: 42, type: { id: 42, code: 'shots-total', name: 'Shots Total' }, data: { value: 6 } },
    ],
    events: [
      {
        id: 1, minute: 12, extra_minute: null,
        type: { developer_name: 'GOAL', name: 'Goal' },
        participant_id: homeId, player_name: 'Home Scorer',
      },
    ],
    venue: { name: 'Test Stadium', city: 'Dublin' },
    league: { id: 1538, name: 'UEFA Nations League' },
    periods: [
      { id: 1, description: '1ST_HALF', started: 1 },
      { id: 2, description: '2ND_HALF', started: 2 },
    ],
    trends: [],
  };
}

const IRELAND_FX = smFixture({
  id: 19676698,
  homeId: 18654,
  awayId: 27488,
  homeName: 'Republic of Ireland',
  awayName: 'Kosovo',
  at: '2026-11-17 19:45:00',
  gh: 3, ga: 0,
});

const PRED_ROWS = [
  {
    type_id: 237,
    type: { id: 237, name: 'Fulltime Result', developer_name: 'FULLTIME_RESULT' },
    predictions: { home: 62.1, draw: 22.2, away: 15.7 },
  },
];

/* ----- officialStatusZh: Define + finished score is 完场, not 未开赛 ----- */
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const fnm = appJs.match(/function officialStatusZh\([\s\S]*?\n\}\n/);
assert.ok(fnm, 'officialStatusZh present');
const officialStatusZh = new Function(fnm[0] + '; return officialStatusZh;')();
assert.strictEqual(officialStatusZh('Define', '完场'), '完场', 'Define + finished fallback is 完场');
assert.strictEqual(officialStatusZh('Define'), '完场', 'Define alone is 完场 (settlement), not 未开赛');
assert.strictEqual(officialStatusZh('Selling'), '在售');
assert.strictEqual(officialStatusZh('Payout'), '完场');
assert.ok(!/if \(\/\^define\$\/i\.test\(raw\)\) return '未开赛'/.test(appJs), 'must not map Define to 未开赛');

async function main() {
  writeJson(path.join(tmp, 'sm-lineups', 'match-map.json'), {
    'm:2042836': { sportteryMatchId: '2042836', smFixtureId: '19676698' },
  });

  const live = loadFresh('../lib/live-stats');
  const hist = loadFresh('../lib/sm-history');
  let fixtureByIdHits = 0;
  hist.fixtureById = async () => {
    fixtureByIdHits++;
    return IRELAND_FX;
  };

  const live1 = await live.getLiveStats({
    matchId: '2042836',
    home: '爱尔兰',
    away: '科索沃',
    date: '2026-11-18',
    time: '03:45',
    fetchImpl: async () => { throw new Error('mapped fixture should not search'); },
  });
  assert.strictEqual(live1.ok, true, 'finished live-stats ok');
  assert.strictEqual(String(live1.fixtureId || live1.smFixtureId), '19676698');
  assert.strictEqual(live1.source, 'sportmonks');
  assert.ok(live1.score && live1.score.home === 3 && live1.score.away === 0, 'FT score from SM');
  assert.ok(/FT/i.test(String(live1.status && live1.status.short)), 'phase FT not NS');
  assert.ok(Array.isArray(live1.events) && live1.events.length >= 1, 'events present');
  assert.ok(live1.stats && live1.stats.possession, 'team stats present');
  assert.strictEqual(fixtureByIdHits, 1, 'first open hits SM');

  const diskHit = live.readFtLiveDisk('2042836', 19676698);
  assert.ok(diskHit && diskHit.payload && diskHit.payload.ok, 'FT live-stats written to disk');
  assert.strictEqual(live.isFtLivePayload(diskHit.payload), true);

  // Fresh module: memory empty, disk should serve without network.
  const liveB = loadFresh('../lib/live-stats');
  const live2 = await liveB.getLiveStats({
    matchId: '2042836',
    home: '爱尔兰',
    away: '科索沃',
    date: '2026-11-18',
    time: '03:45',
    fetchImpl: async () => { throw new Error('network should not be used on FT disk hit'); },
  });
  assert.strictEqual(live2.ok, true, 'second open is cache-first');
  assert.strictEqual(live2.disk, true, 'served from sm-live disk cache');
  assert.strictEqual(live2.score.home, 3);

  /* ----- predictions for a finished match when SM returns rows ----- */
  const pred = loadFresh('../lib/sm-predictions');
  const predPack = await pred.ensurePredictions({
    matchId: '2042836',
    home: '爱尔兰',
    away: '科索沃',
    date: '2026-11-18',
    time: '03:45',
    kickoffMs: Date.parse('2026-11-18T03:45:00+08:00'),
    fetchImpl: async (url, params) => {
      const u = String(url);
      if (u.includes('/football/predictions/probabilities/fixtures/19676698')) {
        return { data: PRED_ROWS };
      }
      if (/\/football\/fixtures\/19676698/.test(u)) {
        const fx = JSON.parse(JSON.stringify(IRELAND_FX));
        if (String((params && params.include) || '').includes('predictions')) fx.predictions = PRED_ROWS;
        return { data: fx };
      }
      throw new Error('unexpected pred url ' + u);
    },
  });
  assert.strictEqual(predPack.ok, true);
  assert.strictEqual(predPack.hasPredictions, true, 'FT predictions served when SM returns data');
  assert.strictEqual(String(predPack.smFixtureId), '19676698');
  assert.ok(predPack.wdl && predPack.wdl.h > 0, 'WDL present, not invented later');
  assert.ok(fs.existsSync(path.join(tmp, 'sm-predictions', '2042836.json')));

  /* ----- mapping reuse: knownFid from match-map, no team search ----- */
  const facts = loadFresh('../lib/sm-matchfacts');
  let teamSearches = 0;
  const factsPack = await facts.ensureMatchfacts({
    matchId: '2042836',
    home: '爱尔兰',
    away: '科索沃',
    date: '2026-11-18',
    time: '03:45',
    kickoffMs: Date.parse('2026-11-18T03:45:00+08:00'),
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/football/teams/search/')) {
        teamSearches++;
        return { data: [] };
      }
      if (/\/football\/fixtures\/19676698/.test(u)) {
        return { data: IRELAND_FX };
      }
      throw new Error('unexpected facts url ' + u);
    },
  });
  assert.strictEqual(factsPack.ok, true);
  assert.strictEqual(String(factsPack.smFixtureId), '19676698');
  assert.strictEqual(teamSearches, 0, 'reuse match-map smFixtureId, no team lookup');

  /* ----- backfill coverage of a small official list ----- */
  writeJson(path.join(tmp, 'sporttery-live-cache', 'results.json'), {
    at: Date.now(),
    payload: {
      data: [
        { id: '2042836', num: '周二009', league: '欧国联', date: '2026-11-18', time: '03:45', home: '爱尔兰', away: '科索沃', full: '3:0', half: '1:0', status: '已完成' },
        { id: '2042828', num: '周二001', league: '国际赛', date: '2026-11-17', time: '18:00', home: '新加坡', away: '巴西', full: '0:7', half: '0:4', status: '已完成' },
        { id: '2042999', num: '周二099', league: '欧国联', date: '2026-11-18', time: '03:45', home: '测试主', away: '测试客', full: '1:0', half: '0:0', status: '已完成' },
      ],
    },
  });
  writeJson(path.join(tmp, 'sporttery-live-cache', 'schedule.json'), {
    at: Date.now(),
    payload: { data: [] },
  });

  const tool = loadFresh('../tools/sm-ft-backfill.js');
  const listed = tool.loadOfficialRows({});
  assert.strictEqual(listed.length, 3, 'loads official results');

  const dry = await tool.run({
    from: '2026-11-17',
    to: '2026-11-18',
    dryRun: true,
    sleepMs: 0,
    out: path.join(tmp, 'dry.json'),
  });
  assert.strictEqual(dry.count, 3);
  assert.strictEqual(dry.summary.total, 3);

  const deps = {
    facts: {
      async ensureMatchfacts(opts) {
        if (String(opts.matchId) === '2042836') {
          return { ok: true, matchId: '2042836', smFixtureId: 19676698, hasFacts: true, hasTrends: true, events: [1] };
        }
        if (String(opts.matchId) === '2042999') {
          return { ok: true, matchId: '2042999', smFixtureId: 19670001, hasFacts: true, hasTrends: false, events: [] };
        }
        return { ok: true, matchId: opts.matchId, smFixtureId: null, reason: 'no-fixture', hasFacts: false };
      },
    },
    pred: {
      async ensurePredictions(opts) {
        if (String(opts.matchId) === '2042836') {
          return { ok: true, matchId: '2042836', smFixtureId: 19676698, hasPredictions: true, wdl: { h: 0.6, d: 0.2, a: 0.2 } };
        }
        if (String(opts.matchId) === '2042999') {
          return { ok: true, matchId: '2042999', smFixtureId: 19670001, hasPredictions: false, reason: 'no-predictions' };
        }
        return { ok: true, matchId: opts.matchId, smFixtureId: null, reason: 'no-fixture', hasPredictions: false };
      },
    },
    live: {
      async getLiveStats(opts) {
        if (String(opts.matchId) === '2042836') {
          return { ok: true, fixtureId: 19676698, smFixtureId: 19676698, source: 'sportmonks', stats: { possession: {} }, events: [{ kind: 'goal' }], status: { short: 'FT' } };
        }
        if (String(opts.matchId) === '2042999') {
          return { ok: true, fixtureId: 19670001, source: 'sportmonks', stats: { possession: {} }, events: [], status: { short: 'FT' } };
        }
        return { ok: false, reason: 'no_fixture' };
      },
    },
    wx: {
      async getMatchWeather(opts) {
        if (String(opts.matchId) === '2042836') {
          return { ok: true, smFixtureId: 19676698, reportType: 'actual', tempC: 21 };
        }
        if (String(opts.matchId) === '2042999') {
          return { ok: false, reason: 'empty-weatherreport', smFixtureId: 19670001 };
        }
        return { ok: false, reason: 'no-fixture' };
      },
    },
  };

  const report = await tool.run({
    from: '2026-11-17',
    to: '2026-11-18',
    sleepMs: 0,
    deps,
    out: path.join(tmp, 'sm-ft-backfill-last.json'),
  });
  assert.strictEqual(report.count, 3);
  assert.strictEqual(report.summary.resolved, 2, 'two SM-resolvable fixtures');
  assert.strictEqual(report.summary.noFixture, 1, 'Singapore-Brazil cannot be filled');
  assert.strictEqual(report.summary.liveOk, 2);
  assert.strictEqual(report.summary.factsOk, 2);
  assert.strictEqual(report.summary.predOk, 1, 'only Ireland has predictions');
  assert.strictEqual(report.summary.predMissing, 1, '2042999 SM has no predictions');
  assert.strictEqual(report.summary.weatherOk, 1);
  const sg = report.rows.find((r) => r.matchId === '2042828');
  assert.strictEqual(sg.resolve, 'no-fixture');
  const ie = report.rows.find((r) => r.matchId === '2042836');
  assert.strictEqual(ie.resolve, 'ok');
  assert.strictEqual(ie.pred.status, 'ok');
  assert.ok(fs.existsSync(path.join(tmp, 'sm-ft-backfill-last.json')));

  console.log('sm-ft-backfill-test OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
