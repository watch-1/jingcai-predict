// Batch live scores for the schedule (比分) page.
// Primary: sporttery getMatchLiveV1 (batch by matchIds) — free, China-reachable.
// Overlay: API-Football /fixtures?live=all (ONE request) for elapsed minutes when
//          a sporttery match is already mapped in fixture-map.json.
// Free AF plan is ~100 req/day — never per-match; short TTL + inflight coalesce.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const LIVE_TTL_MS = 45 * 1000;
const AF_LIVE_TTL_MS = 60 * 1000;
const MAP_FILE = () => path.join(DATA_DIR, 'live-stats', 'fixture-map.json');

const cache = new Map(); // key -> { at, payload }
const inflight = new Map();
// 1.9.245: lazy fixture resolution from the list path (was detail-only, so AF
// overlay never applied until a user opened match detail). Bounded per call +
// cooldown after a failed attempt to protect the free AF quota.
const RESOLVE_MAX_PER_CALL = 3;
const RESOLVE_COOLDOWN_MS = 10 * 60 * 1000;
const resolveFailAt = new Map(); // matchId -> ts of last failed resolve
let afLiveCache = null; // { at, byFixtureId }
let afFixtureByIdCache = new Map(); // fixtureId -> { at, row }
let lastQuota = { remaining: null, limit: null, at: 0 };

function bjTodayYmd() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

function kickoffMs(date, time) {
  if (!date) return NaN;
  return new Date(`${date}T${String(time || '00:00').slice(0, 5)}:00+08:00`).getTime();
}

/** Sporttery still「进行中」但开球已超过常规比赛窗口 → 应用 AF 完场回填。 */
function isStaleSportteryLive(cur, koMs, now) {
  if (!cur || !cur.live || cur.finished) return false;
  if (!Number.isFinite(koMs)) return false;
  return (now || Date.now()) >= koMs + 2.5 * 3600e3;
}

function goalSum(h, a) {
  if (h == null || a == null) return null;
  return Number(h) + Number(a);
}

function mapEntryForMatch(map, matchId) {
  const mid = String(matchId);
  if (map['m:' + mid] && map['m:' + mid].fixtureId) return map['m:' + mid];
  for (const v of Object.values(map || {})) {
    if (v && String(v.sportteryMatchId || '') === mid && v.fixtureId) return v;
  }
  return null;
}

function apiKey() {
  const k = process.env.API_FOOTBALL_KEY;
  return (k && String(k).trim()) || '';
}

function readMap() {
  try { return JSON.parse(fs.readFileSync(MAP_FILE(), 'utf8')); } catch { return {}; }
}

function parseScore(s) {
  const m = String(s || '').trim().match(/^(\d+)\s*[:：\-]\s*(\d+)$/);
  if (!m) return { home: null, away: null, raw: String(s || '').trim() };
  return { home: Number(m[1]), away: Number(m[2]), raw: `${m[1]}:${m[2]}` };
}

/**
 * Sporttery matchPhaseTc is NOT always a clock phase.
 * Observed live values (2026-10):
 *   ph=1  name=当前赛季  → season meta, NOT 1H
 *   ph=2  name=季后赛    → season meta, NOT HT  (bug: old code mapped 2→中场)
 *   ph=10 name=中场休息  → real halftime
 *   ph=14 name=比赛结束  → FT
 * Clock phases must prefer matchPhaseTcName / score vs half.
 * Minute alone never flips 1H↔2H (1H stoppage often reports 46'+).
 */

function scorePastHalf(full, half) {
  if (full.home == null || half.home == null) return false;
  return full.home !== half.home || full.away !== half.away;
}

