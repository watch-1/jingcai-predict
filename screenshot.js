// node screenshot.js  -> screenshots/*.png at 390x844 (iPhone-like)
const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const base = 'http://localhost:' + (process.env.PORT || 8088);
  const shot = async n => { await new Promise(r => setTimeout(r, 400)); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('saved', n); };
  await p.goto(base + '/#jz', { waitUntil: 'networkidle0' }); await p.waitForSelector('.card .cell');
  await shot('01-jingzu');
  // select odds on 3 matches -> 串关 bar
  await p.evaluate(() => { const cs = document.querySelectorAll('.card:not(.hot)'); [[0, 0], [1, 4], [2, 0], [2, 1]].forEach(([c, i]) => cs[c].querySelectorAll('.cell')[i].click()); });
  await p.click('.types button[data-type="2"]');
  await p.click('.stepper button[data-m="1"]'); await p.click('.stepper button[data-m="1"]');
  await p.evaluate(() => window.scrollTo(0, 140));
  await shot('02-jingzu-selected');
  await p.click('#btnSave'); await shot('03-save-toast');
  await new Promise(r => setTimeout(r, 1800));
  await p.click('#btnPlans'); await shot('04-my-plans');
  await p.click('#closeM');
  await p.click('[data-tab="bf"]'); await shot('05-bifen-today');
  const chips = await p.$$('.chip'); await chips[0].click(); await shot('06-bifen-past');
  await p.click('[data-tab="kj"]'); await shot('07-kaijiang');
  await p.goto(base + '/#jz', { waitUntil: 'networkidle0' }); await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot('08-footer-disclaimer');
  await b.close();
})();
