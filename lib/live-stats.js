// API-Football live pitch stats proxy. Key stays server-side (process.env.API_FOOTBALL_KEY).
// Free plan: 100 req/day + tight per-minute limit — cache fixture maps forever and stats ~25s.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const BASE = 'https://v3.football.api-sports.io';
const STATS_TTL_MS = 25 * 1000;
const DAY_TTL_MS = 10 * 60 * 1000; // day fixture list
const MAP_DIR = () => path.join(DATA_DIR, 'live-stats');
const MAP_FILE = () => path.join(MAP_DIR(), 'fixture-map.json');
const TEAM_FILE = () => path.join(MAP_DIR(), 'team-id-cache.json');

const dayCache = new Map(); // date -> { at, list }
const statsCache = new Map(); // fixtureId -> { at, payload }
const eventsCache = new Map(); // fixtureId -> { at, events }
const inflight = new Map();
let lastQuota = { remaining: null, limit: null, at: 0 };
const EVENTS_TTL_LIVE_MS = 45 * 1000;
const EVENTS_TTL_IDLE_MS = 10 * 60 * 1000;

function apiKey() {
  const k = process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY;
  return (k && String(k).trim()) || '';
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function loadMap() { return readJson(MAP_FILE(), {}); }
function saveMap(m) { try { writeJson(MAP_FILE(), m); } catch (e) { console.warn('live-stats map write failed', e.message); } }
function loadTeamCache() { return readJson(TEAM_FILE(), {}); }
function saveTeamCache(m) { try { writeJson(TEAM_FILE(), m); } catch (e) { console.warn('live-stats team cache write failed', e.message); } }

function crestsEn(teamId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const row = j.teams && j.teams[String(teamId)];
    return (row && row.en) || '';
  } catch { return ''; }
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function isYouthSide(name) {
  return /\b(u1[89]|u2[013]|u23|youth|women| ladies|\bw\b|women's|reserva|ii|b\b)\b/i.test(String(name || ''))
    || /U\d{2}\b/.test(String(name || ''))
    || /\sW$/.test(String(name || ''));
}

/**
 * Token aliases for AF vs crest/sporttery spelling drift (transliteration,
 * abbreviations, German/Greek orthography). Applied after normName.
 * Homonym-safe: only swap known equivalent spellings of the SAME club token,
 * never map short names onto unrelated clubs (Olympia≠Olympiacos handled by AF id).
 */
const TOKEN_ALIASES = {
  olympiacos: 'olympiakos',
  olympiakos: 'olympiakos',
  munich: 'munchen',
  muenchen: 'munchen',
  munchen: 'munchen',
  saint: 'st',
  st: 'st',
  ste: 'st',
  gilloise: 'gilloise',
  // Besiktas already NFD-stripped; keep identity
  inter: 'inter',
  internazionale: 'inter',
  man: 'manchester',
  manchester: 'manchester',
  utd: 'united',
  athletic: 'athletic',
  athletico: 'atletico',
  atletico: 'atletico',
  sporting: 'sporting',
};

/** Drop low-signal club suffixes that AF appends (Piraeus, Linz city, etc.). */
const SKIP_TOKENS = new Set([
  'fc', 'cf', 'afc', 'sc', 'ac', 'as', 'calcio', 'club', 'de', 'the', 'hotspur',
  'piraeus', 'fk', 'sk', 'bk', 'if', 'city',
]);

function expandToken(tok) {
  const t = TOKEN_ALIASES[tok] || tok;
  return t;
}

function nameTokens(s) {
  const n = normName(s);
  if (!n) return new Set();
  // Prefer latin tokens when mixed CJK+latin (e.g. "LASK林茨" → lask)
  const latin = n.replace(/[\u4e00-\u9fff]+/g, ' ').replace(/\s+/g, ' ').trim();
  const base = latin.length >= 2 ? latin : n;
  const out = new Set();
  for (const raw of base.split(' ').filter(Boolean)) {
    if (raw.length < 2) continue;
    if (SKIP_TOKENS.has(raw)) continue;
    out.add(expandToken(raw));
  }
  return out;
}

function nameScore(wanted, got) {
  const a = normName(wanted), b = normName(got);
  if (!a || !b) return 0;
  if (a === b) return 1;
  // prefer full club over youth/women when query looks like first team
  if (!isYouthSide(wanted) && isYouthSide(got)) return 0;
  // 1.9.96: substring only at word boundaries ("aek" must not match "stabaek")
  const wb = (hay, needle) => (' ' + hay + ' ').includes(' ' + needle + ' ');
  if (wb(a, b) || wb(b, a)) return 0.88;
  const ta = nameTokens(wanted);
  const tb = nameTokens(got);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const jacc = inter / Math.max(ta.size, tb.size);
  // "Roma" ↔ "AS Roma", "Marseille" ↔ "Olympique Marseille"
  if (inter >= 1 && (ta.size === 1 || tb.size === 1) && (wb(a, b) || wb(b, a) || jacc >= 0.4)) return 0.8;
  // Alias-equal short names: Olympiacos↔Olympiakos Piraeus (tokens {olympiakos} ⊆ {olympiakos})
  if (inter >= 1 && (ta.size === 1 || tb.size === 1) && jacc >= 0.45) return 0.86;
  // Union Saint-Gilloise ↔ Union St. Gilloise after saint→st
  if (jacc >= 0.66) return Math.max(jacc, 0.82);
  return jacc >= 0.5 ? jacc : 0;
}

/** Major football nations — used to break ties when short names collide (Roma Slovenia vs AS Roma). */
const AF_MAJOR_COUNTRIES = new Set([
  'England', 'Spain', 'Italy', 'Germany', 'France', 'Portugal', 'Netherlands',
  'Belgium', 'Turkey', 'Scotland', 'Brazil', 'Argentina', 'Saudi-Arabia', 'Saudi Arabia',
  'Japan', 'Korea Republic', 'China', 'USA', 'Mexico', 'Austria', 'Switzerland',
  'Denmark', 'Sweden', 'Norway', 'Greece', 'Ukraine', 'Russia', 'Croatia', 'Serbia',
  'Poland', 'Czech-Republic', 'Czech Republic', 'Romania', 'Hungary', 'Wales', 'Ireland',
]);

/**
 * Quality-adjusted score so bare homonyms (no code/founded, obscure country)
 * lose to well-known clubs like "AS Roma" when query is just "Roma".
 */
function teamPickScore(wanted, team) {
  if (!team || !team.name) return 0;
  let sc = nameScore(wanted, team.name);
  if (sc <= 0) return 0;
  const hasMeta = !!(team.code || team.founded);
  const major = AF_MAJOR_COUNTRIES.has(String(team.country || ''));
  // Exact short-name shell (e.g. Slovenian "Roma") loses to "AS Roma" (0.88 + boosts).
  if (sc >= 0.999 && !hasMeta) sc -= 0.18;
  if (hasMeta) sc += 0.06;
  if (major) sc += 0.08;
  if (team.national) sc -= 0.25;
  return sc;
}

async function afFetch(apiPath) {
  const key = apiKey();
  if (!key) throw new Error('no_key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
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
      e.code = 'upstream';
      throw e;
    }
    return j.response || [];
  } finally { clearTimeout(t); }
}

function utcDatesForKickoff(dateBj, timeBj, businessDate) {
  // sporttery date/time are Beijing (+08). Convert to UTC calendar date(s) to search.
  const dates = new Set();
  const add = (d) => { if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) dates.add(d); };
  if (!dateBj || !/^\d{4}-\d{2}-\d{2}$/.test(dateBj)) {
    const now = new Date();
    dates.add(now.toISOString().slice(0, 10));
    const y = new Date(now.getTime() - 86400e3);
    dates.add(y.toISOString().slice(0, 10));
    add(businessDate);
    return [...dates];
  }
  const hm = String(timeBj || '12:00').slice(0, 5);
  const ms = new Date(`${dateBj}T${hm}:00+08:00`).getTime();
  if (Number.isNaN(ms)) {
    add(dateBj);
    add(businessDate);
    return [...dates];
  }
  const d0 = new Date(ms).toISOString().slice(0, 10);
  dates.add(d0);
  // also neighbouring UTC days in case of timezone edge
  dates.add(new Date(ms - 12 * 3600e3).toISOString().slice(0, 10));
  dates.add(new Date(ms + 12 * 3600e3).toISOString().slice(0, 10));
  // 竞彩 businessDate (sales day) often equals UTC kickoff date for late-night EU slots
  add(businessDate);
  // When kickoff time unknown, also probe dateBj-1 (Europa ~03:00 BJT next calendar day)
  if (!timeBj || timeBj === '12:00') {
    const prev = new Date(ms - 24 * 3600e3).toISOString().slice(0, 10);
    dates.add(prev);
  }
  return [...dates];
}

