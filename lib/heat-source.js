/**
 * Fill data/predict-heat/<sportteryTeamId>.json from recent finished fixtures
 * that actually carry ball coordinates. No token is written to disk or HTML.
 * When the source is missing or a team has no coordinates, the pack stays empty
 * and the pitch keeps the honest empty note.
 * Respects Growth ~2500 calls/hour with a rolling file counter + minimum gap.
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
const HOURLY_CAP = Math.min(2500, Number(process.env.SM_HOURLY_CAP) || 2400);
const MIN_GAP_MS = Number(process.env.SM_MIN_GAP_MS) || 450;
const PRESSURE_PROBE_MS = 24 * 3600 * 1000;

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(teamId) {
  return path.join(dataDir(), 'predict-heat', `${teamId}.json`);
}

function quotaFile() {
  return path.join(dataDir(), 'predict-heat', '_sm_quota.json');
}

function pressureMetaFile() {
  return path.join(dataDir(), 'predict-heat', '_sm_pressure.json');
}

let lastSmCallAt = 0;

function readQuota() {
  try {
    const j = JSON.parse(fs.readFileSync(quotaFile(), 'utf8'));
    return {
      windowStart: Number(j.windowStart) || 0,
      count: Number(j.count) || 0,
    };
  } catch {
    return { windowStart: 0, count: 0 };
  }
}

function writeQuota(state) {
  try {
    const file = quotaFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  } catch { /* optional */ }
}

async function paceGap() {
  const now = Date.now();
  const gap = lastSmCallAt + MIN_GAP_MS - now;
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  lastSmCallAt = Date.now();
}

function readPressureMeta() {
  try {
    return JSON.parse(fs.readFileSync(pressureMetaFile(), 'utf8'));
  } catch {
    return { available: null, lastCheck: 0, detail: '' };
  }
}

function writePressureMeta(meta) {
  try {
    const file = pressureMetaFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(meta));
    fs.renameSync(tmp, file);
  } catch { /* optional */ }
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
  try {
    const en = require('./i18n-football').natEn(nameZh);
    if (en && !/[\u4e00-\u9fff]/.test(en)) return en;
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
    scoreFixtures: pack.scoreFixtures || [],
    recentIds: (pack.recentIds || []).filter(Boolean).slice(0, 8),
  };
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, file);
  return {
    fixtures: body.fixtures,
    scoreFixtures: body.scoreFixtures,
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
  return age < 20 * 60 * 1000;
}

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function foldTeam(s) {
  return stripAccents(s)
    .replace(/['’`.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-_/]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function teamTokens(s) {
  return foldTeam(s).split(' ').filter(Boolean);
}

function isYouthName(name) {
  return /\b(u-?\d{2}|youth|women|woman|wnt|ladies|reserves|reserve)\b/i.test(String(name || ''))
    || /\b(ii|b)\b/i.test(String(name || ''));
}

function isNationalRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.national === true || row.national === 1 || row.national === 'true') return true;
  const typ = row.type && typeof row.type === 'object' ? (row.type.name || row.type.code) : row.type;
  return /national/i.test(String(typ || ''));
}

/** Tokens that may follow a country name on a senior national team ("England National Team"). */
const NT_EXTRA = new Set([
  'national', 'team', 'nt', 'xi', 'football', 'soccer', 'association',
  'fa', 'ff', 'mens', 'men', 'senior', 'a', 'the', 'of', 'rep', 'republic',
]);

/** Generic club prefixes/suffixes allowed as extras for a club query ("FC Porto" vs "Porto"). */
const GENERIC_CLUB = new Set([
  'fc', 'cf', 'sc', 'ac', 'afc', 'cfc', 'rfc', 'sfc', 'bfc',
  'nk', 'fk', 'sk', 'bk', 'ik', 'if', 'sv', 'al', 'de', 'the',
  'club', 'calcio', 'ss', 'as', 'rc', 'cd', 'ud', 'sd', 'rcd',
  'vfb', 'tsv', 'bsc', 'acf', 'us', 'football', 'soccer',
]);

