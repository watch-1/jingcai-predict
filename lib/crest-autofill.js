// 1.9.53: Auto-fill missing sporttery team badges into data/crests.json.
// Sources (compliant only): existing TSDB badge already on the row → ESPN soccer/500 → API-Football media.
// Never blocks match APIs; queue is async with rate limits, dedupe, and failure backoff.
// TheSportsDB search is 403 — do not call it. No 7M scrape.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const CRESTS_FILE = () => path.join(DATA_DIR, 'crests.json');
const FAIL_FILE = () => path.join(DATA_DIR, 'live-stats', 'crest-autofill-fail.json');

const MIN_GAP_MS = 900;
const VERIFY_TIMEOUT_MS = 10000;
const MAX_IMG_BYTES = 1024 * 1024;
const FAIL_BACKOFF_MS = [60 * 60e3, 6 * 3600e3, 24 * 3600e3]; // 1h → 6h → 24h
const NEGATIVE_TTL_MS = 24 * 3600e3;

/** @type {Map<string, { zh?: string, en?: string }>} */
const pending = new Map();
/** @type {Set<string>} */
const inflight = new Set();
/** @type {Map<string, { at: number, fails: number, reason?: string }>} */
let failCache = null;
let busy = false;
let started = false;
let lastCallAt = 0;
/** @type {null | (() => void)} */
let onReload = null;
/** @type {null | ((id: string) => boolean)} */
let hasUsable = null;

function readJson(file, fb) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; }
}
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
function loadFailCache() {
  if (failCache) return failCache;
  const j = readJson(FAIL_FILE(), {});
  failCache = new Map(Object.entries(j || {}));
  return failCache;
}
function saveFailCache() {
  const o = {};
  for (const [k, v] of loadFailCache()) o[k] = v;
  try { writeJsonAtomic(FAIL_FILE(), o); } catch (e) { console.warn('[crest-autofill] fail-cache save', e.message); }
}

