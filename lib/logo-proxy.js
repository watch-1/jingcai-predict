/**
 * Player / crest images in server HTML go through /api/logo.
 * APK WebView loads the app from https://appassets.androidplatform.net/www
 * (older builds used file://). A root-relative /api/logo never hits the API
 * host, so headshots must be absolute when a public origin is known.
 * SportMonks placeholder.png, ESPN/API-Football "NO PHOTO" cards, and other
 * gray silhouettes are not headshots. A real Transfermarkt / squad-cache
 * photo is used when the primary URL is missing or is one of those cards.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SM_HOSTS = new Set(['cdn.sportmonks.com', 'media.sportmonks.com']);
const NO_PHOTO_MD5 = new Set([
  '430d67fd79ad0a355b212d5780886e34', // API-Football generic "NO PHOTO" 5192-byte PNG
  'd5efe76078cdf3376cad632cc09b4655', // SportMonks placeholder.png
  '6dfa6e8487f1b52199771d886d5422d4', // ESPN i/headshots/nophoto.png
]);

function envApiBase() {
  const keys = ['PUBLIC_API_BASE', 'API_PUBLIC_BASE', 'APP_API_BASE'];
  for (const k of keys) {
    const s = String(process.env[k] || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(s)) return s;
  }
  return '';
}

function originFromRequest(req) {
  const fromEnv = envApiBase();
  if (fromEnv) return fromEnv;
  if (!req || typeof req.get !== 'function') return '';
  const host = String(req.get('host') || '').trim();
  if (!/^[\w.-]+(?::\d+)?$/.test(host)) return '';
  const proto = req.protocol === 'https' ? 'https' : 'http';
  return proto + '://' + host;
}

function decodeUrl(url) {
  let s = String(url || '');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(s)) break;
    try {
      const next = decodeURIComponent(s);
      if (next === s) break;
      s = next;
    } catch { break; }
  }
  return s;
}

/** Gray "NO PHOTO" / silhouette cards, not a player's face. */
function isPlaceholderPhoto(url) {
  const s = decodeUrl(url);
  return /placeholder\.(?:png|jpe?g|webp)|team_placeholder|player_placeholder|(?:^|[/?=&_.-])no[-_ ]?photo(?:[-_ ]?yet)?(?:[./?#_=]|$)|\/football\/players\/0\.(?:png|jpe?g|webp)/i.test(s);
}

function withBase(path, base) {
  const origin = String(base == null ? envApiBase() : base).replace(/\/+$/, '');
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!origin || !/^https?:\/\//i.test(origin)) return path;
  return origin + (path.startsWith('/') ? path : '/' + path);
}

function upgradeHttps(u) {
  if (u.protocol === 'http:') u.protocol = 'https:';
  return u;
}

/** Hosts /api/logo will actually fetch for a person (not a team crest). */
function isAllowedPlayerPhoto(u) {
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) return false;
  const host = u.hostname.toLowerCase();
  const p = u.pathname;
  if (SM_HOSTS.has(host)) return p.startsWith('/images/') && /\.(png|jpe?g|webp)$/i.test(p);
  if (host === 'img.a.transfermarkt.technology') return /^\/portrait\/(header|big|medium)\/\d+\.jpg$/i.test(p);
  if (host === 'r2.thesportsdb.com') {
    return p.startsWith('/images/media/player/cutout/')
      || p.startsWith('/images/media/player/thumb/')
      || p.startsWith('/images/media/player/render/');
  }
  if (host === 'media.api-sports.io') return /^\/football\/players\/\d+\.(png|jpe?g|webp)$/i.test(p);
  if (/^(?:a\d*\.)?espncdn\.com$|^secure\.espncdn\.com$|^media\.espn\.com$/.test(host)) {
    return p.startsWith('/i/headshots/') && /\.(png|jpe?g|webp)$/i.test(p);
  }
  return false;
}

function parsePhotoUrl(src) {
  let s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s;
  let u;
  try { u = new URL(s); } catch { return null; }
  return upgradeHttps(u);
}

/** Headshot → proxied logo URL. Placeholder and non-allowlisted URLs → ''. */
function smPhotoProxy(src, base) {
  const s = String(src || '').trim();
  if (!s || isPlaceholderPhoto(s)) return '';
  if (s.startsWith('/api/logo?url=')) {
    const q = s.slice('/api/logo?url='.length).split('&')[0];
    if (isPlaceholderPhoto(q)) return '';
    return withBase(s, base);
  }
  if (/^https?:\/\/[^/]+\/api\/logo\?url=/i.test(s)) {
    return isPlaceholderPhoto(s) ? '' : s;
  }
  const u = parsePhotoUrl(s);
  if (!u || !isAllowedPlayerPhoto(u)) return '';
  if (isPlaceholderPhoto(u.pathname) || isPlaceholderPhoto(u.toString())) return '';
  return withBase('/api/logo?url=' + encodeURIComponent(u.toString()), base);
}

function foldName(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tmPortraitForName(name) {
  const n = String(name || '').trim();
  if (!/[A-Za-z]/.test(n)) return '';
  let hit;
  try { hit = require('./market-value').lookupPlayer(n, {}); } catch { return ''; }
  if (!hit || !hit.ok || hit.tmId == null || String(hit.tmId) === '') return '';
  const id = String(hit.tmId).replace(/\D/g, '');
  if (!id) return '';
  const want = foldName(n).split(' ').filter(Boolean);
  const got = foldName(hit.name || hit.player || '').split(' ').filter(Boolean);
  if (!want.length || !got.length || want.join(' ') !== got.join(' ')) {
    const abbr = want.length >= 2 && got.length >= 2
      && want.slice(1).join(' ') === got.slice(1).join(' ')
      && (want[0].length === 1 || got[0].length === 1)
      && want[0][0] === got[0][0];
    if (!abbr) return '';
  }
  return 'https://img.a.transfermarkt.technology/portrait/header/' + id + '.jpg';
}

let _squadPhotos = null;
function squadPhotoMap() {
  if (_squadPhotos) return _squadPhotos;
  const map = new Map();
  _squadPhotos = map;
  let dir;
  try {
    const base = process.env.DATA_DIR || require('./db').DATA_DIR;
    dir = path.join(base, 'squads');
  } catch { return map; }
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return map; }
  for (const file of names) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch { continue; }
    for (const p of (j && j.players) || []) {
      const photo = p && p.photo;
      if (!photo || isPlaceholderPhoto(photo)) continue;
      for (const raw of [p.name, p.nameAlt]) {
        const key = foldName(raw);
        if (key && !map.has(key)) map.set(key, String(photo));
      }
    }
  }
  return map;
}

