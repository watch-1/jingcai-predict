'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const liveJs = fs.readFileSync(path.join(root, 'lib/live-stats.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.242/.test(ver));
assert.ok(/VERSION_CODE=279/.test(ver));
assert.ok(/jc-v1\.9\.242/.test(swJs));
assert.strictEqual(pkg.version, '1.9.242');
assert.strictEqual(cfg.version, '1.9.242');

assert.ok(/function liveStatsEventsBehindScore/.test(appJs), 'client partial events gap');
assert.ok(/function liveStatsGoalCountFromEvents/.test(appJs), 'client goal tally');
assert.ok(/eventsScoreGap/.test(appJs), 'client reads eventsScoreGap flag');
assert.ok(/function eventsScoreBehindFixture/.test(liveJs), 'server score vs events gap');
assert.ok(/function mergeEventLists/.test(liveJs), 'merge events on refetch');
assert.ok(/EVENTS_SCORE_GAP_MS/.test(liveJs), 'short TTL when score ahead of events');

const {
  eventsScoreBehindFixture,
  normalizedScoreFromEvents,
  mergeEventLists,
  liveEventsLikelyMissing,
} = require('../lib/live-stats');

const homeId = 100;
const awayId = 200;
const fourGoals = [
  { id: '1', kind: 'goal', goalKind: 'goal', teamId: homeId, side: 'home', elapsed: 25 },
  { id: '2', kind: 'goal', goalKind: 'pen', teamId: homeId, side: 'home', elapsed: 45, extra: 1 },
  { id: '3', kind: 'goal', goalKind: 'goal', teamId: homeId, side: 'home', elapsed: 70 },
  { id: '4', kind: 'goal', goalKind: 'goal', teamId: homeId, side: 'home', elapsed: 82 },
  { id: '5', kind: 'subst', teamId: awayId, side: 'away', elapsed: 83 },
];

const payload51 = {
  ok: true,
  score: { home: 5, away: 1 },
  home: { id: homeId },
  away: { id: awayId },
  events: fourGoals,
  live: false,
};

assert.ok(eventsScoreBehindFixture(payload51), '5:1 fixture with four home goals in events');
assert.ok(liveEventsLikelyMissing(payload51), 'missing-last-goal triggers retry');

const tally = normalizedScoreFromEvents(fourGoals, homeId, awayId);
assert.strictEqual(tally.home, 4);
assert.strictEqual(tally.away, 0);

const merged = mergeEventLists(
  fourGoals,
  [{ id: '6', kind: 'goal', goalKind: 'goal', teamId: homeId, side: 'home', elapsed: 88 }],
);
assert.strictEqual(merged.length, 6, 'merge keeps prior rows and adds new goal');

const varCancel = {
  ok: true,
  live: true,
  score: { home: 0, away: 0 },
  home: { id: homeId },
  away: { id: awayId },
  events: [{ id: 'c', kind: 'yellow', teamId: homeId, side: 'home', elapsed: 10 }],
};
assert.ok(!eventsScoreBehindFixture(varCancel), 'do not retry when events empty but score 0:0');

console.log('ui-242-test OK');
