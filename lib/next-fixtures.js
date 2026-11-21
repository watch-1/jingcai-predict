/**
 * Upcoming fixtures for match-detail「未来比赛」.
 * Prefer SportMonks Schedule / fixtures/between (~120 days ahead), disk-cached ~8h.
 * Falls back to sporttery 在售/已见 pool. Never calls API-Football.
 * Consumer copy only — no betting language.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const NEXT_DIR = () => path.join(DATA_DIR, 'live-stats', 'team-next');
const FORM_DIR = () => path.join(DATA_DIR, 'live-stats', 'team-form');
const NEXT_TTL_MS = 8 * 60 * 60 * 1000; // 6–12h band; pick 8h
const FORM_REUSE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const QUOTA_RESERVE = 20;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;

const DONE_SHORT = /^(FT|AET|PEN|CANC|ABD|AWD|WO)$/i;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function quotaAllowsAf() {
  try {
    const live = require('./live-stats');
    const q = live.getQuota && live.getQuota();
    if (!q || q.remaining == null) return true;
    return Number(q.remaining) > QUOTA_RESERVE;
  } catch {
    return true;
  }
}

function teamZhLabel(en) {
  try {
    return require('./league-tables').teamZh(en) || en || '';
  } catch {
    return en || '';
  }
}
function leagueZhLabel(en) {
  try {
    return require('./league-tables').leagueZh(en) || en || '';
  } catch {
    return en || '';
  }
}

/** AF ISO / unix → Asia/Shanghai wall date+time for UI. */
function toBj(isoOrTs) {
  let ms = null;
  if (typeof isoOrTs === 'number' && Number.isFinite(isoOrTs)) {
    ms = isoOrTs < 1e12 ? isoOrTs * 1000 : isoOrTs;
  } else {
    ms = Date.parse(String(isoOrTs || ''));
  }
  if (!Number.isFinite(ms)) return { date: '', time: '', ms: 0 };
  const bj = new Date(ms + 8 * 3600e3);
  const s = bj.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16), ms };
}

function crestsEn(teamId) {
  try {
    const j = readJson(path.join(DATA_DIR, 'crests.json'), {});
    const row = j.teams && j.teams[String(teamId)];
    return (row && row.en) || '';
  } catch {
    return '';
  }
}

async function resolveAfTeam(sportteryTeamId, nameZh) {
  const ms = require('./match-stats');
  let live;
  try { live = require('./live-stats'); } catch { live = null; }
  const sid = String(sportteryTeamId || '');
  const nameEn = crestsEn(sid);
  if (ms.AF_TEAM_SEED && ms.AF_TEAM_SEED[sid]) {
    const afTeamId = ms.AF_TEAM_SEED[sid];
    if (live && live.resolveAfTeamId) {
      try {
        await live.resolveAfTeamId({
          sportteryTeamId: sid,
          nameEn,
          nameZh: String(nameZh || '').trim(),
          allowFetch: false,
        });
      } catch { /* seed only */ }
    }
    return { afTeamId, afName: nameEn || '' };
  }
  if (!live || !live.resolveAfTeamId) return null;
  try {
    return await live.resolveAfTeamId({
      sportteryTeamId: sid,
      nameEn,
      nameZh: String(nameZh || '').trim(),
      allowFetch: quotaAllowsAf(),
    });
  } catch (e) {
    console.warn('next-fixtures resolveAf', e.message);
    return null;
  }
}