const CLUB_MARKERS = new Set([
  ...GENERIC_CLUB,
  'united', 'city', 'town', 'rovers', 'wanderers', 'athletic', 'atletico',
  'sporting', 'revolution', 'galaxy', 'fire', 'impact', 'dynamo',
  'hotspur', 'forest', 'villa', 'wednesday', 'albion', 'county',
  'real', 'inter', 'university', 'college',
]);

function countryAliasFolds(query) {
  const folds = new Set();
  const raw = String(query || '').trim();
  if (!raw) return folds;
  folds.add(foldTeam(raw));
  try {
    const i18n = require('./i18n-football');
    let labelZh = /[\u4e00-\u9fff]/.test(raw) ? raw : (i18n.natZh(raw) || '');
    if (!labelZh) {
      for (const [en, zh] of Object.entries(i18n.NAT || {})) {
        if (foldTeam(en) === foldTeam(raw)) { labelZh = zh; break; }
      }
    }
    if (!labelZh) {
      for (const [zh, en] of Object.entries(i18n.NAT_ZH_ALIAS || {})) {
        if (foldTeam(en) === foldTeam(raw) || zh === raw) { labelZh = zh; break; }
      }
    }
    if (labelZh) {
      const primary = i18n.natEn(labelZh);
      if (primary) folds.add(foldTeam(primary));
      for (const [en, zh] of Object.entries(i18n.NAT || {})) {
        if (zh === labelZh) folds.add(foldTeam(en));
      }
      for (const [zh, en] of Object.entries(i18n.NAT_ZH_ALIAS || {})) {
        if (zh === labelZh || (primary && foldTeam(en) === foldTeam(primary))) folds.add(foldTeam(en));
      }
    }
  } catch { /* i18n optional */ }
  folds.delete('');
  return folds;
}

function isCountryQuery(name) {
  const raw = String(name || '').trim();
  if (!raw) return false;
  try {
    const i18n = require('./i18n-football');
    if ((i18n.NAT_ZH_ALIAS || {})[raw]) return true;
    if (Object.values(i18n.NAT || {}).includes(raw)) return true;
    const f = foldTeam(raw);
    if (Object.keys(i18n.NAT || {}).some((en) => foldTeam(en) === f)) return true;
    if (Object.values(i18n.NAT_ZH_ALIAS || {}).some((en) => foldTeam(en) === f)) return true;
    return false;
  } catch {
    return false;
  }
}

function extrasAllowed(extra, allowed) {
  return extra.every((t) => allowed.has(t));
}

/**
 * Pick a SportMonks team id from search rows.
 * Never use loose substring matches or "first row" fallback:
 * short country names like England must not hit New England Revolution.
 * No confident match → null (honest empty) rather than a wrong club.
 */

/**
 * SportMonks senior national-team ids that were confirmed by
 * GET /football/teams/{id} (name is the senior side, type national,
 * not U21 / women / a club). Search on the current token often omits
 * these; we may still look them up by id. Never put an unverified id
 * in this map.
 *
 * Keys are folded Chinese or English names (foldTeam).
 */
const VERIFIED_NT_IDS = {
  // Populated only after a live /teams/{id} confirmation. Keys are foldTeam forms.
  // Evidence: official 周二002 中国 vs 巴林 (2042829), SM fixture 19900701
  // 2026-11-17 12:00 UTC, participants China PR 18599 (home) / Bahrain 18590 (away),
  // also in production live-stats/sm-team-form/18599.json. Sporttery teamIds 426 / 427.
  '中国': 18599,
  china: 18599,
  'china pr': 18599,
  '巴林': 18590,
  bahrain: 18590,
};

function verifiedNtId(name, teamId) {
  const raw = String(name || '').trim();
  const keys = new Set();
  if (raw) {
    keys.add(foldTeam(raw));
    for (const a of countryAliasFolds(raw)) keys.add(a);
  }
  try {
    const en = englishName(teamId, raw);
    if (en) {
      keys.add(foldTeam(en));
      for (const a of countryAliasFolds(en)) keys.add(a);
    }
  } catch { /* optional */ }
  for (const k of keys) {
    if (k && VERIFIED_NT_IDS[k]) return VERIFIED_NT_IDS[k];
  }
  return null;
}

