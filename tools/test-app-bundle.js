// node tools/test-app-bundle.js [API]  — loads the APK web bundle (android/build/assets/www, built by build-apk.sh) in headless
// Chrome under the app origin https://appassets.androidplatform.net/www/ and checks it talks cross-origin (CORS +
// Authorization header) to the fixed API_BASE: live data, register/login/plan/delete. Then checks the PWA on a
// localhost server (service worker needs https or localhost): manifest, SW active, offline shell.
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const WWW = path.join(__dirname, '../android/build/assets/www'); const PWA = process.env.PWA || 'http://localhost:8090';
const MIME = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg' };
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
(async () => {
  const cfg = fs.readFileSync(path.join(WWW, 'config.js'), 'utf8'); console.log('     bundle config.js:', cfg.split('\n')[1]);
  const API = JSON.parse(cfg.match(/APP_CONFIG = (\{.*\})/)[1]).apiBase;
  ok(/^https?:\/\//.test(API) && /"platform":"android"/.test(cfg), 'APK bundle has fixed apiBase ' + API);
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-running-insecure-content', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = new URL(r.url()); if (u.host !== 'appassets.androidplatform.net') return r.continue();
    const f = path.join(WWW, u.pathname.replace(/^\/www\//, ''));
    if (!f.startsWith(WWW) || !fs.existsSync(f)) return r.respond({ status: 404, body: 'nf' });
    r.respond({ status: 200, contentType: MIME[f.split('.').pop()] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://appassets.androidplatform.net/www/index.html', { waitUntil: 'networkidle0' });
  ok(/#\/login$/.test(p.url()), 'app starts on login page');
  await p.$eval('[data-act="guest"]', e => e.click()); await p.waitForSelector('.src-pill'); await new Promise(r => setTimeout(r, 1500));
  const pill = await p.$eval('.src-pill', e => e.textContent); ok(/实时/.test(pill), 'app loads live data cross-origin from ' + API + ': ' + pill);
  const res = await p.evaluate(async api => {
    const phone = '199' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), password = 'Apk' + Date.now().toString(36) + '1';
    const j = (m, u, b, t) => fetch(api + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json() }));
    const reg = await j('POST', '/auth/register', { phone, password, agree: true });
    const plan = await j('POST', '/plans', { id: 'apk1', picks: [{ matchId: '1' }] }, reg.j.token);
    const list = await j('GET', '/plans', null, reg.j.token);
    const del = await j('DELETE', '/me', { password }, reg.j.token);
    return [reg.s, plan.s, list.j.plans.length, del.s];
  }, API);
  ok(res.join() === '201,201,1,200', 'cross-origin auth from app origin (register/plan/list/delete): ' + res);
  ok(!errs.length, 'no page errors ' + errs.join(';'));
  // PWA
  const w = await b.newPage(); await w.setViewport({ width: 390, height: 844, isMobile: true });
  await w.goto(PWA + '/', { waitUntil: 'networkidle0' });
  const sw = await w.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active && r.active.scriptURL; });
  ok(/sw\.js$/.test(sw || ''), 'PWA service worker active: ' + sw);
  const man = await w.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  ok(man.name === '竞彩预测' && man.icons.length === 3 && man.display === 'standalone', 'manifest ok: ' + man.name + ' start_url=' + man.start_url);
  await new Promise(r => setTimeout(r, 1000));
  await w.setOfflineMode(true); await w.reload({ waitUntil: 'domcontentloaded' }); await w.waitForSelector('.auth, .hdr', { timeout: 8000 });
  ok(true, 'offline reload served app shell (' + (await w.title()) + ')');
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
