'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8773);
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
const dockCtrls = icoBox.animLiveCtrlsHtml('coast409', 'docked');

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
const scorebar = () => `<div class="anim-live-scorebar">
  <div class="als-sb-side is-home">${badge('鹿').replace('44px','22px').replace('16px','10px')}<span class="als-sb-name">鹿岛鹿角</span></div>
  <div class="als-sb-mid"><div class="als-sb-score">0-0</div><div class="als-sb-phase">下半场 73'</div></div>
  <div class="als-sb-side is-away"><span class="als-sb-name">清水鼓动</span>${badge('清').replace('44px','22px').replace('16px','10px')}</div>
</div>`;
const dockedStage = `<div class="anim-live-stage" id="anim-live-stage-coast409" data-mode="docked" data-phase="live">
  ${dockCtrls}
  <div class="anim-live-visual" id="anim-live-visual-coast409">
    <section class="pitch-live" id="pitch-live-coast"></section>
  </div>
  ${scorebar()}
</div>`;

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>409 预览</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
  .phone { width: 390px; background: #f6f7f9; overflow: hidden; position: relative; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .prev-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; font: 600 12px/1.2 -apple-system, sans-serif; background: #0a0b0e; color: #fff; }
  .hero.hero--weather { background: linear-gradient(180deg, #7ea8c9 0%, #c5d8ea 55%, #e8eef5 100%); color: #fff; padding: 8px 16px 18px; }
  .hero .hero-score { text-align: center; font-size: 40px; font-weight: 800; letter-spacing: 2px; }
  .hero .hero-phase { text-align: center; font-size: 14px; opacity: .95; margin-top: 2px; }
  .hero .hero-teams { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .hero .tname { font-weight: 800; font-size: 15px; margin-top: 6px; }
  .hero small { opacity: .85; font-size: 11px; }
  .prev-dtabs { display: flex; margin: 0 !important; border-radius: 0; background: #fff; position: relative !important; top: auto !important; }
  .prev-dtabs button { flex: 1; min-width: 0; }
  .info-pane { background: #fff; padding: 14px 16px 20px; min-height: 280px; color: #3a4250; font-size: 13px; }
  .info-pane .card { background: #f4f6fa; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
  .wx { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .wx .deg { font-weight: 800; }
  .hero.hero--anim-live { padding-bottom: 0; }
  .coast-note { position: absolute; left: 10px; bottom: 10px; z-index: 6; background: rgba(8,12,22,.72); color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 8px; pointer-events: none; }
</style>
</head><body>
<div class="row">
  <div class="col" id="ft-restored">
    <p class="lab">1. 完场后拆掉动画直播，恢复天气英雄头，隐藏入口</p>
    <div class="phone">
      ${status('10:48')}
      <div class="hero hero--edge hero--weather" id="match-hero-2042881" data-weather="sunny">
        <div class="hero-wx" aria-hidden="true"><div class="hero-wx-base"></div><div class="hero-wx-glow"></div><div class="hero-wx-sky"></div><div class="hero-wx-fx hero-wx-rain"></div><div class="hero-wx-fx hero-wx-flash"></div><div class="hero-wx-scrim"></div></div>
        ${nav('日职 · 周五003', '2026/11/20 18:00 北京时间')}
        <div class="teams" style="position:relative;z-index:1">
          <div class="tm">${badge('鹿')}<span>鹿岛鹿角</span><small>主队</small></div>
          <div class="mid"><div class="score num">1 : 1</div><small>完场</small></div>
          <div class="tm">${badge('清')}<span>清水鼓动</span><small>客队</small></div>
        </div>
      </div>
      ${tabs('情报')}
      <div class="info-pane">
        <div class="card wx">☀️ <span>茨城县鹿嶋市 · 晴</span><span class="deg">16°C</span></div>
        <div class="card">比赛已结束。动画直播舞台已拆除，不再显示冻结的 3D 球场，也无法再次打开直播。</div>
      </div>
    </div>
  </div>
  <div class="col" id="coast-gap">
    <p class="lab">2. 进行中：官方坐标出现缺口后，附近球员连续带球 / 抢断</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('19:37')}
      <div class="hero hero--edge hero--weather hero--anim-live">
        ${nav('日职 · 周五003', '2026/11/20 18:00 北京时间')}
        <div class="hero-anim-stage is-on">${dockedStage}</div>
        <div class="coast-note" id="coast-note">等待官方缺口后的连续移动…</div>
      </div>
      ${tabs('实时')}
    </div>
  </div>
</div>
<script src="/js/pitch-live.js"></script>
<script>
(function () {
  const PATH = [
    { x: 0.42, y: 0.54, t: 100 },
    { x: 0.50, y: 0.48, t: 100.4 },
    { x: 0.58, y: 0.46, t: 100.8 }
  ];
  const el = document.getElementById('pitch-live-coast');
  if (el && window.JCPitchLive) {
    window.JCPitchLive.mount(el, {
      tabVisible: true,
      allowPreviewDemo: false,
      weather: 'sunny',
      homeName: '鹿岛鹿角',
      awayName: '清水鼓动',
      phase: '2H',
      phaseZh: '下半场',
      elapsed: 73,
      live: true,
      kickoffMs: Date.now() - 98 * 60 * 1000,
      attackingSide: 'home',
      pack: { live: true, phase: '2H', hasCoords: true, coords: PATH }
    });
    const note = document.getElementById('coast-note');
    const tick = setInterval(function () {
      const inst = window.JCPitchLive.get && window.JCPitchLive.get(el);
      const st = inst && inst.getState && inst.getState();
      if (st && st.coast && st.coast.simulated) {
        const mode = st.coast.mode === 'tackle' ? '抢断' : '带球';
        note.textContent = '官方坐标已停，模拟' + mode + ' 连续移动';
        document.documentElement.setAttribute('data-coast-on', '1');
        clearInterval(tick);
      }
    }, 80);
  }
  document.documentElement.setAttribute('data-preview-ready', '1');
})();
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-409-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-409-feed')) {
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
  { name: 'preview-409-ft-hero-restored.png', w: 430, h: 900, sel: '#ft-restored .phone' },
  { name: 'preview-409-coast-dribble.png', w: 430, h: 900, sel: '#coast-gap .phone' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-409-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  try {
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.pitch-bg, .pitch-bg-hold')];
      return imgs.length >= 1 && imgs.every((im) => im.complete && im.naturalWidth > 0);
    }, { timeout: 15000 });
  } catch (_) {}
  try {
    await page.waitForFunction(() => document.documentElement.getAttribute('data-coast-on') === '1', { timeout: 4000 });
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 1400));
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
