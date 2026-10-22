// Derive head-to-head and recent form from local history JSONL (竞彩完场).
// H2H: local first; if empty → API-Football /fixtures/headtohead (disk-cached).
// Form: local first (date-desc); if sparse/empty → API-Football /fixtures?team=&season=
//   (no `last=` — free plan rejects it). Disk-cached under live-stats/team-form/.
'use strict';
const fs = require('fs');
const { scrubVendorLabels } = require('./scrub-vendor-labels');
const path = require('path');
const { DATA_DIR } = require('./db');

const HISTORY_FILE = path.join(DATA_DIR, 'history', 'results.jsonl');
const H2H_CACHE_DIR = () => path.join(DATA_DIR, 'live-stats', 'h2h');
const FORM_CACHE_DIR = () => path.join(DATA_DIR, 'live-stats', 'team-form');
const H2H_TTL_MS = 24 * 60 * 60 * 1000;
const H2H_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const FORM_TTL_MS = 24 * 60 * 60 * 1000;
const FORM_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_RESERVE = 20; // align with predict-report
/** Avg gap (days) above this → treat 竞彩 form as sparse (missing domestic leagues). */
const SPARSE_AVG_GAP_DAYS = 18;
/** Reject AF form if newest FT is older than this (stale free-plan season). */
const AF_FORM_MAX_AGE_DAYS = 120;

/** sporttery → AF team id seeds (avoid /teams?search when quota/key limited). */
const AF_TEAM_SEED = {
  // England
  '1': 42, '2': 66, '7': 49, '8': 52, '12': 50, '13': 33, '15': 34, '16': 71,
  '18': 41, '19': 47, '42': 44, '44': 1346, '48': 57, '49': 63, '51': 58,
  '52': 65, '60': 746, '62': 48, '64': 39, '67': 35, '99': 1379,
  // Italy
  '26': 495, '116': 489, '123': 505, '124': 496, '125': 487, '132': 497, '744': 492,
  // Germany
  '137': 157, '140': 165, '146': 168, '148': 163, '149': 171, '158': 167,
  '164': 1320, '166': 192, '170': 169,
  // France
  '179': 116, '180': 79, '181': 80, '182': 81, '184': 91, '186': 84, '187': 85,
  '195': 1298, '197': 82, '459': 77, '476': 1301, '750': 97,
  // Spain
  '172': 530, '401': 529, '505': 543, '506': 531, '508': 538, '509': 544,
  '511': 546, '512': 535, '664': 541, '675': 548, '676': 4665, '679': 533,
  '171': 542,
  // Netherlands / Belgium
  '211': 247, '225': 569, '240': 194, '245': 209, '246': 202, '247': 210,
  '250': 197, '545': 423, '816': 196, '872': 410, '1475': 427,
  // Portugal / Greece / Turkey / Nordics
  '267': 211, '269': 217, '279': 549, '280': 400, '283': 645, '286': 553,
  '289': 331, '294': 364, '311': 611, '335': 571, '393': 762, '608': 372,
  '610': 367, '613': 759, '618': 327, '888': 371, '937': 212, '1118': 333, '1128': 1026, '1276': 637,
  '1917': 370,
  // Asia / AUS / MLS / SA / Misc
  '550': 280, '551': 290, '552': 281, '554': 288, '558': 283, '561': 289,
  '562': 296, '753': 943, '786': 316, '795': 2323, '860': 2762, '909': 1605,
  '929': 2766, '969': 830, '1060': 228, '1061': 4799, '1077': 944,
  '1087': 2761, '1090': 2767, '1097': 136, '1135': 941, '1136': 946,
  '1137': 940, '1163': 347, '1489': 303, '1553': 1603, '1560': 2939,
  '1615': 285, '1619': 173, '1666': 2929, '1686': 939, '2216': 836,
  '2437': 2745, '2484': 1393, '2542': 632, '2605': 2872, '2717': 2789,
  '1025286': 15550, '1040070': 895, '1042694': 20787, '2078898': 10409,
};

let cache = { at: 0, rows: null };

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function loadRows() {
  const now = Date.now();
  if (cache.rows && now - cache.at < 10 * 60e3) return cache.rows;
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const rows = raw.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    cache = { at: now, rows };
    return rows;
  } catch {
    cache = { at: now, rows: [] };
    return [];
  }
}

function outcomeFor(row, teamId) {
  const tid = String(teamId);
  const isHome = String(row.homeTeamId) === tid;
  const isAway = String(row.awayTeamId) === tid;
  if (!isHome && !isAway) return null;
  const flag = row.winFlag; // H/D/A from home perspective
  if (flag === 'D') return 'D';
  if (isHome) return flag === 'H' ? 'W' : 'L';
  return flag === 'A' ? 'W' : 'L';
}

