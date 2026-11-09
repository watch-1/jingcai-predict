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
 * - for a league fixture, league games are the backbone of λ
 * - UCL / UEL / UECL is a separate “对强队”信号, by opponent tier, not by raw scoreline
 * - cups stay secondary; a different top league is left out
 * - recent ~10 games outweigh older ones; last season only fills a short current season
 * - home/away rates are used only when that side has enough games
 */
'use strict';

const teamNames = require('./team-names');

const EARLY_ROUNDS = 8;
const THIN_N = 5;
const HOME_EDGE = 70;
const ELO_K = 20;
const ELO_BASE = 1500;
const ELO_SCALE = 400;
const ELO_MIN_GAMES = 6;
const TABLE_WEIGHT_EARLY = 0.1;
const EARLY_SHRINK = 0.35;
const FORM_RECENT = 10;
const MIN_VENUE_N = 6;
const PREV_SEASON_W = 0.42;
const OLDER_W = 0.5;
const EURO_BLEND = 0.22;
const CUP_BLEND = 0.12;
const RES_CAP = 1.1;

// Today's A-vs-B strength gap, applied after the attack×defense cross average.
// Schedule oppStr already lives inside adj*; this knob only compares the two
// sides that are about to play. STRENGTH_GAP_NUDGE=0 turns it off.
// Amplitude: max ±8% scale, then ±0.12 per side and ±0.15 on the total.
const STRENGTH_GA_REF = 1.3;
const STRENGTH_GAP_AMP = 0.08;
const STRENGTH_GAP_WIDTH = 0.9;
const STRENGTH_GAP_DEAD = 0.08;
const STRENGTH_GAP_SIDE_CAP = 0.12;
const STRENGTH_GAP_TOTAL_CAP = 0.15;

const LEAGUE_SIZE = {
  英超: 20, 西甲: 20, 意甲: 20, 法甲: 18, 德甲: 18, 荷甲: 18, 葡超: 18,
  英冠: 24, 中超: 16, 日职: 18, 韩职: 12, 挪超: 16, 瑞超: 16, 丹超: 12, 芬超: 12,
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
  return /杯|欧冠|欧罗巴|欧联|欧协|亚冠|洲际|世俱|champions league|europa league|conference league/i.test(String(name || ''));
}

function isEuropeComp(name) {
  return /欧冠|欧罗巴|欧联|欧协|champions league|europa league|conference league/i.test(String(name || ''));
}

const LEAGUE_ALIAS = [
  [/挪超|挪威超|挪威超级|eliteserien/i, '挪超'],
  [/瑞超|全瑞典|allsvenskan/i, '瑞超'],
  [/丹超|丹麦超|superligaen|danish superliga/i, '丹超'],
  [/芬超|veikkausliiga/i, '芬超'],
  [/英超|english premier league/i, '英超'],
  [/西甲|la ?liga|laliga/i, '西甲'],
  [/奥甲|austrian bundesliga/i, '奥甲'],
  [/德甲|german bundesliga|^bundesliga$/i, '德甲'],
  [/意甲|serie a/i, '意甲'],
  [/法甲|ligue 1/i, '法甲'],
  [/荷甲|eredivisie/i, '荷甲'],
  [/葡超|primeira/i, '葡超'],
  [/比甲|belgian|jupiler/i, '比甲'],
  [/苏超|scottish premiership/i, '苏超'],
  [/土超|turkish super lig/i, '土超'],
  [/瑞士超|swiss super league/i, '瑞士超'],
  [/欧冠|champions league/i, '欧冠'],
  [/欧协|conference league/i, '欧协联'],
  [/欧罗巴|欧联|europa league/i, '欧联'],
];

function canonLeague(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  for (const [re, key] of LEAGUE_ALIAS) if (re.test(s)) return key;
  return s;
}

function sameLeague(a, b) {
  const ca = canonLeague(a);
  const cb = canonLeague(b);
  return !!(ca && cb && ca === cb);
}

/** Recent 10 stay at 1. Last season stays under a current-season game, even an older one. */
function sampleWeight(index, season) {
  const recency = index < FORM_RECENT ? 1 : OLDER_W;
  const seasonW = season === 'prev' ? PREV_SEASON_W : 1;
  return recency * seasonW;
}

