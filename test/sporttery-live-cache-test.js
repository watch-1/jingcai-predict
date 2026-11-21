'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sporttery-live-cache-'));
process.env.DATA_DIR = dir;

const disk = require('../lib/sporttery-live-cache');
const fb = require('../lib/live-fallback');

const live = {
  source: 'live',
  sourceUrl: 'https://webapi.sporttery.cn/gateway/example',
  fetchedAt: '2026-11-18T11:20:00.000Z',
  data: [
    { id: '2042838', league: '巴甲', home: '科里蒂巴', away: '桑托斯', num: '周三001' },
    { id: '2042839', league: '巴甲', home: '弗拉门戈', away: '巴竞技', num: '周三002' },
  ],
  meta: { total: 2, byBusinessDate: { '2026-11-18': 2 } },
};
const sample = {
  source: 'sample',
  note: '示例数据',
  data: [
    { id: 'demo-1', league: '荷甲', home: '阿贾克斯', away: '费耶诺德', sample: true, tag: '示例' },
  ],
};

// --- persist + load ---
assert.strictEqual(disk.save('matches', { at: 1000, payload: live }), true);
const loaded = disk.load('matches');
assert.ok(loaded);
assert.strictEqual(loaded.at, 1000);
assert.strictEqual(loaded.payload.source, 'live');
assert.strictEqual(loaded.payload.data.length, 2);
assert.ok(!loaded.payload.stale);
assert.ok(!loaded.payload.fromCache);
assert.ok(!loaded.payload.note);
assert.strictEqual(loaded.payload.data[1].away, '巴竞技');

// stale/fromCache/note flags must be stripped on write so boot does not
// resurrect the official-unreachable banner.
assert.strictEqual(disk.persistLive('schedule', Object.assign({}, live, {
  stale: true,
  fromCache: true,
  note: '官方接口暂时不可达，已保留上次成功刷新的场次',
}), 2000), true);
const sched = disk.load('schedule');
assert.strictEqual(sched.at, 2000);
assert.strictEqual(sched.payload.source, 'live');
assert.ok(!sched.payload.stale);
assert.ok(!sched.payload.fromCache);
assert.ok(!sched.payload.note);

// ignore corrupt / empty / sample
fs.writeFileSync(disk.cacheFile('results'), '{not json');
assert.strictEqual(disk.load('results'), null);
assert.strictEqual(disk.save('results', { at: 1, payload: { source: 'live', data: [] } }), false);
assert.strictEqual(disk.save('results', { at: 1, payload: sample }), false);
assert.strictEqual(disk.load('results'), null);
fs.writeFileSync(disk.cacheFile('results'), JSON.stringify({
  at: 3,
  payload: { source: 'live', data: sample.data, fetchedAt: '2026-11-18T00:00:00.000Z' },
}));
assert.strictEqual(disk.load('results'), null, 'sample rows mixed into live must be ignored');

// --- hydrate into an empty process cache (boot) ---
const cache = {};
disk.hydrateCache(cache);
assert.ok(cache.matches && cache.matches.payload.source === 'live');
assert.ok(cache.schedule && cache.schedule.payload.source === 'live');
assert.ok(!cache.results, 'unusable disk file must not populate cache');
assert.ok(!cache.matches.payload.note, 'boot last-good has no official-unreachable note');

