'use strict';

/**
 * Prefetch lineup player portraits into the /api/logo disk cache so the
 * 阵容 tab does not fetch them one-by-one on first open.
 *
 * Limits are conservative: unique URLs only, starters first, skip files
 * already on disk, one fetch at a time, pause only after a network get,
 * cap uncached fetches per tick, refuse to overlap a run already in flight.
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

function photoUrlOf(p) {
  if (!p || typeof p !== 'object') return '';
  return String(p.photo || p.image || '').trim();
}

function pushUnique(out, seen, url) {
  const u = String(url || '').trim();
  if (!u || seen.has(u)) return;
  seen.add(u);
  out.push(u);
}

function collectPhotoUrls(pack, opts) {
  const startersOnly = !!(opts && opts.startersOnly);
  const sides = pack ? [pack.home, pack.away, pack.prevHome, pack.prevAway] : [];
  const starterUrls = [];
  const benchUrls = [];
  for (const side of sides) {
    if (!side) continue;
    for (const p of side.starters || []) {
      const u = photoUrlOf(p);
      if (u) starterUrls.push(u);
    }
    if (!startersOnly) {
      for (const p of side.bench || []) {
        const u = photoUrlOf(p);
        if (u) benchUrls.push(u);
      }
    }
  }
  const seen = new Set();
  const out = [];
  for (const u of starterUrls.concat(benchUrls)) pushUnique(out, seen, u);
  return out;
}

function kickoffMs(m) {
  if (!m || !m.date) return NaN;
  return Date.parse(`${m.date}T${String(m.time || '00:00').slice(0, 5)}:00+08:00`);
}

function inWarmWindow(m, now, withinHours) {
  const ko = kickoffMs(m);
  if (!Number.isFinite(ko)) return false;
  const withinH = withinHours != null ? withinHours : 36;
  return ko >= now - 2 * 3600e3 && ko <= now + withinH * 3600e3;
}

function collectFromMatches(list, opts) {
  const now = (opts && opts.now) || Date.now();
  const withinH = opts && opts.withinHours != null ? opts.withinHours : 36;
  const read = opts && opts.readMatchCache;
  const seen = new Set();
  const out = [];
  const matches = [];
  for (const m of list || []) {
    if (!m || !m.id) continue;
    if (!inWarmWindow(m, now, withinH)) continue;
    matches.push(m);
  }
  matches.sort((a, b) => kickoffMs(a) - kickoffMs(b));
  for (const m of matches) {
    const cached = read ? read(String(m.id)) : null;
    const pack = cached && (cached.v || cached);
    for (const u of collectPhotoUrls(pack, opts)) pushUnique(out, seen, u);
    let surface = opts && opts.readSurfaceCache ? opts.readSurfaceCache(String(m.id)) : null;
    if (surface === undefined) surface = null;
    if (!surface) {
      try {
        const { DATA_DIR } = require('./db');
        const f = path.join(DATA_DIR, 'sm-surface', String(m.id) + '.json');
        surface = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch { surface = null; }
    }
    for (const u of collectSmSurfaceUrls(surface, opts)) pushUnique(out, seen, u);
  }
  return out;
}

/** SportMonks surface / squad portraits already fetched for this official match. */
function collectSmSurfaceUrls(pack, opts) {
  const startersOnly = !!(opts && opts.startersOnly);
  const seen = new Set();
  const out = [];
  if (!pack) return out;
  for (const bag of [pack.players, pack.livePlayers]) {
    if (!bag) continue;
    for (const side of ['home', 'away']) {
      const rows = bag[side] || [];
      const use = startersOnly ? rows.slice(0, 18) : rows;
      for (const p of use) {
        const u = String((p && p.image) || '').trim();
        if (!u || /placeholder\.png/i.test(u)) continue;
        pushUnique(out, seen, u);
      }
    }
  }
  return out;
}

let running = false;

function logoFile(logoDir, target) {
  const hash = crypto.createHash('sha256').update(target).digest('hex');
  return path.join(logoDir, hash);
}

async function warmUrls(urls, opts) {
  if (running) return { skippedRun: true, n: 0, ok: 0, fetched: 0, fail: 0, cached: 0 };
  running = true;
  const limit = opts && opts.limit != null ? Number(opts.limit) : 40;
  const gapMs = opts && opts.gapMs != null ? Number(opts.gapMs) : 400;
  const logoDir = opts && opts.logoDir;
  const safeLogoTarget = opts && opts.safeLogoTarget;
  const readCachedLogo = opts && opts.readCachedLogo;
  const fetchLogo = opts && opts.fetchLogo;
  const writeFile = (opts && opts.writeFile) || (async (file, buf) => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
  });
  try {
    const seen = new Set();
    const targets = [];
    for (const raw of urls || []) {
      const target = safeLogoTarget ? safeLogoTarget(raw) : String(raw || '').trim();
      if (!target || seen.has(target)) continue;
      seen.add(target);
      targets.push(target);
    }
    let ok = 0;
    let fetched = 0;
    let fail = 0;
    let cached = 0;
    let considered = 0;
    for (const target of targets) {
      considered += 1;
      const file = logoDir ? logoFile(logoDir, target) : '';
      let hit = null;
      if (readCachedLogo && file) {
        try { hit = await readCachedLogo(file); } catch (_) { hit = null; }
      }
      if (hit) {
        ok += 1;
        cached += 1;
        continue;
      }
      if (fetched + fail >= limit) break;
      let got = null;
      try { got = fetchLogo ? await fetchLogo(target) : null; } catch (_) { got = null; }
      if (!got || !got.buf) {
        fail += 1;
        if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
        continue;
      }
      try {
        if (file) await writeFile(file, got.buf);
        ok += 1;
        fetched += 1;
      } catch (_) {
        fail += 1;
      }
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    }
    return { n: considered, ok, fetched, fail, cached, queued: targets.length, limited: limit };
  } finally {
    running = false;
  }
}

/** For tests only. */
function _resetRunning() { running = false; }

module.exports = {
  photoUrlOf,
  collectPhotoUrls,
  collectSmSurfaceUrls,
  collectFromMatches,
  inWarmWindow,
  warmUrls,
  _resetRunning,
};
