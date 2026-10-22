// 1.9.98: 胜平负/让球 opening→latest odds movement (public sporttery odds history). Never invents odds.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const BASE = process.env.SPORTTERY_BASE || 'https://webapi.sporttery.cn';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: 'https://www.sporttery.cn/',
};
const DIR = () => path.join(DATA_DIR, 'odds-movement');
const TTL_MS = 20 * 60e3;
const SHIFT_TH = 0.03; // implied-prob shift ≥3pp counts as movement

const num = (v) => (v == null || v === '' ? null : Number(v));
function row(r) {
  const h = num(r.h), d = num(r.d), a = num(r.a);
  if (!(h > 1 && d > 1 && a > 1)) return null;
  return { h, d, a, gl: r.goalLine ? String(r.goalLine) : '', t: `${r.updateDate || ''} ${r.updateTime || ''}`.trim() };
}
function implied(o) {
  const s = 1 / o.h + 1 / o.d + 1 / o.a;
  return { h: 1 / o.h / s, d: 1 / o.d / s, a: 1 / o.a / s };
}

/** Compact history: { had:[{h,d,a,t}], hhad:[{h,d,a,gl,t}] } */
function compact(value) {
  const o = value && value.oddsHistory;
  if (!o) return null;
  const had = (o.hadList || []).map(row).filter(Boolean);
  const hhad = (o.hhadList || []).map(row).filter(Boolean);
  return { had, hhad };
}

async function fetchHistory(matchId, opts = {}) {
  const url = `${BASE}/gateway/uniform/football/getFixedBonusV1.qry?clientCode=3001&matchId=${encodeURIComponent(matchId)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 10000);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal, ...(opts.dispatcher ? { dispatcher: opts.dispatcher } : {}) });
    const text = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = JSON.parse(text);
    if (j.success === false) throw new Error(j.errorMessage || 'fail');
    return compact(j.value);
  } finally { clearTimeout(t); }
}

/**
 * Movement summary from a compact history.
 * Prefers HAD; when HAD history missing, uses HHAD for display only (pool:'hhad').
 * dir: side whose implied prob rose most (money direction) when |shift| ≥ SHIFT_TH, else null.
 */
function summarize(hist) {
  if (!hist) return null;
  const hadSeries = hist.had || [];
  const hhadSeries = hist.hhad || [];
  const useHhad = hadSeries.length < 1 && hhadSeries.length >= 1;
  const series = useHhad ? hhadSeries : hadSeries;
  if (series.length < 1) return null;
  const open = series[0], last = series[series.length - 1];
  const po = implied(open), pl = implied(last);
  const shift = { h: pl.h - po.h, d: pl.d - po.d, a: pl.a - po.a };
  let dir = null, mag = 0;
  for (const k of ['h', 'd', 'a']) if (shift[k] > mag) { mag = shift[k]; dir = k; }
  if (mag < SHIFT_TH) dir = null;
  let hh = null;
  if (useHhad) {
    hh = { open, last, lineChanged: String(open.gl || '') !== String(last.gl || ''), primary: true };
  } else if (hhadSeries.length) {
    const ho = hhadSeries[0], hl = hhadSeries[hhadSeries.length - 1];
    hh = { open: ho, last: hl, lineChanged: String(ho.gl || '') !== String(hl.gl || '') };
  }
  return {
    n: series.length,
    pool: useHhad ? 'hhad' : 'had',
    open, last,
    shift: { h: +shift.h.toFixed(4), d: +shift.d.toFixed(4), a: +shift.a.toFixed(4) },
    dir, mag: +mag.toFixed(4),
    strength: mag >= 0.06 ? 'strong' : mag >= SHIFT_TH ? 'mild' : 'flat',
    spark: series.slice(-24).map(r => { const p = implied(r); return { h: +p.h.toFixed(3), d: +p.d.toFixed(3), a: +p.a.toFixed(3) }; }),
    hhad: hh,
  };
}

const SIDE = { h: '主胜', d: '平局', a: '客胜' };
const MONEY = { h: '资金偏主', d: '资金偏平', a: '资金偏客' };
const SIDE_HHAD = { h: '让胜', d: '让平', a: '让负' };
const MONEY_HHAD = { h: '资金偏让胜', d: '资金偏让平', a: '资金偏让负' };
function chipText(sum) {
  if (!sum || !sum.dir) return null;
  const k = sum.dir;
  const hhad = sum.pool === 'hhad';
  const lab = hhad ? SIDE_HHAD : SIDE;
  const mon = hhad ? MONEY_HHAD : MONEY;
  return `${lab[k]}赔率 ${sum.open[k].toFixed(2)}→${sum.last[k].toFixed(2)}，${mon[k]}`;
}

async function getMovement(matchId, opts = {}) {
  const f = path.join(DIR(), String(matchId) + '.json');
  try {
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (c && Date.now() - c.at < (opts.ttlMs || TTL_MS)) return c.sum;
  } catch (_) {}
  try {
    const hist = await fetchHistory(matchId, opts);
    const sum = summarize(hist);
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ at: Date.now(), sum }));
    return sum;
  } catch (e) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')).sum; } catch (_) { return null; }
  }
}

module.exports = { fetchHistory, summarize, chipText, getMovement, implied, SHIFT_TH };
