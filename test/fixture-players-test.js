'use strict';
const assert = require('assert');
const fp = require('../lib/fixture-players');

const sample = [
  {
    team: { id: 33, name: 'Manchester United', logo: 'https://example.com/mu.png' },
    players: [
      {
        player: { id: 1, name: 'Bruno Fernandes', photo: 'https://example.com/b.png' },
        statistics: [{
          games: { minutes: 90, number: 8, position: 'M', rating: '8.4', captain: true, substitute: false },
          shots: { total: 4, on: 2 },
          goals: { total: 1, assists: 1 },
          passes: { total: 55, key: 3, accuracy: '86' },
          tackles: { total: 2 },
          cards: { yellow: 0, red: 0 },
        }],
      },
      {
        player: { id: 2, name: 'Bench Warm', photo: '' },
        statistics: [{
          games: { minutes: null, number: 99, position: 'F', rating: null, captain: false, substitute: true },
          shots: { total: null, on: null },
          goals: { total: null, assists: null },
          passes: { total: null, key: null, accuracy: null },
          tackles: { total: null },
          cards: { yellow: 0, red: 0 },
        }],
      },
    ],
  },
  {
    team: { id: 50, name: 'Manchester City', logo: 'https://example.com/mc.png' },
    players: [
      {
        player: { id: 3, name: 'Erling Haaland', photo: 'https://example.com/h.png' },
        statistics: [{
          games: { minutes: 85, number: 9, position: 'F', rating: '9.1', captain: false, substitute: false },
          shots: { total: 6, on: 4 },
          goals: { total: 2, assists: 0 },
          passes: { total: 18, key: 1, accuracy: '70' },
          tackles: { total: 0 },
          cards: { yellow: 0, red: 0 },
        }],
      },
    ],
  },
];

const pack = fp.normalizeResponse(sample, {
  fixtureId: 999001,
  matchId: 'test-m-1',
  date: '2026-10-10',
  ft: '1:2',
  homeTeamId: '13',
  awayTeamId: '1',
  home: '曼联',
  away: '曼城',
  homeAfId: 33,
  awayAfId: 50,
  afCalls: 1,
});

assert.strictEqual(pack.ok, true);
assert.strictEqual(pack.home.players.length, 2);
assert.strictEqual(pack.away.players.length, 1);
assert.ok(pack.motm);
assert.strictEqual(pack.motm.id, '3'); // Haaland 9.1
assert.strictEqual(pack.motm.side, 'away');
assert.ok(pack.keyPlayers.length >= 1);
assert.ok(pack.keyPlayers.some(p => p.goals >= 1));

const sorted = fp.sortPlayers(pack.home.players);
assert.strictEqual(sorted[0].id, '1');

assert.strictEqual(fp.isFinishedMatch({ full: '2:1' }), true);
assert.strictEqual(fp.isFinishedMatch({ status: '完场' }), true);
assert.strictEqual(fp.isFinishedMatch({ home: 'A', away: 'B' }), false);

const pl = fp.normalizePlayer(sample[0].players[0]);
assert.strictEqual(pl.goals, 1);
assert.strictEqual(pl.assists, 1);
assert.strictEqual(pl.rating, 8.4);
assert.strictEqual(pl.keyPasses, 3);

console.log('fixture-players-test ok');