function pickTeamId(rows, name) {
  const query = String(name || '').trim();
  if (!query) return null;
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id != null && r.name);
  if (!list.length) return null;
  const qFold = foldTeam(query);
  const aliases = countryAliasFolds(query);
  const country = isCountryQuery(query);
  const qTokens = teamTokens(query);
  const youthQuery = isYouthName(query);

  const scored = [];
  for (const row of list) {
    if (!youthQuery && isYouthName(row.name)) continue;
    const nFold = foldTeam(row.name);
    const nTokens = teamTokens(row.name);
    if (!nFold || !nTokens.length) continue;

    let extra;
    let allowed;
    if (country) {
      const aliasHit = [...aliases].some((a) => a && nFold === a);
      const aliasTokensHit = [...aliases].some((a) => {
        const at = a.split(' ').filter(Boolean);
        return at.length && at.every((tok) => nTokens.includes(tok));
      });
      if (!aliasHit && !aliasTokensHit && nFold !== qFold) {
        if (!(isNationalRow(row) && qTokens.every((tok) => nTokens.includes(tok)))) continue;
      }
      extra = nTokens.filter((tok) => !qTokens.includes(tok));
      // Drop tokens that belong to a longer country alias (Republic of Ireland vs Ireland).
      const aliasExtraOk = [...aliases].some((a) => {
        const at = new Set(a.split(' ').filter(Boolean));
        return extra.every((tok) => at.has(tok) || NT_EXTRA.has(tok));
      });
      if (extra.some((tok) => CLUB_MARKERS.has(tok) && !qTokens.includes(tok) && !NT_EXTRA.has(tok))) continue;
      if (!aliasHit && !extrasAllowed(extra, NT_EXTRA) && !aliasExtraOk) continue;
      allowed = NT_EXTRA;
    } else {
      if (nFold !== qFold && !qTokens.every((tok) => nTokens.includes(tok))) continue;
      extra = nTokens.filter((tok) => !qTokens.includes(tok));
      if (nFold !== qFold && !extrasAllowed(extra, GENERIC_CLUB)) continue;
      allowed = GENERIC_CLUB;
    }

    const exact = nFold === qFold || aliases.has(nFold);
    let rank;
    if (exact) rank = 0;
    else if (country && isNationalRow(row)) rank = 1;
    else rank = 2;
    scored.push({
      id: row.id,
      rank,
      extra: extra.length,
      len: nFold.length,
      national: isNationalRow(row) ? 0 : 1,
    });
  }
  if (!scored.length) {
    // A unique search hit whose name contains every query token is safe when
    // the query itself is distinctive: "Kashima" → Kashima Antlers,
    // "Shimizu" → Shimizu S-Pulse, "Western Sydney" → Western Sydney Wanderers.
    // Still reject generic shorts ("United", "Real", "City") even if only one row came back.
    if (!country && qTokens.length) {
      const ambiguous = new Set(['united', 'city', 'real', 'athletic', 'sporting', 'inter', 'rangers', 'sport', 'club']);
      const distinctive = qTokens.some((tok) => tok.length >= 3 && !GENERIC_CLUB.has(tok) && !ambiguous.has(tok));
      if (distinctive) {
        const hits = list.filter((row) => {
          if (!youthQuery && isYouthName(row.name)) return false;
          const nTokens = teamTokens(row.name);
          return qTokens.every((tok) => nTokens.includes(tok));
        });
        if (hits.length === 1) return hits[0].id;
      }
    }
    return null;
  }
  scored.sort((a, b) => a.rank - b.rank || a.extra - b.extra || a.national - b.national || a.len - b.len);
  const best = scored[0];
  const tied = scored.filter((s) => s.rank === best.rank && s.extra === best.extra && s.national === best.national && s.id !== best.id);
  // Same identity under a different row is fine; two different teams at the same score is not a guess.
  if (tied.length) return null;
  return best.id;
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
    scores: (fx.scores || []).map(s => ({
      description: s.description || '',
      score: {
        goals: s.score && s.score.goals,
        participant: s.score && s.score.participant,
      },
    })),
    events: (fx.events || []).filter(e => [14, 15, 16].includes(Number(e.type_id))).map(e => ({
      type_id: e.type_id,
      participant_id: e.participant_id,
      minute: e.minute,
      extra_minute: e.extra_minute || 0,
    })),
  };
}

