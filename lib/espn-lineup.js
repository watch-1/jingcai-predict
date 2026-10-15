// 1.9.4: Match lineup (首发/替补/阵型) from ESPN summary. Never fabricates:
// - announced/finished: real lineup of THIS match
// - not yet announced: state + each team's previous match starting XI (clearly labeled)
'use strict';
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('./db');
const espn = require('./espn-form');

const DIR = () => path.join(DATA_DIR, 'live-stats', 'espn', 'lineup');
function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); }

const sbMem = new Map();
async function scoreboard(ymd) {
  const h = sbMem.get(ymd);
  if (h && Date.now() - h.at < 10 * 60e3) return h.events;
  const j = await espn.getJson(`${espn.BASE}/all/scoreboard?dates=${ymd}`, 15000);
  const events = (j.events || []).map(e => {
    const c = (e.competitions || [])[0] || {};
    const comp = c.competitors || [];
    const side = k => comp.find(x => x.homeAway === k) || {};
    return {
      id: String(e.id), ts: Date.parse(e.date), state: e.status && e.status.type && e.status.type.state,
      home: { id: String((side('home').team || {}).id || ''), name: (side('home').team || {}).displayName || '' },
      away: { id: String((side('away').team || {}).id || ''), name: (side('away').team || {}).displayName || '' },
    };
  });
  sbMem.set(ymd, { at: Date.now(), events });
  return events;
}
const ymdUtc = ts => new Date(ts).toISOString().slice(0, 10).replace(/-/g, '');

/** m: { date, time, homeTeamId, awayTeamId, home, away }. Returns { event, homeIsHome } or null. */
async function findEvent(m) {
  const ko = Date.parse(`${m.date}T${String(m.time || '00:00').slice(0, 5)}:00+08:00`);
  if (!Number.isFinite(ko)) return null;
  const cand = (id, zh) => { try { return require('./match-stats').espnCandidates(id, zh); } catch { return []; } };
  const [h, a] = await Promise.all([
    espn.resolveTeam(m.homeTeamId, cand(m.homeTeamId, m.home)).catch(() => null),
    espn.resolveTeam(m.awayTeamId, cand(m.awayTeamId, m.away)).catch(() => null),
  ]);
  const days = [...new Set([ymdUtc(ko), ymdUtc(ko - 864e5), ymdUtc(ko + 864e5)])];
  for (const d of days) {
    let evs = [];
    try { evs = await scoreboard(d); } catch { continue; }
    const near = evs.filter(e => Math.abs(e.ts - ko) <= 75 * 60e3);
    let best = null;
    for (const e of near) {
      const ids = [e.home.id, e.away.id];
      const hHit = h && ids.includes(String(h.id));
      const aHit = a && ids.includes(String(a.id));
      const score = (hHit ? 1 : 0) + (aHit ? 1 : 0);
      if (score && (!best || score > best.score)) best = { e, score };
    }
    if (best) {
      const e = best.e;
      // orientation: sporttery home ↔ ESPN home (neutral venues can flip)
      let homeIsHome = true;
      if (h && String(h.id) === e.away.id) homeIsHome = false;
      else if (a && String(a.id) === e.home.id) homeIsHome = false;
      // learn the side we could not resolve (e.g. 费内巴切 via 维拉)
      const sH = homeIsHome ? e.home : e.away;
      const sA = homeIsHome ? e.away : e.home;
      if (!h && best.score === 1) await espn.learnTeam(m.homeTeamId, sH.id, sH.name).catch(() => {});
      if (!a && best.score === 1) await espn.learnTeam(m.awayTeamId, sA.id, sA.name).catch(() => {});
      return { event: e, homeIsHome, espnHome: sH, espnAway: sA };
    }
  }
  return null;
}

