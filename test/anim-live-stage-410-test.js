'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');

assert.ok(app.includes("js/pitch-live.js?v=pitch409"), 'leave pitch409 unless pitch-live.js changes');
assert.ok(!app.includes("js/pitch-live.js?v=pitch408"));
assert.strictEqual((index.match(/216mf401/g) || []).length, 6);
assert.ok(/VERSION=2\.1\.5\b/.test(version) && /VERSION_CODE=332\b/.test(version));

assert.ok(app.includes('function animLivePredPageHtml'));
assert.ok(app.includes('function animLiveRecapPagesHtml'));
assert.ok(app.includes('function animLiveWantPitch'));
assert.ok(app.includes('function ensureAnimLiveRecapData'));
assert.ok(!app.includes('赛前 SportMonks 预测锁定，不是赛后回算'), 'bury internal footnote');
assert.ok(app.includes('不编造预测、交手、进球分布或 xG'));
assert.ok(!app.includes('不编造 xGA / xGD 或上赛季窗口'));
assert.ok(app.includes('anim-live-recap-bg'));
assert.ok(css.includes('.als-axis') && css.includes('.als-axis-pair'));
assert.ok(css.includes('.anim-live-stage[data-phase="ft"]'));

// Button stays after FT
assert.ok(app.includes('const liveOn = isAnimLiveOn(id)'));
assert.ok(!app.includes("const animLiveBtn = finished ? '' :"));
assert.ok(app.includes('data-act="openAnimLive"'));
assert.ok(!/if \(!canOpenAnimLive\(x0/.test(app));
assert.ok(app.includes('ensureAnimLiveRecapData(x)'));
assert.ok(app.includes('if (typeof animLiveWantPitch === \'function\' && !animLiveWantPitch'));

// Banned intel cards must not be pulled into the recap builders
const recapStart = app.indexOf('function animLiveStatsOf');
const recapEnd = app.indexOf('function animLiveNamesHtml');
assert.ok(recapStart > 0 && recapEnd > recapStart);
const recapSrc = app.slice(recapStart, recapEnd);
assert.ok(!/赔率隐含概率对比|相关资讯|胜平负让球|近10场过程对照/.test(recapSrc));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const box = {
  S: {
    smPredictions: {
      '2042881': {
        ok: true, hasPredictions: true,
        wdl: { h: 0.6296, d: 0.20350000000000001, a: 0.16699999999999998 },
        frozenAt: '2026-11-20T10:00:00.000Z', noteZh: '',
      },
    },
    smMatchfacts: {
      '2042881': {
        ok: true, leagueZh: '日职',
        score: { home: 1, away: 1 },
        goalBins: { labels: ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'], home: [4, 1, 1, 0, 1, 3], away: [1, 0, 1, 0, 0, 0] },
        season: [{ name: '场均期望进球', home: 1.3525977528089892, away: 1.2241807692307694, mean: 1.340893979391105 }],
      },
    },
    smSurface: { '2042881': { xgCard: { ok: false, hasXg: false } } },
    liveStatsCache: {
      '2042881': { ok: true, finished: true, status: { short: 'FT' }, score: { home: 1, away: 1 }, events: [
        { kind: 'goal', side: 'home', elapsed: 12 },
        { kind: 'goal', side: 'away', elapsed: 77 },
      ] },
    },
    statsCache: {
      '1|2': {
        h2h: { matches: [
          { forCurrentHome: 'W' }, { forCurrentHome: 'W' }, { forCurrentHome: 'W' },
          { forCurrentHome: 'L' }, { forCurrentHome: 'L' },
        ], summary: { homeWins: 3, draws: 0, awayWins: 2 } },
        homeForm: { matches: [] }, awayForm: { matches: [] },
      },
    },
    liveScores: {},
  },
  esc,
  smPredPackOf: function (id) { return box.S.smPredictions[String(id)] || null; },
  mfPackOf: function (id) { return box.S.smMatchfacts[String(id)] || null; },
  animLiveScoreOf: function (x, live) {
    const s = (live && live.score) || {};
    return { home: s.home, away: s.away, phaseLab: '完场' };
  },
  animLivePhaseOf: function (x, live) {
    if (x && (x.status === '完场' || x.full || (live && live.finished))) return 'ft';
    return 'ns';
  },
  isAnimLiveClosedPhase: function (x) { return !!(x && (x.status === '完场' || x.full)); },
  animLiveFormPageHtml: function () { return ''; },
  animLiveH2hPageHtml: function () { return ''; },
  animLiveCountPageHtml: function () { return ''; },
  animLiveStandingsRowOf: function () { return null; },
  summarizeOutcomes: function () { return { w: 3, d: 0, l: 2 }; },
};

vm.runInNewContext(app.slice(recapStart, recapEnd), box);
// animLiveWantPitch lives next to canOpenAnimLive, outside the recap slice
box.animLiveWantPitch = function (x, live) {
  if (!x) return false;
  if (box.isAnimLiveClosedPhase(x)) return false;
  const phase = box.animLivePhaseOf(x, live);
  return phase !== 'ft';
};


const x = { id: '2042881', home: '鹿岛鹿角', away: '清水鼓动', homeTeamId: '1', awayTeamId: '2', status: '完场', full: '1:1', league: '日职', date: '2026-11-20', time: '18:00' };
const live = box.S.liveStatsCache['2042881'];

const wdl = box.animLivePredWdlOf(x);
assert.ok(wdl);
assert.ok(Math.abs(wdl.h - 0.6296) < 1e-9);
assert.ok(box.animLiveWantPitch(x, live) === false);

const pred = box.animLiveComparePageHtml(x, live);
assert.ok(pred.includes('预测胜率'));
assert.ok(pred.includes('62.96%'));
assert.ok(pred.includes('20.35%'));
assert.ok(pred.includes('16.7%') || pred.includes('16.70%'));
assert.ok(pred.includes('完场 1-1'));
assert.ok(!pred.includes('赛前 SportMonks'));
assert.ok(pred.includes('历史交手'));
assert.ok(pred.includes('>3<') || pred.includes('>3</b>'));
assert.ok(pred.includes('>2<') || pred.includes('>2</b>'));

// this-match bins win over 近5场 when official goal events exist
const bins = box.animLiveGoalBinsOf(x, live);
assert.strictEqual(bins.scope, '本场');
assert.strictEqual(JSON.stringify(bins.home), JSON.stringify([1, 0, 0, 0, 0, 0]));
assert.strictEqual(JSON.stringify(bins.away), JSON.stringify([0, 0, 0, 0, 0, 1]));
const binsPage = box.animLiveGoalBinsPageHtml(x, live);
assert.ok(binsPage.includes('进球分布 · 本场'));
assert.ok(!binsPage.includes('不含本场') || bins.scope === '本场');

// without this-match events, fall back to real 近5场 bins and do not invent
const noEvLive = Object.assign({}, live, { events: [] });
const recent = box.animLiveGoalBinsOf(x, noEvLive);
assert.strictEqual(recent.scope, '近5场');
assert.strictEqual(JSON.stringify(recent.home), JSON.stringify([4, 1, 1, 0, 1, 3]));

const seasonXg = box.animLiveSeasonXgOf(x);
assert.ok(seasonXg);
assert.ok(Math.abs(seasonXg.home - 1.3525977528089892) < 1e-9);
assert.strictEqual(box.animLiveThisMatchXgOf(x), null, 'no this-match xG must be omitted');
const xgPage = box.animLiveXgPageHtml(x);
assert.ok(xgPage.includes('本赛季场均预期进球'));
assert.ok(xgPage.includes('1.35'));
assert.ok(xgPage.includes('1.22'));
assert.ok(!xgPage.includes('本场 xG'));
assert.ok(!/xGA|xGD|上赛季/.test(xgPage), 'do not invent missing xG windows');

const pages = box.animLiveRecapPagesHtml(x, live);
assert.ok(pages.length >= 3);
const cards = box.animLiveCardsHtml(x, live);
assert.ok(cards.includes('预测胜率'));
assert.ok(cards.includes('历史交手'));
assert.ok(cards.includes('进球分布'));
assert.ok(cards.includes('预期进球'));
assert.ok(!cards.includes('pitch-live'));
assert.ok(!cards.includes('赔率隐含概率对比'));

const emptyX = { id: 'none', home: '甲', away: '乙', status: '完场' };
const emptyCards = box.animLiveCardsHtml(emptyX, { finished: true });
assert.ok(emptyCards.includes('本场暂无可用的赛后数据'));

// in-play still uses the NS/live path, not recap
box.animLivePhaseOf = function () { return 'live'; };
assert.strictEqual(box.animLiveCardsHtml({ id: 'inplay' }, { finished: false }), '');

console.log('anim-live-stage-410-test ok');