async function fixturesForDate(date) {
  const hit = dayCache.get(date);
  if (hit && Date.now() - hit.at < DAY_TTL_MS) return hit.list;
  let job = inflight.get('day:' + date);
  if (!job) {
    job = (async () => {
      const list = await afFetch('/fixtures?date=' + encodeURIComponent(date));
      dayCache.set(date, { at: Date.now(), list });
      return list;
    })().finally(() => inflight.delete('day:' + date));
    inflight.set('day:' + date, job);
  }
  return job;
}

function pickFixture(list, homeEn, awayEn, kickoffMs, homeAfId, awayAfId) {
  const hid = homeAfId != null && Number(homeAfId) > 0 ? Number(homeAfId) : null;
  const aid = awayAfId != null && Number(awayAfId) > 0 ? Number(awayAfId) : null;

  // Preferred path: both AF team ids known — ignore spelling (Olympiacos↔Olympiakos).
  if (hid && aid) {
    let best = null, bestDt = Infinity;
    for (const row of list || []) {
      const th = row.teams && row.teams.home && row.teams.home.id;
      const ta = row.teams && row.teams.away && row.teams.away.id;
      if (Number(th) !== hid || Number(ta) !== aid) continue;
      // Skip youth fixtures when ids somehow collide (shouldn't for first-team ids)
      const hn = row.teams.home.name, an = row.teams.away.name;
      if ((isYouthSide(hn) || isYouthSide(an)) && !isYouthSide(homeEn) && !isYouthSide(awayEn)) continue;
      let dt = 0;
      if (kickoffMs && row.fixture && row.fixture.timestamp) {
        dt = Math.abs(row.fixture.timestamp * 1000 - kickoffMs);
      }
      if (!best || dt < bestDt) { best = row; bestDt = dt; }
    }
    if (best) return best;
  }

  let best = null, bestScore = 0;
  for (const row of list || []) {
    const h = row.teams && row.teams.home && row.teams.home.name;
    const a = row.teams && row.teams.away && row.teams.away.name;
    const th = row.teams && row.teams.home && row.teams.home.id;
    const ta = row.teams && row.teams.away && row.teams.away.id;
    // One-sided id boost when only one AF id known
    let hs = nameScore(homeEn, h);
    let as_ = nameScore(awayEn, a);
    if (hid && Number(th) === hid) hs = Math.max(hs, 0.95);
    if (aid && Number(ta) === aid) as_ = Math.max(as_, 0.95);
    if (hs < 0.75 || as_ < 0.75) continue;
    let s = hs + as_;
    if (kickoffMs && row.fixture && row.fixture.timestamp) {
      const dt = Math.abs(row.fixture.timestamp * 1000 - kickoffMs);
      if (dt < 3 * 3600e3) s += 0.3;
      else if (dt < 12 * 3600e3) s += 0.1;
      else s -= 0.2;
    }
    if (s > bestScore) { bestScore = s; best = row; }
  }
  if (bestScore >= 1.5) return best;

  // 1.9.96: one-sided anchor — one team matches strongly (AF id or exact-ish name) and the
  // kickoff is within 2h; accept only if exactly one senior fixture fits (avoids guessing).
  if (!kickoffMs) return null;
  const cands = [];
  for (const row of list || []) {
    const th = row.teams && row.teams.home, ta = row.teams && row.teams.away;
    if (!th || !ta || !row.fixture || !row.fixture.timestamp) continue;
    if ((isYouthSide(th.name) || isYouthSide(ta.name)) && !isYouthSide(homeEn) && !isYouthSide(awayEn)) continue;
    if (Math.abs(row.fixture.timestamp * 1000 - kickoffMs) > 2 * 3600e3) continue;
    const hOk = (hid && Number(th.id) === hid) || nameScore(homeEn, th.name) >= 0.88;
    const aOk = (aid && Number(ta.id) === aid) || nameScore(awayEn, ta.name) >= 0.88;
    // a wrongly-known id on the other side must not veto, but a strong contradiction (the
    // other side clearly another known club) is not checked here — uniqueness guards it.
    if (hOk || aOk) cands.push(row);
  }
  return cands.length === 1 ? cands[0] : null;
}