function normalizeUpcoming(rawRows, afTeamId, sportteryTeamId, focusZh, {
  limit = DEFAULT_LIMIT,
  excludeAfFixtureId = null,
  excludeKickoffMs = null,
  excludeOpponentAfIds = null,
} = {}) {
  const tid = String(sportteryTeamId || '');
  const now = Date.now();
  const excludeOpp = new Set(
    (excludeOpponentAfIds || []).map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0)
  );
  const out = [];
  const rows = Array.isArray(rawRows) ? rawRows.slice() : [];
  rows.sort((a, b) => {
    const ta = (a.fixture && a.fixture.timestamp) || 0;
    const tb = (b.fixture && b.fixture.timestamp) || 0;
    return ta - tb;
  });
  for (const row of rows) {
    if (!row || !row.fixture || !row.teams) continue;
    const short = (row.fixture.status && row.fixture.status.short) || '';
    if (short && DONE_SHORT.test(short)) continue;
    const fid = row.fixture.id;
    if (excludeAfFixtureId != null && String(fid) === String(excludeAfFixtureId)) continue;
    const tsSec = row.fixture.timestamp;
    const iso = row.fixture.date || '';
    const ms = tsSec ? Number(tsSec) * 1000 : Date.parse(iso);
    if (!Number.isFinite(ms) || ms <= now) continue;
    if (excludeKickoffMs != null && Math.abs(ms - excludeKickoffMs) < 2.5 * 3600e3) continue;
    const th = row.teams.home || {};
    const ta = row.teams.away || {};
    const thId = th.id;
    const taId = ta.id;
    const isHome = Number(thId) === Number(afTeamId);
    const isAway = Number(taId) === Number(afTeamId);
    if (!isHome && !isAway) continue;
    // Drop the current fixture when AF ids of both sides are known
    if (excludeOpp.size === 2) {
      const ids = new Set([Number(thId), Number(taId)]);
      let all = true;
      for (const x of excludeOpp) { if (!ids.has(x)) { all = false; break; } }
      if (all) continue;
    }
    const bj = toBj(ms);
    const homeEn = th.name || '';
    const awayEn = ta.name || '';
    const homeLabel = isHome && focusZh ? focusZh : (teamZhLabel(homeEn) || homeEn);
    const awayLabel = isAway && focusZh ? focusZh : (teamZhLabel(awayEn) || awayEn);
    const leagueEn = (row.league && row.league.name) || '';
    out.push({
      id: fid != null ? `af:${fid}` : `af:${bj.date}:${thId}:${taId}`,
      afFixtureId: fid != null ? fid : null,
      date: bj.date,
      time: bj.time,
      kickoffAt: new Date(ms).toISOString(),
      home: homeLabel,
      away: awayLabel,
      homeEn,
      awayEn,
      homeTeamId: isHome ? tid : '',
      awayTeamId: isAway ? tid : '',
      homeAfId: thId || null,
      awayAfId: taId || null,
      league: leagueZhLabel(leagueEn) || leagueEn,
      leagueEn,
      isHome,
      side: isHome ? '主' : '客',
      vs: isHome ? awayLabel : homeLabel,
      status: short || 'NS',
      source: 'api-football',
    });
    if (out.length >= limit) break;
  }
  return out;
}

function readFormRaw(afTeamId) {
  const disk = readJson(path.join(FORM_DIR(), String(afTeamId) + '.json'), null);
  if (!disk || !disk.at || !disk.payload || !Array.isArray(disk.payload.raw)) return null;
  if (Date.now() - disk.at > FORM_REUSE_MAX_MS) return null;
  return { at: disk.at, raw: disk.payload.raw };
}

function readNextCache(afTeamId) {
  const disk = readJson(path.join(NEXT_DIR(), String(afTeamId) + '.json'), null);
  if (!disk || !disk.at || !Array.isArray(disk.raw)) return null;
  if (Date.now() - disk.at > NEXT_TTL_MS) return null;
  return disk;
}

function writeNextCache(afTeamId, raw, meta) {
  try {
    writeJson(path.join(NEXT_DIR(), String(afTeamId) + '.json'), {
      at: Date.now(),
      afTeamId: Number(afTeamId),
      fetchedAt: new Date().toISOString(),
      meta: meta || {},
      raw,
    });
  } catch (e) {
    console.warn('next-fixtures cache write', e.message);
  }
}

async function fetchAfTeamRaw(afTeamId) {
  // Retired: API-Football next/season fetches are disabled (fail closed).
  return [];
}

async function getRawForTeam(afTeamId) {
  const cached = readNextCache(afTeamId);
  if (cached) return { raw: cached.raw, from: 'next-cache' };
  const form = readFormRaw(afTeamId);
  if (form && form.raw.length) {
    // Promote into next-cache so subsequent opens skip form parse + share TTL
    writeNextCache(afTeamId, form.raw, { via: 'team-form-reuse', formAt: form.at });
    return { raw: form.raw, from: 'team-form' };
  }
  const raw = await fetchAfTeamRaw(afTeamId);
  return { raw, from: 'api-football' };
}

function fromSportteryPool(pool, teamId, excludeId, limit) {
  const tid = String(teamId || '');
  if (!tid || !Array.isArray(pool)) return [];
  const now = Date.now();
  const out = [];
  const seen = new Set();
  for (const m of pool) {
    const id = String(m.id);
    if (id === String(excludeId) || seen.has(id)) continue;
    if (String(m.homeTeamId) !== tid && String(m.awayTeamId) !== tid) continue;
    if (m.full) continue;
    const ko = Date.parse(`${m.date}T${m.time || '00:00'}:00+08:00`);
    if (!(ko > now)) continue;
    if (m.status && /完场|已结束|Finished|Payout/i.test(String(m.status))) continue;
    seen.add(id);
    const isHome = String(m.homeTeamId) === tid;
    out.push({
      id,
      afFixtureId: null,
      date: m.date,
      time: m.time || '',
      kickoffAt: Number.isFinite(ko) ? new Date(ko).toISOString() : '',
      home: m.home,
      away: m.away,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      league: m.league || '',
      isHome,
      side: isHome ? '主' : '客',
      vs: isHome ? m.away : m.home,
      status: m.status || '',
      source: 'sporttery',
    });
  }
  return out.sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time))).slice(0, limit);
}

