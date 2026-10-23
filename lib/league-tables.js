// League standings / topscorers / top assists.
// 1.9.7: ESPN public APIs are primary (current season). API-Football free plan is stuck at ≤2024
// and must NOT be shown as "current" — only as explicitly requested past season, or fallback
// when ESPN fails AND AF season passes the calendar guardrail (almost never for free plan).
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const marketValue = require('./market-value');

const BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // serve stale up to 7d if upstream fails
const FREE_SEASON = 2024; // AF free plan hard max (as of 2026-10) — NOT the app "current" season
const AF_STALE_WARN = '历史赛季数据源已停用为默认；请查看本赛季公开积分榜数据。';
const CACHE_DIR = () => path.join(DATA_DIR, 'league-tables');

/** Major leagues shown in the data center (竞彩常见 + 五大联赛). */
const LEAGUES = [
  { key: 'epl', id: 39, nameZh: '英超', nameEn: 'Premier League', country: '英格兰' },
  { key: 'laliga', id: 140, nameZh: '西甲', nameEn: 'La Liga', country: '西班牙' },
  { key: 'bundesliga', id: 78, nameZh: '德甲', nameEn: 'Bundesliga', country: '德国' },
  { key: 'seriea', id: 135, nameZh: '意甲', nameEn: 'Serie A', country: '意大利' },
  { key: 'ligue1', id: 61, nameZh: '法甲', nameEn: 'Ligue 1', country: '法国' },
  { key: 'ucl', id: 2, nameZh: '欧冠', nameEn: 'UEFA Champions League', country: '欧洲' },
  { key: 'csl', id: 169, nameZh: '中超', nameEn: 'Super League', country: '中国' },
  { key: 'championship', id: 40, nameZh: '英冠', nameEn: 'Championship', country: '英格兰' },
  { key: 'eredivisie', id: 88, nameZh: '荷甲', nameEn: 'Eredivisie', country: '荷兰' },
];

// Common club Chinese names (API returns English).
const TEAM_ZH = {
  // EPL
  Arsenal: '阿森纳', 'Aston Villa': '阿斯顿维拉', Bournemouth: '伯恩茅斯', Brentford: '布伦特福德',
  Brighton: '布莱顿', 'Brighton & Hove Albion': '布莱顿', Chelsea: '切尔西', 'Crystal Palace': '水晶宫',
  Everton: '埃弗顿', Fulham: '富勒姆', Liverpool: '利物浦', 'Manchester City': '曼城',
  'Manchester United': '曼联', 'Newcastle United': '纽卡斯尔', Newcastle: '纽卡斯尔',
  "Nottingham Forest": '诺丁汉森林', Southampton: '南安普顿', Tottenham: '热刺',
  'Tottenham Hotspur': '热刺', 'West Ham': '西汉姆', 'West Ham United': '西汉姆',
  Wolves: '狼队', 'Wolverhampton Wanderers': '狼队', Leicester: '莱斯特城',
  'Leicester City': '莱斯特城', Ipswich: '伊普斯维奇', 'Ipswich Town': '伊普斯维奇',
  'Luton Town': '卢顿', Burnley: '伯恩利', Sheffield: '谢菲尔德联', 'Sheffield United': '谢菲尔德联',
  // La Liga
  Barcelona: '巴塞罗那', 'Real Madrid': '皇家马德里', Atletico: '马竞', 'Atletico Madrid': '马竞',
  'Atlético Madrid': '马竞', Sevilla: '塞维利亚', Valencia: '瓦伦西亚', Villarreal: '比利亚雷亚尔',
  'Real Sociedad': '皇家社会', 'Athletic Club': '毕尔巴鄂竞技', Bilbao: '毕尔巴鄂竞技',
  Betis: '贝蒂斯', 'Real Betis': '贝蒂斯', Osasuna: '奥萨苏纳', Girona: '赫罗纳',
  Celta: '塞尔塔', 'Celta Vigo': '塞尔塔', Mallorca: '马略卡', Getafe: '赫塔费',
  'Rayo Vallecano': '巴列卡诺', Cadiz: '加的斯', 'Cádiz': '加的斯', Alaves: '阿拉维斯',
  Alavés: '阿拉维斯', 'Las Palmas': '拉斯帕尔马斯', Leganes: '莱加内斯', Leganés: '莱加内斯',
  Espanyol: '西班牙人', Valladolid: '巴拉多利德', Elche: '埃尔切', Granada: '格拉纳达',
  // Bundesliga
  Bayern: '拜仁慕尼黑', 'Bayern Munich': '拜仁慕尼黑', 'Bayern München': '拜仁慕尼黑',
  Dortmund: '多特蒙德', 'Borussia Dortmund': '多特蒙德', Leverkusen: '勒沃库森',
  'Bayer Leverkusen': '勒沃库森', Leipzig: '莱比锡红牛', 'RB Leipzig': '莱比锡红牛',
  Frankfurt: '法兰克福', 'Eintracht Frankfurt': '法兰克福', Wolfsburg: '沃尔夫斯堡',
  Freiburg: '弗赖堡', 'SC Freiburg': '弗赖堡', Hoffenheim: '霍芬海姆',
  Stuttgart: '斯图加特', 'VfB Stuttgart': '斯图加特', Gladbach: '门兴',
  'Borussia Mönchengladbach': '门兴', 'Borussia Monchengladbach': '门兴',
  Augsburg: '奥格斯堡', 'Mainz 05': '美因茨', Mainz: '美因茨', Werder: '云达不莱梅',
  'Werder Bremen': '云达不莱梅', 'Union Berlin': '柏林联合', Heidenheim: '海登海姆',
  Bochum: '波鸿', 'FC St. Pauli': '圣保利', 'St. Pauli': '圣保利', Köln: '科隆', Cologne: '科隆',
  // Serie A
  Inter: '国际米兰', 'Inter Milan': '国际米兰', 'Internazionale': '国际米兰', Milan: 'AC米兰',
  'AC Milan': 'AC米兰', Juventus: '尤文图斯', Napoli: '那不勒斯', Roma: '罗马', 'AS Roma': '罗马',
  Lazio: '拉齐奥', Atalanta: '亚特兰大', Fiorentina: '佛罗伦萨', Bologna: '博洛尼亚',
  Torino: '都灵', Genoa: '热那亚', Monza: '蒙扎', Udinese: '乌迪内斯', Cagliari: '卡利亚里',
  Empoli: '恩波利', Lecce: '莱切', Verona: '维罗纳', 'Hellas Verona': '维罗纳',
  Sassuolo: '萨索洛', Parma: '帕尔马', Como: '科莫', Venezia: '威尼斯',
  // Ligue 1
  'Paris Saint Germain': '巴黎圣日耳曼', 'Paris Saint-Germain': '巴黎圣日耳曼', PSG: '巴黎圣日耳曼',
  Marseille: '马赛', 'Olympique Marseille': '马赛', Lyon: '里昂', 'Olympique Lyonnais': '里昂',
  Monaco: '摩纳哥', Lille: '里尔', Nice: '尼斯', Rennes: '雷恩', Lens: '朗斯', Nantes: '南特',
  Strasbourg: '斯特拉斯堡', Toulouse: '图卢兹', Reims: '兰斯', Montpellier: '蒙彼利埃',
  Brest: '布雷斯特', Auxerre: '欧塞尔', Angers: '昂热', 'Le Havre': '勒阿弗尔',
  'Saint Etienne': '圣埃蒂安', 'Saint-Étienne': '圣埃蒂安',
  // CSL (common)
  'Shanghai Port': '上海海港', 'Shanghai Shenhua': '上海申花', 'Beijing Guoan': '北京国安',
  'Shandong Taishan': '山东泰山', 'Chengdu Rongcheng': '成都蓉城', 'Tianjin Jinmen Tiger': '天津津门虎',
  'Zhejiang': '浙江队', 'Henan': '河南队', 'Wuhan Three Towns': '武汉三镇',
  'Changchun Yatai': '长春亚泰', 'Meizhou Hakka': '梅州客家', 'Qingdao West Coast': '青岛西海岸',
  'Qingdao Hainiu': '青岛海牛', 'Shenzhen Peng City': '深圳新鹏城', 'Cangzhou Mighty Lions': '沧州雄狮',
  // Eredivisie / Championship samples
  Ajax: '阿贾克斯', PSV: 'PSV埃因霍温', Feyenoord: '费耶诺德', 'AZ Alkmaar': '阿尔克马尔',
  // Belgian Pro League (form AF labels)
  'Club Brugge': '布鲁日', Brugge: '布鲁日', Anderlecht: '安德莱赫特',
  Genk: '亨克', 'Standard Liege': '标准列日', 'Standard Liège': '标准列日',
  Antwerp: '安特卫普', 'Royal Antwerp': '安特卫普', Gent: '根特', 'Union Saint-Gilloise': '圣吉联合', 'Union St. Gilloise': '圣吉联合',
  Torreense: '托林斯', 'SCU Torreense': '托林斯', Celtic: '凯尔特人',
  'Lech Poznan': '波兹南', 'Lech Poznań': '波兹南', 'Red Bull Salzburg': '萨尔茨堡', Salzburg: '萨尔茨堡',
  Olympiacos: '奥林匹亚', 'Olympiakos Piraeus': '奥林匹亚', 'Sturm Graz': '格风暴',
  'FC Copenhagen': '哥本哈根', Copenhagen: '哥本哈根', 'Universitatea Craiova': '克拉约瓦',
  'Al-Nassr': '利雅胜利', 'Al Nassr': '利雅胜利',
  Leeds: '利兹联', 'Leeds United': '利兹联', 'Sunderland': '桑德兰', Norwich: '诺维奇',
  Trabzonspor: '特拉布宗体育', Swansea: '斯旺西', 'Swansea City': '斯旺西', 'Go Ahead Eagles': '前进之鹰', Fenerbahce: '费内巴切', 'Fenerbahçe': '费内巴切', Galatasaray: '加拉塔萨雷',
  'Paris FC': '巴黎FC', 'Yunnan Yukun': '云南玉昆', Middlesbrough: '米德尔斯堡', 
  'Brighton and Hove Albion': '布莱顿',
  // UCL / European clubs (beyond domestic leagues)
  'Sporting CP': '葡萄牙体育', Sporting: '葡萄牙体育', 'Shakhtar Donetsk': '顿涅茨克矿工', Shakhtar: '顿涅茨克矿工',
  'AEK Athens': 'AEK雅典', 'Sabah FK': '萨巴赫', Sabah: '萨巴赫',
  'Feyenoord Rotterdam': '费耶诺德', 'Bodo/Glimt': '博德闪耀', 'Bodø/Glimt': '博德闪耀',
  'VIKING FK': '维京', Viking: '维京', 'FC Porto': '波尔图', Porto: '波尔图',
  'Slavia Prague': '布拉格斯拉维亚', 'LASK Linz': 'LASK林茨', LASK: 'LASK林茨',
  'Slovan Bratislava': '布拉迪斯拉发斯拉万人', 'Atlético Madrid': '马竞',
  Maritimo: '马里迪莫', 'C.S. Marítimo': '马里迪莫', 'CS Maritimo': '马里迪莫',
  'Casa Pia': '卡萨皮亚', Moreirense: '莫雷伦斯',
  'Academico Viseu': '维塞乌学院', 'Académico de Viseu': '维塞乌学院',
  'FC Barcelona': '巴塞罗那',
  Auckland: '奥克兰', 'Daejeon Citizen': '大田市民', Excelsior: '精英队',
  'FC Seoul': '首尔FC', 'Fortuna Sittard': '锡塔德幸运', 'Gangwon FC': '江原FC',
  'Gwangju FC': '光州FC', 'HNK Hajduk Split': '哈伊杜克', 'Hull City': '赫尔城',
  'Jeonbuk Motors': '全北现代', 'Kashiwa Reysol': '柏太阳神', 'Le Mans': '勒芒',
  'Melbourne Victory': '墨尔本胜利', Millwall: '米尔沃尔', 'NEC Nijmegen': 'NEC奈梅亨',
  Sydney: '悉尼FC', 'Sydney FC': '悉尼FC', 'Vissel Kobe': '神户胜利船', 'Willem II': '威廉二世',
  // J1 / Asia (form + hard-test samples)
  'Machida Zelvia': '町田泽维', 'FC Machida Zelvia': '町田泽维',
  'Avispa Fukuoka': '福冈黄蜂', 'Yokohama F. Marinos': '横滨水手', 'Yokohama F Marinos': '横滨水手',
  'Yokohama Marinos': '横滨水手', 'Urawa Red Diamonds': '浦和红钻', 'Urawa Reds': '浦和红钻',
  'Nagoya Grampus': '名古屋鲸', 'Kawasaki Frontale': '川崎前锋',
  'Sanfrecce Hiroshima': '广岛三箭', 'Kashima Antlers': '鹿岛鹿角',
  'Shimizu S-Pulse': '清水鼓动', Shimizu: '清水鼓动', 'Kyoto Sanga': '京都',
  'Yokohama FC': '横滨FC', 'Fagiano Okayama': '冈山绿雉', 'Mito Hollyhock': '水户蜀葵',
  'Cerezo Osaka': '大阪樱花', 'Gamba Osaka': '大阪钢巴', 'Tokyo Verdy': '东京绿茵',
  'FC Tokyo': 'FC东京', 'Albirex Niigata': '新泻天鹅', 'Sagan Tosu': '鸟栖砂岩',
  'Consadole Sapporo': '札幌冈萨多', 'Kashiwa Reysol': '柏太阳神',
  'Tampines Rovers': '坦皮尼斯流浪', 'Svay Rieng': '柴桢', 'Preah Khan Reach Svay Rieng': '柴桢',
  'Lion City Sailors': '狮城水手', 'Buriram United': '武里南联', 'Jeonbuk Hyundai Motors': '全北现代',
  'JEF United Ichihara-Chiba': '千叶市原', 'JEF United Chiba': '千叶市原', 'JEF United': '千叶市原',
  'Kataller Toyama': '富山胜利',
  // DE cups / 2.BL / common AF form+next labels (1.9.106)
  'SV Elversberg': '埃沃斯堡', Elversberg: '埃沃斯堡', 'FC Elversberg': '埃沃斯堡',
  'Rot-Weiß Essen': '红白埃森', 'Rot-Weiss Essen': '红白埃森', 'Rot Weiss Essen': '红白埃森',
  'RW Essen': '红白埃森', Essen: '红白埃森',
  'FC Schalke 04': '沙尔克04', 'Schalke 04': '沙尔克04', Schalke: '沙尔克04',
  'Hamburg SV': '汉堡', 'Hamburger SV': '汉堡', 'Hamburger Sportverein': '汉堡',
  HSV: '汉堡', Hamburg: '汉堡', 'Hamburger SV II': '汉堡二队',
  'Holstein Kiel': '基尔', Kiel: '基尔', 'FC Magdeburg': '马格德堡', Magdeburg: '马格德堡',
  'FC Kaiserslautern': '凯泽斯劳滕', Kaiserslautern: '凯泽斯劳滕', '1. FC Kaiserslautern': '凯泽斯劳滕',
  'Hannover 96': '汉诺威96', Hannover: '汉诺威96', 'Fortuna Düsseldorf': '杜塞尔多夫',
  'Fortuna Dusseldorf': '杜塞尔多夫', 'Hertha BSC': '赫塔', Hertha: '赫塔',
  'FC Nurnberg': '纽伦堡', 'FC Nürnberg': '纽伦堡', Nurnberg: '纽伦堡', '1. FC Nürnberg': '纽伦堡',
  'Greuther Furth': '菲尔特', 'Greuther Fürth': '菲尔特', 'SV Darmstadt 98': '达姆施塔特', Darmstadt: '达姆施塔特',
  'SC Paderborn 07': '帕德博恩', Paderborn: '帕德博恩', 'FC Koln': '科隆', '1. FC Köln': '科隆', '1. FC Koln': '科隆',
};

