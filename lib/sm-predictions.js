/**
 * SportMonks official predictions for the 预测 tab 赛前参考.
 * Token stays in heat-source.readToken — never written to disk HTML or the client pack.
 * SM probability values are percentages (0–100) and are stored as 0–1 fractions.
 * There is no Asian handicap / 让球 market in these types; do not invent one.
 * 竞彩 让球胜平负 (HHAD, 3-way) may be derived from the full correct-score
 * distribution plus the official 体彩 goal line, stored as pack.hhadPred.
 *
 * Close-of-betting snapshot: lock SM prediction numbers at official 体彩 停售.
 * Prefer poolCloseDate+poolCloseTime / closeMs / a closed official status
 * (poolStatus Close, 停售, etc.). If no official close instant is present,
 * freeze at Beijing kickoff (`date`+`time` as YYYY-MM-DDTHH:mm:00+08:00).
 * After freeze, do not update SM prediction numbers and never overwrite a
 * last-good snapshot with an empty/no-predictions pack. 盘口 stay on 体彩.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const SCHEMA = 1;
const FRESH_PRE_MS = 30 * 60 * 1000;
const FRESH_LIVE_MS = 45 * 1000;
const FRESH_FT_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;

const TYPE = {
  BTTS: 231,
  HAFU: 232,
  FIRST_HALF: 233,
  OU15: 234,
  OU25: 235,
  OU35: 236,
  FT: 237,
  SCORE_FIRST: 238,
  DOUBLE_CHANCE: 239,
  CORRECT_SCORE: 240,
  HOME_OU35: 326,
  AWAY_OU35: 327,
  AWAY_OU25: 328,
  HOME_OU25: 330,
  HOME_OU15: 331,
  AWAY_OU15: 332,
  AWAY_OU05: 333,
  HOME_OU05: 334,
  OU45: 1679,
  CORNERS_105: 1585,
  CORNERS_5: 1683,
  CORNERS_11: 1684,
  CORNERS_6: 1685,
  CORNERS_7: 1686,
  CORNERS_9: 1687,
  CORNERS_10: 1688,
  CORNERS_8: 1689,
  CORNERS_4: 1690,
};

const CORNER_LINES = [
  [TYPE.CORNERS_4, 4],
  [TYPE.CORNERS_5, 5],
  [TYPE.CORNERS_6, 6],
  [TYPE.CORNERS_7, 7],
  [TYPE.CORNERS_8, 8],
  [TYPE.CORNERS_9, 9],
  [TYPE.CORNERS_10, 10],
  [TYPE.CORNERS_105, 10.5],
  [TYPE.CORNERS_11, 11],
];

const TEAM_OU = {
  home: [
    ['ou05', TYPE.HOME_OU05],
    ['ou15', TYPE.HOME_OU15],
    ['ou25', TYPE.HOME_OU25],
    ['ou35', TYPE.HOME_OU35],
  ],
  away: [
    ['ou05', TYPE.AWAY_OU05],
    ['ou15', TYPE.AWAY_OU15],
    ['ou25', TYPE.AWAY_OU25],
    ['ou35', TYPE.AWAY_OU35],
  ],
};

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'sm-predictions', `${matchId}.json`);
}

function readCache(matchId) {
  if (!matchId) return null;
  try {
    return JSON.parse(fs.readFileSync(cacheFile(matchId), 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(pack) {
  if (!pack || !pack.matchId) return pack;
  try {
    const file = cacheFile(pack.matchId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(pack));
    fs.renameSync(tmp, file);
  } catch { /* optional */ }
  return pack;
}

function isLiveState(name) {
  try {
    const sm = require('./sm-live-scores');
    return sm.SM_LIVE_STATES.has(name) || /INPLAY|LIVE/.test(name);
  } catch {
    return /INPLAY|LIVE|^HT$|^BREAK$|^ET/.test(name);
  }
}

function isFtState(name) {
  try {
    const sm = require('./sm-live-scores');
    return sm.SM_FT_STATES.has(name);
  } catch {
    return /^(FT|AET|FT_PEN|PEN_FT|AFTER_ET|AFTER_PEN|ENDED|FULL_?TIME)$/.test(name);
  }
}

function stateNameOf(fx) {
  try { return require('./sm-live-scores').stateName(fx); } catch {
    const st = (fx && fx.state) || {};
    return String(st.developer_name || st.short_name || st.name || fx.state_name || '')
      .toUpperCase().replace(/[\s-]+/g, '_');
  }
}

