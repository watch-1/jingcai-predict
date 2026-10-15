// 1.9.13: Shared server-side live odds sheet (full pools) with tiered refresh.
// One poller for all clients. Never invents odds. Stops after kickoff (snapshot takes over).
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const snap = require('./odds-snapshot');

const CACHE_FILE = () => path.join(DATA_DIR, 'odds-live', 'sheet.json');
const POOL_QUERY = 'hhad,had,crs,ttg,hafu';

/** Tiered intervals by time-to-kickoff of the nearest Selling match. */
const TIERS = [
  { maxMs: 30 * 60e3, intervalMs: 90e3, label: '末30分钟·约1.5分' },
  { maxMs: 2 * 3600e3, intervalMs: 5 * 60e3, label: '2小时内·约5分' },
  { maxMs: 6 * 3600e3, intervalMs: 12 * 60e3, label: '6小时内·约12分' },
  { maxMs: Infinity, intervalMs: 45 * 60e3, label: '更早·约45分' },
];

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o));
  fs.renameSync(f + '.tmp', f);
}

let _fetchJson = null;
let _base = '';
let _state = {
  updatedAt: null,
  fetchedAt: null,
  tier: null,
  intervalMs: TIERS[TIERS.length - 1].intervalMs,
  minToKickMs: null,
  matchCount: 0,
  byId: {}, // matchId -> sheet row
  lastError: null,
  backoffUntil: 0,
};
let _timer = null;
let _running = false;

function configure({ fetchJson, base }) {
  _fetchJson = fetchJson;
  _base = base || 'https://webapi.sporttery.cn';
  // hydrate from disk
  const disk = readJson(CACHE_FILE(), null);
  if (disk && disk.byId) {
    _state.byId = disk.byId;
    _state.updatedAt = disk.updatedAt || null;
    _state.fetchedAt = disk.fetchedAt || null;
    _state.matchCount = Object.keys(_state.byId).length;
  }
}

function pickTier(minToKickMs) {
  if (minToKickMs == null || !Number.isFinite(minToKickMs) || minToKickMs < 0) {
    return TIERS[TIERS.length - 1];
  }
  for (const t of TIERS) {
    if (minToKickMs <= t.maxMs) return t;
  }
  return TIERS[TIERS.length - 1];
}

/** Suggested TTL for /api/matches HAD/HHAD cache (ms). */
function suggestedMatchesCacheMs(scheduleList) {
  const now = Date.now();
  let min = Infinity;
  for (const m of scheduleList || []) {
    if (!m || !m.date || !m.time) continue;
    if (m.status && !/sell/i.test(String(m.status))) continue;
    const ko = snap.kickoffMs(m.date, m.time);
    if (!Number.isFinite(ko) || ko <= now) continue;
    min = Math.min(min, ko - now);
  }
  if (!Number.isFinite(min)) return 30 * 60e3;
  return pickTier(min).intervalMs;
}

async function fetchCalculator() {
  if (!_fetchJson) throw new Error('odds-live not configured');
  const paths = [
    `/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=${POOL_QUERY}&channel=c`,
    `/gateway/uniform/football/getMatchCalculatorV1.qry?poolCode=${POOL_QUERY}&channel=c`,
  ];
  let lastErr;
  for (const p of paths) {
    try {
      return await _fetchJson(_base + p);
    } catch (e) {
      lastErr = e;
      if (/403|429|567|EdgeOne/i.test(String(e.message || e))) break;
    }
  }
  throw lastErr || new Error('calculator failed');
}