function mapKey({ matchId, homeTeamId, awayTeamId, date }) {
  if (matchId) return 'm:' + String(matchId);
  if (homeTeamId && awayTeamId && date) return `t:${homeTeamId}|${awayTeamId}|${date}`;
  return '';
}

function crestAfTeamId(teamId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const row = j.teams && j.teams[String(teamId)];
    const id = row && row.afTeamId != null ? Number(row.afTeamId) : 0;
    return id > 0 ? id : null;
  } catch { return null; }
}

/**
 * Resolve AF team id from local sources only (no network):
 * crests.afTeamId → AF_TEAM_SEED → team-id-cache.
 * Used by fixture mapping so Olympiacos/Fenerbahçe spelling never blocks a hit.
 */
function localAfTeamId(sportteryTeamId, nameEn) {
  const sid = String(sportteryTeamId || '');
  if (sid) {
    const fromCrest = crestAfTeamId(sid);
    if (fromCrest) return fromCrest;
    try {
      const seed = require('./match-stats').AF_TEAM_SEED;
      if (seed && seed[sid]) return Number(seed[sid]);
    } catch (_) {}
    const cache = loadTeamCache();
    const hit = cache['s:' + sid];
    if (hit && hit.afTeamId) return Number(hit.afTeamId);
  }
  const q = normName(nameEn || '');
  if (q) {
    const cache = loadTeamCache();
    const hit = cache['n:' + q];
    if (hit && hit.afTeamId) return Number(hit.afTeamId);
  }
  return null;
}

