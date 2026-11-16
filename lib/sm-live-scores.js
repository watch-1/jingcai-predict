/**
 * SportMonks live-score overlay for /api/live-scores.
 * Sporttery remains the official 竞彩 score source. SM fills clock/phase/events
 * and may correct lag. Never invent scores. Never treat jingcai / ESPN / API-Football
 * ids as SportMonks fixture ids (same class of clash as 359/367).
 * Token stays in heat-source.readToken — never log or return it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SM_INPLAY_TTL_MS = 45 * 1000;
const SM_FIXTURE_TTL_MS = 60 * 1000;
const SM_MAP_FILE = () => {
  const dir = process.env.DATA_DIR || (require('./db').DATA_DIR);
  return path.join(dir, 'sm-lineups', 'match-map.json');
};
const AF_MAP_FILE = () => {
  const dir = process.env.DATA_DIR || (require('./db').DATA_DIR);
  return path.join(dir, 'live-stats', 'fixture-map.json');
};

let smInplayCache = null; // { at, byFixtureId }
const smFixtureByIdCache = new Map(); // id -> { at, row }
const afFixtureIds = new Set();
let afFixtureIdsAt = 0;

const SM_LIVE_STATES = new Set([
  'INPLAY', 'INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT', 'BREAK',
  'ET', 'ET_BREAK', 'ET_1ST_HALF', 'ET_2ND_HALF', 'PEN_LIVE',
  'INT', 'SUSP', 'DELAYED', 'LIVE',
]);
const SM_FT_STATES = new Set([
  'FT', 'AET', 'FT_PEN', 'PEN_FT', 'AFTER_ET', 'AFTER_PEN',
  'ENDED', 'FULLTIME', 'FULL_TIME',
]);
const SM_PHASE = {
  INPLAY_1ST_HALF: { phase: '1H', phaseZh: '上半场' },
  '1ST_HALF': { phase: '1H', phaseZh: '上半场' },
  HT: { phase: 'HT', phaseZh: '中场' },
  BREAK: { phase: 'HT', phaseZh: '中场' },
  INPLAY_2ND_HALF: { phase: '2H', phaseZh: '下半场' },
  '2ND_HALF': { phase: '2H', phaseZh: '下半场' },
  INPLAY: { phase: 'LIVE', phaseZh: '进行中' },
  LIVE: { phase: 'LIVE', phaseZh: '进行中' },
  ET: { phase: 'ET', phaseZh: '加时' },
  ET_1ST_HALF: { phase: 'ET', phaseZh: '加时' },
  ET_2ND_HALF: { phase: 'ET', phaseZh: '加时' },
  ET_BREAK: { phase: 'ET', phaseZh: '加时休息' },
  PEN_LIVE: { phase: 'P', phaseZh: '点球' },
  INT: { phase: 'INT', phaseZh: '中断' },
  SUSP: { phase: 'SUSP', phaseZh: '暂停' },
  DELAYED: { phase: 'LIVE', phaseZh: '推迟开球' },
  FT: { phase: 'FT', phaseZh: '完场' },
  AET: { phase: 'AET', phaseZh: '加时完场' },
  AFTER_ET: { phase: 'AET', phaseZh: '加时完场' },
  FT_PEN: { phase: 'PEN', phaseZh: '点球结束' },
  PEN_FT: { phase: 'PEN', phaseZh: '点球结束' },
  AFTER_PEN: { phase: 'PEN', phaseZh: '点球结束' },
  ENDED: { phase: 'FT', phaseZh: '完场' },
  FULLTIME: { phase: 'FT', phaseZh: '完场' },
  FULL_TIME: { phase: 'FT', phaseZh: '完场' },
  NS: { phase: 'NS', phaseZh: '未开赛' },
};

function goalSum(h, a) {
  if (h == null || a == null) return null;
  const n = Number(h) + Number(a);
  return Number.isFinite(n) ? n : null;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function loadAfFixtureIdSet() {
  const now = Date.now();
  if (afFixtureIdsAt && now - afFixtureIdsAt < 60 * 1000) return afFixtureIds;
  afFixtureIds.clear();
  const map = readJson(AF_MAP_FILE(), {});
  for (const v of Object.values(map || {})) {
    if (v && v.fixtureId != null && String(v.fixtureId) !== '') {
      afFixtureIds.add(String(v.fixtureId));
    }
  }
  afFixtureIdsAt = now;
  return afFixtureIds;
}

/**
 * An SM fixture id is only trusted when it comes from an explicit smFixtureId field.
 * Never use AF fixtureId, never use the 竞彩 matchId / jingcai tid itself.
 */
