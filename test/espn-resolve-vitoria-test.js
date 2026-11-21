'use strict';
const assert = require('assert');
const espn = require('../lib/espn-form');

assert.strictEqual(espn.SEED['1097'].id, '3457');
assert.strictEqual(espn.SEED['1097'].league, 'bra.1');
assert.strictEqual(espn.SEED['538'].id, '5309');
assert.strictEqual(espn.SEED['581'].id, '2674');
assert.strictEqual(espn.SEED['676'].id, '87');
assert.strictEqual(espn.SEED['1128'].id, '4411');
assert.strictEqual(espn.leagueSlug('巴甲'), 'bra.1');
assert.strictEqual(espn.leagueSlug('葡超'), 'por.1');
assert.strictEqual(espn.leagueSlug('墨超'), 'mex.1');
assert.strictEqual(espn.leagueSlug('西甲'), 'esp.1');
assert.strictEqual(espn.leagueSlug('阿甲'), 'arg.1');
assert.strictEqual(espn.leagueSlug('bra.1'), 'bra.1');
assert.strictEqual(espn.leagueSlug('欧冠'), '');

const index = [
  { id: '5309', league: 'por.1', name: 'Vitória de Guimaraes', short: 'Vitória ', abbr: 'VSC' },
  { id: '6079', league: 'bra.1', name: 'Red Bull Bragantino', short: 'Bragantino', abbr: 'BRA' },
  { id: '3457', league: 'bra.1', name: 'Vitória', short: 'Vitória', abbr: 'VIT' },
  { id: '2674', league: 'bra.1', name: 'Santos', short: 'Santos', abbr: 'SAN' },
  { id: '225', league: 'mex.1', name: 'Santos', short: 'Santos', abbr: 'SAN' },
  { id: '87', league: 'esp.1', name: 'Racing Santander', short: 'Racing', abbr: 'RAC' },
  { id: '15', league: 'arg.1', name: 'Racing Club', short: 'Racing ', abbr: 'RAC' },
];

// Bare "Vitoria" used to first-win on Guimarães (por.1 first in the index)
// and later uniquely match Brazil because only one full name is exactly
// "Vitória". Either guess is unsafe without a league or a seeded id.
assert.strictEqual(
  espn.chooseTeamFromIndex(index, ['Vitoria', '维多利亚']),
  null,
  'bare "Vitoria" stays unresolved when two clubs share the short name',
);

const bra = espn.chooseTeamFromIndex(index, ['Vitoria'], { league: 'bra.1' });
assert.ok(bra && bra.id === '3457', '巴甲 hint picks the Brazilian club');

const por = espn.chooseTeamFromIndex(index, ['Vitoria'], { league: 'por.1' });
assert.ok(por && por.id === '5309', '葡超 hint picks Guimarães');

const porFull = espn.chooseTeamFromIndex(index, ['Vitoria de Guimaraes']);
assert.ok(porFull && porFull.id === '5309', 'full Portuguese name stays unique');

const onlyBra = espn.chooseTeamFromIndex(
  index.filter(t => t.id !== '5309'),
  ['Vitoria'],
);
assert.ok(onlyBra && onlyBra.id === '3457');

assert.strictEqual(espn.chooseTeamFromIndex(index, ['Santos']), null);
assert.ok(espn.chooseTeamFromIndex(index, ['Santos'], { league: 'bra.1' }).id === '2674');
assert.ok(espn.chooseTeamFromIndex(index, ['Santos'], { league: 'mex.1' }).id === '225');

// "club" is stripped by foldName, so "Racing" would otherwise uniquely
// match Argentina's Racing Club by full name.
assert.strictEqual(espn.chooseTeamFromIndex(index, ['Racing']), null, 'bare Racing is ambiguous');
assert.ok(espn.chooseTeamFromIndex(index, ['Racing'], { league: 'esp.1' }).id === '87');
assert.ok(espn.chooseTeamFromIndex(index, ['Racing'], { league: 'arg.1' }).id === '15');
assert.ok(espn.chooseTeamFromIndex(index, ['Racing Santander']).id === '87');

const uni = espn.chooseTeamFromIndex([
  { id: '1', league: 'chi.1', name: 'Universidad de Chile', short: 'Universidad' },
  { id: '2', league: 'chi.1', name: 'Universidad Católica', short: 'Universidad' },
], ['Universidad']);
assert.strictEqual(uni, null, 'two full names that only share a short stay unresolved');

(async () => {
  const seeded = await espn.resolveTeam('1097', ['Vitoria']);
  assert.strictEqual(seeded.id, '3457');
  assert.strictEqual(seeded.league, 'bra.1');
  const gim = await espn.resolveTeam('538', ['Vitoria']);
  assert.strictEqual(gim.id, '5309');
  const santos = await espn.resolveTeam('581', ['Santos']);
  assert.strictEqual(santos.id, '2674');
  const racing = await espn.resolveTeam('676', ['Racing']);
  assert.strictEqual(racing.id, '87');
  console.log('espn-resolve-vitoria-test ok');
})().catch((e) => { console.error(e); process.exit(1); });