function summarizeForm(list) {
  const summary = { w: 0, d: 0, l: 0 };
  for (const m of list) {
    if (m.outcome === 'W') summary.w++;
    else if (m.outcome === 'D') summary.d++;
    else if (m.outcome === 'L') summary.l++;
  }
  return summary;
}

function sortMatchesDesc(list) {
  return list.slice().sort((a, b) => {
    const da = String(a.date || '');
    const db = String(b.date || '');
    if (da !== db) return db.localeCompare(da);
    // stable tie-break
    return String(b.ft || '').localeCompare(String(a.ft || ''));
  });
}

/**
 * Recent form from 竞彩 history JSONL. Always date-descending (file order is NOT chronological).
 */
function formOf(rows, teamId, limit) {
  const tid = String(teamId || '');
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  if (!tid) return { teamId: '', matches: [], summary: { w: 0, d: 0, l: 0 }, source: 'history' };
  const list = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (String(r.homeTeamId) !== tid && String(r.awayTeamId) !== tid) continue;
    const o = outcomeFor(r, tid);
    list.push({
      date: r.matchDate,
      home: r.home,
      away: r.away,
      ft: r.ft,
      outcome: o,
      homeTeamId: String(r.homeTeamId || ''),
      awayTeamId: String(r.awayTeamId || ''),
      league: r.league || '',
      source: 'history',
    });
  }
  const sorted = sortMatchesDesc(list).slice(0, lim);
  return {
    teamId: tid,
    matches: sorted,
    summary: summarizeForm(sorted),
    source: 'history',
  };
}

/**
 * 竞彩-only samples miss domestic leagues (e.g. Club Brugge = UCL only → multi-month gaps).
 */
function formIsSparse(form, limit) {
  const m = (form && form.matches) || [];
  const need = Math.min(Math.max(1, Number(limit) || 10), 10);
  if (m.length < Math.min(5, need)) return true;
  if (m.length < 2) return true;
  const dates = m.map(x => String(x.date || '')).filter(Boolean).sort();
  if (dates.length < 2) return true;
  const oldest = Date.parse(dates[0] + 'T12:00:00Z');
  const newest = Date.parse(dates[dates.length - 1] + 'T12:00:00Z');
  if (!Number.isFinite(oldest) || !Number.isFinite(newest)) return true;
  const spanDays = (newest - oldest) / 864e5;
  const avgGap = spanDays / (m.length - 1);
  if (avgGap > SPARSE_AVG_GAP_DAYS) return true;
  if (m.length >= 8 && spanDays > 160) return true;
  return false;
}

function h2h(rows, homeTeamId, awayTeamId, limit) {
  const hid = String(homeTeamId || '');
  const aid = String(awayTeamId || '');
  if (!hid || !aid) return { matches: [], summary: { homeWins: 0, draws: 0, awayWins: 0 } };
  const list = [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const a = String(r.homeTeamId), b = String(r.awayTeamId);
    if (!((a === hid && b === aid) || (a === aid && b === hid))) continue;
    let homeWins = false, awayWins = false, draw = false;
    if (r.winFlag === 'D') draw = true;
    else if (a === hid) {
      if (r.winFlag === 'H') homeWins = true; else awayWins = true;
    } else {
      if (r.winFlag === 'A') homeWins = true; else awayWins = true;
    }
    list.push({
      date: r.matchDate,
      home: r.home,
      away: r.away,
      ft: r.ft,
      forCurrentHome: homeWins ? 'W' : draw ? 'D' : 'L',
    });
  }
  const sorted = sortMatchesDesc(list).slice(0, Math.max(1, Math.min(80, Number(limit) || 10)));
  const summary = { homeWins: 0, draws: 0, awayWins: 0 };
  for (const m of sorted) {
    if (m.forCurrentHome === 'W') summary.homeWins++;
    else if (m.forCurrentHome === 'D') summary.draws++;
    else summary.awayWins++;
  }
  return { matches: sorted, summary };
}

function h2hCachePath(afA, afB) {
  const a = Number(afA), b = Number(afB);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return path.join(H2H_CACHE_DIR(), `${lo}-${hi}.json`);
}

function formCachePath(afTeamId) {
  return path.join(FORM_CACHE_DIR(), `${Number(afTeamId)}.json`);
}

function quotaAllowsAf() {
  try {
    const live = require('./live-stats');
    const q = live.getQuota && live.getQuota();
    if (!q || q.remaining == null) return true;
    return q.remaining > QUOTA_RESERVE;
  } catch {
    return true;
  }
}

function crestsEn(teamId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const row = j.teams && j.teams[String(teamId)];
    return (row && row.en) || '';
  } catch { return ''; }
}

