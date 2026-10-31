'use strict';
// 1.9.258: list live-scores must reconcile stale sporttery live/early FT with AF + results-seen.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { mergeAfOverlay } = require('../lib/live-scores');

// --- mergeAfOverlay: early sporttery 完场 1:0 vs AF FT 1:2 (Augsburg pattern) ---
{
  const cur = {
    id: 'aug', source: 'sporttery', live: false, finished: true,
    phase: 'FT', phaseZh: '完场', homeScore: 1, awayScore: 0, full: '1:0', half: '1:0',
  };
  const afn = {
    phase: 'FT', phaseZh: '完场', live: false, finished: true,
    homeScore: 1, awayScore: 2, source: 'api-football',
  };
  const m = mergeAfOverlay(cur, afn, 'aug', true);
  assert.strictEqual(m.homeScore, 1);
  assert.strictEqual(m.awayScore, 2);
  assert.strictEqual(m.full, '1:2');
  assert.strictEqual(m.scoreSource, 'af');
  assert.ok(m.finished && !m.live);
}

// --- mergeAfOverlay: sporttery stuck live overnight → AF FT ---
{
  const cur = {
    id: 'epl', source: 'sporttery', live: true, finished: false,
    phase: '2H', phaseZh: '下半场', minute: 69, homeScore: 3, awayScore: 1, full: '3:1', half: '2:0',
  };
  const afn = {
    phase: 'FT', phaseZh: '完场', live: false, finished: true,
    homeScore: 3, awayScore: 2, source: 'api-football',
  };
  const m = mergeAfOverlay(cur, afn, 'epl', true);
  assert.strictEqual(m.homeScore, 3);
  assert.strictEqual(m.awayScore, 2);
  assert.ok(m.finished && !m.live);
  assert.strictEqual(m.phaseZh, '完场');
}

// --- getLiveScores: afFt path verifies finished sporttery row ---
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls258-'));
  fs.mkdirSync(path.join(tmp, 'live-stats'), { recursive: true });
  process.env.DATA_DIR = tmp;
  process.env.API_FOOTBALL_KEY = 'ut-258-key';
  fs.writeFileSync(path.join(tmp, 'live-stats', 'fixture-map.json'), JSON.stringify({
    'm:aug258': { fixtureId: 888258, sportteryMatchId: 'aug258', date: '2026-10-31' },
  }));
  fs.writeFileSync(path.join(tmp, 'results-seen.json'), JSON.stringify({
    savedAt: new Date().toISOString(),
    byId: {},
  }));

  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('fixtures?ids=')) {
      return {
        headers: { get: () => null },
        json: async () => ({
          response: [{
            fixture: { id: 888258, status: { short: 'FT', elapsed: 90, extra: null } },
            goals: { home: 1, away: 2 },
            teams: { home: { id: 1, name: 'Augsburg' }, away: { id: 2, name: 'Freiburg' } },
          }],
        }),
      };
    }
    return { headers: { get: () => null }, json: async () => ({ response: [] }) };
  };

  const lsPath = require.resolve('../lib/live-scores');
  delete require.cache[lsPath];
  delete require.cache[require.resolve('../lib/db')];
  const { getLiveScores } = require('../lib/live-scores');

  const sportRow = {
    matchId: 'aug258', matchStatus: '11', matchStatusName: '已完成',
    matchPhaseTc: '14', matchPhaseTcName: '比赛结束',
    matchMinute: '', matchMinuteExtra: '',
    sectionsNo999: '1:0', sectionsNo1: '1:0',
  };
  const fetchJson = async () => ({ value: [sportRow] });
  const p = await getLiveScores({
    ids: ['aug258'],
    fetchJson,
    base: 'http://unit.test',
    withAf: true,
    force: true,
    resolveMeta: { aug258: { date: '2026-10-31', time: '22:30' } },
  });
  const row = p.data.aug258;
  assert.ok(p.afFtUsed, 'AF fixture-by-id used to verify early FT');
  assert.strictEqual(row.homeScore, 1);
  assert.strictEqual(row.awayScore, 2);
  assert.ok(row.finished && !row.live);
  assert.strictEqual(row.scoreSource, 'af');

  // stale live → AF FT via same path
  const sportLive = {
    matchId: 'aug258', matchStatus: '5', matchStatusName: '进行中',
    matchPhaseTc: '3', matchPhaseTcName: '下半场',
    matchMinute: '69', matchMinuteExtra: '',
    sectionsNo999: '3:1', sectionsNo1: '2:0',
  };
  const fetchJson2 = async () => ({ value: [sportLive] });
  const p2 = await getLiveScores({
    ids: ['aug258'],
    fetchJson: fetchJson2,
    base: 'http://unit.test',
    withAf: true,
    force: true,
    resolveMeta: { aug258: { date: '2026-10-30', time: '23:00' } },
  });
  const row2 = p2.data.aug258;
  assert.strictEqual(row2.homeScore, 1);
  assert.strictEqual(row2.awayScore, 2);
  assert.ok(row2.finished && !row2.live);

  console.log('live-scores-sync-258-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
