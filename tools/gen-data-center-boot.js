#!/usr/bin/env node
'use strict';
/** Build public/data-center-boot.json — slim offline-first slices for cold install (no fake rows). */
const fs = require('fs');
const path = require('path');
const lt = require('../lib/league-tables');
const { listHotTribePosts } = require('../lib/tribe-feed');

const LEAGUES = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'csl', 'ucl'];
const VALUE_ESPN_BY_TM = (() => {
  try {
    return require('../data/value-board-espn-overrides.json').byTmId || {};
  } catch (_) {
    return {};
  }
})();

function pnorm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Cross-league topscorers/assists → playervalues playerId (身价榜 boot 行常缺 ESPN id). */
function enrichPlayervalueIdsInSlices(slices) {
  const byClub = new Map();
  const byName = new Map();
  for (const [key, slice] of Object.entries(slices)) {
    if (!slice || !slice.rows) continue;
    if (!/:topscorers$|:topassists$/.test(key)) continue;
    for (const r of slice.rows) {
      const pid = r.playerId != null && String(r.playerId) !== '' ? String(r.playerId) : '';
      if (!pid) continue;
      const nn = pnorm(r.player);
      const tt = pnorm(r.team);
      if (nn && tt) byClub.set(nn + '|' + tt, pid);
      if (nn && !byName.has(nn)) byName.set(nn, pid);
    }
  }
  for (const [key, slice] of Object.entries(slices)) {
    if (!key.endsWith(':playervalues') || !slice || !slice.rows) continue;
    for (const r of slice.rows) {
      if (!r) continue;
      if (r.playerId != null && String(r.playerId) !== '') continue;
      const nn = pnorm(r.player);
      const tt = pnorm(r.team);
      let pid = (nn && tt && byClub.get(nn + '|' + tt)) || (nn && byName.get(nn)) || '';
      const tm = r.tmId != null && String(r.tmId) !== '' ? String(r.tmId) : '';
      if (!pid && tm && VALUE_ESPN_BY_TM[tm]) pid = String(VALUE_ESPN_BY_TM[tm]);
      if (pid) r.playerId = pid;
    }
  }
}
const KINDS = ['standings', 'topscorers', 'topassists', 'topkeepers', 'clubvalues', 'playervalues'];
const FN = {
  standings: lt.getStandings,
  topscorers: lt.getTopScorers,
  topassists: lt.getTopAssists,
  topkeepers: lt.getTopKeepers,
  clubvalues: lt.getClubMarketValues,
  playervalues: lt.getPlayerMarketValues,
  topkeepers: lt.getTopKeepers,
};

function slimRow(kind, row) {
  if (kind === 'standings') {
    return {
      rank: row.rank, team: row.team, teamZh: row.teamZh, teamId: row.teamId, logo: row.logo,
      played: row.played, win: row.win, draw: row.draw, lose: row.lose, gf: row.gf, ga: row.ga,
      points: row.points, form: row.form,
    };
  }
  if (kind === 'topkeepers') {
    return {
      rank: row.rank, player: row.player, playerZh: row.playerZh, playerId: row.playerId,
      photo: row.photo, photoAlt: row.photoAlt, team: row.team, teamZh: row.teamZh,
      teamId: row.teamId, teamLogo: row.teamLogo, goals: row.goals, assists: row.assists,
      labelZh: row.labelZh, text: row.text,
    };
  }
  if (kind === 'playervalues') {
    return {
      rank: row.rank, player: row.player, playerZh: row.playerZh, playerId: row.playerId,
      tmId: row.tmId, photo: '', photoAlt: row.photoAlt,
      team: row.team, teamZh: row.teamZh, teamId: row.teamId, teamLogo: row.teamLogo,
      labelZh: row.labelZh, text: row.text, marketValueEur: row.marketValueEur,
    };
  }
  if (kind === 'topkeepers') {
    return {
      rank: row.rank, player: row.player, playerZh: row.playerZh, playerId: row.playerId,
      photo: row.photo, photoAlt: row.photoAlt, team: row.team, teamZh: row.teamZh,
      teamId: row.teamId, teamLogo: row.teamLogo, cleanSheets: row.cleanSheets,
      saves: row.saves, goalsConceded: row.goalsConceded,
    };
  }
  return {
    rank: row.rank, player: row.player, playerZh: row.playerZh, playerId: row.playerId,
    photo: row.photo, photoAlt: row.photoAlt, team: row.team, teamZh: row.teamZh,
    teamId: row.teamId, teamLogo: row.teamLogo, goals: row.goals, assists: row.assists,
    labelZh: row.labelZh, text: row.text,
  };
}

