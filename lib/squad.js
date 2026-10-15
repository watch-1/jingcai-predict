/**
 * Squad via TheSportsDB (+ API-Football fallback when roster empty/sparse).
 * Resolve sporttery teamId through data/crests.json + data/squads/_idmap.json.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { posZh, natZh, heightCm, statusZh } = require('./i18n-football');
const { zhLabel } = require('./wikidata-zh');

const KEY = process.env.THESPORTSDB_KEY || '123';
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const AF_BASE = 'https://v3.football.api-sports.io';
const DATA_DIR = () => require('./db').DATA_DIR;
const SPARSE_MAX = 12; // treat TSDB rosters shorter than this as incomplete → AF fallback

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}
function crests() { return readJson(path.join(__dirname, '..', 'data', 'crests.json'), { teams: {} }); }
function idmapPath() { return path.join(DATA_DIR(), 'squads', '_idmap.json'); }
function idmap() { return readJson(idmapPath(), {}); }
function afmapPath() { return path.join(DATA_DIR(), 'squads', '_afmap.json'); }
function afmap() { return readJson(afmapPath(), {}); }

const mem = new Map();
const TTL = 6 * 3600 * 1000;

/** sporttery → API-Football team id (fallback only). */
const AF_TEAM_BY_SPORTTERY = {
  '1': 42, '13': 33, '123': 505, '137': 157, '172': 530,
  '179': 116, '180': 79, '181': 80, '182': 81, '184': 91, '186': 84,
  '225': 569, '250': 197, '283': 645, '401': 529, '679': 533, '744': 492,
  '969': 830, '1060': 228, '1619': 173, '2216': 836,
};

const ZH_TO_EN = {
  '里尔': 'Lille', '里昂': 'Lyon', '马赛': 'Marseille', '摩纳哥': 'Monaco', '尼斯': 'Nice', '朗斯': 'Lens',
  '巴萨': 'Barcelona', '巴塞罗那': 'Barcelona', '加拉塔萨': 'Galatasaray', '加拉塔萨雷': 'Galatasaray',
  '北京国安': 'Beijing Guoan', '国安': 'Beijing Guoan', '上海海港': 'Shanghai Port', '海港': 'Shanghai Port',
  '国际米兰': 'Inter Milan', '国米': 'Inter Milan', '阿森纳': 'Arsenal', '拜仁': 'Bayern Munich',
  '布鲁日': 'Club Brugge', '那不勒斯': 'Napoli', '马竞': 'Atletico Madrid', '曼联': 'Manchester United',
  '埃因霍温': 'PSV Eindhoven', '莱红牛': 'RB Leipzig', '比利亚雷': 'Villarreal',
};

function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').split(/\s+/).filter((w) => w.length > 1);
}
function nameSimilarity(a, b) {
  const ta = new Set(tokens(a)), tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
function isBadMatch(wanted, got) {
  if (!wanted || !got) return true;
  if (wanted.toLowerCase() === got.toLowerCase()) return false;
  if (got.toLowerCase().includes(wanted.toLowerCase()) || wanted.toLowerCase().includes(got.toLowerCase())) return false;
  return nameSimilarity(wanted, got) < 0.34;
}
async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'JingcaiPredict/1.8 (squad)' } });
  const text = await r.text();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (text.trim().startsWith('<')) throw new Error('rate_limited');
  return JSON.parse(text);
}

function afKey() {
  const k = process.env.API_FOOTBALL_KEY;
  return (k && String(k).trim()) || '';
}

