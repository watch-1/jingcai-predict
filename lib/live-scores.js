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
let afLiveCache = null; // { at, byFixtureId }
let lastQuota = { remaining: null, limit: null, at: 0 };

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

  // Phase heuristics when official minute/phase present
  let phase = 'NS';
  let phaseZh = '未开赛';
  let live = false;
  if (finished && full.home != null) {
    phase = 'FT'; phaseZh = '完场';
  } else if (phn || (minute != null && !Number.isNaN(minute))) {
    live = true;
    if (/中场|半场休息/i.test(phn) || ph === '2' || ph === 'HT') { phase = 'HT'; phaseZh = '中场'; live = true; }
    else if (/下半|下半场/i.test(phn) || ph === '3') { phase = '2H'; phaseZh = '下半场'; }
    else if (/上半|上半场/i.test(phn) || ph === '1') { phase = '1H'; phaseZh = '上半场'; }
    else if (/加时/i.test(phn)) { phase = 'ET'; phaseZh = '加时'; }
    else if (/点球/i.test(phn)) { phase = 'P'; phaseZh = '点球'; }
    else { phase = 'LIVE'; phaseZh = phn || '进行中'; }
  } else if (full.home != null && !finished) {
    // Score present but not marked finished — treat as live/pending
    live = true; phase = 'LIVE'; phaseZh = stn || phn || '进行中';
  } else if (st && !finished) {
    // Non-empty status that is not finished
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
async function getLiveScores(opts) {
  const ids = [...new Set((opts.ids || []).map(String).filter(Boolean))];
  const key = ids.slice().sort().join(',') || '_empty';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) {
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
                // Prefer sporttery scores when present; AF fills minute/phase when sporttery lacks them
                const merged = {
                  ...cur,
                  id: mid,
                  live: afn.live || !!cur.live,
                  finished: afn.finished || !!cur.finished,
                  phase: (cur.minute == null && afn.phase) ? afn.phase : (cur.phase || afn.phase),
                  phaseZh: (cur.minute == null && afn.phaseZh) ? afn.phaseZh : (cur.phaseZh || afn.phaseZh),
                  minute: cur.minute != null ? cur.minute : afn.minute,
                  minuteExtra: cur.minuteExtra != null ? cur.minuteExtra : afn.minuteExtra,
                  homeScore: cur.homeScore != null ? cur.homeScore : afn.homeScore,
                  awayScore: cur.awayScore != null ? cur.awayScore : afn.awayScore,
                  full: cur.full || (afn.homeScore != null ? `${afn.homeScore}:${afn.awayScore}` : ''),
                  source: cur.source && cur.source !== 'api-football' ? cur.source + '+af' : 'api-football',
                };
                if (merged.finished) { merged.live = false; merged.phase = 'FT'; merged.phaseZh = merged.phaseZh || '完场'; }
                data[mid] = merged;
              }
            }
          } catch (e) {
            afError = e.message;
          }
        }
      }

      const payload = {
        ok: true,
        fetchedAt: new Date().toISOString(),
        ttlSec: Math.round(LIVE_TTL_MS / 1000),
        ids: ids.length,
        sportteryError,
        afUsed,
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

module.exports = {
  getLiveScores,
  getQuota,
  fromSporttery,
  LIVE_TTL_MS,
  AF_LIVE_TTL_MS,
};
