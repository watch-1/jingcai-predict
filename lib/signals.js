// 1.9.98: extra predict signals — 临场(lineups/injuries), 背景(motivation/schedule), 变盘(odds movement)
// plus calibration lookup. Weights are modest and set from tools/backtest-signals.js output.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const PICK = { h: '主胜', d: '平局', a: '客胜' };
// Weights (see docs/release-1.9.98.md for the backtest that set them)
// Backtest (6834 matches, 2025-04→2026-10): movement direction alone hit 49.4% (< market 52.7%),
// so it does NOT push the lean; instead favourite firming/drifting adjusts confidence
// (fav firmed ≥3pp hit 53.8%, drifted ≥3pp hit 48.4%). Rest-day edge hit 31.2% → tag only.
// 临场/动机 cannot be backtested (no historical lineups/standings) → small, capped weights.
const W = {
  moveStrong: 0, moveMild: 0,
  moveConfUp: 0.02, moveConfDown: 0.03,
  rest: 0,
  motivation: 0.15,
  keyAbsent: 0.3, rotation: 0.25,
};

const CUP_RE = /杯|欧冠|欧罗巴|欧协|亚冠|解放者|南美/;
const EURO_RE = /欧冠|欧罗巴|欧协|Champions League|Europa|Conference League/i;

// ---------- 背景: rest / congestion ---------------------------------------
function contextFromRest({ restH, restA, league }) {
  const tags = [];
  let restLean = null;
  if (restH != null && restA != null) {
    if (restH <= 3 && restA >= 5) { restLean = 'a'; tags.push({ side: 'h', text: `主队仅休 ${restH} 天` }); }
    else if (restA <= 3 && restH >= 5) { restLean = 'h'; tags.push({ side: 'a', text: `客队仅休 ${restA} 天` }); }
  }
  if (CUP_RE.test(String(league || ''))) tags.push({ side: null, text: '杯赛/洲际赛' });
  return { restLean, tags };
}

let _hist = null, _histAt = 0;
function teamDates() {
  if (_hist && Date.now() - _histAt < 6 * 3600e3) return _hist;
  const map = new Map();
  try {
    const txt = fs.readFileSync(path.join(DATA_DIR, 'history', 'results.jsonl'), 'utf8');
    for (const l of txt.split('\n')) {
      if (!l) continue;
      let r; try { r = JSON.parse(l); } catch { continue; }
      for (const t of [r.homeTeamId, r.awayTeamId]) {
        const k = String(t);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push({ date: r.matchDate, league: r.league });
      }
    }
    for (const v of map.values()) v.sort((a, b) => a.date.localeCompare(b.date));
  } catch (_) {}
  try {
    const db = pmDb();
    if (db) for (const r of db.prepare("SELECT match_id id, date, home_team_id h, away_team_id a, competition c FROM matches WHERE date IS NOT NULL").all()) {
      const isAf = String(r.id).startsWith('af:');
      for (const t of [r.h, r.a]) {
        const k = (isAf ? 'af:' : '') + String(t); if (!map.has(k)) map.set(k, []);
        map.get(k).push({ date: String(r.date).slice(0, 10), league: r.c || '' });
      }
    }
    for (const v of map.values()) v.sort((a, b) => a.date.localeCompare(b.date));
  } catch (_) {}
  _hist = map; _histAt = Date.now();
  return map;
}
const dms = d => Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');

function lastMatch(teamId, beforeDate, afId) {
  let last = null;
  for (const key of [String(teamId), afId ? 'af:' + afId : null]) {
    if (!key) continue;
    for (const x of teamDates().get(key) || []) if (x.date < beforeDate && (!last || x.date > last.date)) last = x;
  }
  return last;
}
function nextMatch(pool, teamId, m) {
  const tid = String(teamId);
  let best = null;
  for (const x of pool || []) {
    if (String(x.id) === String(m.id)) continue;
    if (String(x.homeTeamId) !== tid && String(x.awayTeamId) !== tid) continue;
    if (!x.date || x.date <= m.date) continue;
    if (!best || x.date < best.date) best = x;
  }
  return best;
}

