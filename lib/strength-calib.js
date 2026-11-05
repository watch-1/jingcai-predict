/**
 * Opponent-strength calibration for recent form and O2.5-style rates.
 *
 * opp_str is a same-league percentile in [0, 1] (1 = strongest).
 * It is not the early-season table by itself:
 * - first ~8 rounds, or an opponent sample under half the league → previous-season
 *   end rank / PPG is the main signal; the current table is at most a 10% blend
 * - once the season is warm, in-season Elo from results (home edge ~70) is opp_str
 * - goals against a strong side count more; goals against a weak side are discounted;
 *   conceding to a weak side is penalized more
 * - under 5 opponent games, or early season, the adjustment shrinks back toward raw
 * - cup / lower-tier games are downweighted; a different top league is skipped
 */
'use strict';

const EARLY_ROUNDS = 8;
const THIN_N = 5;
const HOME_EDGE = 70;
const ELO_K = 20;
const ELO_BASE = 1500;
const ELO_SCALE = 400;
const ELO_MIN_GAMES = 6;
const TABLE_WEIGHT_EARLY = 0.1;
const EARLY_SHRINK = 0.35;

const LEAGUE_SIZE = {
  英超: 20, 西甲: 20, 意甲: 20, 法甲: 18, 德甲: 18, 荷甲: 18, 葡超: 18,
  英冠: 24, 中超: 16, 日职: 18, 韩职: 12,
};

function leagueSizeOf(name, fallback) {
  const s = String(name || '');
  for (const [k, n] of Object.entries(LEAGUE_SIZE)) {
    if (s.includes(k)) return n;
  }
  const fb = Number(fallback);
  return Number.isFinite(fb) && fb >= 2 ? fb : null;
}

function isCup(name) {
  return /杯|欧冠|欧罗巴|欧联|欧协|亚冠|洲际|世俱/.test(String(name || ''));
}

function isLowerTier(name) {
  return /英冠|英甲|德乙|法乙|意乙|西乙|荷乙|葡甲|中甲|次级/.test(String(name || ''));
}

function isEarlySeason({ roundsPlayed, leagueSize, oppSample } = {}) {
  if (roundsPlayed != null && Number(roundsPlayed) <= EARLY_ROUNDS) return true;
  const half = leagueSize ? Number(leagueSize) / 2 : null;
  if (half != null && oppSample != null && Number(oppSample) < half) return true;
  return false;
}

/** Rank 1 → 1 (strongest). Same-league size only. */
function percentileFromRank(rank, leagueSize) {
  const r = Number(rank);
  const n = Number(leagueSize);
  if (!Number.isFinite(r) || !Number.isFinite(n) || n < 2 || r < 1) return null;
  const rr = Math.min(r, n);
  return (n - rr) / (n - 1);
}

function percentileFromPpg(ppg, leagueAvgPpg) {
  const p = Number(ppg);
  if (!Number.isFinite(p)) return null;
  const avg = Number.isFinite(Number(leagueAvgPpg)) && Number(leagueAvgPpg) > 0
    ? Number(leagueAvgPpg) : 1.35;
  return Math.max(0, Math.min(1, p / (2 * avg)));
}

function priorStrength({ endRank, leagueSize, ppg, leagueAvgPpg } = {}) {
  const fromRank = percentileFromRank(endRank, leagueSize);
  if (fromRank != null) return { value: fromRank, source: 'prev_rank' };
  const fromPpg = percentileFromPpg(ppg, leagueAvgPpg);
  if (fromPpg != null) return { value: fromPpg, source: 'prev_ppg' };
  return null;
}

/**
 * Blend a single opponent percentile.
 * Early season never falls back to the current table alone.
 */
function blendOppStr({ early, prior, tablePct, eloPct, eloGames } = {}) {
  const games = eloGames == null ? ELO_MIN_GAMES : Number(eloGames);
  const eloWarm = eloPct != null && games >= ELO_MIN_GAMES;
  if (!early && eloWarm) return { oppStr: eloPct, source: 'elo', weightTable: 0 };
  if (early) {
    if (prior == null) return { oppStr: null, source: 'none', weightTable: 0 };
    const w = tablePct == null ? 0 : TABLE_WEIGHT_EARLY;
    const opp = tablePct == null ? prior : prior * (1 - w) + tablePct * w;
    return { oppStr: opp, source: 'prior', weightTable: w };
  }
  if (prior != null) return { oppStr: prior, source: 'prior', weightTable: 0 };
  if (tablePct != null) return { oppStr: tablePct, source: 'table', weightTable: 1 };
  return { oppStr: null, source: 'none', weightTable: 0 };
}

