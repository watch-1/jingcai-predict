'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(app.includes('function animLiveScorebarHtml'), 'scorebar helper exists');
assert.ok(app.includes('function animLiveScoreOf'));
assert.ok(css.includes('.anim-live-scorebar'));
assert.ok(css.includes('#5b7cfa') && css.includes('#ff4d7a'), 'pred-bar colors stay');
assert.ok(!css.includes('.anim-live-stage[data-phase="live"] .anim-live-cards {') ||
  /\[data-phase="live"\] \.anim-live-cards\s*\{[^}]*display\s*:\s*none/.test(css),
  'live cards are hidden, not overlaid');
assert.ok(!/\.anim-live-land \.anim-live-cards\s*,/.test(css)
  && !/\.anim-live-land \.anim-live-cards\s*\{/.test(css),
  'no leftover unscoped landscape card overlay');
assert.ok(css.includes('.anim-live-stage[data-mode="landscape"][data-phase="live"] .anim-live-visual'));
assert.ok(/\[data-mode="landscape"\]\[data-phase="live"\] \.anim-live-visual[^{]*\{[^}]*position:\s*relative/.test(css),
  'landscape in-play visual is in flow, not an overlay');
assert.ok(/\.anim-live-scorebar\s*\{[^}]*position:\s*relative/.test(css)
  && /\.anim-live-scorebar\s*\{[^}]*flex:\s*none/.test(css),
  'scorebar is a real bottom strip, not an overlay');
assert.ok(!/\.anim-live-scorebar\s*\{[^}]*position:\s*absolute/.test(css));

const start = app.indexOf('function isAnimLiveOn');
const end = app.indexOf('function bindAnimLiveSwipe');
assert.ok(start > 0 && end > start, 'scorebar/stage slice');

const sandbox = {
  S: {
    animLiveOn: { m1: true },
    animLiveMode: {},
    statsCache: {},
    liveScores: {},
    liveStatsCache: {},
    dataCache: {},
  },
  esc: (s) => String(s == null ? '' : s),
  window: { JCPitchLive: { canAnimateLive: () => false } },
  document: { querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ innerHTML: '', firstElementChild: null }) },
  pitchLivePhaseOf: (x, live) => ({
    phase: (live && live.status && live.status.short) || 'NS',
    finished: !!(live && live.finished),
    live: !!(live && live.live),
    kickoffMs: x && x.kickoffMs,
  }),
  liveStatusZh: (short, elapsed) => {
    const map = { NS: '未开赛', '1H': '上半场', HT: '中场', '2H': '下半场', FT: '完场', LIVE: '进行中' };
    const lab = map[short] || short || '';
    if (elapsed != null && ['1H', '2H', 'ET', 'LIVE'].includes(short)) return lab + ' ' + elapsed + "'";
    return lab;
  },
  badge: (name) => '<span class="badge">' + String(name || '').slice(0, 1) + '</span>',
  pitchLiveShellHtml: (x) => '<section class="pitch-live" id="pitch-live-' + String((x && x.id) || '') + '"></section>',
  weatherPackOf: (x) => (x && x._wx) || null,
  venueFromLive: (x) => (x && x._venue) || null,
  summarizeOutcomes: (list) => {
    const s = { w: 0, d: 0, l: 0 };
    (list || []).forEach((m) => {
      if (m.forCurrentHome === 'W') s.w += 1;
      else if (m.forCurrentHome === 'D') s.d += 1;
      else s.l += 1;
    });
    return s;
  },
  matchKickoffMs: (x) => (x && x.kickoffMs),
};
vm.runInNewContext(app.slice(start, end), sandbox);

const kickFuture = Date.now() + 2 * 3600 * 1000 + 15 * 60 * 1000;
const x = {
  id: 'm1',
  home: '威尔士',
  away: '葡萄牙',
  homeTeamId: 'h',
  awayTeamId: 'a',
  kickoffMs: kickFuture,
  _wx: { ok: true, labelZh: '晴', venueName: '卡迪夫球场', venueCity: '卡迪夫' },
  _venue: { name: '卡迪夫球场', city: '卡迪夫' },
};
sandbox.S.statsCache['h|a'] = {
  h2h: {
    matches: [
      { forCurrentHome: 'L' },
      { forCurrentHome: 'D' },
      { forCurrentHome: 'L' },
      { forCurrentHome: 'W' },
      { forCurrentHome: 'L' },
    ],
  },
};

