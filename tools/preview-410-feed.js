'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8774);
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
const icoBox = { esc: (s) => String(s == null ? '' : s) };
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf('function animLiveIconSvg'), appSrc.indexOf('function animLiveScorebarHtml')),
  icoBox
);
const dockCtrls = icoBox.animLiveCtrlsHtml('2042881', 'docked');
const landCtrls = icoBox.animLiveCtrlsHtml('2042881', 'landscape');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const x = {
  id: '2042881', home: '鹿岛鹿角', away: '清水鼓动',
  status: '完场', full: '1:1', league: '日职', date: '2026-11-20', time: '18:00',
};
const live = { ok: true, finished: true, status: { short: 'FT' }, score: { home: 1, away: 1 }, events: [] };
const box = {
  S: {
    smPredictions: {
      '2042881': {
        ok: true, hasPredictions: true,
        wdl: { h: 0.6296, d: 0.20350000000000001, a: 0.16699999999999998 },
        frozenAt: '2026-11-20T10:00:00.000Z',
      },
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
  smPredPackOf: function (id) { return box.S.smPredictions[String(id)] || null; },
  mfPackOf: function (id) { return box.S.smMatchfacts[String(id)] || null; },
  animLiveScoreOf: function (xx, lv) {
    const s = (lv && lv.score) || {};
    return { home: s.home, away: s.away, phaseLab: '完场' };
  },
  animLivePhaseOf: function () { return 'ft'; },
  isAnimLiveClosedPhase: function () { return true; },
  animLiveWantPitch: function () { return false; },
  animLiveFormPageHtml: function () { return ''; },
  animLiveH2hPageHtml: function () { return ''; },
  animLiveCountPageHtml: function () { return ''; },
  animLiveStandingsRowOf: function () { return null; },
};
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf('function animLiveStatsOf'), appSrc.indexOf('function animLiveNamesHtml')),
  box
);
const cardsHtml = box.animLiveCardsHtml(x, live);
const metaHtml = box.animLiveRecapMetaHtml(x);
const namesHtml = `<div class="anim-live-names" aria-hidden="true"><span class="is-home">鹿岛鹿角</span><span class="is-away">清水鼓动</span></div>`;
const scorebar = `<div class="anim-live-scorebar">
  <div class="als-sb-side is-home"><span class="als-sb-name">鹿岛鹿角</span></div>
  <div class="als-sb-mid"><div class="als-sb-score">1-1</div><div class="als-sb-phase">完场</div></div>
  <div class="als-sb-side is-away"><span class="als-sb-name">清水鼓动</span></div>
</div>`;

const badge = (n) => `<span class="badge" style="display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:#3a4a6a;color:#fff;font-size:16px;font-weight:800;flex:none">${n}</span>`;
const tabs = (on) => {
  const names = ['态度', '情报', '赔率', '数据', '实时', '阵容', '预测'];
  return `<div class="dtabs prev-dtabs">${names.map((n) => `<button type="button" class="${n === on ? 'on' : ''}">${n}</button>`).join('')}</div>`;
};
const status = (t) => `<div class="prev-status"><span>${t}</span><span class="dots">•••••</span><span>${t}</span><span class="bat">117</span></div>`;
const nav = (league, meta) => `<div class="hero-edge-nav" style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:8px">
  <button type="button" class="ic-btn hero-ic" aria-label="返回" style="background:none;border:0;color:#fff;font-size:22px">‹</button>
  <div class="hero-lg" style="text-align:center;line-height:1.3"><span class="hero-lg-name">${league}</span><div style="opacity:.9;font-size:11px">${meta}</div></div>
  <button type="button" class="fav-btn" style="background:none;border:0;color:#fff">☆ 关注</button>
</div>`;
const liveBtn = `<button type="button" class="hero-anim-live" data-act="openAnimLive" aria-label="动画直播" aria-pressed="false"><svg class="hero-anim-live-ico" viewBox="0 0 24 18" aria-hidden="true"><rect x="1.25" y="1.25" width="21.5" height="15.5" rx="3.2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="1.25" x2="12" y2="16.75" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="3.15" fill="none" stroke="currentColor" stroke-width="2"/></svg>动画直播</button>`;

