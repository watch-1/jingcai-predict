// League standings / topscorers / top assists.
// 1.9.7: ESPN public APIs are primary (current season). API-Football free plan is stuck at ≤2024
// and must NOT be shown as "current" — only as explicitly requested past season, or fallback
// when ESPN fails AND AF season passes the calendar guardrail (almost never for free plan).
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const BASE = 'https://v3.football.api-sports.io';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // serve stale up to 7d if upstream fails
const FREE_SEASON = 2024; // AF free plan hard max (as of 2026-10) — NOT the app "current" season
const AF_STALE_WARN = 'API-Football 免费档仅支持到 2024/25，已停用为默认数据源；请查看本赛季（ESPN）数据。';
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

function teamZh(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (TEAM_ZH[n]) return TEAM_ZH[n];
  for (const [en, zh] of Object.entries(TEAM_ZH)) {
    if (n.toLowerCase() === en.toLowerCase()) return zh;
    if (n.includes(en) || en.includes(n)) return zh;
  }
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
        ? `本赛季欧冠联赛阶段积分榜（${short}，来源 ESPN）。现行赛制为 36 队单表（非旧式小组赛）：前8直接晋级16强，9–24进入附加赛，25–36淘汰。每日自动更新 · 完场后自动刷新；另约6小时兜底；非分钟级实时。`
        : `本赛季积分榜（${short}，来源 ESPN）。每日自动更新 · 完场后自动刷新该联赛；另约6小时兜底；非分钟级实时。`;
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
        ? `本赛季助攻榜（${short}，来源 ESPN）。每日自动更新 · 完场后自动刷新；另约6小时兜底；俱乐部为当前所属球队。`
        : `本赛季射手榜（${short}，来源 ESPN）。每日自动更新 · 完场后自动刷新；另约6小时兜底；俱乐部为当前所属球队。`,
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
    noteZh: AF_STALE_WARN + ` 当前应展示 ${seasonLabel(calendarSeasonYear(lg.id), lg.id)}。可稍后重试（ESPN）或显式选择历史赛季。`,
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
    noteZh: `默认展示本赛季 ${seasonLabel(cur, 39)}（ESPN 公开数据：每日自动更新 · 完场后自动刷新，另约6小时兜底，非分钟级实时）。API-Football 免费档仅到 ${FREE_SEASON}/${String(FREE_SEASON + 1).slice(-2)}，不再当作当前赛季。`,
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
const { posZh, natZh } = require('./i18n-football');

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
      leagueZh: (resolveLeague(String(l.id || '')) || {}).nameZh || l.name || '',
      home: th.name || '',
      homeZh: teamZh(th.name),
      homeLogo: upgradeTeamLogo(th.logo || '', th.id, th.name),
      away: ta.name || '',
      awayZh: teamZh(ta.name),
      awayLogo: upgradeTeamLogo(ta.logo || '', ta.id, ta.name),
      goalsHome: g.home,
      goalsAway: g.away,
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

/**
 * Team detail for data center. Standings summary from cached table (0 extra quota).
 * Team meta / recent fixtures / squad: disk-cached 24h each, fetched only on miss.
 */
async function getTeamDetail({ teamId, league, season, enrich, wantSquad } = {}) {
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
    squad: [],
    squadAvailable: false,
    cached: !!(standingsPayload && standingsPayload.cached),
    noteZh: '球队资料来自第三方数据源缓存；缺项显示「暂无」，不编造。仅供参考，无投注服务。',
    fetchedAt: new Date().toISOString(),
  };

  // Quota-safe enrich: only read disk caches by default.
  // Fetch upstream only when explicitly requested (?enrich=1 / wantSquad) or name missing.
  const now = Date.now();
  const doEnrich = !!enrich;
  const doSquad = !!wantSquad;

  const metaDisk = loadDetailDisk('teammeta', tid, 'x');
  if (metaDisk && now - metaDisk.at < DETAIL_TTL_MS * 7) {
    Object.assign(out, {
      team: out.team || metaDisk.payload.team,
      teamZh: out.teamZh || metaDisk.payload.teamZh,
      logo: out.logo || metaDisk.payload.logo,
      country: metaDisk.payload.country || out.country,
      founded: metaDisk.payload.founded,
      venue: metaDisk.payload.venue || '',
      venueCity: metaDisk.payload.venueCity || '',
    });
  } else if (apiKey() && (!out.team || doEnrich)) {
    try {
      const meta = await fetchTeamMeta(tid);
      if (meta) {
        saveDetailDisk('teammeta', tid, 'x', meta);
        out.team = out.team || meta.team;
        out.teamZh = out.teamZh || meta.teamZh;
        out.logo = out.logo || meta.logo;
        out.country = meta.country || out.country;
        out.founded = meta.founded;
        out.venue = meta.venue || '';
        out.venueCity = meta.venueCity || '';
      }
    } catch (e) {
      console.warn('team meta', e.message);
    }
  }

  const recentDisk = loadDetailDisk('teamrecent', tid, sea);
  if (recentDisk && now - recentDisk.at < DETAIL_TTL_MS * 3) {
    out.recent = recentDisk.payload.recent || [];
  } else if (apiKey() && doEnrich) {
    try {
      const recent = await fetchTeamRecent(tid, sea);
      saveDetailDisk('teamrecent', tid, sea, { recent });
      out.recent = recent;
    } catch (e) {
      console.warn('team recent', e.message);
      if (recentDisk) out.recent = recentDisk.payload.recent || [];
    }
  } else if (recentDisk) {
    out.recent = recentDisk.payload.recent || [];
  }

  out.formDots = out.form || '';

  const squadDisk = loadDetailDisk('teamsquad', tid, 'x');
  if (squadDisk && now - squadDisk.at < DETAIL_TTL_MS * 7) {
    out.squad = squadDisk.payload.squad || [];
    out.squadAvailable = out.squad.length > 0;
  } else if (apiKey() && doSquad) {
    try {
      const squad = await fetchTeamSquad(tid);
      saveDetailDisk('teamsquad', tid, 'x', { squad });
      out.squad = squad;
      out.squadAvailable = squad.length > 0;
    } catch (e) {
      console.warn('team squad', e.message);
      if (squadDisk) {
        out.squad = squadDisk.payload.squad || [];
        out.squadAvailable = out.squad.length > 0;
      }
    }
  } else if (squadDisk) {
    out.squad = squadDisk.payload.squad || [];
    out.squadAvailable = out.squad.length > 0;
  } else {
    out.squadHint = true; // UI can offer "加载阵容" once
  }

  if (!out.teamZh && out.team) out.teamZh = teamZh(out.team);

  // 1.9.9: ESPN team path — roster / recent from ESPN when AF ids don't apply
  if (out.team && (standingsPayload && standingsPayload.source === 'espn' || standing && standing.espnTeamId || standing)) {
    try {
      const espn = require('./espn-tables');
      const slug = espn.SLUG[out.leagueKey] || espn.SLUG[lg.key];
      if (slug && (!out.squad || !out.squad.length)) {
        const roster = await espn.fetchTeamRoster(slug, tid);
        if (roster && roster.players && roster.players.length) {
          out.squad = roster.players.map(p => ({
            ...p,
            playerZh: p.playerZh || playerZh(p.player),
            playerZhAuto: playerZhAuto(p.player),
            positionZh: p.positionZh || posZh(p.position || ''),
          }));
          out.squadAvailable = true;
          out.source = out.source || 'espn';
          out.noteZh = '球队资料来自 ESPN 本赛季积分榜与公开名单；非分钟级实时。仅供参考。';
        }
      }
    } catch (e) { console.warn('team espn roster', e.message); }
  }

  if (!out.team && !out.teamZh) {
    return { ok: false, reason: 'not_found', error: '未找到该球队资料' };
  }
  out.source = out.source || (standingsPayload && standingsPayload.source) || '';
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
    noteZh: '球员资料来自 ESPN 公开页 + TheSportsDB 照片匹配；赛季进球/助攻取自本赛季榜单缓存。非分钟级实时。',
    fetchedAt: new Date().toISOString(),
  };
  try { writeJson(cacheFile, { at: Date.now(), payload }); } catch {}
  return payload;
}

async function getAfPlayerDetail({ playerId, league, season } = {}) {
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
    noteZh: '球员资料来自第三方数据源；本季进球/助攻优先取自射手/助攻榜缓存。缺项显示「暂无」。仅供参考，无投注服务。',
    fetchedAt: new Date().toISOString(),
  };
  if (!merged.playerZh && merged.player) merged.playerZh = playerZh(merged.player);
  if (merged.player && merged.playerZhAuto == null) merged.playerZhAuto = playerZhAuto(merged.player);
  if (!merged.teamZh && merged.team) merged.teamZh = teamZh(merged.team);
  return merged;
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
  getTeamDetail,
  getAfPlayerDetail,
  getQuota,
  teamZh,
  TEAM_ZH,
  playerZh,
  resolveLeague,
  apiKeyPresent: () => !!apiKey(),
};
