// 竞彩预测 backend: proxies sporttery.cn public APIs with caching (falls back to clearly-labeled sample data),
// plus user accounts (phone+password) with server-synced 我的方案/关注. No betting, payment or ticket submission.
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const sample = require('./sample-data');

const PORT = process.env.PORT || 8088;
const CACHE_MS = 3 * 60 * 1000;
const BASE = process.env.SPORTTERY_BASE || 'https://webapi.sporttery.cn';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Referer': 'https://www.sporttery.cn/',
  'Origin': 'https://www.sporttery.cn',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};
const ENDPOINTS = {
  matches: [
    '/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c',
    '/gateway/uniform/football/getMatchCalculatorV1.qry?poolCode=hhad,had&channel=c',
  ],
  // Issue list (businessDate + 周几NNN) while Selling. After kickoff sporttery drops the row here
  // (same as calculator). completeSchedule() merges results-window + disk seen-cache so 001…NNN stay.
  // Predict uses `matches` (calculator + completeMatches backfill of upcoming Selling+odds).
  schedule: [
    '/gateway/uniform/football/getMatchListV1.qry?clientCode=3001',
  ],
  // Results need an explicit date range (Beijing time). The old jc/getMatchResultV1 path is blocked (HTTP 403 禁止访问),
  // and uniform/getMatchResultV1 returns an empty value; uniform/getUniformMatchResultV1 works with all params below.
  // That endpoint filters by kickoff calendar date (matchDate), NOT the 竞彩 issue day.
  results: [
    () => `/gateway/uniform/football/getUniformMatchResultV1.qry?matchBeginDate=${bjDate(-RESULT_DAYS)}&matchEndDate=${bjDate(0)}&leagueId=&pageSize=100&pageNo=1&isFix=0&matchPage=1&pcOrWap=1`,
    () => `/gateway/jc/football/getMatchResultV1.qry?matchPage=1&matchBeginDate=${bjDate(-RESULT_DAYS)}&matchEndDate=${bjDate(0)}&leagueId=&pageSize=100&pageNo=1&isFix=0&pcOrWap=1`,
  ],
};
const RESULT_DAYS = 3;
function bjDate(offsetDays) { return new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10); }

// Optional: HTTP(S) CONNECT proxy located in mainland China (sporttery.cn geo-blocks overseas/datacenter IPs with HTTP 567)
const PROXY = process.env.UPSTREAM_PROXY || process.env.HTTPS_PROXY || '';
let dispatcher;
if (PROXY) { const { ProxyAgent } = require('undici'); dispatcher = new ProxyAgent(PROXY); }

const cache = {};
const lastError = {};

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal, ...(dispatcher ? { dispatcher } : {}) });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}${/EdgeOne/.test(text) ? ' (Tencent EdgeOne 安全策略拦截)' : ''}`);
    let j; try { j = JSON.parse(text); } catch { throw new Error('非JSON响应'); }
    if (j.success === false) throw new Error('API返回失败: ' + (j.errorMessage || j.errorCode));
    return j;
  } finally { clearTimeout(t); }
}

const f = v => (v === undefined || v === null || v === '' ? null : Number(v));
function oddsOf(p) { return p && p.h ? { h: f(p.h), d: f(p.d), a: f(p.a), goalLine: p.goalLine ? String(p.goalLine) : '' } : null; }

// Official crests: getMatchHeadV1 returns homeTeamLogoPath / awayTeamLogoPath as
// //static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/{sportteryTeamId}.png
// Calculator / schedule / results payloads carry the same id (homeTeamId) but not the URL.
// Club files on that CDN 404 (national-team flags still 200). data/crests.json holds
// TheSportsDB badge URLs that were fetched and checked as real images (free key 123).
// A missing file or the generic teamdef placeholder is not a crest — the client keeps the letter badge.
const LOGO_CDN = 'https://static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/';
const LOGO_HOSTS = new Set(['static.sporttery.cn', 'www.sporttery.cn', 'm.sporttery.cn', 'r2.thesportsdb.com', 'media.api-sports.io', 'a.espncdn.com', 'a1.espncdn.com', 'a2.espncdn.com', 'a3.espncdn.com', 'a4.espncdn.com', 'secure.espncdn.com', 'media.espn.com']);
/** Prefer hi-res sources: TheSportsDB ~512 > ESPN 500 > AF media ~150. */
function preferHiResLogo(url) {
  let s = String(url || '').trim();
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    // ESPN combiner: bump tiny thumbs to ≥256 for retina circles
    if (/espncdn\.com$/.test(host) && u.pathname.startsWith('/combiner/')) {
      const img = u.searchParams.get('img') || '';
      let w = Number(u.searchParams.get('w') || 0);
      let h = Number(u.searchParams.get('h') || 0);
      if (w && w < 256) u.searchParams.set('w', '256');
      if (h && h < 256) u.searchParams.set('h', '256');
      if (!w && !h && img) { u.searchParams.set('w', '256'); u.searchParams.set('h', '256'); }
      return u.toString();
    }
    // ESPN team logos under /soccer/100/ → upgrade to /500/
    if (/espncdn\.com$/.test(host) && /\/i\/teamlogos\/soccer\/\d+\//.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/soccer\/\d+\//, '/soccer/500/');
      return u.toString();
    }
  } catch { /* keep */ }
  return s;
}
function loadCrests() {
  try {
    // Prefer DATA_DIR (same path crest-autofill writes) so hot-reload sees new badges.
    const crestsPath = (() => {
      try { return path.join(require('./lib/db').DATA_DIR, 'crests.json'); }
      catch { return path.join(__dirname, 'data', 'crests.json'); }
    })();
    const j = JSON.parse(fs.readFileSync(crestsPath, 'utf8'));
    const bySporttery = new Map();
    const byAf = new Map();
    for (const [id, row] of Object.entries((j && j.teams) || {})) {
      if (!row) continue;
      const badge = (typeof row.badge === 'string' && row.badge) ? row.badge : '';
      const afId = row.afTeamId != null ? Number(row.afTeamId) : 0;
      if (badge) bySporttery.set(String(id), badge);
      if (afId > 0 && badge) byAf.set(String(afId), badge);
      else if (afId > 0) byAf.set(String(afId), `https://media.api-sports.io/football/teams/${afId}.png`);
      if (afId > 0 && badge) bySporttery.set(String(id), badge);
      // AF fallback when TSDB badge missing
      if (!badge && afId > 0) bySporttery.set(String(id), `https://media.api-sports.io/football/teams/${afId}.png`);
    }
    return { bySporttery, byAf };
  } catch (e) {
    console.warn('crest map unavailable', e.message);
    return { bySporttery: new Map(), byAf: new Map() };
  }
}
const CREST_DATA = loadCrests();
const CRESTS = CREST_DATA.bySporttery;
const CRESTS_BY_AF = CREST_DATA.byAf;
/** Hot-reload in-memory crest maps after crest-autofill writes crests.json (no process restart). */
function reloadCrestMaps() {
  const next = loadCrests();
  CRESTS.clear();
  CRESTS_BY_AF.clear();
  for (const [k, v] of next.bySporttery) CRESTS.set(k, v);
  for (const [k, v] of next.byAf) CRESTS_BY_AF.set(k, v);
  console.log('[crests] reloaded', CRESTS.size, 'sporttery badges');
}
function crestUsable(teamId) {
  const id = String(teamId ?? '').trim();
  // In-memory map (badge or AF synthetic). Missing key → autofill queue.
  return !!(id && CRESTS.get(id));
}
function noteMissingCrest(teamId, zh) {
  try {
    const autofill = require('./lib/crest-autofill');
    autofill.enqueue(teamId, { zh: zh || '' });
  } catch { /* optional until start() */ }
}
function normalizeLogoUrl(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^https?:\/\//i.test(s)) return '';
  if (/teamdef_|icon_zd\.png/i.test(s)) return '';
  return preferHiResLogo(s);
}
function crestForAfLogo(url) {
  const m = String(url || '').match(/media\.api-sports\.io\/football\/teams\/(\d+)\./i);
  if (!m) return '';
  return CRESTS_BY_AF.get(m[1]) || '';
}
function teamLogo(raw, teamId, teamName) {
  const id = String(teamId ?? '').trim();
  const crest = CRESTS.get(id);
  // Club crests override the sporttery CDN path, which 404s for clubs. National teams
  // are not in the map, so their flag URLs stay.
  if (crest && safeLogoTarget(crest)) return preferHiResLogo(crest);
  const direct = normalizeLogoUrl(raw);
  if (direct) {
    // Upgrade tiny AF team logos to mapped hi-res crest when known
    const upgraded = crestForAfLogo(direct);
    if (upgraded && safeLogoTarget(upgraded)) return preferHiResLogo(upgraded);
    return direct;
  }
  if (!/^\d+$/.test(id) || id === '0') return '';
  // No usable crest yet → async autofill (ESPN / API-Football); next refresh gets the badge.
  noteMissingCrest(id, teamName);
  return LOGO_CDN + id + '.png';
}
function logoFields(m, side) {
  const keys = side === 'home'
    ? ['homeTeamLogo', 'homeTeamLogoPath', 'homeLogo', 'homeTeamPic', 'homeTeamImg']
    : ['awayTeamLogo', 'awayTeamLogoPath', 'awayLogo', 'guestTeamLogo', 'awayTeamPic', 'awayTeamImg'];
  for (const k of keys) if (m && m[k]) return m[k];
  return '';
}
function safeLogoTarget(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('//')) s = 'https:' + s;
  s = preferHiResLogo(s);
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!LOGO_HOSTS.has(host)) return null;
  const isEspnCombiner = /espncdn\.com$|^secure\.espncdn\.com$|^media\.espn\.com$/.test(host) && u.pathname.startsWith('/combiner/');
  if (!isEspnCombiner && !/\.(png|jpe?g|gif|webp)$/i.test(u.pathname)) return null;
  // TheSportsDB: team badges + player cutouts/thumbs (no fanart).
  if (host === 'r2.thesportsdb.com') {
    const ok = u.pathname.startsWith('/images/media/team/badge/') || u.pathname.startsWith('/images/media/player/cutout/') || u.pathname.startsWith('/images/media/player/thumb/') || u.pathname.startsWith('/images/media/player/render/');
    if (!ok) return null;
  }
  // API-Football CDN (standings / scorers logos & player photos)
  if (host === 'media.api-sports.io') {
    const ok = /^\/football\/(teams|players|leagues)\/\d+\.(png|jpe?g|webp)$/i.test(u.pathname);
    if (!ok) return null;
  }
  // ESPN soccer team logos / athlete images
  if (/^(?:a\d*\.)?espncdn\.com$|^secure\.espncdn\.com$|^media\.espn\.com$/.test(host)) {
    const ok = u.pathname.startsWith('/i/teamlogos/') || u.pathname.startsWith('/combiner/') || u.pathname.startsWith('/i/headshots/');
    if (!ok) return null;
    if (isEspnCombiner) {
      const img = u.searchParams.get('img') || '';
      if (!/^\/i\/(teamlogos|headshots)\//.test(img) && !/\.(png|jpe?g|gif|webp)/i.test(img)) return null;
    }
  }
  return u.toString();
}

// 竞彩期次 weekday is the official sales day (matchNumStr "周几NNN" / businessDate), NOT the
// calendar weekday of kickoff. Early-morning kickoffs stay on the previous issue.
// Results payloads have matchDate (kickoff calendar date) but no businessDate, so derive it:
// the latest date on or before matchDate whose weekday matches the 周几 in matchNumStr.
const ISSUE_WEEK = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
function issueDateFromNum(matchDate, matchNumStr) {
  const hit = String(matchNumStr || '').match(/周([日一二三四五六])/);
  if (!hit || !/^\d{4}-\d{2}-\d{2}$/.test(String(matchDate || ''))) return matchDate || null;
  const want = ISSUE_WEEK[hit[1]];
  const d = new Date(matchDate + 'T12:00:00Z');
  const delta = (d.getUTCDay() - want + 7) % 7;
  d.setUTCDate(d.getUTCDate() - delta);
  return d.toISOString().slice(0, 10);
}
function kickoffMs(date, time) {
  if (!date) return NaN;
  return new Date(`${date}T${String(time || '00:00').slice(0, 5)}:00+08:00`).getTime();
}

