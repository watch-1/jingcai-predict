'use strict';
const assert = require('assert');
const nearby = require('../lib/nearby-prefetch');
const wx = require('../lib/match-weather');

nearby.resetState();

const now = Date.parse('2026-11-15T22:00:00+08:00'); // Sunday
assert.strictEqual(nearby.bjDate(0, now), '2026-11-15');
assert.strictEqual(nearby.bjDate(-2, now), '2026-11-13');
assert.strictEqual(nearby.bjDate(1, now), '2026-11-16');

const friday = { id: 'fri', businessDate: '2026-11-13', date: '2026-11-13', home: '苏格兰' };
const sat = { id: 'sat', businessDate: '2026-11-14', date: '2026-11-14' };
const sun = { id: 'sun', businessDate: '2026-11-15', date: '2026-11-15', time: '22:00' };
const mon = { id: 'mon', businessDate: '2026-11-16', date: '2026-11-16', time: '23:00', home: '哈萨克', away: '斯洛伐克' };
const tue = { id: 'tue', businessDate: '2026-11-17', date: '2026-11-17' };
const late = { id: 'late', businessDate: '2026-12-01', date: '2026-12-01' };

const picked = nearby.selectNearbyMatches([[friday, sat, sun, mon, tue, late]], now, { daysBack: 2, daysForward: 2 });
const ids = picked.map((m) => m.id);
assert.deepStrictEqual(ids, ['fri', 'sat', 'sun', 'mon', 'tue']);
assert.ok(!ids.includes('late'));

const logos = nearby.clubLogoUrls([
  { id: '1', league: '欧国联', home: '哈萨克', homeLogo: 'https://cdn.sportmonks.com/images/soccer/teams/11/18603.png', away: '斯洛伐克', awayLogo: 'https://cdn.sportmonks.com/images/soccer/teams/24/18648.png' },
  { id: '2', league: '英超', home: '阿森纳', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png', away: '切尔西', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/363.png' },
  { id: '3', league: '日职', home: '神户', homeLogo: 'https://cdn.sportmonks.com/images/soccer/placeholder.png' },
]);
const urls = logos.map((x) => x.url);
assert.ok(urls.some((u) => /359\.png/.test(u)), 'club logo is prefetched');
assert.ok(!urls.some((u) => /18603\.png/.test(u)), 'NT flag must not depend on SM fetch');
assert.ok(!urls.some((u) => /18648\.png/.test(u)), 'NT flag must not depend on SM fetch');
assert.ok(!urls.some((u) => /placeholder/.test(u)), 'placeholder football is skipped');

const selected = wx.selectPrefetchMatches(
  [sun],
  [sun, mon, late],
  now,
  { results: [friday] }
);
const sids = selected.map((m) => m.id);
assert.ok(sids.includes('sun'));
assert.ok(sids.includes('mon'), 'Monday 11-16 is in the nearby window');
assert.ok(sids.includes('fri'), 'recent Friday is in the nearby window');
assert.ok(!sids.includes('late'));

(async () => {
  const calls = { weather: 0, logos: 0, odds: 0, reports: 0 };
  const st = await nearby.prefetchNearby([[friday, mon]], {
    reason: 'test',
    nowMs: now,
    daysBack: 2,
    daysForward: 2,
    prefetchWeather: async (matches) => { calls.weather = matches.length; return { n: matches.length, ok: matches.length }; },
    warmLogos: async (entries) => { calls.logos = entries.length; return { n: entries.length, ok: 0 }; },
    tickOdds: async (matches) => { calls.odds = matches.length; return { near: matches.length }; },
    warmReports: async (matches) => { calls.reports = matches.length; return { n: matches.length, ok: 0 }; },
  });
  assert.strictEqual(st.n, 2);
  assert.strictEqual(calls.weather, 2);
  assert.strictEqual(calls.odds, 2);
  assert.strictEqual(calls.reports, 2);
  assert.ok(!st.skippedRun);

  nearby.resetState();
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const firstP = nearby.prefetchNearby([[mon]], {
    reason: 'hold',
    nowMs: now,
    prefetchWeather: async () => { await hold; return { n: 1 }; },
  });
  const skipped = await nearby.prefetchNearby([[mon]], { reason: 'overlap', nowMs: now });
  assert.strictEqual(skipped.skippedRun, true);
  release();
  await firstP;
  console.log('nearby-prefetch-test ok', { n: st.n, sids });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