function extractRows(j) {
  const rows = [];
  for (const day of (j.value && j.value.matchInfoList) || []) {
    for (const m of day.subMatchList || []) {
      const pools = snap.normalizePools(m);
      if (!snap.hasAnyPool(pools)) continue;
      const id = String(m.matchId);
      rows.push({
        matchId: id,
        date: m.matchDate,
        time: (m.matchTime || '').slice(0, 5),
        businessDate: m.businessDate || day.businessDate || '',
        num: m.matchNumStr || m.matchNum || '',
        league: m.leagueAbbName || m.leagueAllName || '',
        home: m.homeTeamAbbName || m.homeTeamAllName || '',
        away: m.awayTeamAbbName || m.awayTeamAllName || '',
        homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
        awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
        status: m.matchStatus || m.sellStatus || '',
        kickoffAt: (() => {
          const ko = snap.kickoffMs(m.matchDate, (m.matchTime || '').slice(0, 5));
          return Number.isFinite(ko) ? new Date(ko).toISOString() : null;
        })(),
        pools,
      });
    }
  }
  return rows;
}

function minToKickFromRows(rows, now = Date.now()) {
  let min = Infinity;
  for (const r of rows) {
    const ko = r.kickoffAt ? Date.parse(r.kickoffAt) : snap.kickoffMs(r.date, r.time);
    if (!Number.isFinite(ko) || ko <= now) continue;
    if (r.status && !/sell/i.test(String(r.status))) continue;
    min = Math.min(min, ko - now);
  }
  return Number.isFinite(min) ? min : null;
}

async function refresh(reason = 'manual') {
  if (_running) return { skipped: true, reason: 'busy' };
  if (Date.now() < _state.backoffUntil) {
    return { skipped: true, reason: 'backoff', until: _state.backoffUntil };
  }
  _running = true;
  const t0 = Date.now();
  try {
    const j = await fetchCalculator();
    const rows = extractRows(j);
    const nowIso = new Date().toISOString();
    // Keep last good sheet if official calculator returns a successful empty list
    // (transient gaps were wiping 在售全玩法 and leaving matchCount=0 until restart).
    if (rows.length === 0) {
      const prevN = Object.keys(_state.byId || {}).length;
      if (prevN > 0) {
        _state.fetchedAt = nowIso;
        _state.lastError = '官方计算器短暂返回空列表，已保留上次全玩法缓存';
        console.warn('[odds-live]', reason, `empty keep n=${prevN}`);
        return { ok: false, kept: prevN, error: 'empty-keep' };
      }
    }
    const byId = {};
    for (const r of rows) byId[r.matchId] = r;
    const minToKickMs = minToKickFromRows(rows);
    const tier = pickTier(minToKickMs);
    _state = {
      updatedAt: nowIso,
      fetchedAt: nowIso,
      tier: tier.label,
      intervalMs: tier.intervalMs,
      minToKickMs,
      matchCount: rows.length,
      byId,
      lastError: null,
      backoffUntil: 0,
    };
    try { writeJson(CACHE_FILE(), { updatedAt: nowIso, fetchedAt: nowIso, tier: tier.label, intervalMs: tier.intervalMs, matchCount: rows.length, byId }); } catch {}

    // Feed near-KO pre-kick snapshots from the same pull (no extra sporttery hit)
    const now = Date.now();
    let pre = 0;
    for (const r of rows) {
      const ko = r.kickoffAt ? Date.parse(r.kickoffAt) : NaN;
      if (!Number.isFinite(ko)) continue;
      const delta = ko - now;
      if (delta > 0 && delta <= 15 * 60e3) {
        try {
          snap.saveSnapshot({
            ok: true,
            matchId: r.matchId,
            date: r.date,
            time: r.time,
            businessDate: r.businessDate,
            num: r.num,
            league: r.league,
            home: r.home,
            away: r.away,
            homeTeamId: r.homeTeamId,
            awayTeamId: r.awayTeamId,
            kickoffAt: r.kickoffAt,
            snappedAt: nowIso,
            kind: 'pre-kick',
            source: 'sporttery',
            noteZh: '开赛赔率快照来自中国体育彩票公开接口，仅供查阅，不提供投注/出票服务。',
            pools: r.pools,
          });
          pre++;
        } catch {}
      }
    }
    console.log('[odds-live]', reason, `n=${rows.length} tier=${tier.label} pre=${pre} ${Date.now() - t0}ms`);
    return { ok: true, matchCount: rows.length, tier: tier.label, intervalMs: tier.intervalMs, pre, ms: Date.now() - t0 };
  } catch (e) {
    _state.lastError = e.message || String(e);
    // Back off on ban/rate-limit
    if (/403|429|567|EdgeOne/i.test(_state.lastError)) {
      _state.backoffUntil = Date.now() + 10 * 60e3;
      _state.intervalMs = Math.max(_state.intervalMs, 10 * 60e3);
    }
    console.warn('[odds-live]', reason, _state.lastError);
    return { ok: false, error: _state.lastError };
  } finally {
    _running = false;
    armTimer();
  }
}