function parseRoster(r) {
  const list = (r && r.roster) || [];
  const pl = p => ({
    espnId: String((p.athlete || {}).id || ''), name: (p.athlete || {}).displayName || '',
    number: p.jersey || '', pos: (p.position || {}).abbreviation || '', posName: (p.position || {}).displayName || '',
    place: Number(p.formationPlace || 0) || 0,
    subbedIn: !!p.subbedIn, subbedOut: !!p.subbedOut,
    subFor: p.subbedInFor && p.subbedInFor.athlete ? p.subbedInFor.athlete.displayName : '',
  });
  const starters = list.filter(p => p.starter).map(pl).sort((x, y) => x.place - y.place);
  const bench = list.filter(p => !p.starter).map(pl);
  return { team: (r.team || {}).displayName || '', espnTeamId: String((r.team || {}).id || ''), formation: r.formation || '', starters, bench };
}

async function summaryLineup(eventId, ttlMs) {
  const f = path.join(DIR(), `ev-${eventId}.json`);
  const disk = readJson(f, null);
  if (disk && Date.now() - disk.at < ttlMs) return disk.v;
  const j = await espn.getJson(`${espn.BASE}/all/summary?event=${eventId}`, 15000);
  const st = (((j.header || {}).competitions || [])[0] || {}).status || {};
  const rosters = (j.rosters || []).map(r => ({ homeAway: r.homeAway, ...parseRoster(r) }));
  const v = {
    eventId: String(eventId), state: (st.type || {}).state || '', statusZh: (st.type || {}).description || '',
    date: (((j.header || {}).competitions || [])[0] || {}).date || '',
    rosters: rosters.filter(r => r.starters.length >= 11 ? true : r.starters.length > 0),
  };
  try { writeJson(f, { at: Date.now(), v }); } catch {}
  return v;
}

/** previous finished match of a team (ESPN form cache) with real starters */
async function previousXI(sportteryTeamId, zh, beforeTs) {
  const cand = (() => { try { return require('./match-stats').espnCandidates(sportteryTeamId, zh); } catch { return []; } })();
  const res = await espn.fetchTeamResults({ sportteryTeamId, candidates: cand }).catch(() => null);
  if (!res || !res.rows) return null;
  const rows = res.rows.filter(r => r.ts < beforeTs - 3600e3).slice(0, 3);
  for (const r of rows) {
    try {
      const s = await summaryLineup(r.espnEventId, 7 * 864e5);
      const mine = s.rosters.find(x => x.espnTeamId === String(res.team.id));
      if (mine && mine.starters.length >= 11) {
        return { ...mine, fromEvent: { id: r.espnEventId, date: new Date(r.ts + 8 * 3600e3).toISOString().slice(0, 10), home: r.homeEn, away: r.awayEn, score: `${r.gh}:${r.ga}`, league: r.leagueEn } };
      }
    } catch {}
  }
  return null;
}

function applyZh(side) {
  if (!side) return side;
  let sq; try { sq = require('./squad'); } catch { return side; }
  const map = sq.nameZhMap();
  for (const p of [...side.starters, ...side.bench]) {
    const zh = sq.lookupNameZh(map, { id: 'espn:' + p.espnId, name: p.name });
    if (zh) p.nameZh = zh;
  }
  return side;
}