const PLAYER_ZH = {
  'Mohamed Salah': '萨拉赫', Salah: '萨拉赫', 'Erling Haaland': '哈兰德', Haaland: '哈兰德',
  'Harry Kane': '哈里·凯恩', Kane: '哈里·凯恩', 'Kylian Mbappé': '姆巴佩', Mbappe: '姆巴佩',
  'Vinicius Junior': '维尼修斯', 'Robert Lewandowski': '莱万多夫斯基', Lewandowski: '莱万',
  'Lautaro Martinez': '劳塔罗', 'Victor Osimhen': '奥斯梅恩', 'Cole Palmer': '帕尔默',
  'Bukayo Saka': '萨卡', 'Phil Foden': '福登', 'Alexander Isak': '伊萨克', 'A. Isak': '伊萨克',
  'Matheus Cunha': '库尼亚', 'Chris Wood': '伍德', 'Bryan Mbeumo': '姆贝乌莫',
  'Jean-Philippe Mateta': '马特塔', 'Yoane Wissa': '维萨', 'Omar Marmoush': '马尔穆什',
  'R. Lewandowski': '莱万多夫斯基', 'A. Budimir': '布迪米尔', 'Budimir': '布迪米尔',
  'Ante Budimir': '布迪米尔', 'Raphinha': '拉菲尼亚', 'Julian Alvarez': '阿尔瓦雷斯',
  'Julián Álvarez': '阿尔瓦雷斯', 'Lamine Yamal': '亚马尔', 'Pedri': '佩德里',
};

const mem = new Map(); // key -> { at, payload }
const inflight = new Map();
let lastQuota = { remaining: null, limit: null, at: 0 };

function apiKey() {
  const k = process.env.API_FOOTBALL_KEY;
  return (k && String(k).trim()) || '';
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}


/** Hi-res crest override: TheSportsDB ~512 > ESPN 500 > AF media ~150. */
let _crestByAf = null;
let _crestByEn = null;
function normTeamEn(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(fc|afc|cf|sc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function loadCrestMaps() {
  if (_crestByAf && _crestByEn) return;
  _crestByAf = new Map();
  _crestByEn = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    for (const row of Object.values((j && j.teams) || {})) {
      if (!row || !row.badge) continue;
      if (row.afTeamId) _crestByAf.set(String(row.afTeamId), row.badge);
      const en = normTeamEn(row.en || row.nameEn || '');
      if (en) _crestByEn.set(en, row.badge);
    }
  } catch {}
  // Common ESPN / AF display-name aliases → crest en keys
  const aliases = {
    'brighton and hove albion': 'brighton and hove albion',
    brighton: 'brighton and hove albion',
    'manchester city': 'manchester city',
    'man city': 'manchester city',
    'manchester united': 'manchester united',
    'man united': 'manchester united',
    'man utd': 'manchester united',
    'nottingham forest': 'nottingham forest',
    'nottm forest': 'nottingham forest',
    'tottenham hotspur': 'tottenham hotspur',
    tottenham: 'tottenham hotspur',
    spurs: 'tottenham hotspur',
    'west ham united': 'west ham united',
    'west ham': 'west ham united',
    'newcastle united': 'newcastle united',
    newcastle: 'newcastle united',
    'wolverhampton wanderers': 'wolverhampton wanderers',
    wolves: 'wolverhampton wanderers',
    'leicester city': 'leicester city',
    leicester: 'leicester city',
    'leeds united': 'leeds united',
    leeds: 'leeds united',
    'ipswich town': 'ipswich town',
    ipswich: 'ipswich town',
    bournemouth: 'bournemouth',
    'afc bournemouth': 'bournemouth',
    'crystal palace': 'crystal palace',
    'aston villa': 'aston villa',
  };
  for (const [alias, target] of Object.entries(aliases)) {
    const badge = _crestByEn.get(normTeamEn(target)) || _crestByEn.get(target);
    if (badge) _crestByEn.set(normTeamEn(alias), badge);
  }
}
function crestByAfMap() {
  loadCrestMaps();
  return _crestByAf;
}
function crestByEnMap() {
  loadCrestMaps();
  return _crestByEn;
}
function crestForTeamName(teamName) {
  const n = normTeamEn(teamName);
  if (!n) return '';
  const map = crestByEnMap();
  if (map.get(n)) return map.get(n);
  // Prefer longer crest keys contained in the name (avoid short false hits)
  let best = '';
  let bestLen = 0;
  for (const [k, badge] of map.entries()) {
    if (k.length < 5) continue;
    if ((n.includes(k) || k.includes(n)) && k.length > bestLen) {
      best = badge;
      bestLen = k.length;
    }
  }
  return best;
}
function preferEspn500(logo) {
  const s = String(logo || '');
  if (/espncdn\.com.*\/i\/teamlogos\/soccer\/\d+\//i.test(s)) {
    return s.replace(/\/soccer\/\d+\//, '/soccer/500/');
  }
  return s;
}
function upgradeTeamLogo(logo, afTeamId, teamName) {
  const byName = crestForTeamName(teamName);
  if (byName) return byName;
  const id = afTeamId != null ? String(afTeamId) : '';
  if (id) {
    const hit = crestByAfMap().get(id);
    if (hit) return hit;
  }
  const m = String(logo || '').match(/media\.api-sports\.io\/football\/teams\/(\d+)\./i);
  if (m) {
    const hit = crestByAfMap().get(m[1]);
    if (hit) return hit;
  }
  const espn = preferEspn500(logo);
  if (espn) return espn;
  return id ? `https://media.api-sports.io/football/teams/${id}.png` : '';
}
function isLowResAfPlayerPhoto(url) {
  return /media\.api-sports\.io\/football\/players\/\d+\./i.test(String(url || ''));
}

function cachePath(kind, leagueId, season) {
  return path.join(CACHE_DIR(), `${kind}-${leagueId}-${season}.json`);
}

/** Normalize EN club keys for fuzzy lookup (strip punctuation / accents). */
function normTeamKey(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

let _crestEnZh = null;
let _crestEnZhAt = 0;
function crestEnZhMap() {
  if (_crestEnZh && Date.now() - _crestEnZhAt < 600000) return _crestEnZh;
  const map = new Map();
  try {
    const j = readJson(path.join(DATA_DIR, 'crests.json'), {});
    for (const row of Object.values((j && j.teams) || {})) {
      const en = row && row.en;
      const zh = row && (row.zh || row.nameZh);
      if (en && zh && /[\u4e00-\u9fff]/.test(zh)) {
        map.set(normTeamKey(en), zh);
        map.set(String(en).trim().toLowerCase(), zh);
      }
    }
  } catch (_) {}
  _crestEnZh = map;
  _crestEnZhAt = Date.now();
  return map;
}

/** Strip common club legal prefixes/suffixes for fuzzy EN→ZH (AF often prefixes FC/SV). */
function stripClubAffixes(s) {
  return String(s || '')
    .replace(/^(fc|afc|cf|sc|sv|ssv|tsv|vfb|vfl|bsc|ssc|as|ac|rc|ud|cd|sd)\s+/i, '')
    .replace(/\s+(fc|afc|cf|sc|sv|ssv)$/i, '')
    .replace(/\s+04$/i, ' 04')
    .trim();
}

function teamZh(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\u4e00-\u9fff]/.test(n)) return n;
  if (TEAM_ZH[n]) return TEAM_ZH[n];
  const nk = normTeamKey(n);
  const stripped = stripClubAffixes(n);
  const nkStrip = normTeamKey(stripped);
  const crest = crestEnZhMap();
  const fromCrest = crest.get(nk) || crest.get(n.toLowerCase())
    || crest.get(nkStrip) || crest.get(stripped.toLowerCase());
  if (fromCrest) return fromCrest;
  // Also try crest keys contained in / containing the name (prefix-stripped)
  let bestCrest = '';
  let bestLen = 0;
  for (const [k, zh] of crest.entries()) {
    if (k.length < 4) continue;
    if ((nkStrip.includes(k) || k.includes(nkStrip) || nk.includes(k) || k.includes(nk)) && k.length > bestLen) {
      bestCrest = zh;
      bestLen = k.length;
    }
  }
  if (bestCrest) return bestCrest;
  for (const [en, zh] of Object.entries(TEAM_ZH)) {
    const ek = normTeamKey(en);
    if (ek === nk || ek === nkStrip) return zh;
    if (n.toLowerCase() === en.toLowerCase()) return zh;
    if (stripped.toLowerCase() === en.toLowerCase()) return zh;
    if (n.includes(en) || en.includes(n) || stripped.includes(en) || en.includes(stripped)) return zh;
  }
  return n;
}

/** Force league display name to Chinese abbreviations used in 竞彩 UI. */
const LEAGUE_ZH_MAP = {
  'English Premier League': '英超', 'Premier League': '英超', 'English League Championship': '英冠', Championship: '英冠',
  'Spanish LALIGA': '西甲', LALIGA: '西甲', 'La Liga': '西甲', 'LaLiga': '西甲',
  'German Bundesliga': '德甲', Bundesliga: '德甲', 'Italian Serie A': '意甲', 'Serie A': '意甲',
  'French Ligue 1': '法甲', 'Ligue 1': '法甲', 'Portuguese Primeira Liga': '葡超', 'Dutch Eredivisie': '荷甲', Eredivisie: '荷甲',
  'Belgian Pro League': '比甲', 'Austrian Bundesliga': '奥甲', 'Swiss Super League': '瑞士超',
  'Scottish Premiership': '苏超', 'Turkish Super Lig': '土超', 'Turkish Super Lig': '土超',
  'Japanese J1 League': '日职', 'Japanese J.League': '日职', 'Japanese J. League': '日职',
  'J1 League': '日职', 'J.League': '日职', 'J. League': '日职', 'Japan J1 League': '日职',
  'J2 League': '日乙', 'Japanese J2 League': '日乙',
  'K League 1': '韩K联', 'K League': '韩K联', 'Chinese Super League': '中超',
  'Saudi Pro League': '沙特联', MLS: '美职足',
  'UEFA Champions League': '欧冠', 'Champions League': '欧冠',
  'UEFA Europa League': '欧联', 'Europa League': '欧联',
  'UEFA Conference League': '欧协联', 'Conference League': '欧协联',
  'AFC Champions League': '亚冠', 'AFC Champions League Elite': '亚冠精英',
  'AFC Champions League Two': '亚冠二级', 'Club Friendlies': '球会友谊', Friendlies: '友谊赛',
  'Emperor Cup': '天皇杯', 'J.League Cup': '日联赛杯', 'YBC Levain Cup': '日联赛杯',
  // DE / cups (1.9.106)
  'DFB Pokal': '德国杯', 'DFB-Pokal': '德国杯', 'DFB-Pokal ': '德国杯',
  'German Cup': '德国杯', 'Germany DFB Pokal': '德国杯',
  '2. Bundesliga': '德乙', 'German 2. Bundesliga': '德乙', '2.Bundesliga': '德乙',
  '3. Liga': '德丙', 'German 3. Liga': '德丙',
  'FA Cup': '足总杯', 'EFL Cup': '联赛杯', 'Carabao Cup': '联赛杯',
  'Copa del Rey': '国王杯', 'Coppa Italia': '意大利杯', 'Coupe de France': '法国杯',
};
function leagueZh(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\u4e00-\u9fff]/.test(n)) return n;
  if (LEAGUE_ZH_MAP[n]) return LEAGUE_ZH_MAP[n];
  const low = n.toLowerCase();
  for (const [en, zh] of Object.entries(LEAGUE_ZH_MAP)) {
    if (en.toLowerCase() === low) return zh;
    if (low.includes(en.toLowerCase()) || en.toLowerCase().includes(low)) return zh;
  }
  // Heuristic leftovers
  if (/ligue\s*1|french\s*ligue/i.test(n)) return '法甲';
  if (/uefa\s*champions|champions\s*league/i.test(n)) return '欧冠';
  if (/europa\s*league/i.test(n)) return '欧联';
  if (/conference\s*league/i.test(n)) return '欧协联';
  if (/j\s*1|j\.?\s*league|japanese/i.test(n)) return '日职';
  if (/dfb\s*-?\s*pokal|german\s*cup/i.test(n)) return '德国杯';
  if (/2\.?\s*bundesliga/i.test(n)) return '德乙';
  return n;
}
/** 1.9.6: established zh → else Wikidata/auto transliteration (flagged via playerZhAuto) */
function playerZh(name) {
  const z = playerZhBase(name);
  if (!z || /[\u4e00-\u9fff]/.test(z)) return z;
  try { const r = require('./name-auto').autoZh(name); if (r) return r.zh; } catch {}
  return z;
}
function playerZhAuto(name) {
  const z = playerZhBase(name);
  if (!name || /[\u4e00-\u9fff]/.test(z)) return false;
  try { const r = require('./name-auto').autoZh(name); return !!r && r.src === 'auto'; } catch { return false; }
}

let _nameZhCache = null;
let _nameZhAt = 0;
function loadNameZhMap() {
  // Refresh every 10 min so prefetch syncs without restart
  if (_nameZhCache && Date.now() - _nameZhAt < 600000) return _nameZhCache;
  _nameZhCache = readJson(path.join(DATA_DIR, 'squads', '_namezh.json'), {});
  _nameZhAt = Date.now();
  return _nameZhCache;
}

function playerZhBase(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\u4e00-\u9fff]/.test(n)) return n;
  const nameMap = loadNameZhMap();
  if (nameMap[n] && /[\u4e00-\u9fff]/.test(nameMap[n])) return nameMap[n];
  if (PLAYER_ZH[n]) return PLAYER_ZH[n];
  const lower = n.toLowerCase();
  for (const [en, zh] of Object.entries(PLAYER_ZH)) {
    if (lower === en.toLowerCase()) return zh;
  }
  for (const [en, zh] of Object.entries(nameMap)) {
    if (!/[\u4e00-\u9fff]/.test(zh)) continue;
    if (/^\d+$/.test(en)) continue; // skip id keys
    if (en.toLowerCase() === lower) return zh;
  }
  // Abbreviated "R. Lewandowski" / "A. Isak" only — not full different first names sharing a surname
  const parts = n.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  const sur = parts.length ? parts[parts.length - 1] : '';
  const first = parts.length >= 2 ? parts[0] : '';
  const abbreviated = parts.length >= 2 && first.length <= 2;
  const singleToken = parts.length === 1;
  if (sur && sur.length > 2 && (abbreviated || singleToken)) {
    for (const [en, zh] of Object.entries(PLAYER_ZH)) {
      if (en.toLowerCase() === sur.toLowerCase()) return zh;
      if (abbreviated && en.toLowerCase().endsWith(' ' + sur.toLowerCase())) {
        const enFirst = en.split(/\s+/)[0] || '';
        if (enFirst && enFirst[0].toLowerCase() === first[0].toLowerCase()) return zh;
      }
    }
    for (const [en, zh] of Object.entries(nameMap)) {
      if (!/[\u4e00-\u9fff]/.test(zh) || /^\d+$/.test(en) || en.startsWith('af:')) continue;
      if (en.toLowerCase() === sur.toLowerCase()) return zh;
      if (abbreviated && en.toLowerCase().endsWith(' ' + sur.toLowerCase())) {
        const enFirst = en.split(/\s+/)[0] || '';
        if (enFirst && enFirst[0].toLowerCase() === first[0].toLowerCase()) return zh;
      }
    }
  }
  return n;
}

