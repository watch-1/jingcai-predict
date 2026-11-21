'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const PREVIEW_HTML = path.join(__dirname, 'pitch-live-preview.html');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8765);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel === '/_preview-pitch-live.html' || rel === '/pitch-live-preview.html') {
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

const scenes = [
  ['sunny', 'preview-pitch-live-sunny.png'],
  ['cloudy', 'preview-pitch-live-cloudy.png'],
  ['rain', 'preview-pitch-live-rain.png'],
  ['storm', 'preview-pitch-live-storm.png'],
  ['pre', 'preview-pitch-live-pre-kickoff.png'],
  ['inplay', 'preview-pitch-live-inplay.png'],
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  for (const [scene, name] of scenes) {
    const dest = path.join(OUT, name);
    if (name === 'preview-400-pred.png' || /\.apk$/i.test(name)) throw new Error('refusing to overwrite ' + name);
    await page.goto(`http://127.0.0.1:${PORT}/_preview-pitch-live.html?scene=${scene}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('.pitch-live-wrap', { timeout: 10000 });
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.pitch-bg')];
      return imgs.length >= 3 && imgs.every((im) => im.complete && im.naturalWidth > 0);
    }, { timeout: 15000 });
    const waitMs = (scene === 'rain' || scene === 'storm' || scene === 'inplay') ? 1400 : 700;
    await new Promise((r) => setTimeout(r, waitMs));
    const phone = await page.$('.phone');
    await phone.screenshot({ path: dest, type: 'png' });
    console.log('saved', dest, fs.statSync(dest).size);
  }
  await browser.close();
  server.close();
})().catch((err) => {
  console.error(err);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
