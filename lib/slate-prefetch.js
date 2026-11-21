/**
 * Pre-assemble 数据页 packs (身价 / 六围 / 赛前近况) and 比赛事实
 * for the current selling slate so the first user open is a cache hit.
 * Does not force a refresh when the existing cache is still fresh.
 * Only the current /api/matches window should be passed in — not the
 * full multi-week schedule, which would burn third-party quota.
 */
'use strict';

function kickoffMs(m) {
  const date = String((m && m.date) || '').slice(0, 10);
  const time = String((m && (m.time || '00:00')) || '00:00').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Date.now();
  const t = Date.parse(date + 'T' + time + ':00+08:00');
  return Number.isFinite(t) ? t : Date.now();
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let state = {
  at: 0,
  reason: '',
  running: false,
  ok: 0,
  fail: 0,
  n: 0,
  ms: 0,
  matchIds: [],
};

function status() {
  return { ...state };
}

function resetState() {
  state = {
    at: 0,
    reason: '',
    running: false,
    ok: 0,
    fail: 0,
    n: 0,
    ms: 0,
    matchIds: [],
  };
}

async function warmPredictions(m, opts = {}) {
  let pred;
  try {
    pred = opts.smPredictions || require('./sm-predictions');
  } catch {
    return 'skipped';
  }
  if (!pred || typeof pred.ensurePredictions !== 'function') return 'skipped';
  try {
    const pack = await pred.ensurePredictions({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      home: m.home,
      away: m.away,
      homeZh: m.home,
      awayZh: m.away,
      kickoffMs: kickoffMs(m),
      league: m.league || m.leagueName || '',
      date: m.date,
      time: m.time,
      goalLine: (m.hhad && m.hhad.goalLine != null && m.hhad.goalLine !== '')
        ? m.hhad.goalLine
        : (m.goalLine != null && m.goalLine !== '' ? m.goalLine : undefined),
      force: !!opts.force,
    });
    if (!pack) return 'empty';
    if (pack.reason) return pack.reason;
    if (pack.hasPredictions) return 'ok';
    return pack.ok === false ? (pack.reason || 'empty') : 'empty';
  } catch (e) {
    return { fail: true, error: (e && e.message) || String(e) };
  }
}


async function warmMatchfacts(m, opts = {}) {
  let mf;
  try {
    mf = opts.smMatchfacts || require('./sm-matchfacts');
  } catch {
    return 'skipped';
  }
  if (!mf || typeof mf.ensureMatchfacts !== 'function') return 'skipped';
  try {
    const pack = await mf.ensureMatchfacts({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      home: m.home,
      away: m.away,
      date: m.date,
      time: m.time,
      league: m.league || m.leagueName || '',
      force: !!opts.force,
    });
    if (!pack) return 'empty';
    if (pack.reason) return pack.reason;
    if (pack.hasFacts) return 'ok';
    return pack.ok === false ? (pack.reason || 'empty') : 'empty';
  } catch (e) {
    return { fail: true, error: (e && e.message) || String(e) };
  }
}

async function warmOne(m, opts = {}) {
  const sv = opts.squadValue || require('./match-squad-value');
  const rd = opts.matchRadar || require('./match-radar');
  const sm = opts.smSurface || require('./sm-surface');
  const out = { id: String(m && m.id || ''), squad: 'fail', radar: 'fail', surface: 'fail', predictions: 'skipped', facts: 'skipped' };
  if (!m || !m.id) {
    out.error = 'missing-match';
    return out;
  }
  let squad = null;
  try {
    squad = await sv.forMatch(m, { force: !!opts.force });
    out.squad = squad && squad.ok ? 'ok' : 'empty';
  } catch (e) {
    out.squad = 'fail';
    out.squadError = (e && e.message) || String(e);
  }
  try {
    const radar = await rd.forMatch(m, { force: !!opts.force, squad: squad || undefined });
    out.radar = radar && radar.ok !== false && !radar.error ? 'ok' : (radar && (radar.reason || 'empty')) || 'empty';
  } catch (e) {
    out.radar = 'fail';
    out.radarError = (e && e.message) || String(e);
  }
  try {
    const pack = await sm.ensureSurface({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeZh: m.home,
      awayZh: m.away,
      kickoffMs: kickoffMs(m),
    });
    if (!pack) out.surface = 'empty';
    else if (pack.reason) out.surface = pack.reason;
    else out.surface = 'ok';
  } catch (e) {
    out.surface = 'fail';
    out.surfaceError = (e && e.message) || String(e);
  }
  const predRes = await warmPredictions(m, opts);
  if (predRes && predRes.fail) {
    out.predictions = 'fail';
    out.predictionsError = predRes.error;
  } else {
    out.predictions = predRes || 'skipped';
  }
  const factsRes = await warmMatchfacts(m, opts);
  if (factsRes && factsRes.fail) {
    out.facts = 'fail';
    out.factsError = factsRes.error;
  } else {
    out.facts = factsRes || 'skipped';
  }
  return out;
}

async function warmSlate(matches, opts = {}) {
  if (state.running) return { ...state, skippedRun: true };
  state.running = true;
  const t0 = Date.now();
  const reason = opts.reason || 'manual';
  const list = (matches || []).filter((m) => m && m.id);
  const limit = opts.limit != null ? Number(opts.limit) : list.length;
  const gapMs = opts.gapMs != null ? Number(opts.gapMs) : 800;
  const slice = list.slice(0, Number.isFinite(limit) && limit >= 0 ? limit : list.length);
  const rows = [];
  let ok = 0;
  let fail = 0;
  try {
    for (let i = 0; i < slice.length; i++) {
      const r = await warmOne(slice[i], opts);
      rows.push(r);
      const broken = r.squad === 'fail' && r.radar === 'fail' && r.surface === 'fail';
      if (broken) fail += 1;
      else ok += 1;
      if (gapMs > 0 && i < slice.length - 1) await sleep(gapMs);
    }
  } finally {
    state = {
      at: Date.now(),
      reason,
      running: false,
      ok,
      fail,
      n: slice.length,
      ms: Date.now() - t0,
      matchIds: slice.map((m) => String(m.id)),
    };
  }
  console.log('[slate-prefetch]', reason, JSON.stringify({
    ok, fail, n: slice.length, ms: state.ms,
  }));
  return { ...state, rows };
}

module.exports = {
  kickoffMs,
  uniqMatches,
  warmOne,
  warmSlate,
  status,
  resetState,
};
