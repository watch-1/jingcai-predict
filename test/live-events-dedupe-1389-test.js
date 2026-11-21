'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const live = require('../lib/live-stats');

const sides = { home: { id: 11, name: '鹿岛鹿角' }, away: { id: 22, name: '清水鼓动' } };
const evA = {
  id: 88001, type_id: 14, participant_id: 22, minute: 73,
  player_name: 'Koya Kitagawa', info: 'Right Footed Shot', addition: '1st Goal',
};
const evB = {
  id: 88002, type_id: 14, participant_id: 22, minute: 73,
  player_name: 'Koya Kitagawa', info: 'Right Footed Shot', addition: '1st Goal',
};
const shot = {
  id: 88003, type_id: 569, participant_id: 22, minute: 73,
  player_name: 'Koya Kitagawa',
};
const miss = {
  id: 88004, type_id: 570, participant_id: 22, minute: 73,
};
const corner = {
  id: 88005, type_id: 126, participant_id: 22, minute: 73,
};

const merged = live.mergeSmEventLists(
  [evA, shot, miss, corner].map((e) => live.normalizeOneSmEvent(e, sides, 'event')),
  [evB].map((e) => live.normalizeOneSmEvent(e, sides, 'timeline'))
);
const goals = merged.filter((e) => e && e.kind === 'goal');
assert.strictEqual(goals.length, 1, 'identical 73\' goals collapse to one');
assert.strictEqual(goals[0].elapsed, 73);
assert.ok(merged.some((e) => e.kind === 'shot_on'), 'keep distinct 射正 at the same minute');
assert.ok(merged.some((e) => e.kind === 'shot_off'), 'keep distinct 射偏');
assert.ok(merged.some((e) => e.kind === 'corner'), 'keep distinct 角球');
const score = live.scoreFromEvents(merged, 11, 22);
assert.strictEqual(score.home, 0);
assert.strictEqual(score.away, 1, 'official score from events stays 0-1');

const zhGoals = live.dedupeNormalizedEvents([
  { id: 'sm:1', smId: 1, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, player: '科亚·基塔加瓦', info: '右脚', type: 'Goal', detail: 'Normal Goal', teamId: 22 },
  { id: 'sm:2', smId: 2, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, playerZh: '科亚·基塔加瓦', info: 'Right Footed Shot', type: 'Goal', detail: 'Normal Goal', teamId: 22 },
]);
assert.strictEqual(zhGoals.filter((e) => e.kind === 'goal').length, 1);

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const start = app.indexOf('function liveEventDedupeToken');
const end = app.indexOf('function assignCountedOrdinals');
assert.ok(start > 0 && end > start);
const box = {
  eventGoalKind: (e) => (e && e.goalKind) || 'goal',
  eventTimeKey: (e) => (e.elapsed || 0) + (e.extra ? e.extra / 100 : 0),
  eventOrdinalLab: (e, unit) => {
    const n = e && e.ordinal != null ? Number(e.ordinal) : null;
    if (!Number.isFinite(n) || n <= 0) return '';
    return '第' + n + (unit || '个');
  },
  eventGoalBodyZh: (e) => (/right\s*foot|右脚/i.test(String((e && (e.info || e.detail)) || '')) ? '右脚' : ''),
  eventPlayerLab: (e) => ({ player: e.playerZh || e.player || '', assist: e.assist || '', auto: false }),
  eventIconHtml: () => '',
  eventMinuteLab: (e) => (e.elapsed != null ? e.elapsed + "'" : ''),
  eventTeamCrestHtml: () => '',
  livePeriodMarkers: () => [],
  isLiveImportantEvent: (e) => e && (e.kind === 'goal' || e.kind === 'shot_on' || e.kind === 'shot_off' || e.kind === 'corner' || e.kind === 'subst'),
  liveStatsUserMsg: () => '',
  esc: (s) => String(s == null ? '' : s),
  S: {},
};
// Need more functions for HTML — slice a wider range including comment/important
const htmlStart = app.indexOf('function liveEventDedupeToken');
const htmlEnd = app.indexOf('function liveSubHeadHtml');
assert.ok(htmlEnd > htmlStart);
vm.runInNewContext(app.slice(htmlStart, htmlEnd), box);

const dup = [
  { id: 'sm:1', smId: 1, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, player: '科亚·基塔加瓦', info: '右脚', type: 'Goal' },
  { id: 'sm:2', smId: 2, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, player: '科亚·基塔加瓦', info: 'Right Footed Shot', type: 'Goal' },
  { id: 'sm:3', kind: 'shot_on', side: 'away', elapsed: 73, player: '科亚·基塔加瓦' },
];
const livePack = { ok: true, events: dup, home: { nameZh: '鹿岛鹿角' }, away: { nameZh: '清水鼓动' } };
const x = { id: '2042003', home: '鹿岛鹿角', away: '清水鼓动' };

const feed = box.liveCommentHtml(x, livePack);
assert.ok(feed.includes('第1个进球'), feed);
assert.ok(!feed.includes('第2个进球'), 'must not label a second goal for the same strike: ' + feed);
assert.ok(feed.includes('科亚·基塔加瓦'));
assert.strictEqual((feed.match(/进球 — 科亚/g) || []).length, 1);

const tl = box.liveImportantHtml(x, livePack, { sub: 'events' });
assert.ok(tl.includes('0-1') || tl.includes('>0-1<') || /0-1/.test(tl), tl);
assert.ok(!tl.includes('0-2'), 'timeline running score must stay 0-1, not 0-2: ' + tl);
assert.strictEqual((tl.match(/科亚·基塔加瓦/g) || []).length, 1);

console.log('live-events-dedupe-1389-test ok');