function phaseZhOf(name) {
  try {
    const sm = require('./sm-live-scores');
    if (sm.SM_LIVE_STATES && sm.SM_LIVE_STATES.has(name)) {
      if (name === 'HT') return '中场';
      if (name === 'BREAK') return '中场休息';
      if (/1ST/.test(name)) return '上半场';
      if (/2ND/.test(name)) return '下半场';
      return '进行中';
    }
    if (sm.SM_FT_STATES && sm.SM_FT_STATES.has(name)) {
      if (/PEN/.test(name)) return '点球结束';
      if (/AET|ET/.test(name)) return '加时完场';
      return '完场';
    }
  } catch { /* fall through */ }
  if (isLiveState(name)) return /HT|BREAK/.test(name) ? '中场' : '进行中';
  if (isFtState(name)) return '完场';
  return '未开赛';
}

function ttlFor(pack) {
  if (pack && pack.frozenAt && pack.hasPredictions) return Number.MAX_SAFE_INTEGER;
  const at = Number(pack && (pack.checkedAt || pack.fetchedAt)) || 0;
  if (!at) return 0;
  if (pack.ok === false || pack.reason === 'no-fixture' || pack.reason === 'no-team'
    || pack.reason === 'no-coverage' || pack.reason === 'no-token' || pack.reason === 'no-predictions'
    || pack.reason === 'no-match' || pack.hasPredictions === false) {
    return NEGATIVE_MS;
  }
  const st = String((pack.state && pack.state.short) || '').toUpperCase();
  if (isLiveState(st)) return FRESH_LIVE_MS;
  if (isFtState(st)) return FRESH_FT_MS;
  return FRESH_PRE_MS;
}

function cacheFresh(pack, now) {
  if (!pack || pack.schema !== SCHEMA) return false;
  if (pack.frozenAt && pack.hasPredictions) return true;
  const at = Number(pack.checkedAt || pack.fetchedAt) || 0;
  if (!at) return false;
  return (now - at) < ttlFor(pack);
}

function isGoodPack(pack) {
  return !!(pack && pack.schema === SCHEMA && pack.hasPredictions && pack.ok !== false);
}

function isFrozenPack(pack) {
  return !!(pack && pack.frozenAt && pack.frozenReason);
}

/** Parse a Beijing wall-clock instant. Accepts HH:mm or HH:mm:ss. */
function parseBeijingMs(date, time) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  let t = String(time == null ? '' : time).trim();
  if (!t) t = '00:00:00';
  if (/^\d{2}:\d{2}$/.test(t)) t = t + ':00';
  if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) return NaN;
  const ms = Date.parse(d + 'T' + t + '+08:00');
  return Number.isFinite(ms) ? ms : NaN;
}