const recapStage = (mode, ctrls) => `<div class="anim-live-stage" id="anim-live-stage-2042881-${mode}" data-mode="${mode}" data-phase="ft">
  <div class="anim-live-visual" id="anim-live-visual-2042881-${mode}"><div class="anim-live-recap-bg" aria-hidden="true"></div></div>
  ${namesHtml}
  ${metaHtml}
  ${cardsHtml.replace('anim-live-cards-2042881', 'anim-live-cards-2042881-' + mode)}
  ${scorebar}
  ${ctrls}
</div>`;

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>410 预览</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
  .phone { width: 390px; background: #f6f7f9; overflow: hidden; position: relative; }
  .phone.land { width: 780px; height: 390px; background: #070a12; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .prev-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; font: 600 12px/1.2 -apple-system, sans-serif; background: #0a0b0e; color: #fff; }
  .phone.land .prev-status { background: #070a12; }
  .prev-dtabs { display: flex; margin: 0 !important; border-radius: 0; background: #fff; position: relative !important; top: auto !important; }
  .prev-dtabs button { flex: 1; min-width: 0; }
  .hero.hero--weather { color: #fff; padding: 8px 16px 18px; }
  .land-frame { position: relative; width: 100%; height: 354px; }
  .land-frame .anim-live-stage { position: absolute; inset: 0; }
  .info-pane { background: #fff; padding: 14px 16px 20px; min-height: 200px; color: #3a4250; font-size: 13px; }
  .hero.hero--anim-live { padding-bottom: 0; }
</style>
</head><body>
<div class="row">
  <div class="col" id="ft-btn">
    <p class="lab">1. 完场后仍保留「动画直播」入口，天气英雄头已恢复</p>
    <div class="phone">
      ${status('22:43')}
      <div class="hero hero--edge hero--weather" id="match-hero-2042881" data-weather="sunny">
        <div class="hero-wx" aria-hidden="true"><div class="hero-wx-base"></div><div class="hero-wx-glow"></div><div class="hero-wx-sky"></div><div class="hero-wx-fx hero-wx-rain"></div><div class="hero-wx-fx hero-wx-flash"></div><div class="hero-wx-scrim"></div></div>
        ${nav('日职 · 周五003', '2026/11/20 18:00 北京时间')}
        <div class="teams" style="position:relative;z-index:1">
          <div class="tm">${badge('鹿')}<span>鹿岛鹿角</span><small>主队</small></div>
          <div class="mid"><div class="score num">1 : 1</div><small>完场</small>${liveBtn}</div>
          <div class="tm">${badge('清')}<span>清水鼓动</span><small>客队</small></div>
        </div>
      </div>
      ${tabs('情报')}
      <div class="info-pane">完场后可以再次点开直播按钮，进入的是赛后数据，不是 3D 球场。</div>
    </div>
  </div>
  <div class="col" id="recap-dock">
    <p class="lab">2. 竖屏赛后数据：锁定的预测胜率（可滑到进球分布 / xG）</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('22:44')}
      <div class="hero hero--edge hero--weather hero--anim-live">
        ${nav('日职 · 周五003', '2026/11/20 18:00 北京时间')}
        <div class="hero-anim-stage is-on">${recapStage('docked', dockCtrls)}</div>
      </div>
      ${tabs('情报')}
    </div>
  </div>
  <div class="col" id="recap-land">
    <p class="lab">3. 横屏赛后数据：同一套真实卡片</p>
    <div class="phone land">
      ${status('22:44')}
      <div class="land-frame">${recapStage('landscape', landCtrls)}</div>
    </div>
  </div>
</div>
<script>
document.documentElement.setAttribute('data-preview-ready', '1');
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-410-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-410-feed')) {
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
  { name: 'preview-410-ft-hero-live-btn.png', w: 430, h: 900, sel: '#ft-btn .phone' },
  { name: 'preview-410-recap-docked.png', w: 430, h: 920, sel: '#recap-dock .phone' },
  { name: 'preview-410-recap-landscape.png', w: 820, h: 460, sel: '#recap-land .phone' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-410-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  fs.mkdirSync(OUT, { recursive: true });
  for (const shot of shots) {
    const dest = path.join(OUT, shot.name);
    await page.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: 2 });
    const el = await page.$(shot.sel);
    if (!el) throw new Error('missing ' + shot.sel);
    const box = await el.boundingBox();
    if (box && (box.height > shot.h || box.width > shot.w)) {
      await page.setViewport({
        width: Math.max(shot.w, Math.ceil(box.width) + 24),
        height: Math.max(shot.h, Math.ceil(box.height) + 24),
        deviceScaleFactor: 2,
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
