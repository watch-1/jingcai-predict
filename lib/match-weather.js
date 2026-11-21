/**
 * Match weather for GET /api/match-weather.
 * SportMonks is the primary source. Payloads are persisted in
 * $DATA_DIR/match-weather.db so a selling-slate prefetch can fill the
 * store before the app opens a match. If SportMonks misses a fixture,
 * a server-side Open-Meteo fallback may be stored (labeled honestly).
 * Token stays in heat-source readToken. Never invent values: missing
 * fields are null. Never log the token.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
const heatSource = require('./heat-source');

const MEM_CACHE_MS = 6 * 60 * 1000;
const MEM_NEGATIVE_MS = 3 * 60 * 1000;
const FORECAST_TTL_MS = 45 * 60 * 1000;
const ACTUAL_TTL_MS = 12 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const HOURLY = 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,cloud_cover';

let _wxdb = null;
let _wxdbPath = '';
let prefetchState = {
  at: 0,
  reason: '',
  running: false,
  ok: 0,
  fail: 0,
  n: 0,
  ms: 0,
  matchIds: [],
};
const refreshing = new Set();

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function kickoffMsOf(m) {
  const date = String((m && (m.date || '')) || '').slice(0, 10);
  const time = String((m && (m.time || '00:00')) || '00:00').slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const t = Date.parse(date + 'T' + time + ':00+08:00');
  return Number.isFinite(t) ? t : NaN;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePercent(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') {
    const m = v.trim().match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
    return m ? numOrNull(m[1]) : numOrNull(v);
  }
  return numOrNull(v);
}

/* SportMonks weatherReport.description uses OpenWeather-style strings.
   Official SM weather types include thunderstorm, thunderstorm with light
   rain, and thunderstorm with rain (see SM v2 statuses; v3 still returns
   these as description). Keep storm visuals on those strings. Do not map
   heavy intensity rain / 大雨 to storm — SM already has a thunder type. */
function mapDescription(desc) {
  const raw = String(desc || '').trim();
  const s = raw.toLowerCase();
  if (!s) return { type: 'neutral', labelZh: '—' };
  if (/thunder|lightning|thunderstorm/.test(s) || /\bstorms?\b/.test(s) || /rainstorm/.test(s)) {
    return { type: 'storm', labelZh: /thunder|lightning/.test(s) ? '雷暴' : '暴雨' };
  }
  if (/heavy|intensity rain|torrential|downpour/.test(s)) return { type: 'rain', labelZh: '大雨' };
  if (/moderate\s+rain/.test(s)) return { type: 'rain', labelZh: '中雨' };
  if (/light\s+rain|drizzle/.test(s)) return { type: 'light-rain', labelZh: '小雨' };
  if (/\brain\b|shower/.test(s)) return { type: 'rain', labelZh: '雨' };
  if (/snow|sleet/.test(s)) return { type: 'cloudy', labelZh: '雪' };
  if (/fog|mist|haze/.test(s)) return { type: 'cloudy', labelZh: '雾' };
  if (/overcast/.test(s)) return { type: 'cloudy', labelZh: '阴' };
  if (/broken clouds|scattered clouds|few clouds|cloud/.test(s)) {
    return { type: 'cloudy', labelZh: /few/.test(s) ? '少云' : '多云' };
  }
  if (/clear|sunny|sky is clear|fair/.test(s)) return { type: 'sunny', labelZh: '晴' };
  return { type: 'cloudy', labelZh: raw || '多云' };
}

function mapWmo(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return { type: 'neutral', labelZh: '—' };
  if (c === 0) return { type: 'sunny', labelZh: '晴' };
  if (c === 1) return { type: 'sunny', labelZh: '晴间少云' };
  if (c === 2) return { type: 'cloudy', labelZh: '多云' };
  if (c === 3) return { type: 'cloudy', labelZh: '阴' };
  if (c === 45 || c === 48) return { type: 'cloudy', labelZh: '雾' };
  if (c === 51 || c === 53 || c === 55 || c === 56 || c === 57) return { type: 'light-rain', labelZh: '毛毛雨' };
  if (c === 61 || c === 80) return { type: 'light-rain', labelZh: '小雨' };
  if (c === 63 || c === 81) return { type: 'rain', labelZh: '中雨' };
  if (c === 65 || c === 82) return { type: 'rain', labelZh: '大雨' };
  if (c === 66 || c === 67) return { type: 'light-rain', labelZh: '冻雨' };
  if (c === 71 || c === 85) return { type: 'cloudy', labelZh: '小雪' };
  if (c === 73 || c === 86) return { type: 'cloudy', labelZh: '中雪' };
  if (c === 75 || c === 77) return { type: 'cloudy', labelZh: '雪' };
  if (c === 95) return { type: 'storm', labelZh: '雷阵雨' };
  if (c === 96 || c === 99) return { type: 'storm', labelZh: '雷暴' };
  return { type: 'cloudy', labelZh: '多云' };
}

