#!/usr/bin/env node
/**
 * Backfill SportMonks live-stats, matchfacts, predictions, and weather
 * for official 体彩 finished fixtures in a recent date window (default 10 days).
 *
 * Official 场次 / 赔率 stay on 体彩. This only caches SM overlays when SM
 * actually returns data — never invents scores, weather, or predictions.
 *
 * Usage:
 *   DATA_DIR=/path node tools/sm-ft-backfill.js [--days 10] [--from DATE] [--to DATE]
 *     [--ids 2042828,2042836] [--sleep-ms 250] [--force] [--dry-run]
 *     [--skip-weather] [--results PATH] [--schedule PATH]
 *
 * Safe to re-run. Does not wipe unrelated caches (sm-matchfacts, predictions,
 * weather, sm-live written per match only). Does not set ALLOW_AF_HTTP.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  if (v == null || String(v).startsWith('--')) return true;
  return v;
}

function bjYmd(ms) {
  return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function dataDir() {
  return process.env.DATA_DIR || path.join(__dirname, '..', 'data');
}

function extractList(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (obj.payload && obj.payload.data && Array.isArray(obj.payload.data)) return obj.payload.data;
  if (obj.data && Array.isArray(obj.data)) return obj.data;
  if (obj.byId && typeof obj.byId === 'object') return Object.values(obj.byId);
  return [];
}

function loadOfficialRows(opts) {
  const dir = dataDir();
  const resultsPath = opts.results || path.join(dir, 'sporttery-live-cache', 'results.json');
  const seenPath = path.join(dir, 'results-seen.json');
  const schedulePath = opts.schedule || path.join(dir, 'sporttery-live-cache', 'schedule.json');
  const byId = new Map();
  for (const p of [resultsPath, seenPath]) {
    for (const row of extractList(readJson(p, null))) {
      if (row && row.id) byId.set(String(row.id), Object.assign({}, byId.get(String(row.id)) || {}, row));
    }
  }
  const schedule = extractList(readJson(schedulePath, null));
  for (const row of schedule) {
    if (!row || !row.id) continue;
    const cur = byId.get(String(row.id));
    if (!cur) continue;
    if (!cur.time && row.time) cur.time = row.time;
    if (!cur.date && row.date) cur.date = row.date;
  }
  return [...byId.values()];
}

function inWindow(row, from, to) {
  const d = String(row.date || row.businessDate || '');
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function hasOfficialScore(row) {
  const full = String(row.full || '').trim();
  if (!full) return false;
  return /\d+\s*[:：]\s*\d+/.test(full);
}

function isFinishedRow(row) {
  if (hasOfficialScore(row)) return true;
  return !!(row.status && /已完成|完场|已结束|Payout|Finished|Define/i.test(String(row.status)));
}

function kickoffMs(row) {
  const date = row.date || row.businessDate || '';
  const time = String(row.time || '12:00').slice(0, 5);
  const ms = Date.parse(`${date}T${time}:00+08:00`);
  return Number.isFinite(ms) ? ms : Date.now();
}

function classifyPack(kind, pack) {
  if (!pack) return { status: 'error', reason: 'empty' };
  if (kind === 'live') {
    if (pack.ok && (pack.stats || pack.events)) {
      const ev = Array.isArray(pack.events) ? pack.events.length : 0;
      return { status: 'ok', smFixtureId: pack.fixtureId || pack.smFixtureId || null, events: ev, source: pack.source || '', disk: !!pack.disk };
    }
    return { status: pack.reason || 'empty', smFixtureId: pack.fixtureId || pack.smFixtureId || null, detail: pack.detail || pack.error || '' };
  }
  if (kind === 'facts') {
    if (pack.ok && (pack.hasFacts || pack.hasTrends || (pack.events && pack.events.length))) {
      return { status: 'ok', smFixtureId: pack.smFixtureId || null, hasFacts: !!pack.hasFacts, hasTrends: !!pack.hasTrends };
    }
    return { status: pack.reason || 'empty', smFixtureId: pack.smFixtureId || null };
  }
  if (kind === 'pred') {
    if (pack.ok && pack.hasPredictions) {
      return { status: 'ok', smFixtureId: pack.smFixtureId || null };
    }
    return { status: pack.reason || (pack.hasPredictions === false ? 'no-predictions' : 'empty'), smFixtureId: pack.smFixtureId || null };
  }
  if (kind === 'weather') {
    if (pack.ok) return { status: 'ok', smFixtureId: pack.smFixtureId || null, reportType: pack.reportType || '' };
    return { status: pack.reason || 'empty', smFixtureId: pack.smFixtureId || null };
  }
  return { status: 'empty' };
}

async function backfillOne(row, deps, opts) {
  const matchId = String(row.id);
  const base = {
    matchId,
    homeTeamId: row.homeTeamId,
    awayTeamId: row.awayTeamId,
    home: row.home,
    away: row.away,
    homeZh: row.home,
    awayZh: row.away,
    league: row.league,
    date: row.date || row.businessDate,
    time: row.time || '',
    kickoffMs: kickoffMs(row),
    status: row.status || row.poolStatus || '',
    poolStatus: row.poolStatus || '',
    poolCloseDate: row.poolCloseDate || '',
    poolCloseTime: row.poolCloseTime || '',
    goalLine: (row.hhad && row.hhad.goalLine != null && row.hhad.goalLine !== '')
      ? row.hhad.goalLine
      : (row.goalLine != null && row.goalLine !== '' ? row.goalLine : undefined),
    force: !!opts.force,
  };
  const out = {
    matchId,
    league: row.league || '',
    date: row.date || '',
    num: row.num || '',
    home: row.home,
    away: row.away,
    full: row.full || '',
  };
  if (opts.dryRun) {
    out.dryRun = true;
    return out;
  }
  try {
    out.facts = classifyPack('facts', await deps.facts.ensureMatchfacts(base));
  } catch (e) {
    out.facts = { status: 'error', detail: e && e.message };
  }
  await sleep(opts.sleepMs);
  try {
    out.pred = classifyPack('pred', await deps.pred.ensurePredictions(base));
  } catch (e) {
    out.pred = { status: 'error', detail: e && e.message };
  }
  await sleep(opts.sleepMs);
  try {
    out.live = classifyPack('live', await deps.live.getLiveStats(base));
  } catch (e) {
    out.live = { status: 'error', detail: e && e.message };
  }
  if (!opts.skipWeather) {
    await sleep(opts.sleepMs);
    try {
      out.weather = classifyPack('weather', await deps.wx.getMatchWeather(base));
    } catch (e) {
      out.weather = { status: 'error', detail: e && e.message };
    }
  }
  const fid = (out.facts && out.facts.smFixtureId)
    || (out.pred && out.pred.smFixtureId)
    || (out.live && out.live.smFixtureId)
    || (out.weather && out.weather.smFixtureId)
    || null;
  out.smFixtureId = fid;
  const miss = [out.facts, out.pred, out.live, out.weather].filter((x) => x && (x.status === 'no-fixture' || x.status === 'no_fixture' || x.status === 'no-team'));
  if (!fid && miss.length) out.resolve = 'no-fixture';
  else if (fid) out.resolve = 'ok';
  else out.resolve = 'partial';
  return out;
}

function summarize(rows) {
  const sum = {
    total: rows.length,
    resolved: 0,
    noFixture: 0,
    liveOk: 0,
    factsOk: 0,
    predOk: 0,
    weatherOk: 0,
    predMissing: 0,
    errors: 0,
  };
  for (const r of rows) {
    if (r.resolve === 'ok' || r.smFixtureId) sum.resolved++;
    if (r.resolve === 'no-fixture') sum.noFixture++;
    if (r.live && r.live.status === 'ok') sum.liveOk++;
    if (r.facts && r.facts.status === 'ok') sum.factsOk++;
    if (r.pred && r.pred.status === 'ok') sum.predOk++;
    if (r.pred && r.pred.status === 'no-predictions') sum.predMissing++;
    if (r.weather && r.weather.status === 'ok') sum.weatherOk++;
    if ([r.live, r.facts, r.pred, r.weather].some((x) => x && x.status === 'error')) sum.errors++;
  }
  return sum;
}

async function run(opts) {
  const days = Number(opts.days != null ? opts.days : 10);
  const to = opts.to || bjYmd(Date.now());
  const from = opts.from || bjYmd(Date.now() - (days - 1) * 86400e3);
  const idFilter = new Set((opts.ids ? String(opts.ids).split(/[,\s]+/) : []).filter(Boolean));
  const rows = loadOfficialRows(opts)
    .filter((r) => r && r.id)
    .filter((r) => isFinishedRow(r) || hasOfficialScore(r))
    .filter((r) => inWindow(r, from, to))
    .filter((r) => !idFilter.size || idFilter.has(String(r.id)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));

  const report = {
    ok: true,
    from,
    to,
    days,
    sleepMs: opts.sleepMs,
    dryRun: !!opts.dryRun,
    force: !!opts.force,
    count: rows.length,
    rows: [],
  };

  const deps = opts.deps || {
    facts: require('../lib/sm-matchfacts'),
    pred: require('../lib/sm-predictions'),
    live: require('../lib/live-stats'),
    wx: require('../lib/match-weather'),
  };

  for (const row of rows) {
    const one = await backfillOne(row, deps, opts);
    report.rows.push(one);
    const label = `${one.date} ${one.num || one.matchId} ${one.home} vs ${one.away}`;
    const bits = [
      one.resolve || '',
      one.live && `live=${one.live.status}`,
      one.facts && `facts=${one.facts.status}`,
      one.pred && `pred=${one.pred.status}`,
      one.weather && `wx=${one.weather.status}`,
      one.smFixtureId && `sm=${one.smFixtureId}`,
    ].filter(Boolean);
    console.log('[sm-ft-backfill]', label, bits.join(' '));
    if (!opts.dryRun) await sleep(opts.sleepMs);
  }
  report.summary = summarize(report.rows);
  const outPath = opts.out || path.join(dataDir(), 'sm-ft-backfill-last.json');
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    report.outPath = outPath;
  } catch (e) {
    report.writeError = e && e.message;
  }
  console.log('[sm-ft-backfill] summary', JSON.stringify(report.summary));
  if (report.outPath) console.log('[sm-ft-backfill] wrote', report.outPath);
  return report;
}

module.exports = {
  run,
  loadOfficialRows,
  inWindow,
  isFinishedRow,
  hasOfficialScore,
  kickoffMs,
  classifyPack,
  backfillOne,
  summarize,
  bjYmd,
};

if (require.main === module) {
  const sleepMs = Number(arg('--sleep-ms', 250));
  run({
    days: arg('--days', 10),
    from: arg('--from', ''),
    to: arg('--to', ''),
    ids: arg('--ids', ''),
    sleepMs: Number.isFinite(sleepMs) ? sleepMs : 250,
    force: !!arg('--force', false),
    dryRun: !!arg('--dry-run', false),
    skipWeather: !!arg('--skip-weather', false),
    results: arg('--results', ''),
    schedule: arg('--schedule', ''),
    out: arg('--out', ''),
  }).then(() => {
    // Always exit: match-weather / sqlite / SM clients may leave timers open.
    process.exit(0);
  }).catch((e) => {
    console.error('[sm-ft-backfill] failed', e && e.message);
    process.exit(1);
  });
}
