// 1.9.7/1.9.8/1.9.30: Current-season standings / topscorers / topassists via ESPN public APIs.
// Refresh policy: disk cache + daily 06:10 + 6h safety net + FT-triggered per-league refresh
// on match days. NOT minute-by-minute realtime (ESPN public API / rate limits).
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

/** Serve as fresh without re-fetch when younger than this. */
const FRESH_MS = 6 * 3600e3;
/** Soft max age before we still serve but trigger background refresh. */
const SWR_MS = 24 * 3600e3;
/** Absolute stale fallback when ESPN fails. */
const STALE_MS = 7 * 864e5;
const DIR = () => path.join(DATA_DIR, 'live-stats', 'espn', 'tables');
const LOG_FILE = () => path.join(DIR(), '_refresh-log.jsonl');

const SLUG = {
  epl: 'eng.1', laliga: 'esp.1', bundesliga: 'ger.1', seriea: 'ita.1',
  ligue1: 'fra.1', ucl: 'uefa.champions', csl: 'chn.1', championship: 'eng.2', eredivisie: 'ned.1',
};
const KEYS = Object.keys(SLUG);
const CALENDAR_YEAR = new Set(['chn.1']);
const KINDS = ['standings', 'scorers', 'assists'];

function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }
function writeJson(f, o) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f);
}
function logLine(obj) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE()), { recursive: true });
    fs.appendFileSync(LOG_FILE(), JSON.stringify({ at: new Date().toISOString(), ...obj }) + '\n');
  } catch {}
}
async function getJson(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 jingcai' } });
    if (!r.ok) throw new Error('ESPN HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function currentSeasonYear(slug) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (CALENDAR_YEAR.has(slug)) return y;
  return m >= 7 ? y : y - 1;
}
function seasonLabelOf(year, slug) {
  if (CALENDAR_YEAR.has(slug)) return String(year);
  return `${year}/${String(year + 1).slice(-2)}`;
}
function isAcceptableSeason(year, slug) {
  const cur = currentSeasonYear(slug);
  return Number(year) >= cur - 1;
}
function logoOf(team) {
  // Always prefer ESPN /soccer/500/ (not combiner thumbs or /100/) for retina crests.
  if (team && team.id) return `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png`;
  const logos = (team && team.logos) || [];
  const hit = logos.find(l => (l.rel || []).includes('default')) || logos[0];
  let href = (hit && hit.href) || '';
  if (/espncdn\.com.*\/i\/teamlogos\/soccer\/\d+\//i.test(href)) {
    href = href.replace(/\/soccer\/\d+\//, '/soccer/500/');
  }
  return href;
}
function parseStat(entry, name) {
  for (const s of entry.stats || []) if (s.name === name) return s.value != null ? s.value : Number(s.displayValue);
  return null;
}

async function fetchStandings(slug) {
  const j = await getJson(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);
  const year = (j.season && j.season.year) || currentSeasonYear(slug);
  const children = j.children || [];
  // UCL (and similar): prefer "League Phase" / overall single table over knockout brackets
  const child = children.find(c => /league\s*phase|overall|总积分|联赛阶段/i.test(String((c && c.name) || '')))
    || children.find(c => (((c.standings || {}).entries) || []).length >= 8)
    || children[0]
    || {};
  const entries = ((child.standings || {}).entries) || [];
  const rows = entries.map((e, i) => {
    const t = e.team || {};
    return {
      rank: (() => { const r = (e.stats || []).find(s => s.name === 'rank'); return r ? Number(r.value) : i + 1; })(),
      teamId: t.id, team: t.displayName || t.name || '', teamZh: '', logo: logoOf(t),
      played: parseStat(e, 'gamesPlayed') ?? parseStat(e, 'games'),
      win: parseStat(e, 'wins'), draw: parseStat(e, 'ties'), lose: parseStat(e, 'losses'),
      gf: parseStat(e, 'pointsFor'), ga: parseStat(e, 'pointsAgainst'),
      gd: parseStat(e, 'pointDifferential'), points: parseStat(e, 'points'),
      form: ((e.stats || []).find(s => s.name === 'streak' || s.name === 'form') || {}).displayValue || '',
      description: (e.note && (e.note.description || e.note.text)) || '',
      espnTeamId: String(t.id || ''),
    };
  });
  return {
    year,
    seasonLabel: (j.season && j.season.displayName) || seasonLabelOf(year, slug),
    rows,
    leagueEn: j.name || '',
    groupName: child.name || '',
  };
}

function parseLeaderValue(displayValue, kind) {
  const s = String(displayValue || '');
  const g = s.match(/Goals:\s*(\d+)/i);
  const a = s.match(/Assists:\s*(\d+)/i);
  const m = s.match(/Matches:\s*(\d+)/i);
  if (kind === 'goals') return { goals: g ? Number(g[1]) : Number(s) || 0, assists: a ? Number(a[1]) : 0, appearances: m ? Number(m[1]) : null };
  return { assists: a ? Number(a[1]) : Number(s) || 0, goals: g ? Number(g[1]) : 0, appearances: m ? Number(m[1]) : null };
}

async function fetchLeaders(slug, kind) {
  const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/statistics`);
  const year = (j.season && j.season.year) || currentSeasonYear(slug);
  const want = kind === 'assists' ? 'assistsLeaders' : 'goalsLeaders';
  const group = (j.stats || []).find(g => g.name === want) || (j.stats || [])[0];
  const leaders = (group && group.leaders) || [];
  const rows = leaders.map((L, i) => {
    const ath = L.athlete || {};
    const team = ath.team || {};
    const parsed = parseLeaderValue(L.displayValue, kind === 'assists' ? 'assists' : 'goals');
    const head = ath.headshot;
    const photo = (head && typeof head === 'object' ? head.href : head) || '';
    return {
      rank: i + 1,
      playerId: ath.id, player: ath.displayName || '', playerZh: '', photo: photo || '',
      teamId: team.id, team: team.displayName || team.name || '', teamZh: '',
      teamLogo: logoOf(team),
      goals: kind === 'assists' ? (parsed.goals || 0) : (parsed.goals || Number(L.value) || 0),
      assists: kind === 'assists' ? (parsed.assists || Number(L.value) || 0) : (parsed.assists || 0),
      appearances: parsed.appearances, minutes: null, rating: null,
      espnAthleteId: String(ath.id || ''), espnTeamId: String(team.id || ''),
    };
  });
  return {
    year,
    seasonLabel: (j.season && j.season.displayName) || seasonLabelOf(year, slug),
    rows,
    leagueEn: (j.league && j.league.name) || '',
  };
}

const inflight = new Map();
const bgRefresh = new Set();

function diskKey(kind, slug) { return `${kind}-${slug}`; }
function diskPath(kind, slug) { return path.join(DIR(), diskKey(kind, slug) + '.json'); }

async function fetchRaw(kind, slug) {
  if (kind === 'standings') return fetchStandings(slug);
  if (kind === 'scorers') return fetchLeaders(slug, 'goals');
  return fetchLeaders(slug, 'assists');
}

async function forceFetch(kind, slug) {
  const mk = diskKey(kind, slug);
  if (inflight.has(mk)) return inflight.get(mk);
  const job = (async () => {
    const payload = await fetchRaw(kind, slug);
    const at = Date.now();
    writeJson(diskPath(kind, slug), { at, payload });
    return { payload, at };
  })().finally(() => inflight.delete(mk));
  inflight.set(mk, job);
  return job;
}

function wrap(payload, at, extra = {}) {
  const age = Math.round((Date.now() - at) / 1000);
  return {
    ...payload,
    cached: age > 5,
    cacheAgeSec: age,
    updatedAt: new Date(at).toISOString(),
    fetchedAt: new Date(at).toISOString(),
    ...extra,
  };
}

/**
 * @param {{ force?: boolean, allowSWR?: boolean }} opts
 * force=true: always hit ESPN (cron). allowSWR=true (default): if >FRESH_MS serve disk and refresh in background.
 */
async function withDisk(kind, slug, opts = {}) {
  const force = !!opts.force;
  const allowSWR = opts.allowSWR !== false;
  const f = diskPath(kind, slug);
  const disk = readJson(f, null);

  if (force) {
    const { payload, at } = await forceFetch(kind, slug);
    return wrap(payload, at, { cached: false });
  }

  if (disk && disk.at && disk.payload) {
    const age = Date.now() - disk.at;
    if (age < FRESH_MS) return wrap(disk.payload, disk.at, { cached: true });
    if (allowSWR && age < SWR_MS) {
      // stale-while-revalidate
      const mk = diskKey(kind, slug);
      if (!bgRefresh.has(mk) && !inflight.has(mk)) {
        bgRefresh.add(mk);
        forceFetch(kind, slug).catch(e => console.warn('espn-tables bg', mk, e.message))
          .finally(() => bgRefresh.delete(mk));
      }
      return wrap(disk.payload, disk.at, { cached: true, refreshing: true });
    }
  }

  try {
    const { payload, at } = await forceFetch(kind, slug);
    return wrap(payload, at, { cached: false });
  } catch (e) {
    if (disk && disk.at && Date.now() - disk.at < STALE_MS && disk.payload) {
      return wrap(disk.payload, disk.at, { cached: true, stale: true, staleError: e.message });
    }
    throw e;
  }
}

async function refreshLeagues(keys, { reason = 'manual', warmPhotos = true } = {}) {
  const want = [...new Set((keys || []).filter(k => SLUG[k]))];
  if (!want.length) return { reason, ms: 0, ok: 0, fail: 0, results: [], keys: [] };
  const started = Date.now();
  const results = [];
  for (const key of want) {
    const slug = SLUG[key];
    for (const kind of KINDS) {
      try {
        await forceFetch(kind, slug);
        results.push({ key, kind, ok: true });
        await new Promise(r => setTimeout(r, 400)); // polite gap
      } catch (e) {
        results.push({ key, kind, ok: false, error: e.message });
        console.warn('espn-tables refresh', key, kind, e.message);
      }
    }
  }
  const summary = {
    reason,
    keys: want,
    ms: Date.now() - started,
    ok: results.filter(r => r.ok).length,
    fail: results.filter(r => !r.ok).length,
    results,
  };
  logLine(summary);
  console.log('espn-tables refreshLeagues', reason, want.join(','), `ok=${summary.ok} fail=${summary.fail} ${summary.ms}ms`);
  if (warmPhotos) {
    setImmediate(() => {
      (async () => {
        for (const key of want) {
          try {
            await warmLeaderPhotos(key, 50);
          } catch (e) { console.warn('warmLeaderPhotos', key, e.message); }
        }
      })().catch(e => console.warn('warmLeaderPhotos batch', e.message));
    });
  }
  return summary;
}

async function refreshAll({ reason = 'manual' } = {}) {
  const summary = await refreshLeagues(KEYS, { reason, warmPhotos: false });
  // 1.9.11: after full tables refresh, prewarm top-50 scorer/assist photos (non-blocking)
  setImmediate(() => {
    warmAllLeaderPhotos({ limit: 50, reason: 'after-' + reason }).catch(e => console.warn('warmAllLeaderPhotos', e.message));
  });
  return summary;
}

/** True if any league/kind cache is missing or older than maxAgeMs (default FRESH_MS). */
function needsRefresh(maxAgeMs = FRESH_MS) {
  for (const key of KEYS) {
    const slug = SLUG[key];
    for (const kind of KINDS) {
      const disk = readJson(diskPath(kind, slug), null);
      if (!disk || !disk.at || !disk.payload) return true;
      if (Date.now() - disk.at >= maxAgeMs) return true;
    }
  }
  return false;
}

function lastRefreshInfo() {
  try {
    const lines = fs.readFileSync(LOG_FILE(), 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return null;
    // Prefer last table refresh (skip photo-warm noise)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lines[i]);
        if (o && o.type === 'leader-photos') continue;
        if (o && (o.reason || o.ok != null)) return o;
      } catch {}
    }
    return JSON.parse(lines[lines.length - 1]);
  } catch { return null; }
}


async function fetchTeamRoster(slug, teamId) {
  const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/roster`);
  const athletes = j.athletes || [];
  const players = athletes.map(a => {
    const pos = (a.position && (a.position.displayName || a.position.name)) || '';
    return {
      playerId: a.id,
      player: a.displayName || a.fullName || '',
      playerZh: '',
      photo: (a.headshot && a.headshot.href) || '',
      number: a.jersey || '',
      position: pos,
      positionZh: '',
      age: a.age != null ? a.age : null,
      espnAthleteId: String(a.id || ''),
    };
  }).filter(p => p.player);
  return { players, season: j.season && j.season.displayName, team: (j.team && j.team.displayName) || '' };
}

/** Build local photo index: tsdb-photos + squads cache (name|club + unique name). */
let _photoIdx = null;
function pnormFn(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function loadPhotoIndex(force) {
  if (!force && _photoIdx && Date.now() - _photoIdx.at < 10 * 60e3) return _photoIdx;
  const { DATA_DIR } = require('./db');
  const byKey = new Map();
  const byName = new Map(); // name -> Map(url -> count) then collapse unique
  const add = (name, team, url) => {
    if (!url || !/^https?:\/\//.test(url) || !name) return;
    const nn = pnormFn(name);
    const tt = pnormFn(team);
    if (nn && tt) byKey.set(nn + '|' + tt, url);
    if (nn) {
      if (!byName.has(nn)) byName.set(nn, new Map());
      const m = byName.get(nn);
      m.set(url, (m.get(url) || 0) + 1);
    }
  };
  try {
    const f = path.join(DATA_DIR, 'live-stats', 'espn', 'tsdb-photos.json');
    const cache = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [k, v] of Object.entries(cache || {})) {
      if (!v || !v.url) continue;
      const i = k.indexOf('|');
      if (i < 0) continue;
      add(k.slice(0, i), k.slice(i + 1), v.url);
    }
  } catch {}
  try {
    const sdir = path.join(DATA_DIR, 'squads');
    for (const file of fs.readdirSync(sdir)) {
      if (!file.endsWith('.json') || file.startsWith('_')) continue;
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(sdir, file), 'utf8')); } catch { continue; }
      const team = j.nameEn || j.name || j.team || j.strTeam || '';
      for (const pl of (j.players || [])) {
        if (!pl.photo) continue;
        add(pl.name, team, pl.photo);
        if (pl.nameAlt) add(pl.nameAlt, team, pl.photo);
      }
    }
  } catch {}
  const uniqueName = new Map();
  for (const [nn, m] of byName) {
    if (m.size === 1) uniqueName.set(nn, [...m.keys()][0]);
  }
  _photoIdx = { at: Date.now(), byKey, uniqueName };
  return _photoIdx;
}