function hourOfKickoff(startingAt, kickoffMs) {
  const s = String(startingAt || '');
  const m = s.match(/(?:[T ](\d{2})):/);
  if (m) return Number(m[1]);
  if (Number.isFinite(kickoffMs)) return new Date(kickoffMs).getUTCHours();
  return 15;
}

function pickDayPart(hour) {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function pickTemp(temp, startingAt, kickoffMs) {
  if (temp == null) return null;
  if (typeof temp !== 'object') return numOrNull(temp);
  const cur = numOrNull(temp.current);
  if (cur != null) return cur;
  const order = ['morning', 'day', 'evening', 'night'];
  const prefer = pickDayPart(hourOfKickoff(startingAt, kickoffMs));
  const idx = Math.max(0, order.indexOf(prefer));
  const tried = [order[idx]];
  for (let d = 1; d < 4; d++) {
    if (idx + d < 4) tried.push(order[idx + d]);
    if (idx - d >= 0) tried.push(order[idx - d]);
  }
  for (const k of tried) {
    const v = numOrNull(temp[k]);
    if (v != null) return v;
  }
  return null;
}

function emptyFail(reason, extra) {
  return Object.assign({
    ok: false,
    source: 'sportmonks',
    type: 'neutral',
    labelZh: '—',
    description: '',
    tempC: null,
    humidity: null,
    windMs: null,
    pressureHpa: null,
    pressureMmHg: null,
    venueName: '',
    venueCity: '',
    asof: '',
    reportType: null,
    sourceNote: '',
    reason: reason || 'unavailable',
    error: '',
  }, extra || {});
}

function normalizeWeather(wr, venue, fixture, kickoffMs) {
  if (!wr || typeof wr !== 'object' || !Object.keys(wr).length) {
    return emptyFail('empty-weatherreport', { error: '天气字段为空' });
  }
  const desc = wr.description
    || (wr.current && wr.current.description)
    || '';
  const mapped = mapDescription(desc);
  const tempC = pickTemp(wr.temperature, fixture && fixture.starting_at, kickoffMs);
  const humidity = parsePercent(wr.humidity != null ? wr.humidity : (wr.current && wr.current.humidity));
  const windMs = numOrNull(
    (wr.wind && wr.wind.speed != null) ? wr.wind.speed
      : (wr.current && wr.current.wind)
  );
  const pressureHpa = numOrNull(wr.pressure != null ? wr.pressure : (wr.current && wr.current.pressure));
  const pressureMmHg = pressureHpa == null ? null : Math.round(pressureHpa * 0.750061683);
  const reportType = /actual/i.test(String(wr.type || '')) ? 'actual'
    : /forecast/i.test(String(wr.type || '')) ? 'forecast'
    : (wr.type || null);
  const hasAny = tempC != null || humidity != null || windMs != null || pressureHpa != null || !!desc;
  if (!hasAny) {
    return emptyFail('empty-weatherreport', {
      error: '天气字段为空',
      venueName: (venue && (venue.name || venue.venue)) || '',
      venueCity: (venue && (venue.city || venue.city_name)) || '',
    });
  }
  const sourceNote = reportType === 'actual' ? '当场天气' : (reportType === 'forecast' ? '预报' : '当场天气');
  return {
    ok: true,
    source: 'sportmonks',
    type: mapped.type,
    labelZh: mapped.labelZh,
    description: desc || '',
    tempC,
    humidity,
    windMs,
    pressureHpa,
    pressureMmHg,
    venueName: (venue && (venue.name || venue.venue)) || '',
    venueCity: (venue && (venue.city || venue.city_name)) || '',
    asof: (fixture && fixture.starting_at) || '',
    reportType,
    sourceNote,
    reason: '',
    error: '',
    smFixtureId: fixture && fixture.id != null ? fixture.id : null,
  };
}

function cacheKey(opts) {
  if (opts && opts.matchId) return 'm:' + String(opts.matchId);
  return ['t', opts.homeTeamId || '', opts.awayTeamId || '', opts.home || '', opts.away || '', opts.date || '', opts.time || ''].join('|');
}

function memTtl(payload) {
  if (payload && payload.ok) return MEM_CACHE_MS;
  if (payload && payload.reason === 'upstream') return 60 * 1000;
  return MEM_NEGATIVE_MS;
}

function readCached(key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at < memTtl(hit.payload)) return hit.payload;
  cache.delete(key);
  return null;
}

