// 1.9.12: Snapshot sporttery odds near kickoff (HAD/HHAD/CRS/TTG/HAFU). Never invents odds.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const DIR = () => path.join(DATA_DIR, 'odds-snapshots');
const RETAIN_DAYS = 90;
const POOL_QUERY = 'hhad,had,crs,ttg,hafu';
const NEAR_MS = 15 * 60e3;       // arm polling within 15 min of KO
const POLL_NEAR_MS = 90e3;       // poll every ~90s when near
const POLL_IDLE_MS = 3 * 60e3;   // otherwise every 3 min
const PRE_WINDOW_MS = 3 * 60e3;  // keep rolling pre-kick within 3 min of KO

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o));
  fs.renameSync(f + '.tmp', f);
}
function snapPath(date, matchId) {
  return path.join(DIR(), String(date || 'unknown'), String(matchId) + '.json');
}

const f = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function pickHad(o) {
  if (!o || o.h == null || o.h === '') return null;
  return { h: f(o.h), d: f(o.d), a: f(o.a), goalLine: o.goalLine ? String(o.goalLine) : '', updateDate: o.updateDate || '', updateTime: o.updateTime || '' };
}
function pickHhad(o) {
  const base = pickHad(o);
  return base;
}
function pickTtg(o) {
  if (!o) return null;
  const out = { updateDate: o.updateDate || '', updateTime: o.updateTime || '' };
  let n = 0;
  for (let i = 0; i <= 7; i++) {
    const k = 's' + i;
    const v = f(o[k]);
    out[k] = v;
    if (v != null) n++;
  }
  return n ? out : null;
}
function pickHafu(o) {
  if (!o) return null;
  const keys = ['hh', 'hd', 'ha', 'dh', 'dd', 'da', 'ah', 'ad', 'aa'];
  const out = { updateDate: o.updateDate || '', updateTime: o.updateTime || '' };
  let n = 0;
  for (const k of keys) {
    out[k] = f(o[k]);
    if (out[k] != null) n++;
  }
  return n ? out : null;
}
function pickCrs(o) {
  if (!o) return null;
  const out = { updateDate: o.updateDate || '', updateTime: o.updateTime || '' };
  let n = 0;
  for (const [k, v] of Object.entries(o)) {
    if (k.endsWith('f') || k === 'goalLine' || k === 'goalLineValue' || k === 'updateDate' || k === 'updateTime') continue;
    if (/^s\d/.test(k) || /^s1s/.test(k)) {
      out[k] = f(v);
      if (out[k] != null) n++;
    }
  }
  return n ? out : null;
}

function normalizePools(raw) {
  return {
    had: pickHad(raw.had),
    hhad: pickHhad(raw.hhad),
    ttg: pickTtg(raw.ttg),
    hafu: pickHafu(raw.hafu),
    crs: pickCrs(raw.crs),
  };
}
function hasAnyPool(pools) {
  return !!(pools && (pools.had || pools.hhad || pools.ttg || pools.hafu || pools.crs));
}

