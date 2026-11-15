'use strict';
const assert = require('assert');
const mv = require('../lib/market-value');
const msv = require('../lib/match-squad-value');

assert.strictEqual(msv.posGroup('GK'), 'GK');
assert.strictEqual(msv.posGroup('Goalkeeper'), 'GK');
assert.strictEqual(msv.posGroup('CB', '中卫'), 'DF');
assert.strictEqual(msv.posGroup('Midfielder'), 'MF');
assert.strictEqual(msv.posGroup('ST', '前锋'), 'FW');
assert.strictEqual(msv.posGroup(24), 'GK');
assert.strictEqual(msv.posGroup(25), 'DF');
assert.strictEqual(msv.posGroup(''), 'UNK');

assert.ok(msv.isInternationalMatch({ league: '欧国联' }));
assert.ok(msv.isInternationalMatch({ league: 'UEFA Nations League' }));
assert.ok(msv.isInternationalMatch({ league: '世界杯预选赛' }));
assert.ok(!msv.isInternationalMatch({ league: '英超' }));
assert.ok(!msv.isInternationalMatch({ league: '西甲' }));

{
  const squad = [
    { name: 'Harry Kane', nameZh: '哈里·凯恩', position: 'Forward' },
    { name: 'Bukayo Saka', nameZh: '布卡约·萨卡', position: 'Forward' },
    { name: 'Luka Modric', nameZh: '卢卡·莫德里奇', position: 'Midfielder' },
    { name: 'Nobody Xyzabc', nameZh: '某某某', position: 'Defender' },
  ];
  const cov = mv.enrichSquadPlayers(squad, 'England', { national: true });
  assert.ok(cov.hit >= 2, 'national lookup should hit known players: ' + JSON.stringify(cov));
  const kane = squad.find((p) => /Kane/i.test(p.name));
  assert.ok(kane && Number(kane.marketValueEur) > 0, 'Kane should enrich without club constraint');
  assert.ok(!(Number(squad[squad.length - 1].marketValueEur) > 0), 'unmatched stays last/unvalued');
  const mapped = squad.map((p, i) => ({
    name: p.name,
    eur: Number(p.marketValueEur) > 0 ? p.marketValueEur : 0,
    posGroup: msv.posGroup(p.position, p.positionZh),
    unmatched: !(Number(p.marketValueEur) > 0),
    rank: p.marketValueRank || (i + 1),
  }));
  const byPos = msv.splitByPos(mapped);
  assert.ok(byPos && byPos.FW && byPos.FW.hit >= 1, 'FW split should have values');
  assert.ok(byPos.FW.eur >= Number(kane.marketValueEur));
}

{
  const payload = {
    ok: true,
    team: 'Liverpool',
    squad: [
      { player: 'Alisson Becker', playerZh: '阿利松' },
      { player: 'Florian Wirtz', playerZh: '维尔茨' },
      { player: 'Some Nobody', playerZh: '阿某某' },
    ],
  };
  const cov = mv.enrichSquadPlayers(payload.squad, payload.team);
  assert.ok(cov.hit >= 2, 'club enrich still works: ' + JSON.stringify(cov));
  assert.strictEqual(payload.squad[0].marketValueRank, 1);
  assert.ok(!(Number(payload.squad[payload.squad.length - 1].marketValueEur) > 0));
}


assert.strictEqual(msv.wantedEnglish('英格兰', ''), 'England');
assert.strictEqual(msv.wantedEnglish('克罗地亚', 'Croatia'), 'Croatia');
assert.ok(msv.isClubNameForNational('New England Revolution', 'England'));
assert.ok(!msv.isClubNameForNational('England', 'England'));
assert.ok(!msv.isClubNameForNational('Croatia', 'Croatia'));
assert.strictEqual(
  (msv.resolveNationalTeam([{ id: '1', name: 'New England Revolution', short: '', abbr: '' }, { id: '448', name: 'England', short: 'ENG', abbr: 'ENG' }], '英格兰', 'England') || {}).id,
  '448'
);

assert.ok(['Turkey', 'Türkiye', 'Turkiye'].includes(msv.wantedEnglish('土耳其', '')));
assert.strictEqual(
  (msv.resolveNationalTeam([{ id: '459', name: 'Belgium', short: 'Belgium', abbr: 'BEL' }, { id: '465', name: 'Türkiye', short: 'Türkiye', abbr: 'TUR' }], '土耳其', '') || {}).id,
  '465'
);

