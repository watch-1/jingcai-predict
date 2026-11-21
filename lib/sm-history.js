/**
 * SportMonks replacements for the former API-Football form / H2H /
 * process-stats / next-fixtures fallbacks.
 * Local 竞彩 history and ESPN still come first where those modules already
 * prefer them. Official 竞彩场次 and 赔率 stay on Sporttery.
 * History window is ~160 days (no Historical Data add-on). Never invents scores.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY_DAYS = 160;
const FUTURE_DAYS = 120;
const FORM_TTL_MS = 24 * 60 * 60 * 1000;
const FORM_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const H2H_TTL_MS = 24 * 60 * 60 * 1000;
const H2H_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const NEXT_TTL_MS = 8 * 60 * 60 * 1000;
const FORM_MAX_AGE_DAYS = 160;

const STAT_SPEC = {
  possession: { ids: [45], codes: ['ball-possession'] },
  shots: { ids: [42], codes: ['shots-total'] },
  shotsOnTarget: { ids: [86], codes: ['shots-on-target'] },
  corners: { ids: [34], codes: ['corners'] },
  yellowCards: { ids: [84], codes: ['yellowcards'] },
  redCards: { ids: [83], codes: ['redcards'] },
  dangerousAttacks: { ids: [44], codes: ['dangerous-attacks'] },
  passesPct: { ids: [82], codes: ['successful-passes-percentage'] },
  totalPasses: { ids: [80], codes: ['passes'] },
  passesAccurate: { ids: [81, 116], codes: ['successful-passes', 'accurate-passes'] },
  expectedGoals: { ids: [5304], codes: ['expected-goals', 'expected_goals'] },
};

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function smFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  const heat = require('./heat-source');
  if (!heat.readToken()) return null;
  return heat.smGet;
}

function tokenPresent() {
  try { return !!require('./heat-source').readToken(); } catch { return false; }
}

async function resolveSmTeamId(fetchJson, { sportteryTeamId, nameZh, nameEn, known } = {}) {
  if (known) return known;
  const fn = fetchJson || smFetch();
  const sq = require('./squad-source');
  return sq.resolveSm(sportteryTeamId, nameZh || nameEn || '', null, fn);
}

function participantLocation(p) {
  return String((p && p.meta && p.meta.location) || p.location || '').toLowerCase();
}

function homeAwayParticipants(fx) {
  const parts = (fx && fx.participants) || [];
  let home = null;
  let away = null;
  for (const p of parts) {
    const loc = participantLocation(p);
    if (loc === 'home') home = p;
    else if (loc === 'away') away = p;
  }
  return { home, away };
}

function kickoffMs(fx) {
  if (!fx) return NaN;
  if (fx.starting_at_timestamp != null && Number.isFinite(Number(fx.starting_at_timestamp))) {
    const n = Number(fx.starting_at_timestamp);
    return n > 1e12 ? n : n * 1000;
  }
  const raw = fx.starting_at || fx.starting_at_iso || '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : NaN;
}

function leagueName(fx) {
  const lg = (fx && fx.league) || {};
  return lg.name || (lg.data && lg.data.name) || fx.league_name || '';
}

function participantName(p) {
  if (!p) return '';
  return p.name || p.display_name || p.common_name || p.short_code || '';
}

function currentScore(fx) {
  try {
    return require('./sm-live-scores').scoreFromBag(fx, 'CURRENT');
  } catch {
    return { home: null, away: null };
  }
}

function isFinishedFx(fx) {
  try { return require('./heat-source').isFinished(fx); } catch {
    const st = (fx && fx.state) || {};
    const blob = `${st.short_name || ''} ${st.developer_name || ''} ${st.name || ''} ${st.state || ''}`;
    return /FT|AET|PEN|FINISHED|FULL|ENDED/i.test(blob);
  }
}

function isLiveFx(fx) {
  try {
    const sm = require('./sm-live-scores');
    const name = sm.stateName(fx);
    return sm.SM_LIVE_STATES.has(name) || /INPLAY|LIVE/.test(name);
  } catch {
    const st = (fx && fx.state) || {};
    return /INPLAY|LIVE|HT|BREAK|ET|PEN/i.test(String(st.developer_name || st.short_name || ''));
  }
}

function statValue(statistics, teamId, spec) {
  const rows = statistics || [];
  const hit = rows.find((s) => {
    const id = Number(s.type_id || (s.type && s.type.id));
    const code = String((s.type && s.type.code) || s.code || '').toLowerCase();
    if (!spec.ids.includes(id) && !spec.codes.includes(code)) return false;
    return teamId == null || Number(s.participant_id) === Number(teamId);
  });
  if (!hit) return null;
  const raw = hit.data && hit.data.value != null ? hit.data.value : hit.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function sideStatsFromSm(statistics, teamId) {
  const out = {
    possession: statValue(statistics, teamId, STAT_SPEC.possession),
    shots: statValue(statistics, teamId, STAT_SPEC.shots),
    shotsOnTarget: statValue(statistics, teamId, STAT_SPEC.shotsOnTarget),
    corners: statValue(statistics, teamId, STAT_SPEC.corners),
    yellowCards: statValue(statistics, teamId, STAT_SPEC.yellowCards),
    redCards: statValue(statistics, teamId, STAT_SPEC.redCards),
    attacks: null, // AF "total attacks" has no verified SM mapping — do not invent
    dangerousAttacks: statValue(statistics, teamId, STAT_SPEC.dangerousAttacks),
    passesPct: statValue(statistics, teamId, STAT_SPEC.passesPct),
    expectedGoals: statValue(statistics, teamId, STAT_SPEC.expectedGoals),
    totalPasses: statValue(statistics, teamId, STAT_SPEC.totalPasses),
    passesAccurate: statValue(statistics, teamId, STAT_SPEC.passesAccurate),
  };
  return out;
}

function normalizeStatisticsByTeam(fx) {
  const { home, away } = homeAwayParticipants(fx);
  const stats = (fx && fx.statistics) || [];
  const byTeam = {};
  if (home && home.id != null) byTeam[String(home.id)] = sideStatsFromSm(stats, home.id);
  if (away && away.id != null) byTeam[String(away.id)] = sideStatsFromSm(stats, away.id);
  return {
    byTeam,
    fetchedAt: new Date().toISOString(),
    smFixtureId: fx && fx.id != null ? Number(fx.id) : null,
    source: 'sportmonks',
  };
}

async function listRows(fetchJson, urlPath, params, { maxPages = 3 } = {}) {
  const fn = fetchJson || smFetch();
  if (!fn) return [];
  const first = await fn(urlPath, params);
  let rows = [];
  if (first && Array.isArray(first.data)) rows = first.data.slice();
  else if (first && first.data && first.data.id) rows = [first.data];
  let page = first && first.pagination;
  let n = 1;
  while (page && page.has_more && n < maxPages) {
    const nextPage = page.next_page || (Number(page.current_page) + 1);
    if (nextPage == null) break;
    const next = await fn(urlPath, Object.assign({}, params, { page: nextPage }));
    if (next && Array.isArray(next.data)) rows = rows.concat(next.data);
    else if (next && next.data && next.data.id) rows.push(next.data);
    page = next && next.pagination;
    n++;
  }
  return rows;
}

async function fixturesBetween(fetchJson, smTeamId, fromMs, toMs, include) {
  if (!smTeamId) return [];
  const from = ymd(fromMs);
  const to = ymd(toMs);
  return listRows(fetchJson, `/football/fixtures/between/${from}/${to}/${smTeamId}`, {
    include: include || 'participants;state;scores;league',
    per_page: 50,
  });
}

async function fixturesHeadToHead(fetchJson, smA, smB, include) {
  if (!smA || !smB) return [];
  const a = Number(smA);
  const b = Number(smB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return listRows(fetchJson, `/football/fixtures/head-to-head/${lo}/${hi}`, {
    include: include || 'participants;state;scores;league',
    per_page: 50,
  });
}

async function fixtureById(fetchJson, smFixtureId, include) {
  const fn = fetchJson || smFetch();
  if (!fn || !smFixtureId) return null;
  const body = await fn(`/football/fixtures/${smFixtureId}`, {
    include: include || 'participants;state;scores;league;statistics.type;events.type;periods;venue',
  });
  return (body && body.data) || null;
}

function teamZhLabel(en) {
  try {
    const zh = require('./league-tables').teamZh(en);
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

function summarizeForm(list) {
  const summary = { w: 0, d: 0, l: 0 };
  for (const m of list || []) {
    if (m.outcome === 'W') summary.w++;
    else if (m.outcome === 'D') summary.d++;
    else if (m.outcome === 'L') summary.l++;
  }
  return summary;
}

function summarizeH2h(list) {
  const summary = { homeWins: 0, draws: 0, awayWins: 0 };
  for (const m of list || []) {
    if (m.forCurrentHome === 'W') summary.homeWins++;
    else if (m.forCurrentHome === 'D') summary.draws++;
    else summary.awayWins++;
  }
  return summary;
}

function sortByKickoffDesc(rows) {
  return (rows || []).slice().sort((a, b) => {
    const ta = kickoffMs(a) || 0;
    const tb = kickoffMs(b) || 0;
    return tb - ta;
  });
}

function formMatchesFromSm(fixtures, smTeamId, sportteryTeamId, teamZhName, limit) {
  const tid = String(sportteryTeamId || '');
  const focusZh = String(teamZhName || '').trim();
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  const list = [];
  for (const fx of sortByKickoffDesc(fixtures)) {
    if (!isFinishedFx(fx)) continue;
    const { home, away } = homeAwayParticipants(fx);
    if (!home || !away) continue;
    const isHome = Number(home.id) === Number(smTeamId);
    const isAway = Number(away.id) === Number(smTeamId);
    if (!isHome && !isAway) continue;
    const sc = currentScore(fx);
    if (sc.home == null || sc.away == null) continue;
    const ms = kickoffMs(fx);
    const date = Number.isFinite(ms) ? ymd(ms + 8 * 3600e3) : String(fx.starting_at || '').slice(0, 10);
    const homeEn = participantName(home);
    const awayEn = participantName(away);
    const homeLabel = isHome && focusZh ? focusZh : (teamZhLabel(homeEn) || homeEn);
    const awayLabel = isAway && focusZh ? focusZh : (teamZhLabel(awayEn) || awayEn);
    let outcome = 'D';
    if (sc.home !== sc.away) {
      if (isHome) outcome = sc.home > sc.away ? 'W' : 'L';
      else outcome = sc.away > sc.home ? 'W' : 'L';
    }
    list.push({
      date,
      home: homeLabel,
      away: awayLabel,
      ft: `${sc.home}:${sc.away}`,
      outcome,
      homeTeamId: isHome ? tid : '',
      awayTeamId: isAway ? tid : '',
      league: leagueZhLabel(leagueName(fx)),
      smFixtureId: fx.id,
      source: 'sportmonks',
    });
    if (list.length >= lim) break;
  }
  return {
    teamId: tid,
    matches: list,
    summary: summarizeForm(list),
    source: 'sportmonks',
  };
}

function formIsFresh(form) {
  const m = form && form.matches && form.matches[0];
  if (!m || !m.date) return false;
  const t = Date.parse(m.date + 'T12:00:00Z');
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) / 864e5 <= FORM_MAX_AGE_DAYS;
}

function h2hMatchesFromSm(fixtures, smHomeId, smAwayId, nameHints, limit) {
  const homeName = (nameHints && nameHints.home) || '';
  const awayName = (nameHints && nameHints.away) || '';
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  const list = [];
  for (const fx of sortByKickoffDesc(fixtures)) {
    if (!isFinishedFx(fx)) continue;
    const { home, away } = homeAwayParticipants(fx);
    if (!home || !away) continue;
    const ids = new Set([Number(home.id), Number(away.id)]);
    if (!ids.has(Number(smHomeId)) || !ids.has(Number(smAwayId))) continue;
    const sc = currentScore(fx);
    if (sc.home == null || sc.away == null) continue;
    const ms = kickoffMs(fx);
    const date = Number.isFinite(ms) ? ymd(ms + 8 * 3600e3) : String(fx.starting_at || '').slice(0, 10);
    const thId = home.id;
    const taId = away.id;
    const homeEn = participantName(home);
    const awayEn = participantName(away);
    const homeLabel = (Number(thId) === Number(smHomeId) && homeName) ? homeName
      : (Number(thId) === Number(smAwayId) && awayName) ? awayName
      : (teamZhLabel(homeEn) || homeEn);
    const awayLabel = (Number(taId) === Number(smAwayId) && awayName) ? awayName
      : (Number(taId) === Number(smHomeId) && homeName) ? homeName
      : (teamZhLabel(awayEn) || awayEn);
    let forCurrentHome = 'D';
    if (sc.home !== sc.away) {
      const currentHomeWon =
        (Number(thId) === Number(smHomeId) && sc.home > sc.away) ||
        (Number(taId) === Number(smHomeId) && sc.away > sc.home);
      forCurrentHome = currentHomeWon ? 'W' : 'L';
    }
    list.push({
      date,
      home: homeLabel,
      away: awayLabel,
      ft: `${sc.home}:${sc.away}`,
      forCurrentHome,
      smFixtureId: fx.id,
      league: leagueZhLabel(leagueName(fx)),
    });
    if (list.length >= lim) break;
  }
  return { matches: list, summary: summarizeH2h(list), source: 'sportmonks' };
}

function finishedListFromSm(fixtures, smTeamId, limit) {
  const lim = Math.max(1, Math.min(15, Number(limit) || 5));
  const out = [];
  for (const fx of sortByKickoffDesc(fixtures)) {
    if (!isFinishedFx(fx)) continue;
    const { home, away } = homeAwayParticipants(fx);
    if (!home || !away) continue;
    const isHome = Number(home.id) === Number(smTeamId);
    const isAway = Number(away.id) === Number(smTeamId);
    if (!isHome && !isAway) continue;
    const sc = currentScore(fx);
    if (sc.home == null || sc.away == null) continue;
    const ms = kickoffMs(fx);
    out.push({
      fixtureId: fx.id,
      smFixtureId: fx.id,
      date: Number.isFinite(ms) ? ymd(ms + 8 * 3600e3) : String(fx.starting_at || '').slice(0, 10),
      ts: Number.isFinite(ms) ? Math.floor(ms / 1000) : 0,
      homeId: home.id,
      awayId: away.id,
      homeName: participantName(home),
      awayName: participantName(away),
      league: leagueName(fx),
      gh: sc.home,
      ga: sc.away,
      isHome,
      statistics: fx.statistics || null,
    });
    if (out.length >= lim) break;
  }
  return out;
}

function toBj(isoOrTs) {
  const ms = typeof isoOrTs === 'number' ? isoOrTs : Date.parse(isoOrTs);
  if (!Number.isFinite(ms)) return { date: '', time: '' };
  const s = new Date(ms + 8 * 3600e3).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

function upcomingFromSm(fixtures, smTeamId, sportteryTeamId, focusZh, {
  limit = 5,
  excludeSmFixtureId = null,
  excludeKickoffMs = null,
  excludeOpponentSmIds = null,
} = {}) {
  const tid = String(sportteryTeamId || '');
  const now = Date.now();
  const excludeOpp = new Set(
    (excludeOpponentSmIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
  );
  const out = [];
  const rows = (fixtures || []).slice().sort((a, b) => (kickoffMs(a) || 0) - (kickoffMs(b) || 0));
  for (const fx of rows) {
    if (isFinishedFx(fx)) continue;
    if (excludeSmFixtureId != null && String(fx.id) === String(excludeSmFixtureId)) continue;
    const ms = kickoffMs(fx);
    if (!Number.isFinite(ms) || ms <= now) continue;
    if (excludeKickoffMs != null && Math.abs(ms - excludeKickoffMs) < 2.5 * 3600e3) continue;
    const { home, away } = homeAwayParticipants(fx);
    if (!home || !away) continue;
    const isHome = Number(home.id) === Number(smTeamId);
    const isAway = Number(away.id) === Number(smTeamId);
    if (!isHome && !isAway) continue;
    if (excludeOpp.size === 2) {
      const ids = new Set([Number(home.id), Number(away.id)]);
      let all = true;
      for (const x of excludeOpp) { if (!ids.has(x)) { all = false; break; } }
      if (all) continue;
    }
    const bj = toBj(ms);
    const homeEn = participantName(home);
    const awayEn = participantName(away);
    const homeLabel = isHome && focusZh ? focusZh : (teamZhLabel(homeEn) || homeEn);
    const awayLabel = isAway && focusZh ? focusZh : (teamZhLabel(awayEn) || awayEn);
    const leagueEn = leagueName(fx);
    out.push({
      id: fx.id != null ? `sm:${fx.id}` : `sm:${bj.date}:${home.id}:${away.id}`,
      afFixtureId: null,
      smFixtureId: fx.id != null ? fx.id : null,
      date: bj.date,
      time: bj.time,
      kickoffAt: new Date(ms).toISOString(),
      home: homeLabel,
      away: awayLabel,
      homeEn,
      awayEn,
      homeTeamId: isHome ? tid : '',
      awayTeamId: isAway ? tid : '',
      homeSmId: home.id || null,
      awaySmId: away.id || null,
      league: leagueZhLabel(leagueEn) || leagueEn,
      leagueEn,
      isHome,
      side: isHome ? '主' : '客',
      vs: isHome ? awayLabel : homeLabel,
      status: isLiveFx(fx) ? 'LIVE' : 'NS',
      source: 'sportmonks',
    });
    if (out.length >= limit) break;
  }
  return out;
}

function formCachePath(smTeamId) {
  return path.join(dataDir(), 'live-stats', 'sm-team-form', `${Number(smTeamId)}.json`);
}
function h2hCachePath(a, b) {
  const lo = Math.min(Number(a), Number(b));
  const hi = Math.max(Number(a), Number(b));
  return path.join(dataDir(), 'live-stats', 'sm-h2h', `${lo}-${hi}.json`);
}
function nextCachePath(smTeamId) {
  return path.join(dataDir(), 'live-stats', 'sm-next', `${Number(smTeamId)}.json`);
}
function fixtureStatsPath(smFixtureId) {
  return path.join(dataDir(), 'live-stats', 'sm-fixture-stats', `${Number(smFixtureId)}.json`);
}

async function fetchTeamForm({ teamId, teamName, limit, fetchImpl, now } = {}) {
  const fn = smFetch(fetchImpl);
  if (!fn) return null;
  const clock = now || Date.now();
  let smId = null;
  try {
    smId = await resolveSmTeamId(fn, { sportteryTeamId: teamId, nameZh: teamName });
  } catch (e) {
    console.warn('sm-history resolve form', e.message);
    return null;
  }
  if (!smId) return null;
  const cacheFile = formCachePath(smId);
  const disk = readJson(cacheFile, null);
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  if (disk && disk.at && Array.isArray(disk.raw) && clock - disk.at < FORM_TTL_MS) {
    const rebuilt = formMatchesFromSm(disk.raw, smId, teamId, teamName, lim);
    if (rebuilt.matches.length && formIsFresh(rebuilt)) {
      return Object.assign({}, rebuilt, { cached: true, smTeamId: smId });
    }
  }
  let rows = [];
  try {
    rows = await fixturesBetween(fn, smId, clock - HISTORY_DAYS * 86400000, clock);
  } catch (e) {
    console.warn('sm-history form between', e.message);
    if (disk && disk.raw && clock - disk.at < FORM_STALE_MS) {
      const rebuilt = formMatchesFromSm(disk.raw, smId, teamId, teamName, lim);
      if (rebuilt.matches.length && formIsFresh(rebuilt)) {
        return Object.assign({}, rebuilt, { cached: true, stale: true, smTeamId: smId });
      }
    }
    return null;
  }
  const formNorm = formMatchesFromSm(rows, smId, teamId, teamName, lim);
  if (!formNorm.matches.length || !formIsFresh(formNorm)) {
    if (disk && disk.raw && clock - disk.at < FORM_STALE_MS) {
      const rebuilt = formMatchesFromSm(disk.raw, smId, teamId, teamName, lim);
      if (rebuilt.matches.length && formIsFresh(rebuilt)) {
        return Object.assign({}, rebuilt, { cached: true, stale: true, smTeamId: smId });
      }
    }
    return formNorm.matches.length ? Object.assign({}, formNorm, { smTeamId: smId, cached: false }) : null;
  }
  try { writeJson(cacheFile, { at: clock, smTeamId: smId, sportteryTeamId: String(teamId || ''), raw: rows }); } catch (e) {
    console.warn('sm-history form cache', e.message);
  }
  return Object.assign({}, formNorm, { cached: false, smTeamId: smId });
}

async function fetchH2h({ homeTeamId, awayTeamId, home, away, limit, fetchImpl, now } = {}) {
  const fn = smFetch(fetchImpl);
  if (!fn) return null;
  const clock = now || Date.now();
  let homeSm = null;
  let awaySm = null;
  try {
    homeSm = await resolveSmTeamId(fn, { sportteryTeamId: homeTeamId, nameZh: home });
    awaySm = await resolveSmTeamId(fn, { sportteryTeamId: awayTeamId, nameZh: away });
  } catch (e) {
    console.warn('sm-history resolve h2h', e.message);
    return null;
  }
  if (!homeSm || !awaySm) return null;
  const cacheFile = h2hCachePath(homeSm, awaySm);
  const disk = readJson(cacheFile, null);
  const lim = Math.max(1, Math.min(80, Number(limit) || 10));
  const hints = { home, away };
  if (disk && disk.at && Array.isArray(disk.raw) && clock - disk.at < H2H_TTL_MS) {
    const rebuilt = h2hMatchesFromSm(disk.raw, homeSm, awaySm, hints, lim);
    if (rebuilt.matches.length) return Object.assign({}, rebuilt, { cached: true, homeSmId: homeSm, awaySmId: awaySm });
  }
  let rows = [];
  try {
    rows = await fixturesHeadToHead(fn, homeSm, awaySm);
  } catch (e) {
    console.warn('sm-history h2h', e.message);
    if (disk && disk.raw && clock - disk.at < H2H_STALE_MS) {
      const rebuilt = h2hMatchesFromSm(disk.raw, homeSm, awaySm, hints, lim);
      if (rebuilt.matches.length) {
        return Object.assign({}, rebuilt, { cached: true, stale: true, homeSmId: homeSm, awaySmId: awaySm });
      }
    }
    return null;
  }
  const h2hNorm = h2hMatchesFromSm(rows, homeSm, awaySm, hints, lim);
  if (!h2hNorm.matches.length) {
    if (disk && disk.raw && clock - disk.at < H2H_STALE_MS) {
      const rebuilt = h2hMatchesFromSm(disk.raw, homeSm, awaySm, hints, lim);
      if (rebuilt.matches.length) {
        return Object.assign({}, rebuilt, { cached: true, stale: true, homeSmId: homeSm, awaySmId: awaySm });
      }
    }
    return null;
  }
  try { writeJson(cacheFile, { at: clock, homeSmId: homeSm, awaySmId: awaySm, raw: rows }); } catch (e) {
    console.warn('sm-history h2h cache', e.message);
  }
  return Object.assign({}, h2hNorm, { cached: false, homeSmId: homeSm, awaySmId: awaySm });
}

async function fetchUpcoming({ teamId, teamName, limit, excludeSmFixtureId, excludeKickoffMs, excludeOpponentSmIds, fetchImpl, now } = {}) {
  const fn = smFetch(fetchImpl);
  if (!fn) return { fixtures: [], smTeamId: null, source: 'none' };
  const clock = now || Date.now();
  let smId = null;
  try {
    smId = await resolveSmTeamId(fn, { sportteryTeamId: teamId, nameZh: teamName });
  } catch (e) {
    console.warn('sm-history resolve next', e.message);
    return { fixtures: [], smTeamId: null, source: 'none' };
  }
  if (!smId) return { fixtures: [], smTeamId: null, source: 'none' };
  const cacheFile = nextCachePath(smId);
  const disk = readJson(cacheFile, null);
  const lim = Math.max(1, Math.min(15, Number(limit) || 5));
  const opts = { limit: lim, excludeSmFixtureId, excludeKickoffMs, excludeOpponentSmIds };
  let rows = null;
  if (disk && disk.at && Array.isArray(disk.raw) && clock - disk.at < NEXT_TTL_MS) {
    rows = disk.raw;
  } else {
    try {
      rows = await fixturesBetween(fn, smId, clock - 12 * 3600e3, clock + FUTURE_DAYS * 86400000,
        'participants;state;league');
      try { writeJson(cacheFile, { at: clock, smTeamId: smId, raw: rows }); } catch (e) {
        console.warn('sm-history next cache', e.message);
      }
    } catch (e) {
      console.warn('sm-history next between', e.message);
      if (disk && Array.isArray(disk.raw)) rows = disk.raw;
      else return { fixtures: [], smTeamId: smId, source: 'none' };
    }
  }
  return {
    fixtures: upcomingFromSm(rows || [], smId, teamId, teamName, opts),
    smTeamId: smId,
    source: 'sportmonks',
  };
}

async function listRecentFinished({ teamId, teamName, limit, fetchImpl, now, includeStats } = {}) {
  const fn = smFetch(fetchImpl);
  if (!fn) return { fixtures: [], smTeamId: null };
  const clock = now || Date.now();
  let smId = null;
  try {
    smId = await resolveSmTeamId(fn, { sportteryTeamId: teamId, nameZh: teamName });
  } catch (e) {
    console.warn('sm-history resolve process', e.message);
    return { fixtures: [], smTeamId: null };
  }
  if (!smId) return { fixtures: [], smTeamId: null };
  const include = includeStats
    ? 'participants;state;scores;league;statistics.type'
    : 'participants;state;scores;league';
  let rows = [];
  try {
    rows = await fixturesBetween(fn, smId, clock - HISTORY_DAYS * 86400000, clock, include);
  } catch (e) {
    console.warn('sm-history process between', e.message);
    return { fixtures: [], smTeamId: smId };
  }
  return { fixtures: finishedListFromSm(rows, smId, limit), smTeamId: smId, raw: rows };
}

function loadFixtureStats(smFixtureId) {
  const disk = readJson(fixtureStatsPath(smFixtureId), null);
  return disk && disk.byTeam ? disk : null;
}

function saveFixtureStats(smFixtureId, payload) {
  try { writeJson(fixtureStatsPath(smFixtureId), payload); } catch (e) {
    console.warn('sm-history fixture stats cache', e.message);
  }
}

async function getFixtureStatistics(smFixtureId, { allowFetch = true, fetchImpl, existing } = {}) {
  const hit = loadFixtureStats(smFixtureId);
  if (hit) return Object.assign({}, hit, { cached: true });
  if (existing && existing.statistics && existing.statistics.length) {
    const norm = normalizeStatisticsByTeam(existing);
    if (Object.keys(norm.byTeam).length) {
      saveFixtureStats(smFixtureId, Object.assign({ fixtureId: Number(smFixtureId) }, norm));
      return Object.assign({}, norm, { fixtureId: Number(smFixtureId), cached: false });
    }
  }
  if (!allowFetch) return null;
  const fn = smFetch(fetchImpl);
  if (!fn) return null;
  try {
    const fx = await fixtureById(fn, smFixtureId, 'participants;statistics.type');
    if (!fx) return null;
    const norm = normalizeStatisticsByTeam(fx);
    if (!Object.keys(norm.byTeam).length) return null;
    saveFixtureStats(smFixtureId, Object.assign({ fixtureId: Number(smFixtureId) }, norm));
    return Object.assign({}, norm, { fixtureId: Number(smFixtureId), cached: false });
  } catch (e) {
    console.warn('sm-history fixture stats', smFixtureId, e.message);
    return null;
  }
}

module.exports = {
  HISTORY_DAYS,
  FUTURE_DAYS,
  FORM_TTL_MS,
  H2H_TTL_MS,
  NEXT_TTL_MS,
  STAT_SPEC,
  tokenPresent,
  smFetch,
  resolveSmTeamId,
  homeAwayParticipants,
  kickoffMs,
  leagueName,
  currentScore,
  isFinishedFx,
  sideStatsFromSm,
  normalizeStatisticsByTeam,
  fixturesBetween,
  fixturesHeadToHead,
  fixtureById,
  formMatchesFromSm,
  h2hMatchesFromSm,
  finishedListFromSm,
  upcomingFromSm,
  fetchTeamForm,
  fetchH2h,
  fetchUpcoming,
  listRecentFinished,
  getFixtureStatistics,
  loadFixtureStats,
};
