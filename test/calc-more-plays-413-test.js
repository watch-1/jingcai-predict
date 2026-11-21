'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');

assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.strictEqual((index.match(/216mf401/g) || []).length, 6);
assert.ok(/VERSION=2\.1\.5\b/.test(version) && /VERSION_CODE=332\b/.test(version));

assert.ok(app.includes('function calcMoreSheetEl'));
assert.ok(app.includes('function calcMoreListSnap'));
assert.ok(app.includes('function paintCalcMoreSheet'));
assert.ok(app.includes('function settleWithTimeout'));
assert.ok(app.includes('ODDS_SNAP_INFLIGHT_MAX_MS'));
assert.ok(app.includes('function calcMoreLoadBudgetMs'));
assert.ok(app.includes("if (!o) return ''"));
assert.ok(app.includes('暂无更多玩法数据，请稍后重试'));
assert.ok(!/if \(_oddsSnapInflight\[key\]\) return _oddsSnapInflight\[key\];/.test(app));

function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + 1);
  assert.ok(a >= 0 && b > a, 'slice missing ' + start + ' / ' + end);
  return src.slice(a, b);
}

const LBL = { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } };
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const renderBox = {
  S: { calcSel: {} },
  LBL,
  esc,
  fmtOdd: function (v) {
    if (v == null || v === '' || Number.isNaN(Number(v))) return '-';
    const n = Number(v);
    return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, (m) => m.startsWith('.') ? m : '');
  },
  CRS_MORE_WIN: [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2]],
  CRS_MORE_DRAW: [[0, 0], [1, 1], [2, 2], [3, 3]],
  CRS_MORE_LOSE: [[0, 1], [1, 2], [2, 3], [0, 2], [1, 3], [2, 4], [0, 3], [1, 4], [2, 5], [0, 4], [1, 5], [0, 5]],
  crsPoolKey: function (hg, ag) { return 's' + String(hg).padStart(2, '0') + 's' + String(ag).padStart(2, '0'); },
  crsCalcSelKey: function (hg, ag) { return 'crs_' + this.crsPoolKey(hg, ag); },
  calcMatchClosed: function () { return false; },
};
vm.runInNewContext(
  sliceBetween(app, 'function calcMorePickCell', 'function bonusOptModes')
  + '\n'
  + sliceBetween(app, 'function renderCalcMorePickables', 'function calcMoreLoadBudgetMs'),
  renderBox
);

const listMatch = {
  id: '2042905', home: '布里斯班', away: '悉尼FC', date: '2026-11-21', time: '16:40',
  had: { h: 2.35, d: 3.05, a: 2.6 },
  hhad: { h: 5.25, d: 4, a: 1.43, goalLine: '-1' },
};

const hadOnly = renderBox.renderCalcMorePickables('2042905', { ok: true, pools: { had: listMatch.had } }, { id: '2042905', home: '布里斯班', away: '悉尼FC' });
assert.ok(hadOnly.includes('胜平负/让球') && hadOnly.includes('2.35') && hadOnly.includes('3.05'));
assert.ok(!hadOnly.includes('比分') && !hadOnly.includes('总进球') && !hadOnly.includes('半全场'));
const emptySnap = renderBox.renderCalcMorePickables('2042905', { ok: false }, { id: '2042905' });
assert.ok(emptySnap.includes('暂无更多玩法数据，请稍后重试'));
const noThrow = renderBox.renderCalcMorePickables('2042905', { ok: true, pools: { ttg: { s0: 8, s1: 4 } } }, { id: '2042905' });
assert.ok(noThrow.includes('总进球') && !noThrow.includes('比分'));

const fromList = renderBox.renderCalcMorePickables('2042905', null, listMatch);
assert.ok(fromList.includes('2.35') && fromList.includes('5.25') && fromList.includes('让胜'));
assert.ok(!fromList.includes('加载更多玩法'));

