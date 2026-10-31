// 1.9.2 Recent-form source: ESPN public site API (no key, reachable from Aliyun).
// Pulls a team's current-season FT results for its domestic league + UEFA comps.
// Team id resolved by English name against ESPN league team lists (cached 7d).
// Results cached per team 6h under live-stats/espn/. Never fabricates: only FT rows.
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const DIR = () => path.join(DATA_DIR, 'live-stats', 'espn');
const INDEX_TTL_MS = 7 * 864e5;
const FORM_TTL_MS = 6 * 3600e3;
const FORM_STALE_MS = 7 * 864e5;
const DOMESTIC = [
  'eng.1', 'eng.2', 'eng.3', 'esp.1', 'esp.2', 'ger.1', 'ger.2', 'ita.1', 'ita.2', 'fra.1', 'fra.2',
  'por.1', 'ned.1', 'ned.2', 'bel.1', 'aut.1', 'sui.1', 'sco.1', 'tur.1', 'gre.1', 'den.1', 'nor.1',
  'swe.1', 'fin.1', 'cze.1', 'rus.1', 'rou.1', 'irl.1',
  'jpn.1', 'chn.1', 'aus.1', 'ksa.1', 'usa.1', 'mex.1', 'bra.1', 'arg.1',
];
const CUPS = [
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
  'eng.league_cup', // EFL / 英联赛杯 — not on domestic league schedule feed
];
const FORM_CACHE_SCHEMA = 2;
/** sporttery teamId → ESPN { id, league } verified manually. */
const SEED = { '1128': { id: '4411', league: 'aut.1' } };

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f);
}
async function getJson(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 jingcai' } });
    if (!r.ok) throw new Error('ESPN HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(fc|afc|cf|sc|ac|fk|sk|sv|bk|if|club|de|cd|ud|calcio|1\.)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const LEARNED_FILE = () => path.join(DIR(), 'learned.json');
/** Persist sporttery→ESPN mapping learned from a matched fixture. Domestic league from index. */
async function learnTeam(sportteryTeamId, espnId, espnName) {
  const sid = String(sportteryTeamId || '');
  if (!sid || !espnId || SEED[sid]) return;
  const all = readJson(LEARNED_FILE(), {});
  if (all[sid] && all[sid].id === String(espnId)) return;
  const teams = await teamIndex();
  const hit = teams.find(t => t.id === String(espnId));
  if (!hit) return; // unknown domestic league → can't serve form/roster reliably
  all[sid] = { id: hit.id, league: hit.league, name: hit.name || espnName || '', learnedAt: new Date().toISOString() };
  try { writeJson(LEARNED_FILE(), all); } catch {}
}
let indexMem = null;
let indexInflight = null;
function teamIndex() {
  if (!indexInflight) indexInflight = buildIndex().finally(() => { indexInflight = null; });
  return indexInflight;
}
async function buildIndex() {
  const f = path.join(DIR(), 'teams-index.json');
  if (indexMem && Date.now() - indexMem.at < INDEX_TTL_MS) return indexMem.teams;
  const disk = readJson(f, null);
  if (disk && Date.now() - disk.at < INDEX_TTL_MS && disk.teams && disk.teams.length) {
    indexMem = disk; return disk.teams;
  }
  const teams = [];
  const queue = DOMESTIC.slice();
  async function worker() {
    while (queue.length) {
      const lg = queue.shift();
      try {
        const j = await getJson(`${BASE}/${lg}/teams`);
        const arr = (((j.sports || [])[0] || {}).leagues || [])[0];
        for (const t of (arr && arr.teams) || []) {
          const tm = t.team || {};
          teams.push({ id: String(tm.id), league: lg, name: tm.displayName || '', short: tm.shortDisplayName || '', abbr: tm.abbreviation || '' });
        }
      } catch (e) { console.warn('espn-form index', lg, e.message); }
    }
  }
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  if (teams.length) {
    indexMem = { at: Date.now(), teams };
    try { writeJson(f, indexMem); } catch {}
    return teams;
  }
  return (disk && disk.teams) || [];
}

/** candidates: English names (best first). Returns {id, league, name} or null. */
async function resolveTeam(sportteryTeamId, candidates) {
  const sid = String(sportteryTeamId || '');
  if (SEED[sid]) return { ...SEED[sid], name: '' };
  const learned = readJson(LEARNED_FILE(), {})[sid];
  if (learned && learned.id) return learned;
  const cands = [...new Set(candidates.map(norm).filter(x => x && x.length >= 3))];
  if (!cands.length) return null;
  const teams = await teamIndex();
  for (const c of cands) {
    const hit = teams.find(t => norm(t.name) === c || norm(t.short) === c);
    if (hit) return hit;
  }
  for (const c of cands) {
    const hits = teams.filter(t => {
      const n = norm(t.name);
      return (c.length >= 4 && (n.split(' ').includes(c) || n.startsWith(c + ' '))) ||
        (n.length >= 5 && c.includes(n));
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function parseEvents(j, espnId) {
  const out = [];
  for (const e of (j && j.events) || []) {
    const c = (e.competitions || [])[0];
    if (!c || !c.status || !c.status.type || !c.status.type.completed) continue;
    const comps = c.competitors || [];
    const h = comps.find(x => x.homeAway === 'home');
    const a = comps.find(x => x.homeAway === 'away');
    if (!h || !a) continue;
    const sc = x => { const s = x.score; const v = s && typeof s === 'object' ? s.value != null ? s.value : s.displayValue : s; const n = Number(v); return Number.isFinite(n) ? n : null; };
    const gh = sc(h), ga = sc(a);
    if (gh == null || ga == null) continue;
    const isHome = String(h.team && h.team.id) === String(espnId);
    const isAway = String(a.team && a.team.id) === String(espnId);
    if (!isHome && !isAway) continue;
    const lg = e.league && (e.league.shortName || e.league.name) || (e.seasonType && e.seasonType.name) || '';
    let outcome = 'D';
    // shootout winner flag when level after ET
    if (gh !== ga) outcome = (isHome ? gh > ga : ga > gh) ? 'W' : 'L';
    out.push({
      ts: Date.parse(e.date) || 0,
      utc: e.date,
      homeEn: (h.team && h.team.displayName) || '',
      awayEn: (a.team && a.team.displayName) || '',
      gh, ga, isHome, outcome, leagueEn: lg, espnEventId: e.id,
    });
  }
  return out;
}

/** Returns raw rows (FT only, date desc) or null. */
async function fetchTeamResults({ sportteryTeamId, candidates }) {
  const team = await resolveTeam(sportteryTeamId, candidates || []);
  if (!team) return null;
  const f = path.join(DIR(), 'form', `${team.id}.json`);
  const disk = readJson(f, null);
  if (disk && disk.schema >= FORM_CACHE_SCHEMA && Date.now() - disk.at < FORM_TTL_MS && disk.rows) {
    return { team, rows: disk.rows, cached: true };
  }
  const slugs = [team.league, ...CUPS];
  const rows = [];
  const seen = new Set();
  let okAny = false;
  await Promise.all(slugs.map(async lg => {
    try {
      const j = await getJson(`${BASE}/${lg}/teams/${team.id}/schedule`);
      okAny = true;
      for (const r of parseEvents(j, team.id)) {
        if (seen.has(r.espnEventId)) continue;
        seen.add(r.espnEventId); rows.push(r);
      }
    } catch (e) { if (lg === team.league) console.warn('espn-form schedule', team.id, lg, e.message); }
  }));
  // early season: add previous season of domestic league
  if (okAny && rows.length < 10) {
    try {
      const now = new Date();
      const yr = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const j = await getJson(`${BASE}/${team.league}/teams/${team.id}/schedule?season=${yr - 1}`);
      for (const r of parseEvents(j, team.id)) {
        if (seen.has(r.espnEventId)) continue;
        seen.add(r.espnEventId); rows.push(r);
      }
    } catch {}
  }
  if (!okAny) {
    if (disk && Date.now() - disk.at < FORM_STALE_MS && disk.rows) return { team, rows: disk.rows, cached: true, stale: true };
    return null;
  }
  rows.sort((x, y) => y.ts - x.ts);
  try { writeJson(f, { at: Date.now(), schema: FORM_CACHE_SCHEMA, team, rows }); } catch {}
  return { team, rows, cached: false };
}

const ROSTER_TTL_MS = 24 * 3600e3;
/** Current roster (ESPN). Returns { team, athletes, coach, cached } or null. */
async function fetchRoster({ sportteryTeamId, candidates }) {
  const team = await resolveTeam(sportteryTeamId, candidates || []);
  if (!team) return null;
  const f = path.join(DIR(), 'roster', `${team.id}.json`);
  const disk = readJson(f, null);
  if (disk && Date.now() - disk.at < ROSTER_TTL_MS && disk.athletes && disk.athletes.length) return { ...disk, cached: true };
  try {
    const j = await getJson(`${BASE}/${team.league}/teams/${team.id}/roster`);
    const athletes = (j.athletes || []).map(a => {
      const stat = {};
      for (const c of (((a.statistics || {}).splits || {}).categories || [])) for (const st of c.stats || []) stat[st.name] = st.value;
      return {
        id: String(a.id), name: a.displayName || a.fullName || '', firstName: a.firstName || '', lastName: a.lastName || '',
        jersey: a.jersey || '', position: (a.position && a.position.displayName) || '', age: a.age || null,
        dob: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : '', citizenship: a.citizenship || '',
        heightIn: a.height || null, weightLb: a.weight || null,
        headshot: (a.headshot && a.headshot.href) || '', flag: (a.flag && a.flag.href) || '',
        injured: !!(a.injuries && a.injuries.length),
        apps: stat.appearances, goals: stat.totalGoals, assists: stat.goalAssists,
      };
    }).filter(a => a.name);
    const coach = ((j.coach || [])[0]) || null;
    const out = { at: Date.now(), team: { ...team, name: (j.team && j.team.displayName) || team.name }, season: j.season && j.season.displayName, athletes,
      coach: coach ? `${coach.firstName || ''} ${coach.lastName || ''}`.trim() : '' };
    if (athletes.length) { try { writeJson(f, out); } catch {} }
    return { ...out, cached: false };
  } catch (e) {
    console.warn('espn-form roster', team.id, e.message);
    if (disk && disk.athletes) return { ...disk, cached: true, stale: true };
    return null;
  }
}
function findRosterPlayer(espnPlayerId) {
  const dir = path.join(DIR(), 'roster');
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return null; }
  for (const fn of files) {
    const d = readJson(path.join(dir, fn), null);
    const a = d && (d.athletes || []).find(x => x.id === String(espnPlayerId));
    if (a) return { athlete: a, team: d.team };
  }
  return null;
}

module.exports = { learnTeam, getJson, BASE, fetchRoster, findRosterPlayer, fetchTeamResults, resolveTeam, teamIndex, parseEvents, norm, SEED };
