/**
 * Official schedule/results/matches fetch failed.
 * Keep the last-good live payload. Never mix sample/demo rows into live data.
 * Only when there is no last-good live cache, return an empty honest state.
 */
'use strict';

function isLivePayload(payload) {
  return !!(payload
    && payload.source === 'live'
    && Array.isArray(payload.data)
    && payload.data.length);
}

function liveFallbackPayload(kind, errors, prevLivePayload) {
  if (isLivePayload(prevLivePayload)) {
    return {
      ...prevLivePayload,
      source: 'live',
      fromCache: true,
      stale: true,
      note: '官方接口暂时不可达，已保留上次成功刷新的场次',
      errors: errors || prevLivePayload.errors || [],
    };
  }
  return {
    source: 'empty',
    note: '无法刷新，暂无场次',
    errors: errors || [],
    fetchedAt: new Date().toISOString(),
    data: [],
    meta: { total: 0, byBusinessDate: {} },
    kind: kind || '',
  };
}

function isUsableLiveCache(cached) {
  if (!cached) return false;
  const src = cached.source || cached.payload && cached.payload.source;
  const data = cached.data || (cached.payload && cached.payload.data);
  return src === 'live' && Array.isArray(data) && data.length > 0;
}

/**
 * Client/server shared decision: given a fresh HTTP payload `incoming`
 * and the last-good live cache `cachedLive`, return the payload to apply.
 * Sample or empty responses must never overwrite a live cache, and sample
 * rows must never be mixed into live rows.
 */
const SILENT_STALE_MS = 30 * 60 * 1000;

function cacheFetchedAtMs(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const iso = payload.fetchedAt;
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isFinite(t) && t > 0) return t;
  const at = Number(payload.at || payload._cachedAt || payload._at);
  return Number.isFinite(at) && at > 0 ? at : 0;
}

function isRecentLiveCache(payload, now, maxAgeMs) {
  if (!isUsableLiveCache(payload)) return false;
  const at = cacheFetchedAtMs(payload);
  if (!at) return false;
  const age = (now != null ? now : Date.now()) - at;
  return age >= 0 && age <= (maxAgeMs != null ? maxAgeMs : SILENT_STALE_MS);
}

function serverStaleNote(payload) {
  return !!(payload && payload.stale && payload.note && /官方接口暂时不可达/.test(String(payload.note)));
}

function acceptMatchPayload(kind, incoming, cachedLive, opts) {
  const j = incoming && typeof incoming === 'object' ? incoming : null;
  if (j && j.source === 'live' && Array.isArray(j.data)) return j;
  if (isUsableLiveCache(cachedLive)) {
    const base = cachedLive.data ? cachedLive : (cachedLive.payload || cachedLive);
    // Client timeout/blip: keep a recent last-good quietly. The orange banner
    // is reserved for an old cache, or a server payload that already carries
    // the official-unreachable note after a real upstream failure.
    const silent = !!(opts && opts.silentIfRecent)
      && !serverStaleNote(j)
      && isRecentLiveCache(base, opts.now, opts.silentMs);
    if (silent) {
      return Object.assign({}, base, {
        fromCache: true,
        stale: true,
        silentStale: true,
      });
    }
    return Object.assign({}, base, {
      fromCache: true,
      stale: true,
      note: (j && j.note) || '官方接口暂时不可达，已保留上次成功刷新的场次',
    });
  }
  if (j && j.source === 'sample') {
    return {
      source: 'empty',
      local: true,
      note: '无法刷新，暂无场次',
      fetchedAt: new Date().toISOString(),
      data: [],
      kind: kind || '',
    };
  }
  if (j && Array.isArray(j.data)) {
    if (j.source === 'empty' || !j.data.length) {
      return Object.assign({}, j, { source: j.source || 'empty', data: j.data || [] });
    }
    return j;
  }
  return {
    source: 'empty',
    local: true,
    note: '无法刷新，暂无场次',
    fetchedAt: new Date().toISOString(),
    data: [],
    kind: kind || '',
  };
}

module.exports = {
  isLivePayload,
  liveFallbackPayload,
  isUsableLiveCache,
  acceptMatchPayload,
  isRecentLiveCache,
  cacheFetchedAtMs,
  serverStaleNote,
  SILENT_STALE_MS,
};