function resolveLeague(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return LEAGUES[0];
  const byKey = LEAGUES.find(l => l.key === s);
  if (byKey) return byKey;
  const id = Number(s);
  if (Number.isFinite(id)) return LEAGUES.find(l => l.id === id) || { key: String(id), id, nameZh: '联赛', nameEn: '', country: '' };
  return LEAGUES.find(l => l.nameZh === q || l.nameEn.toLowerCase() === s) || null;
}

function seasonLabel(season, leagueId) {
  // CSL / calendar leagues: plain year; European: YYYY/YY+1
  if (leagueId === 169) return String(season);
  return `${season}/${String(season + 1).slice(-2)}`;
}

async function afFetch(apiPath) {
  const key = apiKey();
  if (!key) throw Object.assign(new Error('no_key'), { code: 'no_key' });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BASE + apiPath, {
      headers: { 'x-apisports-key': key, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const rem = r.headers.get('x-ratelimit-requests-remaining');
    const lim = r.headers.get('x-ratelimit-requests-limit');
    if (rem != null) lastQuota = { remaining: Number(rem), limit: lim != null ? Number(lim) : 100, at: Date.now() };
    const j = await r.json();
    if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
      const err = j.errors;
      const msg = typeof err === 'object' && !Array.isArray(err)
        ? Object.values(err).join('; ')
        : JSON.stringify(err);
      const e = new Error(msg);
      e.code = /season|plan|Free/i.test(msg) ? 'season' : 'upstream';
      e.raw = err;
      throw e;
    }
    return j.response || [];
  } finally { clearTimeout(t); }
}

function loadDisk(kind, leagueId, season) {
  const file = cachePath(kind, leagueId, season);
  const j = readJson(file, null);
  if (!j || !j.payload) return null;
  return { at: j.at || 0, payload: j.payload, file };
}

function saveDisk(kind, leagueId, season, payload) {
  try {
    writeJson(cachePath(kind, leagueId, season), { at: Date.now(), payload });
  } catch (e) {
    console.warn('league-tables cache write failed', e.message);
  }
}

function memKey(kind, leagueId, season) {
  return `${kind}:${leagueId}:${season}`;
}

async function withCache(kind, leagueId, season, fetcher) {
  const mk = memKey(kind, leagueId, season);
  const now = Date.now();
  const hit = mem.get(mk);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return { ...hit.payload, cached: true, cacheAgeSec: Math.round((now - hit.at) / 1000) };
  }
  const disk = loadDisk(kind, leagueId, season);
  if (disk && now - disk.at < CACHE_TTL_MS) {
    mem.set(mk, { at: disk.at, payload: disk.payload });
    return { ...disk.payload, cached: true, cacheAgeSec: Math.round((now - disk.at) / 1000) };
  }

  let job = inflight.get(mk);
  if (!job) {
    job = (async () => {
      try {
        const payload = await fetcher();
        mem.set(mk, { at: Date.now(), payload });
        saveDisk(kind, leagueId, season, payload);
        return { ...payload, cached: false, cacheAgeSec: 0 };
      } catch (e) {
        // Prefer any fresh-ish stale cache over hard fail (offline / quota)
        const stale = disk || (hit ? { at: hit.at, payload: hit.payload } : null);
        if (stale && now - stale.at < STALE_MAX_MS) {
          return {
            ...stale.payload,
            cached: true,
            stale: true,
            cacheAgeSec: Math.round((now - stale.at) / 1000),
            staleError: e.message,
          };
        }
        throw e;
      }
    })().finally(() => inflight.delete(mk));
    inflight.set(mk, job);
  }
  return job;
}

function calendarSeasonYear(leagueId) {
  // CSL (169) is calendar year; European leagues Aug–May → start year
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (Number(leagueId) === 169) return y;
  return m >= 7 ? y : y - 1;
}
/** AF season to fetch: explicit request, else current calendar (may fail on free plan). */
function pickSeason(requested, leagueId) {
  const n = Number(requested);
  if (Number.isFinite(n) && n >= 2018 && n <= 2030) return n;
  return calendarSeasonYear(leagueId);
}
function seasonIsCurrentOrPrev(season, leagueId) {
  const cur = calendarSeasonYear(leagueId);
  return Number(season) >= cur - 1;
}
function applyZhRows(rows) {
  for (const r of rows || []) {
    if (r.team && !r.teamZh) r.teamZh = teamZh(r.team);
    if (r.player && !r.playerZh) { r.playerZh = playerZh(r.player); r.playerZhAuto = playerZhAuto(r.player); }
  }
  return rows;
}

const UCL_DESC_ZH = {
  'Qualifies for round of 16': '直接晋级16强',
  'Knockout phase playoffs - seeded': '附加赛（种子）',
  'Knockout phase playoffs - unseeded': '附加赛（非种子）',
  'Eliminated': '淘汰区',
};
function descZh(en) {
  const s = String(en || '').trim();
  if (!s) return '';
  return UCL_DESC_ZH[s] || s;
}