function writeCached(key, payload, now) {
  cache.set(key, { at: now, payload });
  return payload;
}

function storeTtl(payload) {
  if (!payload || !payload.ok) {
    if (payload && payload.reason === 'upstream') return 60 * 1000;
    return NEGATIVE_TTL_MS;
  }
  if (payload.reportType === 'actual' || payload.sourceNote === '当场天气') return ACTUAL_TTL_MS;
  return FORECAST_TTL_MS;
}

function isFreshRow(row, now) {
  if (!row || !row.payload) return false;
  const at = Number(row.at) || 0;
  return (now - at) < storeTtl(row.payload);
}

function wxdb() {
  const file = path.join(dataDir(), 'match-weather.db');
  if (_wxdb && _wxdbPath === file) return _wxdb;
  if (_wxdb) {
    try { _wxdb.close(); } catch { /* ignore */ }
    _wxdb = null;
    _wxdbPath = '';
  }
  const Database = require('better-sqlite3');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS match_weather (
      match_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT,
      ok INTEGER NOT NULL DEFAULT 0,
      report_type TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mw_updated ON match_weather(updated_at);
  `);
  _wxdb = db;
  _wxdbPath = file;
  return db;
}

function readStore(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  try {
    const row = wxdb().prepare('SELECT payload, updated_at FROM match_weather WHERE match_id = ?').get(id);
    if (!row || !row.payload) return null;
    return { at: Number(row.updated_at) || 0, payload: JSON.parse(row.payload) };
  } catch {
    return null;
  }
}

function writeStore(matchId, payload, now) {
  const id = String(matchId || '').trim();
  if (!id || !payload) return;
  const at = Number.isFinite(now) ? now : Date.now();
  const copy = Object.assign({}, payload);
  delete copy.cached;
  delete copy.stale;
  delete copy.fetchedAt;
  try {
    wxdb().prepare(`
      INSERT INTO match_weather (match_id, payload, updated_at, source, ok, report_type)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at,
        source = excluded.source,
        ok = excluded.ok,
        report_type = excluded.report_type
    `).run(
      id,
      JSON.stringify(copy),
      at,
      String(copy.source || ''),
      copy.ok ? 1 : 0,
      copy.reportType || ''
    );
  } catch (e) {
    console.warn('[match-weather] store write failed', e && e.message);
  }
}

function resetStoreForTest() {
  cache.clear();
  refreshing.clear();
  if (_wxdb) {
    try { _wxdb.close(); } catch { /* ignore */ }
    _wxdb = null;
    _wxdbPath = '';
  }
  prefetchState = {
    at: 0, reason: '', running: false, ok: 0, fail: 0, n: 0, ms: 0, matchIds: [],
  };
}

function decorate(payload, meta) {
  return Object.assign({}, payload || {}, meta || {});
}


function clubPin(teamId, zh) {
  try {
    const sq = require('./squad-source');
    let en = '';
    try { en = heatSource.englishName(teamId, zh) || ''; } catch { /* optional */ }
    return sq.pinnedSmId(teamId, zh, en) || null;
  } catch {
    return null;
  }
}

async function resolveSmTeam(fetchJson, teamId, zh, known) {
  if (known) return known;
  const club = clubPin(teamId, zh);
  if (club) return club;
  if (heatSource.verifiedNtId) {
    const pinned = heatSource.verifiedNtId(zh, teamId);
    if (pinned) return pinned;
  }
  const names = [];
  const en = heatSource.englishName(teamId, zh);
  if (en) names.push(en);
  if (zh && String(zh).trim() && String(zh).trim() !== en) names.push(String(zh).trim());
  const seen = new Set();
  for (const name of names) {
    const key = String(name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    const picked = heatSource.pickTeamId(found && found.data, name);
    if (picked) return picked;
    if (heatSource.verifiedNtId) {
      const pinnedEn = heatSource.verifiedNtId(name, teamId);
      if (pinnedEn) return pinnedEn;
    }
  }
  return null;
}

function fidFromLocalMap(matchId) {
  if (!matchId) return null;
  try {
    const dir = process.env.DATA_DIR || (require('./db').DATA_DIR);
    const fp = path.join(dir, 'sm-lineups', 'match-map.json');
    const map = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const rec = map['m:' + matchId] || map[matchId];
    return rec && rec.smFixtureId ? rec.smFixtureId : null;
  } catch {
    return null;
  }
}

/** Reuse a fixture already resolved by matchfacts/predictions so weather
 *  does not fail on its own team lookup (e.g. 巴竞技 564 → 3432). */
function fidFromSiblingPacks(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  for (const dir of ['sm-matchfacts', 'sm-predictions']) {
    try {
      const fp = path.join(dataDir(), dir, id + '.json');
      const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
      const fid = Number(j && j.smFixtureId);
      if (Number.isFinite(fid) && fid > 0) return fid;
    } catch { /* pack missing is fine */ }
  }
  return null;
}

function nameFolds(teamId, zh) {
  const folds = new Set();
  const add = (s) => {
    if (!s) return;
    try { folds.add(heatSource.foldTeam(s)); } catch { folds.add(String(s).toLowerCase()); }
  };
  add(zh);
  try { add(heatSource.englishName(teamId, zh)); } catch { /* optional */ }
  folds.delete('');
  return folds;
}

function participantMatches(p, folds) {
  if (!p || !folds || !folds.size) return false;
  const names = [p.name, p.display_name, p.short_code, p.common_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  for (const n of names) {
    let f;
    try { f = heatSource.foldTeam(n); } catch { f = n.toLowerCase(); }
    if (folds.has(f)) return true;
  }
  return false;
}

async function resolveFixture(fetchJson, opts) {
  const knownFid = opts.smFixtureId || fidFromLocalMap(opts.matchId) || fidFromSiblingPacks(opts.matchId);
  if (knownFid) return { id: knownFid };
  const stored = opts.matchId ? readStore(opts.matchId) : null;
  if (stored && stored.payload && stored.payload.smFixtureId) {
    return { id: stored.payload.smFixtureId };
  }
  const homeSm = await resolveSmTeam(fetchJson, opts.homeTeamId, opts.home, opts.homeSmId);
  const awaySm = await resolveSmTeam(fetchJson, opts.awayTeamId, opts.away, opts.awaySmId);
  if (!homeSm && !awaySm) return { reason: 'no-team', homeSm, awaySm };
  const ko = Number.isFinite(opts.kickoffMs) ? opts.kickoffMs : Date.now();
  const anchor = homeSm || awaySm;
  const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${anchor}`, {
    include: 'participants',
    per_page: 25,
  });
  const rows = (body && body.data) || [];
  let hit = null;
  if (homeSm && awaySm) {
    hit = rows.find((fx) => {
      const ids = (fx.participants || []).map((p) => Number(p.id));
      return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
    });
  }
  if (!hit) {
    const otherFolds = homeSm && !awaySm
      ? nameFolds(opts.awayTeamId, opts.away)
      : (!homeSm && awaySm ? nameFolds(opts.homeTeamId, opts.home) : null);
    if (otherFolds && otherFolds.size) {
      hit = rows.find((fx) => {
        const parts = fx.participants || [];
        const ids = parts.map((p) => Number(p.id));
        if (anchor && !ids.includes(Number(anchor))) return false;
        return parts.some((p) => Number(p.id) !== Number(anchor) && participantMatches(p, otherFolds));
      });
    }
  }
  if (!hit || !hit.id) return { reason: 'no-fixture', homeSm, awaySm };
  return { id: hit.id, preview: hit, homeSm, awaySm };
}

