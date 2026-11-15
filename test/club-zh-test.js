'use strict';

const assert = require('assert');
const { clubDisplayZh } = require('../lib/club-zh');

function eq(en, zh) {
  assert.strictEqual(clubDisplayZh(en), zh, en + ' → ' + clubDisplayZh(en) + ' (want ' + zh + ')');
}

// Screenshot t1098u names
eq('Club Internacional de Fútbol Miami', '迈阿密国际');
eq('Inter Miami', '迈阿密国际');
eq('Inter Miami CF', '迈阿密国际');
eq('Atlético de Madrid', '马竞');
eq('Atletico de Madrid', '马竞');
eq('Chelsea FC', '切尔西');
eq('Inter Milan', '国际米兰');
eq('Como 1907', '科莫');
eq('Liverpool FC', '利物浦');
eq('Tottenham Hotspur', '热刺');
eq('Manchester United', '曼联');
eq('Aston Villa', '阿斯顿维拉');

// Must not substring-bind onto Inter Milan
eq('Sport Club Internacional', '国际体育会');
assert.notStrictEqual(clubDisplayZh('Sport Club Internacional'), '国际米兰');
eq('Internacional de Bogotá', 'Internacional de Bogotá');
assert.notStrictEqual(clubDisplayZh('Inter Miami'), '国际米兰');
assert.notStrictEqual(clubDisplayZh('Club Internacional de Fútbol Miami'), '国际米兰');

// Short / ambiguous leftovers stay English; exact Inter still means Milan
eq('Inter', '国际米兰');
eq('United', 'United');
eq('Sporting Kansas City', '堪萨斯城竞技');
assert.notStrictEqual(clubDisplayZh('Sporting Kansas City'), '葡萄牙体育');
eq('Sporting CP', '葡萄牙体育');

// Legal forms that should fold onto TEAM_ZH
eq('Al-Nassr Football Club', '利雅胜利');
eq('Al-Hilal Saudi Football Club', '希拉尔');
eq('Al-Ittihad Football Club', '吉达联合');
eq('New England Revolution', '新英格兰革命');
eq('Sevilla FC', '塞维利亚');
eq('Club Brugge KV', '布鲁日');
eq('RCD Espanyol Barcelona', '西班牙人');
eq('Parma Calcio 1913', '帕尔马');
eq('Genoa CFC', '热那亚');
eq('LOSC Lille', '里尔');
eq('FC Barcelona', '巴塞罗那');
eq('Paris Saint-Germain', '巴黎圣日耳曼');
eq('Bayer 04 Leverkusen', '勒沃库森');
eq('1. FC Union Berlin', '柏林联合');
eq('Schalke 04', '沙尔克04');
eq('Mainz 05', '美因茨');
eq('Club Atlético Boca Juniors', '博卡青年');
eq('Club Atlético River Plate', '河床');
eq('RC Strasbourg Alsace', '斯特拉斯堡');
eq('Real Betis Balompié', '贝蒂斯');
eq('Olympique Lyon', '里昂');
eq('SC Braga', '布拉加');
eq('Clube de Regatas do Flamengo', '弗拉门戈');
eq('Sociedade Esportiva Palmeiras', '帕尔梅拉斯');
eq('CF América', '美洲俱乐部');
eq('Fluminense Football Club', '弗鲁米嫩塞');
eq('Panathinaikos Athlitikos Omilos', '帕纳辛奈科斯');
eq('Real Oviedo', '皇家奥维耶多');
eq('CF Monterrey', '蒙特雷');
eq('Club Estudiantes de La Plata', '拉普拉塔大学生');


// Already Chinese, empty, unknown
eq('切尔西', '切尔西');
eq('', '');
eq('Some Obscure United', 'Some Obscure United');

// Payload sites actually display p.club
const app = require('fs').readFileSync(require('path').join(__dirname, '../public/app.js'), 'utf8');
assert.match(app, /p\.posLabel \|\| p\.posZh, p\.club/);
assert.match(require('fs').readFileSync(require('path').join(__dirname, '../lib/match-squad-value.js'), 'utf8'), /clubDisplayZh/);
assert.match(require('fs').readFileSync(require('path').join(__dirname, '../lib/match-radar.js'), 'utf8'), /clubDisplayZh/);

console.log('club-zh-test OK');
