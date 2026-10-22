'use strict';
const assert = require('assert');
const mv = require('../lib/market-value');

const st = mv.status();
assert.ok(st.ok, 'index should load: ' + (st.error || st.noteZh));

// Alisson Becker at Liverpool — mononym index row
{
  const r = mv.lookupPlayer('Alisson Becker', { club: 'Liverpool', requireClub: true });
  assert.ok(r.ok, 'Alisson should match: ' + JSON.stringify(r));
  assert.ok(r.eur > 0, 'Alisson eur');
  assert.ok(/liverpool/i.test(r.club || ''), 'Alisson club ' + r.club);
}

// Florian Wirtz
{
  const r = mv.lookupPlayer('Florian Wirtz', { club: 'Liverpool', requireClub: true });
  assert.ok(r.ok && r.eur >= 1e8, 'Wirtz ' + JSON.stringify(r));
}

// Kostas Tsimikas — diminutive + unique last-name (index may say Roma)
{
  const r = mv.lookupPlayer('Kostas Tsimikas', { club: 'Liverpool', requireClub: true });
  assert.ok(r.ok, 'Tsimikas should match uniquely: ' + JSON.stringify(r));
  assert.ok(r.eur > 0);
}

// Chiesa at Liverpool
{
  const r = mv.lookupPlayer('Federico Chiesa', { club: 'Liverpool', requireClub: true });
  assert.ok(r.ok && r.eur > 0, 'Chiesa ' + JSON.stringify(r));
}

// Douvikas at Como
{
  const r = mv.lookupPlayer('Anastasios Douvikas', { club: 'Como', requireClub: true });
  assert.ok(r.ok && r.eur >= 2e7, 'Douvikas ' + JSON.stringify(r));
}

// enrichTeam ranks values first; 暂无 last
{
  const payload = {
    ok: true,
    team: 'Liverpool',
    squad: [
      { player: 'Freddie Woodman', playerZh: '弗雷迪·伍德曼' },
      { player: 'Alisson Becker', playerZh: '阿利松·拉姆西斯·贝克尔' },
      { player: 'Florian Wirtz', playerZh: '弗洛里安·维尔茨' },
      { player: 'Some Nobody', playerZh: '阿某某' },
      { player: 'Kostas Tsimikas', playerZh: '哥斯达斯·斯米卡斯' },
      { player: 'Federico Chiesa', playerZh: '费代里科·基耶萨' },
    ],
  };
  mv.enrichTeam(payload);
  assert.ok(payload.squadMarketCoverage.hit >= 4, 'hit ' + JSON.stringify(payload.squadMarketCoverage));
  const top = payload.squad[0];
  assert.ok(Number(top.marketValueEur) > 0, 'rank1 must have value, got ' + top.player);
  assert.strictEqual(top.marketValueRank, 1);
  // last should be nobody / unmatched
  const last = payload.squad[payload.squad.length - 1];
  assert.ok(!(Number(last.marketValueEur) > 0), 'last should be 暂无: ' + last.player);
  // Alisson must have value after mononym match
  const ali = payload.squad.find(p => /Alisson/i.test(p.player));
  assert.ok(ali && Number(ali.marketValueEur) > 0, 'Alisson enriched');
}

// rankSquadPlayers: nulls always after values
{
  const squad = [
    { player: 'A', playerZh: '阿', marketValueEur: null },
    { player: 'B', playerZh: '贝', marketValueEur: 50000000 },
    { player: 'C', playerZh: '西', marketValueEur: 0 },
    { player: 'D', playerZh: '迪', marketValueEur: 100000000 },
  ];
  mv.rankSquadPlayers(squad);
  assert.strictEqual(squad[0].player, 'D');
  assert.strictEqual(squad[1].player, 'B');
  assert.ok(!(Number(squad[2].marketValueEur) > 0));
  assert.ok(!(Number(squad[3].marketValueEur) > 0));
}

console.log('market-value-match-test: ok');
