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
function acceptMatchPayload(kind, incoming, cachedLive) {
  const j = incoming && typeof incoming === 'object' ? incoming : null;
  if (j && j.source === 'live' && Array.isArray(j.data)) return j;
  if (isUsableLiveCache(cachedLive)) {
    const base = cachedLive.data ? cachedLive : (cachedLive.payload || cachedLive);
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
};