/**
 * Keep percentile inside one league. Cup and lower-tier games are pulled
 * toward average; a different top-flight league returns null.
 */
function contextualOppStr(oppStr, { sampleLeague, focusLeague } = {}) {
  if (oppStr == null || !Number.isFinite(Number(oppStr))) return null;
  const base = Math.max(0, Math.min(1, Number(oppStr)));
  const sample = String(sampleLeague || '');
  const focus = String(focusLeague || '');
  const same = !!(sample && focus && sample === focus);
  if (same) return base;
  if (isCup(sample) || isCup(focus)) {
    const keep = isLowerTier(sample) ? 0.35 : 0.55;
    return 0.5 + (base - 0.5) * keep;
  }
  if (isLowerTier(sample) && focus && !isLowerTier(focus)) {
    return 0.5 + (base - 0.5) * 0.35;
  }
  return null;
}

function weightGf(oppStr) {
  return 0.55 + Number(oppStr) * 0.9;
}

function weightGa(oppStr) {
  return 1.45 - Number(oppStr) * 0.9;
}

/** Per-match contribution before averaging. Strong opponents amplify GF; weak ones amplify GA. */
function adjustContribution(gf, ga, oppStr) {
  const s = Number(oppStr);
  return {
    gf: Number(gf) * weightGf(s),
    ga: Number(ga) * weightGa(s),
  };
}

function shrinkFactor(nOpp, early) {
  const n = Math.max(0, Number(nOpp) || 0);
  let t = 1;
  if (n < THIN_N) t *= n / THIN_N;
  if (early) t *= EARLY_SHRINK;
  return t;
}

function shrinkTowardRaw(raw, adj, nOpp, early) {
  const t = shrinkFactor(nOpp, early);
  return Number(raw) + (Number(adj) - Number(raw)) * t;
}

