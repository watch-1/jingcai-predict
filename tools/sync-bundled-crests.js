'use strict';
/**
 * Sync TRIBE_LEAGUES + official 赛程 team crests into public/assets/crests/.
 * Packed files are ESPN-500 club ids whenever a real ESPN id is known.
 * 体彩/sporttery team ids are a different namespace (359 = 亚美尼亚 vs Arsenal);
 * they are stored as a sporttery→filename map and, when no ESPN id can be
 * resolved, as a prefixed file such as jc-552.png. Never name a new file by
 * a raw 体彩 teamId. Run after data-center-boot.json or the official schedule updates.
 *
 *   node tools/sync-bundled-crests.js [--schedule=/path/to/schedule.json]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const root = path.join(__dirname, '..');
const bootPath = path.join(root, 'public/data-center-boot.json');
const outDir = path.join(root, 'public/assets/crests');
const crestsDocPath = path.join(root, 'data/crests.json');
const teamsIndexPath = path.join(root, 'data/live-stats/espn/teams-index.json');

const LEAGUES = ['epl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'csl', 'ucl', 'championship', 'eredivisie'];
const SLICE_SUFFIXES = ['standings', 'topscorers', 'topassists', 'clubvalues'];

const ESPN_LOGO_RE = /\/teamlogos\/soccer\/(?:500|50000)\/(\d+)\.(?:png|jpe?g)/i;
const TSDB_BADGE_RE = /thesportsdb\.com\/images\/media\/team\/badge\/([^/?#]+)/i;
const FLAG_LOGO_RE = /teamlogos\/countries\/|\/flags\/|flagcdn|country.?flag/i;
const SPORTTERY_LOGO_RE = /sporttery\.cn|jingcai|zgzcw|okooo|cnlottery|tiicai/i;

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function readJson(file, fb) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; }
}

function scheduleRowsFrom(j) {
  if (!j) return [];
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.data)) return j.data;
  if (j.payload && Array.isArray(j.payload.data)) return j.payload.data;
  if (j.payload && Array.isArray(j.payload)) return j.payload;
  return [];
}

function findSchedulePath() {
  const fromArg = argValue('--schedule=');
  const cands = [
    fromArg,
    process.env.SCHEDULE_JSON,
    path.join(root, 'data/sporttery-live-cache/schedule.json'),
    process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'sporttery-live-cache/schedule.json') : '',
  ].filter(Boolean);
  for (const p of cands) {
    if (fs.existsSync(p)) return p;
  }
  return '';
}

function espnIdFromLogo(url) {
  const m = String(url || '').match(ESPN_LOGO_RE);
  return m ? m[1] : '';
}

function tsdbBadgeFile(url) {
  const m = String(url || '').match(TSDB_BADGE_RE);
  return m ? m[1].toLowerCase() : '';
}

function isNationalFlagLogo(url) {
  return FLAG_LOGO_RE.test(String(url || ''));
}

function isSportteryLogo(url) {
  return SPORTTERY_LOGO_RE.test(String(url || ''));
}

function collectBootEspnIds(ids) {
  const addRow = (r) => {
    if (r && r.teamId) ids.add(String(r.teamId));
  };
  try {
    const j = JSON.parse(fs.readFileSync(bootPath, 'utf8'));
    for (const lg of LEAGUES) {
      for (const suf of SLICE_SUFFIXES) {
        const s = j.slices && j.slices[lg + ':' + suf];
        if (!s) continue;
        for (const tb of s.tables || []) {
          for (const r of tb.rows || []) addRow(r);
        }
        for (const r of s.rows || []) addRow(r);
      }
    }
  } catch (_) { /* boot optional */ }
}

function keepExistingPackedEspnIds(ids) {
  try {
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.png') && /^\d+\.png$/.test(f) && fs.statSync(path.join(outDir, f)).size > 400) {
        ids.add(f.slice(0, -4));
      }
    }
  } catch (_) { /* */ }
}