// derby pairs (zh short names as shown by sporttery)
const DERBIES = [
  ['阿森纳', '热刺'], ['曼联', '曼城'], ['利物浦', '埃弗顿'], ['切尔西', '热刺'], ['切尔西', '阿森纳'], ['纽卡斯尔', '桑德兰'],
  ['皇马', '马竞'], ['皇马', '巴萨'], ['塞维利亚', '贝蒂斯'], ['毕尔巴鄂', '皇家社会'], ['瓦伦西亚', '莱万特'],
  ['国米', 'AC米兰'], ['罗马', '拉齐奥'], ['尤文图斯', '都灵'], ['热那亚', '桑普'],
  ['拜仁', '多特蒙德'], ['多特蒙德', '沙尔克'], ['汉堡', '圣保利'], ['科隆', '门兴'],
  ['巴黎', '马赛'], ['里昂', '圣埃蒂安'], ['尼斯', '摩纳哥'],
  ['阿贾克斯', '费耶诺德'], ['阿贾克斯', 'PSV'], ['本菲卡', '葡萄牙体育'], ['波尔图', '本菲卡'],
  ['凯尔特人', '流浪者'], ['加拉塔萨', '费内巴切'], ['鹿岛鹿角', '浦和红钻'], ['大阪钢巴', '大阪樱花'],
];
function isDerby(h, a) {
  const H = String(h || ''), A = String(a || '');
  return DERBIES.some(([x, y]) => (H.includes(x) && A.includes(y)) || (H.includes(y) && A.includes(x)));
}

/** Motivation from a standings table: { tag, pressure } per side. */
function motivation(row, rows) {
  if (!row || !Array.isArray(rows) || rows.length < 8) return null;
  const n = rows.length;
  const played = Number(row.played) || 0;
  const gamesLeft = Math.max(0, (n - 1) * 2 - played);
  if (played < 8) return null; // too early in the season to call pressure
  const pts = Number(row.points) || 0;
  const sorted = rows.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const ptAt = r => Number((sorted[Math.min(n, Math.max(1, r)) - 1] || {}).points) || 0;
  const leader = ptAt(1), fourth = ptAt(4), drop = ptAt(n - 2); // first relegation place approx.
  const rank = Number(row.rank) || 99;
  const reach = 3 * gamesLeft;
  if (rank <= 2 && leader - pts <= 3) return { tag: '争冠', pressure: 1 };
  if (rank >= n - 2 || (rank >= n - 5 && pts - drop <= 2)) return { tag: '保级', pressure: 1 };
  if (rank >= 4 && rank <= 7 && fourth - pts <= 3) return { tag: '欧战资格', pressure: 0.6 };
  if (gamesLeft <= 5 && pts - drop > reach && fourth - pts > reach) return { tag: '无欲无求', pressure: -1 };
  return null;
}

/**
 * Live 背景 signal for a match.
 * @returns {{ lean, delta, tags:[{side,text,kind}], facts }}
 */
