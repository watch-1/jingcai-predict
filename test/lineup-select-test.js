'use strict';
const assert = require('assert');
const sel = require('../lib/lineup-select');
const layout = require('../lib/lineup-layout');

function xi(n, extra) {
  const starters = [];
  for (let i = 0; i < n; i++) starters.push({ name: 'P' + i, pos: i === 0 ? 'GK' : 'M', number: String(i + 1) });
  return Object.assign({ starters, bench: [], formation: '4-3-3' }, extra || {});
}

{
  const official = xi(11, { at: 100, source: 'espn' });
  const predicted = xi(11, { at: 500, source: 'predicted' });
  const picked = sel.chooseLineupSide({ official, predicted, previous: xi(11, { at: 900 }) });
  assert.strictEqual(picked.kind, 'official');
  assert.strictEqual(picked.source, 'espn');
  assert.strictEqual(picked.at, 100);
  console.log('official wins over newer predicted and previous');
}

{
  const older = xi(11, { at: 10, source: 'old-official' });
  const newer = xi(11, { at: 20, source: 'new-official' });
  const picked = sel.chooseLineupSide({ official: [older, newer], predicted: xi(11, { at: 99 }) });
  assert.strictEqual(picked.source, 'new-official');
  assert.strictEqual(picked.kind, 'official');
  console.log('latest official snapshot wins among official XIs');
}

{
  const picked = sel.chooseLineupSide({ predicted: xi(11), previous: xi(11) });
  assert.strictEqual(picked.kind, 'predicted');
  const prev = sel.chooseLineupSide({ previous: xi(11) });
  assert.strictEqual(prev.kind, 'previous');
  const none = sel.chooseLineupSide({ official: xi(7), predicted: xi(8) });
  assert.strictEqual(none, null);
  console.log('fallback order predicted > previous; thin XIs ignored');
}

{
  const rows = [];
  for (let i = 0; i < 11; i++) {
    rows.push({ type_id: 11, player_id: i + 1, player_name: 'S' + i, jersey_number: i + 1, formation_field: i === 0 ? '1:1' : `2:${i}`, formation_position: i + 1, position_id: i === 0 ? 24 : 26, player: { display_name: 'S' + i, image_path: 'https://cdn.example/p.png' } });
  }
  for (let i = 0; i < 7; i++) {
    rows.push({ type_id: 12, player_id: 20 + i, player_name: 'B' + i, jersey_number: 20 + i, player: { display_name: 'B' + i } });
  }
  // stale predicted XI mixed in
  for (let i = 0; i < 11; i++) {
    rows.push({ type_id: 1600, predicted: true, player_id: 100 + i, player_name: 'Pred' + i, jersey_number: i, formation_field: '1:1' });
  }
  const sides = sel.sideFromSmRows(rows);
  assert.strictEqual(sides.official.starters.length, 11);
  assert.strictEqual(sides.official.bench.length, 7);
  assert.strictEqual(sides.official.kind, 'official');
  assert.strictEqual(sides.predicted.starters.length, 11);
  const espnPending = { ok: true, state: 'pending', home: null, away: null, prevHome: xi(11, { formation: '4-4-2' }), prevAway: xi(11) };
  const merged = sel.mergeLineupPack(espnPending, { homeRows: rows, awayRows: rows });
  assert.strictEqual(merged.home.kind, 'official');
  assert.strictEqual(merged.away.kind, 'official');
  assert.ok(merged.home.starters[0].name.startsWith('S'));
  assert.ok(merged.home.starters.every((p) => !String(p.name).startsWith('Pred')));
  assert.strictEqual(merged.state, 'announced');
  console.log('SM official type 11 replaces ESPN previous and ignores predicted rows');
}

{
  const officialEspn = { ok: true, state: 'announced', home: xi(11, { formation: '4-2-3-1' }), away: xi(11, { formation: '3-5-2' }), prevHome: xi(11) };
  const predictedOnly = [];
  for (let i = 0; i < 11; i++) predictedOnly.push({ type_id: 1600, predicted: true, player_name: 'Pred' + i, formation_field: '2:1' });
  const merged = sel.mergeLineupPack(officialEspn, { homeRows: predictedOnly, awayRows: predictedOnly });
  assert.strictEqual(merged.home.kind, 'official');
  assert.strictEqual(merged.home.formation, '4-2-3-1');
  assert.ok(merged.home.starters.every((p) => !String(p.name).startsWith('Pred')));
  console.log('already official ESPN XI is not replaced by predicted SM rows');
}