async function afFetch(apiPath) {
  const key = afKey();
  if (!key) throw new Error('no_af_key');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(AF_BASE + apiPath, {
      headers: { 'x-apisports-key': key, 'User-Agent': 'JingcaiPredict/1.8 (squad-af)' },
      signal: ac.signal,
    });
    const j = await r.json();
    if (j.errors && Object.keys(j.errors).length) {
      const msg = JSON.stringify(j.errors);
      if (/rateLimit|rate limit|suspended|access/i.test(msg)) throw new Error('af_unavailable');
      throw new Error('af_error ' + msg);
    }
    return j.response || [];
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('af_timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function variants(en) {
  const v = new Set();
  if (!en) return [];
  v.add(en);
  v.add(en.replace(/-/g, ' '));
  const parts = en.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    v.add(parts[0] + ' ' + parts[parts.length - 1]);
    v.add(parts.slice(0, 2).join(' '));
  }
  if (/KFUM/i.test(en)) v.add('KFUM Oslo');
  if (/St\.?\s*Louis\s*City/i.test(en)) { v.add('STL'); v.add('St Louis City'); v.add('St. Louis City SC'); }
  // TheSportsDB: bare "Lille" → Field Hockey only; soccer needs "Lille OSC"
  if (/^Lille$/i.test(en)) { v.add('Lille OSC'); v.add('LOSC Lille'); }
  if (/Shanghai\s*SIPG|SHANGHAI\s*SIPG/i.test(en)) { v.add('Shanghai Port'); v.add('Shanghai SIPG'); }
  if (/Paris\s*SG|^PSG$/i.test(en)) { v.add('Paris Saint Germain'); v.add('Paris Saint-Germain'); }
  if (/Beijing\s*Guoan|^Guoan$/i.test(en)) v.add('Beijing Guoan');
  if (/^Monaco$/i.test(en)) v.add('AS Monaco');
  if (/^Lyon$/i.test(en)) v.add('Olympique Lyonnais');
  if (/^Marseille$/i.test(en)) v.add('Olympique Marseille');
  if (/^Galatasaray$/i.test(en)) { v.add('Galatasaray SK'); }
  return [...v];
}

function enFromName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (ZH_TO_EN[n]) return ZH_TO_EN[n];
  for (const [zh, en] of Object.entries(ZH_TO_EN)) {
    if (n.includes(zh) || zh.includes(n)) return en;
  }
  if (/[a-zA-Z]{3,}/.test(n) && !/[\u4e00-\u9fff]/.test(n)) return n;
  return '';
}

async function searchSoccer(q) {
  const j = await fetchJson(BASE + '/searchteams.php?t=' + encodeURIComponent(q));
  return (j.teams || []).filter((t) => t.strSport === 'Soccer');
}

async function resolveByEn(en) {
  for (const q of variants(en)) {
    let soccer;
    try { soccer = await searchSoccer(q); } catch (e) {
      if (String(e.message).includes('rate')) throw e;
      continue;
    }
    if (!soccer.length) continue;
    const ql = q.toLowerCase();
    const el = en.toLowerCase();
    return (
      soccer.find((t) => t.strTeam.toLowerCase() === el) ||
      soccer.find((t) => t.strTeam.toLowerCase() === ql) ||
      soccer.find((t) => t.strTeam.toLowerCase().includes(ql) || ql.includes(t.strTeam.toLowerCase())) ||
      soccer[0]
    );
  }
  return null;
}

async function resolveTeam(teamId, nameZh) {
  const id = String(teamId || '');
  const map = idmap();
  let en = (id && crests().teams?.[id]?.en) || '';
  if (!en) en = enFromName(nameZh) || '';
  if (id && map[id]?.idTeam) {
    if (!en || !isBadMatch(en, map[id].strTeam)) return map[id];
    delete map[id];
  }
  if (!en) return null;
  const pick = await resolveByEn(en);
  if (!pick || isBadMatch(en, pick.strTeam)) return null;
  const resolved = { idTeam: String(pick.idTeam), strTeam: pick.strTeam, strLeague: pick.strLeague || '' };
  if (id) {
    map[id] = resolved;
    try { writeJson(idmapPath(), map); } catch {}
  }
  return resolved;
}

function normalizePlayer(p) {
  const photo = p.strCutout || p.strThumb || p.strRender || '';
  const position = p.strPosition || '';
  const nationality = p.strNationality || '';
  const role = /manager|coach/i.test(position) ? 'staff' : 'player';
  return {
    id: String(p.idPlayer || ''),
    name: p.strPlayer || '',
    nameAlt: p.strPlayerAlternate || '',
    number: p.strNumber || '',
    position,
    positionZh: posZh(position),
    nationality,
    nationalityZh: natZh(nationality),
    height: heightCm(p.strHeight || ''),
    heightRaw: p.strHeight || '',
    born: p.dateBorn || '',
    photo: photo && /^https?:\/\//.test(photo) ? photo : '',
    role,
  };
}

function normalizeAfPlayer(p) {
  const position = p.position || '';
  return {
    id: p.id != null ? 'af:' + p.id : '',
    name: p.name || '',
    nameAlt: '',
    number: p.number != null ? String(p.number) : '',
    position,
    positionZh: posZh(position),
    nationality: '',
    nationalityZh: '',
    height: '',
    heightRaw: '',
    born: '',
    photo: p.photo && /^https?:\/\//.test(p.photo) ? p.photo : '',
    role: 'player',
    afId: p.id != null ? String(p.id) : '',
  };
}