const liveIn = {
  ok: true,
  status: { short: '1H', elapsed: 32 },
  live: true,
  score: { home: 1, away: 0 },
  stats: { yellowCards: { home: 1, away: 0 }, redCards: { home: 0, away: 0 } },
};

const landLive = sandbox.animLiveStageInnerHtml(x, liveIn, 'landscape');
assert.ok(!landLive.includes('anim-live-cards'), 'after kickoff landscape has no swipe cards');
assert.ok(!landLive.includes('预测胜率') && !landLive.includes('历史交手') && !landLive.includes('开赛倒计时'));
assert.ok(landLive.includes('anim-live-visual'), 'landscape in-play includes visual');
assert.ok(landLive.includes('anim-live-scorebar'), 'landscape in-play includes score bar');
const visAt = landLive.indexOf('anim-live-visual');
const barAt = landLive.indexOf('anim-live-scorebar');
assert.ok(visAt >= 0 && barAt > visAt, 'score bar is below the visual in HTML, not an overlay class');
assert.ok(landLive.includes('1-0'), 'real score');
assert.ok(landLive.includes('上半场') && landLive.includes("32'"), 'real phase and minute');
assert.ok(landLive.includes('威尔士') && landLive.includes('葡萄牙'));
assert.ok(landLive.includes('als-sb-yc') && landLive.includes('>1<'), 'real yellow card shown');
assert.ok(!landLive.includes('als-sb-rc'), 'do not invent a red card when count is 0');

const dockLive = sandbox.animLiveStageInnerHtml(x, liveIn, 'docked');
assert.ok(dockLive.includes('anim-live-scorebar'), 'docked in-play score sits under the pitch');
assert.ok(dockLive.indexOf('anim-live-visual') < dockLive.indexOf('anim-live-scorebar'));
assert.ok(!dockLive.includes('anim-live-cards') && !dockLive.includes('历史交手'));

const pipLive = sandbox.animLiveStageInnerHtml(x, liveIn, 'pip');
assert.ok(!pipLive.includes('anim-live-cards') && !pipLive.includes('历史交手'));
assert.ok(pipLive.includes('anim-live-scorebar') && pipLive.includes('is-thin'), 'optional thin PiP score line');
assert.ok(!pipLive.includes('als-sb-yc'), 'PiP stays compact, no card ticks');

const ftLive = sandbox.animLiveStageInnerHtml(x, {
  ok: true,
  status: { short: 'FT', elapsed: 93 },
  finished: true,
  score: { home: 1, away: 0 },
}, 'landscape');
assert.ok(ftLive.includes('anim-live-scorebar') && ftLive.includes('完场'));
assert.ok(!ftLive.includes('anim-live-cards') && !ftLive.includes('历史交手'));

const nsHtml = sandbox.animLiveStageInnerHtml(x, { status: { short: 'NS' } }, 'landscape');
assert.ok(nsHtml.includes('历史交手') && nsHtml.includes('开赛倒计时'));
assert.ok(!nsHtml.includes('预测胜率') && !nsHtml.includes('als-pred') && !nsHtml.includes('data-page="pred"'));
assert.ok(!nsHtml.includes('anim-live-scorebar'), 'pre-match has no in-play score bar');
assert.ok(nsHtml.includes('data-page="h2h"') && nsHtml.includes('data-page="count"'));

assert.ok(sandbox.animLiveScorebarHtml(x, liveIn, 'docked').includes('anim-live-scorebar'), 'docked in-play has a score bar');
assert.strictEqual(sandbox.animLiveScorebarHtml(x, { status: { short: 'NS' } }, 'landscape'), '');
assert.ok(!sandbox.animLiveScorebarHtml(x, {
  status: { short: '1H', elapsed: 10 },
  live: true,
}, 'landscape').includes('0-0'), 'do not invent 0-0 when score is missing');

const noInvent = sandbox.animLiveScorebarHtml(x, {
  status: { short: '1H', elapsed: 10 },
  live: true,
  score: { home: 0, away: 1 },
}, 'landscape');
assert.ok(noInvent.includes('0-1'), 'real 0-1 is allowed');

console.log('anim-live-stage-405-test ok');
