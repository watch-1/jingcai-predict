/**
 * Display-only English/legal club name → Chinese.
 * Conservative: exact / affix-stripped / token-set equality only.
 * Never substring-match (Inter Miami must not become 国际米兰).
 * Unknown names stay as-is. Matching/lookups must keep the original name.
 */
'use strict';

const GENERIC = new Set([
  'fc', 'afc', 'cf', 'sc', 'sv', 'ssv', 'tsv', 'vfb', 'vfl', 'bsc', 'ssc',
  'as', 'ac', 'rc', 'rcd', 'ud', 'cd', 'sd', 'fk', 'bk', 'sk', 'if', 'ik',
  'il', 'ff', 'aif', 'ss', 'kv', 'cfc', 'bc', 'calcio', 'sad', 'sa', 'srl',
  'club', 'clube', 'football', 'futbol', 'futebol', 'soccer', 'sport',
  'sports', 'the', 'de', 'da', 'do', 'dos', 'del', 'of', 'and', 'e',
  'footballclub', 'sportclub', 'soccerclub',
]);

/** Official Transfermarkt / legal names not already in TEAM_ZH keys. */
const EXTRA_CLUB_ZH = {
  // MLS — Inter Miami legal name must not fall through to Inter Milan
  'Inter Miami': '迈阿密国际',
  'Inter Miami CF': '迈阿密国际',
  'Club Internacional de Fútbol Miami': '迈阿密国际',
  'Club Internacional de Futbol Miami': '迈阿密国际',
  'Los Angeles Galaxy': '洛杉矶银河',
  'LA Galaxy': '洛杉矶银河',
  'Los Angeles Football Club': '洛杉矶FC',
  LAFC: '洛杉矶FC',
  'New York City Football Club': '纽约城',
  'New York City FC': '纽约城',
  'NYCFC': '纽约城',
  'Red Bull New York': '纽约红牛',
  'New York Red Bulls': '纽约红牛',
  'New England Revolution': '新英格兰革命',
  'Seattle Sounders': '西雅图海湾人',
  'Seattle Sounders FC': '西雅图海湾人',
  'Atlanta United': '亚特兰大联',
  'Atlanta United Football Club': '亚特兰大联',
  'Atlanta United FC': '亚特兰大联',
  'Orlando City': '奥兰多城',
  'Orlando City Soccer Club': '奥兰多城',
  'Orlando City SC': '奥兰多城',
  'Toronto FC': '多伦多FC',
  'Vancouver Whitecaps': '温哥华白帽',
  'Vancouver Whitecaps FC': '温哥华白帽',
  'Chicago Fire': '芝加哥火焰',
  'Chicago Fire Soccer Club': '芝加哥火焰',
  'Columbus Crew': '哥伦布机员',
  'Philadelphia Union': '费城联',
  'Portland Timbers': '波特兰伐木者',
  'Real Salt Lake': '皇家盐湖城',
  'Austin FC': '奥斯汀FC',
  'Charlotte FC': '夏洛特FC',
  'Charlotte Football Club': '夏洛特FC',
  'FC Cincinnati': '辛辛那提FC',
  'Football Club Cincinnati': '辛辛那提FC',
  'Houston Dynamo': '休斯敦迪纳摩',
  'Minnesota United': '明尼苏达联',
  'Minnesota United FC': '明尼苏达联',
  'Nashville SC': '纳什维尔SC',
  'Sporting Kansas City': '堪萨斯城竞技',
  'CF Montréal': '蒙特利尔',
  'CF Montreal': '蒙特利尔',
  'Club de Foot Montreal': '蒙特利尔',
  'Club de Foot Montréal': '蒙特利尔',
  'FC Dallas': '达拉斯FC',
  'San Jose Earthquakes': '圣何塞地震',
  'San José Earthquakes': '圣何塞地震',
  'St. Louis City SC': '圣路易斯城',
  'St Louis City SC': '圣路易斯城',
  'DC United': 'DC联',
  'D.C. United': 'DC联',

  // Saudi Pro League legal names
  'Al-Nassr Football Club': '利雅胜利',
  'Al Nassr Football Club': '利雅胜利',
  'Al-Hilal': '希拉尔',
  'Al Hilal': '希拉尔',
  'Al-Hilal Saudi Football Club': '希拉尔',
  'Al Hilal Saudi Football Club': '希拉尔',
  'Al-Ahli': '吉达国民',
  'Al Ahli': '吉达国民',
  'Al-Ahli Saudi Football Club': '吉达国民',
  'Al Ahli Saudi Football Club': '吉达国民',
  'Al-Ittihad': '吉达联合',
  'Al Ittihad': '吉达联合',
  'Al-Ittihad Football Club': '吉达联合',
  'Al Ittihad Football Club': '吉达联合',
  'Al-Ettifaq': '伊蒂法克',
  'Al Ettifaq': '伊蒂法克',
  'Al-Ettifaq Football Club': '伊蒂法克',
  'Al-Shabab': '利雅得青年',
  'Al Shabab': '利雅得青年',
  'Al-Shabab Club': '利雅得青年',
  'Al-Taawoun': '塔沃恩',
  'Al Taawoun': '塔沃恩',
  'Al-Taawoun Football Club': '塔沃恩',
  'Al-Fateh': '法塔赫',
  'Al Fateh': '法塔赫',
  'Al-Fateh Club': '法塔赫',
  'Al-Fayha': '费哈',
  'Al-Fayha FC': '费哈',
  'Al-Khaleej': '海湾',
  'Al-Khaleej Club (Saihat)': '海湾',
  'Al-Okhdood': '艾克杜德',
  'Al-Okhdood Club': '艾克杜德',
  'Al-Riyadh': '利雅得',
  'Al-Riyadh Saudi Club': '利雅得',
  'Al-Qadsiah': '卡迪西亚',
  'Al-Qadsiah Saudi Football Club': '卡迪西亚',
  'Al-Wehda': '统一',
  'Al-Wehda FC': '统一',
  'Al-Hazem': '哈泽姆',
  'Al-Hazem Sport Club': '哈泽姆',
  'Al-Kholood': '霍洛德',
  'Al-Kholood Club': '霍洛德',
  'Al-Orobah': '奥罗巴',
  'Al-Orobah FC': '奥罗巴',
  'Al-Najma': '纳杰马',
  'Al-Najma Sport Club': '纳杰马',
  'Al-Raed': '拉伊德',
  'Al-Raed SFC': '拉伊德',
  'Neom Sports Club': 'NEOM',
  'NEOM SC': 'NEOM',

  // This match's remaining TM legal names (Argentina vs Uruguay 2042735)
  'RC Strasbourg Alsace': '斯特拉斯堡',
  'Strasbourg Alsace': '斯特拉斯堡',
  'Real Betis Balompié': '贝蒂斯',
  'Real Betis Balompie': '贝蒂斯',
  'Club Atlético Boca Juniors': '博卡青年',
  'Club Atletico Boca Juniors': '博卡青年',
  'Boca Juniors': '博卡青年',
  'Club Atlético River Plate': '河床',
  'Club Atletico River Plate': '河床',
  'River Plate': '河床',
  'Olympique Lyon': '里昂',
  'SC Braga': '布拉加',
  'Sporting Braga': '布拉加',
  Braga: '布拉加',
  'Clube de Regatas do Flamengo': '弗拉门戈',
  Flamengo: '弗拉门戈',
  'Sociedade Esportiva Palmeiras': '帕尔梅拉斯',
  Palmeiras: '帕尔梅拉斯',
  'CF América': '美洲俱乐部',
  'Club América': '美洲俱乐部',
  'Club America': '美洲俱乐部',
  'Fluminense Football Club': '弗鲁米嫩塞',
  Fluminense: '弗鲁米嫩塞',
  'Panathinaikos Athlitikos Omilos': '帕纳辛奈科斯',
  Panathinaikos: '帕纳辛奈科斯',
  'Real Oviedo': '皇家奥维耶多',
  'CF Monterrey': '蒙特雷',
  Monterrey: '蒙特雷',
  'Sport Club Internacional': '国际体育会',
  'Club Estudiantes de La Plata': '拉普拉塔大学生',
  'Estudiantes de La Plata': '拉普拉塔大学生',

  // Common TM legal forms of already-mapped European clubs
  'Atlético de Madrid': '马竞',
  'Atletico de Madrid': '马竞',
  'Club Atlético de Madrid': '马竞',
  'Chelsea FC': '切尔西',
  'Liverpool FC': '利物浦',
  'Manchester United FC': '曼联',
  'Manchester City FC': '曼城',
  'Arsenal FC': '阿森纳',
  'Tottenham Hotspur FC': '热刺',
  'Como 1907': '科莫',
  'Como 1907 FC': '科莫',
  'Aston Villa FC': '阿斯顿维拉',
  'Genoa CFC': '热那亚',
  'Parma Calcio 1913': '帕尔马',
  'RCD Espanyol Barcelona': '西班牙人',
  'RCD Espanyol': '西班牙人',
  'LOSC Lille': '里尔',
  'Club Brugge KV': '布鲁日',
  'Sevilla FC': '塞维利亚',
  'Levante UD': '莱万特',
  'UD Las Palmas': '拉斯帕尔马斯',
  'Union Saint-Gilloise': '圣吉联合',
};