function teamZhLabel(en) {
  try {
    const lt = require('./league-tables');
    const zh = lt.teamZh(en);
    // Prefer Chinese; if lookup failed and still Latin, keep trying crest map via teamZh
    return zh || en || '';
  } catch {
    return en || '';
  }
}
function leagueZhLabel(en) {
  try {
    const zh = require('./league-tables').leagueZh(en);
    return zh || en || '';
  } catch {
    return en || '';
  }
}

function summarizeList(list) {
  const summary = { homeWins: 0, draws: 0, awayWins: 0 };
  for (const m of list) {
    if (m.forCurrentHome === 'W') summary.homeWins++;
    else if (m.forCurrentHome === 'D') summary.draws++;
    else summary.awayWins++;
  }
  return summary;
}

function normalizeAfH2h(response, afHomeId, afAwayId, nameHints, limit) {
  const homeName = (nameHints && nameHints.home) || '';
  const awayName = (nameHints && nameHints.away) || '';
  const list = [];
  const rows = Array.isArray(response) ? response.slice() : [];
  rows.sort((a, b) => {
    const ta = (a.fixture && a.fixture.timestamp) || 0;
    const tb = (b.fixture && b.fixture.timestamp) || 0;
    return tb - ta;
  });
  for (const row of rows) {
    if (!row || !row.fixture || !row.teams || !row.goals) continue;
    const short = (row.fixture.status && row.fixture.status.short) || '';
    const gh = row.goals.home;
    const ga = row.goals.away;
    if (gh == null || ga == null) continue;
    if (short && !/^(FT|AET|PEN)$/i.test(short)) continue;
    const th = row.teams.home;
    const ta = row.teams.away;
    const thId = th && th.id;
    const taId = ta && ta.id;
    const date = String((row.fixture.date || '')).slice(0, 10);
    const homeLabel = (Number(thId) === Number(afHomeId) && homeName) ? homeName
      : (Number(thId) === Number(afAwayId) && awayName) ? awayName
      : (th && th.name) || '';
    const awayLabel = (Number(taId) === Number(afAwayId) && awayName) ? awayName
      : (Number(taId) === Number(afHomeId) && homeName) ? homeName
      : (ta && ta.name) || '';
    let forCurrentHome = 'D';
    if (gh !== ga) {
      const currentHomeWon =
        (Number(thId) === Number(afHomeId) && gh > ga) ||
        (Number(taId) === Number(afHomeId) && ga > gh);
      forCurrentHome = currentHomeWon ? 'W' : 'L';
    }
    list.push({
      date,
      home: teamZhLabel(homeLabel) || homeLabel,
      away: teamZhLabel(awayLabel) || awayLabel,
      ft: `${gh}:${ga}`,
      forCurrentHome,
      afFixtureId: row.fixture.id,
      league: leagueZhLabel((row.league && row.league.name) || ''),
    });
    if (list.length >= limit) break;
  }
  return { matches: list, summary: summarizeList(list) };
}

/**
 * Football season years to try (API-Football season param = start year).
 * Prefer current then previous; free plan may only allow older seasons.
 */
function seasonsToTry(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  // European season flips ~July
  const current = m >= 7 ? y : y - 1;
  // Free plan often limited to ~2022–2024
  const out = [current, current - 1, current - 2, 2024, 2023, 2022];
  return [...new Set(out.filter(s => s >= 2018))];
}

function normalizeAfForm(response, afTeamId, sportteryTeamId, teamZhName, limit) {
  const tid = String(sportteryTeamId || '');
  const focusZh = String(teamZhName || '').trim();
  const list = [];
  const rows = Array.isArray(response) ? response.slice() : [];
  rows.sort((a, b) => {
    const ta = (a.fixture && a.fixture.timestamp) || 0;
    const tb = (b.fixture && b.fixture.timestamp) || 0;
    return tb - ta;
  });
  for (const row of rows) {
    if (!row || !row.fixture || !row.teams || !row.goals) continue;
    const short = (row.fixture.status && row.fixture.status.short) || '';
    const gh = row.goals.home;
    const ga = row.goals.away;
    if (gh == null || ga == null) continue;
    if (short && !/^(FT|AET|PEN)$/i.test(short)) continue;
    const th = row.teams.home;
    const ta = row.teams.away;
    const thId = th && th.id;
    const taId = ta && ta.id;
    const isHome = Number(thId) === Number(afTeamId);
    const isAway = Number(taId) === Number(afTeamId);
    if (!isHome && !isAway) continue;
    const date = String((row.fixture.date || '')).slice(0, 10);
    const homeEn = (th && th.name) || '';
    const awayEn = (ta && ta.name) || '';
    const homeLabel = isHome && focusZh ? focusZh : (teamZhLabel(homeEn) || homeEn);
    const awayLabel = isAway && focusZh ? focusZh : (teamZhLabel(awayEn) || awayEn);
    let outcome = 'D';
    if (gh !== ga) {
      if (isHome) outcome = gh > ga ? 'W' : 'L';
      else outcome = ga > gh ? 'W' : 'L';
    }
    list.push({
      date,
      home: homeLabel,
      away: awayLabel,
      ft: `${gh}:${ga}`,
      outcome,
      homeTeamId: isHome ? tid : '',
      awayTeamId: isAway ? tid : '',
      league: leagueZhLabel((row.league && row.league.name) || ''),
      afFixtureId: row.fixture && row.fixture.id,
      source: 'api-football',
    });
    if (list.length >= limit) break;
  }
  return {
    teamId: tid,
    matches: list,
    summary: summarizeForm(list),
    source: 'api-football',
  };
}

