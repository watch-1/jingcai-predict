'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const PREVIEW_HTML = path.join(__dirname, 'preview-hero-anim-403.html');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8766);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-hero-anim-403')) {
    fs.readFile(PREVIEW_HTML, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const shots = [
  { view: 'hero-off', name: 'preview-403-hero-off.png', w: 430, h: 720, sel: '.phone' },
  { view: 'hero-on', name: 'preview-403-hero-on.png', w: 430, h: 900, sel: '.phone' },
  { view: 'wx', name: 'preview-403-wx-compare.png', w: 1260, h: 420, sel: '.row' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  for (const shot of shots) {
    const dest = path.join(OUT, shot.name);
    if (/\.apk$/i.test(shot.name)) throw new Error('refusing ' + shot.name);
    await page.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${PORT}/preview-hero-anim-403.html?view=${shot.view}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
    if (shot.view !== 'hero-off') {
      await page.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('.pitch-bg, .pitch-bg-hold')];
        return imgs.length >= 3 && imgs.every((im) => im.complete && im.naturalWidth > 0);
      }, { timeout: 15000 });
    }
    await new Promise((r) => setTimeout(r, 800));
    const el = await page.$(shot.sel);
    await el.screenshot({ path: dest, type: 'png' });
    console.log('saved', dest, fs.statSync(dest).size);
  }
  await browser.close();
  server.close();
})().catch((err) => {
  console.error(err);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
