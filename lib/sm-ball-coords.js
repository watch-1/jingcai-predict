/**
 * SportMonks ballCoordinates for the 实时 45° pitch.
 * Token stays in heat-source.readToken — never written to disk HTML or the client pack.
 * Official score/status stay on existing live-stats; this module only slim-caches
 * coordinates. Empty post-match / empty SM responses must not wipe a last-good snapshot.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LIVE_TTL_MS = 4000;
const FT_TTL_MS = 6 * 3600 * 1000;
const NEGATIVE_LIVE_MS = 45 * 1000;
const NEGATIVE_FT_MS = 30 * 60 * 1000;
const MAX_STORE = 1200;
const MAX_RETURN = 400;
const INCLUDE = 'ballCoordinates;periods;state';

const inflight = new Map();
const memCache = new Map(); // fixtureId -> { at, payload }

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheDir() {
  return path.join(dataDir(), 'sm-ball-coords');
}

function cacheFile(fixtureId) {
  return path.join(cacheDir(), 'fx-' + String(fixtureId) + '.json');
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

function readDisk(fixtureId) {
  if (!fixtureId) return null;
  const j = readJson(cacheFile(fixtureId), null);
  return j && typeof j === 'object' ? j : null;
}

function writeDisk(fixtureId, payload) {
  if (!fixtureId || !payload) return;
  try {
    writeJson(cacheFile(fixtureId), {
      fixtureId: String(fixtureId),
      savedAt: Date.now(),
      payload,
    });
  } catch { /* optional */ }
}

/** 0–1 pitch units. Values that look like 0–100 (or meters ≈105) are scaled down. */
function normalizeXY(x, y) {
  let xn = Number(x);
  let yn = Number(y);
  if (!Number.isFinite(xn) || !Number.isFinite(yn)) return null;
  const maxAbs = Math.max(Math.abs(xn), Math.abs(yn));
  if (maxAbs > 1.5) {
    const div = maxAbs > 102 ? 105 : 100;
    xn /= div;
    yn /= div;
  }
  xn = Math.min(1, Math.max(0, xn));
  yn = Math.min(1, Math.max(0, yn));
  return { x: xn, y: yn };
}

function parseTimerToSec(timer) {
  if (timer == null || timer === '') return null;
  if (typeof timer === 'number' && Number.isFinite(timer)) {
    // Heuristic: values up to 150 are minutes; larger are seconds.
    return timer > 150 ? timer : timer * 60;
  }
  if (typeof timer === 'object') {
    const m = Number(timer.minute ?? timer.minutes);
    const s = Number(timer.second ?? timer.seconds ?? 0);
    if (Number.isFinite(m)) return m * 60 + (Number.isFinite(s) ? s : 0);
    return null;
  }
  const str = String(timer).trim();
  const plus = str.match(/^(\d{1,3}):(\d{2})(?:\+(\d{1,2})(?::(\d{2}))?)?/);
  if (plus) {
    let sec = Number(plus[1]) * 60 + Number(plus[2]);
    if (plus[3]) sec += Number(plus[3]) * 60 + (plus[4] ? Number(plus[4]) : 0);
    return sec;
  }
  const n = Number(str);
  if (Number.isFinite(n)) return n > 150 ? n : n * 60;
  return null;
}

function periodOffsetSec(desc) {
  const d = String(desc || '').toLowerCase();
  if (/pen/.test(d)) return 120 * 60;
  if (/2nd.*extra|extra.*2|et_?2/.test(d)) return 105 * 60;
  if (/extra|et\b|overtime|aet/.test(d)) return 90 * 60;
  if (/2nd|second|2h|second half/.test(d)) return 45 * 60;
  return 0;
}

function periodMap(periods) {
  const map = Object.create(null);
  for (const p of periods || []) {
    if (!p || p.id == null) continue;
    map[String(p.id)] = {
      id: p.id,
      description: p.description || p.name || p.ticking || '',
      offset: periodOffsetSec(p.description || p.name || ''),
    };
  }
  return map;
}