async function fromEspn(kind, lg) {
  let espn;
  try { espn = require('./espn-tables'); } catch { return null; }
  try {
    let raw;
    if (kind === 'standings') raw = await espn.getStandings(lg.key);
    else if (kind === 'topscorers') raw = await espn.getScorers(lg.key);
    else raw = await espn.getAssists(lg.key);
    if (!raw) return null;
    if (!espn.isAcceptableSeason(raw.year, espn.SLUG[lg.key])) {
      console.warn('league-tables ESPN season too old', lg.key, raw.year);
      return null;
    }
    const shortLabel = seasonLabel(raw.year, lg.id);
    // Prefer short label (2026/27) over ESPN long "2026-27 English Premier League"
    const short = shortLabel;
    if (kind === 'standings') {
      applyZhRows(raw.rows);
      for (const r of raw.rows || []) {
        r.logo = upgradeTeamLogo(r.logo || '', r.teamId, r.team || r.teamZh);
        if (r.description) r.descriptionZh = descZh(r.description);
      }
      const isUcl = lg.key === 'ucl';
      const groupLabel = isUcl
        ? (/league\s*phase/i.test(String(raw.groupName || '')) ? '联赛阶段' : (raw.groupName || '联赛阶段'))
        : (raw.groupName && !/^overall$/i.test(raw.groupName) ? raw.groupName : '');
      const noteZh = isUcl
        ? `本赛季欧冠联赛阶段积分榜（${short}）。现行赛制为 36 队单表（非旧式小组赛）：前8直接晋级16强，9–24进入附加赛，25–36淘汰。每日自动更新 · 完场后自动刷新；另约6小时兜底；非分钟级实时。`
        : `本赛季积分榜（${short}）。每日自动更新 · 完场后自动刷新该联赛；另约6小时兜底；非分钟级实时。`;
      return {
        ok: true, kind: 'standings', leagueId: lg.id, leagueKey: lg.key, leagueZh: lg.nameZh, leagueEn: raw.leagueEn || lg.nameEn,
        season: raw.year, seasonLabel: short, seasonDisplay: raw.seasonLabel, updated: String(raw.year),
        tables: [{ group: groupLabel, rows: raw.rows }],
        fetchedAt: new Date().toISOString(),
        source: 'espn',
        noteZh,
        cached: !!raw.cached, stale: !!raw.stale, refreshing: !!raw.refreshing,
        cacheAgeSec: raw.cacheAgeSec || 0,
        updatedAt: raw.updatedAt || raw.fetchedAt,
        fetchedAt: raw.fetchedAt || raw.updatedAt || new Date().toISOString(),
      };
    }
    applyZhRows(raw.rows);
    for (const r of raw.rows || []) {
      r.teamLogo = upgradeTeamLogo(r.teamLogo || '', r.teamId, r.team || r.teamZh);
    }
    if (kind === 'topscorers' || kind === 'topassists') {
      try {
        const et = require('./espn-tables');
        const diskKind = kind === 'topassists' ? 'assists' : 'scorers';
        await et.enrichLeaderPhotos(raw.rows, { kind: diskKind, slug: et.SLUG[lg.key] });
      } catch (e) { console.warn('photo enrich', e.message); }
    }
    return {
      ok: true, kind, leagueId: lg.id, leagueKey: lg.key, leagueZh: lg.nameZh, leagueEn: raw.leagueEn || lg.nameEn,
      season: raw.year, seasonLabel: short, seasonDisplay: raw.seasonLabel,
      rows: raw.rows, fetchedAt: new Date().toISOString(), source: 'espn',
      noteZh: kind === 'topassists'
        ? `本赛季助攻榜（${short}）。每日自动更新 · 完场后自动刷新；另约6小时兜底；俱乐部为当前所属球队。`
        : `本赛季射手榜（${short}）。每日自动更新 · 完场后自动刷新；另约6小时兜底；俱乐部为当前所属球队。`,
      cached: !!raw.cached, stale: !!raw.stale, refreshing: !!raw.refreshing,
      cacheAgeSec: raw.cacheAgeSec || 0,
      updatedAt: raw.updatedAt || raw.fetchedAt,
      fetchedAt: raw.fetchedAt || raw.updatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.warn('league-tables ESPN', kind, lg.key, e.message);
    return null;
  }
}
function refuseStaleAf(kind, lg, sea) {
  if (seasonIsCurrentOrPrev(sea, lg.id)) return null;
  console.warn('league-tables refuse stale AF season', kind, lg.key, sea, 'current', calendarSeasonYear(lg.id));
  return {
    ok: false, reason: 'stale_season', kind, leagueId: lg.id, leagueKey: lg.key, leagueZh: lg.nameZh,
    season: sea, seasonLabel: seasonLabel(sea, lg.id),
    error: `免费数据源仅有 ${seasonLabel(sea, lg.id)}（非本赛季），已拒绝展示以免俱乐部/射手过时。`,
    noteZh: AF_STALE_WARN + ` 当前应展示 ${seasonLabel(calendarSeasonYear(lg.id), lg.id)}。可稍后重试或显式选择历史赛季。`,
    source: 'api-football',
    pastSeasonAvailable: sea,
  };
}

function normalizeStandingRow(row) {
  const t = row.team || {};
  const all = row.all || {};
  const goals = all.goals || {};
  return {
    rank: row.rank,
    teamId: t.id,
    team: t.name,
    teamZh: teamZh(t.name),
    logo: upgradeTeamLogo(t.logo || '', t.id, t.name),
    played: all.played ?? null,
    win: all.win ?? null,
    draw: all.draw ?? null,
    lose: all.lose ?? null,
    gf: goals.for ?? null,
    ga: goals.against ?? null,
    gd: row.goalsDiff ?? ((goals.for || 0) - (goals.against || 0)),
    points: row.points ?? null,
    form: row.form || '',
    description: row.description || '',
  };
}

function normalizeScorerRow(row, idx) {
  const p = row.player || {};
  const st = (row.statistics || [])[0] || {};
  const team = st.team || {};
  const g = st.goals || {};
  const games = st.games || {};
  return {
    rank: idx + 1,
    playerId: p.id,
    player: p.name,
    playerZh: playerZh(p.name), playerZhAuto: playerZhAuto(p.name),
    photo: p.photo || '',
    photoAlt: '',
    teamId: team.id,
    team: team.name,
    teamZh: teamZh(team.name),
    teamLogo: upgradeTeamLogo(team.logo || '', team.id, team.name),
    goals: g.total ?? 0,
    assists: g.assists ?? 0,
    appearances: games.appearences ?? games.appearances ?? null,
    minutes: games.minutes ?? null,
    rating: games.rating || null,
  };
}

async function fetchStandingsRaw(leagueId, season) {
  const resp = await afFetch(`/standings?league=${leagueId}&season=${season}`);
  const lg = (resp[0] && resp[0].league) || {};
  const groups = lg.standings || [];
  // Prefer overall single table; if multi-group keep first (or flatten with group label)
  const tables = groups.map((rows, gi) => ({
    group: rows[0] && rows[0].group ? rows[0].group : (groups.length > 1 ? `组别 ${gi + 1}` : ''),
    rows: (rows || []).map(normalizeStandingRow),
  }));
  const leagueMeta = resolveLeague(String(leagueId)) || {};
  return {
    ok: true,
    kind: 'standings',
    leagueId,
    leagueKey: leagueMeta.key || String(leagueId),
    leagueZh: leagueMeta.nameZh || lg.name || '联赛',
    leagueEn: lg.name || leagueMeta.nameEn || '',
    season,
    seasonLabel: seasonLabel(season, leagueId),
    updated: lg.season != null ? String(lg.season) : String(season),
    tables,
    fetchedAt: new Date().toISOString(),
    noteZh: '积分榜来自第三方数据源；免费档展示最近可用完整赛季，非临场实时。仅供参考。',
    quota: lastQuota,
  };
}

async function fetchScorersRaw(leagueId, season, kind) {
  // kind: topscorers | topassists
  const path = kind === 'topassists'
    ? `/players/topassists?league=${leagueId}&season=${season}`
    : `/players/topscorers?league=${leagueId}&season=${season}`;
  const resp = await afFetch(path);
  const rows = (resp || []).map(normalizeScorerRow);
  const leagueMeta = resolveLeague(String(leagueId)) || {};
  return {
    ok: true,
    kind,
    leagueId,
    leagueKey: leagueMeta.key || String(leagueId),
    leagueZh: leagueMeta.nameZh || '联赛',
    leagueEn: leagueMeta.nameEn || '',
    season,
    seasonLabel: seasonLabel(season, leagueId),
    rows,
    fetchedAt: new Date().toISOString(),
    noteZh: kind === 'topassists'
      ? '助攻榜来自第三方数据源；免费档为最近可用赛季。仅供参考。'
      : '射手榜来自第三方数据源；免费档为最近可用赛季。仅供参考。',
    quota: lastQuota,
  };
}

async function getStandings({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  const explicit = Number.isFinite(Number(season));
  // Default path: ESPN current season
  if (!explicit) {
    const es = await fromEspn('standings', lg);
    if (es && es.ok) return es;
  }
  const sea = pickSeason(season, lg.id);
  if (!explicit && !seasonIsCurrentOrPrev(sea, lg.id)) {
    return refuseStaleAf('standings', lg, FREE_SEASON) || { ok: false, reason: 'no_data', error: '本赛季积分榜暂时不可用', leagueZh: lg.nameZh };
  }
  // Explicit past / paid AF
  if (!apiKey()) {
    const disk = loadDisk('standings', lg.id, sea);
    if (disk && (explicit || seasonIsCurrentOrPrev(sea, lg.id))) {
      return { ...disk.payload, cached: true, stale: true, source: disk.payload.source || 'api-football', noteZh: (disk.payload.noteZh || '') + (explicit ? '（历史赛季缓存）' : '') };
    }
    return { ok: false, reason: 'no_key', error: '本赛季积分榜暂时不可用', leagueZh: lg.nameZh, noteZh: AF_STALE_WARN };
  }
  try {
    const payload = await withCache('standings', lg.id, sea, () => fetchStandingsRaw(lg.id, sea));
    if (!explicit && !seasonIsCurrentOrPrev(payload.season, lg.id)) return refuseStaleAf('standings', lg, payload.season);
    return { ...payload, source: payload.source || 'api-football', pastSeason: explicit && !seasonIsCurrentOrPrev(sea, lg.id) };
  } catch (e) {
    if (!explicit) {
      const refuse = refuseStaleAf('standings', lg, FREE_SEASON);
      if (refuse) return refuse;
    }
    throw e;
  }
}

async function getTopScorers({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  const explicit = Number.isFinite(Number(season));
  if (!explicit) {
    const es = await fromEspn('topscorers', lg);
    if (es && es.ok) return es;
  }
  const sea = pickSeason(season, lg.id);
  if (!explicit && !seasonIsCurrentOrPrev(sea, lg.id)) {
    return refuseStaleAf('topscorers', lg, FREE_SEASON) || { ok: false, reason: 'no_data', error: '本赛季射手榜暂时不可用', leagueZh: lg.nameZh };
  }
  if (!apiKey()) {
    const disk = loadDisk('topscorers', lg.id, sea);
    if (disk && (explicit || seasonIsCurrentOrPrev(sea, lg.id))) return { ...disk.payload, cached: true, stale: true, source: 'api-football' };
    return { ok: false, reason: 'no_key', error: '本赛季射手榜暂时不可用', leagueZh: lg.nameZh, noteZh: AF_STALE_WARN };
  }
  try {
    const payload = await withCache('topscorers', lg.id, sea, () => fetchScorersRaw(lg.id, sea, 'topscorers'));
    if (!explicit && !seasonIsCurrentOrPrev(payload.season, lg.id)) return refuseStaleAf('topscorers', lg, payload.season);
    return { ...payload, source: payload.source || 'api-football', pastSeason: explicit && !seasonIsCurrentOrPrev(sea, lg.id) };
  } catch (e) {
    if (!explicit) return refuseStaleAf('topscorers', lg, FREE_SEASON) || Promise.reject(e);
    throw e;
  }
}

async function getTopAssists({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  const explicit = Number.isFinite(Number(season));
  if (!explicit) {
    const es = await fromEspn('topassists', lg);
    if (es && es.ok) return es;
  }
  const sea = pickSeason(season, lg.id);
  if (!explicit && !seasonIsCurrentOrPrev(sea, lg.id)) {
    return refuseStaleAf('topassists', lg, FREE_SEASON) || { ok: false, reason: 'no_data', error: '本赛季助攻榜暂时不可用', leagueZh: lg.nameZh };
  }
  if (!apiKey()) {
    const disk = loadDisk('topassists', lg.id, sea);
    if (disk && (explicit || seasonIsCurrentOrPrev(sea, lg.id))) return { ...disk.payload, cached: true, stale: true, source: 'api-football' };
    return { ok: false, reason: 'no_key', error: '本赛季助攻榜暂时不可用', leagueZh: lg.nameZh, noteZh: AF_STALE_WARN };
  }
  try {
    const payload = await withCache('topassists', lg.id, sea, () => fetchScorersRaw(lg.id, sea, 'topassists'));
    if (!explicit && !seasonIsCurrentOrPrev(payload.season, lg.id)) return refuseStaleAf('topassists', lg, payload.season);
    return { ...payload, source: payload.source || 'api-football', pastSeason: explicit && !seasonIsCurrentOrPrev(sea, lg.id) };
  } catch (e) {
    if (!explicit) return refuseStaleAf('topassists', lg, FREE_SEASON) || Promise.reject(e);
    throw e;
  }
}

function listLeagues() {
  const cur = calendarSeasonYear(39); // EPL-style default for label
  return {
    ok: true,
    season: cur,
    seasonLabel: seasonLabel(cur, 39),
    noteZh: `默认展示本赛季 ${seasonLabel(cur, 39)}（公开数据：每日自动更新 · 完场后自动刷新，另约6小时兜底，非分钟级实时）。历史赛季数据不再当作当前赛季默认源。`,
    afFreeSeason: FREE_SEASON,
    leagues: LEAGUES.map(l => ({
      key: l.key,
      id: l.id,
      nameZh: l.nameZh,
      nameEn: l.nameEn,
      country: l.country,
    })),
  };
}

function getQuota() { return lastQuota; }

const DETAIL_TTL_MS = 24 * 60 * 60 * 1000; // team/player detail disk cache
// 1.9.112: assembled team/player JSON (memory + disk), soft-serve stale
const ASSEMBLED_TTL_MS = 3 * 60 * 60 * 1000;       // fresh window
const ASSEMBLED_STALE_MS = 36 * 60 * 60 * 1000;    // soft-serve + bg refresh
const memAssembled = new Map(); // key -> { at, payload }
const assembledRefreshing = new Set();
const { posZh, natZh } = require('./i18n-football');

function assembledMemGet(key) {
  const hit = memAssembled.get(key);
  return hit || null;
}
function assembledMemSet(key, payload) {
  memAssembled.set(key, { at: Date.now(), payload });
  if (memAssembled.size > 240) {
    const oldest = [...memAssembled.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 60);
    for (const [k] of oldest) memAssembled.delete(k);
  }
}


/** 1.9.113: ensure fixture.leagueZh is Chinese; fall back to team leagueZh when empty. */
function normalizeFixtureLeagueZh(fx, fallbackLeagueZh) {
  if (!fx || typeof fx !== 'object') return fx;
  const raw = fx.leagueZh || fx.league || '';
  let zh = leagueZh(raw);
  if (!zh || !/[\u4e00-\u9fff]/.test(zh)) {
    const fb = String(fallbackLeagueZh || '').trim();
    if (fb && /[\u4e00-\u9fff]/.test(fb)) zh = fb;
    else if (zh && !/[\u4e00-\u9fff]/.test(zh)) zh = leagueZh(zh) || zh;
  }
  if (zh) fx.leagueZh = zh;
  return fx;
}
/** 1.9.118: attach sporttery matchId from fixture-map for team 赛程 deep-link.
 *  Match by AF fixtureId first; else by BJ calendar date + EN team names (ESPN rows use espnEventId). */
function attachSportteryIdsToFixtures(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  let map;
  try { map = require('./live-stats').loadMap() || {}; } catch { map = {}; }
  if (!map || typeof map !== 'object') return payload;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim().replace(/\s+/g, ' ');
  const byFid = new Map();
  const byPair = new Map(); // date|homeEn|awayEn → mid
  for (const [k, v] of Object.entries(map)) {
    if (!v) continue;
    let mid = String(v.sportteryMatchId || '').trim();
    if (!mid && String(k).startsWith('m:')) mid = String(k).slice(2);
    if (!mid) continue;
    if (v.fixtureId != null) {
      const fid = String(v.fixtureId);
      if (!byFid.has(fid) || String(k).startsWith('m:')) byFid.set(fid, mid);
    }
    const d = String(v.date || '').slice(0, 10);
    const he = norm(v.homeEn || v.home || '');
    const ae = norm(v.awayEn || v.away || '');
    if (d && he && ae) {
      const pk = d + '|' + he + '|' + ae;
      if (!byPair.has(pk) || String(k).startsWith('m:')) byPair.set(pk, mid);
    }
  }
  const bjYmd = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    const ms = d.getTime() + 8 * 3600e3;
    const x = new Date(ms);
    const y = x.getUTCFullYear();
    const mo = String(x.getUTCMonth() + 1).padStart(2, '0');
    const da = String(x.getUTCDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da;
  };
  const loose = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.includes(b) || b.includes(a);
  };
  for (const key of ['recent', 'upcoming']) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    for (const fx of arr) {
      if (!fx || typeof fx !== 'object') continue;
      if (fx.matchId || fx.sportteryMatchId) continue;
      let mid = '';
      const fid = fx.fixtureId != null ? String(fx.fixtureId) : '';
      if (fid && byFid.has(fid)) mid = byFid.get(fid);
      if (!mid) {
        const day = bjYmd(fx.date);
        const he = norm(fx.home || fx.homeEn || '');
        const ae = norm(fx.away || fx.awayEn || '');
        if (day && he && ae) {
          const exact = byPair.get(day + '|' + he + '|' + ae);
          if (exact) mid = exact;
          else {
            for (const [pk, id] of byPair) {
              if (!pk.startsWith(day + '|')) continue;
              const parts = pk.split('|');
              if (parts.length < 3) continue;
              if (loose(he, parts[1]) && loose(ae, parts[2])) { mid = id; break; }
            }
          }
        }
      }
      if (!mid) continue;
      fx.sportteryMatchId = mid;
      fx.matchId = mid;
    }
  }
  return payload;
}
function normalizeTeamFixturesLeagueZh(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const fb = payload.leagueZh || '';
  for (const key of ['recent', 'upcoming']) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    for (const fx of arr) normalizeFixtureLeagueZh(fx, fb);
  }
  // 1.9.118: sporttery id for 赛程 → 赛事详情
  attachSportteryIdsToFixtures(payload);
  return payload;
}

function cloneAssembled(payload, extra) {
  let out;
  try {
    out = Object.assign(JSON.parse(JSON.stringify(payload)), extra || {});
  } catch {
    out = Object.assign({}, payload, extra || {});
  }
  // 1.9.113: normalize leagueZh on cached team payloads without rebuild
  if (out && (Array.isArray(out.recent) || Array.isArray(out.upcoming))) {
    normalizeTeamFixturesLeagueZh(out);
  }
  // 1.9.116: re-bind 身价 on every serve so photo-merge / stale disk cannot leave
  // coverage note with empty marketValueEur (UI「匹配 n/m」+ top ranks all 暂无).
  if (out && Array.isArray(out.squad) && out.squad.length) {
    healAssembledMarketValue(out);
    // also heal the in-memory/disk source so subsequent hits stay fixed
    if (payload && Array.isArray(payload.squad)) {
      const corrupt = squadMarketValueCorrupt(payload);
      if (corrupt) healAssembledMarketValue(payload);
    }
  }
  return out;
}

/** coverage.hit>0 but no player has marketValueEur — classic photo-wipe symptom. */
function squadMarketValueCorrupt(payload) {
  if (!payload || !Array.isArray(payload.squad) || !payload.squad.length) return false;
  const hit = payload.squadMarketCoverage && Number(payload.squadMarketCoverage.hit);
  if (!(hit > 0)) return false;
  const withMv = payload.squad.filter((p) => Number(p && p.marketValueEur) > 0).length;
  return withMv === 0;
}

function detailCachePath(kind, id, season) {
  return path.join(CACHE_DIR(), `detail-${kind}-${id}-${season || 'x'}.json`);
}

function loadDetailDisk(kind, id, season) {
  const j = readJson(detailCachePath(kind, id, season), null);
  if (!j || !j.payload) return null;
  return { at: j.at || 0, payload: j.payload };
}

function saveDetailDisk(kind, id, season, payload) {
  try {
    writeJson(detailCachePath(kind, id, season), { at: Date.now(), payload });
  } catch (e) {
    console.warn('detail cache write failed', e.message);
  }
}

/** Find a team row inside standings payload (any group). */
function findStandingRow(standingsPayload, teamId) {
  const tid = Number(teamId);
  for (const tb of (standingsPayload && standingsPayload.tables) || []) {
    for (const r of tb.rows || []) {
      if (Number(r.teamId) === tid) return { row: r, group: tb.group || '' };
    }
  }
  return null;
}

/** Scan topscorers / topassists disk caches for a player (prefer league). */
function findScorerInCaches(playerId, preferLeagueId) {
  const pid = Number(playerId);
  let dir;
  try { dir = fs.readdirSync(CACHE_DIR()); } catch { return null; }
  const prefer = preferLeagueId != null ? String(preferLeagueId) : '';
  const hits = [];
  for (const name of dir) {
    const m = /^(topscorers|topassists)-(\d+)-(\d+)\.json$/.exec(name);
    if (!m) continue;
    const disk = loadDisk(m[1], Number(m[2]), Number(m[3]));
    if (!disk || !disk.payload || !disk.payload.rows) continue;
    const row = disk.payload.rows.find(r => Number(r.playerId) === pid);
    if (!row) continue;
    hits.push({
      kind: m[1],
      leagueId: Number(m[2]),
      season: Number(m[3]),
      row,
      at: disk.at,
      leagueZh: disk.payload.leagueZh,
      seasonLabel: disk.payload.seasonLabel,
    });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => {
    const ap = prefer && String(a.leagueId) === prefer ? 0 : 1;
    const bp = prefer && String(b.leagueId) === prefer ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (b.at || 0) - (a.at || 0);
  });
  return hits[0];
}

async function fetchTeamMeta(teamId) {
  const resp = await afFetch('/teams?id=' + encodeURIComponent(teamId));
  const row = (resp && resp[0]) || null;
  if (!row || !row.team) return null;
  const t = row.team;
  const v = row.venue || {};
  return {
    teamId: t.id,
    team: t.name,
    teamZh: teamZh(t.name),
    logo: upgradeTeamLogo(t.logo || '', t.id, t.name),
    country: t.country || '',
    founded: t.founded || null,
    code: t.code || '',
    venue: v.name || '',
    venueCity: v.city || '',
  };
}

async function fetchTeamRecent(teamId, season) {
  // Free plan rejects `last=`; fetch by season and take newest 5 FT locally.
  const sea = season || FREE_SEASON;
  const path = `/fixtures?team=${encodeURIComponent(teamId)}&season=${encodeURIComponent(sea)}`;
  let resp = [];
  try {
    resp = await afFetch(path);
  } catch (e) {
    console.warn('fetchTeamRecent', e.message);
    resp = [];
  }
  const mapped = (resp || []).map(fx => {
    const f = fx.fixture || {};
    const l = fx.league || {};
    const th = (fx.teams && fx.teams.home) || {};
    const ta = (fx.teams && fx.teams.away) || {};
    const g = fx.goals || {};
    const st = (f.status && f.status.short) || '';
    return {
      fixtureId: f.id,
      date: f.date || '',
      status: st,
      league: l.name || '',
      leagueZh: (resolveLeague(String(l.id || '')) || {}).nameZh || leagueZh(l.name || '') || '',
      home: th.name || '',
      homeZh: teamZh(th.name),
      homeLogo: upgradeTeamLogo(th.logo || '', th.id, th.name),
      away: ta.name || '',
      awayZh: teamZh(ta.name),
      awayLogo: upgradeTeamLogo(ta.logo || '', ta.id, ta.name),
      goalsHome: g.home,
      goalsAway: g.away,
      source: 'api-football',
    };
  });
  mapped.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const ft = mapped.filter(x => /^(FT|AET|PEN)$/i.test(x.status) && x.goalsHome != null && x.goalsAway != null);
  return (ft.length ? ft : mapped).slice(0, 5);
}

async function fetchTeamSquad(teamId) {
  const resp = await afFetch('/players/squads?team=' + encodeURIComponent(teamId));
  const row = (resp && resp[0]) || null;
  if (!row) return [];
  return (row.players || []).map(p => ({
    playerId: p.id,
    player: p.name,
    playerZh: playerZh(p.name), playerZhAuto: playerZhAuto(p.name),
    photo: p.photo || '',
    number: p.number != null ? String(p.number) : '',
    position: p.position || '',
    positionZh: posZh(p.position || ''),
    age: p.age != null ? p.age : null,
  }));
}


/** 1.9.91: TheSportsDB free lookup — founded / stadium / EN blurb (no vendor label in UI). */
async function fetchTsdbTeamMeta(teamName) {
  const q = String(teamName || '').trim();
  if (!q) return null;
  const cacheKey = 'tsdbmeta-' + cryptoHash(q);
  const disk = loadDetailDisk(cacheKey, 'x', 'x');
  const now = Date.now();
  if (disk && now - disk.at < DETAIL_TTL_MS * 14 && disk.payload) return disk.payload;
  try {
    const url = 'https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=' + encodeURIComponent(q);
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 jingcai' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const t = ((j && j.teams) || []).find(x => x && /soccer|football/i.test(String(x.strSport || 'Soccer'))) || ((j && j.teams) || [])[0];
    if (!t) return null;
    const meta = {
      team: t.strTeam || q,
      teamZh: teamZh(t.strTeam || q),
      founded: t.intFormedYear ? Number(t.intFormedYear) : null,
      venue: t.strStadium || '',
      venueCity: t.strStadiumLocation || t.strCountry || '',
      country: t.strCountry || '',
      countryZh: natZh(t.strCountry || '') || t.strCountry || '',
      descriptionEn: String(t.strDescriptionEN || '').replace(/\r\n/g, '\n').trim(),
      afTeamId: t.idAPIfootball ? Number(t.idAPIfootball) : null,
      espnTeamId: t.idESPN ? String(t.idESPN) : null,
      logo: t.strTeamBadge || '',
    };
    saveDetailDisk(cacheKey, 'x', 'x', meta);
    return meta;
  } catch (e) {
    console.warn('tsdb team meta', q, e.message);
    if (disk) return disk.payload;
    return null;
  }
}
function cryptoHash(s) {
  try { return require('crypto').createHash('sha1').update(String(s)).digest('hex').slice(0, 12); }
  catch { return String(s).slice(0, 24).replace(/\W/g, ''); }
}
function buildIntroZh({ teamZh, team, founded, venue, venueCity, countryZh, country, leagueZh, descriptionEn }) {
  const name = teamZh || team || '该队';
  const bits = [];
  bits.push(`${name}${team && teamZh && team !== teamZh ? `（${team}）` : ''}`);
  if (founded) bits.push(`创立于${founded}年`);
  const place = [countryZh || country, venueCity].filter(Boolean).join(' · ');
  if (venue) bits.push(`主场${venue}${place ? `（${place}）` : ''}`);
  else if (place) bits.push(`位于${place}`);
  if (leagueZh) bits.push(`现征战${leagueZh}`);
  let intro = bits[0] + (bits.length > 1 ? '，' + bits.slice(1).join('，') : '') + '。';
  const en = String(descriptionEn || '').replace(/\s+/g, ' ').trim();
  if (en) {
    // Keep a short neutral excerpt; no vendor names
    let clip = en.slice(0, 280);
    if (en.length > 280) clip = clip.replace(/\s+\S*$/, '') + '…';
    intro += '\n\n' + clip;
  }
  return intro;
}
/** Map ESPN form / schedule rows into UI fixtures (past + upcoming). */
function mapEspnFormRows(rows, selfName) {
  const self = String(selfName || '').toLowerCase();
  const out = [];
  for (const r of rows || []) {
    if (!r) continue;
    const home = r.homeEn || r.home || '';
    const away = r.awayEn || r.away || '';
    const isHome = r.isHome != null ? !!r.isHome : (self && home.toLowerCase().includes(self.slice(0, 5)));
    const gh = r.gh != null ? r.gh : r.goalsHome;
    const ga = r.ga != null ? r.ga : r.goalsAway;
    let result = '';
    if (r.outcome) result = r.outcome; // W/D/L from self perspective
    else if (gh != null && ga != null) {
      if (gh === ga) result = 'D';
      else if (isHome) result = gh > ga ? 'W' : 'L';
      else result = ga > gh ? 'W' : 'L';
    }
    const done = !!(result || (gh != null && ga != null));
    out.push({
      fixtureId: r.espnEventId || r.fixtureId || '',
      date: r.utc || (r.ts ? new Date(r.ts).toISOString() : '') || r.date || '',
      status: done ? 'FT' : 'NS',
      league: r.leagueEn || r.league || '',
      leagueZh: leagueZh(r.leagueZh || r.leagueEn || r.league || '') || '',
      home, homeZh: teamZh(home),
      away, awayZh: teamZh(away),
      homeLogo: upgradeTeamLogo('', null, home),
      awayLogo: upgradeTeamLogo('', null, away),
      goalsHome: gh, goalsAway: ga,
      result, // W/D/L from this team's view
      isHome,
      upcoming: !done,
      source: 'espn',
    });
  }
  return out;
}
async function loadEspnTeamFixtures(espnId, leagueKey, teamName) {
  const id = String(espnId || '').trim();
  if (!id) return { recent: [], upcoming: [] };
  const espnForm = require('./espn-form');
  const espnTables = require('./espn-tables');
  const slug = espnTables.SLUG[leagueKey] || '';
  let rows = [];
  // Disk form cache (FT history)
  try {
    const f = require('path').join(require('./db').DATA_DIR, 'live-stats', 'espn', 'form', id + '.json');
    const disk = JSON.parse(require('fs').readFileSync(f, 'utf8'));
    if (disk && Array.isArray(disk.rows)) rows = disk.rows.slice();
  } catch { /* miss */ }
  // Live schedule for upcoming + fill
  if (slug) {
    try {
      const j = await espnForm.getJson(`${espnForm.BASE}/${slug}/teams/${id}/schedule`);
      const parsed = espnForm.parseEvents(j, id) || [];
      const byId = new Map(rows.map(r => [String(r.espnEventId), r]));
      for (const r of parsed) {
        const k = String(r.espnEventId || '');
        if (!k) continue;
        if (!byId.has(k)) { rows.push(r); byId.set(k, r); }
        else Object.assign(byId.get(k), r);
      }
      // Non-completed schedule events → upcoming (parseEvents only returns FT)
      for (const e of (j && j.events) || []) {
        const c = (e.competitions || [])[0];
        if (!c || !c.status || !c.status.type || c.status.type.completed) continue;
        const comps = c.competitors || [];
        const h = comps.find(x => x.homeAway === 'home');
        const a = comps.find(x => x.homeAway === 'away');
        if (!h || !a) continue;
        const eid = String(e.id || '');
        if (!eid || byId.has(eid)) continue;
        const isHome = String(h.team && h.team.id) === String(id);
        const isAway = String(a.team && a.team.id) === String(id);
        if (!isHome && !isAway) continue;
        const row = {
          ts: Date.parse(e.date) || 0,
          utc: e.date,
          homeEn: (h.team && h.team.displayName) || '',
          awayEn: (a.team && a.team.displayName) || '',
          gh: null, ga: null, isHome, outcome: null,
          leagueEn: (e.league && (e.league.shortName || e.league.name)) || '',
          espnEventId: eid,
        };
        rows.push(row); byId.set(eid, row);
      }
    } catch (e) { console.warn('espn schedule', id, e.message); }
    // Team endpoint nextEvent(s)
    try {
      const tj = await espnForm.getJson(`${espnForm.BASE}/${slug}/teams/${id}`);
      const nexts = (tj && tj.team && tj.team.nextEvent) || [];
      for (const ev of nexts) {
        const comp = (ev.competitions || [])[0] || {};
        const st = (comp.status && comp.status.type) || {};
        if (st.completed) continue;
        const comps = comp.competitors || [];
        const home = comps.find(c => c.homeAway === 'home') || comps[0] || {};
        const away = comps.find(c => c.homeAway === 'away') || comps[1] || {};
        const ht = (home.team && home.team.displayName) || '';
        const at = (away.team && away.team.displayName) || '';
        const eid = String(ev.id || comp.id || '');
        if (!eid || rows.some(r => String(r.espnEventId) === eid)) continue;
        rows.push({
          ts: Date.parse(ev.date || comp.date || '') || 0,
          utc: ev.date || comp.date || '',
          homeEn: ht, awayEn: at,
          gh: null, ga: null,
          isHome: String((home.team && home.team.id) || '') === id,
          outcome: null,
          leagueEn: (comp.league && comp.league.name) || '',
          espnEventId: eid,
        });
      }
    } catch (e) { console.warn('espn team next', id, e.message); }
  }
  const mapped = mapEspnFormRows(rows, teamName);
  mapped.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const recent = mapped.filter(x => !x.upcoming).slice(0, 12);
  const upcoming = mapped.filter(x => x.upcoming).sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).slice(0, 8);
  return { recent, upcoming };
}
function resolveAfIdFromCache(teamName, espnId) {
  try {
    const f = require('path').join(require('./db').DATA_DIR, 'live-stats', 'team-id-cache.json');
    const c = JSON.parse(require('fs').readFileSync(f, 'utf8'));
    const want = String(teamName || '').toLowerCase();
    for (const v of Object.values(c || {})) {
      if (!v || typeof v !== 'object') continue;
      if (espnId && String(v.espnTeamId || '') === String(espnId) && v.afTeamId) return Number(v.afTeamId);
      const n = String(v.afName || v.query || '').toLowerCase();
      if (want && n && (n === want || n.includes(want) || want.includes(n)) && v.afTeamId) return Number(v.afTeamId);
    }
  } catch { /* ignore */ }
  return null;
}

