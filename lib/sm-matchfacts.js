/**
 * SportMonks Match Facts + Trends for 情报 / 实时 / 情报整合.
 * Token stays in heat-source.readToken — never written to disk HTML or the client pack.
 * Numbers are parsed from the fixture payload only. Missing modules stay empty.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const SCHEMA = 2;
const FRESH_PRE_MS = 30 * 60 * 1000;
const FRESH_LIVE_MS = 30 * 1000;
const FRESH_FT_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;

const INCLUDE = 'matchfacts;trends;participants;state;events;scores;periods;league';

const LABEL_ZH = {
  'Very High': '很高',
  High: '偏高',
  Normal: '正常',
  Low: '偏低',
  'Very Low': '很低',
  'No values': '—',
};

const CAT_PALETTE = [
  ['statistics', '历史/本场统计', '#60A5FA'],
  ['streaks', '连续形态', '#E8A017'],
  ['statistic_comparisons', '联赛对比', '#2DD4BF'],
  ['players', '球员', '#FF7A9A'],
  ['coaches', '主帅', '#A78BFA'],
  ['referees', '裁判', '#94A3B8'],
];

const LAST5_METRICS = [
  { name: '胜率', typeId: 87860, field: 'percentage', kind: '%' },
  { name: '场均进球', typeId: 87864, field: 'average', kind: '1' },
  { name: '场均失球', typeId: 87865, field: 'average', kind: '1' },
  { name: '场均射门', typeId: 87870, field: 'average', kind: '1' },
  { name: '场均射正', typeId: 87871, field: 'average', kind: '1' },
  { name: '场均角球', typeId: 87866, field: 'average', kind: '1' },
];

const SEASON_METRICS = [
  { name: '场均期望进球', typeId: 109572 },
  { name: '场均射门', typeId: 109606 },
  { name: '场均射正', typeId: 109574 },
  { name: '场均角球', typeId: 109600 },
  { name: '场均进攻', typeId: 109604 },
  { name: '场均关键传球', typeId: 109596 },
];

const LIVE90_METRICS = [
  { name: '角球', typeId: 109563 },
  { name: '射门', typeId: 109587 },
  { name: '射正', typeId: 109598 },
  { name: '进攻', typeId: 109569 },
  { name: '危险进攻', typeId: 109567 },
];

const TREND_KEYS = [
  { key: 'pos', typeId: 45, cumulative: false },
  { key: 'pas', typeId: 80, cumulative: true },
  { key: 'sh', typeId: 42, cumulative: true },
  { key: 'sot', typeId: 86, cumulative: true },
  { key: 'at', typeId: 43, cumulative: true },
  { key: 'da', typeId: 44, cumulative: true },
];

const GOAL_BINS = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];

const GOAL_TYPE = 14;
const RED_TYPES = new Set([16, 20, 21]); // red, redcard, yellowredcard

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'sm-matchfacts', `${matchId}.json`);
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
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

function ttlFor(pack, now) {
  const at = Number(pack && pack.fetchedAt) || 0;
  if (!at) return 0;
  if (pack.ok === false || pack.reason === 'no-fixture' || pack.reason === 'no-team' || pack.reason === 'no-coverage' || pack.reason === 'no-token') {
    return NEGATIVE_MS;
  }
  const st = String((pack.state && pack.state.short) || '').toUpperCase();
  if (isLiveState(st)) return FRESH_LIVE_MS;
  if (isFtState(st)) return FRESH_FT_MS;
  return FRESH_PRE_MS;
}

function cacheFresh(pack, now) {
  if (!pack || pack.schema !== SCHEMA || !pack.fetchedAt) return false;
  return (now - Number(pack.fetchedAt)) < ttlFor(pack, now);
}

function teamLabel(name, fallback) {
  const raw = String(name || '').trim();
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  try {
    const zh = require('./league-tables').teamZh(raw);
    if (zh && /[\u4e00-\u9fff]/.test(String(zh))) return String(zh).trim();
  } catch { /* optional */ }
  return raw || fallback || '';
}

function playerLabel(name) {
  const raw = String(name || '').trim();
  if (!raw) return { zh: '', auto: false };
  try {
    const lt = require('./league-tables');
    const zh = lt.playerZh(raw) || raw;
    return { zh: zh || raw, auto: zh !== raw && !!(lt.playerZhAuto && lt.playerZhAuto(raw)) };
  } catch {
    return { zh: raw, auto: false };
  }
}

