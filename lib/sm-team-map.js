/**
 * Durable sporttery teamId → SportMonks team id, plus shared helpers so a
 * fixture can be recognized even when a 体彩/ESPN English long name does not
 * exactly equal the SportMonks short name.
 *
 * Mappings are learned from a resolved fixture's participants and reused
 * across predictions, match facts, and surface packs. They are not invented:
 * only ids that came from SportMonks (or a checked pin) are stored.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function mapFile() {
  return path.join(dataDir(), 'sm-team-map.json');
}

function emptyDoc() {
  return { schema: 1, teams: {} };
}

let _cache = null;
let _mtime = 0;

function foldOf(s) {
  try { return require('./heat-source').foldTeam(s); } catch {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_/]/g, ' ')
      .replace(/[^a-z0-9\u4e00-\u9fff ]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}

function load() {
  try {
    const file = mapFile();
    const st = fs.statSync(file);
    if (_cache && st.mtimeMs === _mtime) return _cache;
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const doc = j && typeof j === 'object' ? j : emptyDoc();
    if (!doc.teams || typeof doc.teams !== 'object') doc.teams = {};
    doc.schema = doc.schema || 1;
    _cache = doc;
    _mtime = st.mtimeMs;
    return _cache;
  } catch {
    _cache = emptyDoc();
    _mtime = 0;
    return _cache;
  }
}

function save(doc) {
  const file = mapFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, file);
  _cache = doc;
  try { _mtime = fs.statSync(file).mtimeMs; } catch { _mtime = Date.now(); }
}

/** Reset in-memory cache (tests). */
function resetCache() {
  _cache = null;
  _mtime = 0;
}

function learnedSmId(teamId) {
  const id = String(teamId == null ? '' : teamId).trim();
  if (!/^\d+$/.test(id)) return null;
  const row = load().teams[id];
  const sm = Number(row && row.smId);
  return sm > 0 ? sm : null;
}

/**
 * Persist a verified sporttery → SportMonks id. Refuses to overwrite a
 * different existing id (returns { conflict }). Idempotent when unchanged.
 */
function remember(teamId, smId, meta) {
  const id = String(teamId == null ? '' : teamId).trim();
  const sm = Number(smId);
  if (!/^\d+$/.test(id) || !(sm > 0)) return false;
  const doc = load();
  const prev = doc.teams[id];
  if (prev && Number(prev.smId) > 0 && Number(prev.smId) !== sm) {
    return { conflict: true, prev: Number(prev.smId), next: sm, teamId: id };
  }
  if (prev && Number(prev.smId) === sm) return false;
  const info = meta || {};
  doc.teams[id] = {
    smId: sm,
    zh: info.zh || (prev && prev.zh) || '',
    en: info.en || (prev && prev.en) || '',
    source: info.source || 'learned',
    matchId: info.matchId || (prev && prev.matchId) || '',
    at: Date.now(),
  };
  save(doc);
  return true;
}

const GENERIC_TOKENS = new Set([
  'fc', 'cf', 'sc', 'ac', 'afc', 'sf', 'united', 'city', 'club', 'de', 'the',
  'and', 'calcio', 'fk', 'bk', 'sk', 'if', 'il', 'ff', 'cd', 'ud', 'rc', 'as',
  'ss', 'aj', 'tsg', 'sv', 'vfb', 'vfl',
]);

