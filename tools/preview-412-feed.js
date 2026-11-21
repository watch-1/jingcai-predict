'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8776);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const icoBox = { esc };
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf('function animLiveIconSvg'), appSrc.indexOf('function animLiveScoreOf')),
  icoBox
);
const dockCtrls = icoBox.animLiveCtrlsHtml('2042881', 'docked');
const landCtrls = icoBox.animLiveCtrlsHtml('2042881', 'landscape');

const x = {
  id: '2042881', home: '鹿岛鹿角', away: '清水鼓动',
  status: '完场', full: '1:1', league: '日职', date: '2026-11-20', time: '18:00',
};
const live = { ok: true, finished: true, status: { short: 'FT' }, score: { home: 1, away: 1 }, events: [] };
const box = {
  S: {
    smPredictions: {
      '2042881': { ok: true, hasPredictions: true, wdl: { h: 0.6296, d: 0.2035, a: 0.167 } },
    },
    smMatchfacts: {
      '2042881': {
        ok: true, leagueZh: '日职', score: { home: 1, away: 1 },
        goalBins: { labels: ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'], home: [4, 1, 1, 0, 1, 3], away: [1, 0, 1, 0, 0, 0] },
        season: [{ name: '场均期望进球', home: 1.3525977528089892, away: 1.2241807692307694, mean: 1.340893979391105 }],
      },
    },
    smSurface: { '2042881': { xgCard: { ok: false, hasXg: false } } },
    liveStatsCache: { '2042881': live },
    statsCache: {},
    liveScores: {},
  },
  esc,
  badge: function (name) {
    const letter = esc([...(String(name || '?'))][0] || '?');
    return `<span class="badge sm" style="background:#3a4a6a">${letter}</span>`;
  },
  smPredPackOf: function (id) { return box.S.smPredictions[String(id)] || null; },
  mfPackOf: function (id) { return box.S.smMatchfacts[String(id)] || null; },
  animLiveScoreOf: function () { return { home: 1, away: 1, phaseLab: '完场' }; },
  animLivePhaseOf: function () { return 'ft'; },
  isAnimLiveClosedPhase: function () { return true; },
  animLiveWantPitch: function () { return false; },
  animLiveFormPageHtml: function () { return ''; },
  animLiveStandingsRowOf: function () { return null; },
};
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf('function animLiveStatsOf'), appSrc.indexOf('function animLiveIconSvg')),
  box
);
const cardsHtml = box.animLiveCardsHtml(x, live);
const namesHtml = box.animLiveNamesHtml(x, live);

const status = (t) => `<div class="prev-status"><span>${t}</span><span class="dots">•••••</span><span>${t}</span><span class="bat">117</span></div>`;
const nav = (league, meta) => `<div class="hero-edge-nav" style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:8px;padding:0 12px">
  <button type="button" style="background:none;border:0;color:#fff;font-size:22px">‹</button>
  <div style="text-align:center;line-height:1.3"><span>${league}</span><div style="opacity:.9;font-size:11px">${meta}</div></div>
  <span style="color:#fff">☆</span>
</div>`;
const tabs = (on) => {
  const names = ['态度', '情报', '赔率', '数据', '实时', '阵容', '预测'];
  return `<div class="dtabs prev-dtabs">${names.map((n) => `<button type="button" class="${n === on ? 'on' : ''}">${n}</button>`).join('')}</div>`;
};

const recapStage = (mode, ctrls) => `<div class="anim-live-stage" data-mode="${mode}" data-phase="ft">
  <div class="anim-live-visual"><div class="anim-live-recap-bg" aria-hidden="true"></div></div>
  ${namesHtml}
  ${cardsHtml}
  ${ctrls}
</div>`;

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>412 预览</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
  .phone { width: 390px; background: #f6f7f9; overflow: hidden; position: relative; }
  .phone.land { width: 780px; height: 390px; background: #070a12; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .prev-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; font: 600 12px/1.2 -apple-system, sans-serif; background: #0a0b0e; color: #fff; }
  .phone.land .prev-status { background: transparent; position: absolute; left: 0; right: 0; top: 0; z-index: 8; pointer-events: none; }
  .prev-dtabs { display: flex; margin: 0 !important; border-radius: 0; background: #fff; position: relative !important; top: auto !important; }
  .prev-dtabs button { flex: 1; min-width: 0; }
  .hero.hero--anim-live { padding-bottom: 0; }
  .land-frame { position: relative; width: 100%; height: 390px; }
  .land-frame .anim-live-stage { position: absolute; inset: 0; }
  .ctrls-board { width: 280px; height: 120px; background:
    radial-gradient(ellipse 90% 80% at 50% 42%, rgba(58, 130, 70, .55) 0%, rgba(18, 48, 28, .35) 48%, rgba(6, 16, 10, .92) 100%),
    #08150d; position: relative; overflow: hidden; border-radius: 16px; }
  .ctrls-board .anim-live-ctrls { top: 36px; right: 28px; }
</style>
</head><body>
<div class="row">
  <div class="col" id="recap-dock">
    <p class="lab">1. 竖屏赛后：虚化球场背景 + 更透的玻璃卡</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('23:44')}
      <div class="hero hero--edge hero--weather hero--anim-live">
        ${nav('日职 · 周五003', '2026/11/20 18:00 北京时间')}
        <div class="hero-anim-stage is-on">${recapStage('docked', dockCtrls)}</div>
      </div>
      ${tabs('情报')}
    </div>
  </div>
  <div class="col" id="recap-land">
    <p class="lab">2. 横屏赛后：同一虚化球场与玻璃卡</p>
    <div class="phone land">
      ${status('23:44')}
      <div class="land-frame">${recapStage('landscape', landCtrls)}</div>
    </div>
  </div>
</div>
<script>document.documentElement.setAttribute('data-preview-ready', '1');</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-412-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-412-feed')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(PREVIEW_HTML));
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
  { name: 'preview-412-recap-docked.png', w: 430, h: 920, sel: '#recap-dock .phone' },
  { name: 'preview-412-recap-landscape.png', w: 820, h: 460, sel: '#recap-land .phone' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-412-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  fs.mkdirSync(OUT, { recursive: true });
  for (const shot of shots) {
    const dest = path.join(OUT, shot.name);
    await page.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: shot.scale || 2 });
    const el = await page.$(shot.sel);
    if (!el) throw new Error('missing ' + shot.sel);
    const box = await el.boundingBox();
    if (box && (box.height > shot.h || box.width > shot.w)) {
      await page.setViewport({
        width: Math.max(shot.w, Math.ceil(box.width) + 24),
        height: Math.max(shot.h, Math.ceil(box.height) + 24),
        deviceScaleFactor: shot.scale || 2,
      });
    }
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