function parseTimeValue(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return NaN;
  if (/^\d+$/.test(s) && s.length >= 12) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

function firstFiniteMs(values) {
  for (const v of values) {
    const ms = parseTimeValue(v);
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function closeMsFromPools(src) {
  const lists = [];
  if (Array.isArray(src && src.poolList)) lists.push(src.poolList);
  if (Array.isArray(src && src.oddsList)) lists.push(src.oddsList);
  if (Array.isArray(src && src.pools)) lists.push(src.pools);
  if (src && src.pools && typeof src.pools === 'object' && !Array.isArray(src.pools)) {
    lists.push(Object.values(src.pools));
  }
  for (const key of ['had', 'hhad', 'ttg', 'hafu', 'crs']) {
    if (src && src[key] && typeof src[key] === 'object') lists.push([src[key]]);
  }
  let best = NaN;
  for (const list of lists) {
    for (const pool of list || []) {
      if (!pool || typeof pool !== 'object') continue;
      const direct = firstFiniteMs([pool.poolCloseMs, pool.closeMs, pool.closeTime, pool.sellEndTime]);
      const combo = parseBeijingMs(pool.poolCloseDate || pool.closeDate, pool.poolCloseTime || pool.closeClock);
      const ms = Number.isFinite(direct) ? direct : combo;
      if (!Number.isFinite(ms)) continue;
      if (!Number.isFinite(best) || ms < best) best = ms;
    }
  }
  return best;
}

function kickoffMsOf(src) {
  if (!src || typeof src !== 'object') return NaN;
  const direct = firstFiniteMs([src.kickoffMs, src.kickoffAt]);
  if (Number.isFinite(direct)) return direct;
  return parseBeijingMs(src.date || src.matchDate, src.time || src.matchTime);
}

/**
 * Official 体彩 close instant when the feed actually provides one.
 * Canonical fields: poolCloseDate + poolCloseTime (and closeMs aliases).
 * Do not invent a close time if those fields are absent or empty.
 */
function officialCloseMsOf(src) {
  if (!src || typeof src !== 'object') return NaN;
  const direct = firstFiniteMs([
    src.closeMs, src.sportteryCloseMs, src.poolCloseMs,
    src.closeTime, src.sellEndTime, src.sellStopTime, src.stopSellTime, src.saleEndTime,
  ]);
  if (Number.isFinite(direct)) return direct;
  const combo = parseBeijingMs(
    src.poolCloseDate || src.closeDate || src.sellEndDate,
    src.poolCloseTime || src.sellEndClock
  );
  if (Number.isFinite(combo)) return combo;
  return closeMsFromPools(src);
}

function officialStatusOf(src) {
  if (!src || typeof src !== 'object') return '';
  return String(
    src.poolStatus || src.status || src.matchStatus || src.sellStatus
    || src.matchStatusName || src.sellStatusName || ''
  ).trim();
}

function isSellingStatus(st) {
  const s = String(st || '').trim();
  if (!s) return false;
  if (/^selling$/i.test(s) || s === '在售') return true;
  if (s === '1') return true;
  return false;
}

function isClosedStatus(st) {
  const s = String(st || '').trim();
  if (!s || isSellingStatus(s)) return false;
  if (/停售/.test(s)) return true;
  if (/^(close|closed|stop(?:ped)?(?:[\s_-]?sell(?:ing)?)?)$/i.test(s)) return true;
  if (/^(payout|define|finished|refund|live|inplay)$/i.test(s)) return true;
  if (/完场|已结束|已完成|已停售/.test(s)) return true;
  return false;
}

function extractCacheRows(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (raw.payload && Array.isArray(raw.payload.data)) return raw.payload.data;
  if (Array.isArray(raw.data)) return raw.data;
  if (raw.byId && typeof raw.byId === 'object') return Object.values(raw.byId);
  return [];
}

function lookupOfficialRecord(matchId) {
  if (!matchId) return null;
  const dir = dataDir();
  const files = [
    path.join(dir, 'sporttery-live-cache', 'matches.json'),
    path.join(dir, 'sporttery-live-cache', 'schedule.json'),
    path.join(dir, 'sporttery-live-cache', 'results.json'),
    path.join(dir, 'results-seen.json'),
  ];
  const want = String(matchId);
  let found = null;
  for (const file of files) {
    try {
      const rows = extractCacheRows(JSON.parse(fs.readFileSync(file, 'utf8')));
      for (const row of rows) {
        if (row && String(row.id || row.matchId) === want) {
          found = found ? Object.assign({}, found, row) : Object.assign({}, row);
          break;
        }
      }
    } catch { /* optional */ }
  }
  return found;
}

/**
 * Freeze at official 体彩 停售 when a close time or closed status is known.
 * If the close instant is missing, fall back to Beijing kickoff
 * (`date`+`time` as YYYY-MM-DDTHH:mm:00+08:00).
 */
function resolveFreeze(opts, now, record) {
  const clock = Number.isFinite(now) ? now : Date.now();
  const src = Object.assign({}, record || {}, opts || {});
  if (opts && opts.match && typeof opts.match === 'object') Object.assign(src, opts.match);
  const closeMs = officialCloseMsOf(src);
  const kickoffMs = kickoffMsOf(src);
  const status = officialStatusOf(src);
  if (Number.isFinite(closeMs)) {
    if (clock >= closeMs) {
      return { frozen: true, reason: 'sporttery-close', closeMs, kickoffMs, status };
    }
    return { frozen: false, reason: '', closeMs, kickoffMs, status };
  }
  if (isClosedStatus(status)) {
    return { frozen: true, reason: 'sporttery-close', closeMs: NaN, kickoffMs, status };
  }
  if (Number.isFinite(kickoffMs) && clock >= kickoffMs) {
    return { frozen: true, reason: 'kickoff-fallback', closeMs: kickoffMs, kickoffMs, status };
  }
  return { frozen: false, reason: '', closeMs: NaN, kickoffMs, status };
}

function freezeNoteZh(reason) {
  if (reason === 'sporttery-close') return '停售快照：展示体彩停售时的 SportMonks 预测。';
  if (reason === 'kickoff-fallback') return '停售快照：未取到官方停售时间，按开赛锁定。';
  return '';
}

function freezePack(pack, decision, clock) {
  if (!isGoodPack(pack)) return pack;
  if (isFrozenPack(pack)) return pack;
  const reason = (decision && decision.reason) || 'kickoff-fallback';
  const out = Object.assign({}, pack, {
    frozenAt: clock,
    frozenReason: reason,
    noteZh: pack.noteZh || freezeNoteZh(reason),
  });
  if (decision && Number.isFinite(decision.closeMs)) out.frozenCloseMs = decision.closeMs;
  return out;
}

function touchChecked(pack, clock) {
  if (!pack) return pack;
  return Object.assign({}, pack, { checkedAt: clock });
}

/** Persist a fetch result without wiping a last-good / frozen snapshot with an empty pack. */
function finalizePack(next, ctx) {
  const cached = ctx && ctx.cached;
  const decision = (ctx && ctx.decision) || { frozen: false, reason: '' };
  const clock = (ctx && ctx.clock) || Date.now();
  if (isGoodPack(cached) && !isGoodPack(next)) {
    const kept = decision.frozen ? freezePack(cached, decision, clock) : touchChecked(cached, clock);
    return writeCache(kept);
  }
  if (isGoodPack(next)) {
    const pack = decision.frozen ? freezePack(next, decision, clock) : next;
    return writeCache(pack);
  }
  if (next && next.matchId) return writeCache(next);
  if (cached && cached.schema === SCHEMA) return cached;
  return next;
}

function rememberFid(matchId, smId) {
  try { require('./sm-live-scores').rememberSmFixtureId(matchId, smId); } catch { /* optional */ }
}

function isCoverageError(err) {
  const code = Number(err && err.statusCode);
  if (code === 403) return true;
  const msg = String((err && (err.message || err)) || '').toLowerCase();
  const body = String((err && err.body && (err.body.message || err.body.error)) || '').toLowerCase();
  return /do not have access|current subscription|your plan|unauthorized/.test(msg + ' ' + body);
}

/** SM dumps wrap the API body as {response} or {payload}; live smGet returns the body. */
function unwrapDump(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.response && typeof raw.response === 'object') return raw.response;
  if (raw.payload && typeof raw.payload === 'object') return raw.payload;
  return raw;
}

function extractPredictionRows(body) {
  const src = unwrapDump(body);
  if (!src) return { rows: [], fixture: null };
  const data = src.data !== undefined ? src.data : src;
  if (Array.isArray(data)) return { rows: data, fixture: null };
  if (data && typeof data === 'object') {
    const rows = Array.isArray(data.predictions) ? data.predictions : [];
    return { rows, fixture: data };
  }
  if (Array.isArray(src.predictions)) return { rows: src.predictions, fixture: src };
  return { rows: [], fixture: null };
}

function rowByType(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const tid = Number(row.type_id || (row.type && row.type.id));
    if (!Number.isFinite(tid)) continue;
    map.set(tid, row);
  }
  return map;
}

/** Convert a SportMonks percentage (0–100) to a 0–1 fraction. */
function pct01(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n / 100;
}

function yesNo(pred) {
  if (!pred || typeof pred !== 'object') return null;
  const over = pct01(pred.yes);
  const under = pct01(pred.no);
  if (over == null && under == null) return null;
  const out = {};
  if (over != null) out.over = over;
  if (under != null) out.under = under;
  return out;
}

function yesNoNamed(pred, yesKey, noKey) {
  if (!pred || typeof pred !== 'object') return null;
  const yes = pct01(pred.yes);
  const no = pct01(pred.no);
  if (yes == null && no == null) return null;
  const out = {};
  if (yes != null) out[yesKey] = yes;
  if (no != null) out[noKey] = no;
  return out;
}

function cornerLine(pred, line) {
  if (!pred || typeof pred !== 'object') return null;
  const over = pct01(pred.yes);
  const under = pct01(pred.no);
  const exact = pct01(pred.equal);
  if (over == null && under == null && exact == null) return null;
  const out = { line };
  if (over != null) out.over = over;
  if (under != null) out.under = under;
  if (exact != null) out.exact = exact;
  return out;
}

function pickPred(row) {
  return (row && row.predictions) || null;
}

function buildWdl(pred) {
  if (!pred) return null;
  const h = pct01(pred.home);
  const d = pct01(pred.draw);
  const a = pct01(pred.away);
  if (h == null && d == null && a == null) return null;
  const out = {};
  if (h != null) out.h = h;
  if (d != null) out.d = d;
  if (a != null) out.a = a;
  return out;
}

function buildHafu(pred) {
  if (!pred) return null;
  const keys = {
    hh: 'home_home', hd: 'home_draw', ha: 'home_away',
    dh: 'draw_home', dd: 'draw_draw', da: 'draw_away',
    ah: 'away_home', ad: 'away_draw', aa: 'away_away',
  };
  const out = {};
  let any = false;
  for (const [k, src] of Object.entries(keys)) {
    const v = pct01(pred[src]);
    if (v != null) { out[k] = v; any = true; }
  }
  return any ? out : null;
}

function buildDoubleChance(pred) {
  if (!pred) return null;
  const hd = pct01(pred.draw_home);
  const ad = pct01(pred.draw_away);
  const ha = pct01(pred.home_away);
  if (hd == null && ad == null && ha == null) return null;
  const out = {};
  if (hd != null) out.hd = hd;
  if (ad != null) out.ad = ad;
  if (ha != null) out.ha = ha;
  return out;
}

function otherScoreLabel(key) {
  if (key === 'Other_1' || key === 'other_1') return '其他主胜';
  if (key === 'Other_2' || key === 'other_2') return '其他客胜';
  if (key === 'Other_X' || key === 'other_x' || key === 'Other_x') return '其他平局';
  return String(key);
}

const HHAD_COVERAGE_MIN = 0.90;

function parseGoalLine(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function goalLineFrom(src) {
  if (!src || typeof src !== 'object') return null;
  const n = parseGoalLine(src.goalLine);
  if (n != null) return n;
  return parseGoalLine(src.hhad && src.hhad.goalLine);
}

function resolveGoalLine(opts, record) {
  return goalLineFrom(opts)
    || (opts && goalLineFrom(opts.match))
    || (opts && goalLineFrom(opts.record))
    || goalLineFrom(record)
    || null;
}

function parseScoreKey(key) {
  const s = String(key || '').trim();
  if (!s) return null;
  if (s === 'Other_1' || s === 'other_1' || s === '其他主胜') return { kind: 'other1' };
  if (s === 'Other_2' || s === 'other_2' || s === '其他客胜') return { kind: 'other2' };
  if (s === 'Other_X' || s === 'other_x' || s === 'Other_x' || s === '其他平局') return { kind: 'otherX' };
  const m = s.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (m) return { kind: 'score', home: Number(m[1]), away: Number(m[2]) };
  return null;
}

function canonicalScoreKey(key) {
  const parsed = parseScoreKey(key);
  if (!parsed) return String(key);
  if (parsed.kind === 'score') return parsed.home + '-' + parsed.away;
  if (parsed.kind === 'other1') return 'Other_1';
  if (parsed.kind === 'other2') return 'Other_2';
  if (parsed.kind === 'otherX') return 'Other_X';
  return String(key);
}

/** 竞彩 HHAD settlement: compare (home + goalLine) vs away. */
function hhadBucket(home, away, goalLine) {
  const diff = home + goalLine - away;
  if (diff > 0) return 'h';
  if (diff === 0) return 'd';
  if (diff < 0) return 'a';
  return null;
}

/**
 * Derive 让胜/让平/让负 from a full correct-score map (0–1 fractions) and the
 * official 体彩 goal line. Never invent from 1X2 / wdl.
 *
 * Other_X / 其他平局: treat as a draw (unambiguous for any finite line).
 * Other_1 / 其他主胜: assign only if every home win lands in the same bucket
 * (true when goalLine > -1, e.g. gl >= 0). Otherwise leave unassigned.
 * Other_2 / 其他客胜: assign only if every away win lands in the same bucket
 * (true when goalLine < 1, e.g. gl <= 0). Otherwise leave unassigned.
 * Do not invent a split of the tail.
 *
 * Returns { h, d, a, goalLine, coverage, unassigned, source: 'correct-score' }
 * with h/d/a renormalized to sum to 1 from assigned mass when coverage is
 * at least HHAD_COVERAGE_MIN (0.90). Otherwise null.
 */
function deriveHhad(scores, goalLine) {
  const gl = parseGoalLine(goalLine);
  if (gl == null) return null;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return null;
  let h = 0, d = 0, a = 0, unassigned = 0, used = false;
  for (const [key, raw] of Object.entries(scores)) {
    const p = Number(raw);
    if (!Number.isFinite(p) || p < 0) continue;
    used = true;
    const parsed = parseScoreKey(key);
    let bucket = null;
    if (!parsed) bucket = null;
    else if (parsed.kind === 'score') bucket = hhadBucket(parsed.home, parsed.away, gl);
    else if (parsed.kind === 'otherX') bucket = hhadBucket(0, 0, gl);
    else if (parsed.kind === 'other1') bucket = (gl > -1) ? hhadBucket(1, 0, gl) : null;
    else if (parsed.kind === 'other2') bucket = (gl < 1) ? hhadBucket(0, 1, gl) : null;
    if (bucket === 'h') h += p;
    else if (bucket === 'd') d += p;
    else if (bucket === 'a') a += p;
    else unassigned += p;
  }
  if (!used) return null;
  const coverage = h + d + a;
  if (coverage < HHAD_COVERAGE_MIN) return null;
  return {
    h: h / coverage,
    d: d / coverage,
    a: a / coverage,
    goalLine: gl,
    coverage,
    unassigned,
    source: 'correct-score',
  };
}

function attachHhadPred(pack, goalLine) {
  if (!pack) return pack;
  const gl = parseGoalLine(goalLine);
  const derived = gl != null ? deriveHhad(pack.scores, gl) : null;
  const prev = pack.hhadPred || null;
  if (derived) {
    if (prev && prev.goalLine === derived.goalLine
      && prev.source === derived.source
      && prev.h === derived.h && prev.d === derived.d && prev.a === derived.a) {
      return pack;
    }
    return Object.assign({}, pack, { hhadPred: derived });
  }
  if (prev && gl != null && prev.goalLine !== gl) {
    return Object.assign({}, pack, { hhadPred: null });
  }
  return pack;
}

function buildCorrectScore(pred) {
  const scores = pred && (pred.scores || pred);
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) return { top: null, totals: null, scores: null };
  const entries = [];
  const full = {};
  const bins = { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0, s7: 0 };
  let anyTot = false;
  for (const [k, raw] of Object.entries(scores)) {
    const p = pct01(raw);
    if (p == null) continue;
    const canon = canonicalScoreKey(k);
    full[canon] = (full[canon] || 0) + p;
    entries.push({ score: otherScoreLabel(k), p });
    const parsed = parseScoreKey(k);
    if (!parsed || parsed.kind !== 'score') continue;
    anyTot = true;
    const tot = parsed.home + parsed.away;
    if (tot >= 7) bins.s7 += p;
    else bins['s' + tot] += p;
  }
  entries.sort((a, b) => b.p - a.p);
  const top = entries.length ? entries.slice(0, 6) : null;
  let totals = null;
  if (anyTot) {
    totals = {};
    for (const [k, v] of Object.entries(bins)) {
      if (v > 0) totals[k] = v;
    }
    if (!Object.keys(totals).length) totals = null;
  }
  return { top, totals, scores: Object.keys(full).length ? full : null };
}

function buildTeamOu(byType) {
  const out = {};
  for (const side of ['home', 'away']) {
    const sideObj = {};
    let any = false;
    for (const [key, tid] of TEAM_OU[side]) {
      const yn = yesNo(pickPred(byType.get(tid)));
      if (yn) { sideObj[key] = yn; any = true; }
    }
    if (any) out[side] = sideObj;
  }
  return (out.home || out.away) ? out : null;
}

function buildCorners(byType) {
  const list = [];
  for (const [tid, line] of CORNER_LINES) {
    const row = cornerLine(pickPred(byType.get(tid)), line);
    if (row) list.push(row);
  }
  return list.length ? list : null;
}

function participantSide(fx) {
  const parts = (fx && fx.participants) || [];
  let home = null;
  let away = null;
  for (const p of parts) {
    const loc = String((p.meta && p.meta.location) || p.location || '').toLowerCase();
    if (loc === 'home') home = p;
    else if (loc === 'away') away = p;
  }
  return { home, away };
}

function inferStateShort(opts, now) {
  try {
    const mid = opts && opts.matchId;
    if (mid) {
      const mf = require('./sm-matchfacts').readCache(mid);
      if (mf && mf.state && mf.state.short) return String(mf.state.short).toUpperCase();
    }
  } catch { /* optional */ }
  const ko = Number(opts && opts.kickoffMs);
  if (!Number.isFinite(ko)) return '';
  if (now < ko) return 'NS';
  if (now < ko + 3.5 * 3600e3) return 'INPLAY';
  return 'FT';
}

function emptyPack(opts, reason, clock, extra) {
  return Object.assign({
    ok: reason !== 'upstream',
    schema: SCHEMA,
    matchId: String((opts && opts.matchId) || ''),
    smFixtureId: null,
    fetchedAt: clock,
    reason: reason || '',
    error: reason === 'upstream' ? '预测数据暂时不可用' : '',
    state: { short: '', nameZh: '' },
    home: { id: null, name: '', nameZh: (opts && (opts.homeZh || opts.home)) || '' },
    away: { id: null, name: '', nameZh: (opts && (opts.awayZh || opts.away)) || '' },
    hasPredictions: false,
    wdl: null,
    ou15: null,
    ou25: null,
    ou35: null,
    ou45: null,
    btts: null,
    hafu: null,
    firstHalf: null,
    doubleChance: null,
    correctScore: null,
    scores: null,
    hhadPred: null,
    totals: null,
    corners: null,
    teamOu: null,
    scoreFirst: null,
  }, extra || {});
}

function buildPackFromRows(rows, opts, fixture) {
  const clock = (opts && opts.now) || Date.now();
  const byType = rowByType(rows);
  const wdl = buildWdl(pickPred(byType.get(TYPE.FT)));
  const ou15 = yesNo(pickPred(byType.get(TYPE.OU15)));
  const ou25 = yesNo(pickPred(byType.get(TYPE.OU25)));
  const ou35 = yesNo(pickPred(byType.get(TYPE.OU35)));
  const ou45 = yesNo(pickPred(byType.get(TYPE.OU45)));
  const btts = yesNoNamed(pickPred(byType.get(TYPE.BTTS)), 'yes', 'no');
  const hafu = buildHafu(pickPred(byType.get(TYPE.HAFU)));
  const firstHalf = buildWdl(pickPred(byType.get(TYPE.FIRST_HALF)));
  const doubleChance = buildDoubleChance(pickPred(byType.get(TYPE.DOUBLE_CHANCE)));
  const cs = buildCorrectScore(pickPred(byType.get(TYPE.CORRECT_SCORE)));
  const scores = (cs && cs.scores) || null;
  const hhadPred = deriveHhad(scores, resolveGoalLine(opts, null));
  const corners = buildCorners(byType);
  const teamOu = buildTeamOu(byType);
  const scoreFirst = buildWdl(pickPred(byType.get(TYPE.SCORE_FIRST)));
  const hasPredictions = !!(wdl || ou15 || ou25 || ou35 || ou45 || btts || hafu
    || firstHalf || doubleChance || (cs && cs.top && cs.top.length) || corners || teamOu || scoreFirst);

  let st = '';
  if (fixture) st = stateNameOf(fixture);
  if (!st) st = inferStateShort(opts, clock);
  const { home, away } = participantSide(fixture);
  const homeZh = (opts && (opts.homeZh || opts.home)) || (home && home.name) || '';
  const awayZh = (opts && (opts.awayZh || opts.away)) || (away && away.name) || '';
  const smId = (fixture && fixture.id)
    || (rows && rows[0] && rows[0].fixture_id)
    || (opts && opts.smFixtureId)
    || null;

  return {
    ok: true,
    schema: SCHEMA,
    matchId: String((opts && opts.matchId) || ''),
    smFixtureId: smId,
    fetchedAt: clock,
    reason: hasPredictions ? '' : 'no-predictions',
    error: '',
    state: { short: st, nameZh: st ? phaseZhOf(st) : '' },
    home: { id: (home && home.id) || null, name: (home && home.name) || '', nameZh: homeZh },
    away: { id: (away && away.id) || null, name: (away && away.name) || '', nameZh: awayZh },
    hasPredictions,
    wdl,
    ou15,
    ou25,
    ou35,
    ou45,
    btts,
    hafu,
    firstHalf,
    doubleChance,
    correctScore: (cs && cs.top) || null,
    scores,
    hhadPred,
    totals: (cs && cs.totals) || null,
    corners,
    teamOu,
    scoreFirst,
  };
}

function buildPackFromPayload(raw, opts) {
  const { rows, fixture } = extractPredictionRows(raw);
  return buildPackFromRows(rows, opts || {}, fixture);
}

async function resolveViaMatchfacts(fetchJson, opts) {
  const mf = require('./sm-matchfacts');
  return mf.resolveFixture(fetchJson, opts || {});
}

async function ensurePredictions(opts) {
  const clock = (opts && opts.now) || Date.now();
  const matchId = opts && opts.matchId ? String(opts.matchId) : '';
  const cached = matchId ? readCache(matchId) : null;
  const record = (opts && (opts.match || opts.record))
    || ((opts && (opts.status || opts.poolStatus || opts.poolCloseDate || opts.closeMs)) ? null : lookupOfficialRecord(matchId));
  const decision = resolveFreeze(opts, clock, record);
  const goalLine = resolveGoalLine(opts, record);
  if (goalLine != null) opts = Object.assign({}, opts, { goalLine });
  // After official 停售 (or kickoff fallback), serve and keep the last good snapshot.
  if (isGoodPack(cached) && (isFrozenPack(cached) || decision.frozen)) {
    const kept = !isFrozenPack(cached) ? writeCache(freezePack(cached, decision, clock)) : cached;
    return attachHhadPred(kept, goalLine);
  }
  if (cached && cacheFresh(cached, clock) && !(opts && opts.force)) return attachHhadPred(cached, goalLine);
  const fetchJson = (opts && opts.fetchImpl) || (heatSource.readToken() ? heatSource.smGet : null);
  if (!fetchJson || !matchId) {
    if (isGoodPack(cached) && decision.frozen) return attachHhadPred(writeCache(freezePack(cached, decision, clock)), goalLine);
    if (cached && cached.schema === SCHEMA) return attachHhadPred(cached, goalLine);
    return emptyPack(opts, fetchJson ? 'no-match' : 'no-token', clock);
  }
  let resolved;
  try {
    resolved = await resolveViaMatchfacts(fetchJson, opts || {});
  } catch (e) {
    if (isGoodPack(cached)) {
      return finalizePack(null, { cached, decision, clock });
    }
    if (cached && cached.schema === SCHEMA) return cached;
    if (isCoverageError(e)) return writeCache(emptyPack(opts, 'no-coverage', clock));
    const err = new Error('预测数据暂时不可用');
    err.cause = e;
    err.code = 'upstream';
    throw err;
  }
  if (!resolved || !resolved.id) {
    const reason = (resolved && resolved.reason) || 'no-fixture';
    return finalizePack(emptyPack(opts, reason, clock), { cached, decision, clock });
  }
  rememberFid(matchId, resolved.id);
  let body;
  let fixture = (resolved && resolved.preview) || null;
  try {
    body = await fetchJson(`/football/predictions/probabilities/fixtures/${resolved.id}`, { include: 'type' });
  } catch (e) {
    if (isCoverageError(e)) {
      return finalizePack(emptyPack(opts, 'no-coverage', clock, { smFixtureId: resolved.id }), { cached, decision, clock });
    }
    body = null;
    if (!(e && (e.statusCode === 404 || /no result/i.test(String(e.message || ''))))) {
      // Try fallback before giving up; only throw if both fail.
      try {
        const fb = await fetchJson(`/football/fixtures/${resolved.id}`, { include: 'predictions.type;state;participants' });
        const parsed = extractPredictionRows(fb);
        if (parsed.fixture) fixture = parsed.fixture;
        const pack = buildPackFromRows(parsed.rows, Object.assign({}, opts, { now: clock, smFixtureId: resolved.id }), fixture);
        return finalizePack(pack, { cached, decision, clock });
      } catch (e2) {
        if (isGoodPack(cached)) return finalizePack(null, { cached, decision, clock });
        if (cached && cached.schema === SCHEMA && cached.smFixtureId) return cached;
        if (isCoverageError(e2)) return finalizePack(emptyPack(opts, 'no-coverage', clock, { smFixtureId: resolved.id }), { cached, decision, clock });
        const err = new Error('预测数据暂时不可用');
        err.cause = e2;
        err.code = 'upstream';
        throw err;
      }
    }
  }
  let { rows, fixture: fxFromBody } = extractPredictionRows(body);
  if (fxFromBody) fixture = fxFromBody;
  if (!rows.length) {
    try {
      const fb = await fetchJson(`/football/fixtures/${resolved.id}`, { include: 'predictions.type;state;participants' });
      const parsed = extractPredictionRows(fb);
      rows = parsed.rows;
      if (parsed.fixture) fixture = parsed.fixture;
    } catch (e) {
      if (isCoverageError(e) && !rows.length && !fixture) {
        return finalizePack(emptyPack(opts, 'no-coverage', clock, { smFixtureId: resolved.id }), { cached, decision, clock });
      }
      // Keep empty probabilities result if fallback fails; do not invent numbers.
    }
  }
  const pack = buildPackFromRows(rows, Object.assign({}, opts, { now: clock, smFixtureId: resolved.id }), fixture);
  return finalizePack(pack, { cached, decision, clock });
}

module.exports = {
  SCHEMA,
  TYPE,
  FRESH_PRE_MS,
  FRESH_LIVE_MS,
  FRESH_FT_MS,
  NEGATIVE_MS,
  HHAD_COVERAGE_MIN,
  ensurePredictions,
  buildPackFromRows,
  buildPackFromPayload,
  extractPredictionRows,
  unwrapDump,
  pct01,
  cacheFresh,
  readCache,
  writeCache,
  emptyPack,
  ttlFor,
  isGoodPack,
  isFrozenPack,
  parseBeijingMs,
  officialCloseMsOf,
  officialStatusOf,
  isClosedStatus,
  resolveFreeze,
  freezePack,
  finalizePack,
  lookupOfficialRecord,
  deriveHhad,
  attachHhadPred,
  resolveGoalLine,
};
