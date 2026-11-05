/**
 * Fill data/predict-heat/<sportteryTeamId>.json from recent finished fixtures
 * that actually carry ball coordinates. No token is written to disk or HTML.
 * When the source is missing or a team has no coordinates, the pack stays empty
 * and the pitch keeps the honest empty note.
 */
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');

const API = 'https://api.sportmonks.com/v3';
const FRESH_MS = 18 * 3600 * 1000;
const NEGATIVE_MS = 6 * 3600 * 1000;
const MAX_FIXTURES = 5;
const MAX_COORDS = 800;

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(teamId) {
  return path.join(dataDir(), 'predict-heat', `${teamId}.json`);
}

function readToken() {
  const env = process.env.SPORTMONKS_TOKEN || process.env.SPORTMONKS_API_TOKEN || '';
  if (String(env).trim()) return String(env).trim();
  const candidates = [
    path.join(dataDir(), 'sportmonks_token.txt'),
    path.join(__dirname, '..', 'api_token.txt'),
  ];
  for (const file of candidates) {
    try {
      const t = fs.readFileSync(file, 'utf8').trim();
      if (t && !t.startsWith('#')) return t;
    } catch { /* absent */ }
  }
  return '';
}

function englishName(teamId, nameZh) {
  try {
    const en = require('./process-stats').resolveNameEn(teamId, '', nameZh);
    if (en && !/[\u4e00-\u9fff]/.test(en)) return en;
  } catch { /* map optional */ }
  try {
    const { TEAM_ZH } = require('./league-tables');
    const zh = String(nameZh || '').trim();
    for (const [en, label] of Object.entries(TEAM_ZH || {})) {
      if (label === zh) return en;
    }
  } catch { /* map optional */ }
  return '';
}

function writePack(teamId, pack) {
  const file = cacheFile(teamId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = {
    teamId: String(teamId),
    smTeamId: pack.smTeamId || null,
    fetchedAt: pack.fetchedAt || Date.now(),
    reason: pack.reason || '',
    fixtures: pack.fixtures || [],
    recentIds: (pack.recentIds || []).filter(Boolean).slice(0, 8),
  };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, file);
  return {
    fixtures: body.fixtures,
    sideId: body.smTeamId || teamId,
    smTeamId: body.smTeamId,
    recentIds: body.recentIds,
    fetchedAt: body.fetchedAt,
    reason: body.reason,
  };
}

function hasCoords(pack) {
  return !!(pack && (pack.fixtures || []).some(fx => {
    const bc = fx && (fx.ballcoordinates || fx.ballCoordinates);
    return bc && bc.length;
  }));
}

function freshEnough(pack, now) {
  const at = Number(pack && pack.fetchedAt) || 0;
  if (!at) return hasCoords(pack);
  const age = now - at;
  if (hasCoords(pack)) return age < FRESH_MS;
  return age < NEGATIVE_MS;
}

function pickTeamId(rows, name) {
  const q = String(name || '').trim().toLowerCase();
  const list = Array.isArray(rows) ? rows : [];
  const exact = list.find(r => String(r && r.name || '').toLowerCase() === q);
  if (exact) return exact.id;
  const loose = list.find(r => {
    const n = String(r && r.name || '').toLowerCase();
    return n && (n.includes(q) || q.includes(n));
  });
  return (loose || list[0] || {}).id || null;
}

function isFinished(fx) {
  const st = (fx && fx.state) || {};
  const blob = `${st.short_name || ''} ${st.developer_name || ''} ${st.name || ''} ${st.state || ''}`;
  if (/FT|AET|PEN|FINISHED|FULL/i.test(blob)) return true;
  const id = Number(st.id || fx.state_id);
  return id === 5 || id === 7 || id === 8;
}

