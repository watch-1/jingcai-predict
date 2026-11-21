'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-team-map-'));
process.env.DATA_DIR = dir;

const map = require('../lib/sm-team-map');

// Long ESPN/crest English vs SportMonks short name
assert.strictEqual(map.namesCompatible('JEF United Ichihara-Chiba', 'JEF United'), true);
assert.strictEqual(map.namesCompatible('JEF United', 'jef united ichihara chiba'), true);
assert.strictEqual(map.namesCompatible('Kashiwa Reysol', 'Kashiwa Reysol'), true);
assert.strictEqual(map.namesCompatible('United', 'Manchester United'), false);
assert.strictEqual(map.namesCompatible('FC United', 'Manchester United'), false);

const queries = map.teamSearchQueries('JEF United Ichihara-Chiba', '千叶市原');
assert.ok(queries[0] === 'JEF United Ichihara-Chiba' || queries.includes('JEF United Ichihara-Chiba'));
assert.ok(queries.includes('JEF United'), queries.join(' | '));
assert.ok(!queries.some((q) => /^united$/i.test(q)), 'must not search bare United');

const ko = Date.parse('2026-11-20T10:00:00Z');
const rows = [{
  id: 19719159,
  starting_at: '2026-11-20 10:00:00',
  participants: [
    { id: 4260, name: 'JEF United', meta: { location: 'home' } },
    { id: 298, name: 'Kashiwa Reysol', meta: { location: 'away' } },
  ],
}, {
  id: 1,
  starting_at: '2026-11-19 10:00:00',
  participants: [{ id: 298, name: 'Kashiwa Reysol' }, { id: 9, name: 'Other' }],
}];
const hit = map.pickFixtureByKickoff(rows, ko, { anchorSm: 298 });
assert.ok(hit && Number(hit.id) === 19719159);
assert.strictEqual(map.pickFixtureByKickoff(rows, Date.parse('2026-11-18T10:00:00Z'), { anchorSm: 298 }), null);

assert.strictEqual(map.learnedSmId(886), null);
const learned = map.rememberFromFixture({
  matchId: '2042880',
  homeTeamId: 552,
  awayTeamId: 886,
  home: '柏太阳神',
  away: '千叶市原',
}, hit, 298, null);
assert.strictEqual(learned.homeSm, 298);
assert.strictEqual(learned.awaySm, 4260);
assert.strictEqual(map.learnedSmId(886), 4260);
assert.strictEqual(map.learnedSmId('552'), 298);

const conflict = map.remember(886, 9999, { source: 'test' });
assert.ok(conflict && conflict.conflict);
assert.strictEqual(map.learnedSmId(886), 4260);

// Two fixtures at the same kickoff must not be guessed
const tied = map.pickFixtureByKickoff([
  { id: 10, starting_at: '2026-11-20 10:00:00', participants: [{ id: 298 }] },
  { id: 11, starting_at: '2026-11-20 10:00:00', participants: [{ id: 298 }] },
], ko, { anchorSm: 298 });
assert.strictEqual(tied, null);


(async () => {
// resolveFixture: one side mapped, opponent long name does not exact-fold
const mf = require('../lib/sm-matchfacts');
const searches = [];
async function fetchJson(urlPath) {
  searches.push(urlPath);
  if (String(urlPath).includes('/football/teams/search/')) {
    const q = decodeURIComponent(String(urlPath).split('/').pop());
    if (q === 'JEF United Ichihara-Chiba' || q === '千叶市原') return { data: [] };
    if (q === 'JEF United' || q === 'JEF United Ichihara') {
      return { data: [{ id: 4260, name: 'JEF United' }] };
    }
    if (/Kashiwa|Reysol|柏太阳神/i.test(q)) {
      return { data: [{ id: 298, name: 'Kashiwa Reysol' }] };
    }
    return { data: [] };
  }
  if (String(urlPath).includes('/football/fixtures/between/')) {
    return { data: rows };
  }
  return { data: [] };
}

// Fresh map file so resolve must search / kickoff, not the ids we just stored
fs.unlinkSync(map.mapFile());
map.resetCache();

const resolved = await (async () => mf.resolveFixture(fetchJson, {
  matchId: '2042880',
  homeTeamId: '552',
  awayTeamId: '886',
  home: '柏太阳神',
  away: '千叶市原',
  kickoffMs: ko,
  homeSmId: 298,
}))();

assert.strictEqual(Number(resolved.id), 19719159, JSON.stringify(resolved));
assert.strictEqual(Number(resolved.homeSm), 298);
assert.strictEqual(Number(resolved.awaySm), 4260, 'away id should be learned from the kickoff fixture or short search');
assert.strictEqual(map.learnedSmId(886), 4260);

// Kickoff-only: search never finds the away club, but the mapped home side
// has exactly one fixture at the official kickoff.
fs.unlinkSync(map.mapFile());
map.resetCache();
const searchesKo = [];
async function fetchNoAway(urlPath) {
  searchesKo.push(urlPath);
  if (String(urlPath).includes('/football/teams/search/')) return { data: [] };
  if (String(urlPath).includes('/football/fixtures/between/')) return { data: rows };
  return { data: [] };
}
const byKo = await mf.resolveFixture(fetchNoAway, {
  matchId: '2042880',
  homeTeamId: '552',
  awayTeamId: '886',
  home: '柏太阳神',
  away: '千叶市原',
  kickoffMs: ko,
  homeSmId: 298,
});
assert.strictEqual(Number(byKo.id), 19719159, JSON.stringify(byKo));
assert.strictEqual(Number(byKo.awaySm), 4260);
assert.strictEqual(map.learnedSmId(886), 4260);

console.log('sm-team-map-test ok', { searches: searches.filter((s) => s.includes('search')).slice(0, 8) });

})().catch((e) => { console.error(e); process.exit(1); });