assert.strictEqual(msv.foldName('Altay Bayındır'), msv.foldName('Altay Bayindir'));
assert.strictEqual(msv.foldName('Ferdi Kadıoğlu'), msv.foldName('Ferdi Kadioglu'));
assert.strictEqual(msv.foldName('Emir Han Topcu').replace(/ /g, ''), msv.foldName('Emirhan Topçu').replace(/ /g, ''));


{
  assert.strictEqual(msv.usablePhoto('https://cdn.sportmonks.com/images/soccer/placeholder.png'), '');
  assert.ok(msv.usablePhoto('https://cdn.sportmonks.com/images/soccer/players/0/37255840.png'));
  const rows = [
    { name: 'Jude Bellingham', photo: '' },
    { name: 'Declan Rice', photo: 'https://cdn.sportmonks.com/images/soccer/placeholder.png' },
    { name: 'Nobody Xyzabc', photo: '' },
  ];
  msv.attachPhotos(rows);
  assert.ok(/cdn\.sportmonks\.com\/images\/soccer\/players\//.test(rows[0].photo || ''), 'Bellingham should attach SM photo: ' + rows[0].photo);
  assert.ok(/cdn\.sportmonks\.com\/images\/soccer\/players\//.test(rows[1].photo || ''), 'Rice placeholder should be replaced: ' + rows[1].photo);
  assert.strictEqual(rows[2].photo, '', 'unknown name stays empty, no invented ESPN url');
}

console.log('match-squad-value-test: ok');

{
  const i18n = require('../lib/i18n-football');
  const unlZh = ['丹麦','亚美尼亚','保加利亚','克罗地亚','冰岛','匈牙利','北马其顿','卢森堡','哈萨克','土耳其','圣马力诺','塞尔维亚','塞浦路斯','奥地利','威尔士','希腊','德国','意大利','拉脱维亚','挪威','捷克','摩尔多瓦','斯洛伐克','斯洛文尼','格鲁吉亚','比利时','法罗群岛','波兰','波黑','爱尔兰','爱沙尼亚','瑞典','瑞士','罗马尼亚','芬兰','苏格兰','英格兰','荷兰','葡萄牙','西班牙','阿尔巴尼','黑山'];
  const espn = [
    { id: '479', name: 'Denmark' }, { id: '579', name: 'Armenia' }, { id: '462', name: 'Bulgaria' },
    { id: '477', name: 'Croatia' }, { id: '470', name: 'Iceland' }, { id: '480', name: 'Hungary' },
    { id: '463', name: 'North Macedonia' }, { id: '582', name: 'Luxembourg' }, { id: '2619', name: 'Kazakhstan' },
    { id: '465', name: 'Türkiye' }, { id: '588', name: 'San Marino' }, { id: '6757', name: 'Serbia' },
    { id: '445', name: 'Cyprus' }, { id: '474', name: 'Austria' }, { id: '578', name: 'Wales' },
    { id: '455', name: 'Greece' }, { id: '481', name: 'Germany' }, { id: '162', name: 'Italy' },
    { id: '456', name: 'Latvia' }, { id: '464', name: 'Norway' }, { id: '450', name: 'Czechia' },
    { id: '483', name: 'Moldova' }, { id: '468', name: 'Slovakia' }, { id: '472', name: 'Slovenia' },
    { id: '584', name: 'Georgia' }, { id: '459', name: 'Belgium' }, { id: '447', name: 'Faroe Islands' },
    { id: '471', name: 'Poland' }, { id: '452', name: 'Bosnia-Herzegovina' }, { id: '476', name: 'Republic of Ireland' },
    { id: '444', name: 'Estonia' }, { id: '466', name: 'Sweden' }, { id: '475', name: 'Switzerland' },
    { id: '473', name: 'Romania' }, { id: '458', name: 'Finland' }, { id: '580', name: 'Scotland' },
    { id: '448', name: 'England' }, { id: '449', name: 'Netherlands' }, { id: '482', name: 'Portugal' },
    { id: '164', name: 'Spain' }, { id: '585', name: 'Albania' }, { id: '6775', name: 'Montenegro' },
  ];
  for (const zh of unlZh) {
    const en = i18n.natEn(zh);
    assert.ok(en, 'natEn missing for ' + zh);
    const hit = msv.resolveNationalTeam(espn, zh, '');
    assert.ok(hit && hit.id, 'resolveNationalTeam failed for ' + zh + ' (natEn=' + en + ')');
  }
}
