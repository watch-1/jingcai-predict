'use strict';
// 1.9.267: 赛程/比分 list must stay live WITHOUT opening match detail —
//   (a) heartbeat poll keeps refreshing score+minute while the user stays on the list
//       (repro: Fiorentina list 0:1@51' vs detail 2:1@63');
//   (b) AF overlay adopts the fresher clock when sporttery's minute froze in the same phase;
//   (c) forced refresh is never swallowed by an in-flight plain load.
// Also: 赛后复盘 指标对照/硬仗检验 must keep the 16px gutters — the global
// `.pr-report { padding: 0 !important }` flatten used to eat them (user: 依然是顶格的).
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

// --- version pins ---
assert.ok(/VERSION=1\.9\.270/.test(ver));
assert.ok(/VERSION_CODE=306/.test(ver));
assert.ok(/jc-v1\.9\.270/.test(swJs));
assert.strictEqual(pkg.version, '1.9.270');
assert.strictEqual(cfg.version, '1.9.270');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.270\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-306\}"/.test(apkSh));

// --- client: schedule list heartbeat poll (ongoing soft refresh, not only pull) ---
assert.ok(/function scheduleHasPendingLive\(/.test(appJs), 'pending-live helper defined');
assert.ok(/ensureLiveScorePoll\(scheduleHasPendingLive\(model\.classifiedDay\)\)/.test(appJs),
  'resume keeps heartbeat while day has unfinished matches (even pre-KO)');
assert.ok(/function ensureLiveScorePoll\(keepAlive\)/.test(appJs), 'poll keyed on keepAlive, not frozen ids');
const pollBody = appJs.slice(appJs.indexOf('function ensureLiveScorePoll(keepAlive)'));
assert.ok(/const model = scheduleDayModel\(\);/.test(pollBody.slice(0, 1200)),
  'poll tick recomputes day model (fresh ids each tick)');
assert.ok(/loadLiveScores\(classifiedDay\.map\(x => String\(x\.id\)\), \{ force: true, bust: true \}\)/.test(pollBody.slice(0, 1600)),
  'poll tick busts client TTL AND server payload cache');
assert.ok(/\}, 30000\);/.test(pollBody.slice(0, 1700)), 'poll interval tightened to 30s');
assert.ok(!/ensureLiveScorePoll\(ids/.test(appJs), 'old frozen-ids poll signature removed');

// forced refresh must not be swallowed by an in-flight plain load (pull-refresh race)
assert.ok(/S\._liveScoresInflight/.test(appJs), 'in-flight live-scores promise tracked');
assert.ok(/if \(!force \|\| !S\._liveScoresInflight\) return S\.liveScores;/.test(appJs),
  'plain load still coalesces; forced load waits out the in-flight request');

// returning to foreground on the schedule tab refetches immediately
const visIdx = appJs.indexOf("addEventListener('visibilitychange'");
assert.ok(visIdx > 0, 'visibilitychange handler present');
const visBody = appJs.slice(visIdx, visIdx + 600);
assert.ok(/route\(\)\.name === 'schedule'/.test(visBody) && /pullRefreshScheduleLiveScores\(\)/.test(visBody),
  'foreground resume forces schedule live scores');

// --- CSS: 赛后复盘 gutters survive the .pr-report padding:0 !important flatten ---
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
function blocksFor(selector) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cssNoComments))) {
    const sels = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '));
    if (sels.includes(selector)) out.push(m[2]);
  }
  assert.ok(out.length, 'CSS block(s) found for selector: ' + selector);
  return out;
}
// the eater is still there (prematch briefing flatten) — our fix must out-prioritize it
assert.ok(blocksFor('.pr-report').some(b => /padding:\s*0\s*!important/.test(b)),
  'global .pr-report flatten still exists (fix must override, not depend on its removal)');
const gutterSel = '.view.sub.md-wrap--review .detail-pane--review > .dsec.pr-report';
assert.ok(blocksFor(gutterSel).some(b =>
  /padding-left:\s*var\(--pmr-gutter,\s*16px\)\s*!important/.test(b)
  && /padding-right:\s*var\(--pmr-gutter,\s*16px\)\s*!important/.test(b)),
  'review pane .dsec.pr-report left/right gutters restored with !important');
// 指标对照 / 硬仗检验 cards stay inside the gutter (1.9.246 rules intact)
assert.ok(blocksFor('.view.sub.md-wrap--review .detail-pane--review .pmr-hard')
  .some(b => /margin-left:\s*0/.test(b) && /margin-right:\s*0/.test(b)), 'pmr-hard no negative margins');
