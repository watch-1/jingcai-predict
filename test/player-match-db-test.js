'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Isolate DB under temp DATA_DIR
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-'));
process.env.DATA_DIR = tmp;
// Re-require db + player-match-db with new DATA_DIR
delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/player-match-db')];
const pmdb = require('../lib/player-match-db');

const haalandPayload = {
  ok: true,
  fixtureId: 999001,
  matchId: 'test-haaland-1',
  date: '2026-10-15',
  ft: '2:4',
  homeTeamId: '1',
  awayTeamId: '2',
  homeName: 'Manchester City',
  awayName: 'Paris Saint Germain',
  homeNameZh: '曼城',
  awayNameZh: '巴黎圣曼',
  fetchedAt: '2026-10-15T12:00:00.000Z',
  source: 'test',
  home: {
    name: 'Manchester City',
    nameZh: '曼城',
    players: [
      {
        id: '1100', name: 'E. Haaland', nameZh: '埃尔林·哈兰德',
        position: 'F', positionZh: '前锋', minutes: 90, goals: 2, assists: 0,
        shots: 8, shotsOn: 4, keyPasses: 1, tackles: 0, rating: 8.52,
        yellow: 0, red: 0, captain: false, substitute: false, photo: '',
      },
      {
        id: '1101', name: 'K. De Bruyne', nameZh: '德布劳内',
        position: 'M', positionZh: '中场', minutes: 75, goals: 0, assists: 1,
        shots: 2, shotsOn: 1, keyPasses: 4, tackles: 1, rating: 7.4,
        yellow: 0, red: 0,
      },
    ],
  },
  away: {
    name: 'Paris Saint Germain',
    nameZh: '巴黎圣曼',
    players: [
      {
        id: '2200', name: 'K. Mbappé', nameZh: '姆巴佩',
        position: 'F', positionZh: '前锋', minutes: 90, goals: 1, assists: 1,
        shots: 5, shotsOn: 3, keyPasses: 2, tackles: 0, rating: 8.1,
        yellow: 0, red: 0,
      },
    ],
  },
};

const r1 = pmdb.upsertFromFixturePayload(haalandPayload);
assert.ok(r1.ok);
assert.strictEqual(r1.players, 3);

// Idempotent
const r2 = pmdb.upsertFromFixturePayload(haalandPayload);
assert.ok(r2.ok);
const stats = pmdb.statsSummary();
assert.strictEqual(stats.matches, 1);
assert.strictEqual(stats.playerRows, 3);

const rows = pmdb.queryPlayerByName('Haaland');
assert.ok(rows.length >= 1);
assert.strictEqual(rows[0].goals, 2);
assert.strictEqual(rows[0].shots, 8);

// Second match for same teams so slice has history
const payload2 = JSON.parse(JSON.stringify(haalandPayload));
payload2.matchId = 'test-haaland-2';
payload2.fixtureId = 999002;
payload2.date = '2026-10-10';
payload2.ft = '3:1';
payload2.home.players[0].goals = 1;
payload2.home.players[0].shots = 5;
payload2.home.players[0].rating = 7.8;
pmdb.upsertFromFixturePayload(payload2);

const slice = pmdb.buildPlayerSliceForMatch({
  id: 'upcoming-1',
  home: '曼城',
  away: '某队',
  homeTeamId: '1',
  awayTeamId: '99',
}, {
  injuryItems: [{ playerZh: '埃尔林·哈兰德', player: 'E. Haaland', teamZh: '曼城', reason: 'Knock' }],
});
assert.ok(slice.hasData, 'slice should have data');
assert.ok(slice.tableText.includes('射门'), 'Chinese headers');
assert.ok(slice.tableText.includes('哈兰德') || slice.keyPlayers.some(k => /哈兰德|Haaland/.test(k.name)));
assert.ok(slice.caps.rowCount <= pmdb.MAX_TOTAL_ROWS);
assert.ok(slice.keyPlayers.length >= 1);

const pack = pmdb.sliceToEvidencePack(slice);
assert.strictEqual(pack.有数据, true);
assert.ok(pack.近场表);

// Cap enforcement: many matches
for (let i = 0; i < 8; i++) {
  const px = JSON.parse(JSON.stringify(haalandPayload));
  px.matchId = 'bulk-' + i;
  px.fixtureId = 8000 + i;
  px.date = '2026-09-' + String(10 + i).padStart(2, '0');
  // pad more players
  for (let j = 0; j < 10; j++) {
    px.home.players.push({
      id: 'h' + i + '_' + j, name: 'P' + j, nameZh: '球员' + j,
      position: 'M', positionZh: '中场', minutes: 80 - j, goals: j === 0 ? 1 : 0,
      assists: 0, shots: 3, shotsOn: 1, keyPasses: 1, tackles: 2, rating: 7 + j * 0.05,
    });
  }
  pmdb.upsertFromFixturePayload(px);
}
const slice2 = pmdb.buildPlayerSliceForMatch({
  id: 'up-2', home: '曼城', away: '客', homeTeamId: '1', awayTeamId: '2',
});
assert.ok(slice2.caps.rowCount <= pmdb.MAX_TOTAL_ROWS);