function venueFromOpts(opts, fallback) {
  const name = (opts && (opts.venueName || (opts.venue && (opts.venue.name || opts.venue.venue))))
    || (fallback && (fallback.name || fallback.venue))
    || '';
  const city = (opts && (opts.venueCity || (opts.venue && (opts.venue.city || opts.venue.city_name))))
    || (fallback && (fallback.city || fallback.city_name))
    || '';
  return { name: String(name || '').trim(), city: String(city || '').trim() };
}

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs || 8000 }, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        if (buf.length > 2e6) {
          req.destroy();
          reject(new Error('too-large'));
        }
      });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('http ' + res.statusCode));
        try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function geocodeQuery(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  const url = GEO + '?name=' + encodeURIComponent(q) + '&count=3&language=en';
  try {
    const j = await httpGetJson(url, 8000);
    const hit = (j && j.results && j.results[0]) || null;
    if (hit && Number.isFinite(Number(hit.latitude)) && Number.isFinite(Number(hit.longitude))) {
      return {
        lat: Number(hit.latitude),
        lon: Number(hit.longitude),
        name: hit.name || q,
      };
    }
  } catch { /* miss */ }
  return null;
}

async function geocodeVenue(venue) {
  if (!venue) return null;
  const city = String(venue.city || '').trim();
  const name = String(venue.name || '').trim();
  const queries = [];
  if (city) queries.push(city);
  if (name && name !== city) queries.push(name);
  if (city && name) queries.push(name + ' ' + city);
  for (let i = 0; i < queries.length; i++) {
    const loc = await geocodeQuery(queries[i]);
    if (loc) return loc;
  }
  return null;
}