function inferClockPhase({ ph, phn, minute, full, half }) {
  // Explicit clock names first (avoid matching bare「中场」inside unrelated words via 半场休息)
  if (/半场休息|中场休息|^中场$/i.test(phn) || ph === '10' || ph === 'HT') {
    // True HT label: only leave if score already progressed past half (2H started).
    // Do not use minute alone — HT often still reports elapsed 45–47.
    if (scorePastHalf(full, half)) return { phase: '2H', phaseZh: '下半场' };
    return { phase: 'HT', phaseZh: '中场' };
  }
  if (/下半\s*场|下半时/i.test(phn) || ph === '3') return { phase: '2H', phaseZh: '下半场' };
  if (/上半\s*场|上半时/i.test(phn)) return { phase: '1H', phaseZh: '上半场' };
  // 2H stoppage must stay 下半场 — only explicit 加时/ET name flips to ET (never minute>=90 alone).
  if (/加时/i.test(phn) || ph === 'ET') return { phase: 'ET', phaseZh: '加时' };
  if (/点球/i.test(phn) || ph === 'P') return { phase: 'P', phaseZh: '点球' };

  // Do NOT trust ph===1/2 alone — those are season/tournament codes on sporttery.
  // Score-vs-half is a real 2H signal; minute alone must NEVER flip half
  // (1H stoppage often reports elapsed 46/47 while still first half).
  if (scorePastHalf(full, half)) return { phase: '2H', phaseZh: '下半场' };
  if (minute != null && Number.isFinite(minute) && minute >= 0) {
    // ≤45 → 1H; 46–49 without score-past → 1H stoppage (stay 上半场).
    // ≥50 without status/name → ambiguous (could be long 1H injury or early 2H) → LIVE.
    if (minute < 50) return { phase: '1H', phaseZh: '上半场' };
    return { phase: 'LIVE', phaseZh: '进行中' };
  }
  if (phn && !/当前赛季|季后赛|常规赛|小组赛|淘汰赛|联赛|杯赛/i.test(phn)) {
    return { phase: 'LIVE', phaseZh: phn };
  }
  return { phase: 'LIVE', phaseZh: '进行中' };
}

/**
 * Display clock for live list/detail.
 * 1H stoppage → 45+N' (never imply 下半场). 2H stoppage → 90+N' (stay 下半场, not ET).
 */
function formatClockMinute(phase, minute, minuteExtra) {
  if (minute == null || !Number.isFinite(Number(minute))) return '';
  const m = Number(minute);
  const ex = minuteExtra != null && Number.isFinite(Number(minuteExtra)) && Number(minuteExtra) > 0
    ? Number(minuteExtra) : null;
  const ph = String(phase || '');
  if (ph === '1H' || ph === '上半场') {
    if (ex != null) return `45+${ex}'`;
    if (m > 45) return `45+${m - 45}'`;
    return `${m}'`;
  }
  if (ph === '2H' || ph === '下半场') {
    if (ex != null) return `90+${ex}'`;
    if (m > 90) return `90+${m - 90}'`;
    return `${m}'`;
  }
  if (ph === 'ET' || ph === '加时') {
    if (ex != null) return `${m}+${ex}'`;
    return `${m}'`;
  }
  if (ex != null) return `${m}+${ex}'`;
  return `${m}'`;
}

