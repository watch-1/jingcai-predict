'use strict';
const assert = require('assert');
const { namesLooseEqual } = require('../lib/espn-lineup');

function pickAfSquadPhoto(afPool, p) {
  const withPh = afPool.filter(x => x && x.photo);
  const byName = withPh.filter(x => namesLooseEqual(x.player || x.name || '', p.player || p.name || ''));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const byNo = byName.filter(x => p.number && x.number != null && String(x.number) === String(p.number));
    if (byNo.length === 1) return byNo[0];
    return byName[0];
  }
  const pnorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const sur = pnorm(p.player || p.name).split(' ').pop();
  if (sur && sur.length >= 4 && p.number != null && String(p.number) !== '') {
    const hits = withPh.filter(x => {
      const s = pnorm(x.player || x.name || '').split(' ').pop();
      return s === sur && x.number != null && String(x.number) === String(p.number);
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

const espn = [
  { player: 'Marcus Bettinelli', number: '13', photo: '' },
  { player: 'Gianluigi Donnarumma', number: '1', photo: '' },
  { player: 'Rúben Dias', number: '3', photo: '' },
  { player: 'Erling Haaland', number: '9', photo: '' },
  { player: 'Kevin De Bruyne', number: '17', photo: '' },
];
const af = [
  { player: 'M. Bettinelli', number: '13', photo: 'https://media.api-sports.io/football/players/19012.png' },
  { player: 'G. Donnarumma', number: '1', photo: 'https://media.api-sports.io/football/players/1622.png' },
  { player: 'Rúben Dias', number: '3', photo: 'https://media.api-sports.io/football/players/567.png' },
  { player: 'E. Haaland', number: '9', photo: 'https://media.api-sports.io/football/players/1100.png' },
  { player: 'K. De Bruyne', number: '17', photo: 'https://media.api-sports.io/football/players/629.png' },
];

let hit = 0;
for (const p of espn) {
  const m = pickAfSquadPhoto(af, p);
  assert.ok(m && m.photo, 'miss ' + p.player);
  p.photo = m.photo;
  hit++;
}
assert.strictEqual(hit, 5);
// Never treat ESPN athlete id as AF id
assert.ok(!/players\/234878\.png/.test(espn[2].photo), 'must not use ESPN id as AF photo');
assert.ok(/players\/567\.png/.test(espn[2].photo));
console.log('squad-photos-test ok', hit + '/' + espn.length);