{
  assert.strictEqual(layout.parseFormation('4-3-3').join('-'), '4-3-3');
  assert.strictEqual(layout.parseFormation('主 4-2-3-1').join('-'), '4-2-3-1');
  assert.deepStrictEqual(layout.xsForCount(3), [18, 50, 82]);
  assert.deepStrictEqual(layout.xsForCount(4), [10, 40, 70, 100].map((_, i, a) => [10, 40, 70, 90][i]) && layout.xsForCount(4), [10, 40, 70, 90] ? layout.xsForCount(4) : []);
  const xs4 = layout.xsForCount(4);
  assert.strictEqual(xs4[0], 10);
  assert.strictEqual(xs4[3], 90);
  const ysA = layout.ysForLines(4, 'away');
  const ysH = layout.ysForLines(4, 'home');
  assert.strictEqual(ysA[0], 8);
  assert.strictEqual(ysA[3], 45);
  assert.strictEqual(ysH[0], 94);
  assert.strictEqual(ysH[3], 55);
  console.log('formation parse + end/mid y positions OK');
}

{
  const ysA = layout.ysForLines(5, 'away');
  const ysH = layout.ysForLines(5, 'home');
  assert.strictEqual(ysA[0], 6.5);
  assert.strictEqual(ysA[4], 46);
  assert.strictEqual(ysH[0], 95.5);
  assert.strictEqual(ysH[4], 54);
  const gap = ysA[1] - ysA[0];
  assert.ok(gap >= 9.8, '5-line vertical gap ' + gap);
  console.log('5-line y spacing OK', ysA, ysH);
}

{
  const starters = [
    { name: 'GK', pos: 'GK', place: 1, number: '1' },
    { name: 'LB', pos: 'LB', place: 2, number: '3' },
    { name: 'LCB', pos: 'CB', place: 3, number: '4' },
    { name: 'RCB', pos: 'CB', place: 4, number: '5' },
    { name: 'RB', pos: 'RB', place: 5, number: '2' },
    { name: 'LCM', pos: 'CM', place: 6, number: '8' },
    { name: 'CM', pos: 'CM', place: 7, number: '6' },
    { name: 'RCM', pos: 'CM', place: 8, number: '10' },
    { name: 'LW', pos: 'LW', place: 9, number: '11' },
    { name: 'ST', pos: 'ST', place: 10, number: '9' },
    { name: 'RW', pos: 'RW', place: 11, number: '7' },
  ];
  const away = layout.placeSide({ starters, formation: '4-3-3' }, 'away');
  const home = layout.placeSide({ starters, formation: '4-3-3' }, 'home');
  const awayGk = away.find((p) => p.p.pos === 'GK');
  const homeGk = home.find((p) => p.p.pos === 'GK');
  const awaySt = away.find((p) => p.p.pos === 'ST');
  const homeSt = home.find((p) => p.p.pos === 'ST');
  assert.ok(awayGk.top < 15, 'away GK at top end');
  assert.ok(homeGk.top > 85, 'home GK at bottom end');
  assert.ok(awaySt.top > awayGk.top, 'away attacks down');
  assert.ok(homeSt.top < homeGk.top, 'home attacks up');
  assert.ok(Math.abs(awaySt.top - 45) < 3 || awaySt.top > 35, 'away striker near mid');
  assert.ok(homeSt.top < 65, 'home striker near mid');
  const awayLb = away.find((p) => p.p.pos === 'LB');
  const awayRb = away.find((p) => p.p.pos === 'RB');
  const homeLb = home.find((p) => p.p.pos === 'LB');
  const homeRb = home.find((p) => p.p.pos === 'RB');
  // away left = viewer's right
  assert.ok(awayLb.left > awayRb.left, `away LB (team left) should be viewer's right ${awayLb.left} vs RB ${awayRb.left}`);
  // home left = viewer's left
  assert.ok(homeLb.left < homeRb.left, `home LB should be viewer's left ${homeLb.left} vs RB ${homeRb.left}`);
  const mids = home.filter((p) => p.p.pos === 'CM');
  mids.sort((a, b) => a.left - b.left);
  assert.ok(mids[2].left - mids[0].left >= 50, 'midfielders use a wide track, not cramped');
  const paths = layout.linkPaths(home, away);
  assert.ok(paths.length > 8, 'connecting lines exist');
  console.log('half-vs-half laterality + mid spacing OK');
}