/** True when two folded names are the same club, including long vs short forms. */
function namesCompatible(a, b) {
  const fa = foldOf(a);
  const fb = foldOf(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const ta = fa.split(' ').filter(Boolean);
  const tb = fb.split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!shorter.every((t) => longer.includes(t))) return false;
  return shorter.some((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

function queryKey(s) {
  return String(s || '').replace(/['’`.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pushQuery(out, s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length < 3 || /[\u4e00-\u9fff]/.test(t)) return;
  const key = queryKey(t);
  if (!key || out.some((x) => queryKey(x) === key)) return;
  if (out.length >= 8) return;
  out.push(t);
}

/**
 * Search strings for /football/teams/search, starting with the official
 * English name and then shorter prefixes (JEF United Ichihara-Chiba → JEF United).
 */
function teamSearchQueries(name, nameZh) {
  const out = [];
  pushQuery(out, name);
  const cleaned = String(name || '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  pushQuery(out, cleaned);
  const parts = cleaned.split(' ').filter(Boolean);
  for (let n = parts.length - 1; n >= 2; n--) {
    pushQuery(out, parts.slice(0, n).join(' '));
  }
  try {
    const sq = require('./squad-source');
    if (typeof sq.searchQueries === 'function') {
      for (const q of sq.searchQueries(name, nameZh)) pushQuery(out, q);
    }
  } catch { /* optional */ }
  try {
    const tn = require('./team-names');
    if (typeof tn.extraQueries === 'function') {
      for (const q of tn.extraQueries(name, nameZh)) pushQuery(out, q);
    }
  } catch { /* optional */ }
  return out;
}

function aliasFolds(teamId, zh) {
  const folds = new Set();
  const add = (s) => {
    const f = foldOf(s);
    if (f) folds.add(f);
  };
  add(zh);
  try { add(require('./heat-source').englishName(teamId, zh)); } catch { /* optional */ }
  try { add(require('./i18n-football').natEn(zh)); } catch { /* optional */ }
  const label = String(zh || '').trim();
  if (label) {
    try {
      const { TEAM_ZH } = require('./league-tables');
      for (const [en, z] of Object.entries(TEAM_ZH || {})) {
        if (z === label) add(en);
      }
    } catch { /* optional */ }
    try {
      const tn = require('./team-names');
      if (typeof tn.extraQueries === 'function') {
        for (const q of tn.extraQueries('', label)) add(q);
      }
    } catch { /* optional */ }
  }
  folds.delete('');
  return folds;
}

function parseStartingAt(s) {
  const raw = String(s || '').trim();
  if (!raw) return NaN;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    return n < 1e12 ? n * 1000 : n;
  }
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return Date.parse(iso);
  return Date.parse(iso + 'Z');
}

function kickoffHits(fx, kickoffMs, tolMs) {
  const raw = fx && (fx.starting_at || fx.startingAt);
  let t = parseStartingAt(raw);
  if (!Number.isFinite(t) && fx && fx.starting_at_timestamp != null) {
    t = parseStartingAt(fx.starting_at_timestamp);
  }
  if (!Number.isFinite(t) || !Number.isFinite(kickoffMs)) return false;
  const tol = Number.isFinite(tolMs) ? tolMs : 45 * 60 * 1000;
  return Math.abs(t - kickoffMs) <= tol;
}

/** Unique fixture at the official kickoff (and, if given, involving anchorSm). */
function pickFixtureByKickoff(rows, kickoffMs, opts) {
  const options = opts || {};
  const anchor = options.anchorSm != null && options.anchorSm !== ''
    ? Number(options.anchorSm)
    : null;
  const cands = (Array.isArray(rows) ? rows : []).filter((fx) => {
    if (!fx || fx.id == null) return false;
    if (!kickoffHits(fx, kickoffMs, options.tolMs)) return false;
    if (!Number.isFinite(anchor)) return true;
    const ids = (fx.participants || []).map((p) => Number(p.id));
    return ids.includes(anchor);
  });
  if (cands.length === 1) return cands[0];
  return null;
}

function participantSmIds(fx) {
  return ((fx && fx.participants) || [])
    .map((p) => Number(p && p.id))
    .filter((id) => id > 0);
}

function sideSmFromFixture(fx, knownHomeSm, knownAwaySm) {
  const parts = (fx && fx.participants) || [];
  const ids = participantSmIds(fx);
  let homeSm = knownHomeSm ? Number(knownHomeSm) : null;
  let awaySm = knownAwaySm ? Number(knownAwaySm) : null;
  if (homeSm && ids.includes(homeSm) && !awaySm) {
    awaySm = ids.find((id) => id !== homeSm) || null;
  } else if (awaySm && ids.includes(awaySm) && !homeSm) {
    homeSm = ids.find((id) => id !== awaySm) || null;
  }
  if (!homeSm || !awaySm) {
    const loc = (p) => String((p && p.meta && p.meta.location) || p.location || '').toLowerCase();
    const homeP = parts.find((p) => loc(p) === 'home');
    const awayP = parts.find((p) => loc(p) === 'away');
    if (homeP && homeP.id && !homeSm) homeSm = Number(homeP.id);
    if (awayP && awayP.id && !awaySm) awaySm = Number(awayP.id);
  }
  return {
    homeSm: homeSm > 0 ? homeSm : null,
    awaySm: awaySm > 0 ? awaySm : null,
  };
}

function rememberFromFixture(opts, fx, homeSm, awaySm) {
  const sides = sideSmFromFixture(fx, homeSm, awaySm);
  const o = opts || {};
  const out = { learned: [], conflicts: [] };
  const pairs = [
    [o.homeTeamId, sides.homeSm, o.homeZh || o.home, 'home'],
    [o.awayTeamId, sides.awaySm, o.awayZh || o.away, 'away'],
  ];
  for (const [teamId, smId, zh] of pairs) {
    const r = remember(teamId, smId, {
      zh: zh || '',
      source: 'fixture',
      matchId: o.matchId || '',
    });
    if (r && r.conflict) out.conflicts.push(r);
    else if (r) out.learned.push({ teamId: String(teamId), smId });
  }
  return Object.assign(out, sides);
}

module.exports = {
  mapFile,
  resetCache,
  learnedSmId,
  remember,
  rememberFromFixture,
  namesCompatible,
  teamSearchQueries,
  aliasFolds,
  parseStartingAt,
  kickoffHits,
  pickFixtureByKickoff,
  sideSmFromFixture,
};
