#!/usr/bin/env node
'use strict';
/**
 * Rate-limited SportMonks fixture ingest for radar club-league coverage.
 * Run on prod (cwd /opt/jingcai recommended):
 *   SM_MIN_GAP_MS=1500 node /tmp/fetch-radar-leagues.js --resolve-only
 *   SM_MIN_GAP_MS=1500 node /tmp/fetch-radar-leagues.js --wave=1
 *
 * Reads SPORTMONKS_TOKEN from /opt/jingcai/.env via heat-source; never prints it.
 * Writes rich fixture JSON under data/sm-lineups/fixtures/{id}.json (skip if already rich).
 * Does not upsert player_match_stats (no sporttery matchId for these domestic games).
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.JINGCAI_ROOT || '/opt/jingcai';
process.env.SM_MIN_GAP_MS = process.env.SM_MIN_GAP_MS || '1500';
process.env.SM_HOURLY_CAP = process.env.SM_HOURLY_CAP || '1200';

(function loadEnv() {
  const file = path.join(ROOT, '.env');
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[m[1]] == null || process.env[m[1]] === '') process.env[m[1]] = v;
    }
  } catch (_) {}
})();

const heat = require(path.join(ROOT, 'lib/heat-source'));
const smIngest = require(path.join(ROOT, 'lib/player-match-sm'));

const args = process.argv.slice(2);
function hasFlag(name) {
  return args.includes(`--${name}`) || args.includes(`--${name}=1`);
}
function argVal(name, def) {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
}
function argNum(name, def, min, max) {
  const n = Number(argVal(name, def));
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const RESOLVE_ONLY = hasFlag('resolve-only');
const WAVE = argVal('wave', '1');
const DATE_FROM = argVal('from', '2025-04-13');
const DATE_TO = argVal('to', '2026-11-13');
const MAX_FETCH = argNum('max', 0, 0, 20000);
const ONLY = (argVal('only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const WAVE1 = [
  {
    key: 'superlig',
    zh: '土超',
    queries: ['Super Lig', 'Süper Lig'],
    countries: ['turkey', 'türkiye', 'turkiye'],
    nameRe: /s[uü]per\s*lig/i,
    exclude: /cup|kupa|youth|u-?1[89]|u-?21|women|kad[iı]n|amateur/i,
  },
  {
    key: 'jupiler',
    zh: '比甲',
    queries: ['Jupiler Pro League', 'Pro League'],
    countries: ['belgium'],
    nameRe: /jupiler|pro league/i,
    exclude: /challenger|cup|women|u-?2[01]|youth|first division b|reserve/i,
  },
  {
    key: 'rpl',
    zh: '俄超',
    queries: ['Premier Liga', 'Russian Premier League', 'RPL', 'Russian Premier Liga'],
    countries: ['russia', 'russian federation'],
    nameRe: /premier\s*(liga|league)|\brpl\b/i,
    exclude: /cup|fnl|first league|youth|women|u-?2[01]|belarus|kazakhstan|armenia/i,
  },
  {
    key: 'cydiv1',
    zh: '塞浦路斯甲',
    queries: ['First Division', 'Cyta Championship'],
    countries: ['cyprus'],
    nameRe: /first division|cyta|protathlima|championship/i,
    exclude: /cup|second|women|youth|u-?2[01]/i,
  },
  {
    key: 'armpl',
    zh: '亚美尼亚甲',
    queries: ['Premier League', 'Armenian Premier League'],
    countries: ['armenia'],
    nameRe: /premier league|bardzraguyn/i,
    exclude: /cup|first league|women|youth|u-?2[01]/i,
  },
];

const WAVE2 = [
  {
    key: 'ligai',
    zh: '罗甲',
    queries: ['Liga I', 'SuperLiga'],
    countries: ['romania'],
    nameRe: /liga\s*i$|superliga|super liga/i,
    exclude: /cup|liga 2|women|youth/i,
  },
  {
    key: 'hnl',
    zh: '克甲',
    queries: ['HNL', 'SuperSport HNL'],
    countries: ['croatia'],
    nameRe: /hnl|prva/i,
    exclude: /cup|druga|women|youth/i,
  },
  {
    key: 'srbsl',
    zh: '塞超',
    queries: ['Super Liga', 'Mozzart Super Liga'],
    countries: ['serbia'],
    nameRe: /super\s*liga/i,
    exclude: /cup|prva|women|youth/i,
  },
  {
    key: 'grsl',
    zh: '希超',
    queries: ['Super League 1', 'Super League'],
    countries: ['greece'],
    nameRe: /super\s*league/i,
    exclude: /cup|super league 2|women|youth/i,
  },
  {
    key: 'densl',
    zh: '丹超',
    queries: ['Superliga', '3F Superliga'],
    countries: ['denmark'],
    nameRe: /superliga/i,
    exclude: /cup|1st division|women|youth/i,
  },
  {
    key: 'scot',
    zh: '苏超',
    queries: ['Premiership', 'William Hill Premiership'],
    countries: ['scotland'],
    nameRe: /premiership/i,
    exclude: /championship|cup|women|youth|irish|northern/i,
  },
];

const WAVE3 = [
  {
    key: 'upl',
    zh: '乌超',
    queries: ['Premier League', 'Premier Liha', 'Ukrainian Premier League'],
    countries: ['ukraine'],
    nameRe: /premier\s*(liha|league)/i,
    exclude: /cup|persha|first|youth|women|u-?2[01]/i,
  },
  {
    key: 'kpl',
    zh: '哈萨克超',
    queries: ['Premier League', 'Premier Liga', 'Kazakhstan Premier League'],
    countries: ['kazakhstan'],
    nameRe: /premier\s*(liga|league)/i,
    exclude: /cup|first|youth|women|u-?2[01]/i,
  },
  {
    key: 'mdsl',
    zh: '摩尔多瓦联赛',
    queries: ['Super Liga', 'Divizia Nationala', 'Moldovan Super Liga'],
    countries: ['moldova'],
    nameRe: /super\s*liga|divizia/i,
    exclude: /cup|liga 2|divizia a\b|youth|women|u-?2[01]/i,
  },
];

// Official IDs verified on the signed-in SportMonks dashboard (My Leagues after save).
// Do not resolve by name. Armenia #175 is intentionally omitted (60/60 cap).
const WAVE_SUBSCRIBED = [
  { key: 'rpl', zh: '俄超', id: 486 },
  { key: 'kpl', zh: '哈萨克超', id: 393 },
  { key: 'mdsl', zh: '摩尔多瓦联赛', id: 426 },
  { key: 'upl', zh: '乌超', id: 609 },
  { key: 'ligai', zh: '罗甲', id: 474 },
  { key: 'grsl', zh: '希超', id: 325 },
  { key: 'hnl', zh: '克甲', id: 244 },
  { key: 'srbsl', zh: '塞超', id: 531 },
  { key: 'cydiv1', zh: '塞浦路斯甲', id: 253 },
];

// Official ID 175 verified on the signed-in dashboard after Extra Leagues 30→35.
// Run only as a follow-on wave AFTER the subscribed 9-league fetcher exits.
const WAVE_ARMENIA = [
  { key: 'armpl', zh: '亚美尼亚超', id: 175 },
];

function targets() {
  let list;
  if (WAVE === '2') list = WAVE2.slice();
  else if (WAVE === '3') list = WAVE3.slice();
  else if (WAVE === '4' || WAVE === 'subscribed') list = WAVE_SUBSCRIBED.slice();
  else if (WAVE === 'armenia' || WAVE === '5' || WAVE === 'armpl') list = WAVE_ARMENIA.slice();
  else if (WAVE === 'all') list = WAVE1.concat(WAVE2, WAVE3);
  else list = WAVE1.slice();
  if (ONLY.length) list = list.filter((t) => ONLY.includes(t.key) || ONLY.includes(t.zh));
  // Armenia 175 is only fetched via --wave=armenia (follow-on). Other waves skip it.
  if (!(WAVE === 'armenia' || WAVE === '5' || WAVE === 'armpl')) {
    list = list.filter((t) => Number(t.id) !== 175 && t.key !== 'armpl' && t.zh !== '亚美尼亚超' && t.zh !== '亚美尼亚甲');
  }
  return list;
}

function countryName(row) {
  const c = row.country || {};
  return String(c.name || row.country_name || '').toLowerCase();
}

function pickLeague(rows, target) {
  const list = Array.isArray(rows) ? rows : [];
  const scored = list
    .map((r) => {
      const name = String(r.name || '');
      const ctry = countryName(r);
      const typ = String(r.type || r.sub_type || r.category || '').toLowerCase();
      if (target.exclude.test(name)) return null;
      if (target.countries.length && ctry && !target.countries.includes(ctry)) return null;
      if (!target.nameRe.test(name)) return null;
      let score = 0;
      if (target.nameRe.test(name)) score += 5;
      if (target.countries.includes(ctry)) score += 5;
      if (/league|lig|division|championship/i.test(typ) || typ === 'league' || typ === 'domestic')
        score += 2;
      if (/cup|playoff/i.test(typ)) score -= 5;
      return { row: r, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? scored[0].row : null;
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function getAllPages(urlPath, params) {
  const out = [];
  let page = 1;
  for (let i = 0; i < 200; i++) {
    const body = await heat.smGet(urlPath, Object.assign({}, params, { page }));
    const rows = (body && body.data) || [];
    if (Array.isArray(rows)) out.push(...rows);
    else if (rows && typeof rows === 'object') out.push(rows);
    const p = (body && body.pagination) || {};
    if (p.has_more === true) {
      page += 1;
      continue;
    }
    break;
  }
  return out;
}

async function searchLeagues(query) {
  const pathQ = `/football/leagues/search/${encodeURIComponent(query)}`;
  const body = await heat.smGet(pathQ, { include: 'country', per_page: 50 });
  return (body && body.data) || [];
}

function slimLeague(r) {
  return {
    id: r.id,
    name: r.name || '',
    short_code: r.short_code || '',
    type: r.type || '',
    sub_type: r.sub_type || '',
    category: r.category || '',
    country: (r.country && r.country.name) || '',
    current_season_id: r.current_season_id || (r.currentseason && r.currentseason.id) || null,
  };
}

async function resolveTarget(t) {
  if (t.id) {
    try {
      const body = await heat.smGet(`/football/leagues/${t.id}`, { include: 'country' });
      const r = body && body.data;
      if (r && Number(r.id) === Number(t.id)) {
        return { ok: true, target: t, league: slimLeague(r), candidates: 1, pinned: true };
      }
      console.warn(JSON.stringify({ phase: 'resolve-pin-mismatch', key: t.key, want: t.id, got: r && r.id }));
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).slice(0, 160);
      console.warn(JSON.stringify({ phase: 'resolve-pin-get-failed', key: t.key, id: t.id, err: msg }));
    }
    // Official IDs were verified on the dashboard; still fetch with the pinned id.
    return {
      ok: true,
      target: t,
      league: { id: t.id, name: t.zh, short_code: '', type: 'league', sub_type: '', category: '', country: '', current_season_id: null },
      candidates: 0,
      pinned: true,
    };
  }
  const seen = new Map();
  const rejected = [];
  for (const q of t.queries) {
    const rows = await searchLeagues(q);
    for (const r of rows) {
      if (r && r.id != null) seen.set(Number(r.id), r);
    }
    const hit = pickLeague(rows, t);
    if (hit) {
      return { ok: true, target: t, league: slimLeague(hit), candidates: rows.length };
    }
    for (const r of rows.slice(0, 8)) {
      rejected.push({
        q,
        id: r.id,
        name: r.name,
        country: (r.country && r.country.name) || '',
        type: r.type || r.sub_type || '',
      });
    }
  }
  return {
    ok: false,
    target: t,
    league: null,
    candidates: seen.size,
    rejected: rejected.slice(0, 12),
  };
}

function progressPath() {
  return path.join(ROOT, 'data/sm-lineups/radar-backfill-progress.json');
}

function writeProgress(obj) {
  const file = progressPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function fxDate(fx) {
  const s = String(fx.starting_at || fx.starting_at_timestamp || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(fx.starting_at_timestamp);
  if (Number.isFinite(n) && n > 0) {
    const d = n > 1e12 ? new Date(n) : new Date(n * 1000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

async function listLeagueFixtures(leagueId) {
  // SportMonks /fixtures/between rejects a ~18-month window (HTTP 422).
  // Chunk by 30 days and dedupe.
  const out = [];
  const seen = new Set();
  let start = DATE_FROM;
  while (start <= DATE_TO) {
    let end = addDays(start, 30);
    if (end > DATE_TO) end = DATE_TO;
    const url = `/football/fixtures/between/${start}/${end}`;
    const rows = await getAllPages(url, {
      filters: `fixtureLeagues:${leagueId}`,
      include: 'state',
      per_page: 50,
    });
    for (const fx of rows) {
      const id = Number(fx.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(fx);
    }
    start = addDays(end, 1);
  }
  return out;
}

async function ensureFixture(smFid, stats) {
  const cached = smIngest.loadCachedFixture(smFid);
  if (cached && cached.fixture && Array.isArray(cached.fixture.lineups) && smIngest.fixtureLooksRich(cached)) {
    stats.cache++;
    return { ok: true, cached: true };
  }
  if (MAX_FETCH && stats.fetched >= MAX_FETCH) {
    stats.capped++;
    return { ok: false, capped: true };
  }
  const body = await heat.smGet(`/football/fixtures/${smFid}`, {
    include: smIngest.FIXTURE_INCLUDE,
  });
  stats.fetched++;
  const fixture = body && body.data;
  if (!fixture) {
    stats.empty++;
    return { ok: false, empty: true };
  }
  smIngest.saveCachedFixture(smFid, fixture);
  if (!Array.isArray(fixture.lineups) || !fixture.lineups.length) stats.noLineups++;
  else stats.saved++;
  return { ok: true, cached: false };
}

(async () => {
  if (!heat.readToken()) {
    console.log('ABORT no SPORTMONKS_TOKEN');
    process.exit(1);
  }
  const todo = targets();
  console.log(
    JSON.stringify({
      phase: 'start',
      wave: WAVE,
      from: DATE_FROM,
      to: DATE_TO,
      resolveOnly: RESOLVE_ONLY,
      max: MAX_FETCH,
      gapMs: process.env.SM_MIN_GAP_MS,
      cap: process.env.SM_HOURLY_CAP,
      keys: todo.map((t) => t.key),
    })
  );

  const resolved = [];
  for (const t of todo) {
    const r = await resolveTarget(t);
    resolved.push(r);
    if (r.ok) {
      console.log(
        JSON.stringify({
          phase: 'resolve',
          ok: true,
          key: t.key,
          zh: t.zh,
          id: r.league.id,
          name: r.league.name,
          country: r.league.country,
          type: r.league.type || r.league.sub_type,
        })
      );
    } else {
      console.log(
        JSON.stringify({
          phase: 'resolve',
          ok: false,
          key: t.key,
          zh: t.zh,
          candidates: r.candidates,
          sample: r.rejected,
        })
      );
    }
  }

  writeProgress({
    at: new Date().toISOString(),
    wave: WAVE,
    from: DATE_FROM,
    to: DATE_TO,
    resolved: resolved.map((r) => ({
      key: r.target.key,
      zh: r.target.zh,
      ok: r.ok,
      league: r.league,
    })),
  });

  if (RESOLVE_ONLY) {
    console.log(JSON.stringify({ phase: 'done', resolveOnly: true }));
    return;
  }

  const statsAll = {};
  let fetchedTotal = 0;
  for (const r of resolved) {
    if (!r.ok) continue;
    const t = r.target;
    const leagueId = r.league.id;
    const stats = { cache: 0, fetched: 0, saved: 0, empty: 0, noLineups: 0, capped: 0, listed: 0, finished: 0 };
    statsAll[t.key] = stats;
    const rows = await listLeagueFixtures(leagueId);
    stats.listed = rows.length;
    const finished = rows.filter((fx) => heat.isFinished(fx) && fxDate(fx) >= DATE_FROM && fxDate(fx) <= DATE_TO);
    stats.finished = finished.length;
    console.log(
      JSON.stringify({
        phase: 'list',
        key: t.key,
        zh: t.zh,
        leagueId,
        listed: stats.listed,
        finished: stats.finished,
      })
    );
    for (let i = 0; i < finished.length; i++) {
      const fx = finished[i];
      const id = Number(fx.id);
      if (!id) continue;
      try {
        const out = await ensureFixture(id, stats);
        fetchedTotal = Object.values(statsAll).reduce((s, x) => s + x.fetched, 0);
        if (out && out.capped) {
          console.log(JSON.stringify({ phase: 'capped', key: t.key, fetchedTotal }));
          break;
        }
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        const body = e && e.body && typeof e.body === 'object' ? JSON.stringify(e.body).slice(0, 240) : '';
        console.warn(JSON.stringify({ phase: 'error', key: t.key, fixture: id, err: msg.slice(0, 160), body }));
        if (/sm-quota-exhausted|429/.test(msg)) {
          console.log(JSON.stringify({ phase: 'stop-quota', key: t.key, fetchedTotal }));
          writeProgress({
            at: new Date().toISOString(),
            wave: WAVE,
            resolved: resolved.map((x) => ({ key: x.target.key, zh: x.target.zh, ok: x.ok, league: x.league })),
            stats: statsAll,
            stopped: 'quota',
          });
          process.exit(2);
        }
      }
      if ((i + 1) % 25 === 0 || i + 1 === finished.length) {
        console.log(
          JSON.stringify({
            phase: 'progress',
            key: t.key,
            zh: t.zh,
            i: i + 1,
            of: finished.length,
            ...stats,
          })
        );
        writeProgress({
          at: new Date().toISOString(),
          wave: WAVE,
          resolved: resolved.map((x) => ({ key: x.target.key, zh: x.target.zh, ok: x.ok, league: x.league })),
          stats: statsAll,
        });
      }
      if (MAX_FETCH && fetchedTotal >= MAX_FETCH) break;
    }
    if (MAX_FETCH && fetchedTotal >= MAX_FETCH) break;
  }

  console.log(JSON.stringify({ phase: 'done', stats: statsAll }));
  writeProgress({
    at: new Date().toISOString(),
    wave: WAVE,
    resolved: resolved.map((x) => ({ key: x.target.key, zh: x.target.zh, ok: x.ok, league: x.league })),
    stats: statsAll,
    stopped: 'done',
  });
})().catch((e) => {
  console.error('FATAL', e && e.message ? e.message : e);
  process.exit(1);
});
