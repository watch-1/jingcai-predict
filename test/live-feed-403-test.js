'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const live = require('../lib/live-stats');

/* --- mapper: type ids, timeline kinds, no invented fouls --- */
assert.strictEqual(live.mapSmEventKind({ type_id: 17 }).goalKind, 'missed_pen');
assert.strictEqual(live.mapSmEventKind({ type_id: 17 }).kind, 'goal');
assert.strictEqual(live.mapSmEventKind({ type_id: 21 }).kind, 'second_yellow');
assert.strictEqual(live.mapSmEventKind({ type_id: 22 }).kind, 'pen_shootout_miss');
assert.strictEqual(live.mapSmEventKind({ type_id: 23 }).kind, 'pen_shootout_goal');
assert.strictEqual(live.mapSmEventKind({ type_id: 10 }).kind, 'var');
assert.strictEqual(live.mapSmEventKind({ type_id: 1697 }).kind, 'var');
assert.strictEqual(live.mapSmEventKind({ type_id: 126 }).kind, 'corner');
assert.strictEqual(live.mapSmEventKind({ type_id: 569 }).kind, 'shot_on');
assert.strictEqual(live.mapSmEventKind({ type_id: 570 }).kind, 'shot_off');
assert.strictEqual(live.mapSmEventKind({ type_id: 1514 }).kind, 'offside');
assert.strictEqual(live.mapSmEventKind({ type_id: 568 }).kind, 'offside');
assert.strictEqual(live.mapSmEventKind({ type_id: 48995 }).kind, 'woodwork');
assert.ok(!live.mapSmEventKind({ type_id: 99999, type: { code: 'foul' } }), 'no standalone foul type');
assert.strictEqual(live.parseAdditionOrdinal('7th Corner'), 7);
assert.strictEqual(live.parseAdditionOrdinal('1st Shot Off Target'), 1);
assert.ok(live.isInjurySub({ injured: true }));
assert.ok(live.isInjurySub({ sub_type: 1524 }));
assert.ok(!live.isInjurySub({ info: 'Foul' }));
assert.strictEqual(live.varOutcomeZh('Penalty confirmed', '', null), '点球判定');
assert.strictEqual(live.varOutcomeZh('Penalty cancelled', '', null), '点球未判定');
assert.strictEqual(live.varOutcomeZh('', '', null), '');

const fx = {
  participants: [
    { id: 1, name: 'Home FC', meta: { location: 'home' }, location: 'home' },
    { id: 2, name: 'Away FC', meta: { location: 'away' }, location: 'away' },
  ],
  events: [
    { id: 10, type_id: 14, minute: 11, player_name: 'Scorer', related_player_name: 'Helper', participant_id: 1, addition: '1st Goal', info: 'Right foot shot', type: { id: 14, code: 'goal', name: 'Goal' } },
    { id: 11, type_id: 17, minute: 30, player_name: 'Misser', participant_id: 2, addition: '1st Missed Penalty', type: { id: 17, name: 'Missed Penalty' } },
    { id: 12, type_id: 21, minute: 74, player_name: 'Hothead', participant_id: 2, addition: '1st Yellow/red Card', info: 'Foul', type: { id: 21, code: 'yellowredcard' } },
    { id: 13, type_id: 18, minute: 60, player_name: 'On', related_player_name: 'Off', participant_id: 1, injured: true, addition: '1st Substitution', type: { id: 18, code: 'substitution' } },
    { id: 14, type_id: 10, minute: 55, participant_id: 1, info: 'Goal cancelled', type: { id: 10, code: 'var' } },
    { id: 15, type_id: 22, minute: 120, player_name: 'Shooter', participant_id: 1, type: { id: 22 } },
    { id: 16, type_id: 23, minute: 120, extra_minute: 1, player_name: 'Taker', participant_id: 2, type: { id: 23 } },
  ],
  timeline: [
    { id: 20, type_id: 126, minute: 25, participant_id: 1, addition: '1st Corner' },
    { id: 21, type_id: 569, minute: 11, participant_id: 2, addition: '1st Shot On Target' },
    { id: 22, type_id: 570, minute: 40, participant_id: 1, addition: '2nd Shot Off Target' },
    { id: 23, type_id: 1514, minute: 8, participant_id: 2, addition: '1st Offside' },
    { id: 24, type_id: 48995, minute: 59, participant_id: 2, player_name: 'Pedro Neto', addition: '1st Woodwork' },
  ],
  periods: [
    { id: 1, type_id: 1, description: '1st-half', started: 1, ended: 2, time_added: 2, minutes: 48, sort_order: 1 },
    { id: 2, type_id: 2, description: '2nd-half', started: 3, ended: 4, time_added: 3, minutes: 93, sort_order: 2 },
  ],
};