(async () => {
// --- getData-shaped loop: disk last-good is returned immediately while refresh runs ---
const CACHE_MS = 3 * 60 * 1000;
const inflight = Object.create(null);

async function refreshData(kind, { succeed, delayMs, errors } = {}) {
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  if (succeed) {
    const payload = Object.assign({}, live, { fetchedAt: new Date().toISOString(), data: live.data.concat([{ id: '2042840', home: '科林蒂安', away: '博塔弗戈' }]) });
    cache[kind] = { at: Date.now(), payload };
    disk.persistLive(kind, payload, cache[kind].at);
    return payload;
  }
  const prev = cache[kind] && cache[kind].payload;
  const payload = fb.liveFallbackPayload(kind, errors || ['timeout'], prev);
  cache[kind] = { at: Date.now() - CACHE_MS + 60 * 1000, payload };
  // failed refresh must not overwrite disk last-good
  return payload;
}

async function getData(kind, refreshOpts) {
  const c = cache[kind];
  const ttl = CACHE_MS;
  if (c && Date.now() - c.at < ttl) return c.payload;
  if (inflight[kind]) {
    if (c && c.payload && c.payload.source === 'live') return c.payload;
    return inflight[kind];
  }
  const pending = refreshData(kind, refreshOpts).finally(() => {
    if (inflight[kind] === pending) delete inflight[kind];
  });
  inflight[kind] = pending;
  if (c && c.payload && c.payload.source === 'live') return c.payload;
  return pending;
}

// Boot cache `at` is old (1000), so TTL is expired — first getData must
// still return last-good immediately, not wait for the slow official refresh.
const t0 = Date.now();
const immediate = await getData('matches', { succeed: true, delayMs: 80 });
const waited = Date.now() - t0;
assert.ok(waited < 50, 'boot cache must be served without waiting for refresh, waited=' + waited);
assert.strictEqual(immediate.source, 'live');
assert.strictEqual(immediate.data.length, 2);
assert.ok(!immediate.note, 'serving boot last-good while refresh is in flight must not set the official-unreachable note');
const after = await inflight.matches;
assert.strictEqual(after.data.length, 3, 'successful refresh writes the new payload');
assert.strictEqual(disk.load('matches').payload.data.length, 3, 'successful refresh persists to disk');

// Failed refresh keeps last-good and sets the official-unreachable note.
// getData still returns the in-memory last-good immediately (no note) while
// refresh runs; after the official fetch fails, the served payload carries the note.
cache.matches.at = 0;
const kept = await refreshData('matches', { succeed: false, errors: ['getMatchCalculatorV1: HTTP 567'] });
assert.strictEqual(kept.source, 'live');
assert.strictEqual(kept.stale, true);
assert.strictEqual(kept.fromCache, true);
assert.ok(/官方接口暂时不可达/.test(kept.note));
assert.strictEqual(kept.data.length, 3);
assert.ok(!kept.data.some((r) => r.sample || /阿贾克斯/.test(r.home || '')));
assert.strictEqual(disk.load('matches').payload.data.length, 3, 'failed refresh must not rewrite disk');
assert.ok(!disk.load('matches').payload.note, 'disk last-good stays clean for the next boot');
const served = await getData('matches', { succeed: false, errors: ['x'] });
assert.ok(/官方接口暂时不可达/.test(served.note), 'after a real official failure, the note is served');

// --- server.js wiring ---
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(/lib\/sporttery-live-cache/.test(serverJs), 'server requires sporttery-live-cache');
assert.ok(/hydrateCache\(cache\)/.test(serverJs), 'boot hydrates disk last-good into cache');
const hydrateAt = serverJs.indexOf('hydrateCache(cache)');
const listenAt = serverJs.indexOf("app.listen(");
assert.ok(hydrateAt > 0 && listenAt > hydrateAt, 'hydrateCache must run before app.listen');
assert.ok(/persistLive\(kind/.test(serverJs), 'successful refresh persists to disk');
assert.ok(!/require\('\.\/lib\/sm-live-scores'\)/.test(serverJs.slice(serverJs.indexOf('sporttery-live-cache'), listenAt)),
  'new boot-cache path must not hard-require sm-live-scores');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(/async function loadData\(kind, force\)/.test(appJs));
assert.ok(/8000/.test(appJs.slice(appJs.indexOf('async function loadData'), appJs.indexOf('async function loadBaseline'))),
  'loadData stays within an ~8s budget');
assert.ok(/silentIfRecent|silentStale/.test(appJs), 'client can suppress the orange banner for a recent last-good');
assert.ok(/sourceWarnHtml/.test(appJs) && /silentStale/.test(appJs), 'warn bar respects silentStale');

console.log('sporttery-live-cache-test ok');
})().catch((e) => { console.error(e); process.exit(1); });
