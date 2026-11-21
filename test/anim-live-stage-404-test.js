'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

const cardsRegionStart = app.indexOf('function animLiveH2hPageHtml');
const cardsRegionEnd = app.indexOf('function animLiveNamesHtml');
assert.ok(cardsRegionStart > 0 && cardsRegionEnd > cardsRegionStart, 'cards region');
const cardsRegion = app.slice(cardsRegionStart, cardsRegionEnd);
assert.ok(!cardsRegion.includes('预测胜率') && !cardsRegion.includes('als-pred') && !cardsRegion.includes('animLivePredPageHtml'),
  'no prediction markup in anim-live card helpers');
assert.ok(!/function animLiveCardsHtml[\s\S]*animLiveFormPageHtml/.test(cardsRegion),
  'form/standings page is not included in animLiveCardsHtml');
assert.ok(cardsRegion.includes('function animLiveH2hPageHtml') && cardsRegion.includes('历史交手'));
assert.ok(app.includes('paintAnimLiveStage(id)') && /tickAnimLiveCountdown[\s\S]*paintAnimLiveStage/.test(app),
  'countdown hitting 0 repaints the stage');
assert.ok(!css.includes('.anim-live-stage[data-phase="live"] .anim-live-cards'));
assert.ok(css.includes('.anim-live-stage[data-phase="ns"] .anim-live-cards'));
assert.ok(css.includes('#5b7cfa') && css.includes('#ff4d7a'));

const start = app.indexOf('function isAnimLiveOn');
const end = app.indexOf('function animLiveNamesHtml');
assert.ok(start > 0 && end > start);

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
const xNs = {
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
  homeForm: { matches: [{ outcome: 'W' }, { outcome: 'W' }, { outcome: 'D' }] },
  awayForm: { matches: [{ outcome: 'L' }, { outcome: 'W' }] },
};
sandbox.S.dataCache['league.standings'] = {
  tables: [{ rows: [{ teamId: 'h', played: 10, win: 4, draw: 2, lose: 4, points: 14 }] }],
};

const nsLive = { status: { short: 'NS' } };
const nsHtml = sandbox.animLiveCardsHtml(xNs, nsLive);
assert.ok(nsHtml, 'pre-match cards when data exists');
assert.ok(nsHtml.includes('历史交手'), 'pre-match includes 历史交手');
assert.ok(nsHtml.includes('开赛倒计时') && nsHtml.includes('data-anim-cd'), 'pre-match includes 倒计时');
assert.ok(nsHtml.includes('威尔士 1胜1平3负') || nsHtml.includes('威尔士 1胜 1平 3负') || /1胜/.test(nsHtml));
assert.ok(!nsHtml.includes('预测胜率') && !nsHtml.includes('als-pred'));
assert.ok(!nsHtml.includes('近 5 场') && !nsHtml.includes('赛季积分') && !nsHtml.includes('data-page="form"'));
assert.ok(!nsHtml.includes('data-page="pred"'));
assert.ok(nsHtml.includes('data-page="h2h"') && nsHtml.includes('data-page="count"'));
assert.ok(nsHtml.includes('anim-live-dots'), 'two real pages get dots');
assert.ok(nsHtml.includes('场地 卡迪夫球场 · 卡迪夫') && nsHtml.includes('天气 晴'));

const noData = sandbox.animLiveCardsHtml({
  id: 'm2',
  home: '主队甲',
  away: '客队乙',
  homeTeamId: 'x',
  awayTeamId: 'y',
  kickoffMs: kickFuture,
}, nsLive);
assert.ok(!noData.includes('预测胜率'));
assert.ok(noData.includes('开赛倒计时'), 'countdown still shown when kickoff exists');
assert.ok(!noData.includes('历史交手'), 'do not invent H2H');
assert.ok(!noData.includes('天气') && !noData.includes('场地'), 'do not invent venue/weather');
assert.ok(!noData.includes('anim-live-dots'), 'single page hides dots');

const inPlay = sandbox.animLiveCardsHtml(xNs, { status: { short: '1H' }, live: true });
assert.strictEqual(inPlay, '', 'after kickoff animLiveCardsHtml is empty');
const ft = sandbox.animLiveCardsHtml(xNs, { status: { short: 'FT' }, finished: true });
assert.strictEqual(ft, '', 'full-time cards are empty');
const kickedNs = sandbox.animLiveCardsHtml(Object.assign({}, xNs, { kickoffMs: Date.now() - 1000 }), nsLive);
assert.strictEqual(kickedNs, '', 'countdown 0 removes cards even if status is still NS');
assert.strictEqual(sandbox.animLiveH2hPageHtml(null), '');
assert.strictEqual(sandbox.animLiveCountPageHtml(xNs, { status: { short: '1H' }, live: true }), '');

const painted = [];
sandbox.paintAnimLiveStage = (id) => { painted.push(id); };
const cdEl = {
  getAttribute: (a) => (a === 'data-anim-cd' ? String(Date.now() - 5000) : ''),
  classList: { added: [], add(c) { this.added.push(c); } },
  querySelectorAll: () => [],
  closest: (sel) => (sel === '.anim-live-stage' ? { id: 'anim-live-stage-m1' } : null),
};
sandbox.document = {
  querySelectorAll: (sel) => (sel === '[data-anim-cd]' ? [cdEl] : []),
};
sandbox.tickAnimLiveCountdown();
assert.ok(cdEl.classList.added.includes('is-done'));
assert.deepStrictEqual(painted, ['m1'], 'tick after kickoff repaints the stage so cards can drop');

console.log('anim-live-stage-404-test ok');