function normalizeMatches(j) {
  const list = [];
  for (const day of (j.value && j.value.matchInfoList) || []) {
    for (const m of day.subMatchList || []) {
      list.push({
        id: String(m.matchId),
        num: m.matchNumStr || m.matchNum,
        league: m.leagueAbbName || m.leagueAllName,
        leagueColor: (m.backColor || m.leagueBackColor) ? '#' + String(m.backColor || m.leagueBackColor).replace('#', '') : null,
        date: m.matchDate, time: (m.matchTime || '').slice(0, 5), businessDate: m.businessDate || day.businessDate,
        weekday: m.matchWeek || day.weekday || '',
        home: m.homeTeamAbbName || m.homeTeamAllName, away: m.awayTeamAbbName || m.awayTeamAllName,
        homeLogo: teamLogo(logoFields(m, 'home'), m.homeTeamId, m.homeTeamAbbName || m.homeTeamAllName || m.homeTeam || m.allHomeTeam || m.home),
        awayLogo: teamLogo(logoFields(m, 'away'), m.awayTeamId, m.awayTeamAbbName || m.awayTeamAllName || m.awayTeam || m.allAwayTeam || m.away),
        homeRank: m.homeRank || '', awayRank: m.awayRank || '',
        homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
        awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
        had: oddsOf(m.had), hhad: oddsOf(m.hhad),
        status: m.matchStatus || '',
      });
    }
  }
  if (!list.length) throw new Error('API返回空赛程');
  return list;
}

function poolOdds(list, code) {
  const p = (list || []).find(o => String(o.poolCode || '').toUpperCase() === code);
  if (!p || p.h === undefined || p.h === null || p.h === '') return null;
  let gl = '';
  if (code === 'HHAD' && p.goalLine !== undefined && p.goalLine !== null && p.goalLine !== '') {
    const n = Number(p.goalLine);
    gl = Number.isNaN(n) || n === 0 ? '' : (n > 0 ? '+' : '') + String(n);
  }
  return { h: f(p.h), d: f(p.d), a: f(p.a), goalLine: gl };
}
function normalizeSchedule(j) {
  const list = [];
  for (const day of (j.value && j.value.matchInfoList) || []) {
    for (const m of day.subMatchList || []) {
      list.push({
        id: String(m.matchId),
        num: m.matchNumStr || String(m.matchNum || ''),
        league: m.leagueAbbName || m.leagueAllName,
        leagueColor: m.backColor ? '#' + String(m.backColor).replace('#', '') : null,
        date: m.matchDate, time: (m.matchTime || '').slice(0, 5),
        businessDate: m.businessDate || day.businessDate,
        weekday: m.weekday || day.weekday || '',
        home: m.homeTeamAbbName || m.homeTeamAllName, away: m.awayTeamAbbName || m.awayTeamAllName,
        homeLogo: teamLogo(logoFields(m, 'home'), m.homeTeamId, m.homeTeamAbbName || m.homeTeamAllName || m.homeTeam || m.allHomeTeam || m.home),
        awayLogo: teamLogo(logoFields(m, 'away'), m.awayTeamId, m.awayTeamAbbName || m.awayTeamAllName || m.awayTeam || m.allAwayTeam || m.away),
        homeRank: m.homeRank || '', awayRank: m.awayRank || '',
        homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
        awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
        had: poolOdds(m.oddsList, 'HAD'), hhad: poolOdds(m.oddsList, 'HHAD'),
        status: m.matchStatus || '',
      });
    }
  }
  if (!list.length) throw new Error('API返回空赛程');
  return list;
}

const RESULT_STATUS = { '1': '未完场', '2': '已完成' };
function winFlagOf(full) {
  const [hg, ag] = String(full).split(':').map(Number);
  if (Number.isNaN(hg) || Number.isNaN(ag)) return '';
  return hg > ag ? 'H' : hg === ag ? 'D' : 'A';
}
function normalizeResults(j) {
  const arr = (j.value && (j.value.matchResult || j.value.list)) || [];
  const list = arr
    // only finished matches with a score (or an official "无效场次"); in-progress rows have empty scores
    .filter(m => m.sectionsNo999 && String(m.sectionsNo999).trim())
    .map(m => {
      const num = m.matchNumStr || '';
      const matchDate = m.matchDate;
      return {
        id: String(m.matchId), num, league: m.leagueNameAbbr || m.leagueName,
        leagueColor: m.leagueBackColor ? '#' + String(m.leagueBackColor).replace('#', '') : null,
        date: matchDate, businessDate: issueDateFromNum(matchDate, num),
        home: m.homeTeam || m.allHomeTeam, away: m.awayTeam || m.allAwayTeam,
        homeLogo: teamLogo(logoFields(m, 'home'), m.homeTeamId, m.homeTeamAbbName || m.homeTeamAllName || m.homeTeam || m.allHomeTeam || m.home),
        awayLogo: teamLogo(logoFields(m, 'away'), m.awayTeamId, m.awayTeamAbbName || m.awayTeamAllName || m.awayTeam || m.allAwayTeam || m.away),
        homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
        awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
        half: m.sectionsNo1 || '', full: m.sectionsNo999 || '', goalLine: m.goalLine || '',
        winFlag: m.winFlag || '', had: m.h ? { h: f(m.h), d: f(m.d), a: f(m.a) } : null,
        status: RESULT_STATUS[m.matchResultStatus] || m.matchResultStatus || '',
      };
    });
  if (!list.length) throw new Error('API返回空赛果');
  return list;
}

// Settled results lag kickoff. Official live scores (getMatchLiveV1) fill that gap
// for matches that have ended but are not in getUniformMatchResultV1 yet.
// Team names / 周几NNN / businessDate come from the schedule list; only the score comes from live.
async function enrichResults(list) {
  let schedPayload;
  try { schedPayload = await getData('schedule'); } catch { return list; }
  if (!schedPayload || schedPayload.source !== 'live') return list;
  const have = new Set(list.map(r => r.id));
  const now = Date.now();
  const pending = (schedPayload.data || []).filter(m => !have.has(String(m.id)) && kickoffMs(m.date, m.time) <= now);
  if (!pending.length) return list;
  let live;
  try {
    live = await fetchJson(BASE + '/gateway/uniform/fb/getMatchLiveV1.qry?matchIds=' + pending.map(m => m.id).join(','));
  } catch (e) {
    lastError.live = [e.message];
    return list;
  }
  const byId = new Map(((live.value) || []).map(x => [String(x.matchId), x]));
  for (const m of pending) {
    const lv = byId.get(String(m.id));
    if (!lv) continue;
    const finished = lv.matchPhaseTc === '14' || lv.matchPhaseTcName === '比赛结束' || lv.matchStatus === '6' || lv.matchStatusName === '直播结束';
    const full = String(lv.sectionsNo999 || '').trim();
    if (!finished || !/^\d+:\d+$/.test(full)) continue;
    list.push({
      id: String(m.id), num: m.num, league: m.league, leagueColor: m.leagueColor,
      date: m.date, time: m.time || '', businessDate: m.businessDate || issueDateFromNum(m.date, m.num),
      home: m.home, away: m.away,
      homeLogo: m.homeLogo || '', awayLogo: m.awayLogo || '',
      half: lv.sectionsNo1 || '', full, goalLine: (m.hhad && m.hhad.goalLine) || '',
      winFlag: winFlagOf(full), had: null, status: '完场',
    });
  }
  return list;
}


/** Count rows by 竞彩 issue day (businessDate) for ops logs / leak detection. */
function summarizeByBusinessDate(list) {
  const out = {};
  for (const m of list || []) {
    const d = m.businessDate || issueDateFromNum(m.date, m.num) || m.date || '?';
    out[d] = (out[d] || 0) + 1;
  }
  return out;
}

// sporttery getMatchListV1 / Calculator drop a match once it leaves Selling (kickoff).
// getUniformMatchResultV1 still lists it (matchResultStatus 1 = 未完场, empty score).
// Persist + merge so 周几001…NNN stay visible on the 比分 page through live/FT.
const SCHED_SEEN_KEEP_DAYS = 14;
function schedSeenPath() {
  return path.join(require('./lib/db').DATA_DIR, 'schedule-seen.json');
}
function loadScheduleSeen() {
  try {
    const j = JSON.parse(fs.readFileSync(schedSeenPath(), 'utf8'));
    return (j && typeof j === 'object' && j.byId) ? j.byId : {};
  } catch { return {}; }
}
function pruneAndSaveScheduleSeen(byId) {
  const cutoff = bjDate(-SCHED_SEEN_KEEP_DAYS);
  const out = {};
  for (const [id, m] of Object.entries(byId || {})) {
    if (!m || !m.id) continue;
    const bd = m.businessDate || issueDateFromNum(m.date, m.num) || m.date || '';
    if (bd && bd < cutoff) continue;
    out[String(id)] = {
      id: String(m.id), num: m.num || '', league: m.league || '', leagueColor: m.leagueColor || null,
      date: m.date || '', time: m.time || '', businessDate: bd || null, weekday: m.weekday || '',
      home: m.home || '', away: m.away || '',
      homeLogo: m.homeLogo || '', awayLogo: m.awayLogo || '',
      homeRank: m.homeRank || '', awayRank: m.awayRank || '',
      homeTeamId: m.homeTeamId || '', awayTeamId: m.awayTeamId || '',
      had: m.had || null, hhad: m.hhad || null, status: m.status || '',
    };
  }
  try {
    fs.mkdirSync(path.dirname(schedSeenPath()), { recursive: true });
    fs.writeFileSync(schedSeenPath(), JSON.stringify({ savedAt: new Date().toISOString(), byId: out }));
  } catch (e) { console.warn('[schedule] seen save failed', e.message); }
  return out;
}
function resultRowToSchedule(m) {
  const num = m.matchNumStr || '';
  const matchDate = m.matchDate;
  const hasScore = !!(m.sectionsNo999 && String(m.sectionsNo999).trim());
  const unfinished = String(m.matchResultStatus) === '1' || !hasScore;
  return {
    id: String(m.matchId),
    num,
    league: m.leagueNameAbbr || m.leagueName,
    leagueColor: m.leagueBackColor ? '#' + String(m.leagueBackColor).replace('#', '') : null,
    date: matchDate,
    time: String(m.matchTime || '').slice(0, 5),
    businessDate: issueDateFromNum(matchDate, num),
    weekday: '',
    home: m.homeTeam || m.allHomeTeam,
    away: m.awayTeam || m.allAwayTeam,
    homeLogo: teamLogo(logoFields(m, 'home'), m.homeTeamId, m.homeTeamAbbName || m.homeTeamAllName || m.homeTeam || m.allHomeTeam || m.home),
    awayLogo: teamLogo(logoFields(m, 'away'), m.awayTeamId, m.awayTeamAbbName || m.awayTeamAllName || m.awayTeam || m.allAwayTeam || m.away),
    homeRank: '', awayRank: '',
    homeTeamId: m.homeTeamId != null ? String(m.homeTeamId) : '',
    awayTeamId: m.awayTeamId != null ? String(m.awayTeamId) : '',
    had: m.h ? { h: f(m.h), d: f(m.d), a: f(m.a) } : null,
    hhad: null,
    status: unfinished ? 'Live' : 'Finished',
    half: m.sectionsNo1 || '',
    full: hasScore ? String(m.sectionsNo999).trim() : '',
    _backfill: 'results',
  };
}
/** Detect missing 周几NNN slots per businessDate (e.g. 001 gone while 002..012 remain). */
function detectMatchNumGaps(list) {
  const byDay = {};
  for (const m of list || []) {
    const hit = String(m.num || '').match(/周([日一二三四五六])(\d{3})/);
    if (!hit) continue;
    const bd = m.businessDate || issueDateFromNum(m.date, m.num) || m.date || '?';
    (byDay[bd] || (byDay[bd] = [])).push({ n: Number(hit[2]), num: m.num, id: m.id });
  }
  const gaps = {};
  for (const [bd, rows] of Object.entries(byDay)) {
    const max = Math.max(...rows.map(r => r.n));
    const have = new Set(rows.map(r => r.n));
    const missing = [];
    for (let i = 1; i <= max; i++) if (!have.has(i)) missing.push(String(i).padStart(3, '0'));
    if (missing.length) gaps[bd] = { max, missing, have: rows.length };
  }
  return gaps;
}
async function fetchRawResultsForBackfill() {
  const errors = [];
  for (const e0 of ENDPOINTS.results) {
    const ep = typeof e0 === 'function' ? e0() : e0;
    try {
      const j = await fetchJson(BASE + ep);
      const arr = (j.value && (j.value.matchResult || j.value.list)) || [];
      return { rows: arr, sourceUrl: BASE + ep };
    } catch (e) { errors.push(e.message); }
  }
  lastError.scheduleBackfill = errors;
  return { rows: [], sourceUrl: null };
}
/** Fill empty kickoff time from getMatchLiveV1 (results rows often omit matchTime). */
async function fillScheduleTimesFromLive(list) {
  const need = (list || []).filter(m => m && m.id && !m.time);
  if (!need.length) return 0;
  let filled = 0;
  for (let i = 0; i < need.length; i += 40) {
    const chunk = need.slice(i, i + 40);
    try {
      const live = await fetchJson(BASE + '/gateway/uniform/fb/getMatchLiveV1.qry?matchIds=' + chunk.map(m => m.id).join(','));
      const byId = new Map(((live.value) || []).map(x => [String(x.matchId), x]));
      for (const m of chunk) {
        const lv = byId.get(String(m.id));
        if (!lv) continue;
        const t = String(lv.matchTime || '').slice(0, 5);
        if (t) { m.time = t; filled++; }
        if (!m.date && lv.matchDate) m.date = lv.matchDate;
      }
    } catch (e) {
      lastError.scheduleLiveTime = [e.message];
      break;
    }
  }
  return filled;
}
/**
 * Keep numbered 竞彩 rows visible after sporttery drops them from getMatchListV1:
 * 1) revive from disk seen-cache
 * 2) merge unfinished/finished rows from results window (no score filter)
 * 3) persist union; log numbering gaps
 */
