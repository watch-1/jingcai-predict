/**
 * Post-match player statistics (本场球员) via API-Football /fixtures/players.
 *
 * Quota-safe:
 * - Fetch ONLY after FT (match finished)
 * - Disk-cache forever under data/live-stats/fixture-players/{fixtureId}.json
 * - Typically 1 AF call/match (page 2 only if paging.total > 1 → max 2)
 * - Skip when remaining quota ≤ QUOTA_RESERVE or key missing
 *
 * Prediction: store full squad; inject only key-player light bullets (top minutes/
 * rating/goals/assists) from prior cached matches for the same teams.
 * 1.9.61: also upsert into data/player-match.sqlite for AI slice recall.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const CACHE_DIR = () => path.join(DATA_DIR, 'live-stats', 'fixture-players');
const INDEX_FILE = () => path.join(CACHE_DIR(), '_index.json');
const QUOTA_RESERVE = 25;
const AF_BASE = 'https://v3.football.api-sports.io';

const POS_SHORT = {
  G: '门将', Goalkeeper: '门将',
  D: '后卫', Defender: '后卫',
  M: '中场', Midfielder: '中场',
  F: '前锋', Attacker: '前锋', Forward: '前锋',
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function apiKeyPresent() {
  try { return !!(require('./live-stats').apiKeyPresent && require('./live-stats').apiKeyPresent()); }
  catch { return false; }
}
function getQuota() {
  try { return require('./live-stats').getQuota(); } catch { return null; }
}
function quotaAllows() {
  const q = getQuota();
  if (!q || q.remaining == null) return true;
  return q.remaining > QUOTA_RESERVE;
}

function cachePath(fixtureId) {
  return path.join(CACHE_DIR(), String(fixtureId) + '.json');
}

/** Disk-only: resolve fixture-players payload by jingcai matchId (no AF call). */
function loadCachedByMatchId(matchId) {
  const mid = String(matchId || '');
  if (!mid) return null;
  const idx = loadIndex();
  const fid = idx.byMatch && idx.byMatch[mid];
  if (!fid) return null;
  return loadCached(fid);
}
function loadCached(fixtureId) {
  const disk = readJson(cachePath(fixtureId), null);
  if (disk && (disk.home || disk.away || disk.players)) return disk;
  return null;
}
function saveCached(fixtureId, payload) {
  try { writeJson(cachePath(fixtureId), payload); }
  catch (e) { console.warn('fixture-players cache', e.message); }
  try { updateIndex(payload); } catch (e) { console.warn('fixture-players index', e.message); }
  // 1.9.61: upsert full player×match facts into自有球员库 (idempotent)
  try {
    const pmdb = require('./player-match-db');
    pmdb.upsertFromFixturePayload(payload);
  } catch (e) { console.warn('fixture-players player-match-db', e.message); }
}

function loadIndex() {
  return readJson(INDEX_FILE(), { byMatch: {}, byTeam: {}, fixtures: [] });
}
function updateIndex(payload) {
  if (!payload || !payload.fixtureId) return;
  const idx = loadIndex();
  const fid = String(payload.fixtureId);
  if (payload.matchId) idx.byMatch[String(payload.matchId)] = fid;
  const pushTeam = (sportteryId, side) => {
    if (!sportteryId) return;
    const k = String(sportteryId);
    if (!idx.byTeam[k]) idx.byTeam[k] = [];
    const entry = {
      fixtureId: Number(fid),
      matchId: payload.matchId || '',
      date: payload.date || '',
      side,
      home: payload.homeNameZh || payload.homeName || '',
      away: payload.awayNameZh || payload.awayName || '',
      ft: payload.ft || '',
    };
    idx.byTeam[k] = [entry, ...idx.byTeam[k].filter(x => String(x.fixtureId) !== fid)].slice(0, 30);
  };
  pushTeam(payload.homeTeamId, 'home');
  pushTeam(payload.awayTeamId, 'away');
  if (!idx.fixtures.includes(fid)) idx.fixtures = [fid, ...idx.fixtures].slice(0, 500);
  writeJson(INDEX_FILE(), idx);
}

