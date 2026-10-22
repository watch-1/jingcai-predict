/**
 * Read-only browse API for data/player-match.sqlite
 * Internal / self-use only. Phone login is NOT enough.
 * Requires env PLAYER_DB_VIEW_KEY via query ?key= or header X-Player-Db-Key.
 * If PLAYER_DB_VIEW_KEY is unset on the server, all routes return 404.
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const pmdb = require('./player-match-db');

const r = express.Router();

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ba, bb); } catch { return false; }
}

function expectedViewKey() {
  return String(process.env.PLAYER_DB_VIEW_KEY || '').trim();
}

function providedViewKey(req) {
  const q = String((req.query && req.query.key) || '').trim();
  if (q) return q;
  return String(req.get('x-player-db-key') || '').trim();
}

function viewKeyOk(req) {
  const expected = expectedViewKey();
  if (!expected) return false;
  return timingSafeEqualStr(providedViewKey(req), expected);
}

/** Key-only gate. Unset env → 404; wrong/missing key → 403. Login ignored. */
function gateBrowse(req, res, next) {
  if (!expectedViewKey()) {
    return res.status(404).json({ ok: false, error: '接口不存在' });
  }
  if (!viewKeyOk(req)) {
    return res.status(403).json({ ok: false, error: '无权访问' });
  }
  return next();
}

function mapPlayerRow(p) {
  if (!p) return null;
  return {
    matchId: p.match_id,
    playerId: p.player_id,
    teamId: p.team_id,
    side: p.side,
    name: p.name_zh && /[\u4e00-\u9fff]/.test(p.name_zh) ? p.name_zh : (p.name_en || p.name_zh || ''),
    nameEn: p.name_en || '',
    nameZh: p.name_zh || '',
    pos: p.position_zh || p.position || '',
    position: p.position || '',
    positionZh: p.position_zh || '',
    min: p.minutes,
    minutes: p.minutes,
    goals: p.goals,
    assists: p.assists,
    shots: p.shots,
    sot: p.shots_on,
    shotsOn: p.shots_on,
    keyPasses: p.key_passes,
    tackles: p.tackles,
    rating: p.rating,
    date: p.date || null,
    ft: p.ft || null,
    homeNameZh: p.home_name_zh || p.home_name || '',
    awayNameZh: p.away_name_zh || p.away_name || '',
    competition: p.competition || null,
  };
}

function mapMatch(m) {
  if (!m) return null;
  return {
    matchId: m.match_id,
    fixtureId: m.fixture_id,
    date: m.date,
    ft: m.ft,
    competition: m.competition,
    homeName: m.home_name,
    awayName: m.away_name,
    homeNameZh: m.home_name_zh || m.home_name,
    awayNameZh: m.away_name_zh || m.away_name,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    fetchedAt: m.fetched_at,
    playerCount: m.player_count != null ? m.player_count : undefined,
  };
}

r.get('/player-db/overview', gateBrowse, (req, res) => {
  try {
    const o = pmdb.overview();
    res.json({
      ok: true,
      matches: o.matches,
      playerRows: o.playerRows,
      tags: o.tags,
      outcomes: o.outcomes || 0,
      processCompare: o.processCompare || 0,
      hardTestEpisodes: o.hardTestEpisodes || 0,
      jingcaiMatches: o.jingcaiMatches || 0,
      afShells: o.afShells || 0,
      playerGapJingcai: o.playerGapJingcai || 0,
      bytes: o.bytes || null,
      path: o.path,
      lastFetchedAt: o.lastFetchedAt,
      fileMtime: o.fileMtime,
      readOnly: true,
      noteZh: '默认隐藏非竞彩 af: 壳；回填优先竞彩球员缺口',
    });
  } catch (e) {
    console.warn('player-db overview', e.message);
    res.status(500).json({ ok: false, error: '读取球员库失败' });
  }
});

