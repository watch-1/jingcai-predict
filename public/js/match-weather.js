/* 366: Open-Meteo fallback when /api/match-weather is missing or has no SportMonks data.
   Never invent temperature / wind / humidity / pressure. If a field is missing, leave it null. */
(function (root) {
  'use strict';
  const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
  const HOURLY = 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,cloud_cover';
  const geoMem = Object.create(null);

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
    if (c === 63 || c === 81) return { type: 'light-rain', labelZh: '中雨' };
    if (c === 65 || c === 82) return { type: 'light-rain', labelZh: '大雨' };
    if (c === 66 || c === 67) return { type: 'light-rain', labelZh: '冻雨' };
    if (c === 71 || c === 85) return { type: 'cloudy', labelZh: '小雪' };
    if (c === 73 || c === 86) return { type: 'cloudy', labelZh: '中雪' };
    if (c === 75 || c === 77) return { type: 'cloudy', labelZh: '雪' };
    if (c === 95) return { type: 'storm', labelZh: '雷阵雨' };
    if (c === 96 || c === 99) return { type: 'storm', labelZh: '雷暴' };
    return { type: 'cloudy', labelZh: '多云' };
  }

  function packFail(status, extra) {
    return Object.assign({
      ok: false,
      status: status || 'fetch-failed',
      type: 'neutral',
      labelZh: '—',
      tempC: null,
      humidity: null,
      windMs: null,
      pressureHpa: null,
      pressureMmHg: null,
      cloudCover: null,
      venueName: '',
      venueCity: '',
      at: '',
      source: 'Open-Meteo',
      sourceNote: '',
      error: '',
    }, extra || {});
  }

  function cleanText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function kickoffMs(x) {
    if (!x) return NaN;
    if (typeof root.matchKickoffMs === 'function') {
      const n = root.matchKickoffMs(x);
      if (Number.isFinite(n)) return n;
    }
    const d = x.date || '';
    const t = String(x.time || '00:00').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
    const ms = Date.parse(d + 'T' + t + ':00+08:00');
    return Number.isFinite(ms) ? ms : NaN;
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, timeoutMs || 12000) : null;
    try {
      const r = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', signal: ctrl && ctrl.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally {
      if (t) clearTimeout(t);
    }
  }

  async function geocode(query) {
    const q = cleanText(query);
    if (!q) return null;
    if (geoMem[q]) return geoMem[q] === 'miss' ? null : geoMem[q];
    const url = GEO + '?name=' + encodeURIComponent(q) + '&count=3&language=zh';
    try {
      const j = await fetchJson(url, 10000);
      const hit = (j && j.results && j.results[0]) || null;
      if (hit && Number.isFinite(Number(hit.latitude)) && Number.isFinite(Number(hit.longitude))) {
        const loc = {
          lat: Number(hit.latitude),
          lon: Number(hit.longitude),
          name: hit.name || q,
          country: hit.country || '',
          admin: hit.admin1 || '',
        };
        geoMem[q] = loc;
        return loc;
      }
      geoMem[q] = 'miss';
      return null;
    } catch (_) {
      return null;
    }
  }

  async function geocodeVenue(venue) {
    if (!venue) return null;
    const city = cleanText(venue.city || venue.venueCity || '');
    const name = cleanText(venue.name || venue.venue || '');
    const queries = [];
    if (city) queries.push(city);
    if (name && name !== city) queries.push(name);
    if (city && name) queries.push(name + ' ' + city);
    for (let i = 0; i < queries.length; i++) {
      const loc = await geocode(queries[i]);
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
      atMs: atMs,
      deltaMs: bestD,
      tempC: num(h.temperature_2m),
      humidity: num(h.relative_humidity_2m),
      weatherCode: num(h.weather_code),
      windMs: num(h.wind_speed_10m),
      pressureHpa: num(h.surface_pressure),
      cloudCover: num(h.cloud_cover),
      timezone: j.timezone || '',
    };
  }

  function ymdUtc(ms) {
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }

  async function fetchHourly(lat, lon, targetMs) {
    const start = ymdUtc(targetMs - 36 * 3600 * 1000);
    const end = ymdUtc(targetMs + 36 * 3600 * 1000);
    const q = 'latitude=' + encodeURIComponent(lat)
      + '&longitude=' + encodeURIComponent(lon)
      + '&hourly=' + HOURLY
      + '&wind_speed_unit=ms'
      + '&timezone=auto'
      + '&timeformat=unixtime'
      + '&start_date=' + start
      + '&end_date=' + end;
    const now = Date.now();
    const daysPast = (now - targetMs) / 86400000;
    const daysAhead = (targetMs - now) / 86400000;
    const tryUrls = [];
    if (daysPast > 4) {
      tryUrls.push(ARCHIVE + '?' + q);
      tryUrls.push(FORECAST + '?' + q);
    } else if (daysAhead > 15) {
      tryUrls.push(FORECAST + '?' + q);
    } else {
      tryUrls.push(FORECAST + '?' + q);
      if (daysPast > 1) tryUrls.push(ARCHIVE + '?' + q);
    }
    let lastErr = '';
    for (let i = 0; i < tryUrls.length; i++) {
      try {
        const j = await fetchJson(tryUrls[i], 12000);
        const slot = pickHourly(j, targetMs);
        if (slot) return slot;
        lastErr = 'no-slot';
      } catch (e) {
        lastErr = (e && e.message) || 'fetch-failed';
      }
    }
    const err = new Error(lastErr || 'fetch-failed');
    err.code = lastErr;
    throw err;
  }

  async function load(x, venue) {
    const venueName = cleanText(venue && (venue.name || venue.venue) || '');
    const venueCity = cleanText(venue && (venue.city || venue.venueCity) || '');
    const base = { venueName: venueName, venueCity: venueCity, source: 'Open-Meteo' };
    if (!venueName && !venueCity) {
      return packFail('no-venue', Object.assign({ error: '暂无球场或城市信息', sourceNote: '' }, base));
    }
    const loc = await geocodeVenue({ name: venueName, city: venueCity });
    if (!loc) {
      return packFail('no-geo', Object.assign({ error: '未能定位球场城市', sourceNote: 'Open-Meteo 地理编码未命中' }, base));
    }
    let ko = kickoffMs(x);
    let sourceNote = '开赛当地时刻';
    if (!Number.isFinite(ko)) {
      ko = Date.now();
      sourceNote = '当前时刻（开赛时间未知）';
    }
    try {
      const slot = await fetchHourly(loc.lat, loc.lon, ko);
      if (!slot) return packFail('no-slot', Object.assign({ error: '该时刻暂无天气记录', sourceNote: sourceNote }, base));
      const mapped = mapWmo(slot.weatherCode);
      const hpa = slot.pressureHpa;
      const mm = hpa == null ? null : Math.round(hpa * 0.750061683);
      const hasAny = slot.tempC != null || slot.humidity != null || slot.windMs != null || slot.weatherCode != null;
      if (!hasAny) {
        return packFail('no-slot', Object.assign({ error: '该时刻暂无天气记录', sourceNote: sourceNote }, base));
      }
      return {
        ok: true,
        status: 'ok',
        type: mapped.type,
        labelZh: mapped.labelZh,
        tempC: slot.tempC,
        humidity: slot.humidity,
        windMs: slot.windMs,
        pressureHpa: hpa,
        pressureMmHg: mm,
        cloudCover: slot.cloudCover,
        weatherCode: slot.weatherCode,
        venueName: venueName,
        venueCity: venueCity,
        geoName: loc.name || '',
        at: slot.atMs ? new Date(slot.atMs).toISOString() : '',
        atMs: slot.atMs,
        source: 'Open-Meteo',
        sourceNote: sourceNote,
        error: '',
      };
    } catch (e) {
      const code = (e && e.code) || 'fetch-failed';
      return packFail(code === 'no-slot' ? 'no-slot' : 'fetch-failed', Object.assign({
        error: code === 'no-slot' ? '该时刻暂无天气记录' : '天气数据暂时不可用',
        sourceNote: sourceNote,
      }, base));
    }
  }

  root.JCWeather = { mapWmo: mapWmo, geocode: geocode, geocodeVenue: geocodeVenue, load: load };
})(typeof window !== 'undefined' ? window : this);
