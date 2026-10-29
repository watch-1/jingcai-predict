// 竞彩预测 service worker: offline app shell + last-known public match/data APIs. Account APIs are never cached.
const VER = 'jc-v1.9.242';
const CREST_CACHE = 'jc-crests-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './config.js', './data-center-boot-slices.js', './sample-data.js', './manifest.json',
  './data-center-boot.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/yun-duo.png',
  './banners/banner-hot.jpg', './banners/banner-predict.jpg', './banners/banner-results.jpg',
  './banners/slide-hot-match.jpg', './banners/slide-news.jpg', './banners/slide-contra.jpg',
  './banners/hero-data-luxury.jpg', './banners/hero-pitch-night.jpg'];
const DC_API = /^\/api\/(standings|topscorers|topassists|club-values|player-values|topkeepers)(\?|$)/;
const LOGO_API = /^\/api\/logo(\?|$)/;
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  // 1.9.201: keep durable crest cache across version bumps (logos are stable)
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== CREST_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function staleWhileRevalidate(cache, req, fetchReq) {
  return caches.open(cache).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(fetchReq || req).then((r) => {
      if (r && r.ok) { const cp = r.clone(); c.put(req, cp); }
      return r;
    }).catch(() => null);
    if (hit) {
      net.catch(() => {});
      return hit;
    }
    const live = await net;
    if (live) return live;
    return Response.error();
  });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/api/')) {
    if (LOGO_API.test(url.pathname)) {
      const key = new Request(url.origin + url.pathname + url.search);
      e.respondWith(staleWhileRevalidate(CREST_CACHE, key, req));
      return;
    }
    if (DC_API.test(url.pathname)) {
      const key = new Request(url.origin + url.pathname + url.search);
      e.respondWith(staleWhileRevalidate(VER, key, req));
      return;
    }
    if (!/\/api\/(matches|results)$/.test(url.pathname)) return; // auth/user data: network only
    const key = new Request(url.origin + url.pathname);
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(key, cp)); } return r; })
      .catch(() => caches.match(key).then(r => r || Response.error())));
    return;
  }
  // app shell
  // 1.9.5: network-first (stale-while-revalidate kept serving old app.js after releases)
  e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
