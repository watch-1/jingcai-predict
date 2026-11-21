'use strict';

const assert = require('assert');
const hs = require('../lib/heat-source');
const i18n = require('../lib/i18n-football');

const row = (id, name, extra) => Object.assign({ id, name }, extra || {});

// englishName: national teams use the country map; clubs still win via crest / TEAM_ZH.
assert.strictEqual(hs.englishName('370', '英格兰'), 'England');
assert.strictEqual(hs.englishName('366', '克罗地亚'), 'Croatia');
assert.strictEqual(hs.englishName('', '斯洛文尼'), 'Slovenia');
assert.strictEqual(hs.englishName('', '阿尔巴尼'), 'Albania');
assert.strictEqual(hs.englishName('', '哈萨克'), 'Kazakhstan');
assert.strictEqual(hs.englishName('', '阿尔及利'), 'Algeria');
assert.strictEqual(hs.englishName('', '乌兹别克'), 'Uzbekistan');
assert.strictEqual(hs.englishName('', '哥斯达'), 'Costa Rica');
assert.strictEqual(hs.englishName('', '刚果金'), 'Congo DR');
assert.strictEqual(hs.englishName('910', '新英格兰'), 'New England Revolution');
assert.strictEqual(hs.englishName('1', '阿森纳'), 'Arsenal');
assert.strictEqual(i18n.natEn('危地马拉'), 'Guatemala');
assert.strictEqual(i18n.natEn('库拉索'), 'Curacao');

const englandSearch = [
  row(641, 'New England Revolution'),
  row(462, 'England', { national: true }),
  row(9001, 'England U21', { national: true }),
  row(9002, 'England Women', { national: true }),
  row(9003, 'England National Team', { national: true }),
];
assert.strictEqual(hs.pickTeamId(englandSearch, 'England'), 462, 'England must not hit New England Revolution');
assert.strictEqual(hs.pickTeamId(englandSearch, '英格兰'), 462);
// No senior side in the list: do not fall back to the club or U21.
assert.strictEqual(hs.pickTeamId([
  row(641, 'New England Revolution'),
  row(9001, 'England U21', { national: true }),
], 'England'), null);

// Croatia must not bind an arbitrary first row or a club that only contains the name.
assert.strictEqual(hs.pickTeamId([
  row(132955, 'Croatia Zmijavci'),
  row(109, 'Croatia', { national: true }),
], 'Croatia'), 109);
assert.strictEqual(hs.pickTeamId([row(132955, 'Croatia Zmijavci')], 'Croatia'), null);
assert.strictEqual(hs.pickTeamId([], 'Croatia'), null);
assert.strictEqual(hs.pickTeamId(null, 'Croatia'), null);

// Ireland: senior Republic, not Northern Ireland, when the query is Ireland / 爱尔兰.
assert.strictEqual(hs.pickTeamId([
  row(1, 'Northern Ireland', { national: true }),
  row(2, 'Republic of Ireland', { national: true }),
  row(3, 'Ireland', { national: true }),
], 'Ireland'), 3);
assert.strictEqual(hs.pickTeamId([
  row(1, 'Northern Ireland', { national: true }),
  row(2, 'Republic of Ireland', { national: true }),
], 'Ireland'), 2);
assert.strictEqual(hs.pickTeamId([
  row(1, 'Northern Ireland', { national: true }),
  row(2, 'Republic of Ireland', { national: true }),
], '爱尔兰'), 2);
assert.strictEqual(hs.pickTeamId([
  row(1, 'Northern Ireland', { national: true }),
  row(2, 'Republic of Ireland', { national: true }),
], '北爱尔兰'), 1);

// Guinea must not become Guinea-Bissau or Equatorial Guinea.
assert.strictEqual(hs.pickTeamId([
  row(10, 'Guinea-Bissau', { national: true }),
  row(11, 'Equatorial Guinea', { national: true }),
  row(12, 'Guinea', { national: true }),
], 'Guinea'), 12);
assert.strictEqual(hs.pickTeamId([
  row(10, 'Guinea-Bissau', { national: true }),
  row(11, 'Equatorial Guinea', { national: true }),
], 'Guinea'), null);

// Club queries still work, and must not be treated as countries.
assert.strictEqual(hs.pickTeamId([
  row(641, 'New England Revolution'),
  row(462, 'England', { national: true }),
], 'New England Revolution'), 641);
assert.strictEqual(hs.pickTeamId([
  row(16, 'FC Porto'),
  row(99, 'Porto Alegre'),
], 'Porto'), 16);
assert.strictEqual(hs.pickTeamId([
  row(14, 'Manchester United'),
  row(15, 'Manchester United U21'),
  row(9, 'Manchester City'),
  row(20, 'West Ham United'),
  row(8, 'Newcastle United'),
], 'Manchester United'), 14);
assert.strictEqual(hs.pickTeamId([
  row(14, 'Manchester United'),
  row(9, 'Manchester City'),
], 'United'), null, 'bare United must not guess a club');

// Ambiguous single-token club query with two distinctive extras: do not guess.
assert.strictEqual(hs.pickTeamId([
  row(30, 'Sporting CP'),
  row(31, 'Sporting Kansas City'),
], 'Sporting'), null);
assert.strictEqual(hs.pickTeamId([
  row(30, 'Sporting CP'),
  row(31, 'Sporting Kansas City'),
], 'Sporting Kansas City'), 31);

// Live SportMonks /teams/search often omits senior European NTs and only
// returns a club or youth side whose name happens to contain the country.
// Reject those; do not invent a national-team id.
assert.strictEqual(hs.pickTeamId([
  row(641, 'New England'),
], 'England'), null);
assert.strictEqual(hs.pickTeamId([
  row(132955, 'Croatia U21', { national: true, type: 'national' }),
  row(226926, 'Gwelup Croatia SC'),
], 'Croatia'), null);
assert.strictEqual(hs.pickTeamId([
  row(271378, 'France Aizenay'),
], 'France'), null);
assert.strictEqual(hs.pickTeamId([
  row(5841, 'Portugalete'),
], 'Portugal'), null);
assert.strictEqual(hs.pickTeamId([
  row(30881, 'Toledo Brazil'),
], 'Brazil'), null);
assert.strictEqual(hs.pickTeamId([
  row(589, 'Beitar Jerusalem'),
  row(1820, 'Crusaders'),
], 'USA'), null);
// When the senior national side is actually in the result, keep it.
assert.strictEqual(hs.pickTeamId([
  row(18597, 'Japan', { national: true, type: 'national' }),
], 'Japan'), 18597);

// Never fall back to list[0] when nothing actually matches.
assert.strictEqual(hs.pickTeamId([
  row(1, 'Ajax'),
  row(2, 'PSV'),
], 'England'), null);

// Unique search hit with a distinctive short query (crest/AF short vs SM full name)
assert.strictEqual(hs.pickTeamId([row(3690, 'Kashima Antlers')], 'Kashima'), 3690);
assert.strictEqual(hs.pickTeamId([row(3663, 'Shimizu S-Pulse')], 'Shimizu'), 3663);
assert.strictEqual(hs.pickTeamId([row(1264, 'Western Sydney Wanderers')], 'Western Sydney'), 1264);
assert.strictEqual(hs.pickTeamId([row(1, 'Manchester United')], 'United'), null);
assert.strictEqual(hs.pickTeamId([row(1, 'Real Madrid')], 'Real'), null);
assert.strictEqual(hs.pickTeamId([
  row(3690, 'Kashima Antlers'),
  row(9999, 'Kashima Reds'),
], 'Kashima'), null);

console.log('pick-team-id-test ok');