function rawHttpGet(urlPath, params) {
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
      headers: { Accept: 'application/json', 'User-Agent': 'yunqiumi-predict-heat/1.1' },
      timeout: 12000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = JSON.parse(raw); } catch {
          const err = new Error(`bad-json ${res.statusCode}`);
          err.statusCode = res.statusCode;
          reject(err);
          return;
        }
        if (res.statusCode >= 400) {
          const err = new Error(`http ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = body;
          reject(err);
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

/** Production SM GET with hourly cap + pacing (tests inject fetchImpl to bypass). */
async function defaultFetch(urlPath, params) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = Date.now();
    let { windowStart, count } = readQuota();
    if (!windowStart || now - windowStart >= 3600000) {
      windowStart = now;
      count = 0;
    }
    if (count >= HOURLY_CAP) {
      const wait = Math.min(3600000 - (now - windowStart), 120000);
      await new Promise(r => setTimeout(r, Math.max(1500, wait)));
      continue;
    }
    await paceGap();
    try {
      const body = await rawHttpGet(urlPath, params);
      count += 1;
      writeQuota({ windowStart, count });
      return body;
    } catch (e) {
      const code = Number(e && e.statusCode);
      if (code === 429 || code === 503) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('sm-quota-exhausted');
}

/**
 * Optional diagnostic only. 403 / missing means the Pressure&xG add-on is not on this token.
 * Do not resubscribe. Predict UI does not render pressure.
 */
async function probePressureOnce() {
  const prev = readPressureMeta();
  const now = Date.now();
  if (prev.lastCheck && now - prev.lastCheck < PRESSURE_PROBE_MS && prev.available != null) {
    return prev;
  }
  if (!readToken()) {
    writePressureMeta({ available: false, lastCheck: now, detail: 'no-token' });
    return readPressureMeta();
  }
  try {
    await rawHttpGet('/football/pressures', { per_page: 1 });
    const ok = { available: true, lastCheck: now, detail: 'endpoint-ok' };
    writePressureMeta(ok);
    return ok;
  } catch (e) {
    const code = Number(e && e.statusCode);
    const detail = code === 403 ? '403-addon' : (code ? `http-${code}` : String(e.message || e));
    const out = { available: false, lastCheck: now, detail };
    writePressureMeta(out);
    return out;
  }
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
  const scoreFixtures = [];
  for (const id of ids.slice(0, MAX_FIXTURES)) {
    try {
      const body = await fetchJson(`/football/fixtures/${id}`, {
        include: 'participants;periods;scores;ballCoordinates;events',
      });
      const slim = slimFixture(body && body.data);
      if (!slim) continue;
      try {
        const fgc = require('./fixture-goals-cache');
        fgc.upsertFromFixture(body.data);
      } catch { /* optional */ }
      if ((slim.scores || []).some(s => s.description === '1ST_HALF')) scoreFixtures.push(slim);
      if (slim.ballcoordinates.length) fixtures.push(slim);
    } catch { /* skip one fixture */ }
  }
  return writePack(teamId, {
    fixtures,
    scoreFixtures,
    smTeamId,
    recentIds: ids,
    fetchedAt: clock,
    reason: fixtures.length ? '' : 'no-coordinates',
  });
}

module.exports = {
  englishName,
  pickTeamId,
  verifiedNtId,
  VERIFIED_NT_IDS,
  foldTeam,
  isFinished,
  slimFixture,
  hasCoords,
  freshEnough,
  ensureTeamHeat,
  readToken,
  smGet: defaultFetch,
  rawSmGet: rawHttpGet,
  readPressureMeta,
  probePressureOnce,
};
