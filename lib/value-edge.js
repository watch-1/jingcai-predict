// 1.9.99: value / edge vs live odds — our calibrated (or market-structure) win rate
// minus fair implied probability. No invented odds; n<30 → no advice.
'use strict';
const { calibrate, calibration } = require('./signals');

const SIDE = { h: '主胜', d: '平局', a: '客胜' };
const MIN_N = 30;

/** Remove bookmaker overround so fair implied probs sum to 1. */
function fairImplied(odds) {
  if (!odds || !(odds.h > 1) || !(odds.d > 1) || !(odds.a > 1)) return null;
  const raw = { h: 1 / odds.h, d: 1 / odds.d, a: 1 / odds.a };
  const s = raw.h + raw.d + raw.a;
  return { h: raw.h / s, d: raw.d / s, a: raw.a / s, overround: s - 1 };
}

function lookupBase(marketLean, favP) {
  const cal = calibration();
  if (!cal || !cal.baseRates || !marketLean || favP == null) return null;
  const fb = (() => {
    const b = Math.floor(favP * 20) * 5;
    return b < 35 ? '<35' : b >= 75 ? '75+' : `${b}-${b + 5}`;
  })();
  const keys = [`br:${marketLean}|${fb}`, `br:${marketLean}`, 'br:all'];
  for (const k of keys) {
    const r = cal.baseRates[k];
    if (r && r.n >= MIN_N) return { ...r, key: k };
  }
  return null;
}

/**
 * Our probability for each of h/d/a under current features.
 * - Engine lean: calibrated historical hit rate of that pick (1.9.98 bins).
 * - Other outcomes: market-structure base rates, rescaled so the three sum to 1
 *   with the lean rate held fixed (when lean has enough sample).
 * Returns null rates when sample insufficient.
 */
function ourProbs({ lean, conf, marketLean, marketP, league, favShift }) {
  const favP = marketP && marketLean ? marketP[marketLean] : null;
  const base = lookupBase(marketLean, favP);
  const cal = lean ? calibrate({ conf, lean, marketLean, marketP: favP, league, favShift }) : null;

  const out = { h: null, d: null, a: null, n: {}, key: {}, source: {} };
  if (base) {
    for (const k of ['h', 'd', 'a']) {
      out[k] = base[k];
      out.n[k] = base.n;
      out.key[k] = base.key;
      out.source[k] = 'base';
    }
  }
  if (cal && cal.enough && lean && cal.rate != null) {
    const pLean = cal.rate / 100;
    const others = ['h', 'd', 'a'].filter(k => k !== lean);
    const restBase = others.reduce((s, k) => s + (out[k] != null ? out[k] : 0), 0);
    out[lean] = pLean;
    out.n[lean] = cal.n;
    out.key[lean] = cal.key;
    out.source[lean] = 'calib';
    if (restBase > 0) {
      const scale = Math.max(0, 1 - pLean) / restBase;
      for (const k of others) if (out[k] != null) out[k] = out[k] * scale;
    } else {
      // no base: put residual on remaining two equally
      for (const k of others) { out[k] = (1 - pLean) / 2; out.source[k] = 'residual'; }
    }
  }
  return out;
}

/**
 * Score every outcome; return best edge that clears threshold with +EV, else null advice.
 * @param {number} threshold edge in probability points (e.g. 0.04 = 4pp)
 */

/** 1.9.100: real pre-match change required before「优势关注」.
 *  - 临场: key-player absence or confirmed rotation chips from intel signal
 *  - 变盘: favourite implied-prob shift |Δ| ≥ MOVE_TH (default 3pp) opening→latest
 */
const MOVE_TH = 0.03;
function prematchChange({ intel = null, movement = null, marketLean = null } = {}) {
  const reasons = [];
  if (movement && movement.shift && marketLean && movement.shift[marketLean] != null) {
    const fs = movement.shift[marketLean];
    if (fs >= MOVE_TH) reasons.push({ kind: 'move', text: `热门较开盘走强≥${(MOVE_TH * 100).toFixed(0)}pp` });
    else if (fs <= -MOVE_TH) reasons.push({ kind: 'move', text: `热门较开盘走弱≥${(MOVE_TH * 100).toFixed(0)}pp` });
  }
  if (!reasons.some(r => r.kind === 'move') && movement && movement.mag >= MOVE_TH && movement.dir) {
    reasons.push({ kind: 'move', text: movement.chip || '赔率短时大幅变动' });
  }
  const chips = (intel && intel.chips) || [];
  for (const c of chips) {
    const t = String(c.text || '');
    if (/缺\d*名?主力|疑似轮换/.test(t)) reasons.push({ kind: 'intel', text: t, side: c.side || null });
  }
  // lineup-stage with lean delta also counts even if chip wording differs
  if (intel && intel.stage === 'lineup' && intel.hasData && Math.abs(intel.delta || 0) >= 0.3
      && !reasons.some(r => r.kind === 'intel')) {
    reasons.push({ kind: 'intel', text: '首发相对常规有实质变化' });
  }
  return { ok: reasons.length > 0, reasons };
}