(async () => {
  const opened = [];
  const sheetState = { html: '', hasNode: false };
  const openBox = Object.assign({}, renderBox, {
    setTimeout, clearTimeout,
    findMatch: function () { return listMatch; },
    calcMatchClosed: function () { return false; },
    toast: function () {},
    openSheetHtml: function (html) { opened.push(html); sheetState.html = html; },
    calcMoreSheetEl: function () { return null; },
    calcMoreLoadBudgetMs: function () { return 40; },
    loadOddsSnapshot: function () { return new Promise(() => {}); },
  });
  vm.runInNewContext(
    sliceBetween(app, 'function settleWithTimeout', 'async function loadOddsSnapshot'),
    openBox
  );
  vm.runInNewContext(
    sliceBetween(app, 'function calcMoreListSnap', 'function pageSchedule'),
    openBox
  );
  openBox.calcMoreLoadBudgetMs = function () { return 40; };
  openBox.calcMoreSheetEl = function () { return null; };

  await openBox.openCalcMoreSheet('2042905');
  const html = opened.join('\n') + '\n' + (sheetState.html || '');
  assert.ok(html.includes('2.35') && html.includes('5.25'), 'list HAD/HHAD painted without snapshot');
  assert.ok(!html.includes('加载更多玩法'), 'spinner must not remain after timeout when list odds exist');
  assert.ok(html.includes('取消') && html.includes('确定') && html.includes('玩法说明'));

  opened.length = 0;
  sheetState.html = '';
  const bare = { id: 'x', home: 'A', away: 'B', date: '2026-11-21' };
  openBox.findMatch = function () { return bare; };
  openBox.loadOddsSnapshot = function () { return Promise.reject(new Error('网络超时，请稍后重试')); };
  await openBox.openCalcMoreSheet('x');
  const failHtml = opened.join('\n') + '\n' + (sheetState.html || '');
  assert.ok(failHtml.includes('暂无更多玩法数据，请稍后重试'));
  const last = opened[opened.length - 1] || '';
  assert.ok(!last.includes('加载更多玩法'), 'final paint after failure is not the spinner');

  const cache = {};
  const loadBox = {
    setTimeout, clearTimeout,
    _oddsSnapInflight: Object.create(null),
    ODDS_SNAP_INFLIGHT_MAX_MS: 13000,
    oddsSnapCache: function () { return cache; },
    matchKickoffMs: function () { return Date.now() + 86400000; },
    api: async function (p) {
      if (String(p).indexOf('/odds-live') >= 0) {
        return { ok: true, pools: { had: { h: 2.35, d: 3.05, a: 2.6 } } };
      }
      return { ok: false, reason: 'missing' };
    },
  };
  vm.runInNewContext(
    sliceBetween(app, 'function settleWithTimeout', 'function warmupMatchOddsAndReports'),
    loadBox
  );
  const key = '2042905|2026-11-21';
  loadBox._oddsSnapInflight[key] = { promise: new Promise(() => {}), at: Date.now() - 20000 };
  const raced = await Promise.race([
    loadBox.loadOddsSnapshot('2042905', '2026-11-21', { id: '2042905' }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('stalled on hung inflight')), 500)),
  ]);
  assert.ok(raced && raced.ok && raced.pools && raced.pools.had && raced.pools.had.h === 2.35);

  let calls = 0;
  loadBox.api = function () {
    calls += 1;
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, pools: { had: { h: 1.5, d: 3, a: 5 } } }), 60));
  };
  const p1 = loadBox.loadOddsSnapshot('9', '2026-11-21', { id: '9' });
  const p2 = loadBox.loadOddsSnapshot('9', '2026-11-21', { id: '9' });
  const [a, b] = await Promise.all([p1, p2]);
  assert.strictEqual(calls, 1);
  assert.strictEqual(a.pools.had.h, 1.5);
  assert.strictEqual(b.pools.had.h, 1.5);

  console.log('calc-more-plays-413-test ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
