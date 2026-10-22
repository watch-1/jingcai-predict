// node tools/ui-test.js [BASE]  — headless Chrome end-to-end UI test at 390x844 (+ a 1024-wide check).
// Registers a random test account through the UI, favorites a match, saves a plan, logs out, logs back in and
// verifies server sync, takes screenshots to screenshots/v2-*.png, then deletes the account via 注销账号.
const puppeteer = require('puppeteer-core');
const BASE = (process.argv[2] || process.env.BASE || 'http://127.0.0.1:8088').replace(/\/$/, '');
const SHOTS = process.env.SHOTS !== '0';
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--lang=zh-CN'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const shot = async n => { if (!SHOTS) return; await sleep(500); await p.evaluate(() => document.getElementById('toast').classList.add('hidden')); await p.screenshot({ path: `screenshots/v2-${n}.png` }); console.log('     saved screenshots/v2-' + n + '.png'); };
  const tap = async sel => { await p.waitForSelector(sel, { visible: true, timeout: 10000 }); await p.$eval(sel, e => e.click()); await sleep(250); };
  const txt = sel => p.$eval(sel, e => e.textContent);
  const phone = '199' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'); const pw = 'Ui' + Math.random().toString(36).slice(2, 8) + '7';
  let registered = false;
  try {
    await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
    ok(/#\/login$/.test(p.url()), 'first launch shows login page: ' + p.url());
    await shot('login');
    // guest browsing
    await tap('[data-act="guest"]'); await p.waitForSelector('.hc-item, .empty', { timeout: 15000 });
    ok(/#\/home$/.test(p.url()), '游客浏览 -> home');
    const src = await p.evaluate(() => document.querySelector('.src-pill')?.textContent || '');
    console.log('     data source pill:', src);
    ok(await p.$$eval('.tabbar button', l => l.map(x => x.textContent).join()) === '首页,赛程,预测,开奖,我的', 'bottom tab bar has 首页/赛程/预测/开奖/我的');
    ok(!(await p.content()).includes('服务器地址'), 'no 服务器地址 setting anywhere');
    ok((await txt('.foot')).includes('仅供参考，理性购彩 · 本站不提供投注服务'), 'footer disclaimer present');
    // register
    await p.evaluate(() => { location.hash = '#/register'; }); await p.waitForSelector('#fReg');
    await p.type('#fReg [name=phone]', phone); await p.type('#fReg [name=password]', pw); await p.type('#fReg [name=password2]', pw); await p.type('#fReg [name=nickname]', 'UI测试');
    await tap('#fReg [type=submit]'); await sleep(400);
    ok((await txt('#err')).includes('同意'), 'registration blocked until agreement checkbox ticked');
    await shot('register');
    await p.$eval('#fReg [name=agree]', e => e.click()); await tap('#fReg [type=submit]');
    await p.waitForFunction(() => location.hash === '#/me', { timeout: 10000 }); registered = true;
    ok((await txt('.me-row .nm')) === 'UI测试', 'registered + logged in, 我的 shows nickname');
    // home
    await tap('.tabbar [data-go="#/home"]'); await p.waitForSelector('.banner .bn-bg, .banner img'); await p.waitForFunction(() => [...document.querySelectorAll('.banner .bn-bg, .banner > .track img.bn-bg')].every(i => i.complete && i.naturalWidth > 0));
    ok(await p.$$eval('.banner .hero-slide', l => l.length) === 3, 'home banner carousel with 3 slides');
    ok(await p.$$eval('.banner img.bn-bg', l => l.length) === 3, 'home banner carousel with 3 background images');
    await shot('home');
    // schedule
    await tap('.tabbar [data-go="#/schedule"]'); await p.waitForSelector('.dstrip button');
    ok(await p.$$eval('.dstrip button', l => l.length) > 0 && await p.$$eval('.chips button', l => l.length) > 0, 'schedule: date strip + league chips');
    const hasMatch = await p.$('.mc .cell:not(.dis)');
    await shot('schedule');
    if (!hasMatch) { const d = await p.$$('.dstrip button'); for (const x of d) { await x.click(); await sleep(200); if (await p.$('.mc .cell:not(.dis)')) break; } }
    // detail
    await tap('.mc[data-go^="#/match/"] .mc-teams'); await p.waitForSelector('.hero');
    const hasOdds = await p.$('.otable button.cell');
    ok(!!hasOdds, 'match detail shows selectable 胜平负/让球 odds');
    ok((await p.$$eval('.reason p', l => l.length)) >= 3, 'match detail has odds-based reasoning');
    await tap('[data-act="fav"]'); await sleep(500);
    ok((await txt('[data-act="fav"]')).includes('已关注'), '关注 button toggled');
    await shot('match');
    // save plan
    await tap('.otable button.cell'); await p.waitForSelector('#planbar:not(.hidden)');
    await tap('[data-act="openPlan"]'); await p.waitForSelector('.sheet [data-act="savePlan"]');
    await shot('plan-sheet');
    await tap('.sheet [data-act="savePlan"]'); await sleep(600);
    ok((await txt('#toast')).includes('方案已保存并同步'), 'plan saved + synced: ' + await txt('#toast'));
    // predict / results
    await tap('.hdr [data-act="back"]'); await p.waitForFunction(() => location.hash === '#/schedule');
    await tap('.tabbar [data-go="#/predict"]'); await p.waitForSelector('.psum'); await shot('predict');
    await tap('.tabbar [data-go="#/results"]'); await p.waitForSelector('.dstrip button, .empty'); await shot('results');
    // me
    await tap('.tabbar [data-go="#/me"]'); await p.waitForSelector('.me-stats');
    const stats = await p.$$eval('.me-stats b', l => l.map(x => x.textContent));
    ok(stats[0] === '1' && stats[1] === '1', `我的: 1 plan, 1 favorite (${stats})`);
    await shot('me');
    // logout -> relogin -> sync
    await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('[data-act="logout"]');
    await shot('settings');
    await tap('[data-act="logout"]'); await tap('.dialog .ok'); await p.waitForFunction(() => location.hash === '#/login');
    ok(await p.evaluate(() => !localStorage.getItem('jc_token')), 'logout clears token');
    await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForSelector('.me-stats');
    ok((await p.$$eval('.me-stats b', l => l.map(x => x.textContent))).slice(0, 2).join() === '0,0', 'after logout, guest view shows no account data');
    await p.evaluate(() => { location.hash = '#/login'; }); await p.waitForSelector('#fLogin');
    await p.$eval('#fLogin [name=phone]', e => (e.value = '')); await p.type('#fLogin [name=phone]', phone); await p.type('#fLogin [name=password]', pw);
    await tap('#fLogin [type=submit]'); await p.waitForFunction(() => location.hash === '#/me', { timeout: 10000 });
    await sleep(300);
    const s2 = await p.$$eval('.me-stats b', l => l.map(x => x.textContent));
    ok(s2[0] === '1' && s2[1] === '1', `relogin: plan + favorite restored from server (${s2})`);
    await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForSelector('.plan'); await shot('plans');
    // wide layout check (Android emulator ~1024 wide)
    await p.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.evaluate(() => { location.hash = '#/home'; }); await sleep(800);
    const w = await p.$eval('#app', e => { const r = e.getBoundingClientRect(); return { width: r.width, left: r.left }; }); ok(w.width <= 720 && Math.abs(w.left - (1024 - w.width) / 2) < 2, `1024-wide: centered max-width layout (${w.width}px @ x=${w.left})`);
    if (SHOTS) await p.screenshot({ path: 'screenshots/v2-home-1024.png' });
    await p.evaluate(() => { location.hash = '#/schedule'; }); await sleep(500); if (SHOTS) await p.screenshot({ path: 'screenshots/v2-schedule-1024.png' });
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // delete account through UI
    await p.evaluate(() => { location.hash = '#/delete'; }); await p.waitForSelector('#fDel');
    await p.type('#fDel [name=pw]', pw); await p.$eval('#fDel [name=ok]', e => e.click()); await tap('#fDel [type=submit]'); await tap('.dialog .ok');
    await p.waitForFunction(() => location.hash === '#/login', { timeout: 10000 }); registered = false;
    const r = await p.evaluate(async (ph, pw) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: ph, password: pw }) })).status, phone, pw);
    ok(r === 401, '注销账号 via UI: account deleted, login now 401');
    ok(!errs.length, 'no page errors ' + errs.join(' | '));
  } catch (e) { ok(false, 'exception: ' + e.message); await p.screenshot({ path: '/tmp/ui-fail.png' }); }
  finally {
    if (registered) { // cleanup via API
      const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password: pw }) }).then(r => r.json()).catch(() => null);
      if (r?.token) await fetch(BASE + '/api/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + r.token }, body: JSON.stringify({ password: pw }) });
      console.log('cleanup: test account', phone, r?.token ? 'deleted' : 'not found');
    }
    await b.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