/** Merge calculator gaps: schedule Selling rows with odds whose kickoff is still ahead. */
async function completeMatches(calcList) {
  const byId = new Map((calcList || []).map(m => [String(m.id), m]));
  const before = byId.size;
  let schedRows = [];
  try {
    const schedPayload = await getData('schedule');
    schedRows = (schedPayload && schedPayload.data) || [];
  } catch (e) {
    console.warn('[matches] schedule unavailable for backfill', e.message);
  }
  const now = Date.now();
  let added = 0;
  for (const row of schedRows) {
    const id = String(row.id || '');
    if (!id || byId.has(id)) continue;
    if (String(row.status || '') !== 'Selling') continue;
    if (!row.had || row.had.h == null) continue;
    const ko = kickoffMs(row.date, row.time);
    if (!Number.isFinite(ko) || ko <= now) continue;
    byId.set(id, {
      id,
      num: row.num,
      league: row.league,
      leagueColor: row.leagueColor || null,
      date: row.date,
      time: row.time,
      businessDate: row.businessDate,
      weekday: row.weekday || '',
      home: row.home,
      away: row.away,
      homeLogo: row.homeLogo,
      awayLogo: row.awayLogo,
      homeRank: row.homeRank || '',
      awayRank: row.awayRank || '',
      homeTeamId: row.homeTeamId || '',
      awayTeamId: row.awayTeamId || '',
      had: row.had,
      hhad: row.hhad,
      status: 'Selling',
    });
    added++;
  }
  let data = [...byId.values()];
  data.sort((a, b) => {
    const bd = String(a.businessDate || a.date || '').localeCompare(String(b.businessDate || b.date || ''));
    if (bd) return bd;
    return String(a.num || '').localeCompare(String(b.num || ''), 'zh');
  });
  if (added) console.log('[matches] backfill from schedule', JSON.stringify({ calc: before, added, final: data.length }));
  return { data, metaExtra: { matchesBackfill: { calc: before, added } } };
}

async function completeSchedule(list) {
  const byId = new Map();
  for (const m of list || []) if (m && m.id) byId.set(String(m.id), m);

  const seen = loadScheduleSeen();
  let revived = 0;
  const cutoff = bjDate(-SCHED_SEEN_KEEP_DAYS);
  for (const [id, m] of Object.entries(seen)) {
    if (byId.has(id)) continue;
    const bd = m.businessDate || issueDateFromNum(m.date, m.num) || m.date || '';
    if (bd && bd < cutoff) continue;
    byId.set(id, { ...m, status: m.status || 'Cached', _backfill: 'seen' });
    revived++;
  }

  let fromResults = 0;
  const raw = await fetchRawResultsForBackfill();
  for (const row of raw.rows) {
    if (!row || row.matchId == null || !row.matchNumStr) continue;
    const id = String(row.matchId);
    if (byId.has(id)) {
      // Prefer list odds/logos; only fill missing score/time on existing Selling row once finished
      const cur = byId.get(id);
      if (!cur.full && row.sectionsNo999) cur.full = String(row.sectionsNo999).trim();
      if (!cur.half && row.sectionsNo1) cur.half = row.sectionsNo1;
      continue;
    }
    byId.set(id, resultRowToSchedule(row));
    fromResults++;
  }

  let data = [...byId.values()];
  const timeFilled = await fillScheduleTimesFromLive(data);
  // Sort for stable UI: businessDate, then 周几NNN
  data.sort((a, b) => {
    const bd = String(a.businessDate || a.date || '').localeCompare(String(b.businessDate || b.date || ''));
    if (bd) return bd;
    return String(a.num || '').localeCompare(String(b.num || ''), 'zh');
  });

  pruneAndSaveScheduleSeen(Object.fromEntries(data.map(m => [String(m.id), m])));
  const allGaps = detectMatchNumGaps(data);
  // Only surface gaps for recent/active issue days (yesterday+). Older RESULT_DAYS edges
  // often miss early 001/002 that aged out of the results window — not actionable.
  const gapFloor = bjDate(-1);
  const gaps = {};
  for (const [bd, g] of Object.entries(allGaps)) {
    if (bd >= gapFloor) gaps[bd] = g;
  }
  if (revived || fromResults || Object.keys(gaps).length) {
    console.log('[schedule] backfill', JSON.stringify({ revived, fromResults, timeFilled, gaps, listOnly: (list || []).length, final: data.length }));
  }
  if (Object.keys(gaps).length) {
    console.warn('[schedule] MATCH NUM GAPS (possible silent drop)', JSON.stringify(gaps));
  }
  return { data, metaExtra: { backfill: { revived, fromResults, timeFilled }, gaps, listOnly: (list || []).length } };
}

async function getData(kind) {
  const c = cache[kind];
  let ttl = CACHE_MS;
  // 1.9.13: near kickoff, allow fresher HAD/HHAD for schedule/matches (shared cache)
  if ((kind === 'matches' || kind === 'schedule') && c && c.payload && c.payload.data) {
    try {
      ttl = Math.min(CACHE_MS, require('./lib/odds-live').suggestedMatchesCacheMs(c.payload.data));
      // never tighter than 90s for calculator HAD endpoint
      if (kind === 'matches') ttl = Math.max(90e3, ttl);
      if (kind === 'schedule') ttl = Math.max(120e3, Math.min(ttl, 15 * 60e3));
    } catch { /* keep CACHE_MS */ }
  }
  if (c && Date.now() - c.at < ttl) return c.payload;
  const errors = [];
  for (const e0 of ENDPOINTS[kind]) {
    const ep = typeof e0 === 'function' ? e0() : e0;
    try {
      const j = await fetchJson(BASE + ep);
      let data = kind === 'matches' ? normalizeMatches(j) : kind === 'schedule' ? normalizeSchedule(j) : normalizeResults(j);
      let metaExtra = {};
      if (kind === 'schedule') {
        try {
          const done = await completeSchedule(data);
          data = done.data;
          metaExtra = done.metaExtra || {};
        } catch (e) {
          lastError.scheduleComplete = [e.message];
          console.warn('[schedule] completeSchedule failed', e.message);
        }
      }
      // Calculator (getMatchCalculatorV1) sometimes omits Selling rows that still appear on the
      // issue list with HAD/HHAD (e.g. 周三001/007/014). Predict/home use `matches`, so merge
      // upcoming Selling+odds from schedule without resurrecting already-kicked-off seen rows.
      if (kind === 'matches') {
        try {
          const done = await completeMatches(data);
          data = done.data;
          metaExtra = { ...(metaExtra || {}), ...(done.metaExtra || {}) };
        } catch (e) {
          lastError.matchesComplete = [e.message];
          console.warn('[matches] completeMatches failed', e.message);
        }
      }
      if (kind === 'results') { try { data = await enrichResults(data); } catch (e) { lastError.live = [e.message]; } }
      const byBiz = summarizeByBusinessDate(data);
      console.log(`[${kind}] live ${data.length} rows`, JSON.stringify(byBiz));
      // Assert: schedule/matches must not silently shrink below sporttery payload length
      if ((kind === 'schedule' || kind === 'matches') && data.length === 0) {
        console.warn(`[${kind}] ASSERT empty after normalize — check upstream/parser`);
      }
      const payload = {
        source: 'live', sourceUrl: BASE + ep, fetchedAt: new Date().toISOString(), data,
        meta: { total: data.length, byBusinessDate: byBiz, ...metaExtra },
      };
      cache[kind] = { at: Date.now(), payload };
      // 1.9.53: after schedule/matches refresh, enqueue any sporttery team ids missing crests
      if (kind === 'schedule' || kind === 'matches') {
        try {
          const r = require('./lib/crest-autofill').sweepMatches(data);
          if (r && r.queued) console.log('[crest-autofill] sweep', kind, 'queued', r.queued);
        } catch { /* optional */ }
        try {
          const n = platformAttitude.syncUpcomingFromCachedReports(data, { limit: 24 });
          if (n) console.log('[platform-attitude] synced briefs', n);
        } catch (e) { console.warn('[platform-attitude]', e.message); }
      }
      return payload;
    } catch (e) { errors.push(`${ep.split('?')[0]}: ${e.message}`); }
  }
  lastError[kind] = errors;
  // Fallback: clearly labeled sample data (cached shorter so live is retried soon)
  const sampleData = kind === 'results' ? sample.results() : sample.matches();
  const payload = { source: 'sample', note: '官方接口不可达，当前展示为示例数据（非真实赛事/赔率）', errors, fetchedAt: new Date().toISOString(),
    data: sampleData, meta: { total: sampleData.length, byBusinessDate: summarizeByBusinessDate(sampleData) } };
  cache[kind] = { at: Date.now() - CACHE_MS + 60 * 1000, payload };
  return payload;
}