function zhEnFallback(nameZh) {
  const zh = String(nameZh || '').trim();
  if (!zh) return '';
  try {
    const ps = require('./process-stats');
    if (ps.AF_ZH_EN && ps.AF_ZH_EN[zh]) return ps.AF_ZH_EN[zh];
  } catch (_) {}
  // ESPN_ZH_EN is not exported; read inline critical 竞彩 short names
  const EXTRA = {
    '费内巴切': 'Fenerbahce', '奥林匹亚': 'Olympiakos', '奥林匹亚科斯': 'Olympiakos',
    '圣吉联合': 'Union Saint-Gilloise', '博德闪耀': 'Bodo Glimt', '维京': 'Viking',
    'LASK林茨': 'Lask Linz', '林茨': 'Lask Linz', '诺维奇': 'Norwich',
    '拜仁': 'Bayern Munich', '维拉': 'Aston Villa',
    '雅典AEK': 'AEK Athens', 'AEK': 'AEK Athens', '斯拉维亚': 'Slavia Praha', '布拉格斯拉维亚': 'Slavia Praha',
    '布拉迪斯': 'Slovan Bratislava', '布拉迪斯拉发': 'Slovan Bratislava', '罗马': 'AS Roma',
  };
  if (EXTRA[zh]) return EXTRA[zh];
  return '';
}

async function resolveFixture(opts) {
  const { matchId, homeTeamId, awayTeamId, home, away, date, time, businessDate } = opts;
  const key = mapKey({ matchId, homeTeamId, awayTeamId, date });
  const map = loadMap();
  if (key && map[key] && map[key].fixtureId) {
    return { fixtureId: map[key].fixtureId, fromCache: true, meta: map[key] };
  }

  const homeEn = crestsEn(homeTeamId) || zhEnFallback(home) || String(home || '').trim();
  const awayEn = crestsEn(awayTeamId) || zhEnFallback(away) || String(away || '').trim();
  const homeAfId = localAfTeamId(homeTeamId, homeEn);
  const awayAfId = localAfTeamId(awayTeamId, awayEn);
  // Need either both English-ish names OR both AF ids
  if ((!homeEn || !awayEn) && !(homeAfId && awayAfId)) return null;

  const kickoffMs = date
    ? new Date(`${date}T${String(time || '12:00').slice(0, 5)}:00+08:00`).getTime()
    : NaN;
  const dates = utcDatesForKickoff(date, time, businessDate || opts.businessDate);
  let found = null;
  for (const d of dates) {
    let list;
    try { list = await fixturesForDate(d); } catch (e) {
      if (String(e.message).includes('rateLimit') || /Too many requests/i.test(e.message)) throw e;
      continue;
    }
    found = pickFixture(list, homeEn || '', awayEn || '', kickoffMs, homeAfId, awayAfId);
    if (found) break;
  }
  if (!found) return null;

  // 1.9.96: learn/correct sporttery→AF team ids from the confirmed fixture.
  try {
    const tc = loadTeamCache();
    let dirty = false;
    for (const [sid, t] of [[homeTeamId, found.teams.home], [awayTeamId, found.teams.away]]) {
      if (!sid || !t || !t.id) continue;
      const k = 's:' + String(sid);
      if (!tc[k] || Number(tc[k].afTeamId) !== Number(t.id)) {
        tc[k] = { afTeamId: t.id, afName: t.name, sportteryTeamId: String(sid), learnedFromFixture: found.fixture.id, mappedAt: new Date().toISOString() };
        dirty = true;
      }
    }
    if (dirty) saveTeamCache(tc);
  } catch (_) {}

  const fixtureId = found.fixture.id;
  const entry = {
    fixtureId,
    homeEn: found.teams.home.name,
    awayEn: found.teams.away.name,
    homeAfId: found.teams.home.id,
    awayAfId: found.teams.away.id,
    homeTeamId: String(homeTeamId || ''),
    awayTeamId: String(awayTeamId || ''),
    sportteryMatchId: matchId ? String(matchId) : '',
    date: date || '',
    mappedAt: new Date().toISOString(),
  };
  if (key) {
    map[key] = entry;
    if (matchId) map['m:' + String(matchId)] = entry;
    if (homeTeamId && awayTeamId && date) {
      map[`t:${homeTeamId}|${awayTeamId}|${date}`] = entry;
    }
    saveMap(map);
  }
  return { fixtureId, fromCache: false, meta: entry, row: found };
}

function parsePct(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}
function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function sideStats(arr) {
  const m = {};
  for (const s of arr || []) m[s.type] = s.value;
  return {
    possession: parsePct(m['Ball Possession']),
    shots: parseNum(m['Total Shots']),
    shotsOnTarget: parseNum(m['Shots on Goal']),
    corners: parseNum(m['Corner Kicks']),
    yellowCards: parseNum(m['Yellow Cards']),
    redCards: parseNum(m['Red Cards']),
    // API-Football fixture statistics do not include attacks / dangerous attacks on free plan
    attacks: parseNum(m['Attacks'] ?? m['attacks']),
    dangerousAttacks: parseNum(m['Dangerous Attacks'] ?? m['dangerous_attacks']),
  };
}
function pairStats(homeS, awayS, key) {
  const h = homeS[key], a = awayS[key];
  if (h == null && a == null) return null;
  return { home: h == null ? 0 : h, away: a == null ? 0 : a };
}

