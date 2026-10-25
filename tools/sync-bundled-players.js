'use strict';
/**
 * Sync 球星榜 headshots into public/assets/players/{espnPlayerId}.png for APK bundling.
 *
 * Source priority (per player):
 *   1. Row photo / photoAlt from data-center-boot.json (ESPN headshot, TheSportsDB cutout/thumb)
 *   2. Leader-board cross-match (身价榜 ← 射手/助攻 boot rows)
 *   3. Transfermarkt portrait when tmId is present (playervalues)
 *   4. Optional --live: league-tables API (topkeepers slices not in boot)
 *
 * Never use media.api-sports.io/football/players/{id}.png when id is an ESPN athlete id
 * (API-Football returns a generic "NO PHOTO" 5192-byte PNG for wrong ids).
 *
 * TheSportsDB /cutout/ URLs are fetched as /thumb/ (~27KB) to stay APK-friendly.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const root = path.join(__dirname, '..');
const bootPath = path.join(root, 'public/data-center-boot.json');
const outDir = path.join(root, 'public/assets/players');
const VALUE_ESPN_BY_TM = (() => {
  try {
    return require('../data/value-board-espn-overrides.json').byTmId || {};
  } catch (_) {
    return {};
  }
})();
const FAMOUS_PHOTO_BY_ESPN = (() => {
  try {
    return require('../data/famous-player-photo-urls.json').byEspnId || {};
  } catch (_) {
    return {};
  }
})();

const LEAGUES = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'csl', 'ucl'];
const SLICE_LIMITS = {
  topscorers: 25,
  topassists: 25,
  playervalues: 20,
  topkeepers: 25,
};
/** Raw download cap (large TSDB cutouts); sharp compresses before APK bundle. */
const MAX_RAW_DOWNLOAD_BYTES = 900000;
const MIN_BYTES = 1200;
/** API-Football placeholder when ESPN id is used as AF player id */
const AF_PLACEHOLDER_MD5 = '430d67fd79ad0a355b212d5780886e34';
const AF_PLACEHOLDER_SIZE = 5192;

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function isPlaceholderBuffer(buf) {
  if (!buf || buf.length < MIN_BYTES) return true;
  if (buf.length === AF_PLACEHOLDER_SIZE && md5(buf) === AF_PLACEHOLDER_MD5) return true;
  return false;
}

function isPlaceholderFile(fp) {
  try {
    const st = fs.statSync(fp);
    if (st.size === AF_PLACEHOLDER_SIZE) {
      const buf = fs.readFileSync(fp);
      return isPlaceholderBuffer(buf);
    }
  } catch (_) { /* */ }
  return false;
}

function isAfUrlWithEspnId(url, espnPlayerId) {
  if (!url || !espnPlayerId) return false;
  const m = String(url).match(/media\.api-sports\.io\/football\/players\/(\d+)\./i);
  return m && m[1] === String(espnPlayerId);
}

/** Expand TSDB cutout → also try thumb (smaller when it exists). */
function expandPhotoUrls(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const u = raw.trim();
  if (!u) return [];
  if (/r2\.thesportsdb\.com\/images\/media\/player\/cutout\//i.test(u)) {
    const thumb = u.replace('/player/cutout/', '/player/thumb/');
    return [thumb, u];
  }
  return [u];
}