function nameZhMap() {
  return readJson(path.join(DATA_DIR(), 'squads', '_namezh.json'), {});
}

function foldName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function lookupNameZh(nameMap, pl) {
  if (!pl) return '';
  const tryKeys = [];
  if (pl.id) tryKeys.push(pl.id);
  if (pl.afId) tryKeys.push('af:' + pl.afId, pl.afId);
  if (pl.name) tryKeys.push(pl.name);
  if (pl.nameAlt) tryKeys.push(pl.nameAlt);
  for (const k of tryKeys) {
    const zh = nameMap[k];
    if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  }
  // Accent-insensitive full-name match (Gonçalo Ramos → Goncalo Ramos)
  const foldedTries = tryKeys.map(foldName).filter(Boolean);
  if (foldedTries.length) {
    for (const [en, zh] of Object.entries(nameMap)) {
      if (!zh || !/[\u4e00-\u9fff]/.test(zh) || /^\d+$/.test(en) || en.startsWith('af:')) continue;
      if (foldedTries.includes(foldName(en))) return zh;
    }
  }
  // Surname match only for abbreviated names ("D. Livaković") or exact surname keys.
  // Never map "Ethan Mbappé" → Kylian via shared surname.
  const raw = String(pl.name || '').trim();
  if (!raw) return '';
  const parts = raw.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  const sur = parts.length ? parts[parts.length - 1] : '';
  if (!sur || sur.length <= 2) return '';
  const surL = sur.toLowerCase();
  const first = parts.length >= 2 ? parts[0] : '';
  const abbreviated = parts.length >= 2 && first.length <= 2;
  const singleToken = parts.length === 1;
  if (!abbreviated && !singleToken) return '';
  let best = null;
  for (const [en, zh] of Object.entries(nameMap)) {
    if (!zh || !/[\u4e00-\u9fff]/.test(zh) || /^\d+$/.test(en) || en.startsWith('af:')) continue;
    const el = en.toLowerCase();
    const enParts = el.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (el === surL) {
      if (!best || en.length > best.enLength) best = { zh, enLength: en.length };
      continue;
    }
    if (abbreviated && enParts.length >= 2 && enParts[enParts.length - 1] === surL) {
      const enFirst = enParts[0];
      if (enFirst[0] === first[0].toLowerCase() || first.length === 1) {
        if (!best || en.length > best.enLength) best = { zh, enLength: en.length };
      }
    }
  }
  return best ? best.zh : '';
}

/** Apply precomputed Chinese names onto players (id / English name / alt / surname). Mutates + returns. */
function applyNameZh(players) {
  const nameMap = nameZhMap();
  for (const pl of players || []) {
    if (pl.nameZh && /[\u4e00-\u9fff]/.test(pl.nameZh) && pl.nameZhSrc !== 'auto') continue;
    const zh = lookupNameZh(nameMap, pl);
    if (zh) { pl.nameZh = zh; delete pl.nameZhSrc; }
  }
  // 1.9.6: auto transliteration / Wikidata for the rest (flagged nameZhSrc)
  try { require('./name-auto').fillAuto(players); } catch {}
  return players;
}

function positionOrder(pos) {
  const p = String(pos || '').toLowerCase();
  if (p.includes('goal')) return 0;
  if (p.includes('def') || p.includes('back')) return 1;
  if (p.includes('mid')) return 2;
  if (p.includes('wing') || p.includes('forward') || p.includes('attack') || p.includes('striker')) return 3;
  return 4;
}