// ---- 1.9.5 photos: ESPN roster headshot → TSDB/AF squad cache (name/number match) → none ----
function pnorm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }
/** Club name aliases so ESPN "Internazionale" matches TSDB "Inter Milan", etc. */
const TEAM_ALIASES = {
  'internazionale': ['inter milan', 'inter', 'fc internazionale', 'inter nazional'],
  'bayern munich': ['fc bayern munich', 'bayern munchen', 'fc bayern munchen', 'bayern'],
  'athletic club': ['athletic bilbao', 'athletic'],
  'brighton hove albion': ['brighton', 'brighton and hove albion'],
  'brighton and hove albion': ['brighton', 'brighton hove albion'],
  'paris saint germain': ['psg', 'paris sg', 'paris saint-germain'],
  'manchester united': ['man united', 'man utd'],
  'manchester city': ['man city'],
  'tottenham hotspur': ['tottenham', 'spurs'],
  'wolverhampton wanderers': ['wolves', 'wolverhampton'],
  'nottingham forest': ['nott m forest', 'forest'],
  'atletico madrid': ['atletico de madrid', 'atleti'],
  'deportivo alaves': ['alaves'],
  'rayo vallecano': ['rayo'],
  'rb leipzig': ['rasenballsport leipzig', 'leipzig'],
  'borussia monchengladbach': ['monchengladbach', 'gladbach'],
  'borussia dortmund': ['dortmund', 'bvb'],
  'eintracht frankfurt': ['frankfurt'],
  'fc koln': ['cologne', 'koln', '1 fc koln'],
  'sc freiburg': ['freiburg'],
  'tsg hoffenheim': ['hoffenheim'],
  'bayer leverkusen': ['leverkusen'],
  'ajax amsterdam': ['ajax'],
  'psv eindhoven': ['psv'],
  'stade rennais': ['rennes'],
  'as monaco': ['monaco'],
  'olympique de marseille': ['marseille', 'om'],
  'olympique lyonnais': ['lyon', 'ol'],
  'west bromwich albion': ['west brom', 'wba'],
  'sheffield wednesday': ['sheff wed'],
  'sheffield united': ['sheff utd'],
  'queens park rangers': ['qpr'],
  'shanghai shenhua': ['shenhua'],
  'shanghai port': ['shanghai sipg', 'sipg'],
  'shandong taishan': ['shandong luneng', 'taishan'],
  'beijing guoan': ['guoan'],
  'wuhan three towns': ['wuhan'],
};
function teamKeys(name) {
  const n = pnorm(name).replace(/&/g, ' and ');
  const out = new Set([n]);
  if (!n) return out;
  for (const [k, vs] of Object.entries(TEAM_ALIASES)) {
    const all = [k, ...vs];
    if (all.some(a => n === a || n.includes(a) || a.includes(n))) all.forEach(a => out.add(a));
  }
  // also drop common suffixes
  out.add(n.replace(/\b(fc|cf|afc|sc|ac|as|ssc|rcd|ud|cd)\b/g, ' ').replace(/\s+/g, ' ').trim());
  return out;
}
function teamsMatch(a, b) {
  const A = teamKeys(a), B = teamKeys(b);
  for (const x of A) if (x && B.has(x)) return true;
  for (const x of A) for (const y of B) if (x && y && (x.includes(y) || y.includes(x))) return true;
  return false;
}
function namesLooseEqual(a, b) {
  const na = pnorm(a), nb = pnorm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ').filter(Boolean), tb = nb.split(' ').filter(Boolean);
  if (ta.length && tb.length && ta.every(t => nb.includes(t))) return true;
  if (ta.length && tb.length && tb.every(t => na.includes(t))) return true;
  // surname match when both multi-token and last token equal length>=4
  if (ta.length >= 2 && tb.length >= 2 && ta[ta.length - 1] === tb[tb.length - 1] && ta[ta.length - 1].length >= 4) {
    if (ta[0][0] === tb[0][0]) return true; // same initial
  }
  return false;
}