function afFormIsFresh(form) {
  const m = form && form.matches && form.matches[0];
  if (!m || !m.date) return false;
  const t = Date.parse(m.date + 'T12:00:00Z');
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) / 864e5 <= AF_FORM_MAX_AGE_DAYS;
}

async function resolveAfIdForForm(live, { sportteryTeamId, nameEn, nameZh }) {
  const sid = String(sportteryTeamId || '');
  // Seed cache so resolve skips search when possible
  if (sid && AF_TEAM_SEED[sid] && live.resolveAfTeamId) {
    try {
      const cacheFile = path.join(DATA_DIR, 'live-stats', 'team-id-cache.json');
      const cache = readJson(cacheFile, {});
      const sKey = 's:' + sid;
      const seededId = AF_TEAM_SEED[sid];
      const cur = cache[sKey] && cache[sKey].afTeamId;
      if (!cur || Number(cur) !== Number(seededId)) {
        cache[sKey] = {
          afTeamId: seededId,
          afName: nameEn || nameZh || '',
          sportteryTeamId: sid,
          query: nameEn || nameZh || '',
          mappedAt: new Date().toISOString(),
          seeded: true,
        };
        // Drop stale name-key that may point at a wrong homonym (e.g. Roma→Slovenia).
        const nKey = 'n:' + String(nameEn || nameZh || '').toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim().replace(/\s+/g, ' ');
        if (nKey && nKey !== 'n:' && cache[nKey] && Number(cache[nKey].afTeamId) !== Number(seededId)) {
          delete cache[nKey];
        }
        writeJson(cacheFile, cache);
      }
    } catch (e) {
      console.warn('match-stats seed af id', e.message);
    }
  }
  if (!live.resolveAfTeamId) {
    if (sid && AF_TEAM_SEED[sid]) return { afTeamId: AF_TEAM_SEED[sid], afName: nameEn || '' };
    return null;
  }
  return live.resolveAfTeamId({
    sportteryTeamId: sid,
    nameEn,
    nameZh,
    allowFetch: quotaAllowsAf(),
  });
}

/**
 * Fetch recent FT fixtures for a team via AF seasons (no `last=`).
 * Disk-cached ≥24h. Returns null when unavailable / too stale.
 */