/** Normalize sporttery getMatchLiveV1 row → compact score state. */
function fromSporttery(row) {
  if (!row || row.matchId == null) return null;
  const id = String(row.matchId);
  const st = String(row.matchStatus || '');
  const stn = String(row.matchStatusName || '');
  const ph = String(row.matchPhaseTc || '');
  const phn = String(row.matchPhaseTcName || '');
  const full = parseScore(row.sectionsNo999);
  const half = parseScore(row.sectionsNo1);
  const minute = row.matchMinute !== '' && row.matchMinute != null && String(row.matchMinute).trim() !== ''
    ? Number(row.matchMinute) : null;
  const minuteExtra = row.matchMinuteExtra !== '' && row.matchMinuteExtra != null && String(row.matchMinuteExtra).trim() !== ''
    ? Number(row.matchMinuteExtra) : null;

  const finished = st === '11' || st === '6'
    || /已完成|直播结束|比赛结束|完场/.test(stn + phn)
    || ph === '14'
    || (full.home != null && /结束|完场/.test(stn + phn));

  let phase = 'NS';
  let phaseZh = '未开赛';
  let live = false;
  if (finished && full.home != null) {
    phase = 'FT'; phaseZh = '完场';
  } else if (phn || (minute != null && !Number.isNaN(minute)) || (full.home != null && !finished)) {
    live = true;
    const clock = inferClockPhase({ ph, phn, minute, full, half });
    phase = clock.phase;
    phaseZh = clock.phaseZh;
  } else if (st && !finished) {
    if (/进行|直播|开始/.test(stn)) { live = true; phase = 'LIVE'; phaseZh = stn || '进行中'; }
  }

  // Light event tallies (only when eventList is present — do not invent)
  let goalsHome = null, goalsAway = null, yellow = null, red = null;
  const ev = Array.isArray(row.eventList) ? row.eventList : [];
  if (ev.length) {
    goalsHome = 0; goalsAway = 0; yellow = { home: 0, away: 0 }; red = { home: 0, away: 0 };
    for (const e of ev) {
      const kind = String(e.eventType || e.type || e.eventCode || '').toLowerCase();
      const side = String(e.homeOrAway || e.team || e.side || '').toLowerCase();
      const isHome = side === '1' || side === 'h' || side === 'home' || side === '主';
      const isAway = side === '0' || side === '2' || side === 'a' || side === 'away' || side === '客';
      if (/goal|进球|1/.test(kind) && !/cancel|取消|乌龙/.test(kind)) {
        if (isHome) goalsHome++; else if (isAway) goalsAway++;
      }
      if (/yellow|黄/.test(kind)) {
        if (isHome) yellow.home++; else if (isAway) yellow.away++;
      }
      if (/red|红/.test(kind)) {
        if (isHome) red.home++; else if (isAway) red.away++;
      }
    }
  }

  return {
    id,
    phase,
    phaseZh,
    minute: Number.isFinite(minute) ? minute : null,
    minuteExtra: Number.isFinite(minuteExtra) ? minuteExtra : null,
    live: !!live && !finished,
    finished: !!finished && full.home != null,
    half: half.raw || '',
    full: full.raw || '',
    homeScore: full.home,
    awayScore: full.away,
    halfHome: half.home,
    halfAway: half.away,
    source: 'sporttery',
    statusCode: st,
    statusName: stn,
    phaseCode: ph,
    phaseName: phn,
    cards: (yellow || red) ? { yellow, red } : null,
  };
}

const AF_LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP', 'BREAK']);
const AF_FT = new Set(['FT', 'AET', 'PEN']);

function fromAf(row) {
  if (!row || !row.fixture) return null;
  const st = row.fixture.status || {};
  const short = st.short || '';
  const live = AF_LIVE.has(short);
  const finished = AF_FT.has(short);
  const mapZh = { '1H': '上半场', HT: '中场', '2H': '下半场', ET: '加时', BT: '加时休息', P: '点球', LIVE: '进行中', INT: '中断', SUSP: '暂停', FT: '完场', AET: '加时完场', PEN: '点球结束' };
  return {
    phase: short || (live ? 'LIVE' : finished ? 'FT' : 'NS'),
    phaseZh: mapZh[short] || (live ? '进行中' : finished ? '完场' : '未开赛'),
    minute: st.elapsed != null ? Number(st.elapsed) : null,
    minuteExtra: st.extra != null ? Number(st.extra) : null,
    live,
    finished,
    homeScore: row.goals && row.goals.home != null ? Number(row.goals.home) : null,
    awayScore: row.goals && row.goals.away != null ? Number(row.goals.away) : null,
    source: 'api-football',
  };
}

async function fetchSportteryLive(fetchJson, base, ids) {
  if (!ids.length) return [];
  // sporttery accepts comma-separated matchIds; keep batches modest
  const out = [];
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const url = base + '/gateway/uniform/fb/getMatchLiveV1.qry?matchIds=' + chunk.join(',');
    const j = await fetchJson(url);
    out.push(...((j && j.value) || []));
  }
  return out;
}