const photoMem = new Map();
async function photoPool(sportteryTeamId, zh) {
  const k = String(sportteryTeamId || zh || '');
  const h = photoMem.get(k);
  if (h && Date.now() - h.at < 6 * 3600e3) return h.pool;
  const pool = [];
  const sq = require('./squad');
  const withTimeout = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(() => r(null), ms))]);
  try {
    const es = await withTimeout(sq.loadSquadFromEspn({ teamId: sportteryTeamId, name: zh }), 10000);
    for (const p of (es && es.players) || []) pool.push({ src: 'espn', espnId: p.espnId, name: p.name, number: p.number, photo: p.photo, nat: p.nationality });
  } catch {}
  try {
    const lg = await withTimeout(sq.loadSquadLegacy({ teamId: sportteryTeamId, name: zh }), 10000);
    for (const p of (lg && lg.players) || []) if (p.photo) pool.push({ src: lg.source || 'thesportsdb', name: p.name, alt: p.nameAlt, number: p.number, photo: p.photo });
  } catch {}
  photoMem.set(k, { at: Date.now(), pool });
  return pool;
}
function pickPhoto(pool, p) {
  pool = pool.filter(x => x.photo);
  const byId = pool.find(x => x.espnId && x.espnId === p.espnId);
  if (byId) return byId;
  const n = pnorm(p.name);
  if (!n) return null;
  const full = pool.find(x => pnorm(x.name) === n || (x.alt && pnorm(x.alt) === n));
  if (full) return full;
  const sur = n.split(' ').pop();
  if (sur.length < 3) return null;
  const sameSur = pool.filter(x => pnorm(x.name).split(' ').pop() === sur);
  const withNo = sameSur.filter(x => x.number && p.number && String(x.number) === String(p.number));
  if (withNo.length === 1) return withNo[0];
  if (sameSur.length === 1 && (!sameSur[0].number || !p.number || String(sameSur[0].number) === String(p.number))) return sameSur[0];
  return null;
}
let _tsdb = null;
const TSDB_FILE = () => path.join(DIR(), '..', 'tsdb-photos.json');
function tsdbCache() { if (!_tsdb) _tsdb = readJson(TSDB_FILE(), {}); return _tsdb; }
function reloadTsdbCache() { _tsdb = readJson(TSDB_FILE(), {}); return _tsdb; }
const tsdbQ = []; const tsdbPending = new Map(); let tsdbRunning = false;
function tsdbEnqueue(name, teamName) {
  const key = pnorm(name) + '|' + pnorm(teamName);
  if (tsdbPending.has(key)) return tsdbPending.get(key);
  const pr = new Promise(res => tsdbQ.push({ key, name, team: pnorm(teamName), res }));
  tsdbPending.set(key, pr);
  if (!tsdbRunning) tsdbRun();
  return pr;
}
const teamRosterMem = new Map(); // pnorm(team) -> {at, players:[{name,url}]}
async function tsdbTeamPlayers(teamNorm) {
  if (!teamNorm) return [];
  const hit = teamRosterMem.get(teamNorm);
  if (hit && Date.now() - hit.at < 7 * 864e5) return hit.players;
  let players = [];
  try {
    // Prefer shortest distinctive query (alias), then raw name — max 2 lookups
    const rawKeys = [...teamKeys(teamNorm)].filter(Boolean).sort((a, b) => a.length - b.length);
    const queries = [];
    for (const q of rawKeys) { if (!queries.includes(q)) queries.push(q); if (queries.length >= 2) break; }
    let team = null;
    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      const tj = await espn.getJson('https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=' + encodeURIComponent(q), 8000);
      team = (tj.teams || []).find(t => teamsMatch(teamNorm, t.strTeam)) || null;
      if (!team && (tj.teams || []).length === 1 && teamsMatch(teamNorm, tj.teams[0].strTeam)) team = tj.teams[0];
      if (team) break;
      if (qi + 1 < queries.length) await new Promise(r => setTimeout(r, 2100));
    }
    if (team && team.idTeam) {
      await new Promise(r => setTimeout(r, 2100));
      const pj = await espn.getJson('https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=' + encodeURIComponent(team.idTeam), 12000);
      players = (pj.player || []).map(x => {
        const u = x.strCutout || x.strThumb || x.strRender || '';
        return { name: x.strPlayer || '', url: /^https?:\/\//.test(u) ? u : '', team: pnorm(x.strTeam || team.strTeam || '') };
      }).filter(x => x.name);
    }
  } catch (e) { if (/429/.test(String(e.message || e))) await new Promise(r => setTimeout(r, 30000)); }
  teamRosterMem.set(teamNorm, { at: Date.now(), players });
  return players;
}
function pickTsdbUrl(list, wantName, wantTeam) {
  const n = pnorm(wantName);
  if (!n || !list || !list.length) return '';
  const clubOk = (t) => !wantTeam || !t || teamsMatch(wantTeam, t);
  const urlOf = (x) => {
    const u = x.strCutout || x.strThumb || x.strRender || x.url || '';
    return /^https?:\/\//.test(u) ? u : '';
  };
  const exact = list.find(x => pnorm(x.strPlayer || x.name) === n && clubOk(x.strTeam || x.team));
  if (exact) return urlOf(exact);
  const soft = list.filter(x => clubOk(x.strTeam || x.team) && namesLooseEqual(wantName, x.strPlayer || x.name));
  const withUrl = soft.map(urlOf).filter(Boolean);
  if (withUrl.length === 1) return withUrl[0];
  if (soft.length === 1) return urlOf(soft[0]);
  return '';
}
async function tsdbRun() {
  tsdbRunning = true;
  while (tsdbQ.length) {
    const it = tsdbQ.shift();
    let url = '';
    let ok = false;
    try {
      const j = await espn.getJson('https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=' + encodeURIComponent(it.name), 8000);
      url = pickTsdbUrl(j.player || [], it.name, it.team);
      // short common names often miss the right club in search — fall back to club roster
      if (!url && it.team) {
        await new Promise(r => setTimeout(r, 2100));
        const roster = await tsdbTeamPlayers(it.team);
        url = pickTsdbUrl(roster, it.name, it.team);
      }
      ok = true;
    } catch (e) { if (/429/.test(String(e.message || e))) await new Promise(r => setTimeout(r, 30000)); }
    if (ok) {
      tsdbCache()[it.key] = { url, at: Date.now() };
      try { writeJson(TSDB_FILE(), tsdbCache()); } catch {}
    }
    tsdbPending.delete(it.key);
    it.res(url);
    await new Promise(r => setTimeout(r, 2100)); // free tier ~30 req/min
  }
  tsdbRunning = false;
}
async function applyPhotos(side, sportteryTeamId, zh) {
  if (!side) return side;
  let pool = [];
  try { pool = await photoPool(sportteryTeamId, zh); } catch {}
  let n = 0;
  // 1.9.6 nationality (from ESPN roster) → auto zh names
  for (const p of [...side.starters, ...side.bench]) {
    const r = pool.find(x => x.espnId && x.espnId === p.espnId);
    if (r && r.nat) p.nat = r.nat;
  }
  try { require('./name-auto').fillAuto([...side.starters, ...side.bench], { natKey: 'nat', team: side.team }); } catch {}
  for (const p of [...side.starters, ...side.bench]) {
    const hit = pickPhoto(pool, p);
    if (hit) { p.photo = hit.photo; p.photoSrc = hit.src; n++; }
  }
  // per-player TheSportsDB search (name + club must both match); global rate-limited queue
  const team = pnorm(side.team);
  const miss = [...side.starters, ...side.bench].filter(p => !p.photo);
  const waits = [];
  for (const p of miss) {
    const c = tsdbCache()[pnorm(p.name) + '|' + team];
    if (c && c.url) { p.photo = c.url; p.photoSrc = 'thesportsdb-search'; n++; continue; }
    if (c && Date.now() - c.at < 7 * 864e5) continue; // known miss
    waits.push(tsdbEnqueue(p.name, side.team).then(url => { if (url) { p.photo = url; p.photoSrc = 'thesportsdb-search'; n++; } }));
  }
  // wait briefly; the queue keeps filling the cache in background for the next view
  await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 12000))]);
  side.photoCount = n;
  side.playerCount = side.starters.length + side.bench.length;
  return side;
}