/** 1.9.159 — sync photo lookup from cached ESPN scorer/assist boards (no network). */
function leaderPhotoMapForLeague(leagueKey) {
  const slug = SLUG[leagueKey];
  const byClub = new Map();
  const byName = new Map();
  if (!slug) return { byClub, byName };
  for (const kind of ['scorers', 'assists']) {
    const disk = readJson(diskPath(kind, slug), null);
    const rows = (disk && disk.payload && disk.payload.rows) || [];
    for (const r of rows) {
      if (!r || !r.photo) continue;
      const nn = pnormFn(r.player);
      const tt = pnormFn(r.team);
      if (nn && tt) byClub.set(nn + '|' + tt, r.photo);
      if (nn && !byName.has(nn)) byName.set(nn, r.photo);
    }
  }
  return { byClub, byName };
}

function lookupLeaderDiskPhoto(map, player, team) {
  if (!map) return '';
  const nn = pnormFn(player);
  const tt = pnormFn(team);
  if (!nn) return '';
  if (tt && map.byClub && map.byClub.has(nn + '|' + tt)) return map.byClub.get(nn + '|' + tt);
  if (map.byName && map.byName.has(nn)) return map.byName.get(nn);
  return '';
}

/** Market-value rows lack ESPN athlete ids — merge leader-disk photos, then local squads/TSDB. */
function enrichPlayervaluePhotos(rows, leagueKey) {
  if (!rows || !rows.length) return { filled: 0, leaders: 0 };
  const map = leaderPhotoMapForLeague(leagueKey);
  let leaders = 0;
  for (const r of rows) {
    if (!r || r.photo) continue;
    const url = lookupLeaderDiskPhoto(map, r.player, r.team);
    if (url) {
      r.photo = url;
      r.photoSrc = r.photoSrc || 'leaders-disk';
      leaders++;
    } else if (r.tmId != null && String(r.tmId)) {
      r.photo = `https://img.a.transfermarkt.technology/portrait/header/${String(r.tmId)}.jpg`;
      r.photoSrc = r.photoSrc || 'transfermarkt-id';
      leaders++;
    }
  }
  const { hit } = enrichLeaderPhotosSync(rows);
  return { filled: hit, leaders };
}

