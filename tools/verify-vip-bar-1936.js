// Verify membership CTA footer: fixed to viewport + Theme B dark (no white wash)
const puppeteer = require('puppeteer-core');
const BASE = (process.argv[2] || 'http://127.0.0.1:8091').replace(/\/$/, '');
const fs = require('fs');
fs.mkdirSync('/workspace/tiicai-site/screenshots', { recursive: true });

(async () => {
  const phone = '198' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'Vb' + Math.random().toString(36).slice(2, 8) + '9';
  const reg = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password: pw, nickname: 'VIP验', agree: true })
  }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  if (!reg.body.token) { console.error('register failed', reg); process.exit(1); }
  const token = reg.body.token;
  const user = reg.body.user;

  const b = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--lang=zh-CN', '--window-size=390,844']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((t, u) => {
    localStorage.setItem('jc_token', JSON.stringify(t));
    localStorage.setItem('jc_user', JSON.stringify(u));
    localStorage.setItem('jc_guest', JSON.stringify(false));
    localStorage.setItem('jc_home_theme', JSON.stringify('pitch'));
  }, token, user);

  await p.goto(BASE + '/#/membership', { waitUntil: 'networkidle2', timeout: 60000 });
  await p.waitForSelector('.vip-bar', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));

  const before = await p.evaluate(() => {
    const bar = document.querySelector('.vip-bar');
    const view = document.querySelector('#view');
    const st = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    return {
      position: st.position,
      bgImage: st.backgroundImage.slice(0, 200),
      bgColor: st.backgroundColor,
      top: r.top, bottom: r.bottom, height: r.height,
      viewH: window.innerHeight,
      hasVip: view && view.classList.contains('has-vip'),
      theme: document.documentElement.getAttribute('data-theme'),
      btnText: (bar.querySelector('button') || {}).textContent || ''
    };
  });
  console.log('before scroll', JSON.stringify(before, null, 2));

  await p.evaluate(() => window.scrollTo(0, Math.max(0, document.body.scrollHeight)));
  await new Promise(r => setTimeout(r, 400));
  const after = await p.evaluate(() => {
    const bar = document.querySelector('.vip-bar');
    const r = bar.getBoundingClientRect();
    const st = getComputedStyle(bar);
    const bgStr = (st.backgroundImage + ' ' + st.backgroundColor).toLowerCase();
    return {
      top: r.top, bottom: r.bottom, position: st.position,
      scrollY: window.scrollY,
      bgStr: bgStr.slice(0, 220),
      whiteWash: /#eef1f6|238,\s*241,\s*246/.test(bgStr),
      nearViewportBottom: Math.abs(r.bottom - window.innerHeight) < 3
    };
  });
  console.log('after scroll', JSON.stringify(after, null, 2));

  await p.screenshot({ path: '/workspace/tiicai-site/screenshots/v1936-membership-pitch.png' });

  let fails = 0;
  const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
  ok(before.position === 'fixed', 'vip-bar position:fixed (got ' + before.position + ')');
  ok(before.hasVip, 'view.has-vip present');
  ok(before.theme === 'pitch', 'theme pitch');
  ok(/立即开通|续费会员/.test(before.btnText), 'CTA label: ' + before.btnText.trim());
  ok(after.nearViewportBottom, 'bar pinned to viewport bottom after scroll');
  ok(Math.abs(after.top - before.top) < 2, 'bar top unchanged after scroll (' + before.top.toFixed(1) + ' -> ' + after.top.toFixed(1) + ')');
  ok(!after.whiteWash, 'no #eef1f6 white-wash on pitch vip-bar');
  ok(/070b14|7,\s*11,\s*20/.test(after.bgStr), 'dark footer bg on pitch: ' + after.bgStr.slice(0, 120));

  // best-effort cleanup
  await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } }).catch(() => {});
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