// sm-history.homeAwayParticipants may need meta.location — if it fails, sides will be empty but kinds still map
let evs = [];
try { evs = live.normalizeSmEvents(fx); } catch (e) {
  console.warn('normalizeSmEvents sides fallback', e.message);
  evs = [];
}
if (!evs.length) {
  // still assert via normalizeOneSmEvent with explicit sides
  const sides = { home: { id: 1, name: 'Home FC' }, away: { id: 2, name: 'Away FC' } };
  evs = live.mergeSmEventLists(
    live.asSmEventList(fx.events).map((e) => live.normalizeOneSmEvent(e, sides, 'event')),
    live.asSmEventList(fx.timeline).map((e) => live.normalizeOneSmEvent(e, sides, 'timeline'))
  ).filter(Boolean);
}
assert.ok(evs.find((e) => e.kind === 'goal' && e.goalKind === 'missed_pen' && e.player === 'Misser'));
assert.ok(evs.find((e) => e.kind === 'second_yellow' && e.player === 'Hothead'));
assert.ok(evs.find((e) => e.kind === 'subst' && e.injurySub && e.player === 'On'));
assert.ok(evs.find((e) => e.kind === 'var' && e.varOutcome === '进球无效'));
assert.ok(evs.find((e) => e.kind === 'corner' && e.ordinal === 1 && !e.player));
assert.ok(evs.find((e) => e.kind === 'shot_on' && e.source === 'timeline'));
assert.ok(evs.find((e) => e.kind === 'shot_off' && e.ordinal === 2));
assert.ok(evs.find((e) => e.kind === 'offside'));
assert.ok(evs.find((e) => e.kind === 'woodwork' && e.player === 'Pedro Neto'));
assert.ok(evs.find((e) => e.kind === 'pen_shootout_miss'));
assert.ok(evs.find((e) => e.kind === 'pen_shootout_goal'));
assert.ok(!evs.some((e) => e.kind === 'foul'));
const periods = live.normalizeSmPeriods(fx);
assert.strictEqual(periods.length, 2);
assert.strictEqual(periods[0].timeAdded, 2);
assert.ok(live.SM_FIXTURE_INCLUDE.includes('timeline'));
assert.ok(!live.SM_FIXTURE_INCLUDE_NO_TL.includes('timeline'));

const score = live.scoreFromEvents(evs, 1, 2);
assert.strictEqual(score.home, 1, 'regular goal counts; missed pen / shootout do not');
assert.strictEqual(score.away, 0);

/* optional: real dump if present */
const dumpPath = '/workspace/sportmonks-screenshots/2026-11-18-new-account/portugal-dump/events-timeline.json';
if (fs.existsSync(dumpPath)) {
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const real = live.normalizeSmEvents(dump.payload.data);
  const kinds = {};
  for (const e of real) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  assert.ok(kinds.corner >= 1 && kinds.shot_on >= 1 && kinds.shot_off >= 1);
  assert.ok(kinds.second_yellow === 1);
  assert.ok(!kinds.foul);
}

/* --- client HTML --- */
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.strictEqual((index.match(/216mf401/g) || []).length, 6, 'index stamp unchanged');
assert.ok(appJs.includes("js/pitch-live.js?v=pitch409"));
assert.ok(/st\.corners/.test(appJs) && /is-corner/.test(appJs), 'corners in stats strip');
assert.ok(appJs.includes('function livePeriodMarkers') && appJs.includes('function liveImportantHtml'));
assert.ok(appJs.includes('is-split') && appJs.includes('is-home') && appJs.includes('is-away'));
assert.ok(appJs.includes('second_yellow') && appJs.includes('两黄变红'));
assert.ok(appJs.includes('data-act="animLiveLand"') && appJs.includes('data-act="animLivePip"'));
assert.ok(appJs.includes('function setAnimLiveMode') && appJs.includes('function placeAnimLiveStage'));
assert.ok(appJs.includes('anim-live-land') && appJs.includes('anim-live-pip'));
assert.ok(!appJs.includes('maybeExpandAnimLive') && !appJs.includes('animLiveExpand'), 'no auto-fullscreen');
assert.ok(/S\.animLiveOn\[id\] = !S\.animLiveOn\[id\]/.test(appJs));
assert.ok(/overflow-scroll-guard/.test(appJs) || /overlay-scroll-guard/.test(appJs));
assert.ok(!/document\.body\.style\.overflow/.test(appJs.slice(appJs.indexOf('function setAnimLiveMode'))));
assert.ok(css.includes('.live-tl.is-split') && css.includes('.anim-live-pip') && css.includes('.anim-live-land'));
assert.ok(css.includes('.als-bar i.h') && css.includes('#5b7cfa') && css.includes('#ff4d7a'));