pmdb.closeDb();

// 1.9.64 match_outcomes from review
const out = pmdb.upsertOutcomeFromReview({
  ok: true,
  matchId: 'test-haaland-1',
  home: '曼城', away: '巴黎圣曼',
  homeTeamId: '1', awayTeamId: '2',
  date: '2026-10-15', league: '欧冠', ft: '2:4', result: 'a',
  fixtureId: 999001,
  hasActualStats: true,
  prediction: { lean: 'a', conf: 0.66, pickText: '客胜', speakMode: 'amplify', marketLean: 'a' },
  leanFeedback: { available: true, leanHit: true, marketHit: true, amplifyHit: true, amplified: true, lean: 'a', conf: 0.66 },
  intelSnippets: ['曼城 vs 巴黎：表态客胜命中'],
  hardTest: { available: true },
  angles: [{ key: 'prediction', hasData: true, hit: true, text: '命中' }],
  generatedAt: '2026-10-15T12:00:00.000Z',
});
assert.ok(out.ok);
assert.strictEqual(out.leanHit, 1);
const outs = pmdb.listRecentOutcomes({ limit: 5 });
assert.ok(outs.some(o => o.match_id === 'test-haaland-1' && o.lean_hit === 1));
const sum2 = pmdb.statsSummary();
assert.ok(sum2.outcomes >= 1);

// 1.9.65 structured process compare + hard-test episodes
const withDeltas = {
  ok: true,
  matchId: 'test-haaland-1',
  home: '曼城', away: '巴黎圣曼',
  homeTeamId: '1', awayTeamId: '2',
  date: '2026-10-15', league: '欧冠', ft: '2:4', result: 'a',
  fixtureId: 999001,
  hasActualStats: true,
  deltas: {
    home: {
      shots: { actual: 27, baseline: 14.3, delta: 12.7, missing: false },
      expectedGoals: { actual: 2.67, baseline: 2.0, delta: 0.67, missing: false },
    },
    away: {
      shots: { actual: 12, baseline: 15, delta: -3, missing: false },
    },
  },
  hardTest: {
    available: true,
    home: {
      matchId: 'test-haaland-1', side: 'home', teamId: '1', teamName: '曼城',
      opponentId: '2', opponent: '巴黎圣曼', opponentStrength: 1.22, opponentBand: 'ucl',
      scheduleSoftnessBefore: 0.9, scheduleBand: 'soft',
      isHardTest: true, moistureTag: '低', moistureLabelZh: '硬仗仍能产机会',
      mechanismTags: ['硬仗仍能产机会'], collapseN: 0, coreCollapse: 0,
      briefSummaryZh: '曼城硬仗站住', thisMatchVsRecent: { shots: { actual: 27, recentAvg: 14.3, delta: 12.7 } },
      ft: '2:4', result: 'a', league: '欧冠', createdAt: '2026-10-15T12:00:00.000Z',
    },
    away: {
      matchId: 'test-haaland-1', side: 'away', teamId: '2', teamName: '巴黎圣曼',
      opponentId: '1', opponent: '曼城', opponentStrength: 1.15,
      isHardTest: true, moistureTag: '中', moistureLabelZh: '水分中等',
      mechanismTags: ['硬仗过程回落'], collapseN: 2, coreCollapse: 1,
      briefSummaryZh: '客队硬仗回落', ft: '2:4', result: 'a', league: '欧冠',
      createdAt: '2026-10-15T12:00:00.000Z',
    },
  },
  prediction: { lean: 'a', conf: 0.66, pickText: '客胜' },
  leanFeedback: { available: true, leanHit: true },
  intelSnippets: ['结构化入库'],
  generatedAt: '2026-10-15T12:00:00.000Z',
};
const struct = pmdb.upsertOutcomeFromReview(withDeltas);
assert.ok(struct.ok);
assert.ok(struct.compareRows >= 3);
assert.ok(struct.hardEpisodes >= 2);
const cmp = pmdb.getProcessCompareForMatch('test-haaland-1');
assert.strictEqual(cmp.home.shots.actual, 27);
assert.strictEqual(cmp.home.shots.recentAvg, 14.3);
const eps = pmdb.getHardTestEpisodesForTeam('1', { limit: 3 });
assert.ok(eps.length >= 1);
assert.strictEqual(eps[0].source, 'sqlite');
assert.strictEqual(eps[0].moistureTag, '低');
const detail = pmdb.getMatchDetail('test-haaland-1');
assert.ok(detail.processCompare.rows >= 3);
assert.ok(detail.hardTest.length >= 1);
const sum3 = pmdb.statsSummary();
assert.ok(sum3.processCompare >= 3);
assert.ok(sum3.hardTestEpisodes >= 2);

console.log('player-match-db tests ok');
