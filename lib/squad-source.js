/**
 * Prematch sidelined list + recent core widgets.
 * Tokens stay on the server. Missing names, fixtures, or lineups become an
 * honest empty pack — nothing is invented.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const FRESH_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;
/**
 * Bump when empty no-team packs must be refetched immediately.
 * Packs written before this (no schema) with an empty list are ignored.
 * A fresh empty pack still waits NEGATIVE_MS (~20 min) before another search.
 */
const SQUAD_SCHEMA = 2;
const DETAIL = { RATING: 118, GOALS: 52, ASSISTS: 79, SHOTS: 42, PASSES: 80, TACKLES: 78 };

/** Official Sportmonks ids for names whose /teams/search returns nothing. */
const SM_PIN = {
  atletico: 7980,
  'atletico madrid': 7980,
  'atletico de madrid': 7980,
  马竞: 7980,
  马德里竞技: 7980,
  bayern: 503,
  'bayern munich': 503,
  'bayern munchen': 503,
  拜仁: 503,
  拜仁慕尼黑: 503,
};

/** Extra search strings when the first /teams/search misses. No guessed ids. */
const SM_ALIAS = {
  'atletico madrid': ['Atlético de Madrid', 'Atletico de Madrid'],
  'atletico de madrid': ['Atlético de Madrid'],
  atletico: ['Atlético de Madrid'],
  马竞: ['Atlético de Madrid'],
  马德里竞技: ['Atlético de Madrid'],
  'bayern munich': ['Bayern', 'Bayern München'],
  'bayern munchen': ['Bayern'],
  拜仁: ['Bayern'],
  拜仁慕尼黑: ['Bayern'],
  'celta vigo': ['Celta', 'Celta de Vigo', 'RC Celta'],
  'rc celta': ['Celta'],
  'rc celta de vigo': ['Celta'],
  塞尔塔: ['Celta'],
  'union saint gilloise': ['Union Saint-Gilloise', 'Union SG'],
  'union st gilloise': ['Union Saint-Gilloise'],
  'union saint-gilloise': ['Union Saint-Gilloise'],
  圣吉联合: ['Union Saint-Gilloise'],
  圣吉罗斯联合: ['Union Saint-Gilloise'],
  'fc porto': ['Porto'],
  波尔图: ['Porto'],
  'aj auxerre': ['Auxerre'],
  欧塞尔: ['Auxerre'],
  'vitoria de guimaraes': ['Guimaraes', 'Vitoria Guimaraes'],
  'vitoria guimaraes': ['Guimaraes'],
  吉马良斯: ['Guimaraes'],
  维多利亚吉马良斯: ['Guimaraes'],
  吉马良斯维多利亚: ['Guimaraes'],
  omonia: ['Omonia Nicosia', 'AC Omonia'],
  'omonia nicosia': ['Omonia Nicosia', 'AC Omonia'],
  'ac omonia': ['Omonia Nicosia'],
  奥莫尼亚: ['Omonia Nicosia', 'AC Omonia'],
  尼科西亚奥莫尼亚: ['Omonia Nicosia'],
};

const TYPE_ZH = {
  injury: '伤病',
  'unknown injury': '伤病',
  'no eligibility': '停赛',
  suspension: '停赛',
  'ankle sprain': '脚踝',
  'dead leg': '腿部',
  'broken tibia': '胫骨',
  knock: '磕碰',
  illness: '生病',
  'red card': '红牌停赛',
  'yellow cards': '黄牌停赛',
  'muscle injury': '肌肉',
  'knee injury': '膝盖',
  'hamstring injury': '腿筋',
};

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'predict-squad', `${matchId}.json`);
}

function readCache(matchId) {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(matchId), 'utf8'));
    if (j && j.matchId != null) return j;
  } catch { /* miss */ }
  return null;
}

function writeCache(pack) {
  const file = cacheFile(pack.matchId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack));
  fs.renameSync(tmp, file);
  return pack;
}