function pointTimeSec(p, pmap, fallbackIndex) {
  const meta = pmap[String(p.period_id || p.periodId || '')] || { offset: 0 };
  const t = parseTimerToSec(p.timer);
  if (t != null) return meta.offset + t;
  if (p.minute != null && Number.isFinite(Number(p.minute))) {
    const extra = Number(p.extra_minute || p.extraMinute || 0) || 0;
    return meta.offset + Number(p.minute) * 60 + extra * 60;
  }
  // Interpolation spacing only — not an official clock reading.
  return meta.offset + (Number(fallbackIndex) || 0);
}

function slimPoints(raw, periods) {
  const list = Array.isArray(raw) ? raw : [];
  const pmap = periodMap(periods);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p) continue;
    const xy = normalizeXY(p.x, p.y);
    if (!xy) continue;
    out.push({
      x: xy.x,
      y: xy.y,
      t: pointTimeSec(p, pmap, i),
      periodId: p.period_id != null ? p.period_id : (p.periodId != null ? p.periodId : null),
      timer: p.timer != null ? p.timer : null,
    });
  }
  out.sort((a, b) => (a.t - b.t) || (a.x - b.x));
  if (out.length <= MAX_STORE) return out;
  const step = Math.ceil(out.length / MAX_STORE);
  const thin = [];
  for (let i = 0; i < out.length; i += step) thin.push(out[i]);
  const last = out[out.length - 1];
  if (thin[thin.length - 1] !== last) thin.push(last);
  return thin;
}

function stateBlob(fx) {
  const st = (fx && fx.state) || {};
  return `${st.short_name || ''} ${st.developer_name || ''} ${st.name || ''} ${st.state || ''}`;
}

function classifyState(fx, smLive) {
  const liveMod = smLive || (() => { try { return require('./sm-live-scores'); } catch { return null; } })();
  const st = (fx && fx.state) || {};
  const dev = String(st.developer_name || st.short_name || st.name || '').toUpperCase().replace(/\s+/g, '_');
  let live = false;
  let finished = false;
  let phase = '';
  let phaseZh = '';
  if (liveMod) {
    if (liveMod.SM_LIVE_STATES && liveMod.SM_LIVE_STATES.has(dev)) live = true;
    if (liveMod.SM_FT_STATES && liveMod.SM_FT_STATES.has(dev)) finished = true;
    const mapped = liveMod.SM_PHASE && (liveMod.SM_PHASE[dev] || liveMod.SM_PHASE[st.developer_name]);
    if (mapped) {
      phase = mapped.phase;
      phaseZh = mapped.phaseZh;
    }
  }
  const blob = stateBlob(fx);
  if (/FT|AET|PEN|FINISHED|FULL.?TIME|ENDED/i.test(blob)) finished = true;
  if (/INPLAY|LIVE|1ST_HALF|2ND_HALF|\bHT\b|\bET\b|PEN_LIVE/i.test(blob) && !finished) live = true;
  if (finished) live = false;
  if (!phase) {
    if (finished) { phase = 'FT'; phaseZh = '完场'; }
    else if (live) { phase = 'LIVE'; phaseZh = '进行中'; }
    else { phase = 'NS'; phaseZh = '未开赛'; }
  }
  return { live, finished, phase, phaseZh, developer: dev };
}

function hasCoords(payload) {
  return !!(payload && Array.isArray(payload.coords) && payload.coords.length);
}

/**
 * Empty / missing SM payloads must not wipe a last-good snapshot
 * (same idea as SM prediction snapshots).
 */
function mergeLastGood(prev, next) {
  if (!next) return prev || null;
  if (hasCoords(next)) return next;
  if (hasCoords(prev)) {
    return Object.assign({}, next, {
      coords: prev.coords,
      hasCoords: true,
      keptLastGood: true,
      lastGoodAt: prev.fetchedAt || prev.lastGoodAt || null,
      reason: next.reason || 'empty_kept_last_good',
    });
  }
  return next;
}

function ttlFor(payload, now) {
  const clock = now || Date.now();
  if (!payload) return 0;
  if (payload.finished) {
    return hasCoords(payload) ? FT_TTL_MS : NEGATIVE_FT_MS;
  }
  if (payload.live) {
    return hasCoords(payload) ? LIVE_TTL_MS : NEGATIVE_LIVE_MS;
  }
  // NS / unknown
  return hasCoords(payload) ? 60 * 1000 : NEGATIVE_LIVE_MS;
}