function collectTeamIds() {
  const ids = new Set();
  collectBootEspnIds(ids);
  keepExistingPackedEspnIds(ids);
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

function indexBootClubs() {
  const byBadge = new Map();
  const byZh = new Map();
  const boot = readJson(bootPath, null);
  const visit = (o) => {
    if (!o) return;
    if (Array.isArray(o)) { o.forEach(visit); return; }
    if (typeof o !== 'object') return;
    const espnId = o.teamId != null && String(o.teamId) !== '' ? String(o.teamId) : '';
    const logo = o.logo || '';
    const zh = String(o.teamZh || o.nameZh || '').trim();
    const en = String(o.team || o.name || '').trim();
    if (espnId && /^\d+$/.test(espnId)) {
      const badge = tsdbBadgeFile(logo);
      if (badge && !byBadge.has(badge)) byBadge.set(badge, espnId);
      if (zh) {
        if (!byZh.has(zh)) byZh.set(zh, new Set());
        byZh.get(zh).add(espnId);
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') visit(v);
    }
  };
  if (boot) visit(boot);
  return { byBadge, byZh };
}

function uniqueSetValue(set) {
  if (!set || set.size !== 1) return '';
  return [...set][0];
}

function resolveFromTeamsIndex(tid, name) {
  let tn;
  try { tn = require('../lib/team-names'); } catch { return ''; }
  const idx = readJson(teamsIndexPath, null);
  const teams = (idx && Array.isArray(idx.teams)) ? idx.teams : [];
  if (!teams.length) return '';
  const extras = [name].filter(Boolean);
  const cands = tn.candidateNames({ teamId: tid, extras });
  const folded = [...new Set(cands.map(tn.foldName).filter((x) => x && x.length >= 3))];
  if (!folded.length) return '';
  const hits = [];
  const seen = new Set();
  for (const c of folded) {
    for (const t of teams) {
      const id = t && t.id != null ? String(t.id) : '';
      if (!id || seen.has(id)) continue;
      const n = tn.foldName(t.name);
      const short = tn.foldName(t.short);
      if (n === c || short === c || tn.namesMatch(t.name, c) || (short && tn.namesMatch(t.short, c))) {
        seen.add(id);
        hits.push(id);
      }
    }
  }
  return hits.length === 1 ? hits[0] : '';
}

function collectScheduleTeams(rows) {
  const teams = new Map();
  for (const r of rows || []) {
    for (const side of ['home', 'away']) {
      const id = r && r[side + 'TeamId'] != null ? String(r[side + 'TeamId']).trim() : '';
      if (!id) continue;
      const name = String((r && (r[side] || r[side + 'Zh'])) || '').trim();
      const logo = String((r && r[side + 'Logo']) || '').trim();
      if (!teams.has(id)) teams.set(id, { id, name, logo });
      const t = teams.get(id);
      if (logo && !t.logo) t.logo = logo;
      if (name && !t.name) t.name = name;
    }
  }
  return [...teams.values()];
}

function sniffImage(buf) {
  if (!buf || buf.length < 16) return '';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 6).toString('ascii') === 'GIF87a' || buf.slice(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith('http://') ? http : https;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'jingcai-crest-sync/1.9.394',
        Accept: 'image/png,image/jpeg,image/webp,image/*,*/*;q=0.8',
      },
    }, (res) => {
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
    });
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function fileIdFromMapValue(v) {
  let id = String(v || '').trim();
  if (/\.png$/i.test(id)) id = id.replace(/\.png$/i, '');
  return id;
}

function isSafePackId(id) {
  return /^\d+$/.test(id) || /^jc-\d+$/.test(id);
}