function resolveEspnIdForRow(row, leaderPhotos) {
  if (!row) return '';
  if (row.playerId != null && String(row.playerId) !== '') return String(row.playerId);
  const tm = row.tmId != null && String(row.tmId) !== '' ? String(row.tmId) : '';
  if (tm && VALUE_ESPN_BY_TM[tm]) return String(VALUE_ESPN_BY_TM[tm]);
  const nn = String(row.player || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const tt = String(row.team || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return '';
}

function photoCandidatesForRow(row, leaderPhotos) {
  let id = row && row.playerId != null ? String(row.playerId) : '';
  if (!id) id = resolveEspnIdForRow(row, leaderPhotos);
  const urls = [];
  const push = (raw) => {
    for (const u of expandPhotoUrls(raw)) {
      if (!u) continue;
      if (id && isAfUrlWithEspnId(u, id)) continue;
      if (!urls.includes(u)) urls.push(u);
    }
  };
  if (id) {
    push(`https://a.espncdn.com/i/headshots/soccer/players/full/${id}.png`);
    if (FAMOUS_PHOTO_BY_ESPN[id]) push(FAMOUS_PHOTO_BY_ESPN[id]);
  }
  push(row && row.photo);
  push(row && row.photoAlt);
  if (id && leaderPhotos && leaderPhotos.byId.has(id)) push(leaderPhotos.byId.get(id));
  if (row && leaderPhotos) {
    const nn = String(row.player || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const tt = String(row.team || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (nn && tt && leaderPhotos.byClub.has(nn + '|' + tt)) push(leaderPhotos.byClub.get(nn + '|' + tt));
  }
  if (row && row.tmId != null && String(row.tmId)) {
    push(`https://img.a.transfermarkt.technology/portrait/header/${String(row.tmId)}.jpg`);
  }
  return urls;
}

function buildLeaderPhotoMaps(boot) {
  const byId = new Map();
  const byClub = new Map();
  for (const lg of LEAGUES) {
    for (const suf of ['topscorers', 'topassists']) {
      const s = boot.slices && boot.slices[lg + ':' + suf];
      if (!s || !s.rows) continue;
      for (const r of s.rows) {
        if (!r || !r.photo) continue;
        const id = r.playerId != null ? String(r.playerId) : '';
        if (id) byId.set(id, r.photo);
        const nn = String(r.player || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const tt = String(r.team || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (nn && tt) byClub.set(nn + '|' + tt, r.photo);
      }
    }
  }
  return { byId, byClub };
}

function collectFromBoot() {
  const boot = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
  const leaderPhotos = buildLeaderPhotoMaps(boot);
  const map = new Map();
  const ingest = (row) => {
    if (!row) return;
    const id = resolveEspnIdForRow(row, leaderPhotos);
    if (!id) return;
    const urls = photoCandidatesForRow(Object.assign({}, row, { playerId: id }), leaderPhotos);
    if (!map.has(id)) map.set(id, { id, urls, player: row.player, team: row.team });
    else {
      const e = map.get(id);
      for (const u of urls) if (!e.urls.includes(u)) e.urls.push(u);
      if (!e.player) e.player = row.player;
      if (!e.team) e.team = row.team;
    }
  };
  for (const lg of LEAGUES) {
    for (const [suf, cap] of Object.entries(SLICE_LIMITS)) {
      if (suf === 'topkeepers') continue;
      const s = boot.slices && boot.slices[lg + ':' + suf];
      if (!s || !s.rows) continue;
      for (const r of s.rows.slice(0, cap)) ingest(r);
    }
  }
  return { players: [...map.values()], boot, leaderPhotos };
}

async function collectFromLiveKeepers() {
  const lt = require('../lib/league-tables');
  const rows = [];
  for (const lg of LEAGUES) {
    try {
      const r = await lt.getTopKeepers({ league: lg });
      if (r && r.rows) rows.push(...r.rows.slice(0, SLICE_LIMITS.topkeepers));
    } catch (e) {
      console.warn('[sync-players] topkeepers', lg, e.message);
    }
  }
  return rows;
}

async function fetchEspnRosterPhotoMap(slug, teamId) {
  const out = new Map();
  if (!slug || !teamId) return out;
  try {
    const j = await new Promise((resolve, reject) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/teams/${teamId}/roster`;
      https.get(url, { headers: { 'User-Agent': 'jingcai-player-sync/1.9.209' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    for (const a of j.athletes || []) {
      const id = a.id != null ? String(a.id) : '';
      const head = a.headshot;
      const photo = (head && typeof head === 'object' ? head.href : head) || '';
      if (id) out.set(id, photo);
    }
  } catch (e) {
    console.warn('[sync-players] roster', slug, teamId, e.message);
  }
  return out;
}

function mergePlayers(map, list, leaderPhotos) {
  for (const row of list || []) {
    if (!row) continue;
    const id = resolveEspnIdForRow(row, leaderPhotos);
    if (!id) continue;
    const urls = photoCandidatesForRow(Object.assign({}, row, { playerId: id }), leaderPhotos);
    if (!map.has(id)) map.set(id, { id, urls, player: row.player, team: row.team });
    else {
      const e = map.get(id);
      for (const u of urls) if (!e.urls.includes(u)) e.urls.push(u);
      if (!e.player) e.player = row.player;
      if (!e.team) e.team = row.team;
    }
  }
}

async function fetchEspnLeaderPhotoMap(slug) {
  const out = new Map();
  try {
    const j = await new Promise((resolve, reject) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/statistics`;
      https.get(url, { headers: { 'User-Agent': 'jingcai-player-sync/1.9.206' } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    for (const g of j.stats || []) {
      for (const L of g.leaders || []) {
        const ath = L.athlete || {};
        const id = ath.id != null ? String(ath.id) : '';
        const head = ath.headshot;
        const photo = (head && typeof head === 'object' ? head.href : head) || '';
        if (id && photo) out.set(id, photo);
      }
    }
  } catch (e) {
    console.warn('[sync-players] ESPN leaders', slug, e.message);
  }
  return out;
}

async function expandFromEspnCaches(map, leaderPhotos, live, boot) {
  const et = require('../lib/espn-tables');
  const { DATA_DIR } = require('../lib/db');
  const dir = path.join(DATA_DIR, 'live-stats', 'espn', 'tables');
  et.loadPhotoIndex(true);
  for (const lg of LEAGUES) {
    const slug = et.SLUG[lg];
    if (!slug) continue;
    for (const kind of ['scorers', 'assists']) {
      const f = path.join(dir, `${kind}-${slug}.json`);
      let disk;
      try {
        disk = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch (_) {
        continue;
      }
      const rows = (disk.payload && disk.payload.rows) || [];
      et.enrichLeaderPhotosSync(rows);
      mergePlayers(map, rows, leaderPhotos);
    }
  }
  for (const entry of map.values()) {
    if (entry.urls && entry.urls.length) continue;
    const url = et.lookupLocalPhoto(entry.player, entry.team);
    if (url && !isAfUrlWithEspnId(url, entry.id)) {
      for (const u of expandPhotoUrls(url)) {
        if (!entry.urls.includes(u)) entry.urls.push(u);
      }
    }
  }
  if (live) {
    const rosterTeams = new Set();
    for (const lg of LEAGUES) {
      const slug = et.SLUG[lg];
      if (!slug) continue;
      const pv = boot.slices && boot.slices[lg + ':playervalues'];
      for (const r of (pv && pv.rows) || []) {
        if (!r || !r.teamId) continue;
        rosterTeams.add(slug + '|' + String(r.teamId));
      }
    }
    for (const key of rosterTeams) {
      const [slug, tid] = key.split('|');
      const photos = await fetchEspnRosterPhotoMap(slug, tid);
      for (const entry of map.values()) {
        const ph = photos.get(entry.id);
        if (ph) {
          for (const u of expandPhotoUrls(ph)) {
            if (!entry.urls.includes(u)) entry.urls.push(u);
          }
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    for (const lg of LEAGUES) {
      const slug = et.SLUG[lg];
      if (!slug) continue;
      const photos = await fetchEspnLeaderPhotoMap(slug);
      for (const entry of map.values()) {
        const ph = photos.get(entry.id);
        if (ph) {
          for (const u of expandPhotoUrls(ph)) {
            if (!entry.urls.includes(u)) entry.urls.push(u);
          }
        }
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

async function gapFillFromTsdb(map) {
  const lu = require('../lib/espn-lineup');
  const miss = [...map.values()].filter((e) => !e.urls || !e.urls.length);
  const byTeam = new Map();
  for (const e of miss) {
    if (!e.player || !e.team) continue;
    if (!byTeam.has(e.team)) byTeam.set(e.team, []);
    byTeam.get(e.team).push(e);
  }
  const teams = [...byTeam.entries()];
  const concurrency = 6;
  let ti = 0;
  async function worker() {
    while (ti < teams.length) {
      const [team, list] = teams[ti++];
      const side = {
        team,
        starters: list.map((e) => ({ name: e.player, photo: '' })),
        bench: [],
      };
      try {
        await lu.fillPhotosFromTsdb(side);
      } catch (e) {
        console.warn('[sync-players] tsdb', team, e.message);
        continue;
      }
      for (let i = 0; i < list.length; i++) {
        const ph = side.starters[i] && side.starters[i].photo;
        if (!ph) continue;
        for (const u of expandPhotoUrls(ph)) {
          if (!list[i].urls.includes(u)) list[i].urls.push(u);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, { headers: { 'User-Agent': 'jingcai-player-sync/1.9.206' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return fetchUrl(next, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

const PREFERRED_MAX_BYTES = 95000;

async function optimizePlayerPng(fp) {
  if (!sharp) return;
  try {
    const before = fs.statSync(fp).size;
    const buf = await sharp(fp)
      .resize(150, 150, { fit: 'cover', position: 'top' })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    if (buf.length >= MIN_BYTES && buf.length < before) fs.writeFileSync(fp, buf);
  } catch (_) { /* keep original */ }
}

async function downloadOne(entry) {
  const fp = path.join(outDir, entry.id + '.png');
  if (fs.existsSync(fp) && !isPlaceholderFile(fp)) {
    const sz = fs.statSync(fp).size;
    if (sz > MIN_BYTES && sz <= PREFERRED_MAX_BYTES) return 'skip';
  }
  for (const url of entry.urls) {
    try {
      const buf = await fetchUrl(url);
      if (!buf || isPlaceholderBuffer(buf) || buf.length > MAX_RAW_DOWNLOAD_BYTES) continue;
      fs.writeFileSync(fp, buf);
      await optimizePlayerPng(fp);
      if (!fs.existsSync(fp) || fs.statSync(fp).size < MIN_BYTES || isPlaceholderFile(fp)) {
        try { fs.unlinkSync(fp); } catch (_) { /* */ }
        continue;
      }
      return 'ok';
    } catch (_) { /* try next url */ }
  }
  if (fs.existsSync(fp) && isPlaceholderFile(fp)) {
    try { fs.unlinkSync(fp); } catch (_) { /* */ }
  }
  return 'fail';
}

async function main() {
  const live = process.argv.includes('--live');
  fs.mkdirSync(outDir, { recursive: true });
  const { players: bootPlayers, leaderPhotos, boot } = collectFromBoot();
  const map = new Map(bootPlayers.map((p) => [p.id, p]));
  await expandFromEspnCaches(map, leaderPhotos, live, boot);
  if (live) {
    const keeperRows = await collectFromLiveKeepers();
    mergePlayers(map, keeperRows, leaderPhotos);
  }
  for (const entry of map.values()) {
    if (!entry.urls) entry.urls = [];
  }
  const allPlayers = [...map.values()];
  let players = allPlayers.filter((p) => p.urls && p.urls.length);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const concurrency = 8;
  let i = 0;
  async function worker() {
    while (i < players.length) {
      const p = players[i++];
      const r = await downloadOne(p);
      if (r === 'ok') ok++;
      else if (r === 'skip') skip++;
      else fail++;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  let playerIds = players
    .map((p) => p.id)
    .filter((id) => {
      const fp = path.join(outDir, id + '.png');
      return fs.existsSync(fp) && fs.statSync(fp).size > MIN_BYTES && !isPlaceholderFile(fp);
    })
    .sort((a, b) => Number(a) - Number(b));

  const missingAfterDl = allPlayers.filter((p) => !playerIds.includes(p.id));
  if (live && missingAfterDl.length && missingAfterDl.length <= 120) {
    const gapMap = new Map(missingAfterDl.map((p) => [p.id, { ...p, urls: p.urls ? [...p.urls] : [] }]));
    await gapFillFromTsdb(gapMap);
    const retryList = [...gapMap.values()].filter((p) => p.urls && p.urls.length);
    let j = 0;
    async function gapWorker() {
      while (j < retryList.length) {
        const p = retryList[j++];
        const r = await downloadOne(p);
        if (r === 'ok') ok++;
        else if (r === 'skip') skip++;
        else fail++;
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => gapWorker()));
    playerIds = allPlayers
      .map((p) => p.id)
      .filter((id) => {
        const fp = path.join(outDir, id + '.png');
        return fs.existsSync(fp) && fs.statSync(fp).size > MIN_BYTES && !isPlaceholderFile(fp);
      })
      .sort((a, b) => Number(a) - Number(b));
  }

  const manifest = {
    v: 2,
    source: 'boot-leader-photos',
    playerIds,
    syncedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const idsPath = path.join(root, 'public/bundled-player-ids.json');
  fs.writeFileSync(idsPath, JSON.stringify({ v: 2, playerIds, syncedAt: manifest.syncedAt }) + '\n');
  const configPath = path.join(root, 'public/config.js');
  try {
    let cfg = fs.readFileSync(configPath, 'utf8');
    const verMatch = cfg.match(/version:"([^"]+)"/);
    let ver = verMatch ? verMatch[1] : '1.9.206';
    try {
      const vt = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8').match(/VERSION=([^\n]+)/);
      if (vt) ver = vt[1].trim();
    } catch (_) { /* */ }
    const next = `window.APP_CONFIG={apiBase:"",platform:"web",version:"${ver}",bundledPlayerIds:${JSON.stringify(playerIds)}};\n`;
    fs.writeFileSync(configPath, next);
  } catch (_) { /* optional */ }

  if (sharp) {
    for (const id of playerIds) {
      await optimizePlayerPng(path.join(outDir, id + '.png'));
    }
  }
  const idSet = new Set(playerIds);
  for (const f of fs.readdirSync(outDir)) {
    if (!f.endsWith('.png')) continue;
    const id = f.slice(0, -4);
    const fp = path.join(outDir, f);
    if (!idSet.has(id) || isPlaceholderFile(fp)) {
      try { fs.unlinkSync(fp); } catch (_) { /* */ }
    }
  }
  const bytes = playerIds.reduce((n, id) => n + fs.statSync(path.join(outDir, id + '.png')).size, 0);
  const placeholdersLeft = fs.readdirSync(outDir).filter((f) => f.endsWith('.png') && isPlaceholderFile(path.join(outDir, f))).length;
  console.log(JSON.stringify({
    candidates: players.length,
    inManifest: playerIds.length,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    placeholderPngOnDisk: placeholdersLeft,
    bytes,
    mb: (bytes / 1048576).toFixed(2),
    live,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