const LIVE_SHORT = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP', 'BREAK']);

function normalizeFixtureRow(row) {
  if (!row || !row.fixture) return null;
  const st = row.fixture.status || {};
  const short = st.short || '';
  return {
    fixtureId: row.fixture.id,
    status: { short, long: st.long || '', elapsed: st.elapsed != null ? st.elapsed : null, extra: st.extra != null ? st.extra : null },
    score: { home: row.goals && row.goals.home != null ? row.goals.home : null, away: row.goals && row.goals.away != null ? row.goals.away : null },
    venue: row.fixture.venue ? { name: row.fixture.venue.name || '', city: row.fixture.venue.city || '' } : null,
    kickoff: row.fixture.date || null,
    home: { id: row.teams.home.id, name: row.teams.home.name, logo: row.teams.home.logo || '' },
    away: { id: row.teams.away.id, name: row.teams.away.name, logo: row.teams.away.logo || '' },
    league: row.league ? { id: row.league.id, name: row.league.name, country: row.league.country || '' } : null,
    live: LIVE_SHORT.has(short),
  };
}

async function fetchFixtureById(fixtureId) {
  const list = await afFetch('/fixtures?id=' + encodeURIComponent(fixtureId));
  return list[0] || null;
}

async function fetchStatistics(fixtureId) {
  const list = await afFetch('/fixtures/statistics?fixture=' + encodeURIComponent(fixtureId));
  if (!list.length) return null;
  // response order is usually home then away, but match by team id when possible
  return list;
}

/** Normalize API-Football fixture events. Free plan has no ball trajectory — only event list. */
function normalizeEvents(raw, homeTeamId, awayTeamId) {
  const out = [];
  for (const ev of raw || []) {
    const type = String((ev.type || '')).trim();
    const detail = String((ev.detail || '')).trim();
    if (!type) continue;
    const teamId = ev.team && ev.team.id != null ? Number(ev.team.id) : null;
    let side = null;
    if (teamId != null && homeTeamId != null && Number(homeTeamId) === teamId) side = 'home';
    else if (teamId != null && awayTeamId != null && Number(awayTeamId) === teamId) side = 'away';
    const time = ev.time || {};
    const elapsed = time.elapsed != null ? Number(time.elapsed) : null;
    const extra = time.extra != null ? Number(time.extra) : null;
    const player = ev.player && ev.player.name ? String(ev.player.name) : '';
    const assist = ev.assist && ev.assist.name ? String(ev.assist.name) : '';
    const kind =
      /goal/i.test(type) ? 'goal'
      : /card/i.test(type) ? (/red/i.test(detail) ? 'red' : 'yellow')
      : /subst/i.test(type) ? 'subst'
      : /var/i.test(type) ? 'var'
      : 'other';
    let goalKind = null;
    if (kind === 'goal') {
      if (/own\s*goal/i.test(detail)) goalKind = 'own';
      else if (/missed\s*penalty/i.test(detail)) goalKind = 'missed_pen';
      else if (/penalty/i.test(detail)) goalKind = 'pen';
      else goalKind = 'goal';
    }
    out.push({
      id: [elapsed, extra, type, detail, teamId, player].join('|'),
      kind,
      goalKind,
      type,
      detail,
      side,
      teamId,
      teamName: (ev.team && ev.team.name) || '',
      player,
      assist,
      elapsed,
      extra,
    });
  }
  return out;
}

/** Apply namezh / name-auto / wikidata-zh pipeline (same as lineups) onto event player names. */
function applyEventsZh(events) {
  if (!Array.isArray(events) || !events.length) return events;
  const rows = [];
  for (const e of events) {
    if (e.player) rows.push({ name: e.player, _e: e, _k: 'player' });
    if (e.assist) rows.push({ name: e.assist, _e: e, _k: 'assist' });
  }
  if (!rows.length) return events;
  try { require('./squad').applyNameZh(rows); } catch {
    try { require('./name-auto').fillAuto(rows); } catch {}
  }
  for (const p of rows) {
    if (!p.nameZh || !/[\u4e00-\u9fff]/.test(p.nameZh)) continue;
    if (p._k === 'player') {
      p._e.playerZh = p.nameZh;
      p._e.playerZhAuto = p.nameZhSrc === 'auto';
    } else {
      p._e.assistZh = p.nameZh;
      p._e.assistZhAuto = p.nameZhSrc === 'auto';
    }
  }
  return events;
}

async function fetchEvents(fixtureId) {
  const list = await afFetch('/fixtures/events?fixture=' + encodeURIComponent(fixtureId));
  return list || [];
}

