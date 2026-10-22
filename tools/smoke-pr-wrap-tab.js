#!/usr/bin/env node
/** Smoke: predict platform list keeps #view.pr-wrap after bottom-tab round-trip. */
const puppeteer = require('puppeteer-core');

const URL = process.env.SMOKE_URL || 'http://127.0.0.1:8088/';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';

async function viewHasPrWrap(page) {
  return page.evaluate(() => {
    const v = document.getElementById('view');
    return !!(v && v.classList.contains('pr-wrap'));
  });
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(URL + '#/home', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#view', { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-ready') === '1', { timeout: 45000 });

  async function tabGo(hash) {
    await page.evaluate((h) => {
      const b = document.querySelector(`#tabbar button[data-go="${h}"]`);
      if (b) b.click();
      else location.hash = h;
    }, hash);
    await page.waitForFunction((h) => location.hash === h, { timeout: 15000 }, hash);
    await new Promise((r) => setTimeout(r, 120));
  }

  await tabGo('#/predict');
  await page.waitForSelector('[data-act="prLane"][data-lane="platform"]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-act="prLane"][data-lane="platform"]').click());
  await page.waitForSelector('#prBody', { timeout: 20000 });
  if (!(await viewHasPrWrap(page))) throw new Error('missing pr-wrap after entering platform list');

  for (let i = 0; i < 3; i++) {
    await tabGo('#/home');
    await tabGo('#/predict');
    await page.waitForFunction(() => location.hash === '#/predict', { timeout: 10000 });
    await page.waitForSelector('#prBody', { timeout: 20000 });
    if (!(await viewHasPrWrap(page))) {
      throw new Error('missing pr-wrap after tab round-trip #' + (i + 1));
    }
  }

  console.log('smoke-pr-wrap-tab: ok (3 round-trips)');
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