// News image proxy (懂球帝 CDN / 中新网等). Android shell is https; some CDNs are picky about referrers.
// Cause of intermittent broken 懂球帝 thumbs (≤1.4.0): proxy always rewrote to full-res (often 3–10MB+),
// which exceeded NEWS_IMG_MAX (3MB) → 404 + 10min miss-cache. Fix: keep/upgrade to 640x480 for list,
// fall back from oversized full, retries + longer timeout, broader CDN allowlist, disk cache.
const NEWS_IMG_DIR = path.join(require('./lib/db').DATA_DIR, 'news-images');
const NEWS_IMG_MAX = 12 * 1024 * 1024;
const NEWS_IMG_TIMEOUT_MS = 25000;
const NEWS_IMG_RETRIES = 3;
const NEWS_IMG_KEEP = Math.max(50, parseInt(process.env.NEWS_IMG_KEEP || '200', 10) || 200); // max cached image files
const NEWS_IMG_MAX_BYTES = Math.max(20 * 1024 * 1024, parseInt(process.env.NEWS_IMG_MAX_BYTES || String(80 * 1024 * 1024), 10) || (80 * 1024 * 1024));
const newsImgInflight = new Map();
const newsImgMiss = new Map();
// qunliao.info (bdimgN / imgN / any subdomain) + dongqiudi image CDNs (img/bdimg/static/images/cdn)
// 1.9.87: broader CN hosts (image.chinanews.com / cns / cnsimg) so scraped covers proxy+cache
const NEWS_IMG_HOST_RE = /(?:^|\.)((?:[a-z0-9-]+\.)*qunliao\.info|(?:(?:bd)?img|static|images?|cdn)\d*\.dongqiudi\.(?:com|net)|img\d*\.dongqiudi\.com|i\d*\.chinanews\.com\.cn|image\.chinanews\.com|(?:www\.)?chinanews\.com\.cn|image\.cns\.com\.cn|(?:[a-z0-9-]+\.)*cnsimg\.net|(?:poss-videocloud\.)?cns\.com\.cn|(?:[a-z0-9-]+\.)?people\.com\.cn|(?:[a-z0-9-]+\.)?peopledaily\.com\.cn|(?:e\d+\.)?365dm\.com|(?:ichef|ychef|c)\.bbci\.co\.uk|(?:static\.files\.)?bbci\.co\.uk|(?:i|media)\.guim\.co\.uk|(?:a\d*\.)?espncdn\.com|media\.espn\.com|secure\.espncdn\.com)$/i;

function safeNewsImageTarget(raw) {
  let s = String(raw || '').trim();
  if (s.startsWith('//')) s = 'https:' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (!NEWS_IMG_HOST_RE.test(u.hostname)) return null;
  if (!/\.(png|jpe?g|gif|webp)(?:$|\?)/i.test(u.pathname + (u.search ? '.jpg' : ''))) {
    // allow CDN paths without extension if host is allowlisted and path looks like known asset roots
    if (!/fastdfs|\/simg\/|\/cspimp\/|\/fileftp\/|\/ypt\/|\/upload\/|\/ace\/|\/combiner\/|\/media\/|\/photo\/|\/cpsprodpb\/|\/img\/|\/oss\//i.test(u.pathname)) return null;
  }
  // Upgrade tiny 280x210 → 640x480; do NOT strip to full-res (often multi-MB → proxy miss)
  try {
    const { rewriteDqImageUrl } = require('./lib/news');
    s = rewriteDqImageUrl(u.toString(), 'list') || u.toString();
  } catch { s = u.toString(); }
  return s;
}

/** Build fetch order: requested URL first, then 640x480 (never prefer multi-MB full as first try). */
function newsImageCandidates(target) {
  const out = [];
  const push = (u) => { if (u && !out.includes(u)) out.push(u); };
  push(target);
  try {
    const { rewriteDqImageUrl } = require('./lib/news');
    push(rewriteDqImageUrl(target, 'list'));
    const full = rewriteDqImageUrl(target, 'full');
    // Unsized full-res → synthesize 640x480/crop/-/ before the object name (fastdfs layout)
    if (full === target && !/\/\d+x-?\d*\//.test(target)) {
      const listish = target.replace(
        /(\/fastdfs\d*\/M\d{2}\/[0-9A-Fa-f]{2}\/[0-9A-Fa-f]{2}\/)(?!\d+x)([^/?#]+)$/i,
        (_, prefix, name) => prefix + '640x480/crop/-/' + name
      );
      push(listish);
    }
  } catch { /* ignore */ }
  return out;
}

async function fetchNewsImageOnce(target, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JingcaiNews/1.4.1)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://www.dongqiudi.com/',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, reason: 'http_' + r.status };
    const len = Number(r.headers.get('content-length') || 0);
    if (len > NEWS_IMG_MAX) return { ok: false, reason: 'too_large_len' };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 16) return { ok: false, reason: 'too_small' };
    if (buf.length > NEWS_IMG_MAX) return { ok: false, reason: 'too_large' };
    const type = sniffImage(buf);
    if (!type) return { ok: false, reason: 'not_image' };
    return { ok: true, buf, type };
  } catch (e) {
    return { ok: false, reason: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
  } finally { clearTimeout(t); }
}

async function fetchNewsImage(target) {
  const candidates = newsImageCandidates(target);
  let lastReason = '';
  for (const url of candidates) {
    for (let attempt = 0; attempt < NEWS_IMG_RETRIES; attempt++) {
      const got = await fetchNewsImageOnce(url, NEWS_IMG_TIMEOUT_MS);
      if (got.ok) return { buf: got.buf, type: got.type };
      lastReason = got.reason || '';
      // oversized / not an image: skip further retries on this URL, try next candidate
      if (lastReason === 'too_large' || lastReason === 'too_large_len' || lastReason === 'not_image' || lastReason === 'too_small') break;
      if (attempt + 1 < NEWS_IMG_RETRIES) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

module.exports = { normalizeMatches, normalizeResults, normalizeSchedule, issueDateFromNum, teamLogo, safeLogoTarget, safeNewsImageTarget, detectMatchNumGaps, resultRowToSchedule, completeSchedule, completeMatches, reloadCrestMaps, crestUsable };
if (require.main !== module) return;
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); next(); });
// CORS: the Android app (origin https://appassets.androidplatform.net) calls the API cross-origin.
// Auth uses an Authorization: Bearer token (no cookies), so a wildcard origin is safe here.
app.use('/api', (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Channel, X-Partner-Key, X-App-Version, X-Player-Db-Key',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});


/** 1.9.92: light in-memory rate limit for partner-test clients (anti casual abuse) */
const partnerRateBucket = new Map();
function partnerRateLimit(req, res, next) {
  const ch = String(req.get('x-app-channel') || '').trim().toLowerCase();
  if (ch !== 'partner-test' && !String(req.path || '').includes('client-gate')) return next();
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || 'unknown';
  const key = ip + '|' + ch;
  const now = Date.now();
  let b = partnerRateBucket.get(key);
  if (!b || now > b.resetAt) b = { n: 0, resetAt: now + 60_000 };
  b.n += 1;
  partnerRateBucket.set(key, b);
  if (partnerRateBucket.size > 5000) {
    for (const [k, v] of partnerRateBucket) { if (now > v.resetAt) partnerRateBucket.delete(k); }
  }
  if (b.n > 120) {
    return res.status(429).json({ ok: false, error: '请求过于频繁', messageZh: '请求过于频繁，请稍后再试' });
  }
  next();
}
app.use('/api', partnerRateLimit);

/** 1.9.92: partner-test channel gate — remote kill via admin flag partner_test */
function partnerChannelOf(req) {
  return String(req.get('x-app-channel') || req.query.channel || '').trim().toLowerCase();
}
function partnerKeyOk(req) {
  const want = String(process.env.PARTNER_BUILD_KEY || '').trim();
  if (!want) return false;
  const got = String(req.get('x-partner-key') || req.query.partnerKey || '').trim();
  return !!got && got === want;
}
function partnerGatePayload(enabled) {
  return {
    ok: true,
    channel: 'partner-test',
    enabled: !!enabled,
    version: require('./package.json').version,
    messageZh: enabled
      ? '合作测试版可用'
      : '测试已结束：合作测试通道已由运营关闭。如需继续试用请联系对接人。',
    checkedAt: new Date().toISOString(),
  };
}
app.get('/api/client-gate', (req, res) => {
  const ch = partnerChannelOf(req);
  if (ch !== 'partner-test') {
    return res.json({
      ok: true,
      channel: ch || 'prod',
      enabled: true,
      version: require('./package.json').version,
      messageZh: '正式通道',
      checkedAt: new Date().toISOString(),
    });
  }
  if (!partnerKeyOk(req)) {
    return res.status(403).json({
      ok: false,
      channel: 'partner-test',
      enabled: false,
      reason: 'partner_key',
      messageZh: '测试已结束：无效的合作测试凭证。',
      version: require('./package.json').version,
    });
  }
  const enabled = require('./lib/feature-flags').isEnabled('partner_test');
  const body = partnerGatePayload(enabled);
  if (!enabled) return res.status(403).json({ ...body, ok: false });
  res.json(body);
});
app.use('/api', (req, res, next) => {
  // Always allow gate + admin + status from any client (admin uses its own auth)
  const p = String(req.path || '');
  if (p === '/client-gate' || p === '/status' || p.startsWith('/admin')) return next();
  const ch = partnerChannelOf(req);
  if (ch !== 'partner-test') return next();
  if (!partnerKeyOk(req)) {
    return res.status(403).json({
      ok: false, reason: 'partner_key', error: '测试已结束',
      messageZh: '测试已结束：无效的合作测试凭证。',
    });
  }
  if (!require('./lib/feature-flags').isEnabled('partner_test')) {
    return res.status(403).json({
      ...partnerGatePayload(false),
      ok: false, reason: 'partner_disabled', error: '测试已结束',
    });
  }
  next();
});
app.get('/api/matches', async (req, res) => res.json(await getData('matches')));
app.get('/api/schedule', async (req, res) => res.json(await getData('schedule')));
app.get('/api/results', async (req, res) => res.json(await getData('results')));
app.get('/api/live-scores', async (req, res) => {
  try {
    const raw = String(req.query.ids || '').trim();
    let ids = raw ? raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [];
    // If no ids: use schedule matches that have kicked off or kick off within 3h (cap 80)
    if (!ids.length) {
      try {
        const sched = await getData('schedule');
        const now = Date.now();
        ids = (sched.data || [])
          .filter(m => {
            const ko = kickoffMs(m.date, m.time);
            return Number.isFinite(ko) && ko <= now + 3 * 3600e3 && ko >= now - 6 * 3600e3;
          })
          .map(m => String(m.id))
          .slice(0, 80);
      } catch (_) { ids = []; }
    }
    if (ids.length > 80) ids = ids.slice(0, 80);
    const liveScores = require('./lib/live-scores');
    const payload = await liveScores.getLiveScores({
      ids,
      fetchJson,
      base: BASE,
      withAf: req.query.af !== '0',
    });
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, error: '实时比分暂时不可用', detail: e.message });
  }
});
app.get('/api/status', (req, res) => {
  let partnerTestEnabled = true;
  try { partnerTestEnabled = require('./lib/feature-flags').isEnabled('partner_test'); } catch { /* optional */ }
  res.json({
    version: require('./package.json').version,
    partnerTestEnabled,
    cache: Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, { source: v.payload.source, fetchedAt: v.payload.fetchedAt }])),
    lastError,
  });
});

app.get('/api/baseline', (req, res) => {
  const file = path.join(require('./lib/db').DATA_DIR, 'history', 'baseline-report.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const j = JSON.parse(raw);
    res.json({
      source: 'history',
      method: 'implied_prob_max',
      total: j.total,
      dateRange: j.dateRange,
      test: j.test,
      train: j.train,
      naiveOnTest: j.naiveOnTest,
      noteZh: '基线方法与站内预测一致：对官方胜平负赔率去水后，取隐含概率最高项。ROI 按公布赔率平注 1 单位估算，未计税、限额与截期。命中率高于「全选主胜」并不等于正收益。',
      note: j.note,
    });
  } catch (e) {
    res.status(404).json({ error: '基线报告暂不可用', detail: e.message });
  }
});