function lookupLocalPhoto(player, team) {
  const idx = loadPhotoIndex();
  const nn = pnormFn(player);
  const tt = pnormFn(team);
  if (!nn) return '';
  if (tt && idx.byKey.has(nn + '|' + tt)) return idx.byKey.get(nn + '|' + tt);
  // alias team keys via espn-lineup.teamsMatch against cached keys
  try {
    const lu = require('./espn-lineup');
    if (tt && lu.teamsMatch) {
      for (const [k, url] of idx.byKey) {
        const i = k.indexOf('|');
        if (i < 0) continue;
        if (k.slice(0, i) !== nn) continue;
        if (lu.teamsMatch(tt, k.slice(i + 1))) return url;
      }
    }
  } catch {}
  // unique full-name across all clubs (e.g. Harry Kane) — never for ambiguous short names
  if (nn.split(' ').filter(Boolean).length >= 2 && idx.uniqueName.has(nn)) return idx.uniqueName.get(nn);
  return '';
}

/** Sync photos from local caches; return misses for background fill. */
function enrichLeaderPhotosSync(rows) {
  try {
    loadPhotoIndex();
    let n = 0;
    const miss = [];
    const afLow = /media\.api-sports\.io\/football\/players\/\d+\./i;
    for (const r of rows || []) {
      const low = r.photo && afLow.test(r.photo);
      if (r.photo && !low) { n++; continue; }
      const url = lookupLocalPhoto(r.player, r.team);
      if (url) {
        if (low && !r.photoAlt) r.photoAlt = r.photo;
        r.photo = url;
        r.photoSrc = r.photoSrc || 'local-cache';
        n++;
      } else if (!r.photo && r.playerId != null && /^\d+$/.test(String(r.playerId))) {
        // 1.9.91: ESPN leaders often omit headshot; AF media by numeric id works for many
        r.photo = 'https://media.api-sports.io/football/players/' + String(r.playerId) + '.png';
        r.photoSrc = r.photoSrc || 'af-id-fallback';
        n++;
      } else if (!r.photo || low) {
        miss.push(r);
        if (r.photo) n++; // keep AF thumb until upgrade
      }
    }
    return { hit: n, miss };
  } catch (e) {
    console.warn('enrichLeaderPhotosSync', e.message);
    return { hit: 0, miss: (rows || []).filter(r => !r.photo) };
  }
}