function pickHourly(j, targetMs) {
  const h = j && j.hourly;
  if (!h || !Array.isArray(h.time) || !h.time.length) return null;
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < h.time.length; i++) {
    const t = Number(h.time[i]);
    if (!Number.isFinite(t)) continue;
    const ms = t > 1e12 ? t : t * 1000;
    const d = Math.abs(ms - targetMs);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  if (!Number.isFinite(bestD) || bestD > 3 * 3600 * 1000) return null;
  const num = function (arr) {
    if (!arr || arr[bestI] == null || arr[bestI] === '') return null;
    const n = Number(arr[bestI]);
    return Number.isFinite(n) ? n : null;
  };
  const tRaw = Number(h.time[bestI]);
  const atMs = tRaw > 1e12 ? tRaw : tRaw * 1000;
  return {
    atMs,
    tempC: num(h.temperature_2m),
    humidity: num(h.relative_humidity_2m),
    weatherCode: num(h.weather_code),
    windMs: num(h.wind_speed_10m),
    pressureHpa: num(h.surface_pressure),
  };
}

async function fetchOpenMeteo(opts, venue) {
  const v = venueFromOpts(opts, venue);
  if (!v.name && !v.city) return null;
  const loc = await geocodeVenue(v);
  if (!loc) return emptyFail('no-geo', {
    source: 'open-meteo',
    error: '未能定位球场城市',
    venueName: v.name,
    venueCity: v.city,
    sourceNote: 'Open-Meteo',
  });
  let target = Number.isFinite(opts && opts.kickoffMs) ? opts.kickoffMs : Date.now();
  const start = ymd(target - 36 * 3600 * 1000);
  const end = ymd(target + 36 * 3600 * 1000);
  const q = 'latitude=' + encodeURIComponent(loc.lat)
    + '&longitude=' + encodeURIComponent(loc.lon)
    + '&hourly=' + HOURLY
    + '&wind_speed_unit=ms'
    + '&timezone=auto'
    + '&timeformat=unixtime'
    + '&start_date=' + start
    + '&end_date=' + end;
  const now = Date.now();
  const daysPast = (now - target) / 86400000;
  const daysAhead = (target - now) / 86400000;
  const urls = [];
  if (daysPast > 4) {
    urls.push(ARCHIVE + '?' + q);
    urls.push(FORECAST + '?' + q);
  } else if (daysAhead > 15) {
    urls.push(FORECAST + '?' + q);
  } else {
    urls.push(FORECAST + '?' + q);
    if (daysPast > 1) urls.push(ARCHIVE + '?' + q);
  }
  let slot = null;
  for (const url of urls) {
    try {
      const j = await httpGetJson(url, 10000);
      slot = pickHourly(j, target);
      if (slot) break;
    } catch { /* try next */ }
  }
  if (!slot) {
    return emptyFail('no-slot', {
      source: 'open-meteo',
      error: '该时刻暂无天气记录',
      venueName: v.name,
      venueCity: v.city,
      sourceNote: 'Open-Meteo',
    });
  }
  const mapped = mapWmo(slot.weatherCode);
  const hpa = slot.pressureHpa;
  const mm = hpa == null ? null : Math.round(hpa * 0.750061683);
  const hasAny = slot.tempC != null || slot.humidity != null || slot.windMs != null || slot.weatherCode != null;
  if (!hasAny) {
    return emptyFail('no-slot', {
      source: 'open-meteo',
      error: '该时刻暂无天气记录',
      venueName: v.name,
      venueCity: v.city,
      sourceNote: 'Open-Meteo',
    });
  }
  return {
    ok: true,
    source: 'open-meteo',
    type: mapped.type,
    labelZh: mapped.labelZh,
    description: '',
    tempC: slot.tempC,
    humidity: slot.humidity,
    windMs: slot.windMs,
    pressureHpa: hpa,
    pressureMmHg: mm,
    venueName: v.name,
    venueCity: v.city,
    asof: slot.atMs ? new Date(slot.atMs).toISOString() : '',
    reportType: 'forecast',
    sourceNote: '预报',
    reason: '',
    error: '',
    smFixtureId: (opts && opts.smFixtureId) || null,
  };
}