/** Kickoff instant in Asia/Shanghai from date+time (HH:mm). */
function kickoffMs(date, time) {
  const t = String(time || '00:00').slice(0, 5);
  const iso = `${date}T${t}:00+08:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : NaN;
}

function loadSnapshot(matchId, dateHint) {
  const id = String(matchId || '');
  if (!id) return null;
  if (dateHint) {
    const hit = readJson(snapPath(dateHint, id), null);
    if (hit) return hit;
  }
  // scan recent days
  try {
    const root = DIR();
    if (!fs.existsSync(root)) return null;
    const days = fs.readdirSync(root).sort().reverse().slice(0, RETAIN_DAYS);
    for (const d of days) {
      const hit = readJson(snapPath(d, id), null);
      if (hit) return hit;
    }
  } catch {}
  return null;
}

function listByDate(date) {
  const dir = path.join(DIR(), String(date || ''));
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = readJson(path.join(dir, f), null);
    if (j) out.push({
      matchId: j.matchId, date: j.date, time: j.time, home: j.home, away: j.away,
      league: j.league, num: j.num, kind: j.kind, snappedAt: j.snappedAt,
      hasHad: !!(j.pools && j.pools.had), hasCrs: !!(j.pools && j.pools.crs),
    });
  }
  return out.sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

function saveSnapshot(payload) {
  if (!payload || !payload.matchId || !payload.date) return null;
  if (!hasAnyPool(payload.pools)) return null;
  const existing = loadSnapshot(payload.matchId, payload.date);
  // Never overwrite a finalized kickoff/backfill with a weaker pre-kick
  if (existing && (existing.kind === 'kickoff' || existing.kind === 'backfill') && payload.kind === 'pre-kick') {
    return existing;
  }
  // Prefer kickoff over pre-kick; allow backfill only if nothing better
  if (existing && existing.kind === 'kickoff' && payload.kind !== 'kickoff') return existing;
  writeJson(snapPath(payload.date, payload.matchId), payload);
  return payload;
}

function buildPayload(m, pools, kind) {
  const ko = kickoffMs(m.date, m.time);
  return {
    ok: true,
    matchId: String(m.id || m.matchId),
    date: m.date,
    time: m.time,
    businessDate: m.businessDate || '',
    weekday: m.weekday || '',
    num: m.num || '',
    league: m.league || '',
    home: m.home || '',
    away: m.away || '',
    homeTeamId: m.homeTeamId || '',
    awayTeamId: m.awayTeamId || '',
    kickoffAt: Number.isFinite(ko) ? new Date(ko).toISOString() : null,
    snappedAt: new Date().toISOString(),
    kind: kind || 'kickoff',
    source: 'sporttery',
    noteZh: '开赛赔率快照来自中国体育彩票公开接口，仅供查阅，不提供投注/出票服务。',
    pools,
  };
}

/** Injected by server: fetchJson(url) + BASE */
let _fetchJson = null;
let _base = '';
function configure({ fetchJson, base }) {
  _fetchJson = fetchJson;
  _base = base || 'https://webapi.sporttery.cn';
}

async function fetchCalculatorRaw() {
  if (!_fetchJson) throw new Error('odds-snapshot not configured');
  const paths = [
    `/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=${POOL_QUERY}&channel=c`,
    `/gateway/uniform/football/getMatchCalculatorV1.qry?poolCode=${POOL_QUERY}&channel=c`,
  ];
  let lastErr;
  for (const p of paths) {
    try {
      return await _fetchJson(_base + p);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('calculator failed');
}

function extractMatchMap(j) {
  const map = new Map();
  for (const day of (j.value && j.value.matchInfoList) || []) {
    for (const m of day.subMatchList || []) {
      const id = String(m.matchId);
      map.set(id, {
        id,
        num: m.matchNumStr || m.matchNum,
        league: m.leagueAbbName || m.leagueAllName,
        date: m.matchDate,
        time: (m.matchTime || '').slice(0, 5),
        businessDate: m.businessDate || day.businessDate,
        weekday: m.matchWeek || day.weekday || '',
        home: m.homeTeamAbbName || m.homeTeamAllName,
        away: m.awayTeamAbbName || m.awayTeamAllName,
        homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
        awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
        status: m.matchStatus || m.sellStatus || '',
        pools: normalizePools(m),
      });
    }
  }
  return map;
}

const preKickMem = new Map(); // matchId -> payload
let lastCalcAt = 0;
let lastCalcMap = null;
let tickRunning = false;

async function refreshCalc(force) {
  if (!force && lastCalcMap && Date.now() - lastCalcAt < 50e3) return lastCalcMap;
  const j = await fetchCalculatorRaw();
  lastCalcMap = extractMatchMap(j);
  lastCalcAt = Date.now();
  return lastCalcMap;
}

function maybeSnapshotFromRow(row, kind) {
  if (!row || !hasAnyPool(row.pools)) return null;
  const payload = buildPayload(row, row.pools, kind);
  return saveSnapshot(payload);
}

/**
 * Main tick: given schedule/matches list [{id,date,time,status,home,away,...}],
 * poll calculator near kickoff and persist snapshots.
 */
async function tick({ schedule = [], matches = [] } = {}) {
  if (tickRunning) return { skipped: true };
  tickRunning = true;
  const now = Date.now();
  const byId = new Map();
  for (const m of [...schedule, ...matches]) {
    if (!m || !m.id) continue;
    byId.set(String(m.id), m);
  }
  const near = [];
  const due = [];
  const today = new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
  for (const m of byId.values()) {
    const ko = kickoffMs(m.date, m.time);
    if (!Number.isFinite(ko)) continue;
    const existing = loadSnapshot(m.id, m.date);
    if (existing && (existing.kind === 'kickoff' || existing.kind === 'backfill')) continue;
    const delta = ko - now;
    // Only care about today (or last 3h) — avoid scanning entire retained schedule every tick
    const recentPast = delta <= 0 && delta > -3 * 3600e3;
    const isToday = String(m.date) === today;
    if (delta > 0 && delta <= NEAR_MS) near.push(m);
    else if (isToday && (recentPast || (delta <= 0 && m.status && !/sell/i.test(String(m.status))))) due.push(m);
  }
  let fetched = 0, saved = 0, pre = 0;
  try {
    if (near.length || due.length) {
      const map = await refreshCalc(true);
      fetched = map.size;
      for (const m of near) {
        const row = map.get(String(m.id));
        if (!row || !hasAnyPool(row.pools)) continue;
        const payload = buildPayload(row, row.pools, 'pre-kick');
        preKickMem.set(String(m.id), payload);
        // Persist rolling pre-kick while in the 15min window (promoted to kickoff when due)
        saveSnapshot(payload);
        pre++;
      }
      for (const m of due) {
        const row = map.get(String(m.id));
        let payload = null;
        if (row && hasAnyPool(row.pools)) {
          payload = maybeSnapshotFromRow(row, 'kickoff');
        } else if (preKickMem.has(String(m.id))) {
          const prev = preKickMem.get(String(m.id));
          payload = saveSnapshot({ ...prev, kind: 'kickoff', snappedAt: new Date().toISOString() });
        }
        if (payload) { saved++; preKickMem.delete(String(m.id)); }
      }
    }
  } finally { tickRunning = false; }
  return { near: near.length, due: due.length, fetched, saved, pre };
}

/** One-shot backfill for already-started matches today without snapshot. */
async function backfillToday(scheduleList) {
  const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const now = Date.now();
  const need = (scheduleList || []).filter(m => {
    if (!m || !m.id || m.date !== today) return false;
    const ko = kickoffMs(m.date, m.time);
    if (!Number.isFinite(ko) || ko > now) return false;
    const ex = loadSnapshot(m.id, m.date);
    return !ex;
  });
  if (!need.length) return { tried: 0, saved: 0 };
  let saved = 0;
  try {
    const map = await refreshCalc(true);
    for (const m of need) {
      const row = map.get(String(m.id));
      if (row && hasAnyPool(row.pools)) {
        if (maybeSnapshotFromRow(row, 'backfill')) saved++;
      }
    }
  } catch (e) {
    console.warn('odds-snapshot backfill', e.message);
  }
  return { tried: need.length, saved };
}

function pruneOld() {
  try {
    const root = DIR();
    if (!fs.existsSync(root)) return { removed: 0 };
    const cutoff = new Date(Date.now() + 8 * 3600e3 - RETAIN_DAYS * 864e5).toISOString().slice(0, 10);
    let removed = 0;
    for (const d of fs.readdirSync(root)) {
      if (d < cutoff) {
        fs.rmSync(path.join(root, d), { recursive: true, force: true });
        removed++;
      }
    }
    return { removed };
  } catch (e) { return { removed: 0, error: e.message }; }
}

function get(matchId, date) {
  const snap = loadSnapshot(matchId, date);
  if (!snap) {
    return {
      ok: false,
      reason: 'missing',
      matchId: String(matchId || ''),
      error: '暂无开赛赔率快照',
      noteZh: '开赛后系统会自动保存当时竞彩赔率；历史场次若未抓取成功则无法补造。仅供查阅，无投注服务。',
    };
  }
  return snap;
}

module.exports = {
  configure, get, listByDate, tick, backfillToday, pruneOld,
  loadSnapshot, saveSnapshot, kickoffMs, normalizePools, hasAnyPool,
  RETAIN_DAYS, NEAR_MS, POLL_NEAR_MS, POLL_IDLE_MS,
};