function thinCoords(list) {
  const arr = Array.isArray(list) ? list : [];
  const step = arr.length > MAX_COORDS ? Math.ceil(arr.length / MAX_COORDS) : 1;
  const out = [];
  for (let i = 0; i < arr.length; i += step) {
    const p = arr[i];
    if (!p) continue;
    out.push({
      x: p.x,
      y: p.y,
      period_id: p.period_id,
      timer: p.timer || null,
    });
  }
  return out;
}

function slimFixture(fx) {
  if (!fx) return null;
  const participants = (fx.participants || []).map(p => ({
    id: p.id,
    meta: { location: (p.meta && p.meta.location) || p.location || null },
  })).filter(p => p.id != null && p.meta.location);
  const coords = thinCoords(fx.ballcoordinates || fx.ballCoordinates || []);
  return {
    id: fx.id,
    participants,
    periods: (fx.periods || []).map(p => ({ id: p.id, description: p.description || '' })),
    ballcoordinates: coords,
    events: (fx.events || []).filter(e => [14, 15, 16].includes(Number(e.type_id))).map(e => ({
      type_id: e.type_id,
      participant_id: e.participant_id,
      minute: e.minute,
      extra_minute: e.extra_minute || 0,
    })),
  };
}

function defaultFetch(urlPath, params) {
  const token = readToken();
  if (!token) return Promise.reject(new Error('no-token'));
  const u = new URL(API + urlPath);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  u.searchParams.set('api_token', token);
  return new Promise((resolve, reject) => {
    const req = https.get(u, {
      headers: { Accept: 'application/json', 'User-Agent': 'yunqiumi-predict-heat/1.0' },
      timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = JSON.parse(raw); } catch {
          reject(new Error(`bad-json ${res.statusCode}`));
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`http ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function ensureTeamHeat({ teamId, nameZh, pack, fetchImpl, now } = {}) {
  const heat = require('./heat-pitch');
  const current = pack || heat.loadHeatPack(teamId);
  const clock = now || Date.now();
  if (freshEnough(current, clock)) return current;
  const fetchJson = fetchImpl || (readToken() ? defaultFetch : null);
  if (!fetchJson) return current;
  const name = englishName(teamId, nameZh);
  if (!name) {
    return writePack(teamId, { fixtures: [], smTeamId: null, fetchedAt: clock, reason: 'no-name' });
  }
  let smTeamId = null;
  try {
    const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    smTeamId = pickTeamId(found && found.data, name);
  } catch (e) {
    return current;
  }
  if (!smTeamId) {
    return writePack(teamId, { fixtures: [], smTeamId: null, fetchedAt: clock, reason: 'no-team' });
  }
  const end = new Date(clock);
  const start = new Date(clock - 140 * 86400000);
  const ymd = d => d.toISOString().slice(0, 10);
  let ids = [];
  try {
    const list = await fetchJson(`/football/fixtures/between/${ymd(start)}/${ymd(end)}/${smTeamId}`, {
      include: 'participants;state',
      per_page: 40,
    });
    ids = (list && list.data || [])
      .filter(isFinished)
      .sort((a, b) => String(b.starting_at || '').localeCompare(String(a.starting_at || '')))
      .map(fx => fx.id)
      .filter(Boolean)
      .slice(0, 8);
  } catch (e) {
    return current;
  }
  const fixtures = [];
  for (const id of ids.slice(0, MAX_FIXTURES)) {
    try {
      const body = await fetchJson(`/football/fixtures/${id}`, {
        include: 'participants;periods;ballCoordinates;events',
      });
      const slim = slimFixture(body && body.data);
      if (slim && slim.ballcoordinates.length) fixtures.push(slim);
    } catch { /* skip one fixture */ }
  }
  return writePack(teamId, {
    fixtures,
    smTeamId,
    recentIds: ids,
    fetchedAt: clock,
    reason: fixtures.length ? '' : 'no-coordinates',
  });
}

module.exports = {
  englishName,
  pickTeamId,
  isFinished,
  slimFixture,
  hasCoords,
  freshEnough,
  ensureTeamHeat,
  readToken,
  smGet: defaultFetch,
};
