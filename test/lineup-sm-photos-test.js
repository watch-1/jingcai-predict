'use strict';
const assert = require('assert');
const lu = require('../lib/espn-lineup');

assert.strictEqual(lu.zhKey('瓦拉斯·扬'), '瓦拉斯扬');
assert.strictEqual(lu.photoNameHit(
  { name: 'Wallace Yan', nameZh: '瓦拉斯·扬', number: '47' },
  { name: 'Wallace Yan', number: '47' },
), true);
assert.strictEqual(lu.photoNameHit(
  { name: 'Wallace Yan', nameZh: '瓦拉斯·扬', number: '47' },
  { name: '扬', nameZh: '瓦拉斯·扬', number: '47' },
), true);
assert.strictEqual(lu.photoNameHit(
  { name: 'Guzmán Rodríguez', nameZh: '古兹曼·罗德里古埃兹', number: '2' },
  { name: 'Guzman Rodriguez', number: '2' },
), true);
assert.strictEqual(lu.photoNameHit(
  { name: 'Other', nameZh: '其他人', number: '47' },
  { name: 'Wallace Yan', number: '47' },
), false, 'jersey alone is not enough');
assert.strictEqual(lu.photoNameHit(
  { name: '', nameZh: '', number: '' },
  { name: 'Wallace Yan', number: '47' },
), false);

assert.strictEqual(lu.photoNameHit(
  { name: 'Matheuzinho', nameZh: '马特乌津约', number: '10' },
  { name: 'Matheus', nameZh: '马特乌斯', number: '10' },
), true);
assert.strictEqual(lu.photoNameHit(
  { name: 'Mateusinho', nameZh: '马特乌辛约', number: '98' },
  { name: 'Matheus', nameZh: '马特乌斯', number: '10' },
), false, 'diminutive without the same jersey must not match');
assert.strictEqual(lu.photoNameHit(
  { name: 'Rúben Ismael', nameZh: '鲁本·伊斯马埃尔', number: '16' },
  { name: 'Ruben Ramos', nameZh: '鲁本·拉莫斯', number: '16' },
), true);
assert.strictEqual(lu.photoNameHit(
  { name: 'Bruninho', nameZh: '布鲁宁约', number: '19' },
  { name: 'Bruno Gonçalves', nameZh: '布鲁诺·贡萨尔韦斯', number: '19' },
), true);

const pack = {
  players: {
    away: [
      { name: 'Wallace Yan', nameZh: '瓦拉斯·扬', jersey: '47', image: 'https://cdn.sportmonks.com/yan.png' },
      { name: 'Ghost', nameZh: '占位', jersey: '99', image: 'https://cdn.sportmonks.com/placeholder.png' },
    ],
    home: [
      { name: 'Lucas Braga', nameZh: '卢卡斯', jersey: '11', image: 'https://cdn.sportmonks.com/lucas.png' },
    ],
  },
};
const side = {
  team: 'Red Bull Bragantino',
  starters: [
    { name: 'Wallace Yan', number: '47' },
    { name: 'Someone Else', number: '8' },
  ],
  bench: [],
};
const n = lu.overlaySmPhotos(side, '2042842', 'away', pack);
assert.strictEqual(n, 1);
assert.strictEqual(side.starters[0].photo, 'https://cdn.sportmonks.com/yan.png');
assert.strictEqual(side.starters[0].photoSrc, 'sportmonks');
assert.ok(!side.starters[1].photo);
const none = lu.overlaySmPhotos(side, '2042842', 'home', pack);
assert.strictEqual(none, 0, 'home SM names do not attach to the away XI');

const warm = require('../lib/lineup-photo-warm');
assert.deepStrictEqual(warm.collectSmSurfaceUrls(pack), [
  'https://cdn.sportmonks.com/lucas.png',
  'https://cdn.sportmonks.com/yan.png',
]);
assert.ok(!warm.collectSmSurfaceUrls(pack).some(u => /placeholder/.test(u)));

const now = Date.parse('2026-11-19T16:00:00+08:00');
const from = warm.collectFromMatches(
  [{ id: '2042842', date: '2026-11-20', time: '06:30' }],
  {
    now,
    withinHours: 36,
    readMatchCache: () => ({ v: { prevAway: side } }),
    readSurfaceCache: () => pack,
  },
);
assert.ok(from.includes('https://cdn.sportmonks.com/yan.png'));
assert.ok(from.includes('https://cdn.sportmonks.com/lucas.png'));
assert.ok(from.indexOf('https://cdn.sportmonks.com/yan.png') < from.indexOf('https://cdn.sportmonks.com/lucas.png')
  || from.includes('https://cdn.sportmonks.com/yan.png'), 'lineup URLs still collected');

console.log('lineup-sm-photos-test ok');