async function getEventsCached(fixtureId, homeTeamId, awayTeamId, isLive) {
  const key = String(fixtureId);
  const ttl = isLive ? EVENTS_TTL_LIVE_MS : EVENTS_TTL_IDLE_MS;
  const hit = eventsCache.get(key);
  if (hit && Date.now() - hit.at < ttl) {
    applyEventsZh(hit.events);
    return { events: hit.events, cached: true };
  }
  let job = inflight.get('events:' + key);
  if (!job) {
    job = (async () => {
      try {
        const raw = await fetchEvents(fixtureId);
        const events = normalizeEvents(raw, homeTeamId, awayTeamId);
        applyEventsZh(events);
        eventsCache.set(key, { at: Date.now(), events });
        return { events, cached: false };
      } catch (e) {
        // keep stale if any
        if (hit) {
          applyEventsZh(hit.events);
          return { events: hit.events, cached: true, eventsError: e.message };
        }
        return { events: [], cached: false, eventsError: e.message };
      }
    })().finally(() => inflight.delete('events:' + key));
    inflight.set('events:' + key, job);
  }
  const pack = await job;
  if (pack && pack.events) applyEventsZh(pack.events);
  return pack;
}

/**
 * Main entry: resolve sporttery match → API-Football fixture + normalized stats.
 */

/** Count confirmed goals from event list (skip disallowed / missed pen). */
function scoreFromEvents(events, homeId, awayId) {
  let h = 0, a = 0;
  const hid = String(homeId || ''), aid = String(awayId || '');
  for (const e of events || []) {
    const type = String(e.type || '');
    const detail = String(e.detail || '');
    if (/Missed Penalty/i.test(detail)) continue;
    if (/Disallowed|Cancelled|Canceled/i.test(detail)) continue;
    // Confirmed goals only (type Goal); skip pure VAR rows
    if (!/Goal/i.test(type)) continue;
    const tid = String((e.team && (e.team.id || e.team)) || e.teamId || '');
    const homeSide = tid && tid === hid;
    const awaySide = tid && tid === aid;
    if (/Own Goal/i.test(detail)) {
      if (homeSide) a++; else if (awaySide) h++;
    } else {
      if (homeSide) h++; else if (awaySide) a++;
    }
  }
  return { home: h, away: a };
}
function applyEventScore(base, events) {
  if (!base || !base.live || !events || !events.length) return base;
  if (!base.home || !base.away) return base;
  const ev = scoreFromEvents(events, base.home.id, base.away.id);
  const curH = base.score && base.score.home != null ? Number(base.score.home) : null;
  const curA = base.score && base.score.away != null ? Number(base.score.away) : null;
  if (curH == null) {
    base.score = ev;
    base.scoreFromEvents = true;
    return base;
  }
  // If events imply fewer goals than fixture score → VAR cancel not yet on goals field
  if (ev.home + ev.away < curH + curA) {
    base.score = { home: ev.home, away: ev.away };
    base.scoreFromEvents = true;
  }
  return base;
}


