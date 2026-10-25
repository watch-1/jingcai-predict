'use strict';
/**
 * Sync TRIBE_LEAGUES team crests into public/assets/crests/{teamId}.png
 * for Capacitor APK bundling (1.9.202+). Run after data-center-boot.json updates.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const bootPath = path.join(root, 'public/data-center-boot.json');
const outDir = path.join(root, 'public/assets/crests');

const LEAGUES = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'csl', 'ucl'];

function collectTeamIds() {
  const j = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
  const ids = new Set();
  for (const lg of LEAGUES) {
    const s = j.slices && j.slices[lg + ':standings'];
    if (!s) continue;
    for (const tb of s.tables || []) {
      for (const r of tb.rows || []) {
        if (r.teamId) ids.add(String(r.teamId));
      }
    }
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'jingcai-crest-sync/1.9.202' } }, (res) => {
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const ids = collectTeamIds();
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const concurrency = 8;
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const id = ids[i++];
      const fp = path.join(outDir, id + '.png');
      try {
        if (fs.existsSync(fp) && fs.statSync(fp).size > 400) {
          skip++;
          continue;
        }
        const url = `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
        const buf = await fetchUrl(url);
        if (!buf || buf.length < 200) throw new Error('empty');
        fs.writeFileSync(fp, buf);
        ok++;
      } catch (e) {
        console.error('crest fail', id, e.message);
        fail++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const manifest = {
    v: 1,
    source: 'espn-500',
    teamIds: ids,
    syncedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ total: ids.length, downloaded: ok, skipped: skip, failed: fail }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