assert.ok(blocksFor('.view.sub.md-wrap--review .detail-pane--review .pmr-table-wrap')
  .some(b => /margin-left:\s*0/.test(b) && /margin-right:\s*0/.test(b)), 'pmr-table-wrap no negative margins');

// --- lib/live-scores functional: fresher AF clock + score win on the LIST path ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui247-'));
fs.mkdirSync(path.join(tmp, 'live-stats'), { recursive: true });
process.env.DATA_DIR = tmp;
process.env.API_FOOTBALL_KEY = 'ut-247-key';
// mapped fixture (list path — no detail opened)
fs.writeFileSync(path.join(tmp, 'live-stats', 'fixture-map.json'), JSON.stringify({
  'm:fio247': { fixtureId: 999247, sportteryMatchId: 'fio247', date: '2026-10-29' },
}));
global.fetch = async (url) => {
  const u = String(url);
  if (u.includes('live=all')) {
    return {
      headers: { get: () => null },
      json: async () => ({ response: [{
        fixture: { id: 999247, status: { short: '2H', elapsed: 63, extra: null } },
        goals: { home: 2, away: 1 },
        teams: { home: { id: 502, name: 'Fiorentina' }, away: { id: 499, name: 'Atalanta' } },
      }] }),
    };
  }
  return { headers: { get: () => null }, json: async () => ({ response: [] }) };
};
const ls = require('../lib/live-scores');

(async () => {
  // repro class: sporttery froze at 0:1 / 2H 51' while AF (= detail freshness) is 2:1 / 2H 63'
  const sportRow = {
    matchId: 'fio247', matchStatus: '5', matchStatusName: '进行中',
    matchPhaseTc: '3', matchPhaseTcName: '下半场',
    matchMinute: '51', matchMinuteExtra: '',
    sectionsNo999: '0:1', sectionsNo1: '0:1',
  };
  const fetchJson = async () => ({ value: [sportRow] });
  const p = await ls.getLiveScores({ ids: ['fio247'], fetchJson, base: 'http://unit.test', withAf: true, resolveMeta: {} });
  const row = p.data.fio247;
  assert.ok(p.afUsed, 'AF overlay used on the list path');
  assert.strictEqual(row.homeScore, 2, 'list adopts AF in-play score (home)');
  assert.strictEqual(row.awayScore, 1, 'list adopts AF in-play score (away)');
  assert.strictEqual(row.minute, 63, 'same-phase fresher AF minute wins over frozen sporttery 51');
  assert.strictEqual(row.phaseZh, '下半场');
  assert.strictEqual(row.scoreSource, 'af');
  assert.ok(row.live && !row.finished);

  // regression: AF behind sporttery clock must NOT roll the minute back
  const merged = ls.mergeAfOverlay(
    { id: 'x', live: true, finished: false, phase: '2H', phaseZh: '下半场', minute: 70, minuteExtra: null, homeScore: 1, awayScore: 0, full: '1:0', half: '0:0' },
    { live: true, finished: false, phase: '2H', phaseZh: '下半场', minute: 68, minuteExtra: null, homeScore: 1, awayScore: 0, source: 'api-football' },
    'x',
    false // afClockAhead false → keep sporttery clock
  );
  assert.strictEqual(merged.minute, 70, 'older AF clock does not roll minute back');

  // resolve budget: meta-less ids no longer burn the per-call cap
  const liveStatsPath = require.resolve('../lib/live-stats');
  const tried = [];
  require.cache[liveStatsPath] = {
    id: liveStatsPath, filename: liveStatsPath, loaded: true,
    exports: { resolveFixture: async ({ matchId }) => { tried.push(matchId); return { fixtureId: 1 }; } },
  };
  fs.writeFileSync(path.join(tmp, 'live-stats', 'fixture-map.json'), '{}');
  const data = {};
  const ids = [];
  for (let i = 1; i <= 5; i++) { const id = 'u' + i; ids.push(id); data[id] = { id, live: true, finished: false, homeScore: 0, awayScore: 0 }; }
  // only the LAST id carries meta; cap is RESOLVE_MAX_PER_CALL (< 5)
  const n = await ls.resolveUnmappedLiveFixtures(data, ids, { u5: { home: 'A', away: 'B', date: '2026-10-29', time: '20:00' } });
  assert.strictEqual(n, 1, 'meta-bearing id resolved');
  assert.deepStrictEqual(tried, ['u5'], 'meta-less leading ids do not burn the resolve budget');

  console.log('ui-247-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
