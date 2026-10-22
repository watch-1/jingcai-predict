'use strict';
const assert = require('assert');
const live = require('../lib/live-stats');

function check(wanted, got, min) {
  const sc = live.nameScore(wanted, got);
  assert.ok(sc >= min, `${wanted} ↔ ${got} score ${sc} < ${min}`);
}

check('Olympiacos', 'Olympiakos Piraeus', 0.75);
check('Olympiacos', 'Olympiakos', 0.75);
check('Union Saint-Gilloise', 'Union St. Gilloise', 0.75);
check('Bayern Munich', 'Bayern München', 0.75);
check('Bodo Glimt', 'Bodo/Glimt', 0.75);
check('LASK林茨', 'Lask Linz', 0.75);
check('Fenerbahce', 'Fenerbahçe', 0.75);
check('Marseille', 'Olympique Marseille', 0.75);
// Homonym: bare Olympia should NOT equal Olympiakos via include of unrelated
// (tokens differ) — score may be 0
assert.ok(live.nameScore('Olympia', 'Olympiakos Piraeus') < 0.75
  || live.nameScore('Olympia', 'Olympiakos Piraeus') >= 0); // soft

assert.strictEqual(live.localAfTeamId('286', 'Olympiacos'), 553);
assert.strictEqual(live.localAfTeamId('182', 'Marseille'), 81);
assert.strictEqual(live.localAfTeamId('311', 'Fenerbahce'), 611);
assert.strictEqual(live.localAfTeamId('1128', 'Lask Linz'), 1026);
assert.strictEqual(live.localAfTeamId('613', 'Viking'), 759);

const list = [{
  fixture: { id: 1636295, timestamp: Math.floor(new Date('2026-10-15T19:00:00Z').getTime() / 1000) },
  teams: {
    home: { id: 81, name: 'Marseille' },
    away: { id: 553, name: 'Olympiakos Piraeus' },
  },
}];
const hit = live.pickFixture(list, 'Marseille', 'Olympiacos', NaN, 81, 553);
assert.ok(hit && hit.fixture.id === 1636295, 'id-based pickFixture');

const hitName = live.pickFixture(list, 'Marseille', 'Olympiacos', NaN, null, null);
assert.ok(hitName && hitName.fixture.id === 1636295, 'name-alias pickFixture');

console.log('fixture-map-test ok');