function buildContextSignal(m, { standHome, standAway, tableRows, schedulePool, homeAfId, awayAfId } = {}) {
  const tags = [];
  let delta = 0;
  const date = String(m.date || '').slice(0, 10);
  const lh = lastMatch(m.homeTeamId, date, homeAfId), la = lastMatch(m.awayTeamId, date, awayAfId);
  const restH = lh ? Math.round((dms(date) - dms(lh.date)) / 864e5) : null;
  const restA = la ? Math.round((dms(date) - dms(la.date)) / 864e5) : null;
  const rest = contextFromRest({ restH: restH != null && restH <= 10 ? restH : null, restA: restA != null && restA <= 10 ? restA : null, league: m.league });
  for (const t of rest.tags) tags.push({ ...t, kind: t.side ? 'rest' : 'cup' });
  if (rest.restLean === 'h') delta += W.rest; else if (rest.restLean === 'a') delta -= W.rest;
  // European fixture within 3–4 days either side → rotation risk
  for (const [side, tid, last] of [['h', m.homeTeamId, lh], ['a', m.awayTeamId, la]]) {
    const nx = nextMatch(schedulePool, tid, m);
    const lab = side === 'h' ? '主队' : '客队';
    if (last && EURO_RE.test(last.league) && !EURO_RE.test(m.league || '') && (dms(date) - dms(last.date)) / 864e5 <= 4) tags.push({ side, text: `${lab}刚踢完欧战`, kind: 'euro' });
    if (nx && EURO_RE.test(nx.league || '') && !EURO_RE.test(m.league || '') && (dms(nx.date) - dms(date)) / 864e5 <= 4) tags.push({ side, text: `${lab}${Math.round((dms(nx.date) - dms(date)) / 864e5)}天后踢欧战`, kind: 'euro' });
  }
  if (isDerby(m.home, m.away)) tags.push({ side: null, text: '同城/宿敌德比', kind: 'derby' });
  const mh = motivation(standHome, tableRows), ma = motivation(standAway, tableRows);
  if (mh) tags.push({ side: 'h', text: `主队${mh.tag}`, kind: 'motiv' });
  if (ma) tags.push({ side: 'a', text: `客队${ma.tag}`, kind: 'motiv' });
  const ph = mh ? mh.pressure : 0, pa = ma ? ma.pressure : 0;
  if (ph - pa >= 1) delta += W.motivation; else if (pa - ph >= 1) delta -= W.motivation;
  // 1.9.103: lean threshold matches W.motivation (0.15) so single-side 保级/争冠 can fire
  const leanThr = W.motivation;
  const lean = delta >= leanThr ? 'h' : delta <= -leanThr ? 'a' : null;
  return { lean, delta: +delta.toFixed(2), tags, facts: { restH, restA } };
}

