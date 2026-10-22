// 1.9.98: point-in-time backtest of the predict engine on data/history/results.jsonl
// + odds-history.jsonl (opening→closing). Outputs data/history/calibration.json.
// No leakage: form/h2h/rest use only matches dated strictly before the match date;
// market = closing 胜平负 odds (what the card shows at kickoff); movement = opening→closing.
'use strict';
const fs = require('fs'); const path = require('path');
const { DATA_DIR } = require('../lib/db');
const H = path.join(DATA_DIR, 'history');
const rows = fs.readFileSync(path.join(H, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse)
  .filter(r => r.oddsH > 1 && r.oddsD > 1 && r.oddsA > 1 && /^[HDA]$/.test(r.winFlag || ''))
  .sort((a, b) => (a.matchDate + a.matchNum).localeCompare(b.matchDate + b.matchNum));
const seen = new Set(); const uniq = [];
for (const r of rows) { if (seen.has(r.matchId)) continue; seen.add(r.matchId); uniq.push(r); }
const OH = new Map();
try { for (const l of fs.readFileSync(path.join(H, 'odds-history.jsonl'), 'utf8').split('\n')) if (l) { const j = JSON.parse(l); OH.set(String(j.matchId), j); } } catch (_) {}
const om = require('../lib/odds-movement');
const sig = require('../lib/signals');

const imp = (h, d, a) => { const s = 1 / h + 1 / d + 1 / a; return { h: 1 / h / s, d: 1 / d / s, a: 1 / a / s }; };
const order = p => ['h', 'd', 'a'].sort((x, y) => p[y] - p[x]);
const byTeam = new Map(); // teamId -> [{date, pts, gf, ga}]
const byPair = new Map();
const dayMs = d => Date.parse(d + 'T00:00:00Z');

const recs = [];
for (const r of uniq) {
  const ht = String(r.homeTeamId), at = String(r.awayTeamId);
  const hist = t => (byTeam.get(t) || []).filter(x => x.date < r.matchDate);
  const hh = hist(ht).slice(-5), ah = hist(at).slice(-5);
  let formLean = null;
  if (hh.length >= 3 && ah.length >= 3) {
    // normalise to 5-match points so sparse histories compare fairly
    const hp = hh.reduce((s, x) => s + x.pts, 0) * 5 / hh.length, ap = ah.reduce((s, x) => s + x.pts, 0) * 5 / ah.length;
    formLean = hp - ap >= 4 ? 'h' : ap - hp >= 4 ? 'a' : 'd';
  }
  const pk = [ht, at].sort().join('|');
  const meets = (byPair.get(pk) || []).filter(x => x.date < r.matchDate).slice(-6);
  let h2hLean = null;
  if (meets.length >= 3) {
    let hw = 0, aw = 0;
    for (const x of meets) { if (x.win === ht) hw++; else if (x.win === at) aw++; }
    h2hLean = hw >= aw + 2 ? 'h' : aw >= hw + 2 ? 'a' : 'd';
  }
  const lastH = hist(ht).slice(-1)[0], lastA = hist(at).slice(-1)[0];
  const restH = lastH ? (dayMs(r.matchDate) - dayMs(lastH.date)) / 864e5 : null;
  const restA = lastA ? (dayMs(r.matchDate) - dayMs(lastA.date)) / 864e5 : null;
  const p = imp(r.oddsH, r.oddsD, r.oddsA);
  const marketLean = order(p)[0];
  const oh = OH.get(String(r.matchId));
  const mv = oh ? om.summarize(oh) : null;
  const ctx = sig.contextFromRest({ restH, restA, league: r.league });
  recs.push({
    id: r.matchId, date: r.matchDate, league: r.league, res: r.winFlag.toLowerCase(),
    odds: { h: r.oddsH, d: r.oddsD, a: r.oddsA }, p, marketLean, formLean, h2hLean, mv, ctx,
  });
  const res = r.winFlag;
  const ptsH = res === 'H' ? 3 : res === 'D' ? 1 : 0, ptsA = res === 'A' ? 3 : res === 'D' ? 1 : 0;
  if (!byTeam.has(ht)) byTeam.set(ht, []); if (!byTeam.has(at)) byTeam.set(at, []);
  byTeam.get(ht).push({ date: r.matchDate, pts: ptsH }); byTeam.get(at).push({ date: r.matchDate, pts: ptsA });
  if (!byPair.has(pk)) byPair.set(pk, []);
  byPair.get(pk).push({ date: r.matchDate, win: res === 'H' ? ht : res === 'A' ? at : null });
}

// --- engine replicas ------------------------------------------------------
function engine(x, withNew) {
  let score = 0, dp = 1 - 0.3; // background ~1, injuries unknown -0.3
  if (x.formLean) { dp++; if (x.formLean === 'h') score += 1.2; else if (x.formLean === 'a') score -= 1.2; }
  if (x.h2hLean) { dp++; if (x.h2hLean === 'h') score += 0.6; else if (x.h2hLean === 'a') score -= 0.6; }
  dp += 0.8; score += x.marketLean === 'h' ? 0.9 : x.marketLean === 'a' ? -0.9 : 0.1;
  if (withNew) {
    const s = sig.scoreNewSignals({ movement: x.mv, context: x.ctx });
    score += s.delta; dp += s.dp;
  }
  const lean = score >= 0.45 ? 'h' : score <= -0.45 ? 'a' : 'd';
  const conflict = lean !== x.marketLean;
  let conf = 0.38 + Math.min(0.22, Math.max(0, dp) * 0.04) + Math.min(0.18, Math.abs(score) * 0.06);
  if (conflict) conf -= 0.08;
  if (!x.formLean) conf -= 0.05;
  conf -= 0.04; conf -= 0.02;
  conf = conf * 0.72 + Math.min(0.62, x.p[x.marketLean]) * 0.28;
  conf = Math.max(0.28, Math.min(0.78, conf));
  if (withNew) conf = Math.max(0.28, Math.min(0.78, conf + sig.movementConfAdj(x.mv, lean, x.marketLean)));
  const formMkt = x.formLean && x.formLean !== 'd' && x.formLean !== x.marketLean;
  const speak = conflict || formMkt || conf >= 0.62;
  return { lean, conf, speak, conflict };
}

const stakeOf = x => (x.stakeOdds != null ? x.stakeOdds : x.odds);
const roi = list => list.length ? list.reduce((s, x) => s + (x.hit ? stakeOf(x) - 1 : -1), 0) / list.length : null;
const rate = list => list.length ? list.filter(x => x.hit).length / list.length : null;
const stat = list => ({ n: list.length, hit: rate(list) == null ? null : +(rate(list) * 100).toFixed(1), roi: roi(list) == null ? null : +(roi(list) * 100).toFixed(1) });

const dates = [...new Set(recs.map(r => r.date))].sort();
const cut = dates[Math.floor(dates.length * 0.7)];
const out = { generatedAt: new Date().toISOString(), n: recs.length, range: [dates[0], dates[dates.length - 1]], splitDate: cut, withMovement: recs.filter(r => r.mv).length };

function evalModel(withNew) {
  return recs.map(x => { const e = engine(x, withNew); return { ...x, ...e, hit: e.lean === x.res, stakeOdds: x.odds[e.lean] }; });
}
const v197 = evalModel(false), v198 = evalModel(true);
const split = (L, f) => ({ train: stat(L.filter(x => x.date < cut && f(x))), test: stat(L.filter(x => x.date >= cut && f(x))), all: stat(L.filter(f)) });
out.market = split(recs.map(x => ({ ...x, hit: x.marketLean === x.res, odds: x.odds[x.marketLean] })), () => true);
out.v197 = { all: split(v197, () => true), speak: split(v197, x => x.speak) };
out.v198 = { all: split(v198, () => true), speak: split(v198, x => x.speak) };

// individual signals (hit rate when signal leans a side ≠ d)
const sigHit = (get) => { const L = recs.filter(x => { const k = get(x); return k && k !== 'd'; }).map(x => ({ hit: get(x) === x.res, odds: x.odds[get(x)] })); return stat(L); };
out.signals = {
  market: sigHit(x => x.marketLean),
  form: sigHit(x => x.formLean),
  h2h: sigHit(x => x.h2hLean),
  movement: sigHit(x => x.mv && x.mv.dir),
  movementStrong: sigHit(x => x.mv && x.mv.strength === 'strong' && x.mv.dir),
  movementAgainstFav: (() => { const L = recs.filter(x => x.mv && x.mv.dir && x.mv.dir !== x.marketLean && x.mv.dir !== 'd'); return stat(L.map(x => ({ hit: x.mv.dir === x.res, odds: x.odds[x.mv.dir] }))); })(),
  restEdge: sigHit(x => x.ctx.restLean),
};
// Market favourite hit rate split by movement relative to the favourite (confidence modifier evidence)
const favL = recs.filter(x => x.mv).map(x => ({ ...x, hit: x.marketLean === x.res, odds: x.odds[x.marketLean], fs: x.mv.shift[x.marketLean] }));
out.favByMovement = {
  favFirmed: stat(favL.filter(x => x.fs >= 0.03)),
  favFlat: stat(favL.filter(x => x.fs > -0.03 && x.fs < 0.03)),
  favDrifted: stat(favL.filter(x => x.fs <= -0.03)),
};
out.drawRate = +(recs.filter(x => x.res === 'd').length / recs.length * 100).toFixed(1);

// --- upset rules ----------------------------------------------------------
const up = v198.filter(x => x.speak && x.lean !== x.marketLean);
const up197 = v197.filter(x => x.speak && x.lean !== x.marketLean);
const rules = {
  R0_current_v197: { list: up197, desc: '表态≠盘口热门（1.9.97 规则）' },
  R0_current_v198: { list: up, desc: '同上，含变盘/背景信号的新引擎' },
  R1_move_to_pick: { list: up.filter(x => x.mv && x.mv.dir === x.lean), desc: '逆盘口 + 开盘→临场资金流向所选方向' },
  R2_fav_drifting: { list: up.filter(x => x.mv && x.mv.shift[x.marketLean] <= -0.02), desc: '逆盘口 + 热门方隐含概率临场下降≥2pp' },
  R3_no_draw: { list: up.filter(x => x.lean !== 'd'), desc: '逆盘口且所选非平局' },
  R4_move_to_pick_nodraw: { list: up.filter(x => x.lean !== 'd' && x.mv && x.mv.dir === x.lean), desc: '逆盘口非平局 + 资金流向所选' },
  R5_close_market: { list: up.filter(x => x.p[x.marketLean] < 0.5), desc: '逆盘口 + 热门隐含<50%（非一边倒）' },
  R7_close_drift_nodraw: { list: up.filter(x => x.lean !== 'd' && x.p[x.marketLean] < 0.5 && x.mv && x.mv.shift[x.marketLean] <= -0.02), desc: '逆盘口非平局 + 热门<50% + 热门临场走弱' },
  R8_drift_any: { list: up.filter(x => x.mv && x.mv.shift[x.marketLean] <= -0.03), desc: '逆盘口 + 热门方临场走弱≥3pp' },
  R6_close_and_drift: { list: up.filter(x => x.p[x.marketLean] < 0.5 && x.mv && x.mv.shift[x.marketLean] <= -0.02), desc: '逆盘口 + 热门<50% + 热门临场走弱' },
};
out.upsetRules = {};
for (const [k, v] of Object.entries(rules)) out.upsetRules[k] = { desc: v.desc, ...split(v.list, () => true) };
// baseline: backing the market favourite on the same matches
out.upsetRules.baselineFavOnUpsetSet = { desc: '同批场次改选市场热门（对照）', ...split(up.map(x => ({ ...x, hit: x.marketLean === x.res, odds: x.odds[x.marketLean] })), () => true) };

// --- calibration ----------------------------------------------------------
const TOP = /英超|西甲|德甲|意甲|法甲|欧冠/;
const bin = c => c < 0.40 ? '<40' : c < 0.45 ? '40-45' : c < 0.50 ? '45-50' : c < 0.55 ? '50-55' : c < 0.62 ? '55-62' : '62+';
const band = p => p >= 0.6 ? 'fav' : p >= 0.45 ? 'mid' : 'open';
const keyOf = (x) => ({ bin: bin(x.conf), kind: x.lean === x.marketLean ? 'same' : 'rev', tier: TOP.test(x.league) ? 'top' : 'other', band: band(x.p[x.marketLean]) });
const table = {};
const add = (k, x) => { const t = table[k] || (table[k] = { n: 0, hit: 0, confSum: 0 }); t.n++; t.hit += x.hit ? 1 : 0; t.confSum += x.conf; };
for (const x of v198) {
  const k = keyOf(x);
  add(`b:${k.bin}`, x); add(`bk:${k.bin}|${k.kind}`, x); add(`bkb:${k.bin}|${k.kind}|${k.band}`, x); add(`bkt:${k.bin}|${k.kind}|${k.tier}`, x);
  add(`kind:${k.kind}`, x); add(`tier:${k.tier}`, x); add(`band:${k.band}`, x);
}
// 1.9.98 live calibration keys: depend only on inputs the live card has (market favourite implied
// probability band, pick type, league tier, favourite movement) so live/sim confidence scale gaps don't matter.
for (const x of v198) {
  const k = sig.calKey({ lean: x.lean, marketLean: x.marketLean, favP: x.p[x.marketLean], league: x.league, favShift: x.mv ? x.mv.shift[x.marketLean] : null });
  for (const kk of k) add(kk, x);
}
for (const t of Object.values(table)) { t.rate = +(t.hit / t.n * 100).toFixed(1); t.avgConf = +(t.confSum / t.n * 100).toFixed(1); delete t.confSum; }
out.calibration = table;
out.reliability = ['<40', '40-45', '45-50', '50-55', '55-62', '62+'].map(b => ({ bin: b, ...(table['b:' + b] || { n: 0 }) }));
// upset lookup for badge
const CHOSEN = process.env.UPSET_RULE || 'R2_fav_drifting';
out.upsetBadge = { chosen: CHOSEN, strong: out.upsetRules[CHOSEN], base: out.upsetRules.R0_current_v198 };

// --- 1.9.99 base rates (P(H/D/A) | marketLean, favBand) for value-edge ---
const fpBand = p => { const b = Math.floor(p * 20) * 5; return b < 35 ? '<35' : b >= 75 ? '75+' : `${b}-${b + 5}`; };
function buildBaseRates(list) {
  const T = {};
  const bump = (k, res) => {
    const t = T[k] || (T[k] = { n: 0, h: 0, d: 0, a: 0 });
    t.n++; t[res]++;
  };
  for (const x of list) {
    const fb = fpBand(x.p[x.marketLean]);
    bump(`br:${x.marketLean}|${fb}`, x.res);
    bump(`br:${x.marketLean}`, x.res);
    bump('br:all', x.res);
  }
  for (const t of Object.values(T)) {
    t.h = +(t.h / t.n).toFixed(4); t.d = +(t.d / t.n).toFixed(4); t.a = +(t.a / t.n).toFixed(4);
  }
  return T;
}
out.baseRates = buildBaseRates(recs);

// --- 1.9.99 value-edge threshold sweep (train calib → test eval; no leakage) ---
function buildCalibTable(list) {
  const T = {};
  const addC = (k, x) => { const t = T[k] || (T[k] = { n: 0, hit: 0 }); t.n++; t.hit += x.hit ? 1 : 0; };
  for (const x of list) {
    for (const kk of sig.calKey({ lean: x.lean, marketLean: x.marketLean, favP: x.p[x.marketLean], league: x.league, favShift: x.mv ? x.mv.shift[x.marketLean] : null })) addC(kk, x);
  }
  for (const t of Object.values(T)) t.rate = +(t.hit / t.n * 100).toFixed(1);
  return T;
}
function fairImp(o) { const s = 1/o.h + 1/o.d + 1/o.a; return { h: 1/o.h/s, d: 1/o.d/s, a: 1/o.a/s }; }
function edgePick(x, calibT, baseT, th) {
  const fair = fairImp(x.odds);
  const favP = x.p[x.marketLean];
  const fb = fpBand(favP);
  const base = baseT[`br:${x.marketLean}|${fb}`] || baseT[`br:${x.marketLean}`] || baseT['br:all'];
  const keys = sig.calKey({ lean: x.lean, marketLean: x.marketLean, favP, league: x.league, favShift: x.mv ? x.mv.shift[x.marketLean] : null });
  let cal = null;
  for (const k of keys) { const r = calibT[k]; if (r && r.n >= 30) { cal = r; break; } }
  const probs = { h: null, d: null, a: null };
  if (base && base.n >= 30) { probs.h = base.h; probs.d = base.d; probs.a = base.a; }
  if (!(cal && x.lean)) return null; // need calibrated lean rate (n≥30)
  probs[x.lean] = cal.rate / 100;
  const k = x.lean;
  if (!k || probs[k] == null) return null;
  const edge = probs[k] - fair[k];
  const ev = probs[k] * x.odds[k] - 1;
  if (!(edge >= th && ev >= -0.001)) return null;
  // 1.9.100: require odds movement (intel unavailable in history). |fav shift| ≥ 3pp.
  const fs = x.mv && x.mv.shift && x.marketLean != null ? x.mv.shift[x.marketLean] : null;
  const moved = fs != null && Math.abs(fs) >= 0.03;
  if (!moved) return null;
  return { side: k, edge, ev, odds: x.odds[k], our: probs[k], isLean: true, favShift: fs };
}
const trainRecs = v198.filter(x => x.date < cut);
const testRecs = v198.filter(x => x.date >= cut);
const trainCal = buildCalibTable(trainRecs);
const trainBase = buildBaseRates(recs.filter(x => x.date < cut));
const thresholds = [0.03, 0.04, 0.05, 0.06, 0.08];
out.edgeSweep = {};
for (const th of thresholds) {
  const evalSet = (list, calT, baseT) => {
    const picks = [];
    for (const x of list) {
      const b = edgePick(x, calT, baseT, th);
      if (!b) continue;
      picks.push({ hit: b.side === x.res, odds: b.odds, edge: b.edge, side: b.side, isLean: b.isLean });
    }
    return { ...stat(picks), leanShare: picks.length ? +(picks.filter(p => p.isLean).length / picks.length * 100).toFixed(1) : null };
  };
  out.edgeSweep[th] = {
    train: evalSet(trainRecs, trainCal, trainBase),
    // test uses train-only tables (no leakage)
    test: evalSet(testRecs, trainCal, trainBase),
    // in-sample reference (optimistic)
    all: evalSet(v198, buildCalibTable(v198), out.baseRates),
  };
}
// Always-favourite on the same test matches that the edge rule would pick (at each th) — and global fav baseline
// Same-direction only (lean === marketLean): underpriced favourite
out.edgeSweepSame = {};
for (const th of thresholds) {
  const evalSet = (list, calT, baseT) => {
    const picks = [];
    for (const x of list) {
      if (x.lean !== x.marketLean) continue;
      const b = edgePick(x, calT, baseT, th);
      if (!b) continue;
      picks.push({ hit: b.side === x.res, odds: b.odds, stakeOdds: b.odds, edge: b.edge, side: b.side, isLean: true });
    }
    return stat(picks);
  };
  out.edgeSweepSame[th] = { train: evalSet(trainRecs, trainCal, trainBase), test: evalSet(testRecs, trainCal, trainBase) };
}
out.edgeBaseline = {
  alwaysFavTest: (() => {
    const L = testRecs.map(x => ({ hit: x.marketLean === x.res, odds: x.odds[x.marketLean] }));
    return stat(L);
  })(),
  alwaysFavAll: (() => {
    const L = v198.map(x => ({ hit: x.marketLean === x.res, odds: x.odds[x.marketLean] }));
    return stat(L);
  })(),
};
// Choose threshold: best test ROI among those with test.n >= 40; fallback best train ROI with n>=80
let chosenTh = 0.04, bestRoi = -Infinity, chosenMode = 'lean';
for (const th of thresholds) {
  const t = out.edgeSweep[th].test;
  if (t.n >= 40 && t.roi != null && t.roi > bestRoi) { bestRoi = t.roi; chosenTh = th; chosenMode = 'lean'; }
}
out.edgeMode = chosenMode;
// Same-match favourite comparison for the chosen threshold (test set)
function favOnEdgeSet(list, calT, baseT, th) {
  const favPicks = [];
  for (const x of list) {
    const b = edgePick(x, calT, baseT, th);
    if (!b) continue;
    favPicks.push({ hit: x.marketLean === x.res, odds: x.odds[x.marketLean], stakeOdds: x.odds[x.marketLean] });
  }
  return stat(favPicks);
}
out.edgeBadge = {
  threshold: chosenTh,
  requireSameDir: false,
  test: out.edgeSweep[chosenTh].test,
  train: out.edgeSweep[chosenTh].train,
  all: out.edgeSweep[chosenTh].all,
  vsFavTest: out.edgeBaseline.alwaysFavTest,
  favOnEdgeTest: favOnEdgeSet(testRecs, trainCal, trainBase, chosenTh),
  favOnEdgeTrain: favOnEdgeSet(trainRecs, trainCal, trainBase, chosenTh),
  validated: false, // filled below
  noteZh: '',
};
{
  const e = out.edgeBadge.test, f = out.edgeBadge.favOnEdgeTest;
  const beatsFav = e && f && e.n >= 40 && e.roi != null && f.roi != null && e.roi > f.roi;
  const absPos = e && e.roi != null && e.roi > 0;
  out.edgeBadge.validated = !!(beatsFav && absPos);
  out.edgeBadge.beatsFavOnSet = !!beatsFav;
  // Fair-odds EV variant (our/fair - 1 > 0) — informational; live rule still uses posted odds
  out.edgeBadge.fairEvTest = (() => {
    const picks = [];
    for (const x of testRecs) {
      const b = edgePick(x, trainCal, trainBase, chosenTh);
      // re-check with fair EV: reuse edgePick which uses posted; custom:
      const fair = fairImp(x.odds);
      const keys = sig.calKey({ lean: x.lean, marketLean: x.marketLean, favP: x.p[x.marketLean], league: x.league, favShift: x.mv ? x.mv.shift[x.marketLean] : null });
      let cal = null; for (const k of keys) { const r = trainCal[k]; if (r && r.n >= 30) { cal = r; break; } }
      if (!cal || !x.lean) continue;
      const our = cal.rate / 100;
      const edge = our - fair[x.lean];
      const fairEv = our / fair[x.lean] - 1;
      if (edge >= chosenTh && fairEv > 0) picks.push({ hit: x.lean === x.res, odds: x.odds[x.lean], stakeOdds: x.odds[x.lean] });
    }
    return stat(picks);
  })();
  out.edgeBadge.requireChange = true;
  out.edgeBadge.noteZh = '1.9.100：优势关注须同时满足价差阈值与开盘→临场热门变动≥3pp（历史无阵容，仅用变盘门控）。' + (absPos
    ? '测试集跟投录得正收益。'
    : (beatsFav
      ? '测试集仍为负收益但优于同批热门；展示但不构成收益承诺。'
      : '测试集未跑赢同批热门；无实质变化时只展示对照、不标建议关注。'));
}

// Compare gated vs ungated volume at 4pp (for release note)
out.edgeGateCompare = (() => {
  const th = 0.04;
  let bare = 0, gated = 0;
  for (const x of testRecs) {
    const fair = fairImp(x.odds);
    const keys = sig.calKey({ lean: x.lean, marketLean: x.marketLean, favP: x.p[x.marketLean], league: x.league, favShift: x.mv ? x.mv.shift[x.marketLean] : null });
    let cal = null; for (const k of keys) { const r = trainCal[k]; if (r && r.n >= 30) { cal = r; break; } }
    if (!cal || !x.lean) continue;
    const our = cal.rate / 100;
    const edge = our - fair[x.lean];
    const ev = our * x.odds[x.lean] - 1;
    if (!(edge >= th && ev >= -0.001)) continue;
    bare++;
    const fs = x.mv && x.mv.shift ? x.mv.shift[x.marketLean] : null;
    if (fs != null && Math.abs(fs) >= 0.03) gated++;
  }
  return { th, testBare: bare, testGated: gated };
})();

fs.writeFileSync(path.join(H, 'calibration.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({
  n: out.n, withMovement: out.withMovement,
  market: out.market, v198: out.v198,
  edgeSweep: out.edgeSweep, edgeSweepSame: out.edgeSweepSame, edgeMode: out.edgeMode,
  edgeBadge: out.edgeBadge, edgeBaseline: out.edgeBaseline, edgeGateCompare: out.edgeGateCompare,
}, null, 1));
