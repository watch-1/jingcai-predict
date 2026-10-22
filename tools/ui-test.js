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
    await tap('[data-act="guest"]'); await p.waitForSelector('#top-chrome:not(.hidden)', { timeout: 15000 });
    ok(/#\/home$/.test(p.url()), '游客浏览 -> home');
    const src = await p.evaluate(() => document.querySelector('.src-pill')?.textContent || '');
    console.log('     data source pill:', src);
    ok(await p.$$eval('.tabbar button', l => l.map(x => x.textContent).join()) === '首页,赛程,预测,数据', 'bottom tab bar has 首页/赛程/预测/数据');
    ok(await p.$$eval('.tc-tab', l => l.map(x => x.textContent).join()) === '部落,头条,开奖', 'top chrome has 部落/头条/开奖');
    ok(!!(await p.$('.tc-actions .tc-ic[data-go="#/search"]')), 'top chrome has search icon');
    ok(!(await p.$('.home-search-cap')), 'no sticky home search bar');
    await tap('.tc-ic[data-go="#/search"]'); await p.waitForFunction(() => location.hash === '#/search', { timeout: 5000 });
    ok(!!(await p.$('#gsInput')), 'search page opens with input');
    await p.evaluate(() => { location.hash = '#/home'; }); await sleep(300);
    ok(!(await p.content()).includes('服务器地址'), 'no 服务器地址 setting anywhere');
    ok(!(await p.$('.hdr-title')) || !(await p.evaluate(() => document.querySelector('.hdr-title')?.textContent === '赛程')), 'no centered navy page title on home');
    // register
    await p.evaluate(() => { location.hash = '#/register'; }); await p.waitForSelector('#fReg');
    await p.type('#fReg [name=phone]', phone); await p.type('#fReg [name=password]', pw); await p.type('#fReg [name=password2]', pw); await p.type('#fReg [name=nickname]', 'UI测试');
    await tap('#fReg [type=submit]'); await sleep(400);
    ok((await txt('#err')).includes('同意'), 'registration blocked until agreement checkbox ticked');
    await shot('register');
    await p.$eval('#fReg [name=agree]', e => e.click()); await tap('#fReg [type=submit]');
    await p.waitForFunction(() => location.hash === '#/home', { timeout: 10000 }); registered = true;
    ok(!(await p.$('.me-drawer.open')), 'after register/login home: me drawer stays closed');
    await tap('[data-act="openMe"]'); await p.waitForSelector('.me-drawer.open');
    ok((await txt('.md-name')) === 'UI测试', 'tap avatar opens drawer with nickname');
    await p.evaluate(() => document.getElementById('me-drawer-mask').click());
    ok(!(await p.$('.quick')), 'home has no shortcut icon row');
    ok(!(await p.$('.ha-kb')), 'home attitude header has no 我的知识库 link');
    // home (底部首页)
    await tap('.tabbar [data-go="#/home"]'); await p.waitForSelector('.banner .bn-bg, .banner img'); await p.waitForFunction(() => [...document.querySelectorAll('.banner .bn-bg, .banner > .track img.bn-bg')].every(i => i.complete && i.naturalWidth > 0));
    await tap('.tc-tab[data-go="#/tribe"]'); await p.waitForFunction(() => location.hash === '#/tribe', { timeout: 5000 });
    ok(!!(await p.$('.tc-tab.on[data-go="#/tribe"]')), 'tribe route highlights 部落 top tab');
    ok((await p.$eval('.empty-t', e => e.textContent)).includes('部落'), 'tribe tab shows placeholder, not home feed');
    await tap('.tabbar [data-go="#/home"]'); await sleep(300);
    ok(await p.$$eval('.banner .hero-slide', l => l.length) === 3, 'home banner carousel with 3 slides');
    ok(await p.$$eval('.banner img.bn-bg', l => l.length) === 3, 'home banner carousel with 3 background images');
    await shot('home');
    // schedule
    await tap('.tabbar [data-go="#/schedule"]'); await p.waitForSelector('.dstrip button');
    ok(await p.$$eval('#top-chrome [data-act="schMode"]', l => l.map(b => b.dataset.mode).join(',')) === '关注,未开始,已结束', 'schedule: top chrome 关注/未开始/已结束');
    ok(!!(await p.$('#top-chrome .tc-tab--sch.on[data-mode="未开始"]')), 'schedule: 未开始 highlighted in top chrome');
    ok(!(await p.$('.sch-mode')), 'schedule: no duplicate mode row under date');
    ok(!(await p.$('.sch-channels')), 'schedule: no 热门/关注/全部 channel row');
    ok(!(await p.$('.ls-status')), 'schedule: no legacy status pill row');
    ok(await p.$$eval('.dstrip button', l => l.length) > 0 && await p.$$eval('.chips button', l => l.length) > 0, 'schedule: date strip + league chips');
    await tap('#top-chrome [data-act="schMode"][data-mode="已结束"]'); await sleep(300);
    ok(!!(await p.$('#top-chrome .tc-tab--sch.on[data-mode="已结束"]')), 'schedule: tap 已结束 updates top chrome highlight');
    await tap('#top-chrome [data-act="schMode"][data-mode="未开始"]'); await sleep(200);
    const hasMatch = await p.$('.ls-row[data-go^="#/match/"]');
    await shot('schedule');
    if (!hasMatch) { const d = await p.$$('.dstrip button'); for (const x of d) { await x.click(); await sleep(200); if (await p.$('.ls-row[data-go^="#/match/"]')) break; } }
    // detail
    await tap('.tabbar [data-go="#/home"]'); await sleep(300);
    ok(await p.$$eval('.tc-tab', l => l.map(x => x.textContent).join()) === '部落,头条,开奖', 'home: top chrome restores 部落/头条/开奖');
    await tap('.tabbar [data-go="#/schedule"]'); await sleep(200);
    await tap('.ls-row[data-go^="#/match/"]'); await p.waitForSelector('.hero');
    const heroNav = await p.$eval('.hero-edge-nav', el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, backH: el.querySelector('.hero-ic')?.getBoundingClientRect().height };
    });
    ok(heroNav.top <= 28 && heroNav.backH <= 30, `match detail compact nav (top=${heroNav.top}, back=${heroNav.backH})`);
    const heroLay = await p.$eval('.hero.hero--edge', el => {
      const nav = el.querySelector('.hero-edge-nav');
      const meta = el.querySelector('.meta');
      const teams = el.querySelector('.teams');
      const tabs = document.querySelector('.view.sub.md-wrap .dtabs');
      const nr = nav.getBoundingClientRect();
      const mr = meta.getBoundingClientRect();
      const tr = teams.getBoundingClientRect();
      const hr = el.getBoundingClientRect();
      const tabTop = tabs ? tabs.getBoundingClientRect().top : 0;
      return { navBottom: nr.bottom, metaTop: mr.top, teamsTop: tr.top, heroH: hr.height, tabGap: tabTop - hr.bottom };
    });
    ok(heroLay.metaTop - heroLay.navBottom <= 6, `meta flush under nav (gap=${heroLay.metaTop - heroLay.navBottom})`);
    ok(heroLay.heroH <= 200 && heroLay.tabGap <= 8, `compact hero (h=${heroLay.heroH}, tabGap=${heroLay.tabGap})`);
    await p.waitForSelector('.hero-edge-nav [data-act="fav"]');
    await tap('.hero-edge-nav [data-act="fav"]');
    await p.waitForFunction(() => document.querySelector('.hero-edge-nav [data-act="fav"]')?.textContent.includes('已关注'), { timeout: 8000 });
    ok(true, '关注 button toggled');
    await tap('[data-act="detailTab"][data-tab="intel"]'); await sleep(600);
    const hasOdds = await p.$('.otable button.cell');
    ok(!!hasOdds, 'match detail shows selectable 胜平负/让球 odds');
    await tap('[data-act="detailTab"][data-tab="pred"]');
    await p.waitForFunction(() => document.querySelectorAll('.reason p').length >= 3, { timeout: 15000 });
    ok((await p.$$eval('.reason p', l => l.length)) >= 3, 'match detail has odds-based reasoning');
    await shot('match');
    // save plan
    await tap('[data-act="detailTab"][data-tab="intel"]'); await sleep(400);
    await tap('.otable button.cell'); await p.waitForSelector('#planbar:not(.hidden)');
    await tap('[data-act="openPlan"]'); await p.waitForSelector('.sheet [data-act="savePlan"]');
    await shot('plan-sheet');
    await tap('.sheet [data-act="savePlan"]'); await sleep(600);
    ok((await txt('#toast')).includes('方案已保存并同步'), 'plan saved + synced: ' + await txt('#toast'));
    // predict / results
    await tap('.hero-ic[data-act="back"]'); await p.waitForFunction(() => location.hash === '#/schedule');
    await tap('.tabbar [data-go="#/predict"]'); await p.waitForSelector('.kb-entry'); await shot('predict');
    await tap('.tc-tab[data-go="#/results"]'); await p.waitForSelector('.dstrip button, .empty'); await shot('results');
    // me drawer
    await tap('[data-act="openMe"]'); await p.waitForSelector('.me-drawer.open');
    const stats = await p.$$eval('.md-stats b', l => l.map(x => x.textContent));
    ok(stats[0] === '1' && stats[2] === '1', `drawer: 1 plan, 1 favorite (${stats})`);
    await shot('me-drawer');
    // logout -> relogin -> sync
    await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForSelector('[data-act="logout"]');
    await shot('settings');
    await tap('[data-act="logout"]'); await tap('.dialog .ok'); await p.waitForFunction(() => location.hash === '#/login');
    ok(await p.evaluate(() => !localStorage.getItem('jc_token')), 'logout clears token');
    await tap('[data-act="guest"]'); await p.waitForSelector('[data-act="openMe"]');
    await tap('[data-act="openMe"]'); await p.waitForSelector('.me-drawer.open');
    ok((await p.$$eval('.md-stats b', l => l.map(x => x.textContent))).slice(0, 3).join() === '0,0,0', 'after logout, guest drawer shows no account data');
    await p.evaluate(() => { location.hash = '#/login'; }); await p.waitForSelector('#fLogin');
    await p.$eval('#fLogin [name=phone]', e => (e.value = '')); await p.type('#fLogin [name=phone]', phone); await p.type('#fLogin [name=password]', pw);
    await tap('#fLogin [type=submit]'); await p.waitForFunction(() => location.hash === '#/home', { timeout: 10000 });
    ok(!(await p.$('.me-drawer.open')), 'after relogin: me drawer stays closed');
    await tap('[data-act="openMe"]'); await p.waitForSelector('.me-drawer.open .md-stats b', { timeout: 8000 });
    const s2 = await p.$$eval('.md-stats b', l => l.map(x => x.textContent));
    ok(s2[0] === '1' && s2[2] === '1', `relogin: plan + favorite restored from server (${s2})`);
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