function leagueLabel(name, fallback) {
  const raw = String(name || fallback || '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  if (/nations\s*league/i.test(raw) || /uefa\s*nl/i.test(raw)) return '欧国联';
  if (/world\s*cup\s*qualif/i.test(raw)) return '世预赛';
  if (/world\s*cup/i.test(raw)) return '世界杯';
  if (/euro\s*qualif|european\s*qualif/i.test(raw)) return '欧预赛';
  if (/\beuros?\b|european\s*championship/i.test(raw)) return '欧洲杯';
  if (/copa\s*am[eé]rica/i.test(raw)) return '美洲杯';
  if (/asian\s*cup/i.test(raw)) return '亚洲杯';
  if (/friendly|friendlies/i.test(raw)) return '友谊赛';
  try {
    const zh = require('./league-tables').leagueZh(raw);
    if (zh && /[\u4e00-\u9fff]/.test(String(zh))) return String(zh).trim();
    if (zh && zh !== raw) return zh;
  } catch { /* optional */ }
  return raw;
}

function extractLeagueFromNl(nl) {
  const s = String(nl || '');
  const m = s.match(/last\s+\d+\s+(.+?)\s+matches/i)
    || s.match(/most recent\s+(.+?)\s+matches/i)
    || s.match(/in (?:the |their )?(?:last )?(?:UEFA |CAF |AFC |CONMEBOL |CONCACAF )?([A-Z][^,.]+?) matches/i);
  if (m) return leagueLabel(m[1]);
  if (/UEFA Nations League/i.test(s)) return '欧国联';
  return '';
}

function knownFidFromMaps(matchId) {
  if (!matchId) return null;
  try {
    const id = require('./sm-live-scores').smFixtureIdFromMap(matchId);
    if (id) return String(id);
  } catch { /* optional */ }
  try {
    const stored = require('./match-weather').readStore(matchId);
    const fid = stored && stored.payload && stored.payload.smFixtureId;
    if (fid) return String(fid);
  } catch { /* optional */ }
  try {
    const fp = path.join(dataDir(), 'sm-lineups', 'match-map.json');
    const map = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const rec = map['m:' + matchId] || map[matchId];
    if (rec && rec.smFixtureId) return String(rec.smFixtureId);
  } catch { /* optional */ }
  return null;
}

function rememberFid(matchId, smId) {
  try { require('./sm-live-scores').rememberSmFixtureId(matchId, smId); } catch { /* optional */ }
}


function clubPin(teamId, zh) {
  try {
    const sq = require('./squad-source');
    let en = '';
    try { en = heatSource.englishName(teamId, zh) || ''; } catch { /* optional */ }
    return sq.pinnedSmId(teamId, zh, en) || null;
  } catch {
    return null;
  }
}

async function resolveSmTeam(fetchJson, teamId, zh, known) {
  if (known) return known;
  const club = clubPin(teamId, zh);
  if (club) return club;
  try {
    const learned = require('./sm-team-map').learnedSmId(teamId);
    if (learned) return learned;
  } catch { /* map optional */ }
  if (heatSource.verifiedNtId) {
    const pinned = heatSource.verifiedNtId(zh, teamId);
    if (pinned) return pinned;
  }
  const names = [];
  const en = heatSource.englishName(teamId, zh);
  if (en) names.push(en);
  if (zh && String(zh).trim() && String(zh).trim() !== en) names.push(String(zh).trim());
  const queries = [];
  const seenQ = new Set();
  const pushQ = (s) => {
    const t = String(s || '').trim();
    const key = t.toLowerCase();
    if (!t || seenQ.has(key)) return;
    seenQ.add(key);
    queries.push(t);
  };
  try {
    const map = require('./sm-team-map');
    for (const name of names) {
      for (const q of map.teamSearchQueries(name, zh)) pushQ(q);
    }
  } catch {
    names.forEach(pushQ);
  }
  for (const name of names) pushQ(name);
  for (let i = 0; i < queries.length; i++) {
    const name = queries[i];
    let found;
    try {
      found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    } catch (e) {
      // A 422/timeout on one search string (e.g. unmapped 巴林) must not
      // abort the whole fixture resolve — try the next name, or return null
      // so the other side can still match by participant name.
      const code = Number(e && e.statusCode);
      if (code === 403) throw e;
      continue;
    }
    const picked = heatSource.pickTeamId(found && found.data, name);
    if (picked) return picked;
    if (heatSource.verifiedNtId) {
      const pinnedEn = heatSource.verifiedNtId(name, teamId);
      if (pinnedEn) return pinnedEn;
    }
  }
  return null;
}

function nameFolds(teamId, zh) {
  try {
    const folds = require('./sm-team-map').aliasFolds(teamId, zh);
    if (folds && folds.size) return folds;
  } catch { /* fall through to the local set */ }
  const folds = new Set();
  const add = (s) => {
    if (!s) return;
    try { folds.add(heatSource.foldTeam(s)); } catch { folds.add(String(s).toLowerCase()); }
  };
  add(zh);
  try { add(heatSource.englishName(teamId, zh)); } catch { /* optional */ }
  try { add(require('./i18n-football').natEn(zh)); } catch { /* optional */ }
  folds.delete('');
  return folds;
}

function participantMatches(p, folds) {
  if (!p || !folds || !folds.size) return false;
  const names = [p.name, p.display_name, p.short_code, p.common_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  let compatible = null;
  try { compatible = require('./sm-team-map').namesCompatible; } catch { /* optional */ }
  for (const n of names) {
    let f;
    try { f = heatSource.foldTeam(n); } catch { f = n.toLowerCase(); }
    if (folds.has(f)) return true;
    if (compatible) {
      for (const other of folds) {
        if (compatible(f, other)) return true;
      }
    }
  }
  return false;
}

async function resolveFixture(fetchJson, opts) {
  const knownFid = opts.smFixtureId || knownFidFromMaps(opts.matchId);
  if (knownFid) return { id: knownFid, fromCache: true };
  const homeSm = await resolveSmTeam(fetchJson, opts.homeTeamId, opts.homeZh || opts.home, opts.homeSmId);
  const awaySm = await resolveSmTeam(fetchJson, opts.awayTeamId, opts.awayZh || opts.away, opts.awaySmId);
  if (!homeSm && !awaySm) return { reason: 'no-team', homeSm, awaySm };
  const ko = Number.isFinite(opts.kickoffMs) ? opts.kickoffMs : Date.now();
  const anchor = homeSm || awaySm;
  const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${anchor}`, {
    include: 'participants',
    per_page: 25,
  });
  const rows = (body && body.data) || [];
  let hit = null;
  if (homeSm && awaySm) {
    hit = rows.find((fx) => {
      const ids = (fx.participants || []).map((p) => Number(p.id));
      return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
    });
  }
  if (!hit) {
    const otherFolds = homeSm && !awaySm
      ? nameFolds(opts.awayTeamId, opts.awayZh || opts.away)
      : (!homeSm && awaySm ? nameFolds(opts.homeTeamId, opts.homeZh || opts.home) : null);
    if (otherFolds && otherFolds.size) {
      hit = rows.find((fx) => {
        const parts = fx.participants || [];
        const ids = parts.map((p) => Number(p.id));
        if (anchor && !ids.includes(Number(anchor))) return false;
        return parts.some((p) => Number(p.id) !== Number(anchor) && participantMatches(p, otherFolds));
      });
    }
  }
  if (!hit || !hit.id) {
    try {
      const map = require('./sm-team-map');
      hit = map.pickFixtureByKickoff(rows, ko, { anchorSm: anchor });
    } catch { /* kickoff fallback is optional */ }
  }
  if (!hit || !hit.id) return { reason: 'no-fixture', homeSm, awaySm };
  let outHome = homeSm;
  let outAway = awaySm;
  try {
    const map = require('./sm-team-map');
    const remembered = map.rememberFromFixture(opts, hit, homeSm, awaySm);
    if (remembered && remembered.homeSm) outHome = remembered.homeSm;
    if (remembered && remembered.awaySm) outAway = remembered.awaySm;
  } catch { /* learning is optional */ }
  return { id: hit.id, preview: hit, homeSm: outHome, awaySm: outAway, fromCache: false };
}

function factScore(f) {
  let s = 0;
  if (f && f.natural_language) s += 1000;
  if (f && f.basis === 'team') s += 50;
  const d = (f && f.data) || {};
  const block = (d && typeof d.all === 'object' && d.all) ? d.all : d;
  if (block && typeof block === 'object') {
    s += Number(block.matches) || 0;
    s += Number(block.count) || 0;
    const ctx = block.context || {};
    if (ctx && typeof ctx === 'object') s += Number(ctx.value_datapoints) || 0;
    const live = block.live || {};
    if (live && typeof live === 'object' && live.current_minute) s += 10;
  }
  return s;
}

function findFact(facts, typeId, participant, scope) {
  const wantScope = scope || 'league_matches';
  const cands = (facts || []).filter((f) => (
    Number(f.type_id) === Number(typeId)
    && f.participant === participant
    && (f.scope || 'league_matches') === wantScope
  ));
  if (!cands.length) return null;
  return cands.reduce((best, f) => (factScore(f) > factScore(best) ? f : best), cands[0]);
}

function last5Block(facts, typeId, participant) {
  const f = findFact(facts, typeId, participant, 'league_matches');
  if (!f || !f.data) return null;
  return f.data.all && typeof f.data.all === 'object' ? f.data.all : f.data;
}

function comparisonAll(facts, typeId, participant) {
  const f = findFact(facts, typeId, participant, 'league_matches');
  if (!f || !f.data) return null;
  const block = f.data.all || f.data;
  if (!block || typeof block !== 'object') return null;
  const val = block.values && block.values.value;
  const mean = block.historic && block.historic.mean;
  const label = block.comparison && block.comparison.label;
  const nVal = val == null ? null : Number(val);
  const nMean = mean == null ? null : Number(mean);
  return {
    value: Number.isFinite(nVal) ? nVal : null,
    mean: Number.isFinite(nMean) ? nMean : null,
    label: label || '',
    nl: f.natural_language || '',
  };
}

function live90Block(facts, typeId, participant, venueKey) {
  const f = findFact(facts, typeId, participant, 'league_matches');
  if (!f || !f.data) return null;
  const block = f.data[venueKey] || f.data.all || {};
  const live = block.live && block.live.value;
  const mean = block.historic && block.historic.mean;
  const label = block.comparison && block.comparison.label;
  const nLive = live == null ? null : Number(live);
  const nMean = mean == null ? null : Number(mean);
  return {
    value: Number.isFinite(nLive) ? nLive : null,
    mean: Number.isFinite(nMean) ? nMean : null,
    label: label || '',
  };
}

// SportMonks shards player headshots by id % 32; related_player has no image_path.
function smPlayerCdn(playerId) {
  const n = Number(playerId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return 'https://cdn.sportmonks.com/images/soccer/players/' + (n % 32) + '/' + n + '.png';
}

function playerImageOf(rp) {
  if (!rp) return '';
  const raw = String(rp.image_path || rp.image || '').trim();
  if (/^https?:\/\//i.test(raw) && !/placeholder/i.test(raw) && !/\/0\.png(?:\?|$)/i.test(raw)) return raw;
  return smPlayerCdn(rp.player_id || rp.id);
}

function playerFact(facts, typeId, participant) {
  const f = findFact(facts, typeId, participant, 'league_matches');
  if (!f || !f.data) return null;
  const rp = f.data.related_player || null;
  const name = (rp && rp.display_name) || '';
  const n = Number(f.data.value);
  if (!name || !Number.isFinite(n)) return null;
  return {
    name,
    value: n,
    nl: f.natural_language || '',
    playerId: rp && (rp.player_id || rp.id) || null,
    image: playerImageOf(rp),
  };
}

function tagZh(label) {
  if (!label) return '';
  return LABEL_ZH[label] || label;
}

function fmtNum(v, kind) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (kind === '%') return Math.round(n);
  if (kind === '2') return Math.round(n * 100) / 100;
  if (kind === '1') return Math.round(n * 10) / 10;
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.05) return Math.round(n);
  return Math.round(n * 10) / 10;
}

function fmtText(v, kind) {
  const n = fmtNum(v, kind);
  if (n == null) return '—';
  if (kind === '1') return (Math.round(Number(n) * 10) / 10).toFixed(1);
  if (kind === '2') return (Math.round(Number(n) * 100) / 100).toFixed(2);
  return String(n);
}

function periodOrder(periods, trends) {
  const rows = periods || [];
  const ordered = rows.slice().sort((a, b) => {
    const ta = Number(a.started || a.ticking || a.sort_order || 0);
    const tb = Number(b.started || b.ticking || b.sort_order || 0);
    if (ta && tb && ta !== tb) return ta - tb;
    const da = String(a.description || a.type || a.name || a.ticking || '');
    const db = String(b.description || b.type || b.name || b.ticking || '');
    const rank = (d) => {
      const s = d.toUpperCase();
      if (/1ST|FIRST|1H/.test(s)) return 1;
      if (/2ND|SECOND|2H/.test(s)) return 2;
      if (/ET_1|ET1|EXTRA.*1/.test(s)) return 3;
      if (/ET_2|ET2|EXTRA.*2/.test(s)) return 4;
      return 9;
    };
    return rank(da) - rank(db);
  });
  if (ordered.length >= 2) {
    return {
      first: Number(ordered[0].id),
      second: Number(ordered[1].id),
    };
  }
  // Infer from trend minutes when periods are missing.
  const by = new Map();
  for (const t of trends || []) {
    const id = Number(t.period_id);
    if (!Number.isFinite(id)) continue;
    const m = Number(t.minute);
    if (!Number.isFinite(m)) continue;
    const cur = by.get(id) || { min: m, max: m };
    cur.min = Math.min(cur.min, m);
    cur.max = Math.max(cur.max, m);
    by.set(id, cur);
  }
  const ids = [...by.entries()].sort((a, b) => a[1].min - b[1].min || a[0] - b[0]);
  return {
    first: ids[0] ? ids[0][0] : null,
    second: ids[1] ? ids[1][0] : null,
  };
}

function isSecondPeriod(periodId, order) {
  if (order && order.second != null && Number(periodId) === Number(order.second)) return true;
  return false;
}

/**
 * Hold-last (step) series from observed points. Minutes without a sample stay
 * at the last observed value; leading minutes stay null. No linear interpolation.
 */
function buildSeries(trends, typeId, teamId, minutes, cumulative, order) {
  const rows = (trends || [])
    .filter((t) => Number(t.type_id) === Number(typeId) && Number(t.participant_id) === Number(teamId))
    .slice()
    .sort((a, b) => {
      const pa = isSecondPeriod(a.period_id, order) ? 1 : 0;
      const pb = isSecondPeriod(b.period_id, order) ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (Number(a.minute) - Number(b.minute)) || (Number(a.id) - Number(b.id));
    });
  const pts = [];
  let lastX = -1;
  let lastY = 0;
  for (const r of rows) {
    let x = Number(r.minute);
    if (!Number.isFinite(x)) continue;
    if (isSecondPeriod(r.period_id, order)) x = Math.max(x, 45);
    if (x < lastX) x = lastX;
    let y = Number(r.value);
    if (!Number.isFinite(y)) continue;
    if (cumulative && pts.length && y < lastY) y = lastY;
    pts.push([x, y]);
    lastX = x;
    lastY = y;
  }
  const ys = [];
  let j = 0;
  let cur = null;
  for (const m of minutes) {
    while (j < pts.length && pts[j][0] <= m) {
      cur = pts[j][1];
      j += 1;
    }
    ys.push(cur);
  }
  return ys;
}

function possessionStart(minutes, home, away) {
  for (let i = 0; i < minutes.length; i++) {
    const a = home[i];
    const b = away[i];
    if (a == null || b == null) continue;
    const kickoff = (Math.abs(a - 100) < 0.5 && Math.abs(b - 0) < 0.5)
      || (Math.abs(b - 100) < 0.5 && Math.abs(a - 0) < 0.5);
    if (!kickoff) return i;
  }
  return 0;
}

function homeAwayParticipants(fx) {
  const parts = (fx && fx.participants) || [];
  let home = null;
  let away = null;
  for (const p of parts) {
    const loc = String((p.meta && p.meta.location) || p.location || '').toLowerCase();
    if (loc === 'home') home = p;
    else if (loc === 'away') away = p;
  }
  if (!home && parts[0]) home = parts[0];
  if (!away && parts[1]) away = parts[1];
  return { home, away };
}

function scoreOf(fx) {
  try {
    const bag = require('./sm-live-scores').scoreFromBag(fx, 'CURRENT');
    if (bag && (bag.home != null || bag.away != null)) return bag;
  } catch { /* fall through */ }
  const { home, away } = homeAwayParticipants(fx);
  const bags = (fx && fx.scores) || [];
  let hs = null;
  let as_ = null;
  for (const row of bags) {
    const desc = String(row.description || '').toUpperCase();
    if (desc !== 'CURRENT' && desc !== 'LIVE') continue;
    const loc = String((row.score && row.score.participant) || '').toLowerCase();
    const n = row.score && row.score.goals;
    if (!Number.isFinite(Number(n))) continue;
    if (loc === 'home' || (home && Number(row.participant_id) === Number(home.id))) hs = Number(n);
    else if (loc === 'away' || (away && Number(row.participant_id) === Number(away.id))) as_ = Number(n);
  }
  return { home: hs, away: as_ };
}

function slimEvents(fx, homeId, awayId) {
  const out = [];
  let hs = 0;
  let as_ = 0;
  const evs = ((fx && fx.events) || []).slice().sort((a, b) => {
    const ma = Number(a.minute) + (Number(a.extra_minute) || 0) / 100;
    const mb = Number(b.minute) + (Number(b.extra_minute) || 0) / 100;
    return ma - mb || (Number(a.sort_order) - Number(b.sort_order)) || (Number(a.id) - Number(b.id));
  });
  for (const e of evs) {
    const tid = Number(e.type_id);
    const isGoal = tid === GOAL_TYPE;
    const isRed = RED_TYPES.has(tid);
    if (!isGoal && !isRed) continue;
    const pid = Number(e.participant_id);
    let side = null;
    if (homeId != null && pid === Number(homeId)) side = 'home';
    else if (awayId != null && pid === Number(awayId)) side = 'away';
    const typ = e.type || {};
    const code = String(typ.code || typ.developer_name || typ.name || '').toLowerCase();
    if (!side && /home/.test(code)) side = 'home';
    if (!side && /away/.test(code)) side = 'away';
    const minute = Number(e.minute);
    if (!Number.isFinite(minute)) continue;
    const extra = e.extra_minute != null && Number(e.extra_minute) ? Number(e.extra_minute) : 0;
    let score = null;
    if (isGoal) {
      const raw = String(e.result || '').trim();
      if (/^\d+\s*[-–:]\s*\d+$/.test(raw)) {
        score = raw.replace(/\s/g, '').replace(/[–:]/g, '-');
        const parts = score.split('-').map(Number);
        if (parts.length === 2 && parts.every(Number.isFinite)) {
          hs = parts[0];
          as_ = parts[1];
        }
      } else if (side === 'home') {
        hs += 1;
        score = hs + '-' + as_;
      } else if (side === 'away') {
        as_ += 1;
        score = hs + '-' + as_;
      }
    }
    out.push({
      minute,
      extra,
      side,
      kind: isGoal ? 'goal' : 'red',
      score: isGoal ? score : null,
      player: e.player_name || (e.player && (e.player.display_name || e.player.name)) || '',
    });
  }
  return out;
}

function insightCats(facts) {
  const raw = {};
  for (const f of facts || []) {
    const k = f.category || '';
    if (!k) continue;
    raw[k] = (raw[k] || 0) + 1;
  }
  const cats = CAT_PALETTE.map(([key, name, color]) => ({
    key, name, color, count: raw[key] || 0,
  }));
  const total = cats.reduce((s, c) => s + c.count, 0) || (facts || []).length;
  return { cats, total };
}

function streakLine(kind, streak, matches) {
  if (kind === 'win') return '赢了 ' + streak + ' 场';
  if (kind === 'unbeaten') return streak + ' 场不败';
  if (kind === 'loss') return '输了 ' + streak + ' 场';
  if (kind === 'btts') return streak + ' 场双方都进球';
  return streak + '/' + matches;
}

function buildStreaks(facts, homeZh, awayZh, leagueZh) {
  const specs = [
    { typeId: 76094, side: 'away', kind: 'win' },
    { typeId: 76097, side: 'away', kind: 'unbeaten' },
    { typeId: 76095, side: 'home', kind: 'loss' },
    { typeId: 81175, side: 'away', kind: 'btts' },
  ];
  const out = [];
  for (const spec of specs) {
    const f = findFact(facts, spec.typeId, spec.side, 'league_matches');
    if (!f || !f.data) continue;
    const block = (f.data.all && typeof f.data.all === 'object') ? f.data.all : f.data;
    const streak = Number(block.streak);
    const matches = Number(block.matches);
    if (!Number.isFinite(streak) || !Number.isFinite(matches) || matches <= 0) continue;
    const team = spec.side === 'home' ? homeZh : awayZh;
    const lg = extractLeagueFromNl(f.natural_language) || leagueZh;
    const scope = lg ? ('近 ' + matches + ' 场' + lg) : ('近 ' + matches + ' 场');
    out.push({
      side: spec.side,
      num: streak + '/' + matches,
      line1: team ? (team + scope) : scope,
      line2: streakLine(spec.kind, streak, matches),
    });
  }
  return out;
}

function buildLast5(facts) {
  const rows = [];
  for (const m of LAST5_METRICS) {
    const h = last5Block(facts, m.typeId, 'home');
    const a = last5Block(facts, m.typeId, 'away');
    const hv = h && h[m.field] != null ? Number(h[m.field]) : null;
    const av = a && a[m.field] != null ? Number(a[m.field]) : null;
    if (!Number.isFinite(hv) && !Number.isFinite(av)) continue;
    rows.push({
      name: m.name,
      home: Number.isFinite(hv) ? hv : null,
      away: Number.isFinite(av) ? av : null,
      kind: m.kind,
    });
  }
  const hb = findFact(facts, 87913, 'home', 'league_matches');
  const ab = findFact(facts, 87913, 'away', 'league_matches');
  const hp = hb && hb.data && hb.data.percentage != null ? Number(hb.data.percentage) : null;
  const ap = ab && ab.data && ab.data.percentage != null ? Number(ab.data.percentage) : null;
  if (Number.isFinite(hp) || Number.isFinite(ap)) {
    rows.push({ name: '双方都进球', home: hp, away: ap, kind: '%' });
  }
  const ho = findFact(facts, 87912, 'home', 'league_matches');
  const ao = findFact(facts, 87912, 'away', 'league_matches');
  const h25 = ho && ho.data && ho.data.over && ho.data.over['2_5'] && ho.data.over['2_5'].percentage;
  const a25 = ao && ao.data && ao.data.over && ao.data.over['2_5'] && ao.data.over['2_5'].percentage;
  const hn = h25 != null ? Number(h25) : null;
  const an = a25 != null ? Number(a25) : null;
  if (Number.isFinite(hn) || Number.isFinite(an)) {
    rows.push({ name: '总进球超过 2.5', home: hn, away: an, kind: '%' });
  }
  return rows;
}

function buildSeason(facts) {
  const rows = [];
  for (const m of SEASON_METRICS) {
    const h = comparisonAll(facts, m.typeId, 'home');
    const a = comparisonAll(facts, m.typeId, 'away');
    if (!h || !a || h.value == null || a.value == null) continue;
    const means = [h.mean, a.mean].filter((v) => v != null && Number.isFinite(v));
    const mean = means.length ? (means.reduce((s, v) => s + v, 0) / means.length) : null;
    rows.push({
      name: m.name,
      home: h.value,
      away: a.value,
      mean,
      homeTag: tagZh(h.label),
      awayTag: tagZh(a.label),
    });
  }
  return rows;
}

function buildLive90(facts) {
  const rows = [];
  for (const m of LIVE90_METRICS) {
    const h = live90Block(facts, m.typeId, 'home', 'home');
    const a = live90Block(facts, m.typeId, 'away', 'away');
    if (!h || !a || h.value == null || a.value == null) continue;
    rows.push({
      name: m.name,
      home: h.value,
      away: a.value,
      homeMean: h.mean,
      awayMean: a.mean,
      homeTag: tagZh(h.label),
      awayTag: tagZh(a.label),
    });
  }
  return rows;
}

function buildGoalBins(facts) {
  const h = findFact(facts, 87928, 'home', 'league_matches');
  const a = findFact(facts, 87928, 'away', 'league_matches');
  if (!h && !a) return null;
  const hd = (h && h.data) || {};
  const ad = (a && a.data) || {};
  const home = GOAL_BINS.map((b) => (Number.isFinite(Number(hd[b])) ? Number(hd[b]) : 0));
  const away = GOAL_BINS.map((b) => (Number.isFinite(Number(ad[b])) ? Number(ad[b]) : 0));
  if (!home.some(Boolean) && !away.some(Boolean)) return null;
  return { labels: GOAL_BINS.slice(), home, away };
}

function buildPlayers(facts, homeZh, awayZh) {
  const out = [];
  for (const side of ['home', 'away']) {
    const team = side === 'home' ? homeZh : awayZh;
    const xg = playerFact(facts, 76114, side);
    const xgot = playerFact(facts, 76101, side);
    if (xg) {
      const lab = playerLabel(xg.name);
      out.push({
        side, team, metric: '场均 xG', name: xg.name, nameZh: lab.zh || xg.name, value: xg.value,
        playerId: xg.playerId || null, image: xg.image || '',
      });
    }
    if (xgot) {
      const lab = playerLabel(xgot.name);
      out.push({
        side, team, metric: '场均 xGOT', name: xgot.name, nameZh: lab.zh || xgot.name, value: xgot.value,
        playerId: xgot.playerId || null, image: xgot.image || '',
      });
    }
  }
  return out;
}

function shortPlayer(name, nameZh) {
  const zh = String(nameZh || '').trim();
  if (/[\u4e00-\u9fff]/.test(zh)) return zh;
  const raw = String(name || nameZh || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/);
  return parts[parts.length - 1] || raw;
}

function buildBullets(facts, last5, season, players, streaks, homeZh, awayZh, leagueZh) {
  const out = [];
  const xg = season.find((r) => r.name === '场均期望进球');
  if (xg && xg.away != null && xg.mean != null) {
    const cmp = xg.away > xg.mean ? '高于' : (xg.away < xg.mean ? '低于' : '持平');
    const lg = leagueZh ? leagueZh : '联赛';
    out.push(
      awayZh + '场均 ' + fmtText(xg.away, '1') + ' 期望进球，' + cmp + lg + '均值 ' + fmtText(xg.mean, '1') + '。'
    );
  }
  const ov = last5.find((r) => r.name === '总进球超过 2.5');
  if (ov && ov.away != null) {
    const lg = leagueZh ? leagueZh : '';
    out.push(
      awayZh + '近 5 场' + lg + '，' + fmtText(ov.away, '%') + '% 的比赛总进球超过 2.5。'
    );
  }
  const gf = last5.find((r) => r.name === '场均进球');
  const loss = streaks.find((s) => s.side === 'home' && /输了/.test(s.line2));
  if (gf && gf.home != null && loss) {
    const lg = leagueZh ? leagueZh : '';
    out.push(
      homeZh + '近 5 场' + lg + '场均只进 ' + fmtText(gf.home, '1') + ' 球，' + loss.line2 + '。'
    );
  }
  const awayXg = players.find((p) => p.side === 'away' && p.metric === '场均 xG');
  const awayXgot = players.find((p) => p.side === 'away' && p.metric === '场均 xGOT');
  if (awayXg) {
    const lg = leagueZh ? leagueZh : '';
    const who = shortPlayer(awayXg.name, awayXg.nameZh);
    const xgotBit = awayXgot && awayXgot.name === awayXg.name
      ? '，xGOT 为 ' + fmtText(awayXgot.value, '2')
      : (awayXgot ? '，xGOT 最高为 ' + fmtText(awayXgot.value, '2') + '（' + shortPlayer(awayXgot.name, awayXgot.nameZh) + '）' : '');
    // Prefer the mockup pattern when the same player leads both.
    if (awayXgot && awayXgot.name === awayXg.name) {
      out.push(
        who + '近 10 场' + lg + '场均 xG 最高（' + fmtText(awayXg.value, '2') + '），xGOT 为 ' + fmtText(awayXgot.value, '2') + '。'
      );
    } else {
      out.push(who + '近 10 场' + lg + '场均 xG 最高（' + fmtText(awayXg.value, '2') + '）' + (xgotBit ? xgotBit : '') + '。');
    }
  }
  return out;
}

function buildTrends(fx, homeId, awayId) {
  const trends = fx.trends || [];
  if (!trends.length) return null;
  const order = periodOrder(fx.periods, trends);
  const maxMin = trends.reduce((m, t) => Math.max(m, Number(t.minute) || 0), 90);
  const end = Math.max(90, Math.min(120, Math.ceil(maxMin)));
  const minutes = [];
  for (let i = 0; i <= end; i++) minutes.push(i);
  const series = {};
  let any = false;
  for (const spec of TREND_KEYS) {
    const home = buildSeries(trends, spec.typeId, homeId, minutes, spec.cumulative, order);
    const away = buildSeries(trends, spec.typeId, awayId, minutes, spec.cumulative, order);
    if (home.some((v) => v != null) || away.some((v) => v != null)) any = true;
    series[spec.key] = { home, away };
  }
  if (!any) return null;
  const posStart = possessionStart(minutes, series.pos.home, series.pos.away);
  return { minutes, posStart, series };
}

function emptyPack(opts, reason, clock, extra) {
  return Object.assign({
    ok: reason !== 'upstream',
    schema: SCHEMA,
    matchId: String((opts && opts.matchId) || ''),
    smFixtureId: null,
    fetchedAt: clock,
    reason: reason || '',
    error: reason === 'upstream' ? '比赛事实暂时不可用' : '',
    state: { short: '', nameZh: '' },
    leagueZh: '',
    home: { id: null, name: '', nameZh: (opts && (opts.homeZh || opts.home)) || '' },
    away: { id: null, name: '', nameZh: (opts && (opts.awayZh || opts.away)) || '' },
    score: { home: null, away: null },
    insightTotal: 0,
    insightCats: [],
    streaks: [],
    last5: [],
    season: [],
    live90: [],
    goalBins: null,
    players: [],
    bullets: [],
    events: [],
    trends: null,
    hasFacts: false,
    hasTrends: false,
  }, extra || {});
}

function buildPackFromFixture(fx, opts) {
  const clock = (opts && opts.now) || Date.now();
  const { home, away } = homeAwayParticipants(fx);
  const homeZh = teamLabel((opts && (opts.homeZh || opts.home)) || (home && home.name), (home && home.name) || '主队');
  const awayZh = teamLabel((opts && (opts.awayZh || opts.away)) || (away && away.name), (away && away.name) || '客队');
  const officialZh = (opts && opts.league && /[\u4e00-\u9fff]/.test(String(opts.league)))
    ? String(opts.league).trim()
    : '';
  const leagueName = (fx.league && (fx.league.name || fx.league.short_code))
    || officialZh
    || (opts && opts.league)
    || '';
  // 竞彩官方联赛名优先。SM 的 "Serie A" 会被误译成意甲（巴甲同名）。
  let leagueZh = officialZh || leagueLabel(leagueName, '');
  if (!leagueZh) {
    const facts0 = Array.isArray(fx.matchfacts) ? fx.matchfacts : [];
    for (const f of facts0) {
      const lg = extractLeagueFromNl(f && f.natural_language);
      if (lg) { leagueZh = lg; break; }
    }
  }
  const st = stateNameOf(fx);
  const facts = Array.isArray(fx.matchfacts) ? fx.matchfacts : [];
  const streaks = buildStreaks(facts, homeZh, awayZh, leagueZh);
  const last5 = buildLast5(facts);
  const season = buildSeason(facts);
  const live90 = buildLive90(facts);
  const goalBins = buildGoalBins(facts);
  const players = buildPlayers(facts, homeZh, awayZh);
  const bullets = buildBullets(facts, last5, season, players, streaks, homeZh, awayZh, leagueZh);
  const cats = insightCats(facts);
  const homeId = home && home.id;
  const awayId = away && away.id;
  const events = slimEvents(fx, homeId, awayId);
  const trends = buildTrends(fx, homeId, awayId);
  const score = scoreOf(fx);
  const hasFacts = !!(streaks.length || last5.length || season.length || live90.length || goalBins || players.length || cats.total);
  return {
    ok: true,
    schema: SCHEMA,
    matchId: String((opts && opts.matchId) || ''),
    smFixtureId: fx.id || null,
    fetchedAt: clock,
    reason: '',
    error: '',
    state: { short: st, nameZh: phaseZhOf(st) },
    kickoff: fx.starting_at || '',
    leagueZh,
    home: { id: homeId || null, name: (home && home.name) || '', nameZh: homeZh },
    away: { id: awayId || null, name: (away && away.name) || '', nameZh: awayZh },
    score,
    insightTotal: cats.total,
    insightCats: cats.cats,
    streaks,
    last5,
    season,
    live90,
    goalBins,
    players,
    bullets,
    events,
    trends,
    hasFacts,
    hasTrends: !!trends,
  };
}

function isCoverageError(err) {
  const code = Number(err && err.statusCode);
  if (code === 403) return true;
  const msg = String((err && (err.message || err)) || '').toLowerCase();
  const body = String((err && err.body && (err.body.message || err.body.error)) || '').toLowerCase();
  return /do not have access|current subscription|your plan|unauthorized/.test(msg + ' ' + body);
}

async function ensureMatchfacts(opts) {
  const clock = (opts && opts.now) || Date.now();
  const matchId = opts && opts.matchId ? String(opts.matchId) : '';
  const cached = matchId ? readCache(matchId) : null;
  if (cached && cacheFresh(cached, clock) && !(opts && opts.force)) return cached;
  const fetchJson = (opts && opts.fetchImpl) || (heatSource.readToken() ? heatSource.smGet : null);
  if (!fetchJson || !matchId) {
    if (cached && cached.schema === SCHEMA) return cached;
    return emptyPack(opts, fetchJson ? 'no-match' : 'no-token', clock);
  }
  let resolved;
  try {
    resolved = await resolveFixture(fetchJson, opts || {});
  } catch (e) {
    if (cached && cached.schema === SCHEMA) return cached;
    if (isCoverageError(e)) return writeCache(emptyPack(opts, 'no-coverage', clock));
    const err = new Error('比赛事实暂时不可用');
    err.cause = e;
    err.code = 'upstream';
    throw err;
  }
  if (!resolved || !resolved.id) {
    const reason = (resolved && resolved.reason) || 'no-fixture';
    return writeCache(emptyPack(opts, reason, clock));
  }
  rememberFid(matchId, resolved.id);
  let body;
  try {
    body = await fetchJson(`/football/fixtures/${resolved.id}`, { include: INCLUDE });
  } catch (e) {
    if (cached && cached.schema === SCHEMA && cached.smFixtureId) return cached;
    if (isCoverageError(e)) return writeCache(emptyPack(opts, 'no-coverage', clock, { smFixtureId: resolved.id }));
    const err = new Error('比赛事实暂时不可用');
    err.cause = e;
    err.code = 'upstream';
    throw err;
  }
  const fx = body && body.data;
  if (!fx || !fx.id) {
    return writeCache(emptyPack(opts, 'no-fixture', clock, { smFixtureId: resolved.id }));
  }
  const pack = buildPackFromFixture(fx, Object.assign({}, opts, { now: clock }));
  return writeCache(pack);
}

module.exports = {
  SCHEMA,
  FRESH_PRE_MS,
  FRESH_LIVE_MS,
  FRESH_FT_MS,
  NEGATIVE_MS,
  INCLUDE,
  ensureMatchfacts,
  buildPackFromFixture,
  resolveFixture,
  resolveSmTeam,
  findFact,
  smPlayerCdn,
  playerImageOf,
  factScore,
  buildSeries,
  buildStreaks,
  buildLast5,
  buildSeason,
  buildLive90,
  buildGoalBins,
  buildPlayers,
  buildBullets,
  slimEvents,
  insightCats,
  tagZh,
  leagueLabel,
  periodOrder,
  possessionStart,
  cacheFresh,
  readCache,
  writeCache,
  emptyPack,
};