function slimPayload(kind, r, lgKey) {
  const slim = {
    ok: true,
    leagueKey: r.leagueKey,
    leagueZh: r.leagueZh,
    seasonLabel: r.seasonLabel,
    source: r.source,
    updatedAt: r.updatedAt || r.fetchedAt,
    fetchedAt: r.fetchedAt,
    asOf: r.asOf,
    noteZh: r.noteZh,
    pastSeason: r.pastSeason,
    bootPack: true,
  };
  if (kind === 'standings' && r.tables) {
    slim.tables = r.tables.map((t) => ({
      group: t.group,
      rows: (t.rows || []).slice(0, lgKey === 'ucl' ? 40 : 20).map((row) => slimRow(kind, row)),
    }));
  } else if (r.rows) {
    const cap = kind === 'playervalues' ? 25 : 30;
    slim.rows = r.rows.slice(0, cap).map((row) => slimRow(kind, row));
  }
  if (kind === 'topkeepers') {
    slim.preparing = !!r.preparing;
    if (!slim.rows) slim.rows = [];
  }
  return slim;
}

(async () => {
  const slices = {};
  for (const lg of LEAGUES) {
    for (const kind of KINDS) {
      const fn = FN[kind];
      if (!fn) continue;
      try {
        const r = await fn({ league: lg, refresh: kind === 'playervalues' });
        if (!r || r.ok === false) continue;
        if (kind === 'topkeepers' && r.preparing && !(r.rows && r.rows.length)) continue;
        slices[`${lg}:${kind}`] = slimPayload(kind, r, lg);
      } catch (e) {
        console.warn('[boot]', lg, kind, e.message);
      }
    }
  }
  enrichPlayervalueIdsInSlices(slices);
  try {
    const { posts } = listHotTribePosts(null, 15, 0);
    const hot = (posts || []).filter((p) => p.kind !== 'match_vote').map((p) => ({
      id: p.id,
      tribeId: p.tribeId,
      kind: p.kind,
      body: p.body,
      replyCount: p.replyCount,
      createdAt: p.createdAt,
      author: p.author ? { nickname: p.author.nickname, avatar: p.author.avatar } : null,
      reactions: p.reactions,
    }));
    slices['global:tribeHot'] = {
      ok: true,
      bootPack: true,
      fetchedAt: new Date().toISOString(),
      posts: hot,
    };
  } catch (e) {
    console.warn('[boot] global:tribeHot', e.message);
  }
  const outPath = path.join(__dirname, '..', 'public', 'data-center-boot.json');
  try {
    const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const [k, v] of Object.entries(prev.slices || {})) {
      if (k.endsWith(':playervalues') && v && v.rows && v.rows.length && !slices[k]) slices[k] = v;
    }
  } catch (_) { /* first run */ }
  const out = { ver: 1, generatedAt: new Date().toISOString(), slices };
  fs.writeFileSync(outPath, JSON.stringify(out));
  const inlinePath = path.join(__dirname, '..', 'public', 'data-center-boot-slices.js');
  fs.writeFileSync(inlinePath, 'window.__JC_DC_BOOT__=' + JSON.stringify(out) + ';\n');
  const st = fs.statSync(outPath);
  const stInline = fs.statSync(inlinePath);
  console.log('wrote', outPath, st.size, 'bytes', Object.keys(slices).length, 'slices');
  console.log('wrote', inlinePath, stInline.size, 'bytes (sync APK first paint)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
