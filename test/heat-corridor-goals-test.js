'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heat-abc-'));
process.env.DATA_DIR = dir;
for (const mod of ['../lib/db', '../lib/fixture-goals-cache', '../lib/corridor-matchup']) {
  try { delete require.cache[require.resolve(mod)]; } catch { /* ignore */ }
}

const fgc = require('../lib/fixture-goals-cache');
const cm = require('../lib/corridor-matchup');
const heat = require('../lib/heat-pitch');

const fxGoals = {
  id: 1001,
  participants: [
    { id: 10, meta: { location: 'home' } },
    { id: 20, meta: { location: 'away' } },
  ],
  events: [
    { type_id: 14, participant_id: 10, minute: 12, extra_minute: 0 },
    { type_id: 14, participant_id: 20, minute: 44, extra_minute: 0 },
  ],
};
fgc.upsertFromFixture(fxGoals);
const row = fgc.loadFixtureGoals(1001);
assert.strictEqual(row.length, 2);
assert.strictEqual(row[0].side, 'home');

const bc = Array.from({ length: 120 }, () => ({ x: 0.8, y: 0.15, period_id: 1 }));
const fxHeat = {
  id: 2002,
  participants: fxGoals.participants,
  periods: [{ id: 1, description: '1st-half' }],
  ballcoordinates: bc,
  events: [],
};
const mh = heat.buildMatchHeat({
  homeId: 10,
  awayId: 20,
  homeFixtures: [fxHeat],
  awayFixtures: [{ ...fxHeat, id: 2003 }],
});
const squad = {
  sidelined: [{ side: 'home', core: true, name: 'T', player_id: 1 }],
  cores: { home: [{ player_id: 1 }], away: [] },
};
const cor = cm.buildCorridorMatchup(mh, squad);
assert.strictEqual(cor.available, true);
assert.ok(cor.zh_lines.some(s => s.includes('核心缺阵')));
assert.strictEqual(cor.heuristic.home_lane_threat_weight, 0.7);
assert.ok(cor.away_defend_thin_lane);

const soft = cm.corridorSoftNote(cor, { homeName: 'H', awayName: 'A' });
assert.ok(typeof soft === 'string');

console.log('heat-corridor-goals-test OK');
