'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-results-archive-'));
process.env.DATA_DIR = tmp;

delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/results-archive')];
const arch = require('../lib/results-archive');

const seenPath = path.join(tmp, 'results-seen.json');

fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(seenPath, JSON.stringify({
  savedAt: new Date().toISOString(),
  byId: {
    old1: {
      id: 'old1',
      num: '周四001',
      businessDate: '2026-10-22',
      date: '2026-10-23',
      home: 'A',
      away: 'B',
      full: '2:1',
      half: '1:0',
      had: { h: 1.5, d: 3.2, a: 5.0 },
      status: '完场',
    },
  },
}));

const live = [{ id: 'live1', num: '周日001', businessDate: '2026-10-26', home: 'X', away: 'Y', full: '0:0' }];
const merged = arch.mergeSeenIntoResults(live);
assert.strictEqual(merged.merged, 1);
assert.ok(merged.data.some(r => r.id === 'old1' && r.full === '2:1'), 'archived row merged');

const sched = [{
  id: 'sched1',
  num: '周四002',
  businessDate: '2026-10-22',
  date: '2026-10-23',
  home: 'C',
  away: 'D',
  full: '1:3',
  hhad: { goalLine: '-1', h: 2.1, d: 3.0, a: 2.8 },
  had: { h: 1.8, d: 3.1, a: 3.9 },
}];
const ab = arch.absorbScheduleFinished([], sched);
assert.strictEqual(ab.added, 1);
assert.strictEqual(ab.data[0].full, '1:3');
assert.strictEqual(ab.data[0].goalLine, '-1');

arch.recordResultsFromList([{ id: 'new9', businessDate: '2026-10-25', full: '3:3', home: 'H', away: 'A' }]);
const disk = JSON.parse(fs.readFileSync(seenPath, 'utf8'));
assert.ok(disk.byId.new9 && disk.byId.new9.full === '3:3', 'record persists');

console.log('results-archive-test OK');