function gameWeight(g) {
  const w = Number(g && g.weight);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function seasonTag(row, focus, now) {
  if (row && (row.season === 'prev' || row.season === 'current')) return row.season;
  const date = String((row && (row.date || row.matchDate)) || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return 'current';
  const start = seasonStartIso((row && row.league) || focus || '', now || new Date());
  return date.slice(0, 10) < start ? 'prev' : 'current';
}

function competitionBucket(league, focus) {
  const sample = String(league || '');
  const foc = String(focus || '');
  const focusIsLeague = !!(foc && !isEuropeComp(foc) && !isCup(foc));
  if (!focusIsLeague) return 'league';
  if (isEuropeComp(sample)) return 'europe';
  if (isCup(sample) || isLowerTier(sample)) return 'cup';
  if (!sample || sameLeague(sample, foc)) return 'league';
  return 'other';
}

function expectVsTier(tier) {
  const t = Math.max(0.15, Math.min(1, Number(tier) || 0.5));
  return {
    gf: 1.35 - (t - 0.5) * 1.2,
    ga: 1.35 + (t - 0.5) * 1.4,
  };
}

function europeTier(g) {
  const name = String((g && g.league) || '');
  let base = 0.72;
  if (/欧冠|champions league/i.test(name)) base = 0.88;
  else if (/欧协|conference/i.test(name)) base = 0.7;
  else if (/欧罗巴|欧联|europa league/i.test(name)) base = 0.78;
  let tier = base;
  if (g && g.oppStr != null && Number.isFinite(Number(g.oppStr))) {
    tier = base * 0.62 + Number(g.oppStr) * 0.38;
  }
  return Math.max(0.35, Math.min(0.98, tier));
}

function cupTier(g) {
  if (g && g.oppStr != null && Number.isFinite(Number(g.oppStr))) {
    return Math.max(0.2, Math.min(0.9, Number(g.oppStr)));
  }
  return 0.5;
}

function residualBlend(backboneGf, backboneGa, games, tierFn, blend) {
  if (!games || !games.length || backboneGf == null || backboneGa == null) {
    return { gf: backboneGf, ga: backboneGa };
  }
  let gfR = 0;
  let gaR = 0;
  let w = 0;
  for (const g of games) {
    const exp = expectVsTier(tierFn(g));
    const wt = gameWeight(g);
    gfR += clampNum(Number(g.gf) - exp.gf, -RES_CAP, RES_CAP) * wt;
    gaR += clampNum(Number(g.ga) - exp.ga, -RES_CAP, RES_CAP) * wt;
    w += wt;
  }
  if (!w) return { gf: backboneGf, ga: backboneGa };
  return {
    gf: backboneGf + blend * (gfR / w),
    ga: backboneGa + blend * (gaR / w),
  };
}

function anchorGame(g) {
  const bucket = g && g.bucket;
  if (bucket !== 'europe' && bucket !== 'cup') return g;
  const exp = expectVsTier(bucket === 'europe' ? europeTier(g) : cupTier(g));
  return {
    ...g,
    gf: exp.gf + clampNum(Number(g.gf) - exp.gf, -RES_CAP, RES_CAP),
    ga: exp.ga + clampNum(Number(g.ga) - exp.ga, -RES_CAP, RES_CAP),
  };
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
  const same = sameLeague(sample, focus);
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

function wavg(items, pick) {
  let s = 0;
  let w = 0;
  for (const g of items) {
    const v = Number(pick(g));
    if (!Number.isFinite(v)) continue;
    const wt = gameWeight(g);
    s += v * wt;
    w += wt;
  }
  return w ? s / w : null;
}

/**
 * games: [{ gf, ga, oppStr|null, venue, weight?, bucket?, season? }]
 * League games (or untagged games) are the mean. European and cup games
 * nudge that mean by how far the score sat from the opponent's tier.
 * Untagged games keep the previous equal-weight path.
 */
function calibrateSide(games, { early = false } = {}) {
  const usable = (games || []).filter(g => g && Number.isFinite(Number(g.gf)) && Number.isFinite(Number(g.ga)));
  const tagged = usable.some(g => g.bucket);
  const league = usable.filter(g => (g.bucket || 'league') === 'league');
  const europe = usable.filter(g => g.bucket === 'europe');
  const cup = usable.filter(g => g.bucket === 'cup');
  let backbone = usable;
  let mixEuro = [];
  let mixCup = [];
  if (tagged && league.length) {
    backbone = league;
    mixEuro = europe;
    mixCup = cup;
  } else if (tagged && !league.length) {
    backbone = usable.filter(g => g.bucket !== 'other').map(anchorGame);
  }
  const n = usable.length;
  const rawGf = wavg(backbone, g => g.gf);
  const rawGa = wavg(backbone, g => g.ga);
  const rawO25 = wavg(backbone, g => (Number(g.gf) + Number(g.ga) >= 3 ? 1 : 0));
  const weighted = backbone.filter(g => g.oppStr != null && Number.isFinite(Number(g.oppStr)));
  const nOpp = weighted.length;
  const shrink = nOpp ? shrinkFactor(nOpp, early) : 0;
  let adjGf = rawGf;
  let adjGa = rawGa;
  let adjO25 = rawO25;
  if (nOpp && rawGf != null) {
    let gfSum = 0;
    let gaSum = 0;
    let oSum = 0;
    let wSum = 0;
    let oDen = 0;
    for (const g of weighted) {
      const wt = gameWeight(g);
      const c = adjustContribution(g.gf, g.ga, g.oppStr);
      gfSum += c.gf * wt;
      gaSum += c.ga * wt;
      wSum += wt;
      const wO = weightGf(g.oppStr);
      oSum += (Number(g.gf) + Number(g.ga) >= 3 ? 1 : 0) * wO * wt;
      oDen += wO * wt;
    }
    const liftedGf = gfSum / (wSum || 1);
    const liftedGa = gaSum / (wSum || 1);
    const liftedO = oSum / (oDen || 1);
    adjGf = shrinkTowardRaw(rawGf, liftedGf, nOpp, early);
    adjGa = shrinkTowardRaw(rawGa, liftedGa, nOpp, early);
    adjO25 = shrinkTowardRaw(rawO25, liftedO, nOpp, early);
  }
  if (mixEuro.length && adjGf != null) {
    const b = residualBlend(adjGf, adjGa, mixEuro, europeTier, EURO_BLEND);
    adjGf = b.gf;
    adjGa = b.ga;
  }
  if (mixCup.length && adjGf != null) {
    const b = residualBlend(adjGf, adjGa, mixCup, cupTier, CUP_BLEND);
    adjGf = b.gf;
    adjGa = b.ga;
  }
  const split = (venue) => {
    const rawList = backbone.filter(g => g.venue === venue);
    const wList = weighted.filter(g => g.venue === venue);
    if (rawList.length < MIN_VENUE_N) return null;
    const rGf = wavg(rawList, g => g.gf);
    const rGa = wavg(rawList, g => g.ga);
    let sGf = rGf;
    let sGa = rGa;
    if (wList.length >= 2 && rGf != null) {
      let gfSum = 0;
      let gaSum = 0;
      let wSum = 0;
      for (const g of wList) {
        const wt = gameWeight(g);
        const c = adjustContribution(g.gf, g.ga, g.oppStr);
        gfSum += c.gf * wt;
        gaSum += c.ga * wt;
        wSum += wt;
      }
      const localShrink = shrinkFactor(wList.length, early);
      sGf = rGf + (gfSum / (wSum || 1) - rGf) * localShrink;
      sGa = rGa + (gaSum / (wSum || 1) - rGa) * localShrink;
    }
    const euroV = mixEuro.filter(g => g.venue === venue);
    const cupV = mixCup.filter(g => g.venue === venue);
    if (euroV.length) {
      const b = residualBlend(sGf, sGa, euroV, europeTier, EURO_BLEND);
      sGf = b.gf;
      sGa = b.ga;
    }
    if (cupV.length) {
      const b = residualBlend(sGf, sGa, cupV, cupTier, CUP_BLEND);
      sGf = b.gf;
      sGa = b.ga;
    }
    return {
      n: rawList.length,
      nOpp: wList.length,
      rawGf: round2(rGf),
      rawGa: round2(rGa),
      adjGf: round2(sGf),
      adjGa: round2(sGa),
    };
  };
  return {
    n,
    nLeague: backbone.length,
    nEuro: mixEuro.length,
    nCup: mixCup.length,
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
  // Spring-autumn leagues. Danish Superliga and the big-5 stay on the July cut below.
  if (/中超|中甲|日职|韩职|澳超|美职|挪超|挪威|瑞超|瑞典|芬超|芬兰|eliteserien|allsvenskan|veikkausliiga/i.test(String(league || ''))) {
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
  const byName = new Map();
  let maxGames = 0;
  const remember = (name, id) => {
    if (!id) return;
    for (const k of teamNames.keysFor(name)) {
      if (k && !byName.has(k)) byName.set(k, String(id));
    }
  };
  for (const r of rows || []) {
    const lg = String((r && r.league) || '');
    if (!r || (lg !== focus && canonLeague(lg) !== canonLeague(focus))) continue;
    remember(r.home, r.homeTeamId);
    remember(r.away, r.awayTeamId);
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
    byName,
  };
}

function findTableRow(tableRows, name) {
  const rows = tableRows || [];
  if (!rows.length || !name) return null;
  const want = String(name).trim();
  const exact = rows.find(r => r && (r.teamZh === want || r.team === want || r.name === want || r.teamEn === want));
  if (exact) return exact;
  return rows.find(r => r && [r.teamZh, r.team, r.name, r.teamEn].some(n => n && teamNames.namesMatch(n, want))) || null;
}

function tablePctByName(tableRows, name) {
  const rows = tableRows || [];
  const row = findTableRow(rows, name);
  if (!row || row.rank == null) return null;
  return percentileFromRank(row.rank, rows.length);
}

function oppPercentileForGame(game, teamId, index, tableRows, early) {
  const isHome = String(game.homeTeamId) === String(teamId);
  const isAway = String(game.awayTeamId) === String(teamId);
  if (!isHome && !isAway) return null;
  let oppId = String(isHome ? game.awayTeamId : game.homeTeamId || '');
  const oppName = isHome ? game.away : game.home;
  if (!oppId && index.byName && oppName) {
    for (const k of teamNames.keysFor(oppName)) {
      if (index.byName.has(k)) { oppId = index.byName.get(k); break; }
    }
  }
  const sampleLeague = String(game.league || index.league || '');
  const focus = index.league;
  const same = sameLeague(sampleLeague, focus);
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
  } else if (isEuropeComp(sampleLeague) || isCup(sampleLeague)) {
    const tablePct = tablePctByName(tableRows, oppName);
    const eloPct = oppId ? eloPercentile(index.elo, index.eloGames, oppId) : null;
    const prior = oppId ? index.prior.get(oppId) : undefined;
    raw = eloPct != null ? eloPct : (prior != null ? prior : tablePct);
    source = isEuropeComp(sampleLeague) ? 'europe' : 'cup';
  } else if (isLowerTier(sampleLeague)) {
    raw = null;
    source = 'lower';
  }
  if (raw == null) return { oppStr: null, source };
  const ctx = contextualOppStr(raw, { sampleLeague, focusLeague: focus });
  return { oppStr: ctx, source: ctx == null ? 'cross' : source };
}

function gamesFromForm(form, teamId, index, tableRows, early, focusLeague, now) {
  const focus = focusLeague || (index && index.league) || '';
  const rows = ((form && form.matches) || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const out = [];
  let idx = 0;
  for (const row of rows) {
    const sc = parseScoreRow(row);
    if (!sc) continue;
    const isHome = String(row.homeTeamId) === String(teamId);
    const isAway = String(row.awayTeamId) === String(teamId);
    if (!isHome && !isAway) continue;
    const bucket = row.bucket || competitionBucket(row.league, focus);
    const season = seasonTag(row, focus, now);
    const weight = row.weight != null ? Number(row.weight) : sampleWeight(idx, season);
    idx += 1;
    if (bucket === 'other') continue;
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
      bucket,
      season,
      weight,
    });
  }
  return out;
}

function resolveLeagueEarly(index, roundsPlayed, tableRows) {
  if (roundsPlayed != null && Number.isFinite(Number(roundsPlayed))) {
    return Number(roundsPlayed) <= EARLY_ROUNDS;
  }
  const rows = tableRows || [];
  if (rows.length >= 8) {
    const played = rows.map(r => Number(r && r.played)).filter(n => Number.isFinite(n) && n >= 0);
    if (played.length >= 8) {
      played.sort((a, b) => a - b);
      return played[Math.floor((played.length - 1) / 2)] <= EARLY_ROUNDS;
    }
  }
  return !!(index && index.earlyLeague);
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

function calibNote({ seasonEarly, early, source, nOpp, nEuro, nCup }) {
  let note;
  if (!nOpp) note = '同联赛对手对不上，近况先按原始进球。';
  else if (seasonEarly && source === 'prior') note = '赛季还早，对手强弱主要看上赛季名次，校准往原始进球收了一截。';
  else if (seasonEarly) note = '赛季还早，校准往原始进球收了一截。';
  else if (nOpp < THIN_N || early) note = '对手样本还少，校准只轻轻动了一点。';
  else if (source === 'elo') note = '对手强弱按本赛季胜负来估，不再只看开季积分榜。';
  else if (source === 'prior') note = '本赛季胜负还不够稳，对手强弱沿用上赛季名次。';
  else note = '已按同联赛对手强弱校正近期进球。';
  if (nEuro) note += '欧战按对手强弱另算，不把大比分直接算进联赛场均。';
  if (nCup) note += '杯赛只作辅助，不单独决定进球。';
  return note;
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
  const leagueEarly = resolveLeagueEarly(index, roundsPlayed, tableRows);
  const homeEarly = sideEarly(index, homeId, leagueEarly);
  const awayEarly = sideEarly(index, awayId, leagueEarly);
  const indexOrNull = ((rows && rows.length) || (tableRows && tableRows.length)) ? index : null;
  const homeGames = gamesFromForm(homeForm, homeId, indexOrNull, tableRows, leagueEarly, focusLeague, now);
  const awayGames = gamesFromForm(awayForm, awayId, indexOrNull, tableRows, leagueEarly, focusLeague, now);
  const home = calibrateSide(homeGames, { early: homeEarly });
  const away = calibrateSide(awayGames, { early: awayEarly });
  const source = dominantSource(homeGames.concat(awayGames));
  const early = homeEarly || awayEarly;
  const nOpp = Math.max(home.nOpp || 0, away.nOpp || 0);
  const note = calibNote({
    seasonEarly: leagueEarly,
    early,
    source,
    nOpp: home.nOpp + away.nOpp,
    nEuro: (home.nEuro || 0) + (away.nEuro || 0),
    nCup: (home.nCup || 0) + (away.nCup || 0),
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

function venueSplit(split) {
  if (!split || split.adjGf == null) return null;
  if (split.n != null && Number(split.n) < MIN_VENUE_N) return null;
  return split;
}

function pickRate(side, key) {
  if (!side) return null;
  if (key === 'gf') return side.adjGf != null ? side.adjGf : side.rawGf;
  return side.adjGa != null ? side.adjGa : side.rawGa;
}

function strengthGapEnabled() {
  const v = process.env.STRENGTH_GAP_NUDGE;
  if (v == null || String(v).trim() === '') return true;
  return !/^(0|false|off|no)$/i.test(String(v).trim());
}

function clampNum(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** 50/50 blend of calibrated scoring and inverted conceded goals. REF cancels in the gap. */
function sideStrength(gf, ga) {
  return STRENGTH_GA_REF + 0.5 * (Number(gf) - Number(ga));
}

/**
 * Scale each side's λ by today's strength gap.
 * str = 1.30 + 0.5*(adjGf - adjGa), from the same home/away rates as the cross average.
 * gap = str_own - str_opp. |gap| <= DEAD → factor 1.
 * Otherwise factor = 1 ± AMP * tanh((|gap|-DEAD)/WIDTH):
 * weaker attack vs stronger opponent → λ down; stronger attack vs weaker opponent → λ up.
 * Per-side move capped at ±SIDE_CAP, total move at ±TOTAL_CAP.
 */
function scaleByStrengthGap(baseH, baseA, hGf, hGa, aGf, aGa) {
  const strH = sideStrength(hGf, hGa);
  const strA = sideStrength(aGf, aGa);
  const gap = strH - strA;
  let t = 0;
  if (Math.abs(gap) > STRENGTH_GAP_DEAD) {
    const signed = gap - Math.sign(gap) * STRENGTH_GAP_DEAD;
    t = Math.tanh(signed / STRENGTH_GAP_WIDTH);
  }
  const factorH = 1 + STRENGTH_GAP_AMP * t;
  const factorA = 1 - STRENGTH_GAP_AMP * t;
  let dH = clampNum(baseH * (factorH - 1), -STRENGTH_GAP_SIDE_CAP, STRENGTH_GAP_SIDE_CAP);
  let dA = clampNum(baseA * (factorA - 1), -STRENGTH_GAP_SIDE_CAP, STRENGTH_GAP_SIDE_CAP);
  const dTot = dH + dA;
  if (Math.abs(dTot) > STRENGTH_GAP_TOTAL_CAP) {
    const s = STRENGTH_GAP_TOTAL_CAP / Math.abs(dTot);
    dH *= s;
    dA *= s;
  }
  return {
    on: true,
    strH,
    strA,
    gap,
    factorH,
    factorA,
    expH: Math.max(0.2, baseH + dH),
    expA: Math.max(0.2, baseA + dA),
  };
}

function expectedGoals(calib) {
  if (!calib || !calib.home || !calib.away) return null;
  const h = calib.home;
  const a = calib.away;
  const homeSplit = venueSplit(h.home);
  const awaySplit = venueSplit(a.away);
  const hGf = homeSplit ? homeSplit.adjGf : pickRate(h, 'gf', null);
  const hGa = homeSplit ? homeSplit.adjGa : pickRate(h, 'ga', null);
  const aGf = awaySplit ? awaySplit.adjGf : pickRate(a, 'gf', null);
  const aGa = awaySplit ? awaySplit.adjGa : pickRate(a, 'ga', null);
  if (hGf == null || aGf == null) return null;
  const expH = (hGf + (aGa != null ? aGa : (a.adjGa != null ? a.adjGa : hGf))) / 2;
  const expA = (aGf + (hGa != null ? hGa : (h.adjGa != null ? h.adjGa : aGf))) / 2;
  const baseH = Math.max(0.2, expH);
  const baseA = Math.max(0.2, expA);
  const ratesKnown = hGa != null && aGa != null
    && Number.isFinite(Number(hGf)) && Number.isFinite(Number(hGa))
    && Number.isFinite(Number(aGf)) && Number.isFinite(Number(aGa));
  const nudged = (strengthGapEnabled() && ratesKnown)
    ? scaleByStrengthGap(baseH, baseA, hGf, hGa, aGf, aGa)
    : { on: false, strH: null, strA: null, gap: 0, factorH: 1, factorA: 1, expH: baseH, expA: baseA };
  const dH = nudged.expH - baseH;
  const dA = nudged.expA - baseA;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const r4 = (n) => (n == null || !Number.isFinite(n) ? n : Math.round(n * 10000) / 10000);
  return {
    expH: nudged.expH,
    expA: nudged.expA,
    baseH,
    baseA,
    strengthGap: {
      on: nudged.on,
      strH: nudged.strH == null ? null : r3(nudged.strH),
      strA: nudged.strA == null ? null : r3(nudged.strA),
      gap: r3(nudged.gap || 0),
      factorH: r4(nudged.factorH),
      factorA: r4(nudged.factorA),
      dH: r3(dH),
      dA: r3(dA),
      dTotal: r3(dH + dA),
    },
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
  STRENGTH_GA_REF,
  STRENGTH_GAP_AMP,
  STRENGTH_GAP_WIDTH,
  STRENGTH_GAP_DEAD,
  STRENGTH_GAP_SIDE_CAP,
  STRENGTH_GAP_TOTAL_CAP,
  isCup,
  isEuropeComp,
  isLowerTier,
  sameLeague,
  canonLeague,
  sampleWeight,
  competitionBucket,
  MIN_VENUE_N,
  FORM_RECENT,
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