r.get('/player-db/recent-matches', gateBrowse, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const includeAf = String(req.query.includeAf || '') === '1' || String(req.query.includeAf || '') === 'true';
    const rows = pmdb.listRecentMatches({ limit, hideAfShells: !includeAf }).map(m => {
      const mapped = mapMatch(m);
      if (mapped) mapped.isAfShell = !!(m.is_af_shell || String(m.match_id || '').startsWith('af:'));
      return mapped;
    });
    res.json({ ok: true, matches: rows, hideAfShells: !includeAf });
  } catch (e) {
    console.warn('player-db recent', e.message);
    res.status(500).json({ ok: false, error: '读取最近场次失败' });
  }
});

r.get('/player-db/search', gateBrowse, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const matchId = String(req.query.matchId || '').trim();
    const limit = Number(req.query.limit) || 40;
    const rows = pmdb.searchBrowse({ q, matchId, limit }).map(mapPlayerRow);
    res.json({ ok: true, q, matchId: matchId || null, rows });
  } catch (e) {
    console.warn('player-db search', e.message);
    res.status(500).json({ ok: false, error: '搜索失败' });
  }
});

r.get('/player-db/matches/:matchId', gateBrowse, (req, res) => {
  try {
    const detail = pmdb.getMatchDetail(req.params.matchId);
    if (!detail) return res.status(404).json({ ok: false, error: '未找到该场次' });
    const home = detail.players.filter(p => p.side === 'home').map(mapPlayerRow);
    const away = detail.players.filter(p => p.side === 'away').map(mapPlayerRow);
    const outcome = detail.outcome || null;
    const compare = detail.processCompare || { home: {}, away: {}, rows: 0 };
    const hardTest = Array.isArray(detail.hardTest) ? detail.hardTest : [];
    res.json({
      ok: true,
      match: mapMatch(detail.match),
      home,
      away,
      players: detail.players.map(mapPlayerRow),
      outcome: outcome ? {
        matchId: outcome.match_id,
        predLean: outcome.pred_lean,
        predConf: outcome.pred_conf,
        predPickText: outcome.pred_pick_text,
        speakMode: outcome.speak_mode,
        marketLean: outcome.market_lean,
        leanHit: outcome.lean_hit,
        marketHit: outcome.market_hit,
        amplifyHit: outcome.amplify_hit,
        hasActualStats: !!outcome.has_actual_stats,
        snippet: outcome.snippet || '',
        hardTestAvailable: !!outcome.hard_test_available,
        ft: outcome.ft,
        result: outcome.result,
        league: outcome.league,
      } : null,
      processCompare: {
        home: compare.home || {},
        away: compare.away || {},
        rows: compare.rows || 0,
      },
      hardTest: hardTest.map(ep => {
        let ui = ep;
        try {
          const te = require('./team-evidence');
          ui = te.formatEpisodeForUi(ep, ep.teamName) || ep;
        } catch (_) {}
        return {
          matchId: ep.matchId,
          side: ep.side,
          teamId: ep.teamId,
          teamName: ui.teamNameZh || ep.teamName,
          teamNameZh: ui.teamNameZh || ep.teamName,
          opponent: ui.opponentZh || ep.opponent,
          opponentZh: ui.opponentZh || ep.opponent,
          opponentSi: ep.opponentStrength, // kept for internal; UI uses plain label
          opponentStrengthPlainZh: ui.opponentStrengthPlainZh || null,
          isHardTest: !!ep.isHardTest,
          moistureTag: ep.moistureTag,
          moistureLabelZh: ui.moistureLabelZh || ep.moistureLabelZh,
          mechanismTags: ui.mechanismTags || ep.mechanismTags || [],
          collapseN: ep.collapseN,
          coreCollapse: ep.coreCollapse,
          briefSummaryZh: ui.briefSummaryZh || ep.briefSummaryZh,
          thisMatchVsRecent: ep.thisMatchVsRecent || null,
          ft: ep.ft,
          date: ep.date,
          tagClass: ui.tagClass || null,
        };
      }),
    });
  } catch (e) {
    console.warn('player-db match', e.message);
    res.status(500).json({ ok: false, error: '读取场次失败' });
  }
});

