'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmd-1380-'));
process.env.DATA_DIR = tmp;

delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/player-match-db')];
delete require.cache[require.resolve('../lib/sm-ball-coords')];

const pmdb = require('../lib/player-match-db');
const coords = require('../lib/sm-ball-coords');

const SM_PHOTO = 'https://cdn.sportmonks.com/images/soccer/players/1/1100.png';
const SM_MESSI = 'https://cdn.sportmonks.com/images/soccer/players/4/44.png';
const AF_PHOTO = 'https://media.api-sports.io/football/players/99.png';

function wrapPrepare(db) {
  const orig = db.prepare.bind(db);
  const seen = [];
  db.prepare = (sql) => {
    seen.push(String(sql));
    const isIn = /name_en IN\s*\(/i.test(sql);
    const isFoldAll = /GROUP BY name_en, photo/i.test(sql) && !isIn;
    const isLastLike = /name_en LIKE\s*\?/i.test(sql);
    if (isFoldAll || isLastLike) {
      throw new Error('heavy photo query must not run on the request path: ' + sql.replace(/\s+/g, ' ').slice(0, 180));
    }
    return orig(sql);
  };
  return { seen, restore() { db.prepare = orig; } };
}

function writeFoldCache(map, builtAt) {
  const file = pmdb.photoFoldCacheFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    builtAt: builtAt != null ? builtAt : Date.now(),
    count: Object.keys(map).length,
    map,
  }));
}

/* --- latestSmPhotosByNames must not run the giant fold / last-name LIKE on this turn --- */
pmdb._resetPhotoFoldForTests();
let rebuildCalls = 0;
pmdb._setPhotoFoldTestHooks({
  scheduleRebuild() { rebuildCalls += 1; return { ok: true, skipped: true }; },
});

const t0 = Date.now();
const r0 = pmdb.beginPhotoFoldWarm();
assert.ok(Date.now() - t0 < 100, 'beginPhotoFoldWarm returns immediately');
assert.ok(r0 && r0.ok);
assert.strictEqual(r0.started, true, 'missing cache starts a background rebuild');
assert.strictEqual(rebuildCalls, 1);

const t1 = Date.now();
const r1 = pmdb.beginPhotoFoldWarm();
assert.ok(Date.now() - t1 < 100);
assert.strictEqual(rebuildCalls, 1, 'inflight lock prevents a second rebuild');

