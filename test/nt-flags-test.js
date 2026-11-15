'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const nt = require('../public/js/nt-flags');

const flagsDir = path.join(__dirname, '../public/assets/flags');

const shorts = {
  '哈萨克': 'kz',
  '哈萨克斯坦': 'kz',
  '斯洛文尼': 'si',
  '斯洛文尼亚': 'si',
  '波黑': 'ba',
  '北马其顿': 'mk',
  '法罗群岛': 'fo',
  '摩尔多瓦': 'md',
  '苏格兰': 'gb-sct',
  '英格兰': 'gb-eng',
  '克罗地亚': 'hr',
  '捷克': 'cz',
  '西班牙': 'es',
  '比利时': 'be',
  '意大利': 'it',
  '拉脱维亚': 'lv',
  '亚美尼亚': 'am',
  '瑞典': 'se',
  '斯洛伐克': 'sk',
  '爱沙尼亚': 'ee',
  '保加利亚': 'bg',
  '冰岛': 'is',
  '卢森堡': 'lu',
  '瑞士': 'ch',
  '荷兰': 'nl',
  '新加坡': 'sg',
  '巴拉圭': 'py',
  '威尔士': 'gb-wls',
  '北爱尔兰': 'gb-nir',
};

for (const [name, iso] of Object.entries(shorts)) {
  assert.strictEqual(nt.flagIso2FromName(name), iso, name + ' -> ' + iso);
  const file = path.join(flagsDir, iso + '.png');
  assert.ok(fs.existsSync(file), 'bundled flag ' + iso);
}

const clubs = ['西班牙人', '新英格兰', '皇家社会', '巴黎圣日耳曼', '国际米兰'];
for (const name of clubs) {
  assert.strictEqual(nt.flagIso2FromName(name), '', 'club exclusion ' + name);
  assert.strictEqual(nt.flagIso2FromName(name, { league: '欧国联' }), '', 'club exclusion in NT league ' + name);
}

assert.strictEqual(nt.flagIso2FromName('意大利女足'), '', 'suffix without NT league is not guessed');
assert.strictEqual(nt.flagIso2FromName('意大利女足', { league: '女足世界杯' }), 'it');
assert.strictEqual(nt.flagIso2FromName('西班牙U21', { league: '欧青赛' }), 'es');
assert.ok(nt.isNationalTeamCompetition('欧国联 · 周日009'));
assert.ok(nt.isNationalTeamCompetition('国际赛'));
assert.ok(nt.isNationalTeamCompetition('世预赛'));
assert.ok(!nt.isNationalTeamCompetition('荷甲'));
assert.ok(!nt.isNationalTeamCompetition('英超'));
assert.ok(!nt.isNationalTeamCompetition('日职'));

assert.strictEqual(nt.flagIso2FromName('阿贾克斯'), '');
assert.strictEqual(nt.flagIso2FromName('本菲卡'), '');
assert.strictEqual(nt.flagIso2FromName('神户胜利船'), '');
assert.strictEqual(nt.flagIso2FromName('未知国度'), '');

// URL iso wins when provided
const fromUrl = nt.resolveNationalFlagIso2(
  'https://a.espncdn.com/i/teamlogos/countries/500/arm.png',
  '亚美尼亚',
  '欧国联',
  () => 'am'
);
assert.strictEqual(fromUrl, 'am');

// SM team PNG + Chinese short name still resolves
assert.strictEqual(
  nt.resolveNationalFlagIso2('https://cdn.sportmonks.com/images/soccer/teams/11/18603.png', '哈萨克', '欧国联'),
  'kz'
);
assert.strictEqual(
  nt.resolveNationalFlagIso2('https://cdn.sportmonks.com/images/soccer/teams/24/18648.png', '斯洛伐克', '欧国联'),
  'sk'
);
assert.strictEqual(
  nt.resolveNationalFlagIso2('https://example.com/x.png', '摩尔多瓦', '欧国联'),
  'md'
);
assert.notStrictEqual(nt.flagIso2FromName('摩尔多瓦'), 'be', 'Moldova is not Belgium');
assert.strictEqual(nt.flagIso2FromName('法罗群岛'), 'fo');
assert.notStrictEqual(nt.flagIso2FromName('法罗群岛'), 'gb-eng');

assert.ok(nt.isCrestPlaceholderLogo('https://cdn.sportmonks.com/images/soccer/placeholder.png'));
assert.ok(!nt.isCrestPlaceholderLogo('https://cdn.sportmonks.com/images/soccer/teams/11/18603.png'));

console.log('nt-flags-test ok', Object.keys(shorts).length, 'names');