function looksChinese(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ''));
}

function normKey(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'\u2019]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripAffixes(s) {
  let t = String(s || '').trim();
  t = t.replace(/^(the\s+)?/i, '');
  t = t.replace(/^\d+\.\s*/i, '');
  t = t.replace(/^(club\s+de\s+foot\s+)/i, '');
  t = t.replace(/^(fc|afc|cf|sc|sv|ssv|tsv|vfb|vfl|bsc|ssc|as|ac|rcd|rc|ud|cd|sd|fk|cfc|bc|losc)\s+/i, '');
  t = t.replace(/\s+0?\d{2}\s+/g, ' ');
  t = t.replace(/\s+(football\s+club|soccer\s+club|f[uú]tbol\s+club|futebol\s+clube|sport\s+club)$/i, '');
  t = t.replace(/\s+(fc|afc|cf|sc|sv|ssv|kv|cfc|ud|sad|sa)\s*$/i, '');
  t = t.replace(/\s+(19|20)\d{2}\s*$/i, '');
  t = t.replace(/\s+\(\d{4}\s*[-–]\s*\d{4}\)\s*$/i, '');
  t = t.replace(/\s+saudi(\s+football)?(\s+club)?$/i, '');
  return t.trim();
}

function tokens(s) {
  return normKey(stripAffixes(s)).split(' ').filter((w) => {
    if (!w) return false;
    if (GENERIC.has(w)) return false;
    if (/^(19|20)\d{2}$/.test(w)) return false;
    return true;
  });
}

