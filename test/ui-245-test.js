'use strict';
// 1.9.245: 赛程/比分 list pull-refresh must surface live score/minute without
// opening match detail — force bypass of live-scores caches + lazy fixture
// resolution for live-but-unmapped matches (AF overlay precondition).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

// --- version pins ---
assert.ok(/VERSION=1\.9\.272/.test(ver));
assert.ok(/VERSION_CODE=308/.test(ver));
assert.ok(/jc-v1\.9\.272/.test(swJs));
assert.strictEqual(pkg.version, '1.9.272');
assert.strictEqual(cfg.version, '1.9.272');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.272\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-308\}"/.test(apkSh));

// --- client: pull-to-refresh forces live scores for the visible schedule day ---
assert.ok(/function pullRefreshScheduleLiveScores\(/.test(appJs), 'pull-refresh live helper defined');
assert.ok(/Promise\.all\(\[reloadData\(true\), refreshAccount\(\), pullRefreshScheduleLiveScores\(\)\]\)/.test(appJs),
  'ptr gesture includes forced schedule live-scores refresh');
assert.ok(/loadLiveScores\(model\.classifiedDay\.map\(x => String\(x\.id\)\), \{ force: true, bust: true \}\)/.test(appJs),
  'helper busts both client TTL and server cache for day ids');
assert.ok(/async function loadLiveScores\(ids, \{ force, bust \}/.test(appJs), 'loadLiveScores accepts bust');
assert.ok(/\(bust \? '&refresh=1' : ''\)/.test(appJs), 'bust appends refresh=1 to /live-scores');
// schRefresh button also busts the server cache
assert.ok(/loadLiveScores\(dayRows\.map\(x => String\(x\.id\)\), \{ force: true, bust: true \}\)/.test(appJs),
  'schRefresh action busts server cache');
// list row builder prefers live overlay when present (regression guard)
assert.ok(/let live = \(S\.liveScores && S\.liveScores\[id\]\) \|\| null;/.test(appJs), 'classifyScoreRow reads live overlay');
assert.ok(/if \(live && live\.homeScore != null\) \{/.test(appJs), 'live overlay score preferred over stale row');

// --- server endpoint: refresh=1 → force, resolveMeta handed to live-scores ---
assert.ok(/req\.query\.refresh === '1' \|\| req\.query\.force === '1'/.test(serverJs), 'refresh/force query parsed');
assert.ok(/resolveMeta\[mid\] = \{/.test(serverJs), 'endpoint builds resolveMeta from schedule rows');
assert.ok(/withAf: req\.query\.af !== '0',\s*force,\s*resolveMeta,/.test(serverJs), 'force+resolveMeta passed through');

// --- lib/live-scores functional ---
delete process.env.API_FOOTBALL_KEY; // keep the AF/resolve path offline in tests
const ls = require('../lib/live-scores');
assert.strictEqual(typeof ls.pickUnmappedLiveIds, 'function');
assert.strictEqual(typeof ls.resolveUnmappedLiveFixtures, 'function');
assert.ok(ls.RESOLVE_MAX_PER_CALL >= 1 && ls.RESOLVE_MAX_PER_CALL <= 5, 'resolve per-call cap bounded');
assert.ok(ls.RESOLVE_COOLDOWN_MS >= 60e3, 'resolve failure cooldown present');

// pickUnmappedLiveIds: live unmapped → picked; finished / mapped / cooling-down → skipped
{
  const now = Date.now();
  const data = {
    a1: { id: 'a1', live: true, finished: false, homeScore: 0, awayScore: 0 },
    a2: { id: 'a2', live: false, finished: true, homeScore: 2, awayScore: 1 },
    a3: { id: 'a3', live: true, finished: false, homeScore: 1, awayScore: 0 },
    a4: { id: 'a4', live: true, finished: false, homeScore: 0, awayScore: 0 },
    a5: { id: 'a5', live: false, finished: false, homeScore: null, awayScore: null },
  };
  const map = { 'm:a3': { fixtureId: 777 } };
  const failAt = new Map([['a4', now - 1000]]);
  const picked = ls.pickUnmappedLiveIds(data, ['a1', 'a2', 'a3', 'a4', 'a5'], map, failAt, now);
  assert.deepStrictEqual(picked, ['a1'], 'only live+unmapped+not-cooling id picked');
  // cooldown expired → picked again
  const failOld = new Map([['a4', now - ls.RESOLVE_COOLDOWN_MS - 1]]);
  const picked2 = ls.pickUnmappedLiveIds(data, ['a4'], map, failOld, now);
  assert.deepStrictEqual(picked2, ['a4'], 'cooldown expiry re-allows resolve');
}

// resolveUnmappedLiveFixtures: no API key → no-op (quota guard)
(async () => {
  const n = await ls.resolveUnmappedLiveFixtures(
    { b1: { id: 'b1', live: true, finished: false, homeScore: 0 } },
    ['b1'],
    { b1: { home: 'X', away: 'Y', date: '2026-10-29', time: '20:00' } }
  );
  assert.strictEqual(n, 0, 'resolve is a no-op without API_FOOTBALL_KEY');

  // getLiveScores: force bypasses the server payload cache (sporttery refetched)
  const mkRow = (score, minute) => ({
    matchId: 'ut245a',
    matchStatus: '5',
    matchStatusName: '进行中',
    matchPhaseTc: '',
    matchPhaseTcName: '上半场',
    matchMinute: String(minute),
    matchMinuteExtra: '',
    sectionsNo999: score,
    sectionsNo1: '0:0',
  });
  let upstream = mkRow('0:0', 29);
  let hits = 0;
  const fetchJson = async () => { hits++; return { value: [upstream] }; };
  const opts = { ids: ['ut245a'], fetchJson, base: 'http://unit.test', withAf: false };

  const p1 = await ls.getLiveScores(opts);
  assert.strictEqual(hits, 1);
  assert.strictEqual(p1.data.ut245a.full, '0:0');
  assert.strictEqual(p1.data.ut245a.minute, 29);
  assert.strictEqual(p1.data.ut245a.phaseZh, '上半场');

  // upstream moves on, but within TTL the cached payload is reused…
  upstream = mkRow('1:0', 39);
  const p2 = await ls.getLiveScores(opts);
  assert.strictEqual(hits, 1, 'no refetch without force inside TTL');
  assert.strictEqual(p2.cached, true);
  assert.strictEqual(p2.data.ut245a.full, '0:0');

  // …while force (pull-to-refresh / refresh=1) refetches and returns live truth
  const p3 = await ls.getLiveScores({ ...opts, force: true });
  assert.strictEqual(hits, 2, 'force refetches upstream');
  assert.ok(!p3.cached);
  assert.strictEqual(p3.data.ut245a.full, '1:0');
  assert.strictEqual(p3.data.ut245a.minute, 39);
  assert.strictEqual(p3.data.ut245a.live, true);

  console.log('ui-245-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
