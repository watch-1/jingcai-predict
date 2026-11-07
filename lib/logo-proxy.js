/**
 * Player / crest images in server HTML go through /api/logo.
 * APK WebView loads the app from file:///android_asset/www, so a root-relative
 * /api/logo resolves to file:///api/logo and the photo never loads.
 * Prefer an absolute public origin (env, else the request host). The client
 * also rewrites any leftover relative /api/logo when it inserts the HTML.
 * SportMonks placeholder.png is a generic silhouette, not a headshot.
 */
'use strict';

const SM_HOSTS = new Set(['cdn.sportmonks.com', 'media.sportmonks.com']);

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

function isPlaceholderPhoto(url) {
  let s = String(url || '');
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  return /(?:^|\/)placeholder\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(s);
}

function withBase(path, base) {
  const origin = String(base == null ? envApiBase() : base).replace(/\/+$/, '');
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (!origin || !/^https?:\/\//i.test(origin)) return path;
  return origin + (path.startsWith('/') ? path : '/' + path);
}

/** SM headshot → proxied logo URL. Placeholder and non-allowlisted URLs → ''. */
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
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  const host = u.hostname.toLowerCase();
  if (!SM_HOSTS.has(host)) return '';
  if (!u.pathname.startsWith('/images/') || !/\.(png|jpe?g|webp)$/i.test(u.pathname)) return '';
  if (isPlaceholderPhoto(u.pathname)) return '';
  return withBase('/api/logo?url=' + encodeURIComponent(u.toString()), base);
}

/** Drop placeholder portraits and prefix leftover /api/logo with origin. */
function rewriteLogoHtml(html, base) {
  let h = String(html || '');
  if (!h) return h;
  if (/placeholder\.(?:png|jpe?g|webp)|\/api\/logo\?/i.test(h)) {
    h = h.replace(/<(img|image)\b[^>]*>/gi, (tag) => {
      const m = tag.match(/\s(?:src|href|xlink:href)\s*=\s*(["'])([^"']+)\1/i);
      if (m && isPlaceholderPhoto(m[2])) return '';
      return tag;
    });
  }
  const origin = String(base == null ? envApiBase() : base).replace(/\/+$/, '');
  if (!origin || !/^https?:\/\//i.test(origin)) return h;
  return h.replace(/(\s(?:src|href|xlink:href)\s*=\s*["'])(\/api\/logo\?)/gi, (_, attr, path) => attr + origin + path);
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
  smPhotoProxy,
  rewriteLogoHtml,
  rewriteFields,
};