function maybeInvalidateLiveScores(opts, payload) {
  try {
    if (!payload || !payload.ok || !payload.scoreFromEvents) return;
    const mid = opts && opts.matchId;
    if (!mid) return;
    require('./live-scores').invalidateLiveScoresCache([String(mid)]);
  } catch (_) {}
}
async function getLiveStats(opts) {
  if (!apiKey()) return { ok: false, reason: 'no_key' };

  const homeEn = crestsEn(opts.homeTeamId) || String(opts.home || '').trim();
  const awayEn = crestsEn(opts.awayTeamId) || String(opts.away || '').trim();

  let resolved;
  try {
    resolved = await resolveFixture(opts);
  } catch (e) {
    if (e.message === 'no_key') return { ok: false, reason: 'no_key' };
    return { ok: false, reason: 'upstream', detail: e.message, quota: lastQuota };
  }
  if (!resolved) return { ok: false, reason: 'no_fixture', homeEn, awayEn };

  const fixtureId = resolved.fixtureId;
  const cacheKey = String(fixtureId);
  const cached = statsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) {
    if (cached.payload && cached.payload.events) applyEventsZh(cached.payload.events);
    return { ...cached.payload, cached: true, quota: lastQuota };
  }

  let job = inflight.get('stats:' + cacheKey);
  if (!job) {
    job = (async () => {
      let row = resolved.row;
      if (!row) {
        try { row = await fetchFixtureById(fixtureId); } catch (e) {
          return { ok: false, reason: 'upstream', detail: e.message, fixtureId, quota: lastQuota };
        }
      }
      const base = normalizeFixtureRow(row);
      if (!base) return { ok: false, reason: 'no_fixture', fixtureId };

      let statistics = null;
      try { statistics = await fetchStatistics(fixtureId); } catch (e) {
        // fixture ok but stats failed — still return score/status
        const evPack = await getEventsCached(fixtureId, base.home.id, base.away.id, !!base.live);
        applyEventScore(base, evPack.events || []);
        const payload = {
          ok: true,
          ...base,
          home: { ...base.home, nameZh: opts.home || '' },
          away: { ...base.away, nameZh: opts.away || '' },
          stats: null,
          statsError: e.message,
          events: evPack.events || [],
          eventsCached: !!evPack.cached,
          eventsError: evPack.eventsError || null,
          mappedFromCache: !!resolved.fromCache,
          fetchedAt: new Date().toISOString(),
          noteZh: '技术统计更新中；事件动画为示意。',
          quota: lastQuota,
        };
        statsCache.set(cacheKey, { at: Date.now(), payload });
        return payload;
      }

      let homeS = { possession: null, shots: null, shotsOnTarget: null, corners: null, yellowCards: null, redCards: null, attacks: null, dangerousAttacks: null };
      let awayS = { ...homeS };
      if (statistics && statistics.length) {
        const byId = new Map(statistics.map(s => [String(s.team && s.team.id), s]));
        const hRow = byId.get(String(base.home.id)) || statistics[0];
        const aRow = byId.get(String(base.away.id)) || statistics[1] || statistics[0];
        homeS = sideStats(hRow.statistics);
        awayS = sideStats(aRow.statistics);
      }

      const stats = {
        possession: pairStats(homeS, awayS, 'possession'),
        shots: pairStats(homeS, awayS, 'shots'),
        shotsOnTarget: pairStats(homeS, awayS, 'shotsOnTarget'),
        corners: pairStats(homeS, awayS, 'corners'),
        yellowCards: pairStats(homeS, awayS, 'yellowCards'),
        redCards: pairStats(homeS, awayS, 'redCards'),
        attacks: pairStats(homeS, awayS, 'attacks'),
        dangerousAttacks: pairStats(homeS, awayS, 'dangerousAttacks'),
      };

      const evPack = await getEventsCached(fixtureId, base.home.id, base.away.id, !!base.live);
      applyEventScore(base, evPack.events || []);
      const payload = {
        ok: true,
        ...base,
        home: { ...base.home, nameZh: opts.home || '' },
        away: { ...base.away, nameZh: opts.away || '' },
        stats,
        events: evPack.events || [],
        eventsCached: !!evPack.cached,
        eventsError: evPack.eventsError || null,
        mappedFromCache: !!resolved.fromCache,
        fetchedAt: new Date().toISOString(),
        noteZh: '数据可能存在短暂延迟；事件动画为示意。',
        quota: lastQuota,
      };
      statsCache.set(cacheKey, { at: Date.now(), payload });
      return payload;
    })().finally(() => inflight.delete('stats:' + cacheKey));
    inflight.set('stats:' + cacheKey, job);
  }
  const out = await job;
  maybeInvalidateLiveScores(opts, out);
  return out;
}


/**
 * Resolve sporttery team → API-Football team id.
 * Disk-cached forever under data/live-stats/team-id-cache.json.
 * Uses crests EN / provided name + /teams?search= (free plan). Prefer first team over U19/W.
 * @param {{ sportteryTeamId?: string, nameEn?: string, nameZh?: string, allowFetch?: boolean }} opts
 */

