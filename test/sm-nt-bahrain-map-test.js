'use strict';
/**
 * Mapping fix for official 周二002 中国 vs 巴林 (2042829).
 * Evidence: SM fixture 19900701, 2026-11-17 12:00 UTC,
 * participants China PR 18599 (home) / Bahrain 18590 (away);
 * sporttery homeTeamId 426 / awayTeamId 427.
 * Production /teams/search/巴林 returned HTTP 422 and aborted resolve,
 * so smFixtureId stayed null and the client waited on 502/timeouts.
 */
const assert = require('assert');
const i18n = require('../lib/i18n-football');
const heat = require('../lib/heat-source');
const mf = require('../lib/sm-matchfacts');

assert.strictEqual(i18n.natEn('巴林'), 'Bahrain');
assert.strictEqual(i18n.natZh('Bahrain'), '巴林');
assert.strictEqual(heat.englishName(427, '巴林'), 'Bahrain');
assert.strictEqual(heat.englishName(426, '中国'), 'China');
assert.strictEqual(heat.verifiedNtId('巴林', 427), 18590);
assert.strictEqual(heat.verifiedNtId('Bahrain', 427), 18590);
assert.strictEqual(heat.verifiedNtId('中国', 426), 18599);
assert.strictEqual(heat.verifiedNtId('China PR', 426), 18599);
// Unverified names stay honest-empty (existing contract).
assert.strictEqual(heat.verifiedNtId('苏格兰'), null);
assert.strictEqual(heat.verifiedNtId('英格兰'), null);

(async () => {
  const searchCalls = [];
  assert.strictEqual(
    await mf.resolveSmTeam(async (u) => { searchCalls.push(u); return { data: [] }; }, 427, '巴林'),
    18590
  );
  assert.strictEqual(searchCalls.length, 0, 'pinned 巴林 skips /teams/search');

  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (/\/teams\/search\//.test(url)) {
      const err = new Error('http 422');
      err.statusCode = 422;
      throw err;
    }
    if (/\/football\/fixtures\/between\//.test(url)) {
      assert.ok(/\/18599(?:\?|$)/.test(url) || url.includes('/18599'), 'anchor is China PR 18599: ' + url);
      return {
        data: [{
          id: 19900701,
          starting_at: '2026-11-17 12:00:00',
          participants: [
            { id: 18599, name: 'China PR', meta: { location: 'home' } },
            { id: 18590, name: 'Bahrain', meta: { location: 'away' } },
          ],
        }],
      };
    }
    throw new Error('unexpected ' + url);
  };
  const resolved = await mf.resolveFixture(fetchJson, {
    matchId: '2042829',
    home: '中国',
    away: '巴林',
    homeZh: '中国',
    awayZh: '巴林',
    homeTeamId: 426,
    awayTeamId: 427,
    kickoffMs: Date.parse('2026-11-17T20:00:00+08:00'),
  });
  assert.strictEqual(Number(resolved.id), 19900701);
  assert.ok(!calls.some((u) => /\/teams\/search\//.test(u)), 'resolveFixture uses NT pins, no search');
  assert.ok(calls.some((u) => /\/football\/fixtures\/between\//.test(u)));

  // A 422 on an unmapped name must not throw (that was the 502 / 网络超时 path).
  const err422 = new Error('http 422');
  err422.statusCode = 422;
  const missed = await mf.resolveSmTeam(async () => { throw err422; }, 999999, '不存在的队名xyz');
  assert.strictEqual(missed, null, 'unmapped 422 stays honest empty instead of throwing');

  console.log('sm-nt-bahrain-map-test ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
