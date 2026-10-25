#!/usr/bin/env node
'use strict';
/** Build public/data-center-boot.json — slim offline-first slices for cold install (no fake rows). */
const fs = require('fs');
const path = require('path');
const lt = require('../lib/league-tables');

const LEAGUES = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'csl', 'ucl'];
const KINDS = ['standings', 'topscorers', 'topassists', 'clubvalues', 'playervalues', 'topkeepers'];
const FN = {
  standings: lt.getStandings,
  topscorers: lt.getTopScorers,
  topassists: lt.getTopAssists,
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
    const cap = kind === 'playervalues' ? 20 : 25;
    slim.rows = r.rows.slice(0, cap).map((row) => slimRow(kind, row));
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
        slices[`${lg}:${kind}`] = slimPayload(kind, r, lg);
      } catch (e) {
        console.warn('[boot]', lg, kind, e.message);
      }
    }
  }
  const outPath = path.join(__dirname, '..', 'public', 'data-center-boot.json');
  const out = { ver: 1, generatedAt: new Date().toISOString(), slices };
  fs.writeFileSync(outPath, JSON.stringify(out));
  const st = fs.statSync(outPath);
  console.log('wrote', outPath, st.size, 'bytes', Object.keys(slices).length, 'slices');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