function tokenKey(s) {
  return tokens(s).join(' ');
}

let _index = null;

function allEntries() {
  let base = {};
  try {
    base = require('./league-tables').TEAM_ZH || {};
  } catch (_) {
    base = {};
  }
  return Object.assign({}, base, EXTRA_CLUB_ZH);
}

function buildIndex() {
  const exact = new Map();
  const norm = new Map();
  const tok = new Map();
  const add = (en, zh) => {
    if (!en || !zh || !looksChinese(zh)) return;
    exact.set(String(en).trim(), zh);
    exact.set(String(en).trim().toLowerCase(), zh);
    const nk = normKey(stripAffixes(en));
    const tk = tokenKey(en);
    const put = (map, key) => {
      if (!key) return;
      const prev = map.get(key);
      if (prev && prev !== zh) map.set(key, null); // ambiguous
      else if (!prev) map.set(key, zh);
    };
    put(norm, nk);
    put(tok, tk);
  };
  for (const [en, zh] of Object.entries(allEntries())) add(en, zh);
  return { exact, norm, tok };
}

function index() {
  if (!_index) _index = buildIndex();
  return _index;
}

/** For tests: rebuild after map changes in the same process. */
function resetClubZhIndex() {
  _index = null;
}

/**
 * @param {string} name English or legal club name
 * @returns {string} Chinese label, or the original name if unknown
 */
function clubDisplayZh(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (looksChinese(raw)) return raw;
  const idx = index();
  if (idx.exact.has(raw)) return idx.exact.get(raw);
  if (idx.exact.has(raw.toLowerCase())) return idx.exact.get(raw.toLowerCase());
  const nk = normKey(stripAffixes(raw));
  if (nk && idx.norm.get(nk)) return idx.norm.get(nk);
  const tk = tokenKey(raw);
  if (tk && idx.tok.get(tk)) return idx.tok.get(tk);
  return raw;
}

module.exports = {
  clubDisplayZh,
  EXTRA_CLUB_ZH,
  resetClubZhIndex,
  tokens,
  stripAffixes,
};