async function fetchAfLiveAll() {
  const key = apiKey();
  if (!key) return null;
  if (afLiveCache && Date.now() - afLiveCache.at < AF_LIVE_TTL_MS) return afLiveCache;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-apisports-key': key, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const rem = r.headers.get('x-ratelimit-requests-remaining');
    const lim = r.headers.get('x-ratelimit-requests-limit');
    if (rem != null) lastQuota = { remaining: Number(rem), limit: lim != null ? Number(lim) : 100, at: Date.now() };
    const j = await r.json();
    if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
      return afLiveCache; // keep stale
    }
    const byFixtureId = new Map();
    for (const row of j.response || []) {
      if (row.fixture && row.fixture.id != null) byFixtureId.set(String(row.fixture.id), row);
    }
    afLiveCache = { at: Date.now(), byFixtureId };
    return afLiveCache;
  } catch {
    return afLiveCache;
  } finally { clearTimeout(t); }
}


/**
 * 1.9.120: Batch AF /fixtures?ids=… for mapped matches that sporttery still shows as NS
 * (sale lag after FT). live=all never includes finished games — this fills 完场 scores for the list.
 * Free plan: one request per chunk of ≤20; short TTL + per-id cache.
 */
async function fetchAfFixturesByIds(fixtureIds) {
  const key = apiKey();
  if (!key) return new Map();
  const want = [...new Set((fixtureIds || []).map(String).filter(Boolean))];
  const out = new Map();
  const miss = [];
  const now = Date.now();
  for (const fid of want) {
    const hit = afFixtureByIdCache.get(fid);
    if (hit && now - hit.at < AF_LIVE_TTL_MS) out.set(fid, hit.row);
    else miss.push(fid);
  }
  for (let i = 0; i < miss.length; i += 20) {
    const chunk = miss.slice(i, i + 20);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch('https://v3.football.api-sports.io/fixtures?ids=' + chunk.join('-'), {
        headers: { 'x-apisports-key': key, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      const rem = r.headers.get('x-ratelimit-requests-remaining');
      const lim = r.headers.get('x-ratelimit-requests-limit');
      if (rem != null) lastQuota = { remaining: Number(rem), limit: lim != null ? Number(lim) : 100, at: Date.now() };
      const j = await r.json();
      if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
        continue;
      }
      for (const row of j.response || []) {
        if (!row || !row.fixture || row.fixture.id == null) continue;
        const fid = String(row.fixture.id);
        afFixtureByIdCache.set(fid, { at: Date.now(), row });
        out.set(fid, row);
      }
    } catch {
      /* keep whatever we have */
    } finally { clearTimeout(t); }
  }
  // bound memory
  if (afFixtureByIdCache.size > 200) {
    const oldest = [...afFixtureByIdCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 80);
    for (const [k] of oldest) afFixtureByIdCache.delete(k);
  }
  return out;
}

function reverseFixtureMap(map) {
  // fixtureId -> sporttery matchId
  const rev = new Map();
  for (const [k, v] of Object.entries(map || {})) {
    if (!v || !v.fixtureId) continue;
    const mid = v.sportteryMatchId || (String(k).startsWith('m:') ? String(k).slice(2) : '');
    if (mid) rev.set(String(v.fixtureId), String(mid));
  }
  return rev;
}

/**
 * @param {object} opts
 * @param {string[]} opts.ids sporttery matchIds
 * @param {function} opts.fetchJson server fetchJson bound to sporttery headers/proxy
 * @param {string} opts.base sporttery base URL
 * @param {boolean} [opts.withAf=true] overlay API-Football live=all when key present
 */

/**
 * 1.9.101: Overlay AF live clock/score onto sporttery row.
 * Score rule: while in-play, prefer AF when it has a score (VAR/offside cancels update AF
 * before sporttery). Finished matches keep sporttery (竞彩官方赛果).
 */
function mergeAfOverlay(cur, afn, mid, useAfClock) {
  cur = cur || { id: mid, source: 'api-football', half: '', full: '', cards: null };
  const staleLive = !!(cur.live && !cur.finished && afn.finished);
  const inPlay = !!(afn.live || cur.live) && !(afn.finished || cur.finished) && !staleLive;
  const scoreConflict = cur.homeScore != null && afn.homeScore != null
    && (cur.homeScore !== afn.homeScore || cur.awayScore !== afn.awayScore);
  let homeScore, awayScore, full;
  if (inPlay && afn.homeScore != null) {
    homeScore = afn.homeScore;
    awayScore = afn.awayScore;
    full = `${afn.homeScore}:${afn.awayScore}`;
  } else if (staleLive && afn.homeScore != null) {
    homeScore = afn.homeScore;
    awayScore = afn.awayScore;
    full = `${afn.homeScore}:${afn.awayScore}`;
  } else if (!inPlay && afn.finished && afn.homeScore != null && scoreConflict) {
    const afSum = goalSum(afn.homeScore, afn.awayScore);
    const curSum = goalSum(cur.homeScore, cur.awayScore);
    if (!cur.finished || staleLive || (afSum != null && curSum != null && afSum > curSum)) {
      homeScore = afn.homeScore;
      awayScore = afn.awayScore;
      full = `${afn.homeScore}:${afn.awayScore}`;
    } else {
      homeScore = cur.homeScore;
      awayScore = cur.awayScore;
      full = cur.full || `${cur.homeScore}:${cur.awayScore}`;
    }
  } else {
    homeScore = cur.homeScore != null ? cur.homeScore : afn.homeScore;
    awayScore = cur.awayScore != null ? cur.awayScore : afn.awayScore;
    full = cur.full || (afn.homeScore != null ? `${afn.homeScore}:${afn.awayScore}` : '');
    // If both present and disagree after AF finish correction mid-game edge case
    if (!inPlay && afn.homeScore != null && cur.homeScore != null
        && scoreConflict
        && afn.finished && !cur.finished) {
      homeScore = afn.homeScore; awayScore = afn.awayScore;
      full = `${afn.homeScore}:${afn.awayScore}`;
    }
  }
  const merged = {
    ...cur,
    id: mid,
    live: staleLive ? false : (afn.live || !!cur.live),
    finished: afn.finished || !!cur.finished || staleLive,
    phase: useAfClock ? (afn.phase || cur.phase) : (cur.phase || afn.phase),
    phaseZh: useAfClock ? (afn.phaseZh || cur.phaseZh) : (cur.phaseZh || afn.phaseZh),
    minute: useAfClock && afn.minute != null ? afn.minute : (cur.minute != null ? cur.minute : afn.minute),
    minuteExtra: useAfClock && afn.minuteExtra != null ? afn.minuteExtra : (cur.minuteExtra != null ? cur.minuteExtra : afn.minuteExtra),
    homeScore, awayScore, full,
    source: cur.source && cur.source !== 'api-football' ? cur.source + '+af' : 'api-football',
    scoreSource: (inPlay && afn.homeScore != null) || staleLive
      || (!inPlay && afn.finished && scoreConflict && homeScore === afn.homeScore)
      ? 'af'
      : (cur.homeScore != null ? 'sporttery' : (afn.homeScore != null ? 'af' : null)),
  };
  if (merged.finished) { merged.live = false; merged.phase = merged.phase === 'AET' || merged.phase === 'PEN' ? merged.phase : 'FT'; merged.phaseZh = merged.phaseZh || '完场'; }
  return merged;
}

/** Merge persisted 竞彩赛果 when sporttery live-scores lag (list ↔ detail drift). */
function applyResultsSeenOverlay(data, ids) {
  let archive;
  try { archive = require('./results-archive'); } catch { return false; }
  const seen = archive.loadResultsSeen();
  let used = false;
  for (const id of ids || []) {
    const r = seen[String(id)];
    if (!r || !r.full) continue;
    const full = parseScore(r.full);
    if (full.home == null) continue;
    const half = parseScore(r.half || '');
    const cur = data[id];
    const curSum = cur && cur.homeScore != null ? goalSum(cur.homeScore, cur.awayScore) : null;
    const seenSum = goalSum(full.home, full.away);
    const mismatch = cur && cur.homeScore != null
      && (cur.homeScore !== full.home || cur.awayScore !== full.away);
    const stillLive = cur && cur.live && !cur.finished;
    if (cur && cur.finished && !mismatch && !stillLive) continue;
    if (cur && !cur.finished && !cur.live && cur.homeScore != null && !mismatch) continue;
    if (mismatch && curSum != null && seenSum != null && seenSum < curSum) continue;
    data[id] = {
      ...(cur || { id: String(id), source: 'sporttery', half: '', full: '', cards: null }),
      id: String(id),
      homeScore: full.home,
      awayScore: full.away,
      full: full.raw,
      half: half.raw || (cur && cur.half) || '',
      halfHome: half.home,
      halfAway: half.away,
      live: false,
      finished: true,
      phase: 'FT',
      phaseZh: '完场',
      source: ((cur && cur.source) || 'sporttery') + '+seen',
      scoreSource: 'results-seen',
    };
    used = true;
  }
  return used;
}

/** Live/in-play unfinished rows with no fixture-map entry (and not cooling down). */
function pickUnmappedLiveIds(data, ids, map, failAt, now) {
  const ts = now || Date.now();
  const out = [];
  for (const id of ids || []) {
    const cur = data[id];
    if (!cur || cur.finished) continue;
    if (!cur.live && cur.homeScore == null) continue;
    if (mapEntryForMatch(map || {}, id)) continue;
    const failedAt = (failAt || resolveFailAt).get(String(id));
    if (failedAt && ts - failedAt < RESOLVE_COOLDOWN_MS) continue;
    out.push(String(id));
  }
  return out;
}

/**
 * 1.9.245: resolve AF fixture ids for live-but-unmapped matches so the list's
 * AF overlay (fresh minute/score) works without the user opening match detail.
 * Uses live-stats resolveFixture (per-day fixture lists are cached) — bounded
 * to RESOLVE_MAX_PER_CALL per request with a cooldown on failures.
 */
async function resolveUnmappedLiveFixtures(data, ids, resolveMeta) {
  if (!apiKey() || !resolveMeta) return 0;
  let want;
  try { want = pickUnmappedLiveIds(data, ids, readMap(), resolveFailAt); } catch { return 0; }
  if (!want.length) return 0;
  let liveStats;
  try { liveStats = require('./live-stats'); } catch { return 0; }
  let n = 0;
  // 1.9.247: slice AFTER filtering ids that actually carry resolve meta — a leading
  // meta-less id used to burn the whole per-call budget without resolving anything.
  const withMeta = want.filter(id => resolveMeta[id]);
  for (const id of withMeta.slice(0, RESOLVE_MAX_PER_CALL)) {
    const meta = resolveMeta[id];
    if (!meta) continue;
    try {
      const r = await liveStats.resolveFixture({
        matchId: id,
        homeTeamId: meta.homeTeamId, awayTeamId: meta.awayTeamId,
        home: meta.home, away: meta.away,
        date: meta.date, time: meta.time, businessDate: meta.businessDate,
      });
      if (r && r.fixtureId) { n++; resolveFailAt.delete(id); }
      else resolveFailAt.set(id, Date.now());
    } catch {
      resolveFailAt.set(id, Date.now());
    }
  }
  if (resolveFailAt.size > 200) {
    const oldest = [...resolveFailAt.entries()].sort((a, b) => a[1] - b[1]).slice(0, 80);
    for (const [k] of oldest) resolveFailAt.delete(k);
  }
  return n;
}

async function getLiveScores(opts) {
  const ids = [...new Set((opts.ids || []).map(String).filter(Boolean))];
  const key = ids.slice().sort().join(',') || '_empty';
  const hit = cache.get(key);
  // force (pull-to-refresh) bypasses the payload cache; AF-level TTL caches
  // below still bound API-Football quota usage.
  if (!opts.force && hit && Date.now() - hit.at < LIVE_TTL_MS) {
    return { ...hit.payload, cached: true };
  }

  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      const data = {};
      let sportteryError = null;
      if (ids.length) {
        try {
          const rows = await fetchSportteryLive(opts.fetchJson, opts.base, ids);
          for (const row of rows) {
            const n = fromSporttery(row);
            if (n) data[n.id] = n;
          }
        } catch (e) {
          sportteryError = e.message;
        }
      }

      // 1.9.245: map live-but-unmapped matches first so the AF overlay below
      // can fix lagging sporttery score/minute without an enter-detail round trip.
      let resolvedNew = 0;
      if (opts.withAf !== false) {
        try { resolvedNew = await resolveUnmappedLiveFixtures(data, ids, opts.resolveMeta); } catch { /* best-effort */ }
      }

      // Overlay AF live=all only when we may have live games or mapped fixtures
      let afUsed = false;
      let afError = null;
      if (opts.withAf !== false && apiKey()) {
        const map = readMap();
        const rev = reverseFixtureMap(map);
        // Only hit AF when sporttery already shows live/in-play score, or a mapped
        // fixture lacks a finish flag (AF live=all is 1 req — still skip for pure NS lists).
        const wantAf = ids.some(id => {
          const cur = data[id];
          if (!cur) return false;
          if (cur.finished) return false;
          if (cur.live) return true;
          if (cur.homeScore != null) return true;
          return false;
        });
        if (wantAf && rev.size) {
          try {
            const af = await fetchAfLiveAll();
            if (af && af.byFixtureId) {
              afUsed = true;
              for (const [fid, row] of af.byFixtureId) {
                const mid = rev.get(String(fid));
                if (!mid || (ids.length && !ids.includes(mid))) continue;
                const afn = fromAf(row);
                if (!afn) continue;
                const cur = data[mid] || { id: mid, source: 'api-football', half: '', full: '', cards: null };
                // Prefer sporttery scores when present; AF fills minute/phase when sporttery lacks them.
                // Prefer AF clock on HT conflict, missing minute, weak LIVE/NS, or half mismatch
                // (e.g. sporttery minute≥46 wrongly inferred 2H while AF still 1H stoppage).
                const afHalf = afn.phase === '1H' || afn.phase === '2H' || afn.phase === 'HT'
                  || afn.phase === 'ET' || afn.phase === 'BT' || afn.phase === 'P';
                const halfMismatch = afHalf && cur.phase && afn.phase !== cur.phase
                  && ((cur.phase === '1H' && (afn.phase === '2H' || afn.phase === 'HT' || afn.phase === 'ET'))
                    || (cur.phase === '2H' && (afn.phase === '1H' || afn.phase === 'HT' || afn.phase === 'ET'))
                    || (cur.phase === 'HT' && afn.phase !== 'HT')
                    || (cur.phase === 'LIVE' || cur.phase === 'NS'));
                // 1.9.247: same-phase but AF elapsed is ahead → sporttery clock is stale
                // (minute froze at e.g. 51' while AF ticks 63'); fresher clock wins.
                const afClockAhead = afn.minute != null && cur.minute != null
                  && Number(afn.minute) > Number(cur.minute);
                const afClockBetter = afn.live && afn.phase
                  && (cur.phase === 'HT' && afn.phase !== 'HT'
                    || (cur.minute == null && afn.minute != null)
                    || halfMismatch
                    || afClockAhead
                    || (AF_LIVE.has(afn.phase) && (!cur.phase || cur.phase === 'LIVE' || cur.phase === 'NS')));
                const useAfClock = afClockBetter || (cur.minute == null && afn.phase);
                const merged = mergeAfOverlay(cur, afn, mid, useAfClock);
                if (merged.finished) { merged.live = false; merged.phase = 'FT'; merged.phaseZh = merged.phaseZh || '完场'; }
                data[mid] = merged;
              }
            }
          } catch (e) {
            afError = e.message;
          }
        }
      }

      // 1.9.120: sporttery sale/live often lags FT (status still Selling/empty NS).
      // 1.9.258: also refresh mapped fixtures when sporttery stuck live overnight or
      // marked 完场 with an early frozen score (list 1:0 vs detail/AF 1:2).
      let afFtUsed = false;
      if (opts.withAf !== false && apiKey() && ids.length) {
        try {
          const map = readMap();
          const today = bjTodayYmd();
          const now = Date.now();
          const need = [];
          for (const id of ids) {
            const cur = data[id];
            const meta = mapEntryForMatch(map, id);
            if (!meta || !meta.fixtureId) continue;
            if (meta.date && String(meta.date) > today) continue; // future KO day
            const rm = opts.resolveMeta && opts.resolveMeta[id];
            const ko = kickoffMs(rm && rm.date ? rm.date : meta.date, rm && rm.time ? rm.time : '00:00');
            const staleLive = isStaleSportteryLive(cur, ko, now);
            const verifyFinish = !!(cur && cur.finished && cur.homeScore != null);
            if (cur && cur.live && !staleLive) continue; // true in-play → live=all path
            if (verifyFinish || staleLive || !cur || !cur.finished || cur.homeScore == null) {
              need.push({ mid: id, fid: String(meta.fixtureId) });
            }
          }
          if (need.length) {
            const byFid = await fetchAfFixturesByIds(need.map(n => n.fid));
            for (const { mid, fid } of need) {
              const row = byFid.get(fid);
              if (!row) continue;
              const afn = fromAf(row);
              if (!afn) continue;
              // Only apply when AF has a settled/live score worth showing
              if (!afn.finished && afn.homeScore == null && !afn.live) continue;
              const cur = data[mid] || { id: mid, source: 'api-football', half: '', full: '', cards: null };
              const useAfClock = !cur.minute || afn.finished || (afn.live && !cur.live);
              const merged = mergeAfOverlay(cur, afn, mid, useAfClock);
              if (merged.finished) {
                merged.live = false;
                merged.phase = merged.phase === 'AET' || merged.phase === 'PEN' ? merged.phase : 'FT';
                merged.phaseZh = merged.phaseZh || '完场';
              }
              data[mid] = merged;
              afFtUsed = true;
            }
            if (afFtUsed) afUsed = true;
          }
        } catch (e) {
          afError = afError || e.message;
        }
      }

      let seenUsed = false;
      try { seenUsed = applyResultsSeenOverlay(data, ids); } catch { /* best-effort */ }

      const payload = {
        ok: true,
        fetchedAt: new Date().toISOString(),
        ttlSec: Math.round(LIVE_TTL_MS / 1000),
        ids: ids.length,
        sportteryError,
        resolvedNew,
        afUsed,
        afFtUsed,
        seenUsed,
        afError,
        quota: lastQuota,
        data,
      };
      cache.set(key, { at: Date.now(), payload });
      // bound memory
      if (cache.size > 40) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 10);
        for (const [k] of oldest) cache.delete(k);
      }
      return payload;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job;
}