/** Crests.json afTeamId by English / zh club name (ESPN standings ids ≠ AF ids). */
function resolveAfIdFromCrests(teamName) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const want = normTeamEn(teamName || '');
    const wantZh = String(teamName || '').trim();
    if (!want && !wantZh) return null;
    for (const row of Object.values((j && j.teams) || {})) {
      if (!row || !row.afTeamId) continue;
      const en = normTeamEn(row.en || row.nameEn || '');
      if (want && en && (en === want || en.includes(want) || want.includes(en))) return Number(row.afTeamId);
      if (wantZh && row.zh && String(row.zh) === wantZh) return Number(row.afTeamId);
    }
  } catch { /* ignore */ }
  return null;
}

function resolveAfTeamId(teamName, espnId, explicit) {
  const n = Number(explicit);
  if (Number.isFinite(n) && n > 0) return n;
  return resolveAfIdFromCache(teamName, espnId) || resolveAfIdFromCrests(teamName) || null;
}


/** 1.9.111: photo coverage on a squad list (0..1). */
function squadPhotoRate(squad) {
  if (!Array.isArray(squad) || !squad.length) return 0;
  return squad.filter(p => p && p.photo).length / squad.length;
}

/**
 * Match ESPN (or other) roster row to an AF squad photo by name / jersey.
 * Never use ESPN athlete id as AF player id — ids are different namespaces.
 */