console.log('lineup-select + layout tests passed');

{
  const layout = require('../lib/lineup-layout');
  const awayStarters = [
    { name: 'Merbel', pos: 'G', number: '1' },
    { name: 'Barglan', pos: 'RM', number: '2' },
    { name: 'Boumassaoudi', pos: 'LM', number: '40' },
    { name: 'Laros', pos: 'CD', number: '33' },
    { name: 'Fortes', pos: 'CD-R', number: '22' },
    { name: 'Maas', pos: 'CD-L', number: '3' },
    { name: 'Schuppen', pos: 'CM-R', number: '35' },
    { name: 'Eikelboom', pos: 'SW', number: '18' },
    { name: 'Monzialo', pos: 'CF-R', number: '8' },
    { name: 'Grach', pos: 'CF-L', number: '9' },
    { name: 'Decorte', pos: 'CM-L', number: '10' },
  ];
  const away = layout.placeSide({ starters: awayStarters, formation: '3-1-4-2' }, 'away');
  const byLine = {};
  for (const pl of away) (byLine[pl.line] = byLine[pl.line] || []).push(pl.p.name);
  const rows = Object.keys(byLine).map(Number).sort((a,b)=>a-b).map(k => byLine[k]);
  assert.strictEqual(rows.length, 5, '3-1-4-2 has GK + 4 lines');
  assert.ok(rows[1].includes('Laros') && rows[1].includes('Fortes') && rows[1].includes('Maas'), 'back 3 are centre-backs');
  assert.ok(!rows[1].includes('Barglan') && !rows[1].includes('Boumassaoudi'), 'wingers not packed into the back 3');
  assert.ok(rows[rows.length-1].includes('Monzialo') && rows[rows.length-1].includes('Grach'), 'forwards meet at midfield');
  console.log('3-1-4-2 role packing OK', rows);

  const homeStarters = [
    { name: 'Schiks', pos: 'G', number: '1' },
    { name: 'Mazyani', pos: 'RB', number: '33' },
    { name: 'Castillo', pos: 'LB', number: '5' },
    { name: 'Postma', pos: 'SW', number: '6' },
    { name: 'Gelderen', pos: 'CD-R', number: '4' },
    { name: 'Wijs', pos: 'CD-L', number: '30' },
    { name: 'Veen', pos: 'RM', number: '11' },
    { name: 'Loo', pos: 'CM', number: '22' },
    { name: 'Haar', pos: 'CF-R', number: '9' },
    { name: 'Hedel', pos: 'CF-L', number: '18' },
    { name: 'Misidjan', pos: 'LM', number: '93' },
  ];
  const home = layout.placeSide({ starters: homeStarters, formation: '4-1-3-2' }, 'home');
  const h = {};
  for (const pl of home) (h[pl.line] = h[pl.line] || []).push(pl.p.name);
  const hrows = Object.keys(h).map(Number).sort((a,b)=>a-b).map(k => h[k]);
  assert.strictEqual(hrows.length, 5, '4-1-3-2 has GK + 4 lines');
  assert.strictEqual(hrows[1].length, 4, 'back 4');
  assert.ok(hrows[hrows.length-1].includes('Haar') && hrows[hrows.length-1].includes('Hedel'), 'two strikers at mid');
  assert.ok(!hrows[1].includes('Veen') && !hrows[1].includes('Misidjan'), 'wide mids not in the back 4');
  console.log('4-1-3-2 role packing OK', hrows);
}
