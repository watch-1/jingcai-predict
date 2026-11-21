'use strict';
const assert = require('assert');
const sq = require('../lib/squad-source');
const mf = require('../lib/sm-matchfacts');

// Evidence: /workspace/sportmonks-predictions-20261114/raw/team-cache.json
// s:564 → smId 3432, and raw/match-map.json m:2041832 (周四004 巴竞技 vs 米竞技,
// official results homeTeamId 564 / awayTeamId 563) homeSmId 3432 / awaySmId 3427.
assert.strictEqual(sq.pinnedSmId(564, '巴竞技'), 3432);
assert.strictEqual(sq.pinnedSmId('Athletico Paranaense'), 3432);
assert.strictEqual(sq.pinnedSmId('巴竞技'), null);
assert.notStrictEqual(sq.pinnedSmId(564, '巴竞技'), 3427);

assert.notStrictEqual(sq.pinnedSmId(564, '巴竞技'), 7980);

// MLS 体彩 shorts, verified 2026-11-19 against league 779 fixtures
// 19904929 / 19904930 / 19610001.
assert.strictEqual(sq.pinnedSmId(1583, '奥兰多'), 204);
assert.strictEqual(sq.pinnedSmId(2535, '辛辛那提'), 3636);
assert.strictEqual(sq.pinnedSmId(1210, '西雅图'), 2649);
assert.strictEqual(sq.pinnedSmId(911, '盐湖城'), 1062);
assert.strictEqual(sq.pinnedSmId(909, '洛城银河'), 413);
assert.strictEqual(sq.pinnedSmId('奥兰多'), 204);
assert.strictEqual(sq.pinnedSmId('辛辛那提'), 3636);
assert.strictEqual(sq.pinnedSmId('西雅图'), 2649);
assert.strictEqual(sq.pinnedSmId('盐湖城'), 1062);
assert.strictEqual(sq.pinnedSmId('洛城银河'), 413);
assert.strictEqual(sq.pinnedSmId('LA Galaxy'), 413);
assert.notStrictEqual(sq.pinnedSmId('西雅图'), 204);


(async () => {
  const searchCalls = [];
  assert.strictEqual(
    await mf.resolveSmTeam(async (u) => { searchCalls.push(u); return { data: [] }; }, 564, '巴竞技'),
    3432
  );
  assert.strictEqual(searchCalls.length, 0, 'pinned teamId 564 skips /teams/search');

  searchCalls.length = 0;
  assert.strictEqual(
    await mf.resolveSmTeam(async (u) => { searchCalls.push(u); return { data: [] }; }, 2535, '辛辛那提'),
    3636
  );
  assert.strictEqual(searchCalls.length, 0, 'pinned teamId 2535 skips /teams/search');

  const calls = [];
  const fetchJson = async (url) => {
    calls.push(url);
    if (/\/teams\/search\//.test(url)) {
      throw new Error('search must not run for pinned 巴竞技');
    }
    if (/\/football\/fixtures\/between\//.test(url)) {
      // Mock pairing only — this id is not claimed as the official SM fixture for 2042839.
      return {
        data: [{
          id: 1,
          participants: [
            { id: 1024, name: 'Flamengo' },
            { id: 3432, name: 'Club Athletico Paranaense' },
          ],
        }],
      };
    }
    throw new Error('unexpected ' + url);
  };
  const resolved = await mf.resolveFixture(fetchJson, {
    matchId: 'test-pin-2042839',
    home: '弗拉门戈',
    away: '巴竞技',
    homeZh: '弗拉门戈',
    awayZh: '巴竞技',
    homeTeamId: 571,
    awayTeamId: 564,
    homeSmId: 1024,
    kickoffMs: Date.parse('2026-11-19T07:30:00+08:00'),
  });
  assert.strictEqual(Number(resolved.id), 1);
  assert.ok(!calls.some((u) => /\/teams\/search\//.test(u)), 'resolveFixture reuses pin, no second mapper');
  assert.ok(calls.some((u) => /\/football\/fixtures\/between\//.test(u)));

  const unmapped = await mf.resolveSmTeam(async () => ({ data: [] }), 999999, '不存在的队名xyz');
  assert.strictEqual(unmapped, null, 'unmapped names stay honest empty');

  console.log('sm-club-pin-test ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