function pickAfSquadPhoto(afPool, p) {
  if (!p || !Array.isArray(afPool) || !afPool.length) return null;
  let namesLooseEqual;
  try { namesLooseEqual = require('./espn-lineup').namesLooseEqual; } catch { return null; }
  const pname = p.player || p.name || '';
  if (!pname) return null;
  const withPh = afPool.filter(x => x && x.photo);
  const byName = withPh.filter(x => namesLooseEqual(x.player || x.name || '', pname));
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const byNo = byName.filter(x => p.number && x.number != null && String(x.number) === String(p.number));
    if (byNo.length === 1) return byNo[0];
    return byName[0];
  }
  // surname + jersey when AF uses abbreviated "M. Surname"
  const pnorm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const sur = pnorm(pname).split(' ').pop();
  if (sur && sur.length >= 4 && p.number != null && String(p.number) !== '') {
    const hits = withPh.filter(x => {
      const s = pnorm(x.player || x.name || '').split(' ').pop();
      return s === sur && x.number != null && String(x.number) === String(p.number);
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

/**
 * Load AF squad for photo merge (prefer AF-id disk cache; never use ESPN tid as AF id).
 */
async function loadAfSquadForPhotos(afTeamId, { diskOnly = false } = {}) {
  const afId = Number(afTeamId);
  if (!Number.isFinite(afId) || afId <= 0) return [];
  const disk = loadDetailDisk('teamsquad', afId, 'x');
  const meta = (disk && disk.payload) || {};
  if (meta.source === 'af' && Array.isArray(meta.squad) && meta.squad.length
      && Number(meta.afTeamIdUsed || afId) === afId
      && disk && Date.now() - disk.at < DETAIL_TTL_MS * 7) {
    return meta.squad;
  }
  if (diskOnly || !apiKey()) return (meta.source === 'af' && Array.isArray(meta.squad) && meta.squad) || [];
  try {
    const squad = await fetchTeamSquad(afId);
    if (squad && squad.length) {
      saveDetailDisk('teamsquad', afId, 'x', { squad, source: 'af', afTeamIdUsed: afId });
      return squad;
    }
  } catch (e) {
    console.warn('af squad photos', afId, e.message);
  }
  return (meta.source === 'af' && Array.isArray(meta.squad) && meta.squad) || [];
}

/**
 * 1.9.111: fill missing player photos on team squad.
 * Prefer AF media.api-sports.io by name/number match (ESPN roster headshots are sparse).
 * Secondary: local TSDB/squad photo index. Never map ESPN athleteId → AF /players/{id}.png.
 */
async function enrichSquadPhotos(squad, opts = {}) {
  if (!Array.isArray(squad) || !squad.length) return { hit: 0, filled: 0, total: 0 };
  const before = squad.filter(p => p && p.photo).length;
  let filled = 0;
  const diskOnly = !!opts.diskOnly;

  const afId = opts.afTeamId;
  if (afId) {
    const afPool = await loadAfSquadForPhotos(afId, { diskOnly });
    if (afPool.length) {
      for (const p of squad) {
        if (!p || p.photo) continue;
        const hit = pickAfSquadPhoto(afPool, p);
        if (hit && hit.photo) {
          p.photo = hit.photo;
          p.photoSrc = 'api-football';
          if (hit.playerId != null) p.afPlayerId = hit.playerId;
          filled++;
        }
      }
    }
  }

  // Local photo index (tsdb-photos + cached squads) for remaining misses
  try {
    const et = require('./espn-tables');
    const team = opts.teamName || '';
    for (const p of squad) {
      if (!p || p.photo) continue;
      const url = et.lookupLocalPhoto(p.player || p.name, team);
      if (url) {
        p.photo = url;
        p.photoSrc = p.photoSrc || 'local-cache';
        filled++;
      }
    }
  } catch (e) { /* optional */ }

  // TSDB search for stubborn misses (hot clubs usually already covered by AF)
  // 1.9.112: skip network TSDB on diskOnly (first paint); bg enrich will fill gaps
  const still = squad.filter(p => p && !p.photo);
  if (!diskOnly && still.length && still.length <= 12 && opts.teamName) {
    try {
      const lu = require('./espn-lineup');
      const side = {
        team: opts.teamName,
        starters: still.map(p => ({ name: p.player || p.name, number: p.number, photo: '' })),
        bench: [],
      };
      await Promise.race([
        lu.fillPhotosFromTsdb(side),
        new Promise(r => setTimeout(r, 8000)),
      ]);
      for (let i = 0; i < still.length; i++) {
        const ph = side.starters[i] && side.starters[i].photo;
        if (ph) {
          still[i].photo = ph;
          still[i].photoSrc = side.starters[i].photoSrc || 'thesportsdb';
          filled++;
        }
      }
    } catch (e) { console.warn('squad tsdb photos', e.message); }
  }

  const after = squad.filter(p => p && p.photo).length;
  return { hit: after, filled, before, total: squad.length };
}

/**
 * Team detail for data center. Standings summary from cached table (0 extra quota).
 * Team meta / recent fixtures / squad: disk-cached 24h each, fetched only on miss.
 */
async function buildTeamDetail({ teamId, league, season, enrich, wantSquad } = {}) {
  const tid = Number(teamId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return { ok: false, reason: 'bad_id', error: '无效球队' };
  }
  const lg = resolveLeague(league) || LEAGUES[0];
  const explicitSeason = Number.isFinite(Number(season)) ? Number(season) : undefined;
  const sea = pickSeason(season, lg.id);

  let standing = null;
  let standingsPayload = null;
  try {
    // Do NOT force season into getStandings — that skips ESPN and hits AF free-tier wall
    standingsPayload = await getStandings({ league: lg.key || lg.id, season: explicitSeason });
    if (standingsPayload && standingsPayload.ok !== false) {
      const found = findStandingRow(standingsPayload, tid);
      if (found) standing = found.row;
    }
  } catch (e) {
    /* standings optional for display */
  }

  // If team not in this league table, still try any league's cache
  if (!standing) {
    for (const L of LEAGUES) {
      if (L.id === lg.id) continue;
      try {
        const sp = await getStandings({ league: L.key, season: explicitSeason });
        const found = findStandingRow(sp, tid);
        if (found) {
          standing = found.row;
          standingsPayload = sp;
          break;
        }
      } catch { /* ignore */ }
    }
  }

  const base = standing ? {
    teamId: standing.teamId,
    team: standing.team,
    teamZh: standing.teamZh || teamZh(standing.team),
    logo: standing.logo || '',
    rank: standing.rank,
    played: standing.played,
    win: standing.win,
    draw: standing.draw,
    lose: standing.lose,
    gf: standing.gf,
    ga: standing.ga,
    gd: standing.gd,
    points: standing.points,
    form: standing.form || '',
    description: standing.description || '',
  } : {
    teamId: tid,
    team: '',
    teamZh: '',
    logo: upgradeTeamLogo(`https://media.api-sports.io/football/teams/${tid}.png`, tid, (standing && standing.team) || ''),
    rank: null, played: null, win: null, draw: null, lose: null,
    gf: null, ga: null, gd: null, points: null, form: '', description: '',
  };

  const out = {
    ok: true,
    teamId: tid,
    ...base,
    leagueId: (standingsPayload && standingsPayload.leagueId) || lg.id,
    leagueKey: (standingsPayload && standingsPayload.leagueKey) || lg.key,
    leagueZh: (standingsPayload && standingsPayload.leagueZh) || lg.nameZh,
    season: (standingsPayload && standingsPayload.season) || sea,
    seasonLabel: (standingsPayload && standingsPayload.seasonLabel) || seasonLabel(sea, lg.id),
    country: lg.country || '',
    founded: null,
    venue: '',
    venueCity: '',
    recent: [],
    upcoming: [],
    introZh: '',
    descriptionEn: '',
    squad: [],
    squadAvailable: false,
    cached: !!(standingsPayload && standingsPayload.cached),
    noteZh: '球队资料来自第三方数据源缓存；缺项显示「暂无」，不编造。仅供参考。',
    fetchedAt: new Date().toISOString(),
  };

  // Quota-safe enrich: only read disk caches by default.
  // Fetch upstream only when explicitly requested (?enrich=1 / wantSquad) or name missing.
  const now = Date.now();
  const doEnrich = !!enrich;
  const doSquad = !!wantSquad;

  const metaDisk = loadDetailDisk('teammeta', tid, 'x');
  const metaFresh = metaDisk && now - metaDisk.at < DETAIL_TTL_MS * 7
    && metaDisk.payload && (metaDisk.payload.founded || metaDisk.payload.venue);
  if (metaFresh) {
    Object.assign(out, {
      team: out.team || metaDisk.payload.team,
      teamZh: out.teamZh || metaDisk.payload.teamZh,
      logo: out.logo || metaDisk.payload.logo,
      country: metaDisk.payload.country || out.country,
      founded: metaDisk.payload.founded != null ? metaDisk.payload.founded : out.founded,
      venue: metaDisk.payload.venue || out.venue || '',
      venueCity: metaDisk.payload.venueCity || out.venueCity || '',
    });
  } else if (apiKey() && (!out.team || !out.founded || !out.venue || doEnrich)) {
    try {
      // Standings teamId is often ESPN id — resolve AF id by name for meta
      let afId = resolveAfTeamId(out.team || out.teamZh, standing && standing.espnTeamId, out.afTeamId) || tid;
      const meta = await fetchTeamMeta(afId);
      if (meta && meta.team) {
        saveDetailDisk('teammeta', tid, 'x', meta);
        out.team = out.team || meta.team;
        out.teamZh = out.teamZh || meta.teamZh;
        out.logo = out.logo || meta.logo;
        out.country = natZh(meta.country || '') || meta.country || out.country;
        out.founded = meta.founded;
        out.venue = meta.venue || '';
        out.venueCity = meta.venueCity || '';
        out.afTeamId = afId;
      }
    } catch (e) {
      console.warn('team meta', e.message);
    }
  }
  // Free TSDB fill for founded/venue/intro when still empty (no AF quota)
  if (!out.founded || !out.venue || !out.introZh) {
    try {
      const tsdb = await fetchTsdbTeamMeta(out.team || out.teamZh);
      if (tsdb) {
        if (!out.founded && tsdb.founded) out.founded = tsdb.founded;
        if (!out.venue && tsdb.venue) out.venue = tsdb.venue;
        if (!out.venueCity && tsdb.venueCity) out.venueCity = tsdb.venueCity;
        if (!out.country && tsdb.country) out.country = tsdb.countryZh || tsdb.country;
        if (tsdb.afTeamId && !out.afTeamId) out.afTeamId = tsdb.afTeamId;
        out.descriptionEn = out.descriptionEn || tsdb.descriptionEn || '';
        if (!out.logo && tsdb.logo) out.logo = upgradeTeamLogo(tsdb.logo, tsdb.afTeamId, tsdb.team);
      }
    } catch (e) { console.warn('team tsdb', e.message); }
  }

  const recentDisk = loadDetailDisk('teamrecent', tid, sea);
  const recentFresh = recentDisk && now - recentDisk.at < DETAIL_TTL_MS * 3
    && ((recentDisk.payload.recent && recentDisk.payload.recent.length)
      || (recentDisk.payload.upcoming && recentDisk.payload.upcoming.length));
  if (recentFresh) {
    out.recent = recentDisk.payload.recent || [];
    out.upcoming = recentDisk.payload.upcoming || [];
  } else {
    // 1.9.91/1.9.112: ESPN fixtures only when disk miss/stale (avoid serial ESPN on every open)
    const espnId = (standing && (standing.espnTeamId || standing.teamId)) || tid;
    try {
      const fx = await loadEspnTeamFixtures(espnId, out.leagueKey || lg.key, out.team);
      if (fx.recent && fx.recent.length) out.recent = fx.recent;
      if (fx.upcoming && fx.upcoming.length) out.upcoming = fx.upcoming;
      if ((fx.recent && fx.recent.length) || (fx.upcoming && fx.upcoming.length)) {
        saveDetailDisk('teamrecent', tid, sea, { recent: out.recent, upcoming: out.upcoming || [] });
      }
    } catch (e) { console.warn('team espn fixtures', e.message); }
  }
  if ((!out.recent || !out.recent.length) && apiKey() && doEnrich) {
    try {
      const afId = out.afTeamId || resolveAfIdFromCache(out.team || out.teamZh, standing && standing.espnTeamId) || tid;
      const recent = await fetchTeamRecent(afId, sea);
      if (recent && recent.length) {
        out.recent = recent;
        saveDetailDisk('teamrecent', tid, sea, { recent: out.recent, upcoming: out.upcoming || [] });
      }
    } catch (e) {
      console.warn('team recent', e.message);
      if (recentDisk) out.recent = recentDisk.payload.recent || [];
    }
  } else if ((!out.recent || !out.recent.length) && recentDisk) {
    out.recent = recentDisk.payload.recent || [];
    out.upcoming = out.upcoming || recentDisk.payload.upcoming || [];
  }
  if (!out.upcoming) out.upcoming = [];

  out.formDots = out.form || '';
  const countryLab = natZh(out.country || '') || out.country || '';
  if (countryLab) out.country = countryLab;
  out.introZh = buildIntroZh({
    teamZh: out.teamZh, team: out.team, founded: out.founded,
    venue: out.venue, venueCity: out.venueCity,
    countryZh: countryLab, country: countryLab,
    leagueZh: out.leagueZh, descriptionEn: out.descriptionEn || '',
  });

  // 1.9.110: ESPN standings teamId ≠ AF team id. Never call AF squads with ESPN tid
  // (that returned e.g. FC Vitebsk for 曼城 382 → 0% 身价). Resolve AF id; prefer ESPN roster.
  if (!out.afTeamId) {
    const resolved = resolveAfTeamId(out.team || out.teamZh, standing && standing.espnTeamId, null);
    if (resolved) out.afTeamId = resolved;
  }
  const espnSource = !!(standingsPayload && standingsPayload.source === 'espn')
    || !!(standing && (standing.espnTeamId || standing.teamId));
  let espnSlug = '';
  try {
    const espnMod = require('./espn-tables');
    espnSlug = espnMod.SLUG[out.leagueKey] || espnMod.SLUG[lg.key] || '';
  } catch { /* optional */ }

  const squadDisk = loadDetailDisk('teamsquad', tid, 'x');
  const squadMeta = (squadDisk && squadDisk.payload) || {};
  const squadPoisoned = !!(espnSource && squadMeta.source === 'af'
    && squadMeta.afTeamIdUsed && out.afTeamId
    && Number(squadMeta.afTeamIdUsed) !== Number(out.afTeamId));
  // Legacy cache: AF fetch used ESPN tid (no source marker) while standings are ESPN
  const squadLegacyBad = !!(espnSource && squadDisk && !squadMeta.source
    && Array.isArray(squadMeta.squad) && squadMeta.squad.length
    && out.afTeamId && Number(out.afTeamId) !== tid);
  const squadFresh = squadDisk && now - squadDisk.at < DETAIL_TTL_MS * 7
    && !squadPoisoned && !squadLegacyBad;

  if (squadFresh) {
    out.squad = squadMeta.squad || [];
    out.squadAvailable = out.squad.length > 0;
    if (squadMeta.source) out.squadSource = squadMeta.source;
  } else {
    let loaded = false;
    // Prefer ESPN roster when page id is ESPN (full display names, correct club)
    if (espnSlug && (espnSource || !out.afTeamId) && (doSquad || !squadDisk || squadPoisoned || squadLegacyBad)) {
      try {
        const espn = require('./espn-tables');
        const roster = await espn.fetchTeamRoster(espnSlug, tid);
        if (roster && roster.players && roster.players.length) {
          const squad = roster.players.map(p => ({
            ...p,
            playerZh: p.playerZh || playerZh(p.player),
            playerZhAuto: playerZhAuto(p.player),
            positionZh: p.positionZh || posZh(p.position || ''),
          }));
          saveDetailDisk('teamsquad', tid, 'x', { squad, source: 'espn', afTeamIdUsed: out.afTeamId || null });
          out.squad = squad;
          out.squadAvailable = true;
          out.squadSource = 'espn';
          out.source = out.source || 'espn';
          out.noteZh = '球队资料来自本赛季积分榜与公开名单；非分钟级实时。仅供参考。';
          loaded = true;
        }
      } catch (e) { console.warn('team espn roster', e.message); }
    }
    // AF squad only with resolved AF id (never raw ESPN tid when espnSource)
    if (!loaded && apiKey() && doSquad) {
      const afId = out.afTeamId || resolveAfTeamId(out.team || out.teamZh, standing && standing.espnTeamId, null);
      if (afId && !(espnSource && Number(afId) === tid)) {
        try {
          const squad = await fetchTeamSquad(afId);
          saveDetailDisk('teamsquad', tid, 'x', { squad, source: 'af', afTeamIdUsed: afId });
          // also keep AF-id keyed copy for debugging / reuse
          try { saveDetailDisk('teamsquad', afId, 'x', { squad, source: 'af', afTeamIdUsed: afId }); } catch { /* ignore */ }
          out.squad = squad;
          out.squadAvailable = squad.length > 0;
          out.squadSource = 'af';
          out.afTeamId = afId;
          loaded = true;
        } catch (e) {
          console.warn('team squad', e.message);
        }
      } else if (espnSource) {
        console.warn('team squad skip AF: espn tid', tid, 'af', afId || 'unresolved');
      }
    }
    if (!loaded && squadDisk && !squadPoisoned && !squadLegacyBad) {
      out.squad = squadMeta.squad || [];
      out.squadAvailable = out.squad.length > 0;
      if (squadMeta.source) out.squadSource = squadMeta.source;
    } else if (!loaded) {
      out.squadHint = true; // UI can offer "加载阵容" once
    }
  }

  // 1.9.111/1.9.112: merge photos; prefer disk AF/local (sync). Defer AF network enrich so first paint is not blocked.
  if (out.squad && out.squad.length && squadPhotoRate(out.squad) < 0.85) {
    try {
      const photoStats = await enrichSquadPhotos(out.squad, {
        afTeamId: out.afTeamId,
        teamName: out.team || out.teamZh || '',
        diskOnly: true,
      });
      out.squadPhotoHit = photoStats.hit;
      out.squadPhotoTotal = photoStats.total;
      if (photoStats.filled > 0) {
        const src = out.squadSource || squadMeta.source || (espnSource ? 'espn' : 'af');
        saveDetailDisk('teamsquad', tid, 'x', {
          squad: out.squad,
          source: src,
          afTeamIdUsed: out.afTeamId || null,
          photoEnrichedAt: Date.now(),
          photoHit: photoStats.hit,
        });
      }
      if (squadPhotoRate(out.squad) < 0.85) {
        out.squadPhotoPending = true;
        scheduleSquadPhotoEnrich(tid, out.leagueKey || lg.key, {
          afTeamId: out.afTeamId,
          teamName: out.team || out.teamZh || '',
          squadSource: out.squadSource || squadMeta.source || (espnSource ? 'espn' : 'af'),
        });
      }
    } catch (e) { console.warn('enrichSquadPhotos', e.message); }
  } else if (out.squad && out.squad.length) {
    out.squadPhotoHit = out.squad.filter(p => p && p.photo).length;
    out.squadPhotoTotal = out.squad.length;
  }

  if (!out.teamZh && out.team) out.teamZh = teamZh(out.team);

  if (!out.team && !out.teamZh) {
    return { ok: false, reason: 'not_found', error: '未找到该球队资料' };
  }
  out.source = out.source || (standingsPayload && standingsPayload.source) || '';
  // 1.9.113: fill Chinese league labels on fixtures (cheap; keeps assembled cache intact)
  normalizeTeamFixturesLeagueZh(out);
  try { marketValue.enrichTeam(out); } catch (e) { console.warn('marketValue team', e.message); }
  return out;
}

async function fetchAfPlayerRaw(playerId, season) {
  const resp = await afFetch(`/players?id=${encodeURIComponent(playerId)}&season=${encodeURIComponent(season)}`);
  const row = (resp && resp[0]) || null;
  if (!row || !row.player) return null;
  const p = row.player;
  const st = (row.statistics || [])[0] || {};
  const team = st.team || {};
  const league = st.league || {};
  const g = st.goals || {};
  const games = st.games || {};
  const birth = p.birth || {};
  return {
    playerId: p.id,
    player: p.name,
    playerZh: playerZh(p.name), playerZhAuto: playerZhAuto(p.name),
    photo: p.photo || '',
    age: p.age != null ? p.age : null,
    nationality: p.nationality || '',
    nationalityZh: natZh(p.nationality || ''),
    height: p.height || '',
    weight: p.weight || '',
    position: (games.position) || p.position || '',
    positionZh: posZh(games.position || p.position || ''),
    number: games.number != null ? String(games.number) : '',
    born: birth.date || '',
    birthPlace: [birth.place, birth.country].filter(Boolean).join(', '),
    teamId: team.id || null,
    team: team.name || '',
    teamZh: teamZh(team.name || ''),
    teamLogo: upgradeTeamLogo(team.logo || '', team.id, team.name),
    leagueId: league.id || null,
    leagueZh: (resolveLeague(String(league.id || '')) || {}).nameZh || league.name || '',
    season,
    goals: g.total ?? null,
    assists: g.assists ?? null,
    appearances: games.appearences ?? games.appearances ?? null,
    minutes: games.minutes ?? null,
    rating: games.rating || null,
  };
}

/**
 * AF player detail. Prefer topscorers/assists cache (0 quota), then 24h player profile cache,
 * then one /players?id=&season= call.
 */
async function fetchEspnPlayerDetail(playerId, leagueKey) {
  const pid = String(playerId);
  const cacheFile = path.join(CACHE_DIR(), `detail-espnplayer-${pid}.json`);
  try {
    const disk = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (disk && disk.at && Date.now() - disk.at < DETAIL_TTL_MS && disk.payload) return { ...disk.payload, cached: true };
  } catch {}
  let ath = {};
  let team = {};
  try {
    const j = await fetch('https://site.web.api.espn.com/apis/common/v3/sports/soccer/athletes/' + encodeURIComponent(pid), {
      headers: { 'user-agent': 'Mozilla/5.0 jingcai' }, signal: AbortSignal.timeout(12000),
    }).then(r => r.json());
    ath = j.athlete || {};
    team = ath.team || {};
  } catch (e) {
    console.warn('espn player', pid, e.message);
  }
  if (!ath.displayName) return null;

  // season goals/assists from ESPN leaders cache if present
  let goals = null, assists = null, appearances = null, photo = '';
  try {
    const espn = require('./espn-tables');
    const key = leagueKey || 'epl';
    for (const kind of ['scorers', 'assists']) {
      const raw = kind === 'scorers' ? await espn.getScorers(key) : await espn.getAssists(key);
      const hit = (raw && raw.rows || []).find(r => String(r.playerId) === pid || String(r.espnAthleteId) === pid);
      if (hit) {
        if (kind === 'scorers') { goals = hit.goals; if (hit.assists != null) assists = hit.assists; appearances = hit.appearances; }
        else { assists = hit.assists; if (goals == null) goals = hit.goals; }
        if (hit.photo) photo = hit.photo;
      }
    }
  } catch {}

  if (!photo) {
    try {
      const side = { team: team.displayName || '', starters: [{ name: ath.displayName, photo: '' }], bench: [] };
      await require('./espn-lineup').fillPhotosFromTsdb(side);
      photo = (side.starters[0] && side.starters[0].photo) || '';
    } catch {}
  }

  const pos = (ath.position && (ath.position.displayName || ath.position.name)) || '';
  const payload = {
    ok: true,
    source: 'espn',
    playerId: Number(pid) || pid,
    player: ath.displayName,
    playerZh: playerZh(ath.displayName),
    playerZhAuto: playerZhAuto(ath.displayName),
    photo,
    age: ath.age != null ? ath.age : null,
    nationality: ath.citizenship || '',
    nationalityZh: natZh(ath.citizenship || ''),
    height: ath.displayHeight || '',
    weight: ath.displayWeight || '',
    position: pos,
    positionZh: posZh(pos),
    number: ath.jersey || ath.displayJersey || '',
    born: ath.displayDOB || '',
    birthPlace: '',
    teamId: team.id || null,
    team: team.displayName || team.name || '',
    teamZh: teamZh(team.displayName || team.name || ''),
    teamLogo: (team.logos && team.logos[0] && team.logos[0].href) || (team.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png` : ''),
    leagueZh: (resolveLeague(leagueKey) || {}).nameZh || '',
    season: null,
    seasonLabel: '',
    goals, assists, appearances, minutes: null, rating: null,
    noteZh: '球员资料来自公开资料页与照片匹配；赛季进球/助攻取自本赛季榜单缓存。非分钟级实时。',
    fetchedAt: new Date().toISOString(),
  };
  try { writeJson(cacheFile, { at: Date.now(), payload }); } catch {}
  try { marketValue.enrichPlayer(payload); } catch (e) { console.warn('marketValue espn player', e.message); }
  return payload;
}

async function buildAfPlayerDetail({ playerId, league, season } = {}) {
  const pid = Number(playerId);
  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, reason: 'bad_id', error: '无效球员' };
  }
  const lg = resolveLeague(league);
  // 1.9.9: ESPN athlete ids from scorers/standings — try ESPN profile first
  try {
    const es = await fetchEspnPlayerDetail(pid, lg && lg.key);
    if (es && es.ok) return es;
  } catch (e) { console.warn('espn player detail', e.message); }
  const sea = pickSeason(season, lg && lg.id);
  const preferLeagueId = lg ? lg.id : null;

  const hit = findScorerInCaches(pid, preferLeagueId);
  let base = hit ? {
    playerId: hit.row.playerId,
    player: hit.row.player,
    playerZh: hit.row.playerZh || playerZh(hit.row.player),
    photo: hit.row.photo || '',
    teamId: hit.row.teamId,
    team: hit.row.team,
    teamZh: hit.row.teamZh || teamZh(hit.row.team),
    teamLogo: hit.row.teamLogo || '',
    goals: hit.row.goals,
    assists: hit.row.assists,
    appearances: hit.row.appearances,
    minutes: hit.row.minutes,
    rating: hit.row.rating,
    leagueId: hit.leagueId,
    leagueZh: hit.leagueZh || '',
    season: hit.season,
    seasonLabel: hit.seasonLabel || seasonLabel(hit.season, hit.leagueId),
    fromList: hit.kind,
  } : null;

  const now = Date.now();
  const disk = loadDetailDisk('afplayer', pid, sea);
  let profile = null;
  if (disk && now - disk.at < DETAIL_TTL_MS * 7) {
    profile = disk.payload;
  } else if (apiKey() && (!hit || !disk)) {
    try {
      profile = await fetchAfPlayerRaw(pid, sea);
      if (profile) saveDetailDisk('afplayer', pid, sea, profile);
    } catch (e) {
      console.warn('af player', e.message);
      if (disk) profile = disk.payload;
    }
  } else if (disk) {
    profile = disk.payload;
  }

  if (!base && !profile) {
    return { ok: false, reason: 'not_found', error: '未找到该球员资料（可先从射手/助攻榜进入）' };
  }

  const merged = {
    ok: true,
    playerId: pid,
    player: (base && base.player) || (profile && profile.player) || '',
    playerZh: (base && base.playerZh) || (profile && profile.playerZh) || '',
    photo: (base && base.photo) || (profile && profile.photo) || `https://media.api-sports.io/football/players/${pid}.png`,
    age: profile ? profile.age : null,
    nationality: profile ? profile.nationality : '',
    nationalityZh: profile ? profile.nationalityZh : '',
    height: profile ? profile.height : '',
    weight: profile ? profile.weight : '',
    position: profile ? profile.position : '',
    positionZh: profile ? profile.positionZh : '',
    number: profile ? profile.number : '',
    born: profile ? profile.born : '',
    birthPlace: profile ? profile.birthPlace : '',
    // Season club + goals: prefer scorers/assists list (matches the board user tapped)
    teamId: (base && base.teamId) || (profile && profile.teamId) || null,
    team: (base && base.team) || (profile && profile.team) || '',
    teamZh: (base && base.teamZh) || (profile && profile.teamZh) || '',
    teamLogo: (base && base.teamLogo) || (profile && profile.teamLogo) || '',
    leagueId: (base && base.leagueId) || (profile && profile.leagueId) || (lg && lg.id) || null,
    leagueKey: (lg && lg.key) || '',
    leagueZh: (base && base.leagueZh) || (profile && profile.leagueZh) || (lg && lg.nameZh) || '',
    season: (base && base.season) || (profile && profile.season) || sea,
    seasonLabel: (base && base.seasonLabel) || seasonLabel(sea, (lg && lg.id) || 0),
    goals: (base && base.goals != null) ? base.goals : (profile ? profile.goals : null),
    assists: (base && base.assists != null) ? base.assists : (profile ? profile.assists : null),
    appearances: (base && base.appearances != null) ? base.appearances : (profile ? profile.appearances : null),
    minutes: (base && base.minutes != null) ? base.minutes : (profile ? profile.minutes : null),
    rating: (base && base.rating) || (profile && profile.rating) || null,
    cached: !!(disk && now - disk.at < DETAIL_TTL_MS) || !!hit,
    noteZh: '球员资料来自第三方数据源；本季进球/助攻优先取自射手/助攻榜缓存。缺项显示「暂无」。仅供参考。',
    fetchedAt: new Date().toISOString(),
  };
  if (!merged.playerZh && merged.player) merged.playerZh = playerZh(merged.player);
  if (merged.player && merged.playerZhAuto == null) merged.playerZhAuto = playerZhAuto(merged.player);
  if (!merged.teamZh && merged.team) merged.teamZh = teamZh(merged.team);
  try { marketValue.enrichPlayer(merged); } catch (e) { console.warn('marketValue player', e.message); }
  return merged;
}


const PREFETCH_LEAGUE_KEYS = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'ucl'];
const derivedMem = new Map();
let prefetchState = { at: 0, reason: '', ok: 0, fail: 0, ms: 0, running: false, leagues: [], kinds: [] };

async function withLeagueKindCache(kind, lg, season, builder) {
  const sea = Number.isFinite(Number(season)) ? Number(season) : calendarSeasonYear(lg.id);
  const mk = `${kind}:${lg.id}:${sea}`;
  const now = Date.now();
  const hit = derivedMem.get(mk);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return {
      ...hit.payload,
      cached: true,
      cacheLayer: 'mem',
      cacheAgeSec: Math.round((now - hit.at) / 1000),
    };
  }
  const disk = loadDisk(kind, lg.id, sea);
  if (disk && now - disk.at < CACHE_TTL_MS) {
    derivedMem.set(mk, { at: disk.at, payload: disk.payload });
    return {
      ...disk.payload,
      cached: true,
      cacheLayer: 'disk',
      cacheAgeSec: Math.round((now - disk.at) / 1000),
    };
  }
  const payload = await builder();
  if (payload && payload.ok !== false) {
    const at = Date.now();
    derivedMem.set(mk, { at, payload });
    saveDisk(kind, lg.id, sea, payload);
    return { ...payload, cached: false, cacheLayer: 'compute', cacheAgeSec: 0 };
  }
  return { ...(payload || { ok: false }), cacheLayer: 'miss' };
}

/**
 * 1.9.109 — league club 身价榜.
 * Uses current standings roster (team id/logo/zh) + bundled market-value index.
 * Missing values sorted to bottom as 暂无身价 (no fabrication).
 */
async function buildClubMarketValues({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  let standings;
  try {
    standings = await getStandings({ league: lg.key || lg.id, season });
  } catch (e) {
    return { ok: false, reason: e.code || 'error', error: '身价榜暂时不可用', detail: e.message, leagueZh: lg.nameZh };
  }
  if (!standings || standings.ok === false) {
    return {
      ok: false,
      reason: (standings && standings.reason) || 'no_data',
      error: (standings && standings.error) || '该联赛暂无球队列表，无法生成身价榜',
      leagueZh: (standings && standings.leagueZh) || lg.nameZh,
      noteZh: standings && standings.noteZh,
    };
  }
  const mv = marketValue;
  const st = mv.status();
  const seen = new Set();
  const rows = [];
  for (const tb of standings.tables || []) {
    for (const r of tb.rows || []) {
      const tid = r.teamId != null ? String(r.teamId) : '';
      const key = tid || (r.team || r.teamZh || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let lookup = mv.lookupClub(r.team || '');
      if (!lookup.ok && r.teamZh && r.teamZh !== r.team) lookup = mv.lookupClub(r.teamZh);
      const ok = !!lookup.ok;
      rows.push({
        teamId: r.teamId || null,
        team: r.team || '',
        teamZh: r.teamZh || teamZh(r.team || '') || '',
        logo: r.logo || '',
        eur: ok ? lookup.eur : null,
        labelZh: ok ? lookup.labelZh : null,
        labelEuro: ok ? lookup.labelEuro : null,
        text: ok ? lookup.text : '暂无身价',
        ok,
        squadSize: ok ? (lookup.squadSize || null) : null,
        standingsRank: r.rank != null ? r.rank : null,
        points: r.points != null ? r.points : null,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.ok && !b.ok) return -1;
    if (!a.ok && b.ok) return 1;
    if (a.ok && b.ok) {
      if (b.eur !== a.eur) return b.eur - a.eur;
      return (a.standingsRank || 999) - (b.standingsRank || 999);
    }
    return String(a.teamZh || a.team).localeCompare(String(b.teamZh || b.team), 'zh');
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  const withVal = rows.filter((r) => r.ok).length;
  return {
    ok: true,
    kind: 'club-values',
    leagueId: standings.leagueId || lg.id,
    leagueKey: standings.leagueKey || lg.key,
    leagueZh: standings.leagueZh || lg.nameZh,
    season: standings.season,
    seasonLabel: standings.seasonLabel,
    asOf: st.asOf || null,
    rows,
    withValue: withVal,
    updatedAt: standings.updatedAt || standings.fetchedAt || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'market-value',
    standingsSource: standings.source || '',
    cached: !!standings.cached,
    noteZh: (st.noteZh || '参考市值，仅供参考。') + (withVal < rows.length ? ` ${rows.length - withVal} 队暂无匹配身价。` : ''),
  };
}

async function getClubMarketValues(opts = {}) {
  const lg = resolveLeague(opts.league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  if (opts.refresh || opts.force) return buildClubMarketValues(opts);
  const sea = pickSeason(opts.season, lg.id);
  return withLeagueKindCache('clubvalues', lg, sea, () => buildClubMarketValues(opts));
}

/**
 * 1.9.152 — league player 身价榜 from bundled market-value index × standings clubs.
 */
async function buildPlayerMarketValues({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  let standings;
  try {
    standings = await getStandings({ league: lg.key || lg.id, season });
  } catch (e) {
    return { ok: false, reason: e.code || 'error', error: '球员身价榜暂时不可用', detail: e.message, leagueZh: lg.nameZh };
  }
  if (!standings || standings.ok === false) {
    return {
      ok: false,
      reason: (standings && standings.reason) || 'no_data',
      error: (standings && standings.error) || '该联赛暂无球队列表，无法生成球员身价榜',
      leagueZh: (standings && standings.leagueZh) || lg.nameZh,
      noteZh: standings && standings.noteZh,
    };
  }
  const mv = marketValue;
  const st = mv.status();
  if (!st.ok) {
    return { ok: false, reason: 'no_index', error: '身价索引未加载', leagueZh: standings.leagueZh || lg.nameZh, noteZh: st.noteZh };
  }
  const seen = new Set();
  const rows = [];
  for (const tb of standings.tables || []) {
    for (const r of tb.rows || []) {
      const club = r.team || '';
      const clubZh = r.teamZh || teamZh(club) || '';
      let clubRows = mv.rowsAtClub(club);
      if (!clubRows.length && clubZh && clubZh !== club) clubRows = mv.rowsAtClub(clubZh);
      for (const row of clubRows) {
        const tmId = String(row[3] || row[0]);
        if (seen.has(tmId)) continue;
        seen.add(tmId);
        const fmt = mv.formatEur(row[1]);
        if (!fmt) continue;
        const en = row[0] || '';
        rows.push({
          rank: 0,
          playerId: null,
          tmId: row[3] != null && row[3] !== '' ? String(row[3]) : null,
          player: en,
          playerZh: playerZh(en),
          playerZhAuto: playerZhAuto(en),
          photo: '',
          photoAlt: '',
          teamId: r.teamId || null,
          team: club,
          teamZh: clubZh,
          teamLogo: r.logo || '',
          marketValueEur: fmt.eur,
          labelZh: fmt.labelZh,
          labelEuro: fmt.labelEuro,
          text: fmt.text,
          ok: true,
        });
      }
    }
  }
  rows.sort((a, b) => {
    if (b.marketValueEur !== a.marketValueEur) return b.marketValueEur - a.marketValueEur;
    return String(a.playerZh || a.player).localeCompare(String(b.playerZh || b.player), 'zh');
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  const cap = 80;
  const trimmed = rows.slice(0, cap);
  try {
    const et = require('./espn-tables');
    const lkey = standings.leagueKey || lg.key;
    et.enrichPlayervaluePhotos(trimmed, lkey);
    const slug = et.SLUG && et.SLUG[lkey];
    if (slug && trimmed.some((r) => !r.photo)) {
      setImmediate(() => {
        et.enrichLeaderPhotos(trimmed, { kind: 'scorers', slug }).catch((e) => {
          console.warn('playervalues photo enrich', e.message);
        });
      });
    }
  } catch (e) {
    console.warn('playervalues photos', e.message);
  }
  return {
    ok: true,
    kind: 'playervalues',
    leagueId: standings.leagueId || lg.id,
    leagueKey: standings.leagueKey || lg.key,
    leagueZh: standings.leagueZh || lg.nameZh,
    season: standings.season,
    seasonLabel: standings.seasonLabel,
    asOf: st.asOf || null,
    rows: trimmed,
    totalMatched: rows.length,
    cappedAt: cap,
    updatedAt: standings.updatedAt || standings.fetchedAt || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'market-value',
    standingsSource: standings.source || '',
    cached: !!standings.cached,
    noteZh: (st.noteZh || '参考市值，仅供参考。') + (rows.length > cap ? ` 展示前 ${cap} 名。` : ''),
  };
}

async function getPlayerMarketValues(opts = {}) {
  const lg = resolveLeague(opts.league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  let out;
  if (opts.refresh || opts.force) out = await buildPlayerMarketValues(opts);
  else {
    const sea = pickSeason(opts.season, lg.id);
    out = await withLeagueKindCache('playervalues', lg, sea, () => buildPlayerMarketValues(opts));
  }
  if (out && out.ok && (out.rows || []).some((r) => r && !r.photo)) {
    try {
      const et = require('./espn-tables');
      et.enrichPlayervaluePhotos(out.rows, out.leagueKey || lg.key);
    } catch (e) {
      console.warn('playervalues photo re-enrich', e.message);
    }
  }
  return out;
}

/** 1.9.154 — warm data-center API payloads (ESPN disk + derived 身价榜) for fast first paint. */
async function prefetchDataCenter({ reason = 'manual', leagues = PREFETCH_LEAGUE_KEYS, kinds = null } = {}) {
  const wantKinds = kinds || ['standings', 'topscorers', 'topassists', 'clubvalues', 'playervalues', 'topkeepers'];
  const isFastOnly = kinds != null;
  if (prefetchState.running && !isFastOnly) return { ...prefetchState, skipped: true };
  if (!isFastOnly) prefetchState.running = true;
  const fns = {
    standings: getStandings,
    topscorers: getTopScorers,
    topassists: getTopAssists,
    clubvalues: getClubMarketValues,
    playervalues: getPlayerMarketValues,
    topkeepers: getTopKeepers,
  };
  let ok = 0;
  let fail = 0;
  const started = Date.now();
  for (const key of leagues) {
    for (const kind of wantKinds) {
      const fn = fns[kind];
      if (!fn) continue;
      try {
        const r = await fn({ league: key });
        if (r && r.ok !== false) ok++;
        else fail++;
      } catch (e) {
        fail++;
        console.warn('[data-center-prefetch]', key, kind, e.message);
      }
      await new Promise((res) => setTimeout(res, 40));
    }
  }
  prefetchState = {
    at: Date.now(),
    reason,
    ok,
    fail,
    ms: Date.now() - started,
    running: isFastOnly ? prefetchState.running : false,
    leagues: [...leagues],
    kinds: [...wantKinds],
  };
  console.log('[data-center-prefetch]', reason, `ok=${ok} fail=${fail} ${prefetchState.ms}ms`);
  return prefetchState;
}

function prefetchStatus() {
  return {
    ...prefetchState,
    leagueKeys: PREFETCH_LEAGUE_KEYS,
    cacheTtlHours: CACHE_TTL_MS / 3600e3,
    derivedKinds: ['clubvalues', 'playervalues'],
  };
}

/** 1.9.152 — 门神榜占位：零封/扑救数据源接入前返回筹备态（非死链）。 */
async function getTopKeepers({ league, season } = {}) {
  const lg = resolveLeague(league);
  if (!lg) return { ok: false, reason: 'bad_league', error: '未知联赛', leagues: listLeagues() };
  let standings;
  try {
    standings = await getStandings({ league: lg.key || lg.id, season });
  } catch (e) {
    standings = null;
  }
  const seasonLabel = standings && standings.seasonLabel;
  const seasonYear = standings && standings.season;
  return {
    ok: true,
    kind: 'topkeepers',
    preparing: true,
    leagueId: (standings && standings.leagueId) || lg.id,
    leagueKey: (standings && standings.leagueKey) || lg.key,
    leagueZh: (standings && standings.leagueZh) || lg.nameZh,
    season: seasonYear,
    seasonLabel,
    rows: [],
    updatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source: 'placeholder',
    noteZh: '门神榜（零封 / 扑救）数据接入筹备中，可先查看射手榜与助攻榜。',
  };
}

/** Copy photo URLs from srcSquad onto dstSquad cards (by playerId, else loose name). */
function mergeSquadPhotosInPlace(dstSquad, srcSquad) {
  if (!Array.isArray(dstSquad) || !Array.isArray(srcSquad) || !srcSquad.length) return 0;
  const byId = new Map();
  const byName = new Map();
  for (const s of srcSquad) {
    if (!s || !s.photo) continue;
    if (s.playerId != null) byId.set(String(s.playerId), s.photo);
    const nk = String(s.player || s.name || '').trim().toLowerCase();
    if (nk) byName.set(nk, s.photo);
  }
  let n = 0;
  for (const d of dstSquad) {
    if (!d) continue;
    let ph = null;
    if (d.playerId != null && byId.has(String(d.playerId))) ph = byId.get(String(d.playerId));
    else {
      const nk = String(d.player || d.name || '').trim().toLowerCase();
      if (nk && byName.has(nk)) ph = byName.get(nk);
    }
    if (ph && d.photo !== ph) { d.photo = ph; n += 1; }
    else if (ph && !d.photo) { d.photo = ph; n += 1; }
  }
  return n;
}

/** Re-bind 身价 on an assembled team payload (sync, local index). Heals wiped caches. */
function healAssembledMarketValue(payload) {
  if (!payload || payload.ok === false) return payload;
  if (!Array.isArray(payload.squad) || !payload.squad.length) return payload;
  try { marketValue.enrichTeam(payload); } catch (e) { console.warn('healAssembledMarketValue', e.message); }
  return payload;
}

/** 1.9.112: background AF photo merge — updates squad + assembled team cache without blocking request. */
function scheduleSquadPhotoEnrich(teamId, leagueKey, opts = {}) {
  const tid = Number(teamId);
  const key = `photo:${tid}`;
  if (!Number.isFinite(tid) || tid <= 0) return;
  if (assembledRefreshing.has(key)) return;
  assembledRefreshing.add(key);
  setImmediate(async () => {
    try {
      const disk = loadDetailDisk('teamsquad', tid, 'x');
      const squad = disk && disk.payload && Array.isArray(disk.payload.squad) ? disk.payload.squad : null;
      if (!squad || !squad.length || squadPhotoRate(squad) >= 0.85) return;
      const stats = await enrichSquadPhotos(squad, {
        afTeamId: opts.afTeamId,
        teamName: opts.teamName || '',
        diskOnly: false,
      });
      if (stats.filled > 0 || stats.hit > 0) {
        saveDetailDisk('teamsquad', tid, 'x', {
          squad,
          source: opts.squadSource || (disk.payload && disk.payload.source) || 'espn',
          afTeamIdUsed: opts.afTeamId || (disk.payload && disk.payload.afTeamIdUsed) || null,
          photoEnrichedAt: Date.now(),
          photoHit: stats.hit,
        });
        // 1.9.116: merge photos into assembled squad — never replace the array
        // (replacement wiped marketValueEur while leaving squadMarketCoverage, so UI
        // showed「匹配 n/m」with ranks 1–N all「暂无」sorted by Chinese name).
        const lg = String(leagueKey || 'x');
        const full = loadDetailDisk('teamfull', tid, lg);
        if (full && full.payload && Array.isArray(full.payload.squad)) {
          mergeSquadPhotosInPlace(full.payload.squad, squad);
          full.payload.squadPhotoHit = full.payload.squad.filter((p) => p && p.photo).length;
          full.payload.squadPhotoTotal = full.payload.squad.length;
          delete full.payload.squadPhotoPending;
          try { marketValue.enrichTeam(full.payload); } catch (e) { console.warn('mv re-enrich photo', e.message); }
          saveDetailDisk('teamfull', tid, lg, full.payload);
          assembledMemSet(`team:${tid}:${lg}`, full.payload);
        }
      }
    } catch (e) {
      console.warn('bg squad photo', teamId, e.message);
    } finally {
      assembledRefreshing.delete(key);
    }
  });
}

function scheduleTeamDetailRefresh(opts, cacheKey) {
  if (assembledRefreshing.has(cacheKey)) return;
  assembledRefreshing.add(cacheKey);
  setImmediate(async () => {
    try {
      const built = await buildTeamDetail({ ...opts, enrich: true, wantSquad: true });
      if (built && built.ok) {
        const tid = Number(opts.teamId);
        const lg = resolveLeague(opts.league) || LEAGUES[0];
        saveDetailDisk('teamfull', tid, lg.key || 'x', built);
        assembledMemSet(cacheKey, built);
      }
    } catch (e) {
      console.warn('bg team detail', cacheKey, e.message);
    } finally {
      assembledRefreshing.delete(cacheKey);
    }
  });
}

function schedulePlayerDetailRefresh(opts, cacheKey) {
  if (assembledRefreshing.has(cacheKey)) return;
  assembledRefreshing.add(cacheKey);
  setImmediate(async () => {
    try {
      const built = await buildAfPlayerDetail(opts);
      if (built && built.ok) {
        const pid = Number(opts.playerId);
        const lg = resolveLeague(opts.league);
        saveDetailDisk('playerfull', pid, (lg && lg.key) || 'x', built);
        assembledMemSet(cacheKey, built);
      }
    } catch (e) {
      console.warn('bg player detail', cacheKey, e.message);
    } finally {
      assembledRefreshing.delete(cacheKey);
    }
  });
}

/**
 * 1.9.112 assembled team-detail: mem → disk fresh → soft-stale+bg → build.
 */
async function getTeamDetail(opts = {}) {
  const tid = Number(opts.teamId);
  const lg = resolveLeague(opts.league) || LEAGUES[0];
  const force = !!(opts.refresh || opts.force);
  const cacheKey = `team:${tid}:${lg.key || 'x'}`;
  if (!force && Number.isFinite(tid) && tid > 0) {
    const mem = assembledMemGet(cacheKey);
    if (mem && Date.now() - mem.at < ASSEMBLED_TTL_MS && mem.payload && mem.payload.ok) {
      return cloneAssembled(mem.payload, { cached: true, assembledCache: 'mem', stale: false });
    }
    const disk = loadDetailDisk('teamfull', tid, lg.key || 'x');
    if (disk && disk.payload && disk.payload.ok) {
      const age = Date.now() - disk.at;
      if (age < ASSEMBLED_TTL_MS) {
        assembledMemSet(cacheKey, disk.payload);
        return cloneAssembled(disk.payload, { cached: true, assembledCache: 'disk', stale: false });
      }
      if (age < ASSEMBLED_STALE_MS) {
        scheduleTeamDetailRefresh({ ...opts, enrich: true, wantSquad: true }, cacheKey);
        assembledMemSet(cacheKey, disk.payload);
        return cloneAssembled(disk.payload, { cached: true, assembledCache: 'stale', stale: true });
      }
    }
  }
  const built = await buildTeamDetail(opts);
  if (built && built.ok && Number.isFinite(tid) && tid > 0) {
    saveDetailDisk('teamfull', tid, lg.key || 'x', built);
    assembledMemSet(cacheKey, built);
  }
  return built;
}

/**
 * 1.9.112 assembled player-detail cache (same soft-stale strategy).
 */
async function getAfPlayerDetail(opts = {}) {
  const pid = Number(opts.playerId);
  const lg = resolveLeague(opts.league);
  const force = !!(opts.refresh || opts.force);
  const lgKey = (lg && lg.key) || 'x';
  const cacheKey = `player:${pid}:${lgKey}`;
  if (!force && Number.isFinite(pid) && pid > 0) {
    const mem = assembledMemGet(cacheKey);
    if (mem && Date.now() - mem.at < ASSEMBLED_TTL_MS && mem.payload && mem.payload.ok) {
      return cloneAssembled(mem.payload, { cached: true, assembledCache: 'mem', stale: false });
    }
    const disk = loadDetailDisk('playerfull', pid, lgKey);
    if (disk && disk.payload && disk.payload.ok) {
      const age = Date.now() - disk.at;
      if (age < ASSEMBLED_TTL_MS) {
        assembledMemSet(cacheKey, disk.payload);
        return cloneAssembled(disk.payload, { cached: true, assembledCache: 'disk', stale: false });
      }
      if (age < ASSEMBLED_STALE_MS) {
        schedulePlayerDetailRefresh(opts, cacheKey);
        assembledMemSet(cacheKey, disk.payload);
        return cloneAssembled(disk.payload, { cached: true, assembledCache: 'stale', stale: true });
      }
    }
  }
  const built = await buildAfPlayerDetail(opts);
  if (built && built.ok && Number.isFinite(pid) && pid > 0) {
    saveDetailDisk('playerfull', pid, lgKey, built);
    assembledMemSet(cacheKey, built);
  }
  return built;
}

/** Warm team detail into assembled cache (fire-and-forget friendly). */
async function warmTeamDetail({ teamId, league } = {}) {
  return getTeamDetail({ teamId, league, enrich: true, wantSquad: true });
}

async function warmPlayerDetail({ playerId, league } = {}) {
  return getAfPlayerDetail({ playerId, league });
}


module.exports = {
  LEAGUES,
  FREE_SEASON,
  refreshEspnTables: () => require('./espn-tables').refreshAll({ reason: 'api' }),
  calendarSeasonYear,
  CACHE_TTL_MS,
  listLeagues,
  getStandings,
  getTopScorers,
  getTopAssists,
  getClubMarketValues,
  getPlayerMarketValues,
  getTopKeepers,
  getTeamDetail,
  getAfPlayerDetail,
  warmTeamDetail,
  warmPlayerDetail,
  ASSEMBLED_TTL_MS,
  getQuota,
  teamZh,
  leagueZh,
  TEAM_ZH,
  LEAGUE_ZH_MAP,
  playerZh,
  resolveLeague,
  apiKeyPresent: () => !!apiKey(),
  PREFETCH_LEAGUE_KEYS,
  prefetchDataCenter,
  prefetchStatus,
};