function stillFresh(entry, now) {
  if (!entry || !entry.payload) return false;
  const clock = now || Date.now();
  const age = clock - (entry.at || 0);
  return age >= 0 && age < ttlFor(entry.payload, clock);
}

function sliceReturn(coords) {
  const list = Array.isArray(coords) ? coords : [];
  if (list.length <= MAX_RETURN) return list;
  return list.slice(list.length - MAX_RETURN);
}

function publicPack(payload) {
  if (!payload) return { ok: false, reason: 'error', coords: [], hasCoords: false };
  const coords = sliceReturn(payload.coords || []);
  return {
    ok: payload.ok !== false,
    reason: payload.reason || (coords.length ? '' : 'no_coordinates'),
    fixtureId: payload.fixtureId || null,
    live: !!payload.live,
    finished: !!payload.finished,
    phase: payload.phase || '',
    phaseZh: payload.phaseZh || '',
    hasCoords: coords.length > 0,
    coords,
    coordCount: Array.isArray(payload.coords) ? payload.coords.length : coords.length,
    fetchedAt: payload.fetchedAt || null,
    keptLastGood: !!payload.keptLastGood,
    cached: !!payload.cached,
    // Never include tokens or raw upstream bodies.
  };
}

async function resolveSmFixture(opts, fetchJson) {
  const smLive = require('./sm-live-scores');
  const known = (opts && opts.smFixtureId) || (opts && opts.matchId && smLive.smFixtureIdFromMap(opts.matchId));
  if (known) return { id: known, fromCache: true };
  if (!fetchJson) return null;
  const mf = require('./sm-matchfacts');
  let kickoffMs = opts && opts.kickoffMs;
  if (!Number.isFinite(kickoffMs) && opts && opts.date) {
    kickoffMs = new Date(`${opts.date}T${String(opts.time || '12:00').slice(0, 5)}:00+08:00`).getTime();
  }
  const resolved = await mf.resolveFixture(fetchJson, {
    matchId: opts && opts.matchId,
    homeTeamId: opts && opts.homeTeamId,
    awayTeamId: opts && opts.awayTeamId,
    home: opts && (opts.homeZh || opts.home),
    away: opts && (opts.awayZh || opts.away),
    homeZh: opts && (opts.homeZh || opts.home),
    awayZh: opts && (opts.awayZh || opts.away),
    kickoffMs,
    smFixtureId: opts && opts.smFixtureId,
  });
  if (!resolved || !resolved.id) return null;
  if (opts && opts.matchId) smLive.rememberSmFixtureId(opts.matchId, resolved.id);
  return resolved;
}

function packFromFixture(fx, opts, clock) {
  const st = classifyState(fx);
  const coords = slimPoints(fx && (fx.ballcoordinates || fx.ballCoordinates), fx && fx.periods);
  return {
    ok: true,
    reason: coords.length ? '' : 'no_coordinates',
    fixtureId: fx && fx.id != null ? fx.id : (opts && opts.smFixtureId) || null,
    live: st.live,
    finished: st.finished,
    phase: st.phase,
    phaseZh: st.phaseZh,
    coords,
    hasCoords: coords.length > 0,
    fetchedAt: clock,
    keptLastGood: false,
  };
}

function emptyPack(opts, reason, clock, extra) {
  return Object.assign({
    ok: reason !== 'no_key' && reason !== 'upstream' && reason !== 'error' && reason !== 'no_fixture',
    reason: reason || 'no_coordinates',
    fixtureId: (opts && opts.smFixtureId) || null,
    live: false,
    finished: false,
    phase: '',
    phaseZh: '',
    coords: [],
    hasCoords: false,
    fetchedAt: clock,
    keptLastGood: false,
  }, extra || {});
}

/**
 * Sync, cheap last-good lookup. Uses smFixtureId / smFixtureIdFromMap
 * plus in-memory or disk cache only. No SportMonks HTTP, no resolveFixture.
 * Returns a public pack when coords exist, otherwise null.
 */