async function getLineup(m) {
  const ko = Date.parse(`${m.date}T${String(m.time || '00:00').slice(0, 5)}:00+08:00`);
  const out = { ok: true, matchId: String(m.id || ''), source: 'espn', kickoff: ko, state: 'unknown', home: null, away: null, prevHome: null, prevAway: null };
  const found = await findEvent(m).catch(e => { out.error = e.message; return null; });
  if (found) {
    out.espnEventId = found.event.id;
    const toKo = ko - Date.now();
    // refresh often near kickoff/in play; finished lineups are stable
    const ttl = found.event.state === 'post' ? 7 * 864e5 : (toKo < 3 * 3600e3 ? 3 * 60e3 : 30 * 60e3);
    try {
      const s = await summaryLineup(found.event.id, ttl);
      const byHA = k => s.rosters.find(r => r.homeAway === k);
      const H = byHA(found.homeIsHome ? 'home' : 'away');
      const A = byHA(found.homeIsHome ? 'away' : 'home');
      if ((H && H.starters.length >= 11) || (A && A.starters.length >= 11)) {
        out.home = applyZh(H || null); out.away = applyZh(A || null);
        out.state = s.state === 'post' ? 'final' : s.state === 'in' ? 'live' : 'announced';
      } else out.state = s.state === 'post' ? 'final-nolineup' : 'pending';
      out.statusZh = s.statusZh;
    } catch (e) { out.error = e.message; out.state = 'pending'; }
  } else {
    out.state = 'no-event';
  }
  if (!out.home || !out.away) {
    const [ph, pa] = await Promise.all([
      out.home ? null : previousXI(m.homeTeamId, m.home, ko),
      out.away ? null : previousXI(m.awayTeamId, m.away, ko),
    ]);
    out.prevHome = applyZh(ph); out.prevAway = applyZh(pa);
  }
  await Promise.all([
    applyPhotos(out.home, m.homeTeamId, m.home), applyPhotos(out.away, m.awayTeamId, m.away),
    applyPhotos(out.prevHome, m.homeTeamId, m.home), applyPhotos(out.prevAway, m.awayTeamId, m.away),
  ]);
  out.noteZh = {
    final: '本场实际首发与替补（ESPN 赛后数据），↑为替补登场、↓为被换下。',
    live: '本场首发（ESPN，比赛进行中）。',
    announced: '本场首发已公布（ESPN）。',
    pending: '首发未公布（通常赛前约1小时公布）。下方为各队上一场实际首发，仅供参考，不代表本场首发。',
    'final-nolineup': 'ESPN 未提供本场阵容数据。下方为各队上一场首发，仅供参考。',
    'no-event': '未在 ESPN 找到本场比赛（该赛事可能未收录），无法提供本场阵容。下方为可获取的上一场首发，仅供参考。',
  }[out.state] || '';
  return out;
}