r.get('/player-db/players/:playerId', gateBrowse, (req, res) => {
  try {
    const detail = pmdb.getPlayerDetail(req.params.playerId, {
      limit: Number(req.query.limit) || 30,
    });
    if (!detail) return res.status(404).json({ ok: false, error: '未找到该球员' });
    res.json({
      ok: true,
      playerId: detail.playerId,
      nameEn: detail.nameEn,
      nameZh: detail.nameZh,
      name: detail.nameZh && /[\u4e00-\u9fff]/.test(detail.nameZh)
        ? detail.nameZh
        : (detail.nameEn || detail.nameZh || detail.playerId),
      tag: detail.tag
        ? {
            line: detail.tag.line,
            keyPlayerScore: detail.tag.key_player_score,
            appearances: detail.tag.appearances,
            teamId: detail.tag.team_id,
            updatedAt: detail.tag.updated_at,
          }
        : null,
      rows: detail.rows.map(mapPlayerRow),
    });
  } catch (e) {
    console.warn('player-db player', e.message);
    res.status(500).json({ ok: false, error: '读取球员失败' });
  }
});


r.get('/player-db/outcomes', gateBrowse, (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const rows = pmdb.listRecentOutcomes({ limit }).map(o => {
      const hard = pmdb.getHardTestEpisodesForMatch(o.match_id);
      const compare = pmdb.getProcessCompareForMatch(o.match_id);
      const sideSum = (ep) => ep ? {
        teamName: ep.teamName,
        moistureTag: ep.moistureTag,
        moistureLabelZh: ep.moistureLabelZh,
        opponentSi: ep.opponentStrength,
        isHardTest: !!ep.isHardTest,
        collapseN: ep.collapseN,
        coreCollapse: ep.coreCollapse,
      } : null;
      const homeHt = hard.find(e => e.side === 'home') || hard[0] || null;
      const awayHt = hard.find(e => e.side === 'away') || (hard.length > 1 ? hard[1] : null);
      // Compact compare headline: shots / xG deltas if present
      const metricBrief = (side) => {
        const s = (compare && compare[side]) || {};
        const keys = ['shots', 'shotsOnTarget', 'expectedGoals', 'possession'];
        const bits = [];
        for (const k of keys) {
          const d = s[k];
          if (!d || d.missing || d.delta == null) continue;
          const lab = k === 'expectedGoals' ? 'xG' : (k === 'shotsOnTarget' ? '射正' : (k === 'possession' ? '控球' : '射门'));
          const sign = d.delta > 0 ? '+' : '';
          bits.push(`${lab}${sign}${d.delta}`);
        }
        return bits.slice(0, 3).join(' ');
      };
      return {
        matchId: o.match_id,
        fixtureId: o.fixture_id,
        date: o.date,
        league: o.league,
        homeName: o.home_name,
        awayName: o.away_name,
        homeTeamId: o.home_team_id,
        awayTeamId: o.away_team_id,
        ft: o.ft,
        result: o.result,
        predLean: o.pred_lean,
        predConf: o.pred_conf,
        predPickText: o.pred_pick_text,
        speakMode: o.speak_mode,
        marketLean: o.market_lean,
        leanHit: o.lean_hit,
        marketHit: o.market_hit,
        amplifyHit: o.amplify_hit,
        hasActualStats: !!o.has_actual_stats,
        snippet: o.snippet || '',
        hardTestAvailable: !!o.hard_test_available,
        generatedAt: o.generated_at,
        compareRows: compare.rows || 0,
        homeCompareBrief: metricBrief('home'),
        awayCompareBrief: metricBrief('away'),
        homeHardTest: sideSum(homeHt),
        awayHardTest: sideSum(awayHt),
      };
    });
    res.json({ ok: true, outcomes: rows });
  } catch (e) {
    console.warn('player-db outcomes', e.message);
    res.status(500).json({ ok: false, error: '读取复盘结果失败' });
  }
});

module.exports = r;