function posZh(p) {
  if (!p) return '';
  if (POS_SHORT[p]) return POS_SHORT[p];
  try { return require('./i18n-football').posZh(p) || p; } catch { return p; }
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizePlayer(row) {
  const pl = (row && row.player) || {};
  const st = (row && Array.isArray(row.statistics) && row.statistics[0]) || {};
  const games = st.games || {};
  const goals = st.goals || {};
  const shots = st.shots || {};
  const passes = st.passes || {};
  const tackles = st.tackles || {};
  const cards = st.cards || {};
  const rating = games.rating != null ? num(games.rating) : null;
  return {
    id: pl.id != null ? String(pl.id) : '',
    name: pl.name || '',
    photo: pl.photo && /^https?:\/\//.test(pl.photo) ? pl.photo : '',
    number: games.number != null ? Number(games.number) : null,
    position: games.position || '',
    positionZh: posZh(games.position),
    minutes: num(games.minutes),
    rating,
    captain: !!games.captain,
    substitute: !!games.substitute,
    goals: num(goals.total) || 0,
    assists: num(goals.assists) || 0,
    saves: num(goals.saves),
    shots: num(shots.total),
    shotsOn: num(shots.on),
    keyPasses: num(passes.key),
    passes: num(passes.total),
    passesAccuracy: num(passes.accuracy),
    tackles: num(tackles.total),
    yellow: num(cards.yellow) || 0,
    red: num(cards.red) || 0,
  };
}

function enrichZh(players) {
  try {
    require('./squad').applyNameZh(players);
  } catch {
    try { require('./name-auto').fillAuto(players); } catch {}
  }
  return players;
}

function sortPlayers(list) {
  return list.slice().sort((a, b) => {
    const ra = a.rating != null ? a.rating : -1;
    const rb = b.rating != null ? b.rating : -1;
    if (rb !== ra) return rb - ra;
    const ma = a.minutes != null ? a.minutes : -1;
    const mb = b.minutes != null ? b.minutes : -1;
    if (mb !== ma) return mb - ma;
    const ga = (a.goals || 0) + (a.assists || 0);
    const gb = (b.goals || 0) + (b.assists || 0);
    if (gb !== ga) return gb - ga;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function pickMotm(homePlayers, awayPlayers) {
  const all = [
    ...homePlayers.map(p => ({ ...p, side: 'home' })),
    ...awayPlayers.map(p => ({ ...p, side: 'away' })),
  ].filter(p => p.minutes != null && p.minutes > 0 && p.rating != null);
  if (!all.length) return null;
  all.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    const ga = (a.goals || 0) * 2 + (a.assists || 0);
    const gb = (b.goals || 0) * 2 + (b.assists || 0);
    if (gb !== ga) return gb - ga;
    return (b.minutes || 0) - (a.minutes || 0);
  });
  const top = all[0];
  return {
    id: top.id,
    name: top.name,
    nameZh: top.nameZh || '',
    nameZhAuto: top.nameZhSrc === 'auto',
    photo: top.photo || '',
    rating: top.rating,
    minutes: top.minutes,
    goals: top.goals || 0,
    assists: top.assists || 0,
    side: top.side,
    positionZh: top.positionZh || '',
  };
}

/** Core subset for prediction / highlights: top by rating, goals, assists, minutes. */
function selectKeyPlayers(homePlayers, awayPlayers, { perSide = 3, total = 6 } = {}) {
  const score = (p) => {
    const r = p.rating != null ? p.rating : 0;
    const g = p.goals || 0;
    const a = p.assists || 0;
    const m = p.minutes != null ? Math.min(p.minutes, 90) / 90 : 0;
    return r * 1.2 + g * 2.5 + a * 1.8 + m * 0.5;
  };
  const take = (list, side) => sortPlayers(list.filter(p => (p.minutes || 0) > 0))
    .slice()
    .sort((a, b) => score(b) - score(a))
    .slice(0, perSide)
    .map(p => ({
      id: p.id,
      name: p.name,
      nameZh: p.nameZh || '',
      nameZhAuto: p.nameZhSrc === 'auto',
      photo: p.photo || '',
      side,
      minutes: p.minutes,
      rating: p.rating,
      goals: p.goals || 0,
      assists: p.assists || 0,
      shots: p.shots,
      keyPasses: p.keyPasses,
      positionZh: p.positionZh || '',
    }));
  const merged = [...take(homePlayers, 'home'), ...take(awayPlayers, 'away')];
  merged.sort((a, b) => score(b) - score(a));
  return merged.slice(0, total);
}

function normalizeResponse(list, meta = {}) {
  const teams = [];
  for (const row of list || []) {
    const team = (row && row.team) || {};
    const players = enrichZh((row.players || []).map(normalizePlayer));
    teams.push({
      afTeamId: team.id != null ? Number(team.id) : null,
      name: team.name || '',
      logo: team.logo || '',
      players: sortPlayers(players),
    });
  }
  let home = teams[0] || { afTeamId: null, name: '', logo: '', players: [] };
  let away = teams[1] || { afTeamId: null, name: '', logo: '', players: [] };

  // Prefer AF team ids from fixture map / live resolve if we know home/away
  if (meta.homeAfId != null || meta.awayAfId != null) {
    const byId = new Map(teams.map(t => [String(t.afTeamId), t]));
    if (meta.homeAfId != null && byId.has(String(meta.homeAfId))) {
      home = byId.get(String(meta.homeAfId));
    }
    if (meta.awayAfId != null && byId.has(String(meta.awayAfId))) {
      away = byId.get(String(meta.awayAfId));
    }
  }

  const homePlayers = home.players || [];
  const awayPlayers = away.players || [];
  const motm = pickMotm(homePlayers, awayPlayers);
  const keyPlayers = selectKeyPlayers(homePlayers, awayPlayers);

  return {
    ok: true,
    fixtureId: meta.fixtureId != null ? Number(meta.fixtureId) : null,
    matchId: meta.matchId || '',
    date: meta.date || '',
    ft: meta.ft || '',
    homeTeamId: meta.homeTeamId || '',
    awayTeamId: meta.awayTeamId || '',
    homeName: home.name || meta.homeEn || '',
    awayName: away.name || meta.awayEn || '',
    homeNameZh: meta.home || '',
    awayNameZh: meta.away || '',
    home: {
      afTeamId: home.afTeamId,
      name: home.name,
      nameZh: meta.home || home.name,
      logo: home.logo,
      players: homePlayers,
    },
    away: {
      afTeamId: away.afTeamId,
      name: away.name,
      nameZh: meta.away || away.name,
      logo: away.logo,
      players: awayPlayers,
    },
    motm,
    keyPlayers,
    playerCount: homePlayers.length + awayPlayers.length,
    fetchedAt: new Date().toISOString(),
    afCalls: meta.afCalls || 1,
    noteZh: '本场球员数据来自综合技术统计，完场后永久缓存；评分与技术统计仅供参考。',
  };
}

/**
 * AF fetch with optional page 2 (max 2 calls). Updates live-stats quota headers.
 */
async function afFetchPlayers(fixtureId) {
  const key = process.env.API_FOOTBALL_KEY || process.env.APISPORTS_KEY || '';
  if (!key) throw Object.assign(new Error('no_key'), { code: 'no_key' });
  const live = require('./live-stats');
  let calls = 0;
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= 2; page++) {
    if (page > 1 && page > totalPages) break;
    // AF rejects `page` on some plans for this endpoint — omit on first page.
    const apiPath = page === 1
      ? `/fixtures/players?fixture=${encodeURIComponent(fixtureId)}`
      : `/fixtures/players?fixture=${encodeURIComponent(fixtureId)}&page=${page}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(AF_BASE + apiPath, {
        headers: { 'x-apisports-key': key, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      calls++;
      const rem = r.headers.get('x-ratelimit-requests-remaining');
      const lim = r.headers.get('x-ratelimit-requests-limit');
      try {
        if (rem != null && typeof live.setQuota === 'function') {
          live.setQuota({ remaining: Number(rem), limit: lim != null ? Number(lim) : null, at: Date.now() });
        }
      } catch {}
      const j = await r.json();
      if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
        const err = j.errors;
        const msg = typeof err === 'object' && !Array.isArray(err)
          ? Object.values(err).join('; ')
          : JSON.stringify(err);
        throw Object.assign(new Error(msg), { code: 'upstream' });
      }
      if (j.paging && j.paging.total) totalPages = Number(j.paging.total) || 1;
      for (const row of j.response || []) all.push(row);
    } finally {
      clearTimeout(t);
    }
    if (totalPages <= 1) break;
    if (!quotaAllows()) break;
  }
  // Refresh quota via a no-op read of headers already done; trigger live getQuota by calling afFetch on empty? skip
  return { list: all, afCalls: calls };
}

function isFinishedMatch(m) {
  if (!m) return false;
  if (m.full || m._t === 'r') return true;
  if (m.status && /完场|已结束|Payout|Finished|FT|AET|PEN/i.test(String(m.status))) return true;
  return false;
}

async function resolveFixtureId(m) {
  const live = require('./live-stats');
  // Explicit fixture id (backfill / af: shells already know AF fixture id)
  const explicit = m && (m.fixtureId != null ? m.fixtureId : (m.fixture_id != null ? m.fixture_id : null));
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) > 0) {
    return {
      fixtureId: Number(explicit),
      homeEn: m.home || '',
      awayEn: m.away || '',
      fromCache: true,
      homeAfId: m.homeAfId || null,
      awayAfId: m.awayAfId || null,
    };
  }
  // af:<fixtureId> match shells — id encodes the AF fixture
  const mid = m && m.id != null ? String(m.id) : '';
  if (/^af:\d+$/i.test(mid)) {
    const n = Number(mid.slice(3));
    if (Number.isFinite(n) && n > 0) {
      return {
        fixtureId: n,
        homeEn: m.home || '',
        awayEn: m.away || '',
        fromCache: true,
        homeAfId: m.homeAfId || null,
        awayAfId: m.awayAfId || null,
      };
    }
  }
  try {
    const map = live.loadMap && live.loadMap();
    const hit = map && map['m:' + String(m.id)];
    if (hit && hit.fixtureId) {
      return {
        fixtureId: hit.fixtureId,
        homeEn: hit.homeEn || '',
        awayEn: hit.awayEn || '',
        fromCache: true,
        homeAfId: hit.homeAfId || (hit.meta && hit.meta.homeAfId) || null,
        awayAfId: hit.awayAfId || (hit.meta && hit.meta.awayAfId) || null,
      };
    }
  } catch {}
  // Prefer English labels so AF nameScore works (竞彩中文短名如「巴黎圣曼」)
  let homeEn = m.home, awayEn = m.away;
  try {
    const ps = require('./process-stats');
    homeEn = ps.resolveNameEn(m.homeTeamId, '', m.home) || m.home;
    awayEn = ps.resolveNameEn(m.awayTeamId, '', m.away) || m.away;
  } catch {}
  try {
    const resolved = await live.resolveFixture({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      home: homeEn,
      away: awayEn,
      date: m.date,
      time: m.time || '03:00',
      businessDate: m.businessDate,
    });
    if (resolved && resolved.fixtureId) {
      return {
        fixtureId: resolved.fixtureId,
        homeEn: (resolved.meta && resolved.meta.homeEn) || resolved.homeEn || '',
        awayEn: (resolved.meta && resolved.meta.awayEn) || resolved.awayEn || '',
        fromCache: !!resolved.fromCache,
        homeAfId: resolved.meta && resolved.meta.homeAfId || null,
        awayAfId: resolved.meta && resolved.meta.awayAfId || null,
      };
    }
  } catch (e) {
    return { error: e.message };
  }
  return null;
}

/**
 * Main entry: get player stats for a finished match.
 * @param {object} m sporttery match
 * @param {{ force?: boolean, allowFetch?: boolean }} opts
 */
async function getFixturePlayers(m, opts = {}) {
  const allowFetch = opts.allowFetch !== false;
  const force = !!opts.force;

  if (!m || !m.id) {
    return { ok: false, reason: 'no_match', error: '缺少比赛', home: null, away: null };
  }

  // Disk by matchId via index
  const idx = loadIndex();
  const mappedFid = idx.byMatch[String(m.id)];
  if (!force && mappedFid) {
    const hit = loadCached(mappedFid);
    if (hit && hit.ok) {
      return { ...hit, cached: true, quota: getQuota() };
    }
  }

  const resolved = await resolveFixtureId(m);
  if (!resolved || !resolved.fixtureId) {
    return {
      ok: false,
      reason: resolved && resolved.error ? 'resolve_error' : 'no_fixture',
      error: '未能映射到数据源场次',
      detail: resolved && resolved.error || null,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }

  const fixtureId = resolved.fixtureId;
  if (!force) {
    const hit = loadCached(fixtureId);
    if (hit && hit.ok) {
      // backfill matchId / team ids if older cache
      if (!hit.matchId && m.id) {
        hit.matchId = String(m.id);
        hit.homeTeamId = hit.homeTeamId || String(m.homeTeamId || '');
        hit.awayTeamId = hit.awayTeamId || String(m.awayTeamId || '');
        hit.homeNameZh = hit.homeNameZh || m.home || '';
        hit.awayNameZh = hit.awayNameZh || m.away || '';
        try { saveCached(fixtureId, hit); } catch {}
      }
      return { ...hit, cached: true, quota: getQuota() };
    }
  }

  if (!isFinishedMatch(m)) {
    return {
      ok: false,
      reason: 'not_finished',
      error: '完场后将展示本场球员数据',
      noteZh: '球员技术统计仅在比赛结束后拉取并永久缓存，以节省数据源配额。',
      fixtureId,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }

  if (!allowFetch) {
    return {
      ok: false,
      reason: 'no_cache',
      error: '本场球员数据尚未缓存',
      fixtureId,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }
  if (!apiKeyPresent()) {
    return {
      ok: false,
      reason: 'no_key',
      error: '未配置数据源密钥',
      noteZh: '过程数据源就绪后，完场比赛将自动拉取并永久缓存球员数据。',
      fixtureId,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }
  if (!quotaAllows()) {
    return {
      ok: false,
      reason: 'quota',
      error: '数据源配额紧张，暂未拉取本场球员',
      noteZh: '配额恢复后打开本页将自动补拉并永久缓存。',
      fixtureId,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }

  let pack;
  try {
    pack = await afFetchPlayers(fixtureId);
  } catch (e) {
    const code = e.code || (/no_key/i.test(e.message) ? 'no_key' : 'upstream');
    return {
      ok: false,
      reason: code,
      error: '本场球员数据暂时不可用',
      detail: e.message,
      fixtureId,
      home: null,
      away: null,
      quota: getQuota(),
    };
  }

  if (!pack.list || !pack.list.length) {
    return {
      ok: false,
      reason: 'no_players',
      error: '数据源暂无本场球员统计',
      fixtureId,
      home: null,
      away: null,
      afCalls: pack.afCalls,
      quota: getQuota(),
    };
  }

  const payload = normalizeResponse(pack.list, {
    fixtureId,
    matchId: String(m.id),
    date: m.date || '',
    ft: m.full || '',
    homeTeamId: String(m.homeTeamId || ''),
    awayTeamId: String(m.awayTeamId || ''),
    home: m.home || '',
    away: m.away || '',
    homeEn: resolved.homeEn || '',
    awayEn: resolved.awayEn || '',
    homeAfId: resolved.homeAfId,
    awayAfId: resolved.awayAfId,
    afCalls: pack.afCalls,
  });
  saveCached(fixtureId, payload);
  return { ...payload, cached: false, quota: getQuota() };
}

function playerLabel(p) {
  return (p.nameZh && /[\u4e00-\u9fff]/.test(p.nameZh)) ? p.nameZh : (p.name || '?');
}

function formatKeyBullet(p, teamZh) {
  const bits = [];
  if (p.rating != null) bits.push(`评分 ${Number(p.rating).toFixed(1)}`);
  if (p.minutes != null) bits.push(`${p.minutes}′`);
  if (p.goals) bits.push(`${p.goals}球`);
  if (p.assists) bits.push(`${p.assists}助`);
  const team = teamZh ? `（${teamZh}）` : '';
  return `${playerLabel(p)}${team}${bits.length ? '：' + bits.join(' · ') : ''}`;
}

/**
 * Light bullets for prediction briefing from prior cached player performances.
 * Zero AF cost — disk only.
 */
function getKeyPlayersForPrediction(m, { limit = 3 } = {}) {
  const lim = Math.max(1, Math.min(5, Number(limit) || 3));
  const bullets = [];
  const seen = new Set();
  const idx = loadIndex();
  const hid = String(m.homeTeamId || '');
  const aid = String(m.awayTeamId || '');

  const candidates = [];
  const pushEntries = (tid, label) => {
    if (!tid || !idx.byTeam[tid]) return;
    for (const ent of idx.byTeam[tid]) {
      if (String(ent.matchId) === String(m.id)) continue;
      candidates.push({ ...ent, teamLabel: label, teamId: tid });
    }
  };
  pushEntries(hid, m.home || '主队');
  pushEntries(aid, m.away || '客队');
  candidates.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  for (const ent of candidates) {
    if (bullets.length >= lim) break;
    const disk = loadCached(ent.fixtureId);
    if (!disk || !disk.ok) continue;
    const keys = disk.keyPlayers || [];
    const sideKeys = keys.filter(p => p.side === ent.side);
    const pool = sideKeys.length ? sideKeys : keys;
    for (const p of pool.slice(0, 2)) {
      if (bullets.length >= lim) break;
      const lab = playerLabel(p);
      if (!lab || seen.has(lab)) continue;
      const meaningful = (p.goals > 0) || (p.assists > 0)
        || (p.rating != null && p.rating >= 7.0)
        || (p.minutes >= 75 && p.rating != null && p.rating >= 6.5);
      if (!meaningful) continue;
      seen.add(lab);
      const when = ent.date ? String(ent.date).slice(5) : '';
      const vs = ent.side === 'home'
        ? ('对阵' + (ent.away || '对手'))
        : ('客战' + (ent.home || '对手'));
      const tip = [];
      if (p.rating != null) tip.push('评' + Number(p.rating).toFixed(1));
      if (p.goals) tip.push(p.goals + '球');
      if (p.assists) tip.push(p.assists + '助');
      if (p.minutes != null) tip.push(p.minutes + '′');
      const ctx = when ? (' · ' + when + ' ' + vs) : '';
      bullets.push('近况关键球员：' + lab + ctx + '（' + (tip.join(' · ') || '出场') + '）');
    }
  }
  return bullets.slice(0, lim);
}

module.exports = {
  getFixturePlayers,
  getKeyPlayersForPrediction,
  loadCached,
  loadCachedByMatchId,
  selectKeyPlayers,
  pickMotm,
  normalizePlayer,
  normalizeResponse,
  isFinishedMatch,
  QUOTA_RESERVE,
  CACHE_DIR,
  // test helpers
  sortPlayers,
  formatKeyBullet,
  playerLabel,
};