/**
 * Resolve fixture-map AF id for a sporttery match (optional exclude).
 */
function lookupMappedAfFixture(matchId) {
  try {
    const map = readJson(path.join(DATA_DIR, 'live-stats', 'fixture-map.json'), {});
    const row = map['m:' + String(matchId)] || map[String(matchId)];
    if (!row) return null;
    return row.fixtureId || row.afFixtureId || row.id || null;
  } catch {
    return null;
  }
}

async function lookupMappedSmFixture(matchId) {
  try {
    const smLive = require('./sm-live-scores');
    return smLive.smFixtureIdFromMap(matchId) || null;
  } catch {
    return null;
  }
}

async function nextForTeam({
  teamId,
  teamName,
  limit = DEFAULT_LIMIT,
  excludeId = null,
  excludeKickoffMs = null,
  excludeOpponentSmIds = null,
  schedulePool = [],
  fetchImpl = null,
}) {
  const lim = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const excludeSm = excludeId ? await lookupMappedSmFixture(excludeId) : null;
  let smList = [];
  let src = 'none';
  let smTeamId = null;
  try {
    const sm = require('./sm-history');
    const pack = await sm.fetchUpcoming({
      teamId,
      teamName,
      limit: lim,
      excludeSmFixtureId: excludeSm,
      excludeKickoffMs,
      excludeOpponentSmIds,
      fetchImpl,
    });
    smList = (pack && pack.fixtures) || [];
    smTeamId = pack && pack.smTeamId;
    if (smList.length) src = 'sportmonks';
  } catch (e) {
    console.warn('next-fixtures SM', teamId, e.message);
  }
  if (smList.length) {
    return { fixtures: smList, source: src, af: false, sm: true, smTeamId };
  }
  const poolList = fromSportteryPool(schedulePool, teamId, excludeId, lim);
  return {
    fixtures: poolList,
    source: poolList.length ? 'sporttery' : 'none',
    af: false,
    sm: false,
    smTeamId,
  };
}

/**
 * Match-detail payload: nextFixtures for home & away.
 */
async function getNextFixturesForMatch({
  matchId,
  homeTeamId,
  awayTeamId,
  home,
  away,
  date,
  time,
  limit = DEFAULT_LIMIT,
  schedulePool = [],
  fetchImpl = null,
}) {
  const lim = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  let excludeKickoffMs = null;
  if (date && time) {
    const t = Date.parse(`${date}T${time}:00+08:00`);
    if (Number.isFinite(t)) excludeKickoffMs = t;
  }
  const sm = require('./sm-history');
  const fn = fetchImpl || sm.smFetch();
  let homeSm = null;
  let awaySm = null;
  try {
    if (fn) {
      homeSm = await sm.resolveSmTeamId(fn, { sportteryTeamId: homeTeamId, nameZh: home });
      awaySm = await sm.resolveSmTeamId(fn, { sportteryTeamId: awayTeamId, nameZh: away });
    }
  } catch (e) {
    console.warn('next-fixtures resolve sides', e.message);
  }
  const excludeOpponentSmIds = [];
  if (homeSm) excludeOpponentSmIds.push(homeSm);
  if (awaySm) excludeOpponentSmIds.push(awaySm);

  const [h, a] = await Promise.all([
    nextForTeam({
      teamId: homeTeamId,
      teamName: home,
      limit: lim,
      excludeId: matchId,
      excludeKickoffMs,
      excludeOpponentSmIds,
      schedulePool,
      fetchImpl,
    }),
    nextForTeam({
      teamId: awayTeamId,
      teamName: away,
      limit: lim,
      excludeId: matchId,
      excludeKickoffMs,
      excludeOpponentSmIds,
      schedulePool,
      fetchImpl,
    }),
  ]);

  const sources = [h.source, a.source].filter(s => s && s !== 'none');
  let source = 'none';
  if (sources.every(s => s === 'sportmonks')) source = 'sportmonks';
  else if (sources.every(s => s === 'sporttery')) source = 'sporttery';
  else if (sources.length) source = 'mixed';

  return {
    ok: true,
    matchId: matchId ? String(matchId) : '',
    home: h.fixtures,
    away: a.fixtures,
    source,
    sourceZh: source === 'sportmonks'
      ? '综合赛程'
      : source === 'sporttery'
        ? '在售/赛程缓存'
        : source === 'mixed'
          ? '综合赛程与在售缓存'
          : '暂无',
    limit: lim,
    ttlHours: NEXT_TTL_MS / 3600e3,
  };
}

module.exports = {
  getNextFixturesForMatch,
  nextForTeam,
  normalizeUpcoming,
  toBj,
  NEXT_TTL_MS,
  DEFAULT_LIMIT,
};