/** background: learn team ids from all schedule matches */
async function learnFromSchedule(list) {
  let n = 0;
  for (const m of list || []) {
    try { if (await findEvent(m)) n++; } catch {}
  }
  return n;
}

async function fillPhotosFromTsdb(side) {
  // cache → club roster match → per-player search queue. Never fabricates.
  if (!side) return side;
  const team = pnorm(side.team);
  let n = 0;
  const miss0 = [...(side.starters || []), ...(side.bench || [])].filter(p => !p.photo);
  for (const p of miss0) {
    const c = tsdbCache()[pnorm(p.name) + '|' + team];
    if (c && c.url) { p.photo = c.url; p.photoSrc = 'thesportsdb-cache'; n++; }
  }
  let miss = [...(side.starters || []), ...(side.bench || [])].filter(p => !p.photo);
  if (miss.length && team) {
    try {
      const roster = await tsdbTeamPlayers(team);
      for (const p of miss) {
        const url = pickTsdbUrl(roster, p.name, team);
        if (url) {
          p.photo = url; p.photoSrc = 'thesportsdb-roster'; n++;
          const key = pnorm(p.name) + '|' + team;
          tsdbCache()[key] = { url, at: Date.now() };
        }
      }
      try { writeJson(TSDB_FILE(), tsdbCache()); } catch {}
    } catch {}
  }
  miss = [...(side.starters || []), ...(side.bench || [])].filter(p => !p.photo);
  const waits = [];
  for (const p of miss) {
    const c = tsdbCache()[pnorm(p.name) + '|' + team];
    if (c && c.url) { p.photo = c.url; p.photoSrc = 'thesportsdb-cache'; n++; continue; }
    if (c && Date.now() - c.at < 2 * 864e5) continue; // known miss (shorter TTL for retry after matcher upgrades)
    waits.push(tsdbEnqueue(p.name, side.team).then(url => { if (url) { p.photo = url; p.photoSrc = 'thesportsdb-search'; n++; } }));
  }
  await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 15000))]);
  side.photoCount = (side.photoCount || 0) + n;
  return side;
}

module.exports = { getLineup, fillPhotosFromTsdb, findEvent, learnFromSchedule, summaryLineup, reloadTsdbCache, pnorm, teamsMatch, namesLooseEqual };