/** 1.9.98: 模型体检 — backtest reliability + categories (from tools/backtest-signals.js) */
app.get('/api/calibration', (req, res) => {
  try {
    const cal = require('./lib/signals').calibration();
    if (!cal) return res.json({ ok: false, error: '回测表暂未生成' });
    const t = cal.calibration || {};
    const c = (label, r) => ({ label, n: (r && r.n) || 0, hit: r ? (r.rate != null ? r.rate : r.hit) : null });
    const ur = cal.upsetRules || {};
    res.json({
      ok: true, n: cal.n, range: cal.range, generatedAt: cal.generatedAt,
      reliability: cal.reliability,
      overall: cal.v198 && cal.v198.all && cal.v198.all.all,
      categories: [
        c('全部场次（模型倾向）', cal.v198 && cal.v198.all.all),
        c('市场热门（对照）', cal.market && cal.market.all),
        c('与盘口同向', t['kind:same']),
        c('逆盘口表态', t['kind:rev']),
        c('五大联赛+欧冠', t['tier:top']),
        c('其他联赛', t['tier:other']),
        c('热门隐含≥60%', t['band:fav']),
        c('热门隐含45–60%', t['band:mid']),
        c('热门隐含<45%', t['band:open']),
        c('预测爆冷（全部）', ur.R0_current_v198 && ur.R0_current_v198.all),
        c('预测爆冷（热门较开盘走弱）', cal.upsetBadge && cal.upsetBadge.strong && cal.upsetBadge.strong.all),
        c('优势关注·测试', cal.edgeBadge && cal.edgeBadge.test),
      ],
      edge: cal.edgeBadge || null,
    });
  } catch (e) { res.status(500).json({ ok: false, error: '暂不可用' }); }
});

/** 1.9.27: usefulness metrics strip (high-conf / 与盘口一致 / conflict) — no invented stats */
app.get('/api/usefulness', (req, res) => {
  try {
    const pmr = require('./lib/post-match-review');
    res.json(pmr.getUsefulnessStats());
  } catch (e) {
    res.status(500).json({ ok: false, error: '可用性指标暂不可用', detail: e.message });
  }
});

/** 1.9.38: compact amplify/表态 map for 开奖 cards (also embedded in /api/usefulness.byMatch) */
app.get('/api/lean-feedback-map', (req, res) => {
  try {
    const pmr = require('./lib/post-match-review');
    res.json(pmr.getLeanFeedbackMap());
  } catch (e) {
    res.status(500).json({ ok: false, error: '表态对照暂不可用', detail: e.message });
  }
});

// Crest proxy. The Android shell is https and the API is http, and static.sporttery.cn
// 404s club crests. Allowed hosts: sporttery (flags) and r2.thesportsdb.com badges.
// Images are cached on disk; a non-image body is a miss and the client shows a letter.
const LOGO_DIR = path.join(require('./lib/db').DATA_DIR, 'logos');
const LOGO_MAX = 1024 * 1024;
const logoInflight = new Map();
const logoMiss = new Map();
function sniffImage(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}
async function readCachedLogo(file) {
  try {
    const buf = await fs.promises.readFile(file);
    const type = sniffImage(buf);
    if (!type) return null;
    return { buf, type };
  } catch { return null; }
}
async function fetchLogo(target) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(target, { headers: { ...HEADERS, Accept: 'image/png,image/jpeg,image/webp,image/*,*/*;q=0.8' }, redirect: 'manual', signal: ctrl.signal, ...(dispatcher ? { dispatcher } : {}) });
    if (r.status >= 300 && r.status < 400) {
      const next = safeLogoTarget(r.headers.get('location') || '');
      if (!next || next === target) return null;
      return fetchLogo(next);
    }
    if (!r.ok) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > LOGO_MAX) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 16 || buf.length > LOGO_MAX) return null;
    const type = sniffImage(buf);
    if (!type) return null;
    return { buf, type };
  } catch { return null; }
  finally { clearTimeout(t); }
}
app.get('/api/logo', async (req, res) => {
  const target = safeLogoTarget(req.query.url);
  if (!target) return res.status(400).json({ error: '队徽地址无效' });
  const hash = crypto.createHash('sha256').update(target).digest('hex');
  const file = path.join(LOGO_DIR, hash);
  const hit = await readCachedLogo(file);
  if (hit) {
    res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=86400', 'X-Logo-Cache': 'hit' });
    return res.send(hit.buf);
  }
  const missed = logoMiss.get(target);
  if (missed && Date.now() - missed < 10 * 60 * 1000) return res.status(404).end();
  let job = logoInflight.get(target);
  if (!job) {
    job = fetchLogo(target).finally(() => logoInflight.delete(target));
    logoInflight.set(target, job);
  }
  const got = await job;
  if (!got) { logoMiss.set(target, Date.now()); return res.status(404).end(); }
  try {
    await fs.promises.mkdir(LOGO_DIR, { recursive: true });
    const tmp = file + '.tmp';
    await fs.promises.writeFile(tmp, got.buf);
    await fs.promises.rename(tmp, file);
  } catch (e) { console.warn('logo cache write failed', e.message); }
  res.set({ 'Content-Type': got.type, 'Cache-Control': 'public, max-age=86400', 'X-Logo-Cache': 'miss' });
  res.send(got.buf);
});




/** Cap disk retention for proxied news images (oldest mtime first). */
async function pruneNewsImages() {
  try {
    const names = await fs.promises.readdir(NEWS_IMG_DIR);
    if (!names.length) return { removed: 0, kept: 0 };
    const stats = [];
    for (const name of names) {
      if (name.endsWith('.tmp')) continue;
      const fp = path.join(NEWS_IMG_DIR, name);
      try {
        const st = await fs.promises.stat(fp);
        if (!st.isFile()) continue;
        stats.push({ name, fp, mtime: st.mtimeMs, size: st.size });
      } catch { /* skip */ }
    }
    stats.sort((a, b) => a.mtime - b.mtime); // oldest first
    let total = stats.reduce((s, x) => s + x.size, 0);
    let removed = 0;
    while (stats.length > NEWS_IMG_KEEP || total > NEWS_IMG_MAX_BYTES) {
      const victim = stats.shift();
      if (!victim) break;
      try {
        await fs.promises.unlink(victim.fp);
        total -= victim.size;
        removed++;
      } catch { /* ignore */ }
      if (stats.length <= Math.floor(NEWS_IMG_KEEP * 0.9) && total <= NEWS_IMG_MAX_BYTES * 0.9) break;
    }
    return { removed, kept: stats.length, bytes: total };
  } catch (e) {
    if (e && e.code !== 'ENOENT') console.warn('pruneNewsImages', e.message);
    return { removed: 0, kept: 0 };
  }
}

app.get('/api/news-image', async (req, res) => {
  const target = safeNewsImageTarget(req.query.url);
  if (!target) return res.status(400).json({ error: '图片地址无效' });
  const hash = crypto.createHash('sha256').update(target).digest('hex');
  const file = path.join(NEWS_IMG_DIR, hash);
  const hit = await readCachedLogo(file);
  if (hit) {
    res.set({ 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=86400', 'X-News-Image-Cache': 'hit' });
    return res.send(hit.buf);
  }
  const missed = newsImgMiss.get(target);
  if (missed && Date.now() - missed < 2 * 60 * 1000) return res.status(404).end();
  let job = newsImgInflight.get(target);
  if (!job) {
    job = fetchNewsImage(target).finally(() => newsImgInflight.delete(target));
    newsImgInflight.set(target, job);
  }
  const got = await job;
  if (!got) { newsImgMiss.set(target, Date.now()); return res.status(404).end(); }
  try {
    await fs.promises.mkdir(NEWS_IMG_DIR, { recursive: true });
    const tmp = file + '.tmp';
    await fs.promises.writeFile(tmp, got.buf);
    await fs.promises.rename(tmp, file);
  } catch (e) { console.warn('news-image cache write failed', e.message); }
  // Soft retention: prune every ~20 writes (hash last nibble) so we stay under caps
  if (parseInt(hash.slice(-1), 16) < 1) {
    pruneNewsImages().catch(() => {});
  }
  res.set({ 'Content-Type': got.type, 'Cache-Control': 'public, max-age=86400', 'X-News-Image-Cache': 'miss' });
  res.send(got.buf);
});

app.get('/api/squad', async (req, res) => {
  try {
    const teamId = String(req.query.teamId || '').trim();
    const name = String(req.query.name || '').trim();
    if (!teamId && !name) return res.status(400).json({ error: '缺少 teamId 或 name' });
    const payload = await require('./lib/squad').loadSquad({ teamId, name });
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, error: '球员数据暂时不可用', detail: e.message });
  }
});


// 1.9.4 / 1.9.107: match lineup (ESPN) with assembled match-level cache; pending → previous XI
app.get('/api/lineup', async (req, res) => {
  try {
    const id = String(req.query.matchId || '').trim();
    let m = null;
    if (id) {
      for (const k of ['schedule', 'results']) {
        try { const p = await getData(k); m = (p.data || []).find(x => String(x.id) === id); } catch {}
        if (m) break;
      }
    }
    if (!m) {
      const q = req.query;
      if (!q.date || !(q.homeTeamId || q.awayTeamId)) return res.status(400).json({ ok: false, error: '缺少比赛信息' });
      m = { id, date: String(q.date), time: String(q.time || ''), homeTeamId: String(q.homeTeamId || ''), awayTeamId: String(q.awayTeamId || ''), home: String(q.home || ''), away: String(q.away || '') };
    }
    const force = String(req.query.refresh || '') === '1';
    const out = await require('./lib/espn-lineup').getLineup(m, { force, waitFresh: force });
    if (out && out._cache) res.setHeader('X-Lineup-Cache', String(out._cache));
    if (out && out._ageMs != null) res.setHeader('X-Lineup-Age-Ms', String(Math.round(out._ageMs)));
    res.json(out);
  } catch (e) {
    res.status(502).json({ ok: false, error: '阵容数据暂时不可用', detail: e.message });
  }
});

app.get('/api/player', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少球员 id' });
    const payload = await require('./lib/squad').loadPlayer(id);
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, error: '球员详情暂时不可用', detail: e.message });
  }
});


app.get('/api/squad-zh', async (req, res) => {
  try {
    const teamId = String(req.query.teamId || '').trim();
    const name = String(req.query.name || '').trim();
    if (!teamId && !name) return res.status(400).json({ error: '缺少 teamId 或 name' });
    const squad = await require('./lib/squad').loadSquad({ teamId, name });
    if (!squad.ok) return res.json(squad);
    const players = await require('./lib/squad').enrichPlayerNames(squad.players || [], squad.nameEn || name);
    res.json({ ok: true, teamId: squad.teamId, names: Object.fromEntries(players.filter(p=>p.nameZh).map(p=>[p.id, p.nameZh])) });
  } catch (e) {
    res.status(502).json({ ok: false, error: '中文名暂时不可用', detail: e.message });
  }
});



app.get('/api/live-stats', async (req, res) => {
  try {
    let matchId = String(req.query.matchId || '').trim();
    let homeTeamId = String(req.query.homeTeamId || '').trim();
    let awayTeamId = String(req.query.awayTeamId || '').trim();
    let home = String(req.query.home || req.query.homeTeam || '').trim();
    let away = String(req.query.away || req.query.awayTeam || '').trim();
    let date = String(req.query.date || '').trim();
    let time = String(req.query.time || '').trim();
    let businessDate = String(req.query.businessDate || '').trim();

    // Enrich from sporttery caches when only matchId (or partial ids) given
    if (matchId || (homeTeamId && awayTeamId && !home)) {
      const findIn = (list) => (list || []).find(m =>
        (matchId && String(m.id) === matchId) ||
        (homeTeamId && awayTeamId && String(m.homeTeamId) === homeTeamId && String(m.awayTeamId) === awayTeamId && (!date || m.date === date))
      );
      let hit = null;
      for (const kind of ['schedule', 'matches', 'results']) {
        try {
          const payload = await getData(kind);
          hit = findIn(payload.data);
          if (hit) break;
        } catch { /* ignore */ }
      }
      if (hit) {
        matchId = matchId || String(hit.id);
        homeTeamId = homeTeamId || String(hit.homeTeamId || '');
        awayTeamId = awayTeamId || String(hit.awayTeamId || '');
        home = home || hit.home || '';
        away = away || hit.away || '';
        date = date || hit.date || '';
        time = time || hit.time || '';
        businessDate = businessDate || hit.businessDate || '';
      }
    }

    if (!matchId && !(homeTeamId && awayTeamId) && !(home && away && date)) {
      return res.status(400).json({ ok: false, reason: 'bad_request', error: '需要 matchId，或 homeTeamId+awayTeamId，或 home+away+date' });
    }

    const live = require('./lib/live-stats');
    const payload = await live.getLiveStats({ matchId, homeTeamId, awayTeamId, home, away, date, time, businessDate });
    // Never leak the API key; quota remaining is fine to expose for ops.
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, reason: 'error', error: '实时技术统计暂时不可用', detail: e.message });
  }
});