function isSafeSmFixtureId(smId, matchId) {
  const n = String(smId == null ? '' : smId).trim();
  if (!n || !/^\d+$/.test(n)) return false;
  if (matchId != null && n === String(matchId)) return false;
  if (loadAfFixtureIdSet().has(n)) return false;
  return true;
}

function smFixtureIdFromMap(matchId) {
  const mid = String(matchId || '');
  if (!mid) return '';
  const map = readJson(SM_MAP_FILE(), {});
  const rec = map['m:' + mid] || map[mid] || null;
  if (!rec || typeof rec !== 'object') return '';
  const sid = rec.smFixtureId != null ? rec.smFixtureId
    : (rec.sm_fixture_id != null ? rec.sm_fixture_id : '');
  return isSafeSmFixtureId(sid, mid) ? String(sid) : '';
}

function rememberSmFixtureId(matchId, smId) {
  const mid = String(matchId || '');
  if (!isSafeSmFixtureId(smId, mid)) return false;
  try {
    const file = SM_MAP_FILE();
    const map = readJson(file, {});
    const key = 'm:' + mid;
    const prev = map[key] && typeof map[key] === 'object' ? map[key] : {};
    if (String(prev.smFixtureId || '') === String(smId)) return true;
    map[key] = Object.assign({}, prev, {
      sportteryMatchId: mid,
      smFixtureId: String(smId),
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(map));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

function stateName(fx) {
  const st = (fx && fx.state) || {};
  const raw = st.developer_name || st.short_name || st.name || fx.state_name || '';
  return String(raw || '').toUpperCase().replace(/[\s-]+/g, '_');
}

function participantLocation(p) {
  return String((p && p.meta && p.meta.location) || p.location || '').toLowerCase();
}

function homeAwayIds(fx) {
  const parts = (fx && fx.participants) || [];
  let home = null;
  let away = null;
  for (const p of parts) {
    const loc = participantLocation(p);
    if (loc === 'home') home = p.id;
    else if (loc === 'away') away = p.id;
  }
  return { home, away };
}

function scoreFromBag(fx, which) {
  const want = String(which || 'CURRENT').toUpperCase();
  const bags = (fx && fx.scores) || [];
  if (!bags.length) return { home: null, away: null };
  const { home: homeId, away: awayId } = homeAwayIds(fx);
  let home = null;
  let away = null;
  for (const row of bags) {
    const desc = String(row.description || row.name || (row.type && row.type.name) || '').toUpperCase();
    const typeCode = String((row.type && (row.type.code || row.type.developer_name)) || '').toUpperCase();
    const hit = desc.includes(want) || typeCode.includes(want)
      || (want === 'CURRENT' && (desc === 'CURRENT' || desc === 'LIVE' || typeCode === 'CURRENT'))
      || (want === '1ST_HALF' && /1ST|FIRST_HALF|半场/.test(desc + typeCode) && !/2ND|SECOND/.test(desc))
      || (want === '2ND_HALF' && /2ND|SECOND_HALF/.test(desc + typeCode));
    if (!hit) continue;
    const sc = row.score || row;
    if (sc && sc.goals != null && Number.isFinite(Number(sc.goals))) {
      const pid = row.participant_id != null ? Number(row.participant_id) : Number(sc.participant_id);
      if (homeId != null && pid === Number(homeId)) home = Number(sc.goals);
      else if (awayId != null && pid === Number(awayId)) away = Number(sc.goals);
      else {
        const loc = String(sc.participant || sc.location || row.location || '').toLowerCase();
        if (loc === 'home') home = Number(sc.goals);
        else if (loc === 'away') away = Number(sc.goals);
      }
    }
    if (sc && sc.home != null && Number.isFinite(Number(sc.home))) home = Number(sc.home);
    if (sc && sc.away != null && Number.isFinite(Number(sc.away))) away = Number(sc.away);
  }
  return { home, away };
}

function clockFromPeriods(fx) {
  const periods = (fx && fx.periods) || [];
  let minute = null;
  let minuteExtra = null;
  let ticking = null;
  for (const p of periods) {
    const desc = String(p.description || p.ticker || (p.type && p.type.name) || '').toUpperCase();
    const min = p.minutes != null ? Number(p.minutes) : (p.minute != null ? Number(p.minute) : null);
    const extra = p.extra_minute != null ? Number(p.extra_minute)
      : (p.time_added != null ? Number(p.time_added) : null);
    const isTicking = p.ticking === true || p.counts === true;
    if (isTicking || ticking == null) {
      if (Number.isFinite(min)) minute = min;
      if (Number.isFinite(extra) && extra > 0) minuteExtra = extra;
      if (isTicking) ticking = p;
    }
    if (!ticking && /CURRENT|INPLAY/.test(desc) && Number.isFinite(min)) minute = min;
  }
  return { minute, minuteExtra };
}

function eventKind(e) {
  const tid = Number(e && (e.type_id || (e.type && e.type.id)));
  const code = String((e && e.type && (e.type.code || e.type.developer_name || e.type.name)) || e.code || '').toLowerCase();
  if (tid === 14 || tid === 16 || /^(goal|penalty_goal)$/.test(code) || (code.includes('goal') && !/own|cancel|disallow/.test(code))) {
    if (tid === 15 || /own/.test(code)) return 'own-goal';
    return 'goal';
  }
  if (tid === 15) return 'own-goal';
  if (tid === 19 || /yellow/.test(code)) return 'yellow';
  if (tid === 20 || tid === 21 || /red|second.yellow/.test(code)) return 'red';
  return '';
}

function eventsFromSm(fx) {
  const raw = (fx && fx.events) || [];
  if (!raw.length) return { events: [], cards: null };
  const { home: homeId, away: awayId } = homeAwayIds(fx);
  const events = [];
  const yellow = { home: 0, away: 0 };
  const red = { home: 0, away: 0 };
  let sawCard = false;
  for (const e of raw) {
    const kind = eventKind(e);
    if (!kind) continue;
    const pid = e.participant_id != null ? Number(e.participant_id) : null;
    let side = '';
    if (homeId != null && pid === Number(homeId)) side = 'home';
    else if (awayId != null && pid === Number(awayId)) side = 'away';
    const minute = e.minute != null && Number.isFinite(Number(e.minute)) ? Number(e.minute) : null;
    const extra = e.extra_minute != null && Number.isFinite(Number(e.extra_minute)) ? Number(e.extra_minute) : null;
    const player = (e.player_name || (e.player && (e.player.display_name || e.player.name)) || '').trim();
    events.push({
      kind: kind === 'own-goal' ? 'goal' : kind,
      ownGoal: kind === 'own-goal',
      side,
      minute,
      minuteExtra: extra,
      player: player || '',
    });
    if (kind === 'yellow') { sawCard = true; if (side === 'home') yellow.home++; else if (side === 'away') yellow.away++; }
    if (kind === 'red') { sawCard = true; if (side === 'home') red.home++; else if (side === 'away') red.away++; }
  }
  return { events, cards: sawCard ? { yellow, red } : null };
}

function fromSm(fx) {
  if (!fx || fx.id == null) return null;
  const name = stateName(fx);
  const mapped = SM_PHASE[name] || null;
  const live = SM_LIVE_STATES.has(name) || /INPLAY|LIVE/.test(name);
  const finished = SM_FT_STATES.has(name) || mapped && mapped.phase === 'FT' || mapped && mapped.phase === 'AET' || mapped && mapped.phase === 'PEN';
  const cur = scoreFromBag(fx, 'CURRENT');
  const halfBag = scoreFromBag(fx, '1ST_HALF');
  const clock = clockFromPeriods(fx);
  const ev = eventsFromSm(fx);
  const homeScore = cur.home;
  const awayScore = cur.away;
  const phase = (mapped && mapped.phase) || (live ? 'LIVE' : finished ? 'FT' : 'NS');
  const phaseZh = (mapped && mapped.phaseZh) || (live ? '进行中' : finished ? '完场' : '未开赛');
  return {
    smFixtureId: String(fx.id),
    phase,
    phaseZh,
    minute: clock.minute,
    minuteExtra: clock.minuteExtra,
    live: !!live && !finished,
    finished: !!finished,
    homeScore,
    awayScore,
    full: homeScore != null && awayScore != null ? `${homeScore}:${awayScore}` : '',
    half: halfBag.home != null && halfBag.away != null ? `${halfBag.home}:${halfBag.away}` : '',
    halfHome: halfBag.home,
    halfAway: halfBag.away,
    events: ev.events,
    cards: ev.cards,
    source: 'sportmonks',
    smState: name || '',
  };
}

/**
 * Sporttery official score stays when present. SM fills clock/phase/events
 * and may correct lag (stale live, missing NS after KO, SM ahead of a frozen score).
 */
function mergeSmOverlay(cur, sm, mid, useSmClock) {
  cur = cur || { id: mid, source: 'sportmonks', half: '', full: '', cards: null };
  const staleLive = !!(cur.live && !cur.finished && sm.finished);
  const inPlay = !!(sm.live || cur.live) && !(sm.finished || cur.finished) && !staleLive;
  const smHasScore = sm.homeScore != null && sm.awayScore != null;
  const curHasScore = cur.homeScore != null && cur.awayScore != null;
  const smAhead = smHasScore && curHasScore
    && (goalSum(sm.homeScore, sm.awayScore) || 0) > (goalSum(cur.homeScore, cur.awayScore) || 0);
  const lag = staleLive
    || (smHasScore && !curHasScore)
    || (smHasScore && inPlay && smAhead)
    || (smHasScore && sm.finished && (!cur.finished || smAhead));
  let homeScore;
  let awayScore;
  let full;
  if (lag && smHasScore) {
    homeScore = sm.homeScore;
    awayScore = sm.awayScore;
    full = `${sm.homeScore}:${sm.awayScore}`;
  } else if (curHasScore) {
    homeScore = cur.homeScore;
    awayScore = cur.awayScore;
    full = cur.full || `${cur.homeScore}:${cur.awayScore}`;
  } else if (smHasScore) {
    homeScore = sm.homeScore;
    awayScore = sm.awayScore;
    full = `${sm.homeScore}:${sm.awayScore}`;
  } else {
    homeScore = cur.homeScore;
    awayScore = cur.awayScore;
    full = cur.full || '';
  }
  const half = (cur.half && String(cur.half).trim()) || sm.half || '';
  const merged = {
    ...cur,
    id: mid,
    live: staleLive ? false : (sm.live || !!cur.live),
    finished: sm.finished || !!cur.finished || staleLive,
    phase: useSmClock ? (sm.phase || cur.phase) : (cur.phase || sm.phase),
    phaseZh: useSmClock ? (sm.phaseZh || cur.phaseZh) : (cur.phaseZh || sm.phaseZh),
    minute: useSmClock && sm.minute != null ? sm.minute : (cur.minute != null ? cur.minute : sm.minute),
    minuteExtra: useSmClock && sm.minuteExtra != null ? sm.minuteExtra : (cur.minuteExtra != null ? cur.minuteExtra : sm.minuteExtra),
    homeScore,
    awayScore,
    full,
    half: half || cur.half || '',
    halfHome: cur.halfHome != null ? cur.halfHome : sm.halfHome,
    halfAway: cur.halfAway != null ? cur.halfAway : sm.halfAway,
    events: (sm.events && sm.events.length) ? sm.events : (cur.events || null),
    cards: sm.cards || cur.cards || null,
    smFixtureId: sm.smFixtureId || cur.smFixtureId || '',
    source: cur.source && cur.source !== 'sportmonks' && cur.source !== 'api-football'
      ? String(cur.source).replace(/\+sm$/, '') + '+sm'
      : (cur.source && cur.source.indexOf('sporttery') === 0 ? cur.source + '+sm' : 'sportmonks'),
    scoreSource: (lag && smHasScore) ? 'sm' : (cur.homeScore != null ? (cur.scoreSource || 'sporttery') : (smHasScore ? 'sm' : null)),
  };
  if (merged.finished) {
    merged.live = false;
    if (merged.phase !== 'AET' && merged.phase !== 'PEN') merged.phase = 'FT';
    merged.phaseZh = merged.phaseZh || '完场';
  }
  return merged;
}

function smClockBetter(cur, sm) {
  if (!sm) return false;
  const smHalf = sm.phase === '1H' || sm.phase === '2H' || sm.phase === 'HT'
    || sm.phase === 'ET' || sm.phase === 'P';
  const halfMismatch = smHalf && cur && cur.phase && sm.phase !== cur.phase;
  const smClockAhead = sm.minute != null && cur && cur.minute != null
    && Number(sm.minute) > Number(cur.minute);
  return !!(sm.live && sm.phase && (
    (cur && cur.phase === 'HT' && sm.phase !== 'HT')
    || (cur && cur.minute == null && sm.minute != null)
    || halfMismatch
    || smClockAhead
    || ((SM_LIVE_STATES.has(sm.smState) || smHalf) && (!cur || !cur.phase || cur.phase === 'LIVE' || cur.phase === 'NS'))
  )) || (!cur || (cur.minute == null && sm.phase));
}

async function smGet(pathUrl, params) {
  const heat = require('./heat-source');
  if (!heat.readToken || !heat.readToken()) return null;
  const fetchJson = heat.smGet;
  return fetchJson(pathUrl, params);
}

async function fetchSmInplay() {
  if (smInplayCache && Date.now() - smInplayCache.at < SM_INPLAY_TTL_MS) return smInplayCache;
  try {
    const body = await smGet('/football/livescores/inplay', {
      include: 'participants;scores;state;periods;events.type',
    });
    const byFixtureId = new Map();
    for (const row of (body && body.data) || []) {
      if (row && row.id != null) byFixtureId.set(String(row.id), row);
    }
    smInplayCache = { at: Date.now(), byFixtureId, ok: true };
    return smInplayCache;
  } catch (e) {
    if (smInplayCache) return smInplayCache;
    return { at: Date.now(), byFixtureId: new Map(), ok: false, error: e && e.message };
  }
}

async function fetchSmFixturesByIds(ids) {
  const want = [...new Set((ids || []).map(String).filter(Boolean))];
  const out = new Map();
  const miss = [];
  const now = Date.now();
  for (const id of want) {
    const hit = smFixtureByIdCache.get(id);
    if (hit && now - hit.at < SM_FIXTURE_TTL_MS) out.set(id, hit.row);
    else miss.push(id);
  }
  for (const id of miss) {
    try {
      const body = await smGet('/football/fixtures/' + encodeURIComponent(id), {
        include: 'participants;scores;state;periods;events.type',
      });
      const row = body && body.data;
      if (row && row.id != null) {
        smFixtureByIdCache.set(String(row.id), { at: Date.now(), row });
        out.set(String(row.id), row);
      }
    } catch {
      /* keep last-good / skip — league may be outside the trial plan */
    }
  }
  if (smFixtureByIdCache.size > 200) {
    const oldest = [...smFixtureByIdCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 80);
    for (const [k] of oldest) smFixtureByIdCache.delete(k);
  }
  return out;
}

function applySmRow(data, mid, sm, cur) {
  const useSmClock = smClockBetter(cur, sm);
  const merged = mergeSmOverlay(cur, sm, mid, useSmClock);
  data[mid] = merged;
  return merged;
}

function overlayInplay(data, ids, smPack) {
  if (!smPack || !smPack.byFixtureId) return { used: false, covered: [] };
  const covered = [];
  const byMid = new Map();
  for (const id of ids || []) {
    const sid = smFixtureIdFromMap(id);
    if (sid) byMid.set(sid, String(id));
  }
  for (const [fid, row] of smPack.byFixtureId) {
    const mid = byMid.get(String(fid));
    if (!mid) continue;
    if (ids.length && !ids.includes(mid) && !ids.includes(String(mid))) continue;
    const sm = fromSm(row);
    if (!sm) continue;
    const cur = data[mid] || { id: mid, source: 'sportmonks', half: '', full: '', cards: null };
    applySmRow(data, mid, sm, cur);
    covered.push(String(mid));
  }
  return { used: covered.length > 0, covered };
}

function invalidateSmLiveCache() {
  smInplayCache = null;
  smFixtureByIdCache.clear();
  afFixtureIds.clear();
  afFixtureIdsAt = 0;
}

module.exports = {
  fromSm,
  mergeSmOverlay,
  smClockBetter,
  isSafeSmFixtureId,
  smFixtureIdFromMap,
  rememberSmFixtureId,
  loadAfFixtureIdSet,
  scoreFromBag,
  eventsFromSm,
  stateName,
  fetchSmInplay,
  fetchSmFixturesByIds,
  overlayInplay,
  applySmRow,
  invalidateSmLiveCache,
  SM_INPLAY_TTL_MS,
  SM_FIXTURE_TTL_MS,
  SM_LIVE_STATES,
  SM_FT_STATES,
};
