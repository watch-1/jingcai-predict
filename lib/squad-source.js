/**
 * Prematch sidelined list + recent core widgets.
 * Tokens stay on the server. Missing names, fixtures, or lineups become an
 * honest empty pack — nothing is invented.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const FRESH_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 6 * 3600 * 1000;
const DETAIL = { RATING: 118, GOALS: 52, ASSISTS: 79, SHOTS: 42, PASSES: 80, TACKLES: 78 };

const TYPE_ZH = {
  injury: '伤病',
  'unknown injury': '伤病',
  'no eligibility': '停赛',
  suspension: '停赛',
  'ankle sprain': '脚踝',
  'dead leg': '腿部',
  'broken tibia': '胫骨',
  knock: '磕碰',
  illness: '生病',
  'red card': '红牌停赛',
  'yellow cards': '黄牌停赛',
  'muscle injury': '肌肉',
  'knee injury': '膝盖',
  'hamstring injury': '腿筋',
};

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'predict-squad', `${matchId}.json`);
}

function readCache(matchId) {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(matchId), 'utf8'));
    if (j && j.matchId != null) return j;
  } catch { /* miss */ }
  return null;
}

function writeCache(pack) {
  const file = cacheFile(pack.matchId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack));
  fs.renameSync(tmp, file);
  return pack;
}

function detailVal(details, typeId) {
  const row = (details || []).find(d => Number(d.type_id) === Number(typeId));
  if (!row || !row.data || row.data.value == null || row.data.value === '') return null;
  const n = Number(row.data.value);
  return Number.isFinite(n) ? n : null;
}

function reasonZh(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  const hit = TYPE_ZH[raw.toLowerCase()];
  return hit || raw;
}

function scoreCores(lineupFixtures, teamId) {
  const tid = Number(teamId);
  const byPlayer = new Map();
  for (const fx of lineupFixtures || []) {
    for (const lu of fx.lineups || []) {
      if (Number(lu.team_id) !== tid) continue;
      const pid = lu.player_id;
      if (!pid) continue;
      if (!byPlayer.has(pid)) {
        const player = lu.player || {};
        byPlayer.set(pid, {
          player_id: pid,
          name: lu.player_name || player.display_name || player.name || player.common_name || '',
          image: player.image_path || null,
          apps: 0,
          ratingSum: 0,
          ratingN: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          passes: 0,
          tackles: 0,
        });
      }
      const row = byPlayer.get(pid);
      row.apps += 1;
      const rating = detailVal(lu.details, DETAIL.RATING);
      if (rating != null) {
        row.ratingSum += rating;
        row.ratingN += 1;
      }
      row.goals += detailVal(lu.details, DETAIL.GOALS) || 0;
      row.assists += detailVal(lu.details, DETAIL.ASSISTS) || 0;
      row.shots += detailVal(lu.details, DETAIL.SHOTS) || 0;
      row.passes += detailVal(lu.details, DETAIL.PASSES) || 0;
      row.tackles += detailVal(lu.details, DETAIL.TACKLES) || 0;
    }
  }
  const list = [...byPlayer.values()].map(r => {
    const avg = r.ratingN ? r.ratingSum / r.ratingN : null;
    const ratingForImpact = avg == null ? 6.5 : avg;
    const impact = ratingForImpact * 1.2
      + r.goals * 2.5
      + r.assists * 1.8
      + Math.min(r.shots, 15) * 0.15
      + Math.min(r.passes, 400) * 0.01
      + Math.min(r.tackles, 40) * 0.08
      + Math.min(r.apps, 5) * 0.3;
    return {
      player_id: r.player_id,
      name: r.name,
      image: r.image,
      apps: r.apps,
      avg_rating: avg == null ? null : +avg.toFixed(2),
      goals: r.goals,
      assists: r.assists,
      shots: r.shots,
      passes: r.passes,
      tackles: r.tackles,
      impact: +impact.toFixed(2),
    };
  });
  list.sort((a, b) => b.impact - a.impact);
  return list.slice(0, 6);
}

function mapSidelined(list, homeSmId, awaySmId) {
  return (list || []).map(s => {
    const pid = Number(s.participant_id);
    let side = 'unknown';
    if (pid === Number(homeSmId)) side = 'home';
    else if (pid === Number(awaySmId)) side = 'away';
    const player = s.player || {};
    const type = (s.type && (s.type.name || s.type.developer_name)) || '';
    return {
      player_id: s.player_id,
      name: player.display_name || player.common_name || player.name || '',
      image: player.image_path || null,
      type,
      reason: reasonZh(type),
      side,
      core: false,
    };
  }).filter(s => s.side === 'home' || s.side === 'away');
}

function markCore(sidelined, cores) {
  const ids = new Set();
  for (const row of (cores && cores.home) || []) ids.add(Number(row.player_id));
  for (const row of (cores && cores.away) || []) ids.add(Number(row.player_id));
  return (sidelined || []).map(s => ({ ...s, core: ids.has(Number(s.player_id)) }));
}