app.get('/api/match-stats', async (req, res) => {
  try {
    const homeTeamId = String(req.query.homeTeamId || '').trim();
    const awayTeamId = String(req.query.awayTeamId || '').trim();
    if (!homeTeamId && !awayTeamId) return res.status(400).json({ error: '缺少球队 ID' });
    const limit = req.query.limit;
    const home = String(req.query.home || '').trim();
    const away = String(req.query.away || '').trim();
    const payload = await require('./lib/match-stats').getMatchStats({
      homeTeamId, awayTeamId, home, away, limit,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, error: '战绩数据暂时不可用', detail: e.message });
  }
});

/** 1.9.105: upcoming fixtures (AF league+cups, cached); sporttery pool fallback */
app.get('/api/next-fixtures', async (req, res) => {
  try {
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    let homeTeamId = String(req.query.homeTeamId || '').trim();
    let awayTeamId = String(req.query.awayTeamId || '').trim();
    let home = String(req.query.home || '').trim();
    let away = String(req.query.away || '').trim();
    let date = String(req.query.date || '').trim();
    let time = String(req.query.time || '').trim();
    const limit = Math.max(1, Math.min(8, Number(req.query.limit) || 5));

    let schedulePool = [];
    try {
      const sched = await getData('schedule');
      schedulePool = (sched && sched.data) || [];
    } catch (_) {
      try {
        const ms = await getData('matches');
        schedulePool = (ms && ms.data) || [];
      } catch { /* */ }
    }
    // Merge schedule-seen so fallback has more rows (still filtered kickoff>now)
    try {
      const seen = JSON.parse(require('fs').readFileSync(schedSeenPath(), 'utf8'));
      const byId = (seen && seen.byId) || {};
      const extra = Object.values(byId);
      if (extra.length) {
        const ids = new Set(schedulePool.map(m => String(m.id)));
        for (const m of extra) {
          if (m && m.id != null && !ids.has(String(m.id))) schedulePool.push(m);
        }
      }
    } catch { /* optional */ }

    if (matchId && (!homeTeamId || !awayTeamId)) {
      const pools = [];
      try { const a = await getData('matches'); pools.push(...((a && a.data) || [])); } catch { /* */ }
      try { const b = await getData('schedule'); pools.push(...((b && b.data) || [])); } catch { /* */ }
      try {
        const seen = JSON.parse(require('fs').readFileSync(schedSeenPath(), 'utf8'));
        pools.push(...Object.values((seen && seen.byId) || {}));
      } catch { /* */ }
      const hit = pools.find(m => String(m.id) === matchId);
      if (hit) {
        homeTeamId = homeTeamId || String(hit.homeTeamId || '');
        awayTeamId = awayTeamId || String(hit.awayTeamId || '');
        home = home || String(hit.home || '');
        away = away || String(hit.away || '');
        date = date || String(hit.date || '');
        time = time || String(hit.time || '');
      }
    }
    if (!homeTeamId && !awayTeamId) {
      return res.status(400).json({ ok: false, error: '缺少球队 ID 或 matchId' });
    }
    const payload = await require('./lib/next-fixtures').getNextFixturesForMatch({
      matchId, homeTeamId, awayTeamId, home, away, date, time, limit, schedulePool,
    });
    res.json(payload);
  } catch (e) {
    console.warn('next-fixtures failed', e.message);
    res.status(500).json({ ok: false, error: '后续赛程暂时不可用', detail: e.message });
  }
});

/** 1.9.14: rolling process stats (possession/shots/…) for home & away */
app.get('/api/process-stats', async (req, res) => {
  try {
    const homeTeamId = String(req.query.homeTeamId || '').trim();
    const awayTeamId = String(req.query.awayTeamId || '').trim();
    if (!homeTeamId && !awayTeamId) return res.status(400).json({ ok: false, error: '缺少球队 ID' });
    const limit = Math.max(1, Math.min(15, Number(req.query.limit) || 5));
    const home = String(req.query.home || '').trim();
    const away = String(req.query.away || '').trim();
    const payload = await require('./lib/process-stats').getRollingProcessStats({
      homeTeamId, awayTeamId, home, away, limit,
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ ok: false, available: false, error: '过程数据暂时不可用', detail: e.message });
  }
});

app.get('/api/predict-report', async (req, res) => {
  try {
    try {
      if (!require('./lib/feature-flags').isEnabled('predict_report')) {
        return res.status(503).json({ ok: false, reason: 'disabled', error: '综合预测报告已关闭' });
      }
    } catch (_) { /* */ }
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    if (!matchId) return res.status(400).json({ ok: false, error: '缺少 matchId' });
    const force = req.query.refresh === '1' || req.query.force === '1';
    // Resolve match from in-sale calculator or full schedule
    let m = null;
    for (const kind of ['matches', 'schedule']) {
      try {
        const pack = await getData(kind);
        m = (pack.data || []).find(x => String(x.id) === matchId) || null;
        if (m) break;
      } catch (_) {}
    }
    if (!m) return res.status(404).json({ ok: false, reason: 'not_found', error: '未找到该场比赛（可能已下架）' });
    let schedulePool = [];
    try {
      const sched = await getData('schedule');
      schedulePool = sched.data || [];
    } catch (_) {
      try {
        const ms = await getData('matches');
        schedulePool = ms.data || [];
      } catch (_) {}
    }
    // 1.9.60: default async AI enrich (non-blocking); ?aiWait=1 to await DeepSeek
    const aiWait = req.query.aiWait === '1' || req.query.aiSync === '1';
    const report = await require('./lib/predict-report').buildReport(m, {
      schedulePool, force, aiAsync: !aiWait,
    });
    res.json(report);
  } catch (e) {
    console.warn('predict-report failed', e.message);
    res.status(502).json({ ok: false, error: '综合预测报告暂时不可用', detail: e.message });
  }
});


/** 1.9.21: post-match review (赛后复盘) */
app.get('/api/post-match-review', async (req, res) => {
  try {
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    if (!matchId) return res.status(400).json({ ok: false, error: '缺少 matchId' });
    let force = req.query.refresh === '1' || req.query.force === '1';
    const pmr = require('./lib/post-match-review');
    if (!force) {
      const cached = pmr.loadReview(matchId);
      const stale = cached && cached.ok && (
        pmr.needsBaselineBackfill(cached)
        || (pmr.needsStatsBackfill && pmr.needsStatsBackfill(cached))
        || (pmr.needsReviewUpgrade && pmr.needsReviewUpgrade(cached))
      );
      // 1.9.55: do NOT early-return when DeepSeek attribution still needed
      // (e.g. players_pending resolved, or pre-AI cache). buildReview layers AI on cache hit.
      let needsAi = false;
      try {
        const ds = require('./lib/deepseek-review');
        needsAi = !!(cached && cached.ok && !stale && ds.needsAiEnrich(cached));
      } catch (_) { needsAi = false; }
      if (cached && cached.ok && !stale && !needsAi) return res.json(cached);
      // One-sided baseline or missing AF fixture map → rebuild
      if (stale) force = true;
    }
    let m = null;
    for (const kind of ['results', 'matches', 'schedule']) {
      try {
        const pack = await getData(kind);
        m = (pack.data || []).find(x => String(x.id) === matchId) || null;
        if (m) break;
      } catch (_) {}
    }
    if (!m) {
      const cached = pmr.loadReview(matchId);
      if (cached) return res.json(cached);
      return res.status(404).json({ ok: false, reason: 'not_found', error: '未找到该场比赛' });
    }
    // Prefer explicit full score from results
    if (!m.full) {
      try {
        const pack = await getData('results');
        const r = (pack.data || []).find(x => String(x.id) === matchId);
        if (r && r.full) {
          m = { ...m, full: r.full, half: r.half, winFlag: r.winFlag, had: m.had || r.had, hhad: m.hhad || r.hhad };
        }
      } catch (_) {}
    }
    const review = await pmr.buildReview(m, { force, allowFetch: true });
    res.json(review);
  } catch (e) {
    console.warn('post-match-review failed', e.message);
    res.status(502).json({ ok: false, error: '赛后复盘暂时不可用', detail: e.message });
  }
});

app.get('/api/post-match-reviews', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
    const homeTeamId = String(req.query.homeTeamId || '').trim();
    const awayTeamId = String(req.query.awayTeamId || '').trim();
    const pmr = require('./lib/post-match-review');
    if (homeTeamId || awayTeamId) {
      const bullets = pmr.getIntelForPrediction({
        id: req.query.excludeMatchId || '',
        homeTeamId, awayTeamId,
        home: req.query.home, away: req.query.away,
      }, { limit });
      return res.json({ ok: true, bullets, items: pmr.listRecentReviews({ limit }).items.filter(it => {
        if (homeTeamId && awayTeamId) {
          const pk = pmr.pairKey(homeTeamId, awayTeamId);
          return it.pairKey === pk
            || String(it.homeTeamId) === homeTeamId || String(it.awayTeamId) === homeTeamId
            || String(it.homeTeamId) === awayTeamId || String(it.awayTeamId) === awayTeamId;
        }
        const tid = homeTeamId || awayTeamId;
        return String(it.homeTeamId) === tid || String(it.awayTeamId) === tid;
      }).slice(0, limit) });
    }
    res.json(pmr.listRecentReviews({ limit }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


/** 1.9.22: post-match player stats (本场球员) — AF /fixtures/players, disk-cached forever */
app.get('/api/fixture-players', async (req, res) => {
  try {
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    if (!matchId) return res.status(400).json({ ok: false, error: '缺少 matchId' });
    const force = req.query.refresh === '1' || req.query.force === '1';
    const fp = require('./lib/fixture-players');
    let m = null;
    for (const kind of ['results', 'matches', 'schedule']) {
      try {
        const pack = await getData(kind);
        m = (pack.data || []).find(x => String(x.id) === matchId) || null;
        if (m) break;
      } catch (_) {}
    }
    if (!m) {
      // Try index → cache even if match dropped from schedule
      try {
        const idx = require('fs');
        const path = require('path');
        const { DATA_DIR } = require('./lib/db');
        const index = JSON.parse(idx.readFileSync(path.join(DATA_DIR, 'live-stats', 'fixture-players', '_index.json'), 'utf8'));
        const fid = index.byMatch && index.byMatch[matchId];
        if (fid) {
          const cached = fp.loadCached(fid);
          if (cached && cached.ok) return res.json({ ...cached, cached: true });
        }
      } catch (_) {}
      return res.status(404).json({ ok: false, reason: 'not_found', error: '未找到该场比赛' });
    }
    if (!m.full) {
      try {
        const pack = await getData('results');
        const r = (pack.data || []).find(x => String(x.id) === matchId);
        if (r && r.full) {
          m = { ...m, full: r.full, half: r.half, winFlag: r.winFlag, status: r.status || m.status || '完场', _t: 'r' };
        }
      } catch (_) {}
    }
    const payload = await fp.getFixturePlayers(m, { force, allowFetch: true });
    res.json(payload);
  } catch (e) {
    console.warn('fixture-players failed', e.message);
    res.status(502).json({ ok: false, error: '本场球员数据暂时不可用', detail: e.message });
  }
});

app.get('/api/predict-quota', (req, res) => {
  try {
    const policy = require('./lib/predict-report').getQuotaPolicy();
    let af = null;
    try { af = require('./lib/live-stats').getQuota(); } catch (_) {}
    res.json({ ok: true, policy, apiFootball: af });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.get('/api/data-center-status', (req, res) => {
  try {
    const espn = require('./lib/espn-tables');
    res.json({
      ok: true,
      policy: '每日 06:10（北京时间）全量刷新；竞彩完场后约数分钟自动刷新该联赛积分/射手/助攻；另每 6 小时全量兜底；打开数据中心时若缓存>6h 则后台更新（先返回旧数据）。非分钟级实时。',
      freshHours: espn.FRESH_MS / 3600e3,
      lastRefresh: espn.lastRefreshInfo(),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/leagues', (req, res) => {
  try {
    res.json(require('./lib/league-tables').listLeagues());
  } catch (e) {
    res.status(500).json({ ok: false, error: '联赛列表暂时不可用', detail: e.message });
  }
});

app.get('/api/standings', async (req, res) => {
  try {
    const league = String(req.query.league || 'epl').trim();
    const season = req.query.season;
    const payload = await require('./lib/league-tables').getStandings({ league, season });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '积分榜暂时不可用', detail: e.message });
  }
});

app.get('/api/topscorers', async (req, res) => {
  try {
    const league = String(req.query.league || 'epl').trim();
    const season = req.query.season;
    const payload = await require('./lib/league-tables').getTopScorers({ league, season });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '射手榜暂时不可用', detail: e.message });
  }
});

app.get('/api/topassists', async (req, res) => {
  try {
    const league = String(req.query.league || 'epl').trim();
    const season = req.query.season;
    const payload = await require('./lib/league-tables').getTopAssists({ league, season });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '助攻榜暂时不可用', detail: e.message });
  }
});

app.get('/api/club-values', async (req, res) => {
  try {
    const league = String(req.query.league || 'epl').trim();
    const season = req.query.season;
    const payload = await require('./lib/league-tables').getClubMarketValues({ league, season });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '身价榜暂时不可用', detail: e.message });
  }
});

// 1.9.119: global search — teams / players / matches → existing detail routes
app.get('/api/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const tab = String(req.query.tab || 'all').trim();
    const limit = req.query.limit;
    const gs = require('./lib/global-search');
    const payload = await gs.search({
      q,
      tab,
      limit,
      getMatchPools: async () => {
        const kinds = ['matches', 'schedule', 'results'];
        const rows = [];
        const seen = new Set();
        for (const k of kinds) {
          try {
            const payload = await getData(k);
            for (const m of (payload && payload.data) || []) {
              const id = String(m.id);
              if (seen.has(id)) continue;
              seen.add(id);
              rows.push(m);
            }
          } catch { /* ignore pool */ }
        }
        return rows;
      },
    });
    res.json(payload);
  } catch (e) {
    console.warn('search', e.message);
    res.status(500).json({ ok: false, error: '搜索暂时不可用', detail: e.message });
  }
});