async function fetchFromSportMonks(opts) {
  const token = heatSource.readToken && heatSource.readToken();
  if (!token) return emptyFail('no-token', { error: '天气源未配置' });
  const fetchJson = heatSource.smGet;
  if (!fetchJson) return emptyFail('no-token', { error: '天气源未配置' });
  let resolved;
  try {
    resolved = await resolveFixture(fetchJson, opts || {});
  } catch (e) {
    const code = String((e && e.message) || e);
    const reason = /quota|429/.test(code) ? 'quota' : 'lookup-failed';
    return emptyFail(reason, { error: '暂未匹配到本场天气' });
  }
  if (!resolved || !resolved.id) {
    return emptyFail((resolved && resolved.reason) || 'no-fixture', { error: '暂未匹配到本场天气' });
  }
  let body;
  try {
    body = await fetchJson(`/football/fixtures/${resolved.id}`, {
      include: 'weatherReport;venue',
    });
  } catch (e) {
    try {
      body = await fetchJson(`/football/fixtures/${resolved.id}`, {
        include: 'venue',
      });
    } catch (e2) {
      return emptyFail('upstream', { error: '天气数据暂时不可用', smFixtureId: resolved.id });
    }
  }
  const fx = (body && body.data) || null;
  if (!fx) {
    return emptyFail('no-fixture', { error: '暂未匹配到本场天气', smFixtureId: resolved.id });
  }
  const wr = fx.weatherreport || fx.weatherReport || fx.weather_report || null;
  const venue = fx.venue || null;
  const pack = normalizeWeather(wr, venue, fx, opts && opts.kickoffMs);
  if (pack.smFixtureId == null) pack.smFixtureId = fx.id || resolved.id;
  if (!pack.ok) pack._venue = venue;
  else pack._venue = venue;
  return pack;
}

async function fetchWeather(opts) {
  const sm = await fetchFromSportMonks(opts || {});
  if (sm && sm.ok) {
    delete sm._venue;
    return sm;
  }
  const venue = (sm && sm._venue) || null;
  if (sm) delete sm._venue;
  try {
    const om = await fetchOpenMeteo(opts || {}, venue);
    if (om && om.ok) {
      if (sm && sm.smFixtureId && !om.smFixtureId) om.smFixtureId = sm.smFixtureId;
      return om;
    }
  } catch { /* keep SM miss */ }
  return sm || emptyFail('unavailable', { error: '天气数据暂时不可用' });
}

function persist(opts, payload, now) {
  const key = cacheKey(opts || {});
  const at = Number.isFinite(now) ? now : Date.now();
  writeCached(key, payload, at);
  if (opts && opts.matchId) writeStore(opts.matchId, payload, at);
}

function scheduleRefresh(opts) {
  const id = opts && opts.matchId ? String(opts.matchId) : cacheKey(opts || {});
  if (!id || refreshing.has(id)) return;
  refreshing.add(id);
  setImmediate(() => {
    fetchWeather(opts || {})
      .then((pack) => persist(opts, pack, Date.now()))
      .catch(() => {})
      .then(() => { refreshing.delete(id); });
  });
}