function emptyPack(matchId, reason, now) {
  return {
    matchId: String(matchId || ''),
    fetchedAt: now || Date.now(),
    reason: reason || '',
    available: false,
    sidelined: [],
    cores: { home: [], away: [] },
    note: '伤停和近况核心暂时没有。',
  };
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function resolveSm(teamId, nameZh, known, fetchJson) {
  if (known) return known;
  const name = heatSource.englishName(teamId, nameZh);
  if (!name) return null;
  const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
  return heatSource.pickTeamId(found && found.data, name);
}

async function findFixtureId(homeSm, awaySm, kickoffMs, fetchJson) {
  const ko = Number.isFinite(kickoffMs) ? kickoffMs : Date.now();
  const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${homeSm}`, {
    include: 'participants',
    per_page: 20,
  });
  const rows = (body && body.data) || [];
  const hit = rows.find(fx => {
    const ids = (fx.participants || []).map(p => Number(p.id));
    return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
  });
  return hit ? hit.id : null;
}

async function fetchLineups(ids, fetchJson) {
  const out = [];
  for (const id of ids) {
    try {
      const body = await fetchJson(`/football/fixtures/${id}`, {
        include: 'lineups.details;lineups.player;participants',
      });
      if (body && body.data) out.push(body.data);
    } catch { /* one fixture can fail */ }
  }
  return out;
}

async function ensureSquad({
  matchId, homeTeamId, awayTeamId, homeZh, awayZh,
  homeSmId, awaySmId, homeFixtureIds, awayFixtureIds, kickoffMs,
  fetchImpl, now,
} = {}) {
  const clock = now || Date.now();
  const cached = matchId ? readCache(matchId) : null;
  if (cached && cached.fetchedAt) {
    const age = clock - Number(cached.fetchedAt);
    const has = (cached.sidelined && cached.sidelined.length) || (cached.cores && ((cached.cores.home || []).length || (cached.cores.away || []).length));
    if (has && age < FRESH_MS) return cached;
    if (!has && age < NEGATIVE_MS) return cached;
  }
  const fetchJson = fetchImpl || (heatSource.readToken() ? heatSource.smGet : null);
  if (!fetchJson || !matchId) return cached || emptyPack(matchId, 'no-token', clock);
  let homeSm = homeSmId || null;
  let awaySm = awaySmId || null;
  try {
    if (!homeSm) homeSm = await resolveSm(homeTeamId, homeZh, null, fetchJson);
    if (!awaySm) awaySm = await resolveSm(awayTeamId, awayZh, null, fetchJson);
  } catch {
    return cached || emptyPack(matchId, 'lookup-failed', clock);
  }
  if (!homeSm && !awaySm) return writeCache(emptyPack(matchId, 'no-team', clock));

  let sidelined = [];
  if (homeSm && awaySm) {
    try {
      const fxId = await findFixtureId(homeSm, awaySm, kickoffMs, fetchJson);
      if (fxId) {
        const body = await fetchJson(`/football/fixtures/${fxId}`, {
          include: 'sidelined.player;sidelined.type;participants',
        });
        sidelined = mapSidelined(body && body.data && body.data.sidelined, homeSm, awaySm);
      }
    } catch { /* keep cores even if the fixture lookup fails */ }
  }

  const ids = [...new Set([].concat(homeFixtureIds || [], awayFixtureIds || []).filter(Boolean))].slice(0, 6);
  let lineupIds = ids;
  if (!lineupIds.length && homeSm) {
    try {
      const body = await fetchJson(`/football/fixtures/between/${ymd(clock - 120 * 86400000)}/${ymd(clock)}/${homeSm}`, {
        include: 'participants;state',
        per_page: 20,
      });
      lineupIds = ((body && body.data) || [])
        .filter(heatSource.isFinished)
        .map(fx => fx.id)
        .filter(Boolean)
        .slice(0, 3);
    } catch { lineupIds = []; }
  }
  const lineups = await fetchLineups(lineupIds, fetchJson);
  const cores = {
    home: homeSm ? scoreCores(lineups, homeSm) : [],
    away: awaySm ? scoreCores(lineups, awaySm) : [],
  };
  sidelined = markCore(sidelined, cores);
  const available = sidelined.length > 0 || cores.home.length > 0 || cores.away.length > 0;
  return writeCache({
    matchId: String(matchId),
    fetchedAt: clock,
    reason: available ? '' : 'empty',
    available,
    homeSmId: homeSm,
    awaySmId: awaySm,
    sidelined,
    cores,
    note: available ? '' : '伤停和近况核心暂时没有。',
  });
}

module.exports = {
  detailVal,
  reasonZh,
  scoreCores,
  mapSidelined,
  markCore,
  ensureSquad,
};