function persistLeaderPhotos(kind, slug, rows) {
  if (!kind || !slug || !rows || !rows.length) return;
  try {
    const f = diskPath(kind, slug);
    const disk = readJson(f, null);
    if (!disk || !disk.payload || !Array.isArray(disk.payload.rows)) return;
    const byId = new Map();
    for (const r of rows) if (r && r.playerId != null && r.photo) byId.set(String(r.playerId), r.photo);
    let changed = 0;
    for (const r of disk.payload.rows) {
      const p = byId.get(String(r.playerId));
      if (p && r.photo !== p) { r.photo = p; changed++; }
    }
    if (changed) writeJson(f, disk);
  } catch (e) { console.warn('persistLeaderPhotos', e.message); }
}

/** Fast sync + background roster/TSDB fill. */
async function enrichLeaderPhotos(rows, meta = {}) {
  const { miss } = enrichLeaderPhotosSync(rows);
  if (miss && miss.length) {
    const kind = meta.kind, slug = meta.slug;
    setImmediate(() => {
      (async () => {
        try {
          const lu = require('./espn-lineup');
          const byTeam = new Map();
          for (const r of miss) {
            if (!r.team) continue;
            if (!byTeam.has(r.team)) byTeam.set(r.team, []);
            byTeam.get(r.team).push(r);
          }
          for (const [team, list] of byTeam) {
            const side = { team, starters: list.map(r => ({ name: r.player, photo: '' })), bench: [] };
            await lu.fillPhotosFromTsdb(side);
            for (let i = 0; i < list.length; i++) {
              if (side.starters[i] && side.starters[i].photo) {
                if (list[i].photo && /media\.api-sports\.io\/football\/players\//i.test(list[i].photo) && !list[i].photoAlt) {
                  list[i].photoAlt = list[i].photo;
                }
                list[i].photo = side.starters[i].photo;
              }
            }
          }
          loadPhotoIndex(true);
          enrichLeaderPhotosSync(rows);
          if (kind && slug) persistLeaderPhotos(kind, slug, rows);
        } catch (e) { console.warn('enrichLeaderPhotos bg', e.message); }
      })();
    });
  } else if (meta.kind && meta.slug) {
    persistLeaderPhotos(meta.kind, meta.slug, rows);
  }
  return rows;
}