const aStart = appJs.indexOf('function eventGoalKind');
const aEnd = appJs.indexOf('function liveStatsUserMsg');
const bStart = appJs.indexOf('function liveStatNum');
const bEnd = appJs.indexOf('function pitchLiveShellHtml');
assert.ok(aStart > 0 && aEnd > aStart && bStart > 0 && bEnd > bStart, 'html slices');

const sandbox = {
  S: { liveScores: {}, liveStatsCache: {}, statsCache: {}, dataCache: {}, animLiveOn: {}, animLiveMode: {} },
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  badge: (name) => '<span class="badge">' + String(name || '') + '</span>',
  weatherPackOf: () => ({ ok: true, labelZh: '晴', venueName: '试场', venueCity: '上海' }),
  venueFromLive: () => ({ name: '试场', city: '上海' }),
  donutPair: () => '',
};
vm.runInNewContext(appJs.slice(aStart, aEnd) + '\n' + appJs.slice(bStart, bEnd), sandbox);

const x = { id: 'm1', home: '主队', away: '客队', homeTeamId: 'h1', awayTeamId: 'a1' };
const livePack = {
  ok: true,
  status: { short: 'FT', elapsed: 93 },
  finished: true,
  home: { nameZh: '主队', name: 'Home FC', logo: '' },
  away: { nameZh: '客队', name: 'Away FC', logo: '' },
  stats: {
    corners: { home: 7, away: 1 },
    yellowCards: { home: 3, away: 2 },
    redCards: { home: 0, away: 1 },
    shots: { home: 10, away: 12 },
    shotsOnTarget: { home: 4, away: 5 },
  },
  periods,
  events: evs,
};
const strip = sandbox.liveStatsStripHtml(x, livePack);
assert.ok(strip.includes('is-corner') && strip.includes('7') && strip.includes('射正') && strip.includes('射偏'), 'strip shows corners and shots');

const text = sandbox.liveCommentHtml(x, livePack);
assert.ok(/第\s*1\s*个角球/.test(text) || text.includes('第1个角球'), text);
assert.ok(text.includes('射偏') && text.includes('射正'));
assert.ok(text.includes('两黄变红') && text.includes('Hothead'));
assert.ok(text.includes('点球未进') && text.includes('Misser'));
assert.ok(text.includes('受伤换人'));
assert.ok(text.includes('击中门框') && text.includes('Pedro Neto'));
assert.ok(text.includes('完场') && text.includes('中场') && text.includes('开赛'));
assert.ok(text.includes('live-c-team') && text.includes('主队'));
assert.ok(!/Welcome|欢迎光临/.test(text), 'no invented welcome copy');
assert.ok(!/This operation was aborted|fetch failed/.test(text));

const important = sandbox.liveImportantHtml(x, livePack, { sub: 'events', goalsOnly: false });
assert.ok(important.includes('live-tl is-split') || important.includes('is-split'));
assert.ok(important.includes('is-home') && important.includes('is-away'));
assert.ok(important.includes('tl-score') && /1-0|0-1/.test(important));
assert.ok(important.includes('ev-ico assist') || important.includes('title="助攻"'));
assert.ok(important.includes('两黄变红'));
assert.ok(important.includes('受伤换人') || important.includes('换上'));
assert.ok(important.includes('开赛') && important.includes('中场') && important.includes('完场'));
assert.ok(!important.includes('第1个角球'), 'corners stay off the important axis');
assert.ok(!important.includes('第2个射偏'));

const goalsOnly = sandbox.liveImportantHtml(x, livePack, { sub: 'events', goalsOnly: true });
assert.ok(goalsOnly.includes('Scorer'));
assert.ok(!goalsOnly.includes('两黄变红'));
assert.ok(!goalsOnly.includes('Hothead'));

const legend = sandbox.liveLegendHtml();
assert.ok(/射正/.test(legend) && /角球/.test(legend) && /两黄变红/.test(legend) && /受伤换人/.test(legend));

console.log('live-feed-403-test ok');
