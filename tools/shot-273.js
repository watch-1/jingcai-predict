'use strict';
// Narrow-phone screenshots + splash lockup frames for 1.9.273.
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OUT = process.env.SHOT_DIR || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

async function waitServer(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(800, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch (_) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error('server not up: ' + url);
}

(async () => {
  const port = process.env.PORT || '8093';
  const base = 'http://127.0.0.1:' + port;
  const child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  try {
    await waitServer(base + '/', 15000);
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME || '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(() => {
      document.documentElement.style.setProperty('--sat', '36px');
    });

    // Splash frames: hold boot-shell, record lockup box at 0/80/200ms
    await page.goto(base + '/#/home', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.BOOT_SPLASH_MIN_MS = 999999;
      const el = document.getElementById('boot-shell');
      if (el) { el.classList.remove('out', 'gone'); }
    });
    const frames = [];
    for (const wait of [0, 80, 200, 400]) {
      if (wait) await new Promise(r => setTimeout(r, wait));
      const box = await page.evaluate(() => {
        const b = document.querySelector('.boot-brand');
        const r = b && b.getBoundingClientRect();
        return r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null;
      });
      frames.push(box);
      await page.screenshot({ path: path.join(OUT, `273-splash-${wait}ms.png`) });
    }
    const still = frames.every(f => f && f.x === frames[0].x && f.y === frames[0].y && f.w === frames[0].w && f.h === frames[0].h);
    fs.writeFileSync(path.join(OUT, '273-splash-boxes.json'), JSON.stringify({ frames, still }, null, 2));

    // Dismiss splash so schedule/results are visible
    await page.evaluate(() => {
      const el = document.getElementById('boot-shell');
      if (el) { el.classList.add('out', 'gone'); el.remove(); }
      document.documentElement.removeAttribute('data-boot');
      document.documentElement.setAttribute('data-ready', '1');
    });

    await page.goto(base + '/#/schedule', { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await page.evaluate(() => {
      const el = document.getElementById('boot-shell');
      if (el) { el.classList.add('gone'); el.remove(); }
      document.documentElement.removeAttribute('data-boot');
    });
    await page.waitForSelector('#dstrip', { timeout: 12000 }).catch(() => {});
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--sat', '36px');
      if (window.syncTopChromeHeight) window.syncTopChromeHeight();
    });
    await new Promise(r => setTimeout(r, 400));
    const metrics = await page.evaluate(() => {
      const chrome = document.getElementById('top-chrome');
      const strip = document.getElementById('dstrip');
      const wd = strip && strip.querySelector('.dstrip-wd');
      const cr = chrome && chrome.getBoundingClientRect();
      const sr = strip && strip.getBoundingClientRect();
      const wr = wd && wd.getBoundingClientRect();
      return {
        chromeBottom: cr ? +cr.bottom.toFixed(1) : null,
        stripTop: sr ? +sr.top.toFixed(1) : null,
        wdTop: wr ? +wr.top.toFixed(1) : null,
        gap: cr && sr ? +(sr.top - cr.bottom).toFixed(1) : null,
        pad: getComputedStyle(document.documentElement).getPropertyValue('--top-chrome-pad').trim(),
        sat: getComputedStyle(document.documentElement).getPropertyValue('--sat').trim(),
      };
    });
    fs.writeFileSync(path.join(OUT, '273-schedule-metrics.json'), JSON.stringify(metrics, null, 2));
    await page.screenshot({ path: path.join(OUT, '273-schedule-360.png') });

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await page.waitForSelector('#dstrip', { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, '273-schedule-390.png') });

    await page.goto(base + '/#/results', { waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {});
    await page.evaluate(() => {
      const el = document.getElementById('boot-shell');
      if (el) { el.classList.add('gone'); el.remove(); }
      document.documentElement.removeAttribute('data-boot');
    });
    await page.waitForSelector('#dstrip', { timeout: 8000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, '273-results-390.png') });

    await browser.close();
    console.log(JSON.stringify({ still, metrics, out: OUT }, null, 2));
  } finally {
    try { child.kill('SIGTERM'); } catch (_) {}
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