function peekCached(opts) {
  opts = opts || {};
  let fixtureId = opts.smFixtureId || opts.fixtureId || null;
  if (!fixtureId && opts.matchId) {
    try {
      fixtureId = require('./sm-live-scores').smFixtureIdFromMap(opts.matchId) || null;
    } catch { fixtureId = null; }
  }
  if (!fixtureId) return null;
  const key = String(fixtureId);
  const mem = memCache.get(key);
  if (hasCoords(mem && mem.payload)) {
    return publicPack(Object.assign({}, mem.payload, { cached: true }));
  }
  if (opts.skipDisk) return null;
  const disk = readDisk(fixtureId);
  if (hasCoords(disk && disk.payload)) {
    const packed = Object.assign({}, disk.payload, { cached: true });
    if (!mem) memCache.set(key, { at: disk.savedAt || 0, payload: disk.payload });
    return publicPack(packed);
  }
  return null;
}

/**
 * Main entry. Resolves the already-mapped SM fixture and returns slim coordinates.
 * Tests inject fetchImpl / now / skipDisk.
 */
async function getBallCoords(opts) {
  opts = opts || {};
  const clock = opts.now || Date.now();
  const heat = require('./heat-source');
  const fetchJson = opts.fetchImpl || (heat.readToken() ? heat.smGet : null);
  if (!fetchJson) return publicPack(emptyPack(opts, 'no_key', clock, { ok: false }));

  let resolved;
  try {
    resolved = await resolveSmFixture(opts, fetchJson);
  } catch (e) {
    return publicPack(emptyPack(opts, 'upstream', clock, { ok: false, detail: '实时轨迹暂时不可用' }));
  }
  if (!resolved || !resolved.id) {
    return publicPack(emptyPack(opts, 'no_fixture', clock, { ok: false }));
  }
  const fixtureId = resolved.id;
  const prevMem = memCache.get(String(fixtureId));
  if (!(opts && opts.force) && stillFresh(prevMem, clock)) {
    return publicPack(Object.assign({}, prevMem.payload, { cached: true }));
  }
  const prevDisk = opts.skipDisk ? null : readDisk(fixtureId);
  const prevPayload = (prevMem && prevMem.payload)
    || (prevDisk && prevDisk.payload)
    || null;
  if (!(opts && opts.force) && prevDisk && prevDisk.payload && stillFresh({ at: prevDisk.savedAt, payload: prevDisk.payload }, clock)) {
    const packed = Object.assign({}, prevDisk.payload, { cached: true });
    memCache.set(String(fixtureId), { at: clock, payload: packed });
    return publicPack(packed);
  }

  const key = 'fx:' + String(fixtureId);
  if (inflight.has(key) && !(opts && opts.force)) {
    return inflight.get(key);
  }

  const job = (async () => {
    let fx;
    try {
      const body = await fetchJson(`/football/fixtures/${fixtureId}`, { include: INCLUDE });
      fx = body && (body.data || body);
    } catch (e) {
      const fallback = mergeLastGood(prevPayload, emptyPack(opts, 'upstream', clock, {
        ok: false,
        fixtureId,
        detail: '实时轨迹暂时不可用',
      }));
      memCache.set(String(fixtureId), { at: clock, payload: fallback });
      return publicPack(Object.assign({}, fallback, { cached: !!fallback.keptLastGood }));
    }
    if (!fx) {
      const fallback = mergeLastGood(prevPayload, emptyPack(opts, 'no_fixture', clock, { ok: false, fixtureId }));
      memCache.set(String(fixtureId), { at: clock, payload: fallback });
      if (!opts.skipDisk) writeDisk(fixtureId, fallback);
      return publicPack(fallback);
    }
    let next = packFromFixture(fx, Object.assign({}, opts, { smFixtureId: fixtureId }), clock);
    next = mergeLastGood(prevPayload, next);
    memCache.set(String(fixtureId), { at: clock, payload: next });
    if (!opts.skipDisk) writeDisk(fixtureId, next);
    return publicPack(next);
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

function _resetForTests() {
  inflight.clear();
  memCache.clear();
}

module.exports = {
  LIVE_TTL_MS,
  FT_TTL_MS,
  NEGATIVE_LIVE_MS,
  NEGATIVE_FT_MS,
  MAX_STORE,
  MAX_RETURN,
  INCLUDE,
  normalizeXY,
  parseTimerToSec,
  periodOffsetSec,
  slimPoints,
  classifyState,
  hasCoords,
  mergeLastGood,
  ttlFor,
  stillFresh,
  publicPack,
  packFromFixture,
  emptyPack,
  peekCached,
  getBallCoords,
  resolveSmFixture,
  _resetForTests,
};