async function getMatchWeather(opts) {
  const now = Date.now();
  const key = cacheKey(opts || {});
  const matchId = opts && opts.matchId ? String(opts.matchId) : '';
  const stored = matchId ? readStore(matchId) : null;
  if (stored && stored.payload) {
    writeCached(key, stored.payload, stored.at);
    if (isFreshRow(stored, now)) {
      return decorate(stored.payload, { cached: true, stale: false, fetchedAt: stored.at });
    }
    scheduleRefresh(opts);
    return decorate(stored.payload, { cached: true, stale: true, fetchedAt: stored.at });
  }
  const mem = readCached(key, now);
  if (mem) return decorate(mem, { cached: true, stale: false, fetchedAt: now });
  const pack = await fetchWeather(opts || {});
  persist(opts, pack, now);
  return decorate(pack, { cached: false, stale: false, fetchedAt: now });
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

function selectPrefetchMatches(selling, schedule, nowMs, extraLists) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const soon = 12 * 3600 * 1000;
  const after = 6 * 3600 * 1000;
  const extra = (schedule || []).filter((m) => {
    const ko = kickoffMsOf(m);
    if (!Number.isFinite(ko)) return false;
    const age = now - ko;
    return age > -soon && age < after;
  });
  let nearby = [];
  try {
    const np = require('./nearby-prefetch');
    const results = extraLists && extraLists.results;
    nearby = np.selectNearbyMatches(
      [selling || [], schedule || [], results || []],
      now,
      { daysBack: 2, daysForward: 2 }
    );
  } catch (_) { nearby = []; }
  return uniqMatches([selling || [], extra, nearby]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefetchStatus() {
  return { ...prefetchState };
}

function resetPrefetchState() {
  prefetchState = {
    at: 0, reason: '', running: false, ok: 0, fail: 0, n: 0, ms: 0, matchIds: [],
  };
}

async function prefetchWeather(matches, opts) {
  if (prefetchState.running) return { ...prefetchState, skippedRun: true };
  prefetchState.running = true;
  const t0 = Date.now();
  const reason = (opts && opts.reason) || 'manual';
  const list = (matches || []).filter((m) => m && m.id);
  const limit = opts && opts.limit != null ? Number(opts.limit) : list.length;
  const gapMs = opts && opts.gapMs != null ? Number(opts.gapMs) : 800;
  const force = !!(opts && opts.force);
  const slice = list.slice(0, Number.isFinite(limit) && limit >= 0 ? limit : list.length);
  const rows = [];
  let ok = 0;
  let fail = 0;
  try {
    for (let i = 0; i < slice.length; i++) {
      const m = slice[i];
      const ko = kickoffMsOf(m);
      const args = {
        matchId: String(m.id),
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        home: m.home,
        away: m.away,
        date: m.date,
        time: m.time,
        businessDate: m.businessDate,
        kickoffMs: Number.isFinite(ko) ? ko : null,
        venueName: m.venueName || (m.venue && m.venue.name) || '',
        venueCity: m.venueCity || (m.venue && m.venue.city) || '',
      };
      const existing = readStore(args.matchId);
      if (!force && existing && isFreshRow(existing, Date.now())) {
        rows.push({ id: args.matchId, status: 'fresh', ok: !!(existing.payload && existing.payload.ok) });
        if (existing.payload && existing.payload.ok) ok += 1;
        else fail += 1;
        continue;
      }
      try {
        const pack = await fetchWeather(args);
        persist(args, pack, Date.now());
        rows.push({ id: args.matchId, status: pack && pack.ok ? 'ok' : (pack && pack.reason) || 'empty', ok: !!(pack && pack.ok), source: pack && pack.source });
        if (pack && pack.ok) ok += 1;
        else fail += 1;
        if (pack && pack.reason === 'quota') break;
      } catch (e) {
        fail += 1;
        rows.push({ id: args.matchId, status: 'fail', ok: false, error: (e && e.message) || 'fail' });
      }
      if (gapMs > 0 && i < slice.length - 1) await sleep(gapMs);
    }
  } finally {
    prefetchState = {
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
  console.log('[weather-prefetch]', reason, JSON.stringify({ ok, fail, n: slice.length, ms: prefetchState.ms }));
  return { ...prefetchState, rows };
}

module.exports = {
  getMatchWeather,
  prefetchWeather,
  prefetchStatus,
  resetPrefetchState,
  selectPrefetchMatches,
  normalizeWeather,
  mapDescription,
  mapWmo,
  pickTemp,
  pickDayPart,
  parsePercent,
  emptyFail,
  readStore,
  writeStore,
  isFreshRow,
  storeTtl,
  resetStoreForTest,
  FORECAST_TTL_MS,
  ACTUAL_TTL_MS,
  NEGATIVE_TTL_MS,
  kickoffMsOf,
  fidFromLocalMap,
  fidFromSiblingPacks,
};