const db = pmdb.getDb();
const hook = wrapPrepare(db);
const t2 = Date.now();
const miss = pmdb.latestSmPhotosByNames(['Nobody Here', 'Ghost Player']);
assert.ok(Date.now() - t2 < 200, 'latestSmPhotosByNames returns quickly without a fold cache');
assert.deepStrictEqual(miss, {});
assert.ok(hook.seen.some((s) => /name_en IN\s*\(/i.test(s)), 'cheap IN lookup still runs');
assert.ok(!hook.seen.some((s) => /GROUP BY name_en, photo/i.test(s) && !/name_en IN\s*\(/i.test(s)), 'no foldAll query');
assert.ok(!hook.seen.some((s) => /name_en LIKE/i.test(s)), 'no last-name LIKE on the request path');
hook.restore();

const upserted = pmdb.upsertFromFixturePayload({
  ok: true,
  fixtureId: 1380001,
  matchId: 'test-1380-1',
  date: '2026-11-20',
  ft: '1:0',
  homeTeamId: '1',
  awayTeamId: '2',
  homeName: 'Home',
  awayName: 'Away',
  homeNameZh: '主',
  awayNameZh: '客',
  fetchedAt: '2026-11-20T10:00:00.000Z',
  source: 'test',
  home: {
    name: 'Home',
    nameZh: '主',
    players: [
      {
        id: '1100', name: 'E. Haaland', nameZh: '哈兰德',
        position: 'F', positionZh: '前锋', minutes: 90, goals: 1,
        shots: 3, shotsOn: 2, keyPasses: 0, tackles: 0, rating: 7.5,
        photo: SM_PHOTO,
      },
      {
        id: '1101', name: 'Skip Me', nameZh: '跳过',
        position: 'M', positionZh: '中场', minutes: 10, goals: 0,
        photo: 'https://cdn.sportmonks.com/images/soccer/players/placeholder.png',
      },
    ],
  },
  away: {
    name: 'Away',
    nameZh: '客',
    players: [
      {
        id: '2200', name: 'K. Mbappé', nameZh: '姆巴佩',
        position: 'F', positionZh: '前锋', minutes: 90, goals: 0,
        photo: AF_PHOTO,
      },
    ],
  },
});
assert.ok(upserted.ok);

const hook2 = wrapPrepare(pmdb.getDb());
const found = pmdb.latestSmPhotosByNames(['E. Haaland', 'K. Mbappé', 'Skip Me']);
hook2.restore();
assert.strictEqual(found['E. Haaland'], SM_PHOTO, 'IN lookup still returns SM photos without the fold cache');
assert.strictEqual(found['K. Mbappé'], AF_PHOTO);
assert.ok(!found['Skip Me'], 'placeholder photos stay missing');

/* disk fold cache is used when present; still no giant query */
pmdb._resetPhotoFoldForTests();
rebuildCalls = 0;
writeFoldCache({ 'lionel messi': SM_MESSI }, Date.now());
pmdb._setPhotoFoldTestHooks({
  scheduleRebuild() { rebuildCalls += 1; return { ok: true }; },
});
const warmFresh = pmdb.beginPhotoFoldWarm();
assert.strictEqual(warmFresh.stale, false);
assert.strictEqual(warmFresh.cached, true);
assert.strictEqual(rebuildCalls, 0, 'fresh disk cache must not rebuild');
const hook3 = wrapPrepare(pmdb.getDb());
const t3 = Date.now();
const fromCache = pmdb.latestSmPhotosByNames(['Lionel Messi', 'E. Haaland']);
assert.ok(Date.now() - t3 < 200);
hook3.restore();
assert.strictEqual(fromCache['Lionel Messi'], SM_MESSI, 'fold cache fills names the IN lookup cannot see');
assert.strictEqual(fromCache['E. Haaland'], SM_PHOTO);
assert.strictEqual(rebuildCalls, 0);
assert.ok(pmdb.latestSmPhotosByNames._foldAll instanceof Map);
assert.strictEqual(pmdb.latestSmPhotosByNames._foldAll.get('lionel messi'), SM_MESSI);

/* stale cache is still served, rebuild happens in the background */
pmdb._resetPhotoFoldForTests();
rebuildCalls = 0;
writeFoldCache({ 'lionel messi': SM_MESSI }, Date.now() - pmdb.PHOTO_FOLD_TTL_MS - 1000);
pmdb._setPhotoFoldTestHooks({
  scheduleRebuild() { rebuildCalls += 1; return { ok: true, map: { 'lionel messi': SM_MESSI } }; },
});
const staleHit = pmdb.latestSmPhotosByNames(['Lionel Messi']);
assert.strictEqual(staleHit['Lionel Messi'], SM_MESSI, 'stale cache is still served');
assert.strictEqual(rebuildCalls, 1, 'stale cache schedules one background rebuild');

const src = fs.readFileSync(path.join(__dirname, '../lib/player-match-db.js'), 'utf8');
assert.ok(/Standing rule: never run heavy sync sqlite/.test(src), 'standing rule comment is on latestSmPhotosByNames');
assert.ok(/worker_threads/.test(src), 'rebuild uses worker_threads');
assert.ok(fs.existsSync(path.join(__dirname, '../lib/photo-fold-worker.js')), 'worker file exists');

/* --- ball coords: peek / stale-while-revalidate / empty refresh keeps last-good --- */
async function testBallCoords() {
  const ballTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-ball-1380-'));
  process.env.DATA_DIR = ballTmp;
  coords._resetForTests();

  let fetches = 0;
  const fxLive = {
    id: 19758798,
    state: { developer_name: 'INPLAY_2ND_HALF' },
    periods: [{ id: 1, description: '1st Half' }, { id: 2, description: '2nd Half' }],
    ballCoordinates: [
      { x: 20, y: 50, timer: '10:00', period_id: 2 },
      { x: 35, y: 48, timer: '10:02', period_id: 2 },
      { x: 48, y: 51, timer: '10:04', period_id: 2 },
    ],
  };
  async function fetchFull() {
    fetches += 1;
    return { data: fxLive };
  }
  const seeded = await coords.getBallCoords({
    matchId: 'm-1380', smFixtureId: 19758798, fetchImpl: fetchFull, now: 50_000, skipDisk: false, force: true,
  });
  assert.ok(seeded.hasCoords && seeded.coords.length >= 3);
  assert.strictEqual(fetches, 1);

  const fetchesBeforePeek = fetches;
  const tPeek = Date.now();
  const peeked = coords.peekCached({ matchId: 'm-1380', smFixtureId: 19758798 });
  assert.ok(Date.now() - tPeek < 50, 'peekCached is sync and cheap');
  assert.ok(peeked && peeked.hasCoords, 'peek returns last-good coords');
  assert.ok(peeked.cached);
  assert.ok(peeked.coords.length >= 3);
  assert.strictEqual(fetches, fetchesBeforePeek, 'peekCached must not call fetchImpl');

  const peekedDiskOnly = (() => {
    coords._resetForTests();
    return coords.peekCached({ smFixtureId: 19758798 });
  })();
  assert.ok(peekedDiskOnly && peekedDiskOnly.hasCoords, 'peek reads last-good from disk after mem reset');
  assert.strictEqual(fetches, fetchesBeforePeek, 'disk peek does not fetch');

  // Cache-first handler pattern: return peek immediately, refresh in the background.
  async function fetchEmpty() {
    fetches += 1;
    return {
      data: {
        id: 19758798,
        state: { developer_name: 'INPLAY_2ND_HALF' },
        periods: fxLive.periods,
        ballCoordinates: [],
      },
    };
  }
  const peekAgain = coords.peekCached({ smFixtureId: 19758798 });
  assert.ok(peekAgain && peekAgain.hasCoords);
  const refresh = coords.getBallCoords({
    matchId: 'm-1380', smFixtureId: 19758798, fetchImpl: fetchEmpty, now: 80_000, skipDisk: false, force: true,
  });
  // The peeked pack is already in hand; we do not await refresh before "responding".
  assert.ok(peekAgain.hasCoords);
  const after = await refresh;
  assert.ok(after.hasCoords, 'empty refresh must not wipe last-good coords');
  assert.ok(after.keptLastGood);
  assert.ok(after.coords.length >= 3);
  assert.ok(fetches > fetchesBeforePeek, 'background refresh can be observed');

  assert.ok(!String(JSON.stringify(peeked) + JSON.stringify(after)).includes('api_token'));
  assert.ok(!String(JSON.stringify(peeked) + JSON.stringify(after)).includes('SPORTMONKS'));

  const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const route = serverJs.slice(serverJs.indexOf("app.get('/api/sm-ball-coords'"));
  const routeBody = route.slice(0, route.indexOf("app.get('/api/match-weather'"));
  assert.ok(routeBody.includes('peekCached'), 'HTTP route is cache-first');
  assert.ok(/setImmediate\s*\(/.test(routeBody), 'HTTP route refreshes in the background');
  assert.ok(routeBody.includes('8000'), 'miss path still has an 8s timeout');
  assert.ok(coords.INCLUDE === 'ballCoordinates;periods;state', 'INCLUDE is limited to what packFromFixture needs');
}

testBallCoords().then(() => {
  console.log('event-loop-photos-1380-test ok');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