async function writeCrestFile(fileId, url, { skipIfPresent = true } = {}) {
  if (!isSafePackId(fileId)) throw new Error('unsafe pack id ' + fileId);
  const fp = path.join(outDir, fileId + '.png');
  if (skipIfPresent && fs.existsSync(fp) && fs.statSync(fp).size > 400) {
    return { status: 'skip', bytes: fs.statSync(fp).size };
  }
  const buf = await fetchUrl(url);
  if (!buf || buf.length <= 400 || !sniffImage(buf)) throw new Error(buf && buf.length <= 400 ? 'too small' : 'not an image');
  fs.writeFileSync(fp, buf);
  return { status: 'download', bytes: buf.length };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const espnIds = new Set(collectTeamIds());
  const bootIdx = indexBootClubs();
  const crestsDoc = readJson(crestsDocPath, { teams: {} });
  const crestsTeams = (crestsDoc && crestsDoc.teams) || {};

  const schedulePath = findSchedulePath();
  const rows = schedulePath ? scheduleRowsFrom(readJson(schedulePath, null)) : [];
  const scheduleTeams = collectScheduleTeams(rows);

  const sportteryMap = {};
  const resolveNotes = [];
  const downloads = []; // { fileId, url, via }
  const skippedFlag = [];
  const failed = [];

  const queueEspn = (espnId, url) => {
    const id = String(espnId);
    if (!/^\d+$/.test(id)) return;
    espnIds.add(id);
    const fp = path.join(outDir, id + '.png');
    if (fs.existsSync(fp) && fs.statSync(fp).size > 400) return;
    downloads.push({
      fileId: id,
      url: url || `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`,
      via: 'espn',
    });
  };

  // Always keep / refresh the existing ESPN pack (boot + already packed).
  for (const id of espnIds) {
    queueEspn(id, `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`);
  }

  for (const t of scheduleTeams) {
    const tid = t.id;
    const logo = t.logo || '';
    const name = t.name || '';
    if (isNationalFlagLogo(logo)) {
      skippedFlag.push({ tid, name, logo });
      continue;
    }

    let espnId = espnIdFromLogo(logo);
    let via = espnId ? 'logo-url' : '';
    if (!espnId) {
      const badge = tsdbBadgeFile(logo);
      if (badge && bootIdx.byBadge.has(badge)) {
        espnId = bootIdx.byBadge.get(badge);
        via = 'boot-badge';
      }
    }
    if (!espnId) {
      const row = crestsTeams[tid];
      if (row && row.espnId && /^\d+$/.test(String(row.espnId))) {
        espnId = String(row.espnId);
        via = 'crests.json';
      }
    }
    if (!espnId && name && bootIdx.byZh.has(name)) {
      const uniq = uniqueSetValue(bootIdx.byZh.get(name));
      if (uniq) {
        espnId = uniq;
        via = 'boot-namezh';
      }
    }
    if (!espnId) {
      const hit = resolveFromTeamsIndex(tid, name);
      if (hit) {
        espnId = hit;
        via = 'teams-index';
      }
    }

    if (espnId) {
      // Never use the raw 体彩 id as the filename just because it equals an ESPN id.
      sportteryMap[tid] = espnId;
      resolveNotes.push({ tid, name, file: espnId, via, logo });
      const espnUrl = espnIdFromLogo(logo)
        ? logo
        : `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`;
      queueEspn(espnId, espnUrl);
      continue;
    }

    if (!logo) {
      resolveNotes.push({ tid, name, file: '', via: 'no-logo', logo });
      continue;
    }

    // Official logo but no safe ESPN id: pack under a prefixed id, never the bare 体彩 id.
    const fileId = 'jc-' + tid;
    sportteryMap[tid] = fileId;
    resolveNotes.push({ tid, name, file: fileId, via: 'prefixed', logo });
    const fp = path.join(outDir, fileId + '.png');
    if (fs.existsSync(fp) && fs.statSync(fp).size > 400) continue;
    downloads.push({ fileId, url: logo, via: 'prefixed' });
  }

  // Dedupe download jobs by fileId (first URL wins).
  const jobs = [];
  const seenFile = new Set();
  for (const job of downloads) {
    if (seenFile.has(job.fileId)) continue;
    seenFile.add(job.fileId);
    jobs.push(job);
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const concurrency = 8;
  let i = 0;

  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        const res = await writeCrestFile(job.fileId, job.url);
        if (res.status === 'skip') skip++;
        else ok++;
      } catch (e) {
        console.error('crest fail', job.fileId, job.url, e.message);
        failed.push({ fileId: job.fileId, url: job.url, error: e.message, via: job.via });
        fail++;
        // If a prefixed pack failed, drop it from the map so the client does not point at a missing file.
        if (String(job.fileId).startsWith('jc-')) {
          const tid = String(job.fileId).slice(3);
          if (sportteryMap[tid] === job.fileId) delete sportteryMap[tid];
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const packedIds = [];
  try {
    for (const f of fs.readdirSync(outDir)) {
      if (!f.endsWith('.png')) continue;
      const id = f.slice(0, -4);
      if (!isSafePackId(id)) continue;
      if (fs.statSync(path.join(outDir, f)).size > 400) packedIds.push(id);
    }
  } catch (_) { /* */ }
  packedIds.sort((a, b) => {
    const na = /^\d+$/.test(a);
    const nb = /^\d+$/.test(b);
    if (na && nb) return Number(a) - Number(b);
    if (na && !nb) return -1;
    if (!na && nb) return 1;
    return a.localeCompare(b);
  });

  // Drop map entries whose packed file is missing (failed ESPN download, etc.).
  for (const [tid, fileId] of Object.entries(sportteryMap)) {
    const id = fileIdFromMapValue(fileId);
    if (!packedIds.includes(id)) delete sportteryMap[tid];
  }

  const syncedAt = new Date().toISOString();
  const mapDoc = {
    v: 1,
    source: 'official-schedule+espn-500',
    syncedAt,
    map: sportteryMap,
  };
  fs.writeFileSync(path.join(outDir, 'sporttery-map.json'), JSON.stringify(mapDoc, null, 2) + '\n');

  const manifest = {
    v: 2,
    source: schedulePath ? 'espn-500+schedule' : 'espn-500',
    teamIds: packedIds,
    sportteryCrests: sportteryMap,
    syncedAt,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  try {
    const cfgPath = path.join(root, 'public/config.js');
    const src = fs.readFileSync(cfgPath, 'utf8');
    const mm = src.match(/window\.APP_CONFIG\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (mm) {
      const cfg = Function('return (' + mm[1] + ')')();
      cfg.bundledCrestIds = manifest.teamIds.map(String);
      cfg.sportteryCrests = sportteryMap;
      fs.writeFileSync(cfgPath, 'window.APP_CONFIG=' + JSON.stringify(cfg) + ';\n');
    }
  } catch (e) { console.warn('config.js crest ids not updated', e.message); }

  const prefixed = packedIds.filter((id) => id.startsWith('jc-')).length;
  console.log(JSON.stringify({
    schedule: schedulePath || null,
    scheduleRows: rows.length,
    scheduleTeams: scheduleTeams.length,
    mapped: Object.keys(sportteryMap).length,
    packed: packedIds.length,
    packedPrefixed: prefixed,
    downloaded: ok,
    skipped: skip,
    failed: fail,
    skippedFlags: skippedFlag.length,
    failures: failed,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