/** Transfermarkt portrait, else a squad-cache photo. Empty when nothing usable. */
function fallbackPhotoUrl(name) {
  const tm = tmPortraitForName(name);
  if (tm && !isPlaceholderPhoto(tm)) return tm;
  const key = foldName(name);
  if (!key) return '';
  const cached = squadPhotoMap().get(key) || '';
  if (!cached || isPlaceholderPhoto(cached)) return '';
  return cached;
}

/**
 * Primary headshot plus a second URL the client can try when the first
 * response is a gray "NO PHOTO" card (the proxy answers 404 for those bytes).
 */
function headshotSources(image, name, base) {
  const directRaw = image && !isPlaceholderPhoto(image) ? String(image).trim() : '';
  const altRaw = fallbackPhotoUrl(name);
  const direct = directRaw ? smPhotoProxy(directRaw, base) : '';
  let alt = altRaw ? smPhotoProxy(altRaw, base) : '';
  if (!alt || alt === direct) alt = '';
  if (!direct && alt) return { src: alt, alt: '' };
  return { src: direct || '', alt };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** True when the bytes are a known or near-gray "no photo" card. Team crests are left alone. */
function isNoPhotoBuffer(buf, url) {
  if (!buf || buf.length < 32 || buf.length > 120000) return false;
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return false;
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  if (NO_PHOTO_MD5.has(md5)) return true;
  if (url) {
    const u = parsePhotoUrl(url);
    if (!u || !isAllowedPlayerPhoto(u)) return false;
  }
  let o = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o); o += 4;
    const type = buf.toString('ascii', o, o + 4); o += 4;
    if (o + len + 4 > buf.length) return false;
    const data = buf.subarray(o, o + len);
    o += len + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (!width || !height || width > 1200 || height > 1200) return false;
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return false;
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return false; }
  if (raw.length < height * (stride + 1)) return false;
  const rows = [];
  let p = 0;
  let gray = 0;
  let seen = 0;
  const colors = new Set();
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = Buffer.alloc(stride);
    const prev = y ? rows[y - 1] : null;
    for (let i = 0; i < stride; i++) {
      const x = raw[p++];
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = x;
      if (filter === 1) v = (x + a) & 255;
      else if (filter === 2) v = (x + b) & 255;
      else if (filter === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) v = (x + paeth(a, b, c)) & 255;
      else if (filter !== 0) return false;
      row[i] = v;
    }
    rows.push(row);
    for (let x = 0; x < width; x += 2) {
      const i = x * bpp;
      const r = row[i];
      const g = row[i + 1];
      const b = row[i + 2];
      const al = bpp === 4 ? row[i + 3] : 255;
      if (al < 24) continue;
      seen++;
      if (Math.max(r, g, b) - Math.min(r, g, b) <= 22) gray++;
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
    }
  }
  if (seen < 400) return false;
  return gray / seen >= 0.92 && colors.size <= 24;
}

/** Drop placeholder portraits and prefix leftover /api/logo with origin. */
function rewriteLogoHtml(html, base) {
  let h = String(html || '');
  if (!h) return h;
  if (/placeholder\.|no[-_ ]?photo|\/api\/logo\?/i.test(h)) {
    h = h.replace(/<(img|image)\b[^>]*>/gi, (tag) => {
      const m = tag.match(/\s(?:src|href|xlink:href)\s*=\s*(["'])([^"']+)\1/i);
      if (m && isPlaceholderPhoto(m[2])) return '';
      return tag;
    });
  }
  const origin = String(base == null ? envApiBase() : base).replace(/\/+$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return h;
  return h.replace(/(\s(?:src|href|xlink:href|data-alt)\s*=\s*["'])(\/api\/logo\?)/gi, (_, attr, path) => attr + origin + path);
}

function rewriteFields(obj, req, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const base = originFromRequest(req);
  for (const k of keys) {
    if (typeof obj[k] === 'string' && obj[k]) obj[k] = rewriteLogoHtml(obj[k], base);
  }
  return obj;
}

module.exports = {
  envApiBase,
  originFromRequest,
  isPlaceholderPhoto,
  isAllowedPlayerPhoto,
  isNoPhotoBuffer,
  smPhotoProxy,
  fallbackPhotoUrl,
  headshotSources,
  rewriteLogoHtml,
  rewriteFields,
};