async function fetchAfTeamForm({ teamId, teamName, limit }) {
  let live;
  try { live = require('./live-stats'); } catch { return null; }
  if (!live.apiKeyPresent || !live.apiKeyPresent()) return null;

  const nameEn = crestsEn(teamId) || '';
  const nameZh = String(teamName || '').trim();
  let afEntry = null;
  try {
    afEntry = await resolveAfIdForForm(live, {
      sportteryTeamId: teamId,
      nameEn,
      nameZh,
    });
  } catch (e) {
    console.warn('match-stats resolveAfTeamId form', e.message);
  }
  if (!afEntry || !afEntry.afTeamId) return null;

  const afTeamId = afEntry.afTeamId;
  const cacheFile = formCachePath(afTeamId);
  const disk = readJson(cacheFile, null);
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));

  if (disk && disk.at && disk.payload && Date.now() - disk.at < FORM_TTL_MS) {
    const rebuilt = normalizeAfForm(disk.payload.raw || [], afTeamId, teamId, nameZh, lim);
    if (rebuilt.matches.length && afFormIsFresh(rebuilt)) {
      return { ...rebuilt, cached: true, source: 'api-football' };
    }
  }

  if (!quotaAllowsAf()) {
    if (disk && disk.payload && disk.at && Date.now() - disk.at < FORM_STALE_MS) {
      const rebuilt = normalizeAfForm(disk.payload.raw || [], afTeamId, teamId, nameZh, lim);
      if (rebuilt.matches.length && afFormIsFresh(rebuilt)) {
        return { ...rebuilt, cached: true, stale: true, source: 'api-football' };
      }
    }
    return null;
  }

  // Free plan: do NOT pass `last` (errors). Pull by season and slice locally.
  const seasons = seasonsToTry();
  const merged = [];
  const seen = new Set();
  let lastErr = null;
  for (const season of seasons) {
    if (!quotaAllowsAf()) break;
    try {
      const batch = await live.afFetch(
        `/fixtures?team=${encodeURIComponent(afTeamId)}&season=${encodeURIComponent(season)}`
      );
      for (const row of batch || []) {
        const fid = row && row.fixture && row.fixture.id;
        const key = fid != null ? String(fid) : JSON.stringify([
          row && row.fixture && row.fixture.date,
          row && row.teams && row.teams.home && row.teams.home.id,
          row && row.teams && row.teams.away && row.teams.away.id,
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(row);
      }
      // Enough FT already? stop burning quota
      const preview = normalizeAfForm(merged, afTeamId, teamId, nameZh, lim);
      if (preview.matches.length >= lim && afFormIsFresh(preview)) break;
    } catch (e) {
      lastErr = e;
      console.warn('match-stats AF form season', season, e.message);
      // season/plan errors: try older; access/suspended: stop
      if (/suspend|access/i.test(String(e.message || ''))) break;
    }
  }

  if (!merged.length) {
    if (disk && disk.payload && Array.isArray(disk.payload.raw)) {
      const rebuilt = normalizeAfForm(disk.payload.raw, afTeamId, teamId, nameZh, lim);
      if (rebuilt.matches.length && afFormIsFresh(rebuilt)) {
        return { ...rebuilt, cached: true, stale: true, source: 'api-football', staleError: lastErr && lastErr.message };
      }
    }
    return null;
  }

  const formNorm = normalizeAfForm(merged, afTeamId, teamId, nameZh, lim);
  if (!formNorm.matches.length || !afFormIsFresh(formNorm)) {
    return null;
  }

  const payload = {
    afTeamId,
    sportteryTeamId: String(teamId || ''),
    seasons,
    fetchedAt: new Date().toISOString(),
    raw: merged,
  };
  try { writeJson(cacheFile, { at: Date.now(), payload }); }
  catch (e) { console.warn('match-stats form cache write', e.message); }

  return { ...formNorm, cached: false, source: 'api-football' };
}

async function fetchAfH2h({ homeTeamId, awayTeamId, home, away, limit }) {
  let live;
  try { live = require('./live-stats'); } catch { return null; }
  if (!live.apiKeyPresent || !live.apiKeyPresent()) return null;

  const homeEn = crestsEn(homeTeamId) || String(home || '').trim();
  const awayEn = crestsEn(awayTeamId) || String(away || '').trim();

  let homeAf = null, awayAf = null;
  try {
    if (live.resolveAfTeamId) {
      homeAf = await resolveAfIdForForm(live, {
        sportteryTeamId: homeTeamId,
        nameEn: homeEn,
        nameZh: home,
      });
      awayAf = await resolveAfIdForForm(live, {
        sportteryTeamId: awayTeamId,
        nameEn: awayEn,
        nameZh: away,
      });
    }
  } catch (e) {
    console.warn('match-stats resolveAfTeamId', e.message);
  }
  if (!homeAf || !awayAf || !homeAf.afTeamId || !awayAf.afTeamId) return null;

  const afHomeId = homeAf.afTeamId;
  const afAwayId = awayAf.afTeamId;
  const cacheFile = h2hCachePath(afHomeId, afAwayId);
  const disk = readJson(cacheFile, null);
  if (disk && disk.at && disk.payload && Date.now() - disk.at < H2H_TTL_MS) {
    const payload = disk.payload;
    if (payload.afHomeId === afHomeId && payload.afAwayId === afAwayId) {
      return { ...payload.h2h, cached: true, source: 'api-football' };
    }
    if (Array.isArray(payload.raw)) {
      const rebuilt = normalizeAfH2h(payload.raw, afHomeId, afAwayId, { home, away }, limit);
      return { ...rebuilt, cached: true, source: 'api-football' };
    }
  }

  if (!quotaAllowsAf()) {
    if (disk && disk.payload && disk.at && Date.now() - disk.at < H2H_STALE_MS) {
      if (Array.isArray(disk.payload.raw)) {
        const rebuilt = normalizeAfH2h(disk.payload.raw, afHomeId, afAwayId, { home, away }, limit);
        return { ...rebuilt, cached: true, stale: true, source: 'api-football' };
      }
      if (disk.payload.h2h) return { ...disk.payload.h2h, cached: true, stale: true, source: 'api-football' };
    }
    return null;
  }

  // Free plan: do NOT pass `last` (errors). Bare h2h=A-B is fine; results often ≤10.
  const pair = `${afHomeId}-${afAwayId}`;
  let raw;
  try {
    raw = await live.afFetch('/fixtures/headtohead?h2h=' + encodeURIComponent(pair));
  } catch (e) {
    console.warn('match-stats AF h2h', e.message);
    if (disk && disk.payload && Array.isArray(disk.payload.raw)) {
      const rebuilt = normalizeAfH2h(disk.payload.raw, afHomeId, afAwayId, { home, away }, limit);
      return { ...rebuilt, cached: true, stale: true, source: 'api-football', staleError: e.message };
    }
    return null;
  }

  const h2hNorm = normalizeAfH2h(raw, afHomeId, afAwayId, { home, away }, limit);
  const payload = {
    afHomeId,
    afAwayId,
    fetchedAt: new Date().toISOString(),
    raw,
    h2h: h2hNorm,
  };
  try { writeJson(cacheFile, { at: Date.now(), payload }); }
  catch (e) { console.warn('match-stats h2h cache write', e.message); }

  return { ...h2hNorm, cached: false, source: 'api-football' };
}

// ---- 1.9.2: ESPN public schedule (current season, domestic league + UEFA) ----
const ESPN_LEAGUE_ZH = {
  'English Premier League': '英超', 'Premier League': '英超', 'English League Championship': '英冠',
  'Spanish LALIGA': '西甲', 'LALIGA': '西甲', 'German Bundesliga': '德甲', 'Bundesliga': '德甲',
  'Italian Serie A': '意甲', 'Serie A': '意甲', 'French Ligue 1': '法甲', 'Ligue 1': '法甲',
  'Portuguese Primeira Liga': '葡超', 'Dutch Eredivisie': '荷甲', 'Belgian Pro League': '比甲',
  'Austrian Bundesliga': '奥甲', 'Swiss Super League': '瑞士超', 'Scottish Premiership': '苏超',
  'Turkish Super Lig': '土超', 'Japanese J.League': '日职', 'Japanese J1 League': '日职', 'J1 League': '日职', 'J.League': '日职', 'J. League': '日职', 'K League 1': '韩K联',
  'Chinese Super League': '中超', 'Saudi Pro League': '沙特联', 'MLS': '美职足',
  'UEFA Champions League': '欧冠', 'Champions League': '欧冠', 'UEFA Europa League': '欧联',
  'Europa League': '欧联', 'UEFA Conference League': '欧协联', 'Conference League': '欧协联',
};
/** 竞彩中文名 → ESPN 英文名（无 crests 英文名的常见队） */
const ESPN_ZH_EN = {
  '纽约城': 'New York City FC', '纽约红牛': 'New York Red Bulls', '沃特福德': 'Watford',
  '格罗宁根': 'Groningen', '萨普斯堡': 'Sarpsborg', '沃夫斯堡': 'Wolfsburg', '沃尔夫斯堡': 'Wolfsburg',
  '达姆施塔': 'Darmstadt', '达姆施塔特': 'Darmstadt', '赫尔辛基': 'HJK Helsinki', '贝西克塔': 'Besiktas',
  '贝西克塔斯': 'Besiktas', '奈梅亨': 'NEC Nijmegen', '长崎航海': 'V-Varen Nagasaki', '海尔蒙特': 'Helmond Sport',
  '大宫松鼠': 'Omiya Ardija', '费内巴切': 'Fenerbahce', '加拉塔萨': 'Galatasaray', '加拉塔萨雷': 'Galatasaray', '布鲁日': 'Club Brugge', '林茨': 'LASK',
  '托林斯': 'Torreense', '托特纳姆': 'Tottenham Hotspur', '桑德兰': 'Sunderland', '波兹南': 'Lech Poznan',
  '凯尔特人': 'Celtic', '圣吉联合': 'Union Saint-Gilloise', '萨尔茨堡': 'Red Bull Salzburg',
  '奥林匹亚': 'Olympiacos', '格风暴': 'Sturm Graz', '哥本哈根': 'FC Copenhagen', '克拉约瓦': 'Universitatea Craiova',
  '利雅胜利': 'Al-Nassr',
};
function espnCandidates(teamId, teamName) {
  const out = [];
  if (ESPN_ZH_EN[String(teamName || '').trim()]) out.push(ESPN_ZH_EN[String(teamName || '').trim()]);
  const en = crestsEn(teamId);
  if (en) out.push(en);
  const zh = String(teamName || '').trim();
  try {
    const { TEAM_ZH } = require('./league-tables');
    for (const [k, v] of Object.entries(TEAM_ZH || {})) if (zh && v === zh) out.push(k);
  } catch {}
  try {
    const c = readJson(path.join(DATA_DIR, 'live-stats', 'team-id-cache.json'), {});
    const e = c['s:' + String(teamId)];
    if (e && e.afName) out.push(e.afName);
  } catch {}
  const ascii = zh.match(/[A-Za-z][A-Za-z .'-]{2,}/g);
  if (ascii) out.push(...ascii.map(x => x.trim()));
  return out;
}
function bjDate(ts) { return new Date(ts + 8 * 3600e3).toISOString().slice(0, 10); }

async function fetchEspnForm({ teamId, teamName, limit }) {
  let espn;
  try { espn = require('./espn-form'); } catch { return null; }
  const res = await espn.fetchTeamResults({ sportteryTeamId: teamId, candidates: espnCandidates(teamId, teamName) });
  if (!res || !res.rows || !res.rows.length) return null;
  const tid = String(teamId);
  const zh = String(teamName || '').trim();
  const espnMatches = res.rows.map(r => ({
    date: bjDate(r.ts),
    home: r.isHome ? zh || r.homeEn : (teamZhLabel(r.homeEn) || r.homeEn),
    away: r.isHome ? (teamZhLabel(r.awayEn) || r.awayEn) : zh || r.awayEn,
    ft: `${r.gh}:${r.ga}`,
    outcome: r.outcome,
    homeTeamId: r.isHome ? tid : '',
    awayTeamId: r.isHome ? '' : tid,
    league: leagueZhLabel(ESPN_LEAGUE_ZH[r.leagueEn] || r.leagueEn || ''),
    espnEventId: r.espnEventId,
    source: 'espn',
  }));
  // merge 竞彩 history rows on dates ESPN lacks (±1 day = same fixture)
  const local = formOf(loadRows(), teamId, 80).matches;
  const dayN = d => Math.round(Date.parse(d + 'T12:00:00Z') / 864e5);
  const espnDays = espnMatches.map(m => dayN(m.date));
  const extra = local.filter(m => !espnDays.some(x => Math.abs(x - dayN(m.date)) <= 1));
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  const merged = sortMatchesDesc([...espnMatches, ...extra]).slice(0, lim);
  const hasHist = merged.some(m => m.source === 'history');
  const hasEspn = merged.some(m => m.source === 'espn');
  if (!hasEspn) return null;
  return {
    teamId: tid,
    matches: merged,
    summary: summarizeForm(merged),
    source: hasHist ? 'history+espn' : 'espn',
    espnTeamId: res.team.id,
    espnLeague: res.team.league,
    cached: !!res.cached,
    stale: !!res.stale,
  };
}

async function enrichForm(localForm, { teamId, teamName, limit, allowAf }) {
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  const local = localForm || formOf([], teamId, lim);
  if (!allowAf || !teamId) {
    return { form: local, usedAf: false, sparse: formIsSparse(local, lim) };
  }
  // 1.9.2: ESPN first for every team (竞彩 history never has non-竞彩 domestic games)
  try {
    const es = await fetchEspnForm({ teamId, teamName, limit: lim });
    if (es && es.matches.length >= Math.min(local.matches.length, lim)) {
      return { form: es, usedAf: false, usedEspn: true, sparse: formIsSparse(es, lim) };
    }
  } catch (e) {
    console.warn('match-stats ESPN form', teamId, e.message);
  }
  if (!formIsSparse(local, lim)) {
    return { form: local, usedAf: false, sparse: false };
  }
  try {
    const af = await fetchAfTeamForm({ teamId, teamName, limit: lim });
    if (af && af.matches && af.matches.length && !formIsSparse(af, lim)) {
      return { form: af, usedAf: true, sparse: false };
    }
    // AF denser even if still slightly sparse
    if (af && af.matches && af.matches.length > local.matches.length) {
      return { form: af, usedAf: true, sparse: formIsSparse(af, lim) };
    }
  } catch (e) {
    console.warn('match-stats AF form', e.message);
  }
  return { form: local, usedAf: false, sparse: formIsSparse(local, lim) };
}

/**
 * @param {{ homeTeamId?: string, awayTeamId?: string, home?: string, away?: string, limit?: number, allowAf?: boolean }} opts
 */
async function getMatchStats(opts = {}) {
  const {
    homeTeamId,
    awayTeamId,
    home = '',
    away = '',
    limit = 10,
    allowAf = true,
  } = opts;
  const rows = loadRows();
  const lim = Math.max(1, Math.min(80, Number(limit) || 5));
  const localH2h = h2h(rows, homeTeamId, awayTeamId, lim);

  let h2hOut = localH2h;
  let h2hSource = 'history';
  let h2hNoteZh = '';

  if ((!localH2h.matches || !localH2h.matches.length) && allowAf && homeTeamId && awayTeamId) {
    try {
      const af = await fetchAfH2h({ homeTeamId, awayTeamId, home, away, limit: lim });
      if (af && af.matches && af.matches.length) {
        h2hOut = {
          matches: af.matches,
          summary: af.summary,
        };
        h2hSource = 'api-football';
        h2hNoteZh = af.stale
          ? '交锋来自综合交锋库缓存（配额紧张，可能略旧）；本地竞彩历史窗口内无对阵。'
          : '交锋来自综合交锋库（本地竞彩历史窗口内无对阵），已磁盘缓存≥24h。';
      }
    } catch (e) {
      console.warn('match-stats AF fallback', e.message);
    }
  }

  const homeLocal = formOf(rows, homeTeamId, lim);
  const awayLocal = formOf(rows, awayTeamId, lim);
  const homeEnriched = await enrichForm(homeLocal, {
    teamId: homeTeamId, teamName: home, limit: lim, allowAf,
  });
  const awayEnriched = await enrichForm(awayLocal, {
    teamId: awayTeamId, teamName: away, limit: lim, allowAf,
  });

  const formNotes = [];
  const sideSrc = e => (e.form && e.form.source) || (e.usedAf ? 'api-football' : 'history');
  const hSrc = sideSrc(homeEnriched);
  const aSrc = sideSrc(awayEnriched);
  const extSrc = x => /espn|api-football/.test(x);
  if (extSrc(hSrc) || extSrc(aSrc)) {
    const names = [...new Set([hSrc, aSrc].filter(extSrc).map(x => /espn/.test(x) ? '综合赛程（本赛季联赛+欧战）' : '综合全赛程'))];
    formNotes.push(`近期战绩来自${names.join('、')}${[hSrc, aSrc].some(x => /history/.test(x)) || !extSrc(hSrc) || !extSrc(aSrc) ? '，并合并竞彩完场历史' : ''}，按日期降序。`);
  } else if (homeEnriched.sparse || awayEnriched.sparse) {
    formNotes.push('近期战绩仅来自竞彩完场历史：偏疏队（如非竞彩主联赛）会缺联赛场次、间隔偏长；外部赛程源暂不可用时无法补全。');
  } else {
    formNotes.push('近期战绩来自竞彩完场历史库（已按日期降序）。');
  }

  const noteParts = [
    '以下为历史赛果推导的近期战绩与交锋；控球/射门等过程数据见「近期过程数据」（若可用）。',
  ];
  if (h2hNoteZh) noteParts.push(h2hNoteZh);
  noteParts.push(...formNotes);

  const tags = new Set();
  for (const x of [hSrc, aSrc]) x.split('+').forEach(t => tags.add(t));
  const order = ['history', 'espn', 'api-football'];
  const formSource = order.filter(t => tags.has(t)).join('+') || 'history';

  // 1.9.14: rolling process stats (possession/shots/…) — graceful if AF key missing/suspended
  let process = null;
  if (allowAf) {
    try {
      const ps = require('./process-stats');
      process = await ps.getRollingProcessStats({
        homeTeamId, awayTeamId, home, away, limit: Math.min(lim, 10),
      });
      if (process && process.noteZh) noteParts.push(process.noteZh);
    } catch (e) {
      console.warn('match-stats process', e.message);
      process = {
        ok: false, available: false, reason: 'error',
        noteZh: '过程数据模块异常：' + e.message,
        home: null, away: null,
        metrics: [],
      };
    }
  } else {
    process = {
      ok: false, available: false, reason: 'disabled',
      noteZh: '本请求未启用第三方过程数据。',
      home: null, away: null, metrics: [],
    };
  }

  if (process && process.noteZh) process.noteZh = scrubVendorLabels(process.noteZh);
  if (process && process.home && process.home.noteZh) process.home.noteZh = scrubVendorLabels(process.home.noteZh);
  if (process && process.away && process.away.noteZh) process.away.noteZh = scrubVendorLabels(process.away.noteZh);
  return {
    ok: true,
    source: [
      h2hSource === 'api-football' ? 'h2h:api-football' : 'h2h:history',
      formSource === 'history' ? 'form:history' : `form:${formSource}`,
      process && process.available ? 'process:api-football' : 'process:none',
    ].join('+'),
    h2hSource,
    formSource,
    homeFormSource: hSrc,
    awayFormSource: aSrc,
    liveTechStats: false,
    process,
    noteZh: scrubVendorLabels(noteParts.join(' ')),
    homeForm: homeEnriched.form,
    awayForm: awayEnriched.form,
    h2h: h2hOut,
  };
}

module.exports = {
  getMatchStats,
  espnCandidates,
  loadRows,
  H2H_TTL_MS,
  FORM_TTL_MS,
  // test helpers
  h2h,
  formOf,
  formIsSparse,
  sortMatchesDesc,
  normalizeAfH2h,
  normalizeAfForm,
  seasonsToTry,
  AF_TEAM_SEED,
};