function sniffImage(buf) {
  if (!buf || buf.length < 16) return '';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

async function verifyImageUrl(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 jingcai-crest-autofill',
        Accept: 'image/png,image/jpeg,image/webp,image/*,*/*;q=0.8',
      },
    });
    if (!r.ok) return false;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_IMG_BYTES) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64 || buf.length > MAX_IMG_BYTES) return false;
    return !!sniffImage(buf);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function pace() {
  const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

function loadCrestsDoc() {
  const j = readJson(CRESTS_FILE(), null);
  if (!j || typeof j !== 'object') return { source: 'thesportsdb+api-football+espn', verified: new Date().toISOString().slice(0, 10), teams: {} };
  if (!j.teams || typeof j.teams !== 'object') j.teams = {};
  return j;
}

function rowHasUsableBadge(row) {
  if (!row) return false;
  if (typeof row.badge === 'string' && row.badge.trim()) return true;
  if (row.afTeamId != null && Number(row.afTeamId) > 0) return true;
  return false;
}

function markFail(id, reason) {
  const m = loadFailCache();
  const prev = m.get(id) || { fails: 0 };
  const fails = (prev.fails || 0) + 1;
  m.set(id, { at: Date.now(), fails, reason: String(reason || '').slice(0, 200) });
  saveFailCache();
}
function clearFail(id) {
  const m = loadFailCache();
  if (m.has(id)) { m.delete(id); saveFailCache(); }
}
function inBackoff(id) {
  const m = loadFailCache().get(id);
  if (!m || !m.at) return false;
  const idx = Math.min((m.fails || 1) - 1, FAIL_BACKOFF_MS.length - 1);
  const ttl = m.reason === 'no_candidates' ? NEGATIVE_TTL_MS : FAIL_BACKOFF_MS[Math.max(0, idx)];
  return Date.now() - m.at < ttl;
}

function nameCandidates(teamId, zh, en) {
  const out = [];
  const push = (x) => {
    const s = String(x || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(en);
  try {
    const doc = loadCrestsDoc();
    const row = doc.teams[String(teamId)];
    if (row) { push(row.en); push(row.zh); }
  } catch { /* ignore */ }
  push(zh);
  try {
    const { espnCandidates } = require('./match-stats');
    for (const c of espnCandidates(teamId, zh) || []) push(c);
  } catch { /* ignore */ }
  try {
    const ps = require('./process-stats');
    if (zh && ps.AF_ZH_EN && ps.AF_ZH_EN[zh]) push(ps.AF_ZH_EN[zh]);
  } catch { /* ignore */ }
  try {
    const live = require('./live-stats');
    if (zh && live.localAfTeamId) { /* name only */ }
  } catch { /* ignore */ }
  // ASCII-looking fragments from zh (rare)
  const ascii = String(zh || '').match(/[A-Za-z][A-Za-z .'-]{2,}/g);
  if (ascii) ascii.forEach((x) => push(x.trim()));
  return out;
}

async function tryEspnBadge(teamId, candidates) {
  let espn;
  try { espn = require('./espn-form'); } catch { return null; }
  await pace();
  const hit = await espn.resolveTeam(String(teamId), candidates);
  if (!hit || !hit.id) return null;
  const url = `https://a.espncdn.com/i/teamlogos/soccer/500/${hit.id}.png`;
  await pace();
  if (!(await verifyImageUrl(url))) return null;
  return { badge: url, source: 'espn', espnId: String(hit.id), en: hit.name || '' };
}

async function tryAfBadge(teamId, candidates, zh) {
  let live;
  try { live = require('./live-stats'); } catch { return null; }
  if (!live.apiKeyPresent || !live.apiKeyPresent()) return null;
  const nameEn = candidates.find((c) => /^[A-Za-z0-9]/.test(c)) || candidates[0] || '';
  await pace();
  const entry = await live.resolveAfTeamId({
    sportteryTeamId: String(teamId),
    nameEn,
    nameZh: zh || '',
    allowFetch: true,
  });
  if (!entry || !entry.afTeamId) return null;
  const afId = Number(entry.afTeamId);
  if (!(afId > 0)) return null;
  const url = `https://media.api-sports.io/football/teams/${afId}.png`;
  await pace();
  if (!(await verifyImageUrl(url))) return null;
  return { badge: url, source: 'api-football', afTeamId: afId, en: entry.afName || nameEn || '' };
}

async function tryExistingAfOrBadge(row) {
  if (!row) return null;
  if (typeof row.badge === 'string' && row.badge.trim()) {
    await pace();
    if (await verifyImageUrl(row.badge.trim())) {
      return { badge: row.badge.trim(), source: 'existing-badge', afTeamId: row.afTeamId, en: row.en || '' };
    }
  }
  const afId = row.afTeamId != null ? Number(row.afTeamId) : 0;
  if (afId > 0) {
    const url = `https://media.api-sports.io/football/teams/${afId}.png`;
    await pace();
    if (await verifyImageUrl(url)) {
      return { badge: url, source: 'api-football-seed', afTeamId: afId, en: row.en || '' };
    }
  }
  // AF_TEAM_SEED without crest row
  return null;
}

async function resolveOne(teamId, meta) {
  const id = String(teamId);
  const doc = loadCrestsDoc();
  const row = doc.teams[id] || null;
  if (rowHasUsableBadge(row) && row.badge) {
    // already good on disk — still hot-reload maps in case memory was stale
    return { skipped: true, reason: 'already_has_badge' };
  }

  const existing = await tryExistingAfOrBadge(row);
  let found = existing;

  const cands = nameCandidates(id, meta.zh, meta.en || (row && row.en) || '');
  if (!found) {
    // Prefer ESPN (500px) over AF (~150)
    found = await tryEspnBadge(id, cands);
  }
  if (!found) {
    found = await tryAfBadge(id, cands, meta.zh || (row && row.zh) || '');
  }
  // Seed AF id from match-stats even without name
  if (!found) {
    try {
      const seed = require('./match-stats').AF_TEAM_SEED;
      const afId = seed && seed[id] ? Number(seed[id]) : 0;
      if (afId > 0) {
        const url = `https://media.api-sports.io/football/teams/${afId}.png`;
        await pace();
        if (await verifyImageUrl(url)) {
          found = { badge: url, source: 'api-football-seed', afTeamId: afId, en: (row && row.en) || cands[0] || '' };
        }
      }
    } catch { /* ignore */ }
  }

  if (!found || !found.badge) {
    const reason = cands.length ? 'resolve_failed' : 'no_candidates';
    markFail(id, reason);
    console.warn('[crest-autofill] fail', id, meta.zh || meta.en || '', reason, 'cands=', cands.slice(0, 3).join('|'));
    return { ok: false, reason };
  }

  const next = { ...(row || {}) };
  if (found.en && !next.en) next.en = found.en;
  if (meta.zh && !next.zh) next.zh = String(meta.zh);
  next.badge = found.badge;
  if (found.afTeamId) next.afTeamId = Number(found.afTeamId);
  if (found.espnId) next.espnId = String(found.espnId);
  next.filledAt = new Date().toISOString();
  next.filledFrom = found.source;

  doc.teams[id] = next;
  doc.verified = new Date().toISOString().slice(0, 10);
  if (!doc.source) doc.source = 'thesportsdb+api-football+espn';
  writeJsonAtomic(CRESTS_FILE(), doc);
  clearFail(id);
  if (typeof onReload === 'function') {
    try { onReload(); } catch (e) { console.warn('[crest-autofill] reload', e.message); }
  }
  console.log('[crest-autofill] filled', id, next.en || next.zh || '', 'via', found.source, found.badge.slice(0, 80));
  return { ok: true, source: found.source, badge: found.badge };
}

async function pump() {
  if (!started || busy) return;
  busy = true;
  try {
    while (pending.size) {
      const id = pending.keys().next().value;
      const meta = pending.get(id) || {};
      pending.delete(id);
      if (inflight.has(id)) continue;
      if (typeof hasUsable === 'function' && hasUsable(id)) continue;
      if (inBackoff(id)) continue;
      inflight.add(id);
      try {
        await resolveOne(id, meta);
      } catch (e) {
        markFail(id, e.message || 'error');
        console.warn('[crest-autofill] error', id, e.message);
      } finally {
        inflight.delete(id);
      }
    }
  } finally {
    busy = false;
    if (pending.size) setTimeout(() => { pump().catch(() => {}); }, MIN_GAP_MS);
  }
}

/**
 * Queue a sporttery team id for badge resolve. No-op until start().
 * Never throws; never blocks the caller.
 */
function enqueue(teamId, meta = {}) {
  if (!started) return;
  const id = String(teamId || '').trim();
  if (!/^\d+$/.test(id) || id === '0') return;
  if (typeof hasUsable === 'function' && hasUsable(id)) return;
  if (inBackoff(id)) return;
  if (inflight.has(id)) return;
  const prev = pending.get(id) || {};
  pending.set(id, {
    zh: meta.zh || prev.zh || '',
    en: meta.en || prev.en || '',
  });
  setImmediate(() => { pump().catch(() => {}); });
}

/** Scan schedule/match rows for missing badges (async fill). */
function sweepMatches(list) {
  if (!started || !Array.isArray(list)) return { queued: 0 };
  let queued = 0;
  for (const m of list) {
    if (!m) continue;
    for (const side of ['home', 'away']) {
      const tid = m[side + 'TeamId'];
      const zh = m[side];
      const id = String(tid || '').trim();
      if (!/^\d+$/.test(id) || id === '0') continue;
      if (typeof hasUsable === 'function' && hasUsable(id)) continue;
      const before = pending.size;
      enqueue(id, { zh });
      if (pending.size > before || inflight.has(id)) queued++;
    }
  }
  return { queued };
}

/**
 * @param {{ onReload?: () => void, hasUsable?: (id: string) => boolean }} opts
 */
function start(opts = {}) {
  if (opts.onReload) onReload = opts.onReload;
  if (opts.hasUsable) hasUsable = opts.hasUsable;
  started = true;
  console.log('[crest-autofill] started');
  setImmediate(() => { pump().catch(() => {}); });
}

function status() {
  return {
    started,
    pending: pending.size,
    inflight: [...inflight],
    fails: loadFailCache().size,
  };
}

module.exports = {
  start,
  enqueue,
  sweepMatches,
  status,
  verifyImageUrl,
  CRESTS_FILE,
  // test helpers
  _resolveOne: resolveOne,
  _nameCandidates: nameCandidates,
  _resetForTest() {
    started = false;
    pending.clear();
    inflight.clear();
    failCache = null;
    busy = false;
    onReload = null;
    hasUsable = null;
  },
};
