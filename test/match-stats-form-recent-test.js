'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-form-recent-'));
process.env.DATA_DIR = tmp;

const histDir = path.join(tmp, 'history');
fs.mkdirSync(histDir, { recursive: true });
fs.writeFileSync(path.join(histDir, 'results.jsonl'), JSON.stringify({
  matchId: 1,
  matchDate: '2026-10-10',
  home: 'A',
  away: 'B',
  homeTeamId: 2,
  awayTeamId: 3,
  ft: '1:0',
  winFlag: 'H',
  league: '英超',
}) + '\n');

fs.writeFileSync(path.join(tmp, 'results-seen.json'), JSON.stringify({
  savedAt: new Date().toISOString(),
  byId: {
    cup011: {
      id: '2041999',
      num: '周三011',
      businessDate: '2026-10-28',
      date: '2026-10-29',
      league: '英联赛杯',
      home: '伯恩茅斯',
      away: '维拉',
      homeTeamId: '67',
      awayTeamId: '2',
      full: '3:0',
      half: '1:0',
      winFlag: 'H',
      status: '完场',
    },
  },
}));

delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/results-archive')];
delete require.cache[require.resolve('../lib/match-stats')];

const arch = require('../lib/results-archive');
const ms = require('../lib/match-stats');

const recent = arch.loadRecentFormHistoryRows();
assert.strictEqual(recent.length, 1, 'archive row loaded');
assert.strictEqual(recent[0].ft, '3:0');
assert.strictEqual(recent[0].winFlag, 'H');

const rows = ms.loadRows();
assert.ok(rows.some(r => String(r.matchId) === '2041999' && r.ft === '3:0'), 'loadRows merges archive cup');

const villa = ms.formOf(rows, '2', 10);
assert.ok(
  villa.matches.some(m => m.ft === '3:0' && m.home === '伯恩茅斯' && m.outcome === 'L'),
  'Villa form includes recent League Cup loss',
);

console.log('match-stats-form-recent-test OK');
