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

assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.strictEqual((index.match(/216mf401/g) || []).length, 6);
assert.ok(/VERSION=2\.1\.5\b/.test(version) && /VERSION_CODE=332\b/.test(version));

/* 410 behaviors still hold */
assert.ok(app.includes('const liveOn = isAnimLiveOn(id)'));
assert.ok(!app.includes("const animLiveBtn = finished ? '' :"));
assert.ok(app.includes('function animLiveWantPitch'));
assert.ok(app.includes('ensureAnimLiveRecapData(x)'));
assert.ok(app.includes('if (typeof animLiveWantPitch === \'function\' && !animLiveWantPitch'));

/* recap layout markers */
assert.ok(app.includes('function animLiveComparePageHtml'));
assert.ok(app.includes('function animLiveAxisColHtml'));
assert.ok(app.includes('als-axis-pair'));
assert.ok(app.includes('als-axis-bar') && app.includes('als-axis-track'));
assert.ok(css.includes('.als-axis-bar.is-home'));
assert.ok(css.includes('.als-axis-up') && css.includes('.als-axis-down'));
assert.ok(css.includes('backdrop-filter: blur(22px)'));
assert.ok(!app.includes('赛前 SportMonks 预测锁定，不是赛后回算'));

/* no duplicate animLiveLand in docked; landscape has one exit */
const icoStart = app.indexOf('function animLiveIconSvg');
const icoEnd = app.indexOf('function animLiveScoreOf');
assert.ok(icoStart > 0 && icoEnd > icoStart);
const icoBox = { esc: (s) => String(s == null ? '' : s) };
vm.runInNewContext(app.slice(icoStart, icoEnd), icoBox);
const dock = icoBox.animLiveCtrlsHtml('m1', 'docked');
const land = icoBox.animLiveCtrlsHtml('m1', 'landscape');
const pip = icoBox.animLiveCtrlsHtml('m1', 'pip');
assert.ok(dock.includes('als-ctrls-ios') && land.includes('als-ctrls-ios'));
assert.ok(dock.includes('als-expand') && dock.includes('aria-label="全屏观看"'));
assert.ok(!dock.includes('als-land') && !dock.includes('旋转屏幕'));
assert.strictEqual((dock.match(/data-act="animLiveLand"/g) || []).length, 1);
assert.ok(dock.includes('als-pip') && dock.includes('als-x') && dock.includes("kind === 'close'") === false);
assert.ok(dock.includes('animLiveClose') && dock.includes('<svg') && !dock.includes('✕'));
assert.ok(land.includes('aria-label="退出横屏"') && land.includes('als-land'));
assert.ok(!land.includes('als-expand'));
assert.strictEqual((land.match(/data-act="animLiveLand"/g) || []).length, 1);
assert.ok(!pip.includes('als-expand') && !pip.includes('als-land'));
assert.ok(pip.includes('animLivePip') && pip.includes('animLiveClose'));

/* button visual size is no longer the 40/44 hard discs */
const flat = css.replace(/\n/g, ' ');
assert.ok(css.includes('--als-face: 30px'));
assert.ok(css.includes('als-ctrls-ios'));
assert.ok(!/\.als-btn\.als-ico-btn\s*\{[^}]*min-width:\s*40px/.test(flat));
assert.ok(!/\.als-btn\.als-ico-btn\.als-land[^{]*\{[^}]*background:\s*rgba\(12,\s*16,\s*26/.test(flat));
assert.ok(/\.als-btn\.als-ico-btn::before/.test(css) || css.includes('.als-btn.als-ico-btn::before'));
assert.ok(css.includes('backdrop-filter: blur(16px)'));
assert.ok(css.includes('.als-ico') && /width:\s*15px/.test(css));

/* real-data recap: diverging pair, short result, no invented xG */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const box = {
  S: {
    smPredictions: { '2042881': { ok: true, hasPredictions: true, wdl: { h: 0.6296, d: 0.2035, a: 0.167 } } },
    smMatchfacts: {
      '2042881': {
        ok: true, leagueZh: '日职', score: { home: 1, away: 1 },
        goalBins: { labels: ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'], home: [4, 1, 1, 0, 1, 3], away: [1, 0, 1, 0, 0, 0] },
        season: [{ name: '场均期望进球', home: 1.3526, away: 1.2242, mean: 1.3409 }],
      },
    },
    smSurface: { '2042881': { xgCard: { ok: false, hasXg: false } } },
    liveStatsCache: { '2042881': { ok: true, finished: true, status: { short: 'FT' }, score: { home: 1, away: 1 }, events: [] } },
    statsCache: {
      '1|2': {
        h2h: { matches: [{ forCurrentHome: 'W' }, { forCurrentHome: 'W' }, { forCurrentHome: 'W' }, { forCurrentHome: 'L' }, { forCurrentHome: 'L' }], summary: { homeWins: 3, draws: 0, awayWins: 2 } },
        homeForm: { matches: [] }, awayForm: { matches: [] },
      },
    },
    liveScores: {},
  },
  esc,
  badge: function (name) { return '<span class="badge">' + esc((name || '?')[0]) + '</span>'; },
  smPredPackOf: function (id) { return box.S.smPredictions[String(id)] || null; },
  mfPackOf: function (id) { return box.S.smMatchfacts[String(id)] || null; },
  animLiveScoreOf: function (x, live) { return { home: 1, away: 1, phaseLab: '完场' }; },
  animLivePhaseOf: function () { return 'ft'; },
  isAnimLiveClosedPhase: function () { return true; },
  animLiveWantPitch: function () { return false; },
  animLiveFormPageHtml: function () { return ''; },
  animLiveStandingsRowOf: function () { return null; },
};
vm.runInNewContext(
  app.slice(app.indexOf('function animLiveStatsOf'), app.indexOf('function animLiveNamesHtml')),
  box
);
const x = { id: '2042881', home: '鹿岛鹿角', away: '清水鼓动', homeTeamId: '1', awayTeamId: '2', status: '完场', full: '1:1', league: '日职', date: '2026-11-20', time: '18:00' };
const live = box.S.liveStatsCache['2042881'];
const html = box.animLiveComparePageHtml(x, live);
assert.ok(html.includes('als-compare') && html.includes('als-axis-pair'));
assert.ok(html.includes('预测胜率') && html.includes('历史交手'));
assert.ok(html.includes('62.96%') && html.includes('20.35%'));
assert.ok(html.includes('完场 1-1'));
assert.ok(!html.includes('赛前 SportMonks') && !html.includes('不是赛后回算'));
assert.ok(html.includes('style="--p:'));
const pages = box.animLiveRecapPagesHtml(x, live).join('');
assert.ok(pages.includes('进球分布') && pages.includes('als-seg-bar'));
assert.ok(pages.includes('预期进球') && pages.includes('als-xg-table'));
assert.ok(!/xGA|xGD|上赛季|同主客/.test(pages));
assert.ok(!pages.includes('pitch-live'));

console.log('anim-live-stage-411-test ok');
