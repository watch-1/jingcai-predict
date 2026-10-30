'use strict';

const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const ROOT = path.join(DATA_DIR, 'news-covers');
const PUBLIC_ASSETS = path.join(__dirname, '..', 'public', 'news-covers', 'assets');
const FILES_DIR = PUBLIC_ASSETS;
const MANIFEST = path.join(ROOT, 'manifest.json');
const ACTIVE_FILE = path.join(ROOT, 'active-rotation.json');

function ensureDirs() {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { items: [] };
  }
}

function scanDiskPairs() {
  ensureDirs();
  const bySlug = new Map();
  const walk = (dir, relBase) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else if (/\.(webp|png|jpe?g)$/i.test(ent.name)) {
        const m = /^(.+)-([abAB])\.(webp|png|jpe?g)$/i.exec(ent.name);
        if (!m) continue;
        const slug = rel.replace(/\/[^/]+$/, '').replace(/\//g, '-') + '-' + m[1];
        const variant = m[2].toUpperCase();
        const urlPath = '/news-covers/assets/' + rel.replace(/\\/g, '/');
        let row = bySlug.get(slug);
        if (!row) {
          row = { slug, league: rel.split('/')[0] || '', variants: {}, source: 'disk' };
          bySlug.set(slug, row);
        }
        row.variants[variant] = urlPath;
      }
    }
  };
  walk(FILES_DIR, '');
  return [...bySlug.values()];
}

function dbStatusBySlug() {
  const rows = db.prepare('SELECT * FROM news_cover_assets').all();
  const map = new Map();
  for (const r of rows) map.set(r.slug, r);
  return map;
}

function mergeCatalog() {
  const manifest = readManifest();
  const disk = scanDiskPairs();
  const dbMap = dbStatusBySlug();
  const slugSet = new Set();
  const items = [];

  for (const it of manifest.items || []) {
    if (!it || !it.slug) continue;
    slugSet.add(it.slug);
    const dbRow = dbMap.get(it.slug);
    items.push({
      slug: it.slug,
      league: it.league || '',
      title: it.title || it.slug,
      variants: { ...(it.variants || {}), ...(disk.find((d) => d.slug === it.slug)?.variants || {}) },
      status: dbRow ? dbRow.status : (it.status || 'pending'),
      lockedAt: dbRow ? dbRow.locked_at : null,
      note: dbRow ? dbRow.note : (it.note || ''),
      id: dbRow ? dbRow.id : null,
    });
  }
  for (const d of disk) {
    if (slugSet.has(d.slug)) continue;
    const dbRow = dbMap.get(d.slug);
    items.push({
      slug: d.slug,
      league: d.league,
      title: d.slug,
      variants: d.variants,
      status: dbRow ? dbRow.status : 'pending',
      lockedAt: dbRow ? dbRow.locked_at : null,
      note: dbRow ? dbRow.note : '',
      id: dbRow ? dbRow.id : null,
    });
  }
  return items.sort((a, b) => a.slug.localeCompare(b.slug));
}

function setStatus(slug, status, { variant, note } = {}) {
  const now = Date.now();
  const st = ['pending', 'approved', 'rejected', 'hidden'].includes(status) ? status : 'pending';
  const row = db.prepare('SELECT * FROM news_cover_assets WHERE slug = ?').get(slug);
  let filePath = '';
  const cat = mergeCatalog().find((x) => x.slug === slug);
  if (cat && variant && cat.variants[variant]) filePath = cat.variants[variant];
  else if (cat) {
    filePath = cat.variants.A || cat.variants.B || Object.values(cat.variants)[0] || '';
  }
  if (row) {
    db.prepare(
      `UPDATE news_cover_assets SET status=?, variant=COALESCE(?, variant), file_path=COALESCE(?, file_path),
       note=COALESCE(?, note), updated_at=?, locked_at=? WHERE slug=?`
    ).run(st, variant || row.variant, filePath || row.file_path, note != null ? String(note) : row.note, now, st === 'approved' ? now : row.locked_at, slug);
  } else {
    db.prepare(
      `INSERT INTO news_cover_assets (slug, league, variant, file_path, status, locked_at, note, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(slug, (cat && cat.league) || '', variant || 'A', filePath, st, st === 'approved' ? now : null, note != null ? String(note) : '', now, now);
  }
  if (st === 'approved' && filePath) {
    try {
      ensureDirs();
      const active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
      active[slug] = { filePath, variant: variant || 'A', at: now };
      fs.writeFileSync(ACTIVE_FILE, JSON.stringify(active, null, 2));
    } catch {
      fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ [slug]: { filePath, variant: variant || 'A', at: now } }, null, 2));
    }
  }
  return db.prepare('SELECT * FROM news_cover_assets WHERE slug = ?').get(slug);
}

module.exports = {
  ROOT,
  FILES_DIR,
  mergeCatalog,
  setStatus,
  ensureDirs,
};