function getQuota() { return lastQuota; }

function invalidateLiveScoresCache(matchIds) {
  if (!matchIds || !matchIds.length) { cache.clear(); return { cleared: 'all' }; }
  const want = new Set(matchIds.map(String));
  let n = 0;
  for (const [k, v] of cache.entries()) {
    const ids = k.split(',').filter(Boolean);
    if (ids.some(id => want.has(id)) || (v.payload && v.payload.data && ids.some(id => want.has(id)))) {
      cache.delete(k); n++;
    } else if (v.payload && v.payload.data) {
      let hit = false;
      for (const id of want) if (v.payload.data[id]) { hit = true; break; }
      if (hit) { cache.delete(k); n++; }
    }
  }
  // Also drop AF live=all / fixture-id caches so next poll picks corrected goals
  afLiveCache = null;
  afFixtureByIdCache.clear();
  return { cleared: n };
}

module.exports = {
  getLiveScores,
  mergeAfOverlay,
  invalidateLiveScoresCache,
  getQuota,
  fromSporttery,
  fromAf,
  inferClockPhase,
  formatClockMinute,
  scorePastHalf,
  fetchAfFixturesByIds,
  mapEntryForMatch,
  bjTodayYmd,
  kickoffMs,
  isStaleSportteryLive,
  applyResultsSeenOverlay,
  goalSum,
  pickUnmappedLiveIds,
  resolveUnmappedLiveFixtures,
  LIVE_TTL_MS,
  AF_LIVE_TTL_MS,
  RESOLVE_MAX_PER_CALL,
  RESOLVE_COOLDOWN_MS,
};
