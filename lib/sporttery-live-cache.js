/**
 * Persist last-good official Sporttery live payloads (matches / schedule / results)
 * so a process restart can serve /api/matches and /api/schedule immediately.
 * Never stores sample/demo rows. Token-free. Does not require sm-live-scores.
 *
 * Boot: hydrateCache(cache) synchronously before app.listen.
 * Success path: persistLive(kind, payload, at) after an official refresh.
 * Failure path: do not write; keep serving last-good from memory (and disk on next boot).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const KINDS = ['matches', 'schedule', 'results'];

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheDir() {
  return path.join(dataDir(), 'sporttery-live-cache');
}

function cacheFile(kind) {
  return path.join(cacheDir(), `${kind}.json`);
}

function hasSampleRows(data) {
  if (!Array.isArray(data) || !data.length) return false;
  return data.some((row) => {
    if (!row || typeof row !== 'object') return false;
    if (row.sample === true || row.tag === '示例' || row.demo === true) return true;
    const id = String(row.id || '');
    return /^demo[-_]/i.test(id);
  });
}

function isPersistablePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.source !== 'live') return false;
  if (!Array.isArray(payload.data) || !payload.data.length) return false;
  if (hasSampleRows(payload.data)) return false;
  return true;
}

function cleanLivePayload(payload) {
  const data = payload.data.slice();
  const meta = payload.meta && typeof payload.meta === 'object' ? Object.assign({}, payload.meta) : { total: data.length };
  const out = {
    source: 'live',
    sourceUrl: payload.sourceUrl || '',
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    data,
    meta,
  };
  if (payload.kind) out.kind = payload.kind;
  return out;
}

function load(kind) {
  if (!KINDS.includes(kind)) return null;
  let raw;
  try {
    raw = fs.readFileSync(cacheFile(kind), 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const payload = parsed && parsed.payload && typeof parsed.payload === 'object'
    ? parsed.payload
    : parsed;
  if (!isPersistablePayload(payload)) return null;
  const at = Number(parsed && parsed.at);
  return {
    at: Number.isFinite(at) && at > 0 ? at : 0,
    payload: cleanLivePayload(payload),
  };
}

function save(kind, entry) {
  if (!KINDS.includes(kind)) return false;
  const payload = entry && entry.payload;
  if (!isPersistablePayload(payload)) return false;
  const body = {
    at: Number(entry.at) || Date.now(),
    payload: cleanLivePayload(payload),
  };
  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = cacheFile(kind);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, file);
  return true;
}

function persistLive(kind, payload, at) {
  return save(kind, { at: at || Date.now(), payload });
}

function hydrateCache(cache) {
  const out = cache || {};
  for (const kind of KINDS) {
    const entry = load(kind);
    if (entry) out[kind] = entry;
  }
  return out;
}

module.exports = {
  KINDS,
  dataDir,
  cacheDir,
  cacheFile,
  isPersistablePayload,
  hasSampleRows,
  cleanLivePayload,
  load,
  save,
  persistLive,
  hydrateCache,
};