// ---------- 临场: key players & rotation ----------------------------------
let _pm = null;
function pmDb() {
  if (_pm !== null) return _pm;
  try { _pm = require('./player-match-db').getDb(); } catch (_) { _pm = false; }
  return _pm;
}
// NOTE: rows with match_id 'af:*' carry AF team ids, which collide with sporttery ids — excluded.
/** Key players = top by (minutes share × rating + goals/assists) over last 10 stored matches. */
function keyPlayers(teamId, limit = 4, af = false) {
  const db = pmDb();
  if (!db || !teamId) return { key: [], typicalXI: [], nMatches: 0 };
  try {
    const mids = db.prepare(`SELECT s.match_id FROM player_match_stats s JOIN matches m ON m.match_id=s.match_id
      WHERE s.team_id=? AND s.match_id ${af ? 'LIKE' : 'NOT LIKE'} 'af:%' GROUP BY s.match_id ORDER BY m.date DESC LIMIT 10`).all(String(teamId)).map(r => r.match_id);
    if (mids.length < 3) return { key: [], typicalXI: [], nMatches: mids.length };
    const ph = mids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT player_id, MAX(name_zh) zh, MAX(name_en) en, SUM(minutes) mins, AVG(rating) rt,
      SUM(goals) g, SUM(assists) a, SUM(CASE WHEN substitute=0 AND minutes>0 THEN 1 ELSE 0 END) starts, COUNT(*) apps
      FROM player_match_stats WHERE team_id=? AND match_id IN (${ph}) GROUP BY player_id`).all(String(teamId), ...mids);
    const N = mids.length;
    const scored = rows.map(r => ({
      id: String(r.player_id), name: r.zh || r.en, en: r.en,
      starts: r.starts, share: (r.mins || 0) / (90 * N),
      score: ((r.mins || 0) / (90 * N)) * ((r.rt || 6.5) - 6) * 2 + ((r.g || 0) + 0.6 * (r.a || 0)) / N * 3,
    }));
    const key = scored.filter(x => x.share >= 0.6).sort((a, b) => b.score - a.score).slice(0, limit);
    const typicalXI = scored.slice().sort((a, b) => b.starts - a.starts).slice(0, 11).map(x => x.id);
    return { key, typicalXI, nMatches: N };
  } catch (e) { return { key: [], typicalXI: [], nMatches: 0 }; }
}

const LINEUP_DIR = () => path.join(DATA_DIR, 'lineups-pre');
const AF_DAY_CAP = Number(process.env.SIGNALS_AF_DAY_CAP || 1500);
function capFile() { return path.join(DATA_DIR, 'lineups-pre', '_cap.json'); }
function capTake() {
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  let c = { day, n: 0 };
  try { const j = JSON.parse(fs.readFileSync(capFile(), 'utf8')); if (j.day === day) c = j; } catch (_) {}
  if (c.n >= AF_DAY_CAP) return false;
  c.n++;
  fs.mkdirSync(path.dirname(capFile()), { recursive: true });
  fs.writeFileSync(capFile(), JSON.stringify(c));
  return true;
}
function capStatus() { try { return JSON.parse(fs.readFileSync(capFile(), 'utf8')); } catch (_) { return { n: 0 }; } }

/** Fetch AF lineups only 0–90 min before kickoff; cached (empty result re-tried after 10 min). */
async function fetchLineups(fixtureId, koMs) {
  if (!fixtureId) return null;
  const f = path.join(LINEUP_DIR(), String(fixtureId) + '.json');
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
  if (disk && disk.lineups && disk.lineups.length === 2) return disk.lineups;
  const now = Date.now();
  if (!Number.isFinite(koMs) || koMs - now > 90 * 60e3 || now - koMs > 3 * 3600e3) return null;
  if (disk && now - disk.at < 10 * 60e3) return null;
  if (!capTake()) return null;
  try {
    const live = require('./live-stats');
    const list = await live.afFetch('/fixtures/lineups?fixture=' + encodeURIComponent(fixtureId));
    const lineups = (list || []).map(t => ({
      teamId: t.team && t.team.id, team: t.team && t.team.name,
      xi: (t.startXI || []).map(p => ({ id: String(p.player && p.player.id), name: p.player && p.player.name })),
    }));
    fs.mkdirSync(LINEUP_DIR(), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ at: now, lineups }));
    return lineups.length === 2 ? lineups : null;
  } catch (e) {
    fs.mkdirSync(LINEUP_DIR(), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ at: now, lineups: [], err: e.message }));
    return null;
  }
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
function nameHit(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "A. Cissè" vs "Abdoulaye Cisse": surname match
  const sa = String(a).split(/[\s.]+/).filter(Boolean).pop(), sb = String(b).split(/[\s.]+/).filter(Boolean).pop();
  return !!(sa && sb && norm(sa) === norm(sb) && norm(sa).length >= 4);
}

/**
 * @param m match, injuries: buildInjuries block, fixtureId, homeAfId/awayAfId optional
 */
async function buildIntelSignal(m, { injuryItems = [], fixtureId = null, koMs = NaN, sideOf = null, homeAfId = null, awayAfId = null } = {}) {
  const chips = [];
  const facts = { home: {}, away: {} };
  let delta = 0;
  // Player DB keys AF-sourced rows by AF team id; prefer those (much denser), fall back to sporttery id.
  const best = (afId, sid) => { const a = afId ? keyPlayers(String(afId), 4, true) : null; const b = keyPlayers(sid); return a && a.nMatches >= b.nMatches ? a : b; };
  const kh = best(homeAfId, m.homeTeamId), ka = best(awayAfId, m.awayTeamId);
  facts.home.key = kh.key.map(x => x.name); facts.away.key = ka.key.map(x => x.name);
  const lineups = await fetchLineups(fixtureId, koMs);
  facts.lineups = !!lineups;
  const sides = [['h', kh, '主队'], ['a', ka, '客队']];
  const absent = { h: [], a: [] };
  const rotation = { h: false, a: false };
  if (lineups) {
    // match AF lineup team to side by key-player overlap (ids are AF ids in the player DB)
    const pick = (K) => {
      let best = null, bestN = -1;
      for (const L of lineups) {
        const ids = new Set(L.xi.map(p => p.id));
        const n = K.typicalXI.filter(id => ids.has(id)).length;
        if (n > bestN) { bestN = n; best = L; }
      }
      return best;
    };
    let Lh = lineups[0], La = lineups[1];
    if (homeAfId && String(lineups[1].teamId) === String(homeAfId)) { Lh = lineups[1]; La = lineups[0]; }
    else if (!homeAfId && kh.typicalXI.length >= 8) { const p = pick(kh); if (p === lineups[1]) { Lh = lineups[1]; La = lineups[0]; } }
    for (const [side, K, lab] of sides) {
      const L = side === 'h' ? Lh : La;
      if (!L || K.nMatches < 3) continue;
      const ids = new Set(L.xi.map(p => p.id));
      absent[side] = K.key.filter(k => !ids.has(k.id)).map(k => k.name);
      if (K.typicalXI.length >= 11) {
        const ov = K.typicalXI.filter(id => ids.has(id)).length;
        facts[side === 'h' ? 'home' : 'away'].xiOverlap = ov;
        if (ov <= 6) rotation[side] = true;
      }
    }
  } else if (injuryItems.length) {
    for (const it of injuryItems) {
      const s = sideOf ? sideOf(it) : null;
      if (s !== 'home' && s !== 'away') continue;
      const side = s === 'home' ? 'h' : 'a';
      const K = side === 'h' ? kh : ka;
      const hit = K.key.find(k => nameHit(k.en, it.player));
      if (hit && /missing|out/i.test(it.type || 'Missing Fixture')) absent[side].push(hit.name);
    }
  }
  for (const [side, , lab] of sides) {
    const n = absent[side].length;
    if (n) chips.push({ side, text: `${lab}缺${n}名主力`, detail: absent[side].slice(0, 3).join('、') });
    if (rotation[side]) chips.push({ side, text: `${lab}疑似轮换` });
    const pen = Math.min(2, n) * W.keyAbsent + (rotation[side] ? W.rotation : 0);
    delta += side === 'h' ? -pen : pen;
  }
  const lean = delta >= 0.3 ? 'h' : delta <= -0.3 ? 'a' : null;
  return {
    lean, delta: +delta.toFixed(2), chips, facts,
    hasData: !!(lineups || injuryItems.length) && (kh.key.length > 0 || ka.key.length > 0),
    stage: lineups ? 'lineup' : injuryItems.length ? 'injury' : 'none',
  };
}

// ---------- 变盘 ---------------------------------------------------------
function movementSignal(sum) {
  if (!sum) return { lean: null, delta: 0, chip: null, hasData: false };
  const om = require('./odds-movement');
  let delta = 0;
  const k = sum.dir;
  if (k === 'h' || k === 'a') {
    const w = sum.strength === 'strong' ? W.moveStrong : W.moveMild;
    delta = k === 'h' ? w : -w;
  }
  return { lean: k || null, delta, chip: om.chipText(sum), hasData: sum.n >= 2, sum };
}
/** Confidence nudge when the pick is the market favourite and the favourite firmed/drifted. */
function movementConfAdj(sum, lean, marketLean) {
  if (!sum || !sum.shift || !lean || lean !== marketLean) return 0;
  const fs = sum.shift[marketLean];
  if (fs >= 0.03) return W.moveConfUp;
  if (fs <= -0.03) return -W.moveConfDown;
  return 0;
}

/** Backtest helper: same weighting as the live path for movement + rest context. */
function scoreNewSignals({ movement, context }) {
  let delta = 0, dp = 0;
  void movementConfAdj;
  if (movement) { dp += 0.3; delta += movementSignal(movement).delta; }
  if (context && context.restLean) delta += context.restLean === 'h' ? W.rest : -W.rest;
  return { delta, dp };
}

// ---------- calibration --------------------------------------------------
let _cal = null, _calAt = 0;
function calibration() {
  if (_cal && Date.now() - _calAt < 3600e3) return _cal;
  try { _cal = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'history', 'calibration.json'), 'utf8')); } catch (_) { _cal = null; }
  _calAt = Date.now();
  return _cal;
}
const TOP = /英超|西甲|德甲|意甲|法甲|欧冠/;
const bin = c => c < 0.40 ? '<40' : c < 0.45 ? '40-45' : c < 0.50 ? '45-50' : c < 0.55 ? '50-55' : c < 0.62 ? '55-62' : '62+';
const band = p => p >= 0.6 ? 'fav' : p >= 0.45 ? 'mid' : 'open';
const MIN_N = 30;
const fpBand = p => { const b = Math.floor(p * 20) * 5; return b < 35 ? '<35' : b >= 75 ? '75+' : `${b}-${b + 5}`; };
const mvTag = fs => fs == null ? 'na' : fs >= 0.03 ? 'firm' : fs <= -0.03 ? 'drift' : 'flat';
/** Calibration keys, most specific first. */
function calKey({ lean, marketLean, favP, league, favShift }) {
  if (!lean || !marketLean || favP == null) return [];
  const kind = lean === marketLean ? 'same' : lean === 'd' ? 'revd' : 'revs';
  const fb = kind === 'same' ? fpBand(favP) : (favP >= 0.55 ? 'hi' : favP >= 0.45 ? 'mid' : 'lo');
  const tier = TOP.test(String(league || '')) ? 'top' : 'other';
  return [`fpm:${kind}|${fb}|${mvTag(favShift)}`, `fpt:${kind}|${fb}|${tier}`, `fp:${kind}|${fb}`, `fk:${kind}`];
}
/** Calibrated historical hit rate for a prediction; null rate when n<30. */
function calibrate({ conf, lean, marketLean, marketP, league, favShift }) {
  const cal = calibration();
  if (!cal || !cal.calibration || conf == null) return null;
  const t = cal.calibration;
  const ck = calKey({ lean, marketLean, favP: marketP, league, favShift });
  for (const k of ck) {
    const r = t[k];
    if (r && r.n >= MIN_N) return { rate: r.rate, n: r.n, key: k, enough: true };
  }
  if (ck.length) { const r = t[ck[ck.length - 1]]; return { rate: null, n: r ? r.n : 0, key: ck[ck.length - 1], enough: false }; }
  const b = bin(conf), kind = lean && marketLean && lean !== marketLean ? 'rev' : 'same';
  const keys = [];
  if (marketP != null) keys.push(`bkb:${b}|${kind}|${band(marketP)}`);
  keys.push(`bkt:${b}|${kind}|${TOP.test(String(league || '')) ? 'top' : 'other'}`, `bk:${b}|${kind}`, `b:${b}`);
  for (const k of keys) {
    const r = t[k];
    if (r && r.n >= MIN_N) return { rate: r.rate, n: r.n, key: k, enough: true };
  }
  const r = t[keys[keys.length - 1]];
  return { rate: null, n: r ? r.n : 0, key: keys[keys.length - 1], enough: false };
}
function upsetStats() {
  const cal = calibration();
  return cal && cal.upsetBadge ? cal.upsetBadge : null;
}
function edgeThreshold() {
  const cal = calibration();
  const t = cal && cal.edgeBadge && cal.edgeBadge.threshold;
  return t != null ? Number(t) : 0.04;
}
function edgeBadge() {
  const cal = calibration();
  return cal && cal.edgeBadge ? cal.edgeBadge : null;
}

module.exports = {
  W, PICK, contextFromRest, buildContextSignal, buildIntelSignal, keyPlayers, fetchLineups,
  movementSignal, movementConfAdj, calKey, scoreNewSignals, calibrate, calibration, upsetStats, edgeThreshold, edgeBadge, isDerby, motivation, capStatus,
};

/**
 * 1.9.98 upset classification. 'strong' = 逆盘口 + 热门方隐含概率较开盘下降≥2pp (best train ROI;
 * did NOT hold out-of-sample — badge shows the honest historical hit rate, no profit claim);
 * otherwise 'weak' (plain 逆盘口). Returns history stats for the badge.
 */
function classifyUpset({ lean, marketLean, marketP, movement }, stats) {
  const favP = marketP && marketLean ? marketP[marketLean] : null;
  const drift = movement && movement.shift && marketLean ? movement.shift[marketLean] : null;
  const strong = drift != null && drift <= -0.02;
  const st = stats ? (strong ? stats.strong : stats.base) : null;
  const all = st && st.all;
  return {
    level: strong ? 'strong' : 'weak',
    favDrift: drift,
    hist: all && all.n >= 30 ? { hit: all.hit, n: all.n, roi: all.roi } : (all ? { hit: null, n: all.n } : null),
  };
}
module.exports.classifyUpset = classifyUpset;
