'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sm = require('../lib/sm-live-scores');
const ls = require('../lib/live-scores');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

const KO = Date.parse('2026-11-20T18:00:00+08:00');
const NOW = Date.parse('2026-11-20T19:31:00+08:00');
assert.strictEqual(Math.round((NOW - KO) / 60000), 91, 'wall-clock elapsed is 91');

const start = app.indexOf('function officialClockFromLiveStats');
const end = app.indexOf('function scoreCard');
assert.ok(start > 0 && end > start);
const box = {
  S: { liveScores: {}, liveStatsCache: {} },
  Date,
  Number,
  String,
  Math,
  kickoff: (m) => {
    if (m && Number.isFinite(m.kickoffMs)) return m.kickoffMs;
    return new Date(`${m.date}T${m.time || '00:00'}:00+08:00`).getTime();
  },
  syncLiveScoreFromStats: () => false,
};
vm.runInNewContext(app.slice(start, end), box);

const wallLab = box.formatLiveClockMinute('下半场', 91, null);
assert.strictEqual(wallLab, "90+1'", 'raw 91 in 2H still formats as 90+1 (must not be fed a wall minute)');

assert.ok(box.looksLikeKickoffWallMinute(91, '下半场', KO, NOW), '91 at 19:31 after 18:00 KO is wall-clock');
assert.ok(!box.looksLikeKickoffWallMinute(71, '下半场', KO, NOW), 'official 71 is not wall-clock');
assert.ok(!box.looksLikeKickoffWallMinute(90, '下半场', KO, Date.parse('2026-11-20T19:50:00+08:00')),
  '90 at 19:50 (wall 110) is not simply wall-clock');

const official = box.officialClockFromLiveStats({
  ok: true, live: true, status: { short: '2H', elapsed: 71 },
});
assert.strictEqual(official.minute, 71);
assert.strictEqual(official.phaseZh, '下半场');

const rowBase = {
  id: '2042003', date: '2026-11-20', time: '18:00',
  home: '鹿岛鹿角', away: '清水鼓动', kickoffMs: KO,
};
box.S.liveScores['2042003'] = {
  id: '2042003', live: true, finished: false,
  phase: '2H', phaseZh: '下半场', minute: 91, minuteExtra: null,
  homeScore: 0, awayScore: 0, full: '0:0', half: '0:0',
};
box.S.liveStatsCache['2042003'] = {
  ok: true, live: true, finished: false,
  status: { short: '2H', elapsed: 71 },
  score: { home: 0, away: 0 },
};
const classified = box.classifyScoreRow(rowBase, NOW);
assert.strictEqual(classified._kind, 'live');
assert.strictEqual(classified._minute, 71, 'list uses official 71, not wall 91');
assert.strictEqual(classified._phaseZh, '下半场');
const lab = box.scoreMinuteLab(classified);
assert.ok(lab.includes('71'), lab);
assert.ok(!/90\+/.test(lab), 'must not render 90+ when official is 71: ' + lab);
assert.strictEqual(lab, '下半场 71\'');

// Real stoppage from official clock is allowed.
box.S.liveStatsCache['2042003'] = {
  ok: true, live: true, status: { short: '2H', elapsed: 90, extra: 2 },
  score: { home: 0, away: 0 },
};
const stoppage = box.classifyScoreRow(rowBase, Date.parse('2026-11-20T19:52:00+08:00'));
assert.strictEqual(stoppage._minute, 90);
assert.strictEqual(stoppage._minuteExtra, 2);
assert.strictEqual(box.scoreMinuteLab(stoppage), "下半场 90+2'");

// No official clock, Sporttery 91 at 19:31 → do not invent 90+.
delete box.S.liveStatsCache['2042003'];
box.S.liveScores['2042003'] = {
  id: '2042003', live: true, finished: false,
  phase: '2H', phaseZh: '下半场', minute: 91,
  homeScore: 0, awayScore: 0, full: '0:0', half: '0:0',
};
const wallOnly = box.classifyScoreRow(rowBase, NOW);
assert.strictEqual(wallOnly._minute, null, 'drop wall-clock minute when no official clock');
assert.strictEqual(box.scoreMinuteLab(wallOnly), '下半场');
assert.ok(!/90\+/.test(box.scoreMinuteLab(wallOnly)));

// Server merge agrees
const sporttery = {
  id: '2042003', source: 'sporttery', live: true, finished: false,
  phase: '2H', phaseZh: '下半场', minute: 91, homeScore: 0, awayScore: 0, full: '0:0', half: '0:0',
};
const sm71 = sm.fromSm({
  id: 1,
  participants: [
    { id: 11, meta: { location: 'home' }, name: 'Kashima' },
    { id: 22, meta: { location: 'away' }, name: 'Shimizu' },
  ],
  state: { developer_name: 'INPLAY_2ND_HALF' },
  scores: [
    { description: 'CURRENT', participant_id: 11, score: { goals: 0 } },
    { description: 'CURRENT', participant_id: 22, score: { goals: 0 } },
  ],
  periods: [{ ticking: true, minutes: 71, description: '2nd Half' }],
  events: [],
});
assert.ok(sm.smClockBetter(sporttery, sm71));
assert.strictEqual(sm.mergeSmOverlay(sporttery, sm71, '2042003', true).minute, 71);
assert.strictEqual(ls.formatClockMinute('2H', 71, null), "71'");

console.log('sched-clock-1387-test ok');