function detailVal(details, typeId) {
  const row = (details || []).find(d => Number(d.type_id) === Number(typeId));
  if (!row || !row.data || row.data.value == null || row.data.value === '') return null;
  const n = Number(row.data.value);
  return Number.isFinite(n) ? n : null;
}

function reasonZh(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  const hit = TYPE_ZH[raw.toLowerCase()];
  if (hit) return hit;
  const low = raw.toLowerCase();
  const keys = [
    ['achilles', '跟腱'], ['hamstring', '腿筋'], ['cruciate', '十字韧带'],
    ['ankle', '脚踝'], ['knee', '膝盖'], ['calf', '小腿'], ['thigh', '大腿'],
    ['groin', '腹股沟'], ['hip', '髋部'], ['shoulder', '肩部'], ['lumbar', '腰部'],
    ['muscle', '肌肉'], ['yellow card', '黄牌停赛'], ['red card', '红牌停赛'],
    ['suspension', '停赛'], ['suspended', '停赛'], ['illness', '生病'],
    ['knock', '磕碰'], ['surgery', '手术'], ['injury', '伤病'], ['problem', '不适'],
  ];
  for (const [k, zh] of keys) if (low.includes(k)) return zh;
  return '伤病';
}

function scoreCores(lineupFixtures, teamId) {
  const tid = Number(teamId);
  const byPlayer = new Map();
  for (const fx of lineupFixtures || []) {
    for (const lu of fx.lineups || []) {
      if (Number(lu.team_id) !== tid) continue;
      const pid = lu.player_id;
      if (!pid) continue;
      if (!byPlayer.has(pid)) {
        const player = lu.player || {};
        byPlayer.set(pid, {
          player_id: pid,
          name: lu.player_name || player.display_name || player.name || player.common_name || '',
          image: player.image_path || null,
          apps: 0,
          ratingSum: 0,
          ratingN: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          passes: 0,
          tackles: 0,
        });
      }
      const row = byPlayer.get(pid);
      const player = lu.player || {};
      const incoming = player.image_path || '';
      const noPhoto = !incoming || require('./logo-proxy').isPlaceholderPhoto(incoming);
      if (!noPhoto && (!row.image || require('./logo-proxy').isPlaceholderPhoto(row.image))) row.image = incoming;
      row.apps += 1;
      const rating = detailVal(lu.details, DETAIL.RATING);
      if (rating != null) {
        row.ratingSum += rating;
        row.ratingN += 1;
      }
      row.goals += detailVal(lu.details, DETAIL.GOALS) || 0;
      row.assists += detailVal(lu.details, DETAIL.ASSISTS) || 0;
      row.shots += detailVal(lu.details, DETAIL.SHOTS) || 0;
      row.passes += detailVal(lu.details, DETAIL.PASSES) || 0;
      row.tackles += detailVal(lu.details, DETAIL.TACKLES) || 0;
      const posId = Number(lu.position_id != null ? lu.position_id : (player.position_id || (player.position && player.position.id)));
      if (Number.isFinite(posId) && posId > 0) {
        if (!row.posCounts) row.posCounts = {};
        row.posCounts[posId] = (row.posCounts[posId] || 0) + 1;
      }
      const posName = (lu.position && (lu.position.name || lu.position.developer_name))
        || (player.position && (player.position.name || player.position.developer_name))
        || '';
      if (posName && !row.position_name) row.position_name = String(posName);
    }
  }
  const list = [...byPlayer.values()].map(r => {
    const avg = r.ratingN ? r.ratingSum / r.ratingN : null;
    const ratingForImpact = avg == null ? 6.5 : avg;
    const impact = ratingForImpact * 1.2
      + r.goals * 2.5
      + r.assists * 1.8
      + Math.min(r.shots, 15) * 0.15
      + Math.min(r.passes, 400) * 0.01
      + Math.min(r.tackles, 40) * 0.08
      + Math.min(r.apps, 5) * 0.3;
    let position_id = null;
    if (r.posCounts) {
      const top = Object.entries(r.posCounts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
      position_id = top ? Number(top[0]) : null;
    }
    return {
      player_id: r.player_id,
      name: r.name,
      image: r.image,
      apps: r.apps,
      avg_rating: avg == null ? null : +avg.toFixed(2),
      goals: r.goals,
      assists: r.assists,
      shots: r.shots,
      passes: r.passes,
      tackles: r.tackles,
      impact: +impact.toFixed(2),
      position_id,
      position_name: r.position_name || '',
    };
  });
  list.sort((a, b) => b.impact - a.impact);
  return list.slice(0, 6);
}

function mapSidelined(list, homeSmId, awaySmId) {
  return (list || []).map(s => {
    const pid = Number(s.participant_id);
    let side = 'unknown';
    if (pid === Number(homeSmId)) side = 'home';
    else if (pid === Number(awaySmId)) side = 'away';
    const player = s.player || {};
    const type = (s.type && (s.type.name || s.type.developer_name)) || '';
    return {
      player_id: s.player_id,
      name: player.display_name || player.common_name || player.name || '',
      image: player.image_path || null,
      type,
      reason: reasonZh(type),
      side,
      core: false,
    };
  }).filter(s => s.side === 'home' || s.side === 'away');
}

function markCore(sidelined, cores) {
  const ids = new Set();
  for (const row of (cores && cores.home) || []) ids.add(Number(row.player_id));
  for (const row of (cores && cores.away) || []) ids.add(Number(row.player_id));
  return (sidelined || []).map(s => ({ ...s, core: ids.has(Number(s.player_id)) }));
}

/** Sportmonks lineup position ids. Absent on older caches — stats are the fallback. */
function positionRole(row) {
  const id = Number(row && row.position_id);
  if (id === 24 || id === 25) return 'defend';
  if (id === 26) return 'organize';
  if (id === 27) return 'attack';
  const n = String((row && row.position_name) || '').toLowerCase();
  if (!n) return null;
  if (/keeper|goalkeeper|defender/.test(n)) return 'defend';
  if (/midfield/.test(n)) return 'organize';
  if (/attack|forward|striker|winger/.test(n)) return 'attack';
  return null;
}

function roleSignals(row) {
  const goals = Number(row && row.goals) || 0;
  const assists = Number(row && row.assists) || 0;
  const shots = Number(row && row.shots) || 0;
  const passes = Number(row && row.passes) || 0;
  const tackles = Number(row && row.tackles) || 0;
  const attack = goals * 4 + shots * 0.25 + assists;
  const organize = passes / 25 + assists * 2;
  const defend = tackles * 1.2;
  return {
    attack: (goals + assists + shots > 0 && attack >= 2) ? attack : 0,
    organize: passes >= 40 ? organize : 0,
    defend: tackles >= 4 ? defend : 0,
  };
}

/**
 * Up to one player per role slot (进攻 / 组织 / 防守) from cores already on the squad pack.
 * No lineup position and no stat signal → that slot is omitted. Nothing is invented.
 */
function pickRoleCores(cores, sidelined, side) {
  const list = (cores || []).filter(c => c && (c.name || c.player_id != null));
  const outIds = new Set(
    (sidelined || [])
      .filter(s => s && s.player_id != null && (!side || s.side === side))
      .map(s => Number(s.player_id))
  );
  const buckets = { attack: [], organize: [], defend: [] };
  for (const row of list) {
    const pos = positionRole(row);
    if (pos) {
      buckets[pos].push(row);
      continue;
    }
    const sig = roleSignals(row);
    let best = null;
    let score = 0;
    for (const key of ['attack', 'organize', 'defend']) {
      if (sig[key] > score) { score = sig[key]; best = key; }
    }
    if (best) buckets[best].push(row);
  }
  const scoreOf = {
    attack: (c) => roleSignals(c).attack || (Number(c.goals) || 0) + (Number(c.shots) || 0) * 0.2 + (Number(c.impact) || 0) * 0.01,
    organize: (c) => roleSignals(c).organize || (Number(c.passes) || 0) / 25 + (Number(c.impact) || 0) * 0.01,
    defend: (c) => roleSignals(c).defend || (Number(c.tackles) || 0) + (Number(c.impact) || 0) * 0.01,
  };
  const zh = { attack: '进攻核心', organize: '组织核心', defend: '防守核心' };
  const short = { attack: '进攻', organize: '组织', defend: '防守' };
  const picked = [];
  const used = new Set();
  for (const role of ['attack', 'organize', 'defend']) {
    const rows = buckets[role]
      .filter(c => !used.has(String(c.player_id != null ? c.player_id : c.name)))
      .sort((a, b) => scoreOf[role](b) - scoreOf[role](a) || (Number(b.impact) || 0) - (Number(a.impact) || 0));
    const hit = rows[0];
    if (!hit) continue;
    const key = String(hit.player_id != null ? hit.player_id : hit.name);
    used.add(key);
    const id = Number(hit.player_id);
    picked.push({
      role,
      role_zh: zh[role],
      role_short: short[role],
      player_id: hit.player_id,
      name: hit.name || '',
      image: hit.image || '',
      sidelined: Number.isFinite(id) && outIds.has(id),
    });
  }
  return picked;
}

function zeroHalf() {
  return { lead: 0, draw: 0, trail: 0, n: 0 };
}

function scoreGoals(row) {
  if (!row) return null;
  const g = row.score && row.score.goals != null ? row.score.goals : row.goals;
  if (g == null || g === '') return null;
  const n = Number(g);
  return Number.isFinite(n) ? n : null;
}

function pairScore(scores, desc) {
  const rows = (scores || []).filter(s => s.description === desc);
  let home = null;
  let away = null;
  for (const s of rows) {
    const who = s.score && s.score.participant;
    const g = scoreGoals(s);
    if (who === 'home') home = g;
    if (who === 'away') away = g;
  }
  if (home == null || away == null) return null;
  return { home, away };
}

function tallyHalf(fixtures, teamId) {
  const tid = Number(teamId);
  let lead = 0;
  let draw = 0;
  let trail = 0;
  let n = 0;
  if (!Number.isFinite(tid)) return zeroHalf();
  for (const fx of fixtures || []) {
    const parts = fx.participants || [];
    const home = parts.find(p => p.meta && p.meta.location === 'home');
    const away = parts.find(p => p.meta && p.meta.location === 'away');
    const ht = pairScore(fx.scores, '1ST_HALF');
    if (!ht || !home || !away) continue;
    const isHome = Number(home.id) === tid;
    const isAway = Number(away.id) === tid;
    if (!isHome && !isAway) continue;
    const my = isHome ? ht.home : ht.away;
    const opp = isHome ? ht.away : ht.home;
    n += 1;
    if (my > opp) lead += 1;
    else if (my < opp) trail += 1;
    else draw += 1;
  }
  return { lead, draw, trail, n };
}

function noteFor(reason) {
  const r = String(reason || '');
  if (r === 'no-team' || r === 'lookup-failed' || r === 'no-name') return '队名未匹配到伤停数据源。';
  if (r === 'no-token' || r === 'no-coverage') return '该联赛暂无伤停源。';
  if (r === 'empty') return '本场公开名单暂无。';
  return '';
}

function hasSquadContent(pack) {
  if (!pack) return false;
  if (pack.sidelined && pack.sidelined.length) return true;
  const cores = pack.cores || {};
  return !!((cores.home && cores.home.length) || (cores.away && cores.away.length));
}

function cacheFresh(cached, clock) {
  if (!cached || !cached.fetchedAt || !cached.half) return false;
  // Pre-alias empty packs (no schema) used to stick for ~20 min and kept the card blank.
  if (cached.schema !== SQUAD_SCHEMA && !hasSquadContent(cached)) return false;
  const age = clock - Number(cached.fetchedAt);
  if (hasSquadContent(cached)) return age < FRESH_MS;
  return age < NEGATIVE_MS;
}

function emptyPack(matchId, reason, now) {
  const r = reason || '';
  return {
    matchId: String(matchId || ''),
    schema: SQUAD_SCHEMA,
    fetchedAt: now || Date.now(),
    reason: r,
    available: false,
    sidelined: [],
    cores: { home: [], away: [] },
    half: { home: zeroHalf(), away: zeroHalf() },
    note: noteFor(r),
  };
}

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function foldTeam(s) {
  return stripAccents(s)
    .replace(/['’`.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pinnedSmId(...parts) {
  for (const raw of parts) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (SM_PIN[s]) return SM_PIN[s];
    const f = foldTeam(s);
    if (f && SM_PIN[f]) return SM_PIN[f];
  }
  return null;
}

function queryKey(s) {
  // Keep accents and hyphens. Sportmonks search treats them as different strings.
  return String(s || '').replace(/['’`.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pushQuery(out, s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 3 || /[\u4e00-\u9fff]/.test(t)) return;
  const key = queryKey(t);
  if (!key || out.some(x => queryKey(x) === key)) return;
  if (out.length >= 6) return;
  out.push(t);
}

function searchQueries(name, nameZh) {
  const out = [];
  pushQuery(out, name);
  pushQuery(out, stripAccents(name));
  const keys = [foldTeam(name), foldTeam(nameZh), String(nameZh || '').trim()];
  for (const k of keys) {
    for (const q of SM_ALIAS[k] || []) pushQuery(out, q);
  }
  const base = stripAccents(name || '');
  if (base) {
    pushQuery(out, base.replace(/\bSaint\s+/gi, 'Saint-'));
    pushQuery(out, base.replace(/^(fc|cf|afc|sc|ac|as|ss|aj|rc|rcd|cd|ud|sd)\s+/i, ''));
    pushQuery(out, base.replace(/\bde\b/ig, ' '));
    pushQuery(out, base.replace(/\b(munich|münchen|munchen|vigo)\b/ig, ' '));
    const stripped = base
      .replace(/^(fc|cf|afc|sc|ac|as|ss|aj|rc|rcd|cd|ud|sd)\s+/i, '')
      .replace(/\b(munich|münchen|munchen|vigo)\b/ig, ' ')
      .replace(/\bde\b/ig, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const parts = stripped.split(' ').filter(Boolean);
    if (parts.length === 1 && parts[0].length >= 4) pushQuery(out, parts[0]);
  }
  return out;
}

function latinSeed(teamId, nameZh) {
  const en = heatSource.englishName(teamId, nameZh) || '';
  const repaired = stripAccents(nameZh);
  const enFold = foldTeam(en);
  const repFold = foldTeam(repaired);
  if (repFold && /[a-z]/.test(repFold) && repFold.length > enFold.length + 2) return repaired;
  if (en && !/[\u4e00-\u9fff]/.test(en)) return en;
  if (/[a-z]/i.test(repaired)) return repaired;
  return '';
}

function isYouthName(name) {
  return /\b(u-?\d{2}|youth|women|woman|reserves|reserve)\b/i.test(name) || /\b(ii|b)\b/i.test(name);
}

function nameHits(name, query) {
  const n = foldTeam(name);
  const q = foldTeam(query);
  if (!n || !q) return false;
  if (n === q) return true;
  const nt = n.split(' ').filter(Boolean);
  const qt = q.split(' ').filter(Boolean);
  if (!qt.length) return false;
  if (qt.length === 1) return nt.includes(qt[0]);
  if (qt.every(t => nt.includes(t))) return true;
  if (nt.every(t => qt.includes(t))) return true;
  return false;
}

/** Alias searches must match the name. The first query still uses pickTeamId. */
function pickAliasHit(rows, query) {
  const q = foldTeam(query);
  const list = (Array.isArray(rows) ? rows : []).filter(r => r && r.id != null && r.name && !isYouthName(r.name) && nameHits(r.name, query));
  if (!list.length) return null;
  list.sort((a, b) => {
    const ae = foldTeam(a.name) === q ? 0 : 1;
    const be = foldTeam(b.name) === q ? 0 : 1;
    if (ae !== be) return ae - be;
    return foldTeam(a.name).length - foldTeam(b.name).length;
  });
  return list[0].id;
}

function isCoverageError(err) {
  const code = Number(err && (err.statusCode || err.status));
  if (code === 401 || code === 402 || code === 403) return true;
  const blob = `${(err && err.message) || ''} ${JSON.stringify((err && err.body) || '')}`.toLowerCase();
  return /do not have access|current subscription/.test(blob);
}

function looksDenied(body) {
  const msg = String((body && (body.message || body.error)) || '').toLowerCase();
  if (!/do not have access|current subscription|your plan/.test(msg)) return false;
  const data = body && body.data;
  return data == null || (Array.isArray(data) && data.length === 0);
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function resolveSm(teamId, nameZh, known, fetchJson) {
  if (known) return known;
  const seed = latinSeed(teamId, nameZh);
  const pin = pinnedSmId(nameZh, seed);
  if (pin) return pin;
  const queries = searchQueries(seed, nameZh);
  if (!queries.length || !fetchJson) return null;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    let found;
    try {
      found = await fetchJson(`/football/teams/search/${encodeURIComponent(q)}`);
    } catch (e) {
      if (i === 0) throw e;
      continue;
    }
    const rows = (found && found.data) || [];
    const id = i === 0 ? heatSource.pickTeamId(rows, q) : pickAliasHit(rows, q);
    if (id) return id;
  }
  return null;
}

async function findFixtureId(homeSm, awaySm, kickoffMs, fetchJson) {
  const ko = Number.isFinite(kickoffMs) ? kickoffMs : Date.now();
  const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${homeSm}`, {
    include: 'participants',
    per_page: 20,
  });
  const rows = (body && body.data) || [];
  const hit = rows.find(fx => {
    const ids = (fx.participants || []).map(p => Number(p.id));
    return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
  });
  return hit ? hit.id : null;
}

async function fetchLineups(ids, fetchJson) {
  const out = [];
  for (const id of ids) {
    try {
      const body = await fetchJson(`/football/fixtures/${id}`, {
        include: 'lineups.details;lineups.player;participants;scores',
      });
      if (body && body.data) out.push(body.data);
    } catch { /* one fixture can fail */ }
  }
  return out;
}

async function ensureSquad({
  matchId, homeTeamId, awayTeamId, homeZh, awayZh,
  homeSmId, awaySmId, homeFixtureIds, awayFixtureIds, kickoffMs,
  fetchImpl, now,
} = {}) {
  const clock = now || Date.now();
  const cached = matchId ? readCache(matchId) : null;
  const fresh = cacheFresh(cached, clock) ? cached : null;
  if (fresh) return fresh;
  const fetchJson = fetchImpl || (heatSource.readToken() ? heatSource.smGet : null);
  if (!fetchJson || !matchId) return fresh || emptyPack(matchId, 'no-token', clock);
  const flags = { denied: false, sawFixture: false };
  async function fetchNoted(urlPath, params) {
    try {
      const body = await fetchJson(urlPath, params);
      if (body && Array.isArray(body.data) && body.data.length) {
        flags.sawFixture = true;
        flags.denied = false;
      } else if (body && body.data && !Array.isArray(body.data) && body.data.id) {
        flags.sawFixture = true;
        flags.denied = false;
      } else if (looksDenied(body)) flags.denied = true;
      return body;
    } catch (e) {
      if (isCoverageError(e)) flags.denied = true;
      throw e;
    }
  }
  let homeSm = homeSmId || null;
  let awaySm = awaySmId || null;
  try {
    if (!homeSm) homeSm = await resolveSm(homeTeamId, homeZh, null, fetchJson);
    if (!awaySm) awaySm = await resolveSm(awayTeamId, awayZh, null, fetchJson);
  } catch (e) {
    const reason = isCoverageError(e) ? 'no-coverage' : 'lookup-failed';
    return writeCache(emptyPack(matchId, reason, clock));
  }
  if (!homeSm && !awaySm) return writeCache(emptyPack(matchId, 'no-team', clock));

  let sidelined = [];
  if (homeSm && awaySm) {
    try {
      const fxId = await findFixtureId(homeSm, awaySm, kickoffMs, fetchNoted);
      if (fxId) {
        flags.sawFixture = true;
        flags.denied = false;
        const body = await fetchNoted(`/football/fixtures/${fxId}`, {
          include: 'sidelined.player;sidelined.type;participants',
        });
        sidelined = mapSidelined(body && body.data && body.data.sidelined, homeSm, awaySm);
      }
    } catch { /* keep cores even if the fixture lookup fails */ }
  }

  async function sideIds(given, smId) {
    const have = (given || []).filter(Boolean).slice(0, 6);
    if (have.length >= 2 || !smId) return have;
    try {
      const body = await fetchNoted(`/football/fixtures/between/${ymd(clock - 140 * 86400000)}/${ymd(clock)}/${smId}`, {
        include: 'participants;state',
        per_page: 30,
      });
      const extra = ((body && body.data) || [])
        .filter(heatSource.isFinished)
        .sort((a, b) => String(b.starting_at || '').localeCompare(String(a.starting_at || '')))
        .map(fx => fx.id)
        .filter(Boolean);
      return [...new Set(have.concat(extra))].slice(0, 6);
    } catch { return have; }
  }
  const homeIds = await sideIds(homeFixtureIds, homeSm);
  const awayIds = await sideIds(awayFixtureIds, awaySm);
  const lineupIds = [...new Set(homeIds.concat(awayIds))].slice(0, 10);
  if ((homeFixtureIds || []).some(Boolean) || (awayFixtureIds || []).some(Boolean) || lineupIds.length) {
    flags.sawFixture = true;
  }
  const lineups = await fetchLineups(lineupIds, fetchJson);
  const half = {
    home: homeSm ? tallyHalf(lineups, homeSm) : zeroHalf(),
    away: awaySm ? tallyHalf(lineups, awaySm) : zeroHalf(),
  };
  const cores = {
    home: homeSm ? scoreCores(lineups, homeSm) : [],
    away: awaySm ? scoreCores(lineups, awaySm) : [],
  };
  sidelined = markCore(sidelined, cores);
  const available = sidelined.length > 0 || cores.home.length > 0 || cores.away.length > 0;
  let reason = '';
  if (!available) {
    if (flags.denied && !flags.sawFixture) reason = 'no-coverage';
    else if (!homeSm || !awaySm) reason = 'no-team';
    else reason = 'empty';
  }
  return writeCache({
    matchId: String(matchId),
    schema: SQUAD_SCHEMA,
    fetchedAt: clock,
    reason,
    available,
    homeSmId: homeSm,
    awaySmId: awaySm,
    sidelined,
    cores,
    half,
    note: noteFor(reason),
  });
}

function afPhoto(it) {
  const photo = it && (it.photo || it.image || '');
  if (photo && /^https?:/i.test(String(photo))) return String(photo);
  const id = it && (it.playerId || it.player_id);
  if (id != null && /^\d+$/.test(String(id))) {
    return `https://media.api-sports.io/football/players/${id}.png`;
  }
  return '';
}

function hintList(parts) {
  const out = [];
  for (const raw of parts) {
    const f = foldTeam(raw);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

function hintsHit(names, hints) {
  return names.some(n => hints.some(h => {
    if (!n || !h) return false;
    if (n === h) return true;
    const short = n.length < h.length ? n : h;
    const long = n.length < h.length ? h : n;
    const min = /[\u4e00-\u9fff]/.test(short) ? 2 : 4;
    if (short.length < min) return false;
    return long.includes(short);
  }));
}

function sideOfAf(it, ctx) {
  const teamId = it && it.teamId != null ? String(it.teamId) : '';
  if (ctx.homeAfId && teamId && teamId === String(ctx.homeAfId)) return 'home';
  if (ctx.awayAfId && teamId && teamId === String(ctx.awayAfId)) return 'away';
  let teamZh = (it && (it.teamZh || it.team)) || '';
  try {
    const z = require('./league-tables').teamZh((it && it.team) || '');
    if (z) teamZh = z;
  } catch { /* keep source */ }
  const names = hintList([it && it.team, teamZh, it && it.teamEn]);
  let extraHome = '';
  let extraAway = '';
  try {
    extraHome = heatSource.englishName(ctx.homeTeamId, ctx.home || ctx.homeZh) || '';
    extraAway = heatSource.englishName(ctx.awayTeamId, ctx.away || ctx.awayZh) || '';
  } catch { /* names already passed */ }
  const homeHints = hintList([ctx.home, ctx.homeZh, ctx.homeEn, extraHome]);
  const awayHints = hintList([ctx.away, ctx.awayZh, ctx.awayEn, extraAway]);
  const h = hintsHit(names, homeHints);
  const a = hintsHit(names, awayHints);
  if (h && !a) return 'home';
  if (a && !h) return 'away';
  return '';
}

/**
 * When Sportmonks has no injury rows, copy the existing public injury list.
 * Cores stay as they are. A non-empty Sportmonks list is left untouched.
 * Does not write the squad cache — the next rebuild can still prefer Sportmonks.
 */
function applyAfFallback(squad, items, ctx) {
  const context = ctx || {};
  if (squad && squad.sidelined && squad.sidelined.length) return squad;
  const rows = [];
  const seen = new Set();
  for (const it of items || []) {
    const side = sideOfAf(it, context);
    if (!side) continue;
    const en = String((it && (it.player || it.name)) || '').trim();
    if (!en) continue;
    const key = side + '|' + foldTeam(en);
    if (seen.has(key)) continue;
    seen.add(key);
    const why = (it && (it.reason || it.type)) || '';
    rows.push({
      player_id: (it && (it.playerId || it.player_id)) || null,
      name: en,
      image: afPhoto(it) || null,
      type: (it && it.type) || why,
      reason: reasonZh(why),
      side,
      core: false,
      source: 'af',
    });
  }
  if (!rows.length) return squad || null;
  const base = squad || emptyPack(context.matchId || '', 'no-team');
  const cores = base.cores || { home: [], away: [] };
  // Leave core false. Red borders stay on the Sportmonks list, and the
  // absence card does not treat these rows as confirmed cores.
  return {
    ...base,
    schema: SQUAD_SCHEMA,
    sidelined: rows,
    cores,
    available: true,
    reason: '',
    note: '',
    injurySource: 'af',
  };
}

module.exports = {
  detailVal,
  reasonZh,
  scoreCores,
  pickRoleCores,
  positionRole,
  mapSidelined,
  markCore,
  tallyHalf,
  ensureSquad,
  resolveSm,
  searchQueries,
  pinnedSmId,
  noteFor,
  applyAfFallback,
  SQUAD_SCHEMA,
  cacheFresh,
};
