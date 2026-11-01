'use strict';
// 1.9.272: list live-scores must overlay AF when sporttery is still NS after kickoff.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls271-'));
fs.mkdirSync(path.join(tmp, 'live-stats'), { recursive: true });
process.env.DATA_DIR = tmp;
process.env.API_FOOTBALL_KEY = 'ut-271-key';
const ko = new Date(Date.now() - 66 * 60e3);
const bj = new Date(ko.getTime() + 8 * 3600e3);
const koDate = bj.toISOString().slice(0, 10);
const koTime = bj.toISOString().slice(11, 16);
fs.writeFileSync(path.join(tmp, 'live-stats', 'fixture-map.json'), JSON.stringify({
  'm:juv271': { fixtureId: 771271, sportteryMatchId: 'juv271', date: koDate },
}));

global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('live=all')) {
    return {
      headers: { get: () => null },
      json: async () => ({
        response: [{
          fixture: { id: 771271, status: { short: '2H', elapsed: 66, extra: null } },
          goals: { home: 2, away: 1 },
          teams: { home: { id: 496, name: 'Juventus' }, away: { id: 33, name: 'Man United' } },
        }],
      }),
    };
  }
  return { headers: { get: () => null }, json: async () => ({ response: [] }) };
};

const lsPath = require.resolve('../lib/live-scores');
delete require.cache[lsPath];
const { getLiveScores } = require('../lib/live-scores');

(async () => {
  // sporttery still Selling / no clock after KO — list used to skip AF live=all
  const sportRow = {
    matchId: 'juv271', matchStatus: '1', matchStatusName: 'Selling',
    matchPhaseTc: '', matchPhaseTcName: '',
    matchMinute: '', matchMinuteExtra: '',
    sectionsNo999: '', sectionsNo1: '',
  };
  const p = await getLiveScores({
    ids: ['juv271'],
    fetchJson: async () => ({ value: [sportRow] }),
    base: 'http://unit.test',
    withAf: true,
    force: true,
    resolveMeta: { juv271: { home: '尤文图斯', away: '曼联', date: koDate, time: koTime } },
  });
  const row = p.data.juv271;
  assert.ok(p.afUsed, 'AF live=all used when sporttery still NS after KO');
  assert.strictEqual(row.homeScore, 2);
  assert.strictEqual(row.awayScore, 1);
  assert.strictEqual(row.minute, 66);
  assert.strictEqual(row.phaseZh, '下半场');
  assert.ok(row.live && !row.finished);

  console.log('live-scores-sync-271-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
