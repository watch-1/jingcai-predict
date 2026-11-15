/**
 * SportMonks-only match weather for GET /api/match-weather.
 * Token stays in heat-source readToken (env / server file). Never invent values:
 * missing fields are null. Open-Meteo is a client fallback, not used here.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const heatSource = require('./heat-source');

const CACHE_MS = 6 * 60 * 1000;
const NEGATIVE_MS = 3 * 60 * 1000;
const cache = new Map();

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
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

function mapDescription(desc) {
  const raw = String(desc || '').trim();
  const s = raw.toLowerCase();
  if (!s) return { type: 'neutral', labelZh: '—' };
  if (/thunder|lightning|storm/.test(s)) {
    return { type: 'storm', labelZh: /thunder|lightning/.test(s) ? '雷暴' : '暴雨' };
  }
  if (/heavy|intensity rain|torrential|downpour/.test(s)) return { type: 'storm', labelZh: '大雨' };
  if (/moderate\s+rain/.test(s)) return { type: 'storm', labelZh: '中雨' };
  if (/light\s+rain|drizzle/.test(s)) return { type: 'light-rain', labelZh: '小雨' };
  if (/\brain\b|shower/.test(s)) return { type: 'storm', labelZh: '雨' };
  if (/snow|sleet/.test(s)) return { type: 'cloudy', labelZh: '雪' };
  if (/fog|mist|haze/.test(s)) return { type: 'cloudy', labelZh: '雾' };
  if (/overcast/.test(s)) return { type: 'cloudy', labelZh: '阴' };
  if (/broken clouds|scattered clouds|few clouds|cloud/.test(s)) {
    return { type: 'cloudy', labelZh: /few/.test(s) ? '少云' : '多云' };
  }
  if (/clear|sunny|sky is clear|fair/.test(s)) return { type: 'sunny', labelZh: '晴' };
  return { type: 'cloudy', labelZh: raw || '多云' };
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

function readCached(key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  const ttl = hit.payload && hit.payload.ok ? CACHE_MS : NEGATIVE_MS;
  if (now - hit.at < ttl) return hit.payload;
  cache.delete(key);
  return null;
}

function writeCached(key, payload, now) {
  cache.set(key, { at: now, payload });
  return payload;
}

async function resolveSmTeam(fetchJson, teamId, zh, known) {
  if (known) return known;
  if (heatSource.verifiedNtId) {
    const pinned = heatSource.verifiedNtId(zh, teamId);
    if (pinned) return pinned;
  }
  const name = heatSource.englishName(teamId, zh);
  if (!name) return null;
  const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
  const picked = heatSource.pickTeamId(found && found.data, name);
  if (picked) return picked;
  if (heatSource.verifiedNtId) {
    const pinnedEn = heatSource.verifiedNtId(name, teamId);
    if (pinnedEn) return pinnedEn;
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

async function resolveFixture(fetchJson, opts) {
  const knownFid = opts.smFixtureId || fidFromLocalMap(opts.matchId);
  if (knownFid) return { id: knownFid };
  const homeSm = await resolveSmTeam(fetchJson, opts.homeTeamId, opts.home, opts.homeSmId);
  const awaySm = await resolveSmTeam(fetchJson, opts.awayTeamId, opts.away, opts.awaySmId);
  if (!homeSm || !awaySm) return { reason: 'no-team', homeSm, awaySm };
  const ko = Number.isFinite(opts.kickoffMs) ? opts.kickoffMs : Date.now();
  const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${homeSm}`, {
    include: 'participants',
    per_page: 20,
  });
  const hit = ((body && body.data) || []).find((fx) => {
    const ids = (fx.participants || []).map((p) => Number(p.id));
    return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
  });
  if (!hit || !hit.id) return { reason: 'no-fixture', homeSm, awaySm };
  return { id: hit.id, preview: hit, homeSm, awaySm };
}

async function getMatchWeather(opts) {
  const now = Date.now();
  const key = cacheKey(opts || {});
  const cached = readCached(key, now);
  if (cached) return cached;
  const token = heatSource.readToken && heatSource.readToken();
  if (!token) return writeCached(key, emptyFail('no-token', { error: '天气源未配置' }), now);
  const fetchJson = heatSource.smGet;
  if (!fetchJson) return writeCached(key, emptyFail('no-token', { error: '天气源未配置' }), now);
  let resolved;
  try {
    resolved = await resolveFixture(fetchJson, opts || {});
  } catch (e) {
    const code = String((e && e.message) || e);
    const reason = /quota|429/.test(code) ? 'quota' : 'lookup-failed';
    return writeCached(key, emptyFail(reason, { error: '暂未匹配到本场天气' }), now);
  }
  if (!resolved || !resolved.id) {
    return writeCached(key, emptyFail((resolved && resolved.reason) || 'no-fixture', { error: '暂未匹配到本场天气' }), now);
  }
  let body;
  try {
    body = await fetchJson(`/football/fixtures/${resolved.id}`, {
      include: 'weatherReport;venue',
    });
  } catch (e) {
    return writeCached(key, emptyFail('upstream', { error: '天气数据暂时不可用', smFixtureId: resolved.id }), now);
  }
  const fx = (body && body.data) || null;
  if (!fx) {
    return writeCached(key, emptyFail('no-fixture', { error: '暂未匹配到本场天气', smFixtureId: resolved.id }), now);
  }
  const wr = fx.weatherreport || fx.weatherReport || fx.weather_report || null;
  const venue = fx.venue || null;
  const pack = normalizeWeather(wr, venue, fx, opts && opts.kickoffMs);
  if (pack.smFixtureId == null) pack.smFixtureId = fx.id || resolved.id;
  return writeCached(key, pack, now);
}

module.exports = {
  getMatchWeather,
  normalizeWeather,
  mapDescription,
  pickTemp,
  pickDayPart,
  parsePercent,
  emptyFail,
};