/** Warm leader photos for one league (top N scorers + assists). Roster-first. */
async function warmLeaderPhotos(key = 'epl', limit = 50) {
  const slug = SLUG[key];
  if (!slug) return { ok: false, error: 'bad_key' };
  const out = { ok: true, key, slug, scorers: null, assists: null };
  loadPhotoIndex(true);
  for (const kind of ['scorers', 'assists']) {
    const raw = await withDisk(kind, slug, {});
    if (!raw || !raw.rows) { out[kind] = { n: 0, withPhoto: 0 }; continue; }
    const rows = raw.rows.slice(0, limit);
    // clear stale empty negatives for this batch
    try {
      const { DATA_DIR } = require('./db');
      const f = path.join(DATA_DIR, 'live-stats', 'espn', 'tsdb-photos.json');
      let cache = {};
      try { cache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
      let cleared = 0;
      for (const r of rows) {
        const k = pnormFn(r.player) + '|' + pnormFn(r.team);
        if (cache[k] && !cache[k].url) { delete cache[k]; cleared++; }
      }
      if (cleared) writeJson(f, cache);
      try { require('./espn-lineup').reloadTsdbCache(); } catch {}
    } catch {}
    enrichLeaderPhotosSync(rows);
    const lu = require('./espn-lineup');
    const byTeam = new Map();
    for (const r of rows) {
      if (r.photo) continue;
      if (!byTeam.has(r.team)) byTeam.set(r.team, []);
      byTeam.get(r.team).push(r);
    }
    for (const [team, list] of byTeam) {
      const side = { team, starters: list.map(r => ({ name: r.player, photo: '' })), bench: [] };
      await lu.fillPhotosFromTsdb(side);
      for (let i = 0; i < list.length; i++) if (side.starters[i].photo) list[i].photo = side.starters[i].photo;
    }
    loadPhotoIndex(true);
    enrichLeaderPhotosSync(rows);
    const byId = new Map(rows.filter(r => r.photo).map(r => [String(r.playerId), r.photo]));
    for (const r of raw.rows) {
      const ph = byId.get(String(r.playerId));
      if (ph) r.photo = ph;
    }
    persistLeaderPhotos(kind, slug, raw.rows);
    const withPhoto = rows.filter(r => r.photo).length;
    out[kind] = {
      n: rows.length,
      withPhoto,
      pct: rows.length ? Math.round(100 * withPhoto / rows.length) : 0,
      missing: rows.filter(r => !r.photo).map(r => r.player + '@' + (r.team || '')),
    };
  }
  return out;
}

/** Background warm all leagues after table refresh. Cross-process lock via lockfile. */
let _warmRunning = false;
function warmLockPath() { return path.join(DIR(), '_photo-warm.lock'); }
function tryWarmLock(reason) {
  const f = warmLockPath();
  try {
    const cur = readJson(f, null);
    if (cur && cur.pid && Date.now() - (cur.at || 0) < 45 * 60e3) {
      try { process.kill(cur.pid, 0); return false; } catch { /* stale */ }
    }
    writeJson(f, { at: Date.now(), pid: process.pid, reason });
    return true;
  } catch { return true; }
}
function clearWarmLock() {
  try { fs.unlinkSync(warmLockPath()); } catch {}
}
async function warmAllLeaderPhotos({ limit = 50, reason = 'manual' } = {}) {
  if (_warmRunning) return { ok: false, skipped: true, reason: 'busy' };
  if (!tryWarmLock(reason)) return { ok: false, skipped: true, reason: 'locked' };
  _warmRunning = true;
  const started = Date.now();
  const results = [];
  try {
    for (const key of KEYS) {
      try {
        const r = await warmLeaderPhotos(key, limit);
        results.push(r);
        console.log('leader-photos warm', reason, key, r.scorers && r.scorers.pct, r.assists && r.assists.pct);
      } catch (e) {
        results.push({ ok: false, key, error: e.message });
        console.warn('leader-photos warm', key, e.message);
      }
    }
  } finally { _warmRunning = false; clearWarmLock(); }
  const summary = { ok: true, reason, ms: Date.now() - started, results };
  logLine({ type: 'leader-photos', ...summary });
  return summary;
}

module.exports = {
  fetchTeamRoster, enrichLeaderPhotos, enrichLeaderPhotosSync, enrichPlayervaluePhotos, leaderPhotoMapForLeague, lookupLeaderDiskPhoto,
  warmLeaderPhotos, warmAllLeaderPhotos, persistLeaderPhotos, loadPhotoIndex, lookupLocalPhoto,
  SLUG, KEYS, KINDS, FRESH_MS, SWR_MS,
  currentSeasonYear, seasonLabelOf, isAcceptableSeason,
  refreshAll, refreshLeagues, needsRefresh, lastRefreshInfo, forceFetch,
  async getStandings(key, opts) {
    const slug = SLUG[key]; if (!slug) return null;
    return withDisk('standings', slug, opts);
  },
  async getScorers(key, opts) {
    const slug = SLUG[key]; if (!slug) return null;
    return withDisk('scorers', slug, opts);
  },
  async getAssists(key, opts) {
    const slug = SLUG[key]; if (!slug) return null;
    return withDisk('assists', slug, opts);
  },
};