function computeEdge({ odds, lean, conf, marketLean, marketP, league, favShift, threshold = 0.04, trigger = null }) {
  const fair = fairImplied(odds);
  if (!fair) return { hasEdge: false, reason: 'no_odds', items: [], best: null, text: '胜平负未开售，优势对比暂不适用' };

  const probs = ourProbs({ lean, conf, marketLean, marketP, league, favShift });
  const items = [];
  for (const k of ['h', 'd', 'a']) {
    const our = probs[k];
    const n = probs.n[k] || 0;
    if (our == null || n < MIN_N) {
      items.push({ side: k, our: our, fair: fair[k], edge: null, ev: null, odds: odds[k], n, enough: false, source: probs.source[k] || null });
      continue;
    }
    const edge = our - fair[k];
    const ev = our * odds[k] - 1;
    const isLean = k === lean;
    // Advice eligibility: lean must come from calibrated pick rate (not base-rate alone)
    const enough = isLean ? (probs.source[k] === 'calib' && n >= MIN_N) : (n >= MIN_N);
    items.push({
      side: k, our, fair: fair[k], edge, ev, odds: odds[k], n,
      enough, source: probs.source[k], key: probs.key[k],
      isLean,
    });
  }

  // 1.9.99: advise only on calibrated lean. 1.9.100: also require real pre-match change.
  const leanOk = items.find(x => x.isLean && x.enough && x.edge != null && x.edge >= threshold && x.ev >= -0.001);
  const trig = trigger && trigger.ok ? trigger : { ok: false, reasons: [] };
  const best = (leanOk && trig.ok) ? leanOk : null;
  let text;
  if (best) {
    const why = (trig.reasons || []).map(r => r.text).slice(0, 2).join('；');
    text = `模型 ${(best.our * 100).toFixed(0)}% vs 盘口隐含 ${(best.fair * 100).toFixed(0)}%，优势 +${(best.edge * 100).toFixed(0)}%` +
      (why ? `（${why}）` : '') + ` → 建议关注${SIDE[best.side]}`;
  } else {
    const leanItem = items.find(x => x.isLean && x.enough);
    if (leanItem) {
      const sign = leanItem.edge >= 0 ? '+' : '';
      const cmp = `模型 ${(leanItem.our * 100).toFixed(0)}% vs 盘口隐含 ${(leanItem.fair * 100).toFixed(0)}%（${sign}${(leanItem.edge * 100).toFixed(0)}%）`;
      if (leanOk && !trig.ok) {
        text = `${cmp}，优势已达阈值但无临场/变盘实质变化，仅对照`;
      } else if (leanItem.edge >= threshold && leanItem.ev < -0.001) {
        text = `${cmp}，去水后有优势但按开售赔期望≤0，不建议关注`;
      } else if (leanItem.edge >= 0) {
        text = `${cmp}，未达关注阈值（需≥${(threshold * 100).toFixed(0)}pp、正期望，且临场或变盘有实质变化）`;
      } else {
        text = `${cmp}，未发现相对盘口的优势`;
      }
    } else {
      text = '未发现相对盘口的优势（同类样本不足或优势未达阈值）';
    }
  }
  return {
    hasEdge: !!best,
    threshold,
    trigger: trig,
    fair,
    items,
    best: best ? {
      side: best.side, label: SIDE[best.side],
      our: +best.our.toFixed(4), fair: +best.fair.toFixed(4),
      edge: +best.edge.toFixed(4), ev: +best.ev.toFixed(4),
      odds: best.odds, n: best.n, source: best.source, isLean: !!best.isLean,
      reasons: (trig.reasons || []).map(r => r.text),
    } : null,
    text,
  };
}

/** Live HHAD edge when 让球 odds exist (same formula, pool label). */
function computeHhadEdge({ hhad, leanHhad, baseRatesHhad, threshold = 0.04 }) {
  if (!hhad || !(hhad.h > 1)) return null;
  // Without a calibrated HHAD table we only report fair implied vs equal prior — skip advice.
  // Kept as a stub so the UI can show fair implied if we add HHAD calib later.
  void leanHhad; void baseRatesHhad; void threshold;
  return null;
}

module.exports = {
  fairImplied, ourProbs, computeEdge, computeHhadEdge, prematchChange, lookupBase, SIDE, MIN_N, MOVE_TH,
};