/** AF /teams?search only allows alpha-numeric + spaces. */
function asciiSearchQuery(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.''`]/g, '')
    .replace(/[-_/+,]/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Query variants to avoid youth-only hits ("Newcastle United"→U21) and
 * homonyms ("Porto"→Brazil). Order matters: more specific first.
 */
function searchQueryVariants(query) {
  const base = asciiSearchQuery(query);
  if (!base) return [];
  const out = [];
  const push = (x) => {
    const v = asciiSearchQuery(x);
    if (v && !out.includes(v)) out.push(v);
  };
  const ALIAS = {
    'porto': ['FC Porto'],
    'roma': ['AS Roma'],
    'athletic bilbao': ['Athletic Club'],
    'newcastle united': ['Newcastle'],
    'leeds united': ['Leeds'],
    'west ham united': ['West Ham'],
    'manchester united': ['Manchester United'],
    'nottingham forest': ['Nottingham Forest'],
    'olympiacos': ['Olympiakos'],
    'yokohama f marinos': ['Yokohama'],
    'la galaxy': ['Los Angeles Galaxy'],
    'al ahli': ['Al Ahli Jeddah'],
    'st louis city sc': ['St Louis City'],
    'st louis city': ['St Louis City'],
    'racing de santander': ['Racing Santander'],
    'ulsan hd': ['Ulsan Hyundai'],
    'sbv': ['Excelsior'],
  };
  const key = base.toLowerCase();
  if (ALIAS[key]) ALIAS[key].forEach(push);
  push(base);
  const stripped = base
    .replace(/\b(united|city|town|fc|cf|afc|sc|ac|as|calcio|club|de|the|hotspur)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && stripped.length >= 3) push(stripped);
  const parts = base.split(' ').filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 4) push(parts[0]);
  return out;
}

async function resolveAfTeamId(opts = {}) {
  const { sportteryTeamId, nameEn, nameZh, allowFetch = true } = opts;
  const cache = loadTeamCache();
  const sKey = sportteryTeamId ? 's:' + String(sportteryTeamId) : '';
  const sid = String(sportteryTeamId || '');

  // Prefer explicit sporttery→AF seeds over any prior (possibly wrong) cache hit.
  let seededId = null;
  try {
    const seed = require('./match-stats').AF_TEAM_SEED;
    if (sid && seed && seed[sid]) seededId = Number(seed[sid]);
  } catch (_) {}
  if (seededId) {
    const cur = cache[sKey] && cache[sKey].afTeamId;
    if (!cur || Number(cur) !== seededId) {
      const entry = {
        afTeamId: seededId,
        afName: String(nameEn || nameZh || ''),
        sportteryTeamId: sid,
        query: String(nameEn || nameZh || ''),
        mappedAt: new Date().toISOString(),
        seeded: true,
      };
      cache[sKey] = entry;
      // Invalidate stale name-key homonyms (Roma→Slovenia 22590).
      const qNorm = normName(nameEn || nameZh || '');
      const nDrop = qNorm ? 'n:' + qNorm : '';
      if (nDrop && cache[nDrop] && Number(cache[nDrop].afTeamId) !== seededId) delete cache[nDrop];
      // Also drop bare crest short-name keys that commonly collide
      for (const [bad, onlyIf] of [['n:roma', 497], ['n:porto', 212], ['n:al ahli', 2929], ['n:newcastle united', 34]]) {
        if (onlyIf === seededId && cache[bad] && Number(cache[bad].afTeamId) !== seededId) delete cache[bad];
      }
      saveTeamCache(cache);
      return entry;
    }
    return cache[sKey];
  }

  if (sKey && cache[sKey] && cache[sKey].afTeamId) return cache[sKey];

  const query = String(nameEn || nameZh || '').trim();
  const nKey = query ? 'n:' + normName(query) : '';
  if (nKey && cache[nKey] && cache[nKey].afTeamId) {
    if (sKey) {
      cache[sKey] = { ...cache[nKey], sportteryTeamId: String(sportteryTeamId || '') };
      saveTeamCache(cache);
    }
    return cache[nKey];
  }

  if (!allowFetch || !query || !apiKey()) return null;

  let best = null, bestScore = 0;
  const variants = searchQueryVariants(query);
  if (!variants.length) return null;
  for (const v of variants) {
    let list;
    try {
      list = await afFetch('/teams?search=' + encodeURIComponent(v));
    } catch (e) {
      console.warn('resolveAfTeamId search', v, e.message);
      continue;
    }
    for (const row of list || []) {
      const t = row && row.team;
      if (!t || !t.id) continue;
      if (isYouthSide(t.name) && !isYouthSide(query) && !isYouthSide(v)) continue;
      let sc = Math.max(teamPickScore(query, t), teamPickScore(v, t));
      // Prefer Portugal FC Porto over Brazilian Porto when query mentions Porto
      if (/porto/i.test(query) && /portugal/i.test(t.country || '') && /porto/i.test(t.name || '')) sc += 0.2;
      if (/porto/i.test(query) && /brazil/i.test(t.country || '') && /^porto$/i.test(t.name || '')) sc -= 0.25;
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    if (best && bestScore >= 1.05) break;
  }
  if (!best || bestScore < 0.75) return null;

  const entry = {
    afTeamId: best.id,
    afName: best.name,
    sportteryTeamId: String(sportteryTeamId || ''),
    query,
    mappedAt: new Date().toISOString(),
  };
  if (sKey) cache[sKey] = entry;
  if (nKey) cache[nKey] = entry;
  saveTeamCache(cache);
  return entry;
}

function getQuota() { return lastQuota; }
function setQuota(q) {
  if (!q || typeof q !== 'object') return lastQuota;
  lastQuota = {
    remaining: q.remaining != null ? Number(q.remaining) : lastQuota.remaining,
    limit: q.limit != null ? Number(q.limit) : lastQuota.limit,
    at: q.at || Date.now(),
  };
  return lastQuota;
}

module.exports = {
  getLiveStats,
  scoreFromEvents,
  applyEventScore,
  getQuota,
  setQuota,
  apiKeyPresent: () => !!apiKey(),
  resolveFixture,
  resolveAfTeamId,
  afFetch,
  loadMap,
  // test helpers
  nameScore,
  teamPickScore,
  searchQueryVariants,
  asciiSearchQuery,
  normName,
  nameTokens,
  localAfTeamId,
  pickFixture,
  utcDatesForKickoff,
  normalizeEvents,
  applyEventsZh,
  STATS_TTL_MS,
  EVENTS_TTL_LIVE_MS,
  EVENTS_TTL_IDLE_MS,
};