app.get('/api/team', async (req, res) => {
  try {
    const teamId = req.query.id || req.query.teamId;
    const league = String(req.query.league || '').trim();
    const season = req.query.season;
    const enrich = req.query.enrich === '1' || req.query.enrich === 'true';
    const wantSquad = req.query.squad === '1' || req.query.squad === 'true';
    const refresh = req.query.refresh === '1' || req.query.force === '1';
    const payload = await require('./lib/league-tables').getTeamDetail({ teamId, league, season, enrich, wantSquad, refresh });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '球队详情暂时不可用', detail: e.message });
  }
});

// 1.9.112: prefetch/warm assembled team + player detail (data center / 身价榜)
app.post('/api/detail-warm', express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const lt = require('./lib/league-tables');
    const body = req.body || {};
    const league = String(body.league || req.query.league || '').trim();
    const teams = Array.isArray(body.teams) ? body.teams.slice(0, 12) : [];
    const players = Array.isArray(body.players) ? body.players.slice(0, 12) : [];
    res.json({ ok: true, accepted: teams.length + players.length, noteZh: '后台预热中' });
    setImmediate(() => {
      (async () => {
        for (const id of teams) {
          try { await lt.warmTeamDetail({ teamId: id, league }); } catch (e) { console.warn('warm team', id, e.message); }
        }
        for (const id of players) {
          try { await lt.warmPlayerDetail({ playerId: id, league }); } catch (e) { console.warn('warm player', id, e.message); }
        }
      })().catch(() => {});
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'warm failed' });
  }
});

app.get('/api/odds-snapshot', async (req, res) => {
  try {
    const snap = require('./lib/odds-snapshot');
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    const date = String(req.query.date || '').trim();
    if (matchId) return res.json(snap.get(matchId, date || undefined));
    if (date) return res.json({ ok: true, date, rows: snap.listByDate(date) });
    return res.status(400).json({ ok: false, error: '需要 matchId 或 date' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '快照读取失败' });
  }
});

app.get('/api/odds-live', async (req, res) => {
  try {
    const live = require('./lib/odds-live');
    const matchId = String(req.query.matchId || req.query.id || '').trim();
    if (req.query.status === '1' || req.query.status === 'true') return res.json(live.status());
    if (matchId) return res.json(live.get(matchId));
    const st = live.status();
    return res.json({ ...st, noteZh: st.noteZh + ' 传 matchId 获取单场全玩法。' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || '实时赔率读取失败' });
  }
});

app.get('/api/market-value-status', (req, res) => {
  try { res.json(require('./lib/market-value').status()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/af-player'
, async (req, res) => {
  try {
    const playerId = req.query.id || req.query.playerId;
    const league = String(req.query.league || '').trim();
    const season = req.query.season;
    const refresh = req.query.refresh === '1' || req.query.force === '1';
    const payload = await require('./lib/league-tables').getAfPlayerDetail({ playerId, league, season, refresh });
    res.json(payload);
  } catch (e) {
    const code = e.code === 'no_key' ? 503 : 502;
    res.status(code).json({ ok: false, reason: e.code || 'error', error: '球员详情暂时不可用', detail: e.message });
  }
});


app.get('/api/news', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = req.query.limit;
    const force = req.query.refresh === '1' || req.query.force === '1';
    const lang = String(req.query.lang || 'zh').trim();
    const before = req.query.before != null ? String(req.query.before).trim() : '';
    const offset = req.query.offset != null ? String(req.query.offset).trim() : '';
    const payload = await require('./lib/news').listNews({ q, limit, force, lang, before: before || undefined, offset: offset || undefined });
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, error: '资讯暂时不可用', detail: e.message });
  }
});

// One-tap EN→zh for foreign news (MyMemory, cached by article id). Works from Aliyun CN.
app.get('/api/news/:id/translate', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少资讯 id' });
    const news = require('./lib/news');
    const lang = String(req.query.lang || 'en').trim();
    const payload = await news.getNewsItem(id, { lang });
    if (!payload || !payload.item) return res.status(404).json({ error: '未找到该资讯' });
    const item = payload.item;
    if (!news.isEnForeignItem(item)) {
      return res.status(400).json({ error: '仅支持外网英文资讯翻译' });
    }
    const art = payload.article || {};
    const html = (art.html && (art.mode === 'html' || art.mode === 'summary' || art.mode === 'embed'))
      ? art.html
      : (art.html || (item.summary ? ('<p>' + String(item.summary).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>') : ''));
    const tr = await require('./lib/translate').translateArticle(item.id, {
      title: item.title || '',
      html: html || '',
    });
    res.json({
      ok: true,
      id: item.id,
      provider: tr.provider,
      cached: tr.cached,
      title: item.title,
      titleZh: tr.titleZh,
      htmlZh: tr.htmlZh,
      disclaimerZh: tr.disclaimerZh || '机器翻译',
      fetchedAt: tr.fetchedAt,
    });
  } catch (e) {
    const code = e && e.code;
    const userMsg = (e && e.userMessage) || '';
    let error = '翻译暂时不可用，请稍后重试';
    if (code === 'RATE_LIMIT') error = '翻译额度已用完或请求过快，请稍后再试（已自动尝试备用通道）';
    else if (code === 'TIMEOUT') error = '翻译超时，请稍后重试';
    else if (code === 'NETWORK') error = '无法连接翻译服务，请稍后重试';
    else if (userMsg) error = userMsg;
    console.warn('translate failed', code || '', e && e.message);
    res.status(502).json({ ok: false, error, code: code || 'TRANSLATE_FAILED', detail: e && e.message });
  }
});

app.get('/api/news/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少资讯 id' });
    const lang = String(req.query.lang || 'zh').trim();
    const payload = await require('./lib/news').getNewsItem(id, { lang });
    if (!payload) return res.status(404).json({ error: '未找到该资讯' });
    res.json(payload);
  } catch (e) {
    res.status(502).json({ ok: false, error: '资讯详情暂时不可用', detail: e.message });
  }
});