function avg(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round2(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * games: [{ gf, ga, oppStr|null, venue: 'home'|'away' }]
 * Adjusted rates use sum(value * weight) / nOpp, then shrink toward the raw mean.
 */
function calibrateSide(games, { early = false } = {}) {
  const usable = (games || []).filter(g => g && Number.isFinite(Number(g.gf)) && Number.isFinite(Number(g.ga)));
  const n = usable.length;
  const rawGf = avg(usable.map(g => Number(g.gf)));
  const rawGa = avg(usable.map(g => Number(g.ga)));
  const rawO25 = avg(usable.map(g => (Number(g.gf) + Number(g.ga) >= 3 ? 1 : 0)));
  const weighted = usable.filter(g => g.oppStr != null && Number.isFinite(Number(g.oppStr)));
  const nOpp = weighted.length;
  const shrink = nOpp ? shrinkFactor(nOpp, early) : 0;
  let adjGf = rawGf;
  let adjGa = rawGa;
  let adjO25 = rawO25;
  if (nOpp && rawGf != null) {
    let gfSum = 0;
    let gaSum = 0;
    let oSum = 0;
    for (const g of weighted) {
      const c = adjustContribution(g.gf, g.ga, g.oppStr);
      gfSum += c.gf;
      gaSum += c.ga;
      const wO = weightGf(g.oppStr);
      oSum += (Number(g.gf) + Number(g.ga) >= 3 ? 1 : 0) * wO;
    }
    const liftedGf = gfSum / nOpp;
    const liftedGa = gaSum / nOpp;
    const oDen = weighted.reduce((s, g) => s + weightGf(g.oppStr), 0) || 1;
    const liftedO = oSum / oDen;
    adjGf = shrinkTowardRaw(rawGf, liftedGf, nOpp, early);
    adjGa = shrinkTowardRaw(rawGa, liftedGa, nOpp, early);
    adjO25 = shrinkTowardRaw(rawO25, liftedO, nOpp, early);
  }
  const split = (venue) => {
    const rawList = usable.filter(g => g.venue === venue);
    const wList = weighted.filter(g => g.venue === venue);
    if (rawList.length < 2) return null;
    const rGf = avg(rawList.map(g => Number(g.gf)));
    const rGa = avg(rawList.map(g => Number(g.ga)));
    if (wList.length < 2) return { n: rawList.length, rawGf: round2(rGf), rawGa: round2(rGa), adjGf: round2(rGf), adjGa: round2(rGa) };
    let gfSum = 0;
    let gaSum = 0;
    for (const g of wList) {
      const c = adjustContribution(g.gf, g.ga, g.oppStr);
      gfSum += c.gf;
      gaSum += c.ga;
    }
    const localShrink = shrinkFactor(wList.length, early);
    return {
      n: rawList.length,
      nOpp: wList.length,
      rawGf: round2(rGf),
      rawGa: round2(rGa),
      adjGf: round2(rGf + (gfSum / wList.length - rGf) * localShrink),
      adjGa: round2(rGa + (gaSum / wList.length - rGa) * localShrink),
    };
  };
  return {
    n,
    nOpp,
    early: !!early,
    shrink: Math.round(shrink * 1000) / 1000,
    rawGf: round2(rawGf),
    rawGa: round2(rawGa),
    adjGf: round2(adjGf),
    adjGa: round2(adjGa),
    rawO25: round2(rawO25),
    adjO25: round2(adjO25),
    home: split('home'),
    away: split('away'),
  };
}

function seasonStartIso(league, now = new Date()) {
  const y = now.getFullYear();
  const month = now.getMonth() + 1;
  if (/中超|中甲|日职|韩职|澳超|美职/.test(String(league || ''))) {
    const startYear = month >= 2 ? y : y - 1;
    return `${startYear}-02-01`;
  }
  const startYear = month >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
}

function parseScoreRow(row) {
  if (!row) return null;
  if (row.homeScore != null && row.awayScore != null) {
    const h = Number(row.homeScore);
    const a = Number(row.awayScore);
    if (Number.isFinite(h) && Number.isFinite(a)) return { h, a };
  }
  const m = String(row.ft || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
  if (!m) return null;
  return { h: Number(m[1]), a: Number(m[2]) };
}

function eloFromResults(matches, { homeEdge = HOME_EDGE } = {}) {
  const elo = new Map();
  const games = new Map();
  const get = (id) => (elo.has(id) ? elo.get(id) : ELO_BASE);
  for (const m of matches || []) {
    if (m.homeId == null || m.awayId == null) continue;
    const hg = Number(m.homeGoals);
    const ag = Number(m.awayGoals);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const hid = String(m.homeId);
    const aid = String(m.awayId);
    const h = get(hid);
    const a = get(aid);
    const expH = 1 / (1 + 10 ** ((a - (h + homeEdge)) / ELO_SCALE));
    const scoreH = hg > ag ? 1 : hg < ag ? 0 : 0.5;
    elo.set(hid, h + ELO_K * (scoreH - expH));
    elo.set(aid, a + ELO_K * ((1 - scoreH) - (1 - expH)));
    games.set(hid, (games.get(hid) || 0) + 1);
    games.set(aid, (games.get(aid) || 0) + 1);
  }
  return { elo, games };
}

function eloPercentile(eloMap, gamesMap, teamId) {
  const id = String(teamId);
  if ((gamesMap.get(id) || 0) < ELO_MIN_GAMES) return null;
  if (!eloMap.has(id)) return null;
  const vals = [];
  for (const [k, v] of eloMap) {
    if ((gamesMap.get(k) || 0) >= 4) vals.push(v);
  }
  if (vals.length < 4) return null;
  const mine = eloMap.get(id);
  const below = vals.filter(v => v < mine).length;
  return below / (vals.length - 1);
}

function buildLeagueIndex(rows, league, now = new Date(), roundsPlayed) {
  const focus = String(league || '');
  const start = seasonStartIso(focus, now);
  const prevStart = `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`;
  const chrono = [];
  const priorAcc = new Map();
  const seasonGames = new Map();
  const seasonOpps = new Map();
  let maxGames = 0;
  for (const r of rows || []) {
    if (!r || String(r.league || '') !== focus) continue;
    const date = String(r.matchDate || r.date || '');
    const sc = parseScoreRow(r);
    if (!sc || !date) continue;
    const hid = String(r.homeTeamId || '');
    const aid = String(r.awayTeamId || '');
    if (!hid || !aid) continue;
    if (date >= prevStart && date < start) {
      const add = (id, gf, ga) => {
        const cur = priorAcc.get(id) || { id, pts: 0, g: 0 };
        cur.g += 1;
        cur.pts += gf > ga ? 3 : gf === ga ? 1 : 0;
        priorAcc.set(id, cur);
      };
      add(hid, sc.h, sc.a);
      add(aid, sc.a, sc.h);
    }
    if (date >= start) {
      chrono.push({ date, homeId: hid, awayId: aid, homeGoals: sc.h, awayGoals: sc.a });
      for (const [id, opp] of [[hid, aid], [aid, hid]]) {
        seasonGames.set(id, (seasonGames.get(id) || 0) + 1);
        if (!seasonOpps.has(id)) seasonOpps.set(id, new Set());
        seasonOpps.get(id).add(opp);
      }
    }
  }
  chrono.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const { elo, games } = eloFromResults(chrono, { homeEdge: HOME_EDGE });
  for (const n of seasonGames.values()) maxGames = Math.max(maxGames, n);
  const priorList = [...priorAcc.values()].filter(t => t.g >= 8).map(t => ({ ...t, ppg: t.pts / t.g }));
  priorList.sort((a, b) => b.ppg - a.ppg || b.pts - a.pts);
  const prior = new Map();
  const nPrior = priorList.length;
  priorList.forEach((t, i) => {
    prior.set(t.id, nPrior <= 1 ? 0.5 : (nPrior - 1 - i) / (nPrior - 1));
  });
  const leagueSize = leagueSizeOf(focus, seasonGames.size);
  const rounds = roundsPlayed != null && Number.isFinite(Number(roundsPlayed))
    ? Number(roundsPlayed)
    : maxGames;
  const seasonEarly = rounds <= EARLY_ROUNDS;
  return {
    league: focus,
    seasonStart: start,
    maxGames,
    rounds,
    leagueSize,
    seasonEarly,
    earlyLeague: seasonEarly,
    prior,
    elo,
    eloGames: games,
    seasonOpps,
  };
}

function tablePctByName(tableRows, name) {
  const rows = tableRows || [];
  if (!rows.length || !name) return null;
  const want = String(name).trim();
  const row = rows.find(r => r && (r.teamZh === want || r.team === want || r.name === want));
  if (!row || row.rank == null) return null;
  return percentileFromRank(row.rank, rows.length);
}

function oppPercentileForGame(game, teamId, index, tableRows, early) {
  const isHome = String(game.homeTeamId) === String(teamId);
  const isAway = String(game.awayTeamId) === String(teamId);
  if (!isHome && !isAway) return null;
  const oppId = String(isHome ? game.awayTeamId : game.homeTeamId || '');
  const oppName = isHome ? game.away : game.home;
  const sampleLeague = String(game.league || index.league || '');
  const focus = index.league;
  const same = sampleLeague === focus;
  let raw = null;
  let source = 'none';
  if (same) {
    const eloPct = eloPercentile(index.elo, index.eloGames, oppId);
    const eloGames = index.eloGames.get(oppId) || 0;
    const prior = index.prior.get(oppId);
    const tablePct = tablePctByName(tableRows, oppName);
    const blended = blendOppStr({
      early, prior: prior == null ? null : prior, tablePct, eloPct, eloGames,
    });
    raw = blended.oppStr;
    source = blended.source;
  } else if (isCup(sampleLeague)) {
    const prior = index.prior.get(oppId);
    const eloPct = eloPercentile(index.elo, index.eloGames, oppId);
    raw = eloPct != null ? eloPct : (prior == null ? null : prior);
    source = 'cup';
  } else if (isLowerTier(sampleLeague)) {
    raw = null;
    source = 'lower';
  }
  if (raw == null) return { oppStr: null, source };
  const ctx = contextualOppStr(raw, { sampleLeague, focusLeague: focus });
  return { oppStr: ctx, source: ctx == null ? 'cross' : source };
}

function gamesFromForm(form, teamId, index, tableRows, early) {
  const out = [];
  for (const row of (form && form.matches) || []) {
    const sc = parseScoreRow(row);
    if (!sc) continue;
    const isHome = String(row.homeTeamId) === String(teamId);
    const isAway = String(row.awayTeamId) === String(teamId);
    if (!isHome && !isAway) continue;
    const looked = index
      ? oppPercentileForGame(row, teamId, index, tableRows, early)
      : { oppStr: row.oppStr == null ? null : Number(row.oppStr), source: 'given' };
    out.push({
      gf: isHome ? sc.h : sc.a,
      ga: isHome ? sc.a : sc.h,
      venue: isHome ? 'home' : 'away',
      oppStr: looked.oppStr,
      source: looked.source,
      league: row.league || '',
    });
  }
  return out;
}

function sideEarly(index, teamId, leagueEarly) {
  if (leagueEarly) return true;
  if (!index) return false;
  const opps = index.seasonOpps.get(String(teamId));
  const n = opps ? opps.size : 0;
  return isEarlySeason({
    roundsPlayed: null,
    leagueSize: index.leagueSize,
    oppSample: n,
  });
}

function calibNote({ seasonEarly, early, source, nOpp }) {
  if (!nOpp) return '同联赛对手对不上，近况先按原始进球。';
  if (seasonEarly && source === 'prior') return '赛季还早，对手强弱主要看上赛季名次，校准往原始进球收了一截。';
  if (seasonEarly) return '赛季还早，校准往原始进球收了一截。';
  if (nOpp < THIN_N || early) return '对手样本还少，校准只轻轻动了一点。';
  if (source === 'elo') return '对手强弱按本赛季胜负来估，不再只看开季积分榜。';
  if (source === 'prior') return '本赛季胜负还不够稳，对手强弱沿用上赛季名次。';
  return '已按同联赛对手强弱校正近期进球。';
}

function dominantSource(games) {
  const counts = {};
  for (const g of games || []) {
    if (g.oppStr == null) continue;
    const k = g.source || 'none';
    counts[k] = (counts[k] || 0) + 1;
  }
  let best = 'none';
  let n = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > n) { best = k; n = c; }
  }
  return best;
}

/**
 * Calibrate both sides from recent form.
 * rows: local 完场 (same league names). tableRows: current focus-league table, optional.
 */
function calibrateMatchForm({
  homeForm, awayForm, homeId, awayId, focusLeague, rows, tableRows, now, roundsPlayed,
} = {}) {
  const index = buildLeagueIndex(rows || [], focusLeague || '', now || new Date(), roundsPlayed);
  const leagueEarly = !!index.earlyLeague;
  const homeEarly = sideEarly(index, homeId, leagueEarly);
  const awayEarly = sideEarly(index, awayId, leagueEarly);
  const homeGames = gamesFromForm(homeForm, homeId, rows && rows.length ? index : null, tableRows, homeEarly);
  const awayGames = gamesFromForm(awayForm, awayId, rows && rows.length ? index : null, tableRows, awayEarly);
  const home = calibrateSide(homeGames, { early: homeEarly });
  const away = calibrateSide(awayGames, { early: awayEarly });
  const source = dominantSource(homeGames.concat(awayGames));
  const early = homeEarly || awayEarly;
  const nOpp = Math.max(home.nOpp || 0, away.nOpp || 0);
  const note = calibNote({
    seasonEarly: !!index.seasonEarly,
    early,
    source,
    nOpp: home.nOpp + away.nOpp,
  });
  const ok = !!(home.n || away.n);
  return {
    ok,
    early,
    source,
    leagueSize: index.leagueSize,
    maxRounds: index.maxGames,
    note: ok ? note : '',
    home,
    away,
  };
}

function poissonPmf(k, lambda) {
  const lam = Math.max(0.05, Number(lambda) || 0.05);
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

function over25Prob(lambda) {
  let under = 0;
  for (let k = 0; k <= 2; k++) under += poissonPmf(k, lambda);
  return Math.max(0, Math.min(1, 1 - under));
}

function wdlProbs(expHome, expAway) {
  const eh = Math.max(0.2, Number(expHome) || 1.2);
  const ea = Math.max(0.2, Number(expAway) || 1.2);
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  const maxG = 8;
  for (let h = 0; h <= maxG; h++) {
    for (let a = 0; a <= maxG; a++) {
      const p = poissonPmf(h, eh) * poissonPmf(a, ea);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  const s = pHome + pDraw + pAway || 1;
  return { h: pHome / s, d: pDraw / s, a: pAway / s };
}

function handicapWdl(expHome, expAway, homeLine) {
  const eh = Math.max(0.2, Number(expHome) || 1.2);
  const ea = Math.max(0.2, Number(expAway) || 1.2);
  const line = Number(homeLine);
  if (!Number.isFinite(line)) return null;
  const intLine = Math.round(line);
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  const maxG = 8;
  for (let h = 0; h <= maxG; h++) {
    for (let a = 0; a <= maxG; a++) {
      const p = poissonPmf(h, eh) * poissonPmf(a, ea);
      const adj = h + intLine - a;
      if (adj > 0) pHome += p;
      else if (adj < 0) pAway += p;
      else pDraw += p;
    }
  }
  const s = pHome + pDraw + pAway || 1;
  return {
    h: pHome / s,
    d: pDraw / s,
    a: pAway / s,
    line: intLine,
    lineRaw: line,
  };
}

function pickRate(side, key) {
  if (!side) return null;
  if (key === 'gf') return side.adjGf != null ? side.adjGf : side.rawGf;
  return side.adjGa != null ? side.adjGa : side.rawGa;
}

function expectedGoals(calib) {
  if (!calib || !calib.home || !calib.away) return null;
  const h = calib.home;
  const a = calib.away;
  const hGf = (h.home && h.home.adjGf != null) ? h.home.adjGf : pickRate(h, 'gf', null);
  const hGa = (h.home && h.home.adjGa != null) ? h.home.adjGa : pickRate(h, 'ga', null);
  const aGf = (a.away && a.away.adjGf != null) ? a.away.adjGf : pickRate(a, 'gf', null);
  const aGa = (a.away && a.away.adjGa != null) ? a.away.adjGa : pickRate(a, 'ga', null);
  if (hGf == null || aGf == null) return null;
  const expH = (hGf + (aGa != null ? aGa : (a.adjGa != null ? a.adjGa : hGf))) / 2;
  const expA = (aGf + (hGa != null ? hGa : (h.adjGa != null ? h.adjGa : aGf))) / 2;
  return {
    expH: Math.max(0.2, expH),
    expA: Math.max(0.2, expA),
  };
}

/** Small 1x2 nudge from adjusted goal difference. Trust under 0.4 stays out of the lean. */
function stanceNudge(calib) {
  if (!calib || !calib.home || !calib.away) return 0;
  const trust = Math.min(calib.home.shrink || 0, calib.away.shrink || 0);
  if (!(trust >= 0.2)) return 0;
  if (calib.home.adjGf == null || calib.away.adjGf == null) return 0;
  const hNet = calib.home.adjGf - (calib.home.adjGa || 0);
  const aNet = calib.away.adjGf - (calib.away.adjGa || 0);
  const edge = hNet - aNet;
  if (edge >= 0.35) return 0.35 * trust;
  if (edge <= -0.35) return -0.35 * trust;
  return 0;
}

module.exports = {
  EARLY_ROUNDS,
  THIN_N,
  HOME_EDGE,
  TABLE_WEIGHT_EARLY,
  EARLY_SHRINK,
  isCup,
  isLowerTier,
  isEarlySeason,
  percentileFromRank,
  percentileFromPpg,
  priorStrength,
  blendOppStr,
  contextualOppStr,
  weightGf,
  weightGa,
  adjustContribution,
  shrinkFactor,
  shrinkTowardRaw,
  calibrateSide,
  seasonStartIso,
  eloFromResults,
  eloPercentile,
  buildLeagueIndex,
  calibrateMatchForm,
  poissonPmf,
  over25Prob,
  wdlProbs,
  handicapWdl,
  expectedGoals,
  stanceNudge,
  calibNote,
};