async function enrichPlayerNames(players, teamName) {
  const mapFile = path.join(DATA_DIR(), 'squads', '_namezh.json');
  const map = readJson(mapFile, {});
  applyNameZh(players);
  const out = [];
  for (const pl of players) {
    if (pl.nameZh && /[\u4e00-\u9fff]/.test(pl.nameZh)) continue;
    out.push(pl);
  }
  const queue = out.slice(0, 25);
  let i = 0;
  async function worker() {
    while (i < queue.length) {
      const pl = queue[i++];
      try {
        const zh = await Promise.race([
          zhLabel(pl.name, { alt: pl.nameAlt, team: teamName || '' }),
          new Promise((r) => setTimeout(() => r(''), 3500)),
        ]);
        if (zh) {
          pl.nameZh = zh;
          if (pl.id) map[pl.id] = zh;
          if (pl.name) map[pl.name] = zh;
          if (pl.nameAlt) map[pl.nameAlt] = zh;
        }
      } catch {}
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  try { writeJson(mapFile, map); } catch {}
  return players;
}

function resolveAfTeamId(teamId, nameEn) {
  const id = String(teamId || '');
  const cached = afmap();
  if (id && cached[id]?.afId) return Number(cached[id].afId);
  if (id && AF_TEAM_BY_SPORTTERY[id]) return AF_TEAM_BY_SPORTTERY[id];
  return null;
}

async function loadSquadFromAf({ teamId, name, nameEn }) {
  const afId = resolveAfTeamId(teamId, nameEn);
  if (!afId || !afKey()) return null;
  const cacheFile = path.join(DATA_DIR(), 'squads', 'af-' + afId + '.json');
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < TTL) {
      applyNameZh(cached.players || []);
      return cached;
    }
  } catch {}

  let rows;
  try {
    rows = await afFetch('/players/squads?team=' + encodeURIComponent(afId));
  } catch (e) {
    return { ok: false, error: 'af_fail', detail: e.message, players: [] };
  }
  const row = rows[0] || null;
  const players = ((row && row.players) || []).map(normalizeAfPlayer).filter((p) => p.name)
    .sort((a, b) => positionOrder(a.position) - positionOrder(b.position) || Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  applyNameZh(players);
  const teamName = (row && row.team && row.team.name) || nameEn || name || '';
  const payload = {
    ok: players.length > 0,
    teamId: String(teamId || ''),
    nameZh: name || '',
    nameEn: teamName,
    league: '',
    sportsDbId: '',
    afTeamId: String(afId),
    players,
    playerCount: players.length,
    withPhoto: players.filter((p) => p.photo).length,
    source: 'api-football',
    noteZh: '阵容来自 API-Football（TheSportsDB 名单不全时回退）；可能含青年队球员。',
    error: players.length ? undefined : '球员库返回空名单',
    fetchedAt: new Date().toISOString(),
  };
  try {
    writeJson(cacheFile, payload);
    if (teamId) {
      const m = afmap();
      m[String(teamId)] = { afId: String(afId), name: teamName };
      writeJson(afmapPath(), m);
    }
  } catch {}
  return payload;
}

function espnToPlayer(a) {
  const position = a.position || '';
  const nationality = a.citizenship || '';
  return {
    id: 'espn:' + a.id,
    name: a.name,
    nameAlt: '',
    number: a.jersey || '',
    position,
    positionZh: posZh(position),
    nationality,
    nationalityZh: natZh(nationality),
    height: a.heightIn ? String(Math.round(a.heightIn * 2.54)) : '',
    heightRaw: a.heightIn ? a.heightIn + ' in' : '',
    born: a.dob || '',
    age: a.age || '',
    photo: a.headshot && /^https?:\/\//.test(a.headshot) ? a.headshot : '',
    role: 'player',
    espnId: a.id,
    apps: a.apps, goals: a.goals, assists: a.assists,
    injured: a.injured || false,
  };
}

async function loadSquadFromEspn({ teamId, name }) {
  let espn, cands;
  try {
    espn = require('./espn-form');
    cands = require('./match-stats').espnCandidates(teamId, name);
  } catch { return null; }
  const r = await espn.fetchRoster({ sportteryTeamId: teamId, candidates: cands });
  if (!r || !r.athletes || !r.athletes.length) return null;
  const players = r.athletes.map(espnToPlayer)
    .sort((a, b) => positionOrder(a.position) - positionOrder(b.position) || Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  // reuse zh names already learned for the same player name (TSDB/AF ids differ)
  applyNameZh(players);
  return {
    ok: true,
    teamId: String(teamId || ''),
    nameZh: name || '',
    nameEn: r.team.name || '',
    league: r.team.league || '',
    espnTeamId: r.team.id,
    season: r.season || '',
    coach: r.coach || '',
    players,
    playerCount: players.length,
    withPhoto: players.filter((p) => p.photo).length,
    source: 'espn',
    noteZh: `阵容来自 ESPN 公开名单${r.season ? '（' + r.season + '）' : ''}，含本赛季出场/进球/助攻；中文名有则显示。`,
    fetchedAt: new Date(r.at || Date.now()).toISOString(),
  };
}

async function loadSquad({ teamId, name } = {}) {
  // 1.9.3: ESPN roster first (fuller, current); fall back to TSDB/AF below
  {
    const k0 = 'espn|' + String(teamId || name || '');
    const h0 = mem.get(k0);
    if (h0 && Date.now() - h0.at < TTL) { applyNameZh(h0.payload.players || []); return h0.payload; }
    try {
      const es = await loadSquadFromEspn({ teamId, name });
      if (es && es.players.length >= SPARSE_MAX) { mem.set(k0, { at: Date.now(), payload: es }); return es; }
    } catch (e) { console.warn('squad espn', teamId, e.message); }
  }
  return loadSquadLegacy({ teamId, name });
}

async function loadSquadLegacy({ teamId, name } = {}) {
  const id = String(teamId || '');
  const key = id || String(name || '');
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    applyNameZh(hit.payload.players || []);
    return hit.payload;
  }

  const file = path.join(DATA_DIR(), 'squads', crypto.createHash('sha1').update(key || 'x').digest('hex') + '.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < TTL) {
      applyNameZh(cached.players || []);
      // If cached failure or sparse TSDB and AF available, try AF (also cached separately)
      if ((!cached.ok || (cached.players || []).length < SPARSE_MAX) && cached.source !== 'api-football') {
        const af = await loadSquadFromAf({ teamId: id, name, nameEn: cached.nameEn });
        if (af && af.ok && (af.players || []).length > (cached.players || []).length) {
          mem.set(key, { at: Date.now(), payload: af });
          return af;
        }
      }
      mem.set(key, { at: Date.now(), payload: cached });
      return cached;
    }
  } catch {}

  if (!id && !name) {
    const payload = { ok: false, error: '无球队 ID', players: [], fetchedAt: new Date().toISOString() };
    mem.set(key, { at: Date.now(), payload });
    return payload;
  }

  let resolved;
  try {
    resolved = await resolveTeam(id, name);
  } catch (e) {
    // try AF before giving up on rate limit
    const af = await loadSquadFromAf({ teamId: id, name, nameEn: enFromName(name) || (crests().teams?.[id]?.en) });
    if (af && af.ok) {
      mem.set(key, { at: Date.now(), payload: af });
      return af;
    }
    return { ok: false, teamId: id, nameZh: name || '', error: '球员库暂时限流，请稍后重试', players: [], detail: e.message, fetchedAt: new Date().toISOString() };
  }

  const en = (id && crests().teams?.[id]?.en) || enFromName(name) || '';
  if (!resolved) {
    const af = await loadSquadFromAf({ teamId: id, name, nameEn: en });
    if (af && af.ok) {
      mem.set(key, { at: Date.now(), payload: af });
      return af;
    }
    const payload = {
      ok: false,
      teamId: id,
      nameZh: name || '',
      nameEn: en || '',
      error: id ? '球员库暂无该队完整阵容' : '缺少球队 ID（请更新服务器后重试）',
      players: [],
      source: 'thesportsdb',
      fetchedAt: new Date().toISOString(),
    };
    mem.set(key, { at: Date.now(), payload });
    return payload;
  }

  let players = [];
  try {
    const j = await fetchJson(BASE + '/lookup_all_players.php?id=' + resolved.idTeam);
    players = (j.player || []).map(normalizePlayer).filter((p) => p.name && p.role !== 'staff')
      .sort((a, b) => positionOrder(a.position) - positionOrder(b.position) || Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  } catch (e) {
    const af = await loadSquadFromAf({ teamId: id, name, nameEn: resolved.strTeam || en });
    if (af && af.ok) {
      mem.set(key, { at: Date.now(), payload: af });
      return af;
    }
    return { ok: false, teamId: id, nameZh: name || '', error: '球员库暂时限流，请稍后重试', players: [], detail: e.message, fetchedAt: new Date().toISOString() };
  }

  applyNameZh(players);

  // Sparse / empty TheSportsDB roster → API-Football fallback (cached)
  if (players.length < SPARSE_MAX) {
    const af = await loadSquadFromAf({ teamId: id, name, nameEn: resolved.strTeam || en });
    if (af && af.ok && (af.players || []).length > players.length) {
      mem.set(key, { at: Date.now(), payload: af });
      return af;
    }
  }

  const payload = {
    ok: players.length > 0,
    teamId: id,
    nameZh: name || '',
    nameEn: resolved.strTeam || en || '',
    league: resolved.strLeague || '',
    sportsDbId: resolved.idTeam,
    players,
    playerCount: players.length,
    withPhoto: players.filter((p) => p.photo).length,
    source: 'thesportsdb',
    noteZh: '阵容来自 TheSportsDB，名单可能不全；暂无赛季进球/助攻。',
    error: players.length ? undefined : '球员库返回空名单',
    fetchedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
  } catch {}
  mem.set(key, { at: Date.now(), payload });
  return payload;
}

async function loadPlayer(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return { ok: false, error: '缺少球员 ID' };
  if (id.startsWith('espn:')) {
    const hit = require('./espn-form').findRosterPlayer(id.slice(5));
    if (!hit) return { ok: false, error: '未找到该球员（名单缓存已过期，请返回阵容页刷新）' };
    const base = espnToPlayer(hit.athlete);
    let nameZh = lookupNameZh(nameZhMap(), base) || '';
    let nameZhSrc;
    if (!nameZh) { try { const r = require('./name-auto').autoZh(base.name, { nat: base.nationality, team: (hit.team && hit.team.name) || '' }); if (r) { nameZh = r.zh; nameZhSrc = r.src; } } catch {} }
    return {
      ok: true, ...base, nameZhSrc, team: (hit.team && hit.team.name) || '', team2: '', gender: '', status: '',
      birthLocation: '', description: '', descriptionLang: '', thumb: base.photo, cutout: '', render: '',
      source: 'espn', nameZh, statusZh: base.injured ? '伤病' : '',
      noteZh: `数据来自 ESPN 公开名单：本赛季出场 ${base.apps ?? '-'}、进球 ${base.goals ?? '-'}、助攻 ${base.assists ?? '-'}。`,
      fetchedAt: new Date().toISOString(),
    };
  }
  // AF-sourced players: no TheSportsDB detail; return minimal card with namezh
  if (id.startsWith('af:')) {
    const nameMap = nameZhMap();
    const zh = nameMap[id] || '';
    return {
      ok: true,
      id,
      name: '',
      nameZh: zh,
      source: 'api-football',
      noteZh: '该球员来自 API-Football 阵容回退，详情有限。',
      fetchedAt: new Date().toISOString(),
    };
  }
  const file = path.join(DATA_DIR(), 'squads', 'player-' + id + '.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < TTL) {
      if (!cached.nameZh || cached.nameZhSrc === 'auto') {
        const zh = lookupNameZh(nameZhMap(), cached);
        if (zh) cached.nameZh = zh;
      }
      return cached;
    }
  } catch {}
  const j = await fetchJson(BASE + '/lookupplayer.php?id=' + encodeURIComponent(id));
  const p = (j.players || [])[0];
  if (!p) return { ok: false, error: '未找到该球员', fetchedAt: new Date().toISOString() };
  const base = normalizePlayer(p);
  const nameMap = nameZhMap();
  let nameZh = lookupNameZh(nameMap, base) || '';
  if (!nameZh) {
    nameZh = await Promise.race([
      zhLabel(base.name, { alt: base.nameAlt, team: p.strTeam || '' }),
      new Promise((r) => setTimeout(() => r(''), 4000)),
    ]);
    if (nameZh) {
      if (base.id) nameMap[base.id] = nameZh;
      if (base.name) nameMap[base.name] = nameZh;
      try { writeJson(path.join(DATA_DIR(), 'squads', '_namezh.json'), nameMap); } catch {}
    }
  }
  let nameZhSrc;
  if (!nameZh) { try { const r = require('./name-auto').autoZh(base.name, { nat: base.nationality, team: p.strTeam || '' }); if (r) { nameZh = r.zh; nameZhSrc = r.src; } } catch {} }
  const payload = {
    ok: true,
    ...base,
    nameZhSrc,
    team: p.strTeam || '',
    team2: p.strTeam2 || '',
    gender: p.strGender || '',
    status: p.strStatus || '',
    birthLocation: p.strBirthLocation || '',
    description: p.strDescriptionCN || p.strDescriptionEN || '',
    descriptionLang: p.strDescriptionCN ? 'zh' : (p.strDescriptionEN ? 'en' : ''),
    thumb: p.strThumb || '',
    cutout: p.strCutout || '',
    render: p.strRender || '',
    source: 'thesportsdb',
    nameZh,
    statusZh: statusZh(p.strStatus || ''),
    noteZh: '有维基中文译名则显示中文名，否则保留原文；位置与国籍已本地化。',
    fetchedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload));
  } catch {}
  return payload;
}

function clearSquadMem() { mem.clear(); }

module.exports = { loadSquadLegacy, loadSquadFromEspn, loadSquad, loadPlayer, enrichPlayerNames, applyNameZh, nameZhMap, clearSquadMem, lookupNameZh };