app.use('/api', require('./lib/admin'));
app.use('/api', require('./lib/auth'));
const kbApi = require('./lib/kb');
kbApi.configure({
  resolveMatch: async (matchId) => {
    for (const kind of ['matches', 'schedule']) {
      try {
        const pack = await getData(kind);
        const m = (pack.data || []).find((x) => String(x.id) === String(matchId));
        if (m) return m;
      } catch (_) { /* */ }
    }
    return null;
  },
});
app.use('/api', kbApi);
app.use('/api', require('./lib/membership'));
app.use('/api', require('./lib/chat'));
const columnApi = require('./lib/column');
app.use('/api', columnApi);
// 1.9.75: settle 专栏胜平负表态 from live results cache when available
columnApi.configure({
  lookupMatchResult(matchId) {
    try {
      const pack = cache.results && cache.results.payload;
      const list = (pack && pack.data) || [];
      const m = list.find((x) => String(x.id) === String(matchId));
      if (!m) return null;
      let flag = m.winFlag ? String(m.winFlag).toUpperCase() : '';
      if (!/^[HDA]$/.test(flag) && m.full) {
        const [hg, ag] = String(m.full).split(':').map(Number);
        if (!Number.isNaN(hg) && !Number.isNaN(ag)) flag = hg > ag ? 'H' : hg === ag ? 'D' : 'A';
      }
      return /^[HDA]$/.test(flag) ? flag : null;
    } catch { return null; }
  },
});
function matchFromCaches(matchId) {
  const id = String(matchId);
  for (const kind of ['matches', 'schedule']) {
    try {
      const pack = cache[kind] && cache[kind].payload;
      const m = (pack && pack.data || []).find((x) => String(x.id) === id);
      if (m) return m;
    } catch { /* */ }
  }
  return null;
}
function upcomingMatchesFromCache() {
  const out = [];
  const seen = new Set();
  for (const kind of ['matches', 'schedule']) {
    try {
      const pack = cache[kind] && cache[kind].payload;
      for (const m of (pack && pack.data) || []) {
        if (!m || m.id == null) continue;
        const id = String(m.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(m);
      }
    } catch { /* */ }
  }
  return out;
}
const platformAttitude = require('./lib/platform-attitude');
platformAttitude.configure({
  lookupMatch: matchFromCaches,
  listMatches: upcomingMatchesFromCache,
});
app.use('/api', require('./lib/deepseek-match-chat'));
app.use('/api', require('./lib/player-db-api'));
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
// 1.9.63: internal entry for 球员库 browse UI — requires PLAYER_DB_VIEW_KEY (?key=)
// 1.9.72: operator admin console (separate from App「我的」)
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin'), {
  setHeaders: (res, p) => { if (/\.(html|js|css)$/.test(p)) res.set('Cache-Control', 'no-cache'); },
}));
app.get(['/db/players', '/db/players/', '/admin/player-db'], (req, res) => {
  const expected = String(process.env.PLAYER_DB_VIEW_KEY || '').trim();
  if (!expected) return res.status(404).send('Not Found');
  const key = typeof req.query.key === 'string' ? String(req.query.key).trim() : '';
  if (!key || key.length !== expected.length) return res.status(404).send('Not Found');
  const crypto = require('crypto');
  const ok = (() => {
    try {
      return crypto.timingSafeEqual(Buffer.from(key, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch { return false; }
  })();
  if (!ok) return res.status(404).send('Not Found');
  res.redirect(302, '/#/player-db?key=' + encodeURIComponent(key));
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => { if (/(sw\.js|index\.html|config\.js|app\.js|style\.css)$/.test(p)) res.set('Cache-Control', 'no-cache'); },
}));
// 1.9.4: learn sporttery→ESPN team ids from schedule fixtures (fixes unmapped teams e.g. 费内巴切)

// 1.9.8/1.9.30: Data Center ESPN tables — daily 06:10 + 6h safety + FT-triggered per-league
function msUntilNextShanghai(hour, minute) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const h = Number(parts.hour), mi = Number(parts.minute), se = Number(parts.second);
  const nowMs = ((h * 60 + mi) * 60 + se) * 1000;
  let targetMs = ((hour * 60 + minute) * 60) * 1000;
  let wait = targetMs - nowMs;
  if (wait <= 0) wait += 24 * 3600e3;
  return wait;
}
async function runEspnTablesRefresh(reason) {
  try {
    const r = await require('./lib/espn-tables').refreshAll({ reason });
    console.log('[espn-tables]', reason, `ok=${r.ok} fail=${r.fail} ${r.ms}ms`);
    return r;
  } catch (e) {
    console.warn('[espn-tables]', reason, e.message);
    return { ok: 0, fail: -1, error: e.message };
  }
}
async function runEspnLeagueRefresh(keys, reason) {
  try {
    const r = await require('./lib/espn-tables').refreshLeagues(keys, { reason });
    console.log('[espn-tables]', reason, (keys || []).join(','), `ok=${r.ok} fail=${r.fail} ${r.ms}ms`);
    return r;
  } catch (e) {
    console.warn('[espn-tables]', reason, e.message);
    return { ok: 0, fail: -1, error: e.message };
  }
}

/** Map 竞彩 league abbr → ESPN data-center key (only leagues we show). */
const DC_LEAGUE_BY_ABBR = {
  '英超': 'epl', '西甲': 'laliga', '德甲': 'bundesliga', '意甲': 'seriea',
  '法甲': 'ligue1', '欧冠': 'ucl', 'UEFA Champions League': 'ucl',
  '中超': 'csl', '英冠': 'championship', '荷甲': 'eredivisie',
};
const FT_SEEN_FILE = () => path.join(require('./lib/db').DATA_DIR, 'live-stats', 'espn', 'tables', '_ft-seen.json');
const FT_COOLDOWN_MS = 18 * 60e3;   // per-league min gap (respect ESPN)
const FT_DELAY_MS = 4 * 60e3;       // wait so ESPN post-match stats can catch up
const FT_RECENT_MS = 36 * 3600e3;   // only react to finishes in last ~1.5 days
const pendingFtTimers = new Map();  // leagueKey -> timeout
let ftTickBusy = false;

function readFtSeen() {
  try { return JSON.parse(fs.readFileSync(FT_SEEN_FILE(), 'utf8')); } catch { return { matches: {}, leagues: {} }; }
}
function writeFtSeen(st) {
  try {
    const dir = path.dirname(FT_SEEN_FILE());
    fs.mkdirSync(dir, { recursive: true });
    const tmp = FT_SEEN_FILE() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(st));
    fs.renameSync(tmp, FT_SEEN_FILE());
  } catch (e) { console.warn('[espn-tables] ft-seen save', e.message); }
}
function pruneFtSeen(st) {
  const cutoff = Date.now() - 7 * 864e5;
  for (const [id, at] of Object.entries(st.matches || {})) {
    if (!at || at < cutoff) delete st.matches[id];
  }
  return st;
}
function scoreLooksFinal(full) {
  const s = String(full || '').trim();
  if (!s || /取消|无效|推迟|腰斩/.test(s)) return false;
  return /^\d+\s*[:：\-]\s*\d+$/.test(s);
}
function matchLooksFinished(m) {
  if (!m) return false;
  const st = String(m.status || '');
  if (/已完成|完场|Finished|Payout/i.test(st)) return scoreLooksFinal(m.full) || st === 'Finished' || st === '完场' || st === '已完成';
  return scoreLooksFinal(m.full);
}
function matchIsRecentEnough(m) {
  const d = m.date || m.businessDate;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  // end of match-day + buffer in Asia/Shanghai
  const end = new Date(`${d}T23:59:59+08:00`).getTime();
  return Date.now() - end < FT_RECENT_MS && end - Date.now() < 2 * 864e5;
}
function scheduleLeagueFtRefresh(key, matchId) {
  if (!key || pendingFtTimers.has(key)) return;
  const st = readFtSeen();
  const last = (st.leagues && st.leagues[key]) || 0;
  const wait = Math.max(FT_DELAY_MS, last ? (FT_COOLDOWN_MS - (Date.now() - last)) : FT_DELAY_MS);
  const delay = Math.max(FT_DELAY_MS, wait);
  console.log('[espn-tables] FT queue', key, 'after match', matchId, `in ${Math.round(delay / 1000)}s`);
  const t = setTimeout(async () => {
    pendingFtTimers.delete(key);
    const now = Date.now();
    const cur = readFtSeen();
    const prev = (cur.leagues && cur.leagues[key]) || 0;
    if (prev && now - prev < FT_COOLDOWN_MS - 5000) {
      console.log('[espn-tables] FT skip cooldown', key);
      return;
    }
    await runEspnLeagueRefresh([key], 'ft-' + key);
    const after = pruneFtSeen(readFtSeen());
    after.leagues = after.leagues || {};
    after.leagues[key] = Date.now();
    writeFtSeen(after);
  }, delay);
  pendingFtTimers.set(key, t);
}

async function tickFtTableRefresh() {
  if (ftTickBusy) return;
  ftTickBusy = true;
  try {
    const st = pruneFtSeen(readFtSeen());
    st.matches = st.matches || {};
    st.leagues = st.leagues || {};
    let dirty = false;
    const pools = [];
    try {
      const res = await getData('results');
      if (res && res.data) pools.push(...res.data);
    } catch (e) { /* results optional */ }
    try {
      const sch = await getData('schedule');
      if (sch && sch.data) pools.push(...sch.data);
    } catch (e) { /* schedule optional */ }

    const newly = [];
    for (const m of pools) {
      if (!m || !m.id) continue;
      const key = DC_LEAGUE_BY_ABBR[String(m.league || '').trim()];
      if (!key) continue;
      if (!matchLooksFinished(m)) continue;
      if (!matchIsRecentEnough(m)) continue;
      if (st.matches[String(m.id)]) continue;
      st.matches[String(m.id)] = Date.now();
      dirty = true;
      newly.push({ id: String(m.id), key, league: m.league });
    }
    if (dirty) writeFtSeen(st);
    for (const n of newly) scheduleLeagueFtRefresh(n.key, n.id);
    if (newly.length) {
      console.log('[espn-tables] FT detected', newly.map(n => `${n.league}:${n.id}`).join(', '));
    }
  } catch (e) {
    console.warn('[espn-tables] FT tick', e.message);
  } finally {
    ftTickBusy = false;
  }
}

function scheduleEspnTablesJobs() {
  // daily 06:10 Asia/Shanghai
  const armDaily = () => {
    const wait = msUntilNextShanghai(6, 10);
    console.log('[espn-tables] next daily refresh in', Math.round(wait / 60000), 'min (06:10 Asia/Shanghai)');
    setTimeout(async () => {
      await runEspnTablesRefresh('daily-0610');
      armDaily();
    }, wait);
  };
  armDaily();
  // every 6 hours safety net (all leagues)
  setInterval(() => { runEspnTablesRefresh('interval-6h'); }, 6 * 3600e3);
  // startup: only warm if cache missing/stale (>6h); avoid double-hit on frequent deploys
  setTimeout(() => {
    try {
      const espn = require('./lib/espn-tables');
      if (espn.needsRefresh(espn.FRESH_MS)) runEspnTablesRefresh('startup');
      else console.log('[espn-tables] startup skip (cache fresh)');
    } catch (e) {
      runEspnTablesRefresh('startup');
    }
  }, 45e3);
  // 1.9.30: poll results/schedule for just-finished DC leagues → per-league ESPN refresh
  setTimeout(() => { tickFtTableRefresh(); }, 70e3);
  setInterval(() => { tickFtTableRefresh(); }, 3 * 60e3);
}
scheduleEspnTablesJobs();

// 1.9.12/1.9.13: live full-odds sheet (tiered) + kickoff snapshots
(function scheduleOddsJobs() {
  const snap = require('./lib/odds-snapshot');
  const live = require('./lib/odds-live');
  snap.configure({ fetchJson, base: BASE });
  live.configure({ fetchJson, base: BASE });
  live.start();

  const runSnap = async (reason) => {
    try {
      const sch = await getData('schedule').catch(() => ({ data: [] }));
      const mat = await getData('matches').catch(() => ({ data: [] }));
      const r = await snap.tick({ schedule: sch.data || [], matches: mat.data || [] });
      if (r.saved || r.pre || reason === 'startup') {
        console.log('[odds-snapshot]', reason, JSON.stringify(r));
      }
    } catch (e) { console.warn('[odds-snapshot]', reason, e.message); }
  };
  setTimeout(async () => {
    await runSnap('startup');
    try {
      const sch = await getData('schedule');
      const bf = await snap.backfillToday(sch.data || []);
      console.log('[odds-snapshot] backfill', JSON.stringify(bf));
      snap.pruneOld();
    } catch (e) { console.warn('[odds-snapshot] backfill', e.message); }
  }, 55e3);
  // Snapshot promotion tick: every 2 min (live poller already covers pre-kick sheet)
  setInterval(() => { runSnap('tick'); }, 120e3);
})();


async function espnLearnJob() {
  try {
    const p = await getData('schedule');
    const n = await require('./lib/espn-lineup').learnFromSchedule(p.data || []);
    console.log('espn learn: matched', n, 'fixtures');
  } catch (e) { console.warn('espn learn', e.message); }
}
setTimeout(espnLearnJob, 20e3);
setInterval(espnLearnJob, 6 * 3600e3);

// 1.9.107: warm assembled lineups for on-sale matches near kickoff (prev XI + photos in our cache)
async function lineupWarmJob(reason) {
  try {
    const lu = require('./lib/espn-lineup');
    const sch = await getData('schedule').catch(() => ({ data: [] }));
    const mat = await getData('matches').catch(() => ({ data: [] }));
    const byId = new Map();
    for (const m of [...(sch.data || []), ...(mat.data || [])]) {
      if (m && m.id && !byId.has(String(m.id))) byId.set(String(m.id), m);
    }
    const r = await lu.warmUpcoming([...byId.values()], { withinHours: 36, limit: 24, gapMs: 800 });
    if (r.warmed || reason === 'startup') console.log('[lineup-warm]', reason, JSON.stringify(r));
  } catch (e) { console.warn('[lineup-warm]', reason, e.message); }
}
setTimeout(() => lineupWarmJob('startup'), 90e3);
setInterval(() => lineupWarmJob('tick'), 12 * 60e3);

// 1.9.53: auto-fill missing team badges (ESPN → API-Football) into crests.json + hot-reload maps
try {
  require('./lib/crest-autofill').start({
    onReload: reloadCrestMaps,
    hasUsable: crestUsable,
  });
} catch (e) { console.warn('[crest-autofill] start failed', e.message); }

app.listen(PORT, '0.0.0.0', () => {
  console.log(`竞彩预测 v${require('./package.json').version} running at http://localhost:${PORT} (data: ${require('./lib/db').DATA_DIR})`);
  pruneNewsImages().then((r) => {
    if (r && r.removed) console.log('news-images pruned', r);
  }).catch(() => {});
});