function armTimer() {
  if (_timer) clearTimeout(_timer);
  const wait = Math.max(30e3, _state.intervalMs || 45 * 60e3);
  _timer = setTimeout(() => { refresh('tier').catch(() => {}); }, wait);
}

function start({ getSchedule } = {}) {
  // initial refresh after short delay; then self-arming
  setTimeout(() => { refresh('startup').catch(() => {}); }, 40e3);
  // also re-evaluate tier every 2 min without necessarily fetching (adjust timer if nearer)
  setInterval(() => {
    const min = minToKickFromRows(Object.values(_state.byId));
    const tier = pickTier(min);
    if (tier.intervalMs !== _state.intervalMs) {
      _state.intervalMs = tier.intervalMs;
      _state.tier = tier.label;
      _state.minToKickMs = min;
      armTimer();
    }
  }, 120e3);
}

function status() {
  return {
    ok: true,
    updatedAt: _state.updatedAt,
    fetchedAt: _state.fetchedAt,
    tier: _state.tier,
    intervalMs: _state.intervalMs,
    minToKickMs: _state.minToKickMs,
    matchCount: _state.matchCount,
    lastError: _state.lastError,
    backoffUntil: _state.backoffUntil || null,
    noteZh: '赛前全玩法赔率由服务器统一分层刷新，客户端共享缓存；开赛后停止刷新，以开赛快照为准。',
  };
}

function get(matchId) {
  const id = String(matchId || '');
  const row = _state.byId[id];
  if (!row) {
    return {
      ok: false,
      reason: 'missing',
      matchId: id,
      live: true,
      updatedAt: _state.updatedAt,
      tier: _state.tier,
      intervalMs: _state.intervalMs,
      error: '暂无在售全玩法赔率（可能未开售、已开赛下架，或缓存尚未刷新）',
      noteZh: '开赛前展示实时（分层刷新）赔率；开赛后请查看开赛快照。',
    };
  }
  const ko = row.kickoffAt ? Date.parse(row.kickoffAt) : snap.kickoffMs(row.date, row.time);
  const started = Number.isFinite(ko) && Date.now() >= ko;
  return {
    ok: true,
    live: !started,
    kind: started ? 'stale-after-kickoff' : 'live',
    matchId: row.matchId,
    date: row.date,
    time: row.time,
    num: row.num,
    league: row.league,
    home: row.home,
    away: row.away,
    kickoffAt: row.kickoffAt,
    pools: row.pools,
    updatedAt: _state.updatedAt,
    fetchedAt: _state.fetchedAt,
    tier: _state.tier,
    intervalMs: _state.intervalMs,
    cacheAgeSec: _state.updatedAt ? Math.round((Date.now() - Date.parse(_state.updatedAt)) / 1000) : null,
    noteZh: started
      ? '本场已开赛，在售赔率可能已下架；请以「开赛快照」为准。'
      : '赛前实时赔率（服务器分层刷新，全用户共享）。仅供查阅，无投注服务。',
  };
}

module.exports = {
  configure, start, refresh, get, status, suggestedMatchesCacheMs, pickTier, TIERS,
};
