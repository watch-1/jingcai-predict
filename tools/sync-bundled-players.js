'use strict';
/**
 * Sync leaderboard player headshots into public/assets/players/{playerId}.png
 * for Capacitor APK bundling (1.9.204+). Run after data-center-boot.json updates.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const bootPath = path.join(root, 'public/data-center-boot.json');
const outDir = path.join(root, 'public/assets/players');

const LEAGUES = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'csl', 'ucl'];
const SLICE_LIMITS = { topscorers: 12, topassists: 6, playervalues: 15, topkeepers: 8 };
const MAX_BYTES_PER_FILE = 140000;

function collectPlayers() {
  const j = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
  const map = new Map();
  for (const lg of LEAGUES) {
    for (const [suf, cap] of Object.entries(SLICE_LIMITS)) {
      const s = j.slices && j.slices[lg + ':' + suf];
      if (!s || !s.rows) continue;
      for (const r of s.rows.slice(0, cap)) {
        if (!r || !r.playerId) continue;
        const id = String(r.playerId);
        let photo = r.photo || r.photoAlt || '';
        if (!photo && /^\d+$/.test(id)) {
          photo = `https://media.api-sports.io/football/players/${id}.png`;
        }
        if (!photo) continue;
        if (!map.has(id)) map.set(id, { id, photo, photoAlt: r.photoAlt || '' });
      }
    }
  }
  return [...map.values()];
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, { headers: { 'User-Agent': 'jingcai-player-sync/1.9.204' } }, (res) => {
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

async function downloadOne(entry) {
  const fp = path.join(outDir, entry.id + '.png');
  if (fs.existsSync(fp) && fs.statSync(fp).size > 800) return 'skip';
  const urls = [entry.photo, entry.photoAlt].filter(Boolean);
  for (const url of urls) {
    try {
      const buf = await fetchUrl(url);
      if (!buf || buf.length < 400 || buf.length > MAX_BYTES_PER_FILE) continue;
      fs.writeFileSync(fp, buf);
      return 'ok';
    } catch (_) { /* try alt */ }
  }
  return 'fail';
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const players = collectPlayers();
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const concurrency = 6;
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
  const playerIds = players
    .map((p) => p.id)
    .filter((id) => {
      const fp = path.join(outDir, id + '.png');
      return fs.existsSync(fp) && fs.statSync(fp).size > 800;
    })
    .sort((a, b) => Number(a) - Number(b));
  const manifest = {
    v: 1,
    source: 'boot-leader-photos',
    playerIds,
    syncedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const idsPath = path.join(root, 'public/bundled-player-ids.json');
  fs.writeFileSync(idsPath, JSON.stringify({ v: 1, playerIds, syncedAt: manifest.syncedAt }) + '\n');
  const configPath = path.join(root, 'public/config.js');
  try {
    let cfg = fs.readFileSync(configPath, 'utf8');
    const verMatch = cfg.match(/version:"([^"]+)"/);
    const ver = verMatch ? verMatch[1] : '1.9.205';
    const next = `window.APP_CONFIG={apiBase:"",platform:"web",version:"${ver}",bundledPlayerIds:${JSON.stringify(playerIds)}};\n`;
    fs.writeFileSync(configPath, next);
  } catch (_) { /* optional */ }
  const bytes = playerIds.reduce((n, id) => n + fs.statSync(path.join(outDir, id + '.png')).size, 0);
  console.log(JSON.stringify({
    candidates: players.length,
    inManifest: playerIds.length,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    bytes,
    mb: (bytes / 1048576).toFixed(2),
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
