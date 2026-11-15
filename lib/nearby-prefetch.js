/**
 * Prefetch weather / odds / reports / club logos for a nearby date window
 * (default: two days back through two days forward in Asia/Shanghai),
 * so flipping 赛程/比分 day tabs does not wait on a live third-party fetch.
 * National-team flags are bundled and must not depend on a SportMonks logo fetch.
 */
'use strict';

function bjDate(offset, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(now));
  const y = Number(parts.find((p) => p.type === 'year').value);
  const mo = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const utc = Date.UTC(y, mo - 1, d + (offset || 0));
  return new Date(utc).toISOString().slice(0, 10);
}

function matchBizDate(m) {
  return String((m && (m.businessDate || m.date)) || '').slice(0, 10);
}

function inNearbyWindow(m, nowMs, opts) {
  const daysBack = opts && opts.daysBack != null ? Number(opts.daysBack) : 2;
  const daysFwd = opts && opts.daysForward != null ? Number(opts.daysForward) : 2;
  const day = matchBizDate(m);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const start = bjDate(-Math.abs(daysBack), nowMs);
  const end = bjDate(Math.abs(daysFwd), nowMs);
  return day >= start && day <= end;
}

function uniqMatches(lists) {
  const byId = new Map();
  for (const list of lists || []) {
    for (const m of list || []) {
      if (m && m.id && !byId.has(String(m.id))) byId.set(String(m.id), m);
    }
  }
  return [...byId.values()];
}

function selectNearbyMatches(lists, nowMs, opts) {
  return uniqMatches(lists).filter((m) => inNearbyWindow(m, nowMs, opts));
}

function clubLogoUrls(matches, ntFlags) {
  const nt = ntFlags || (function () {
    try { return require('../public/js/nt-flags'); } catch (_) { return null; }
  }());
  const urls = [];
  const seen = new Set();
  for (const m of matches || []) {
    const sides = [
      [m.home, m.homeLogo, m.league],
      [m.away, m.awayLogo, m.league],
    ];
    for (const [name, logo, league] of sides) {
      if (!logo) continue;
      if (nt && typeof nt.resolveNationalFlagIso2 === 'function') {
        if (nt.resolveNationalFlagIso2(logo, name, league)) continue;
      }
      if (nt && typeof nt.isCrestPlaceholderLogo === 'function' && nt.isCrestPlaceholderLogo(logo)) continue;
      const s = String(logo);
      if (!s || seen.has(s)) continue;
      seen.add(s);
      urls.push({ url: s, name: name, league: league });
    }
  }
  return urls;
}

let state = {
  at: 0,
  reason: '',
  running: false,
  n: 0,
  ms: 0,
  weather: null,
  logos: null,
  odds: null,
  reports: null,
};

function status() {
  return { ...state };
}

function resetState() {
  state = {
    at: 0, reason: '', running: false, n: 0, ms: 0,
    weather: null, logos: null, odds: null, reports: null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prefetchNearby(lists, opts) {
  if (state.running) return { ...state, skippedRun: true };
  state.running = true;
  const t0 = Date.now();
  const reason = (opts && opts.reason) || 'manual';
  const nowMs = (opts && opts.nowMs) || Date.now();
  const nearby = selectNearbyMatches(lists, nowMs, opts);
  const out = {
    n: nearby.length,
    weather: null,
    logos: null,
    odds: null,
    reports: null,
  };
  try {
    if (opts && typeof opts.prefetchWeather === 'function') {
      out.weather = await opts.prefetchWeather(nearby, opts);
    }
    if (opts && typeof opts.warmLogos === 'function') {
      out.logos = await opts.warmLogos(clubLogoUrls(nearby, opts.ntFlags), opts);
    }
    if (opts && typeof opts.tickOdds === 'function') {
      out.odds = await opts.tickOdds(nearby, opts);
    }
    if (opts && typeof opts.warmReports === 'function') {
      const cap = opts.reportLimit != null ? Number(opts.reportLimit) : 32;
      out.reports = await opts.warmReports(nearby.slice(0, cap), opts);
    }
  } finally {
    state = {
      at: Date.now(),
      reason,
      running: false,
      n: nearby.length,
      ms: Date.now() - t0,
      weather: out.weather,
      logos: out.logos,
      odds: out.odds,
      reports: out.reports,
    };
  }
  console.log('[nearby-prefetch]', reason, JSON.stringify({
    n: state.n, ms: state.ms,
    weather: out.weather && (out.weather.n != null ? { n: out.weather.n, ok: out.weather.ok } : true),
    logos: out.logos && (out.logos.n != null ? out.logos.n : true),
    odds: !!(out.odds),
    reports: out.reports && (out.reports.n != null ? out.reports.n : true),
  }));
  return { ...state, matches: nearby };
}

module.exports = {
  bjDate,
  matchBizDate,
  inNearbyWindow,
  uniqMatches,
  selectNearbyMatches,
  clubLogoUrls,
  prefetchNearby,
  status,
  resetState,
  sleep,
};
