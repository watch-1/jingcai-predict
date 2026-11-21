'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8771);
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
const dockCtrls = icoBox.animLiveCtrlsHtml('kashima', 'docked');
const landCtrls = icoBox.animLiveCtrlsHtml('kashima', 'landscape');

const badge = (n) => `<span class="badge" style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#3a4a6a;color:#fff;font-size:10px;font-weight:800;flex:none">${n}</span>`;
const tabs = (on) => {
  const names = ['态度', '情报', '赔率', '数据', '实时', '阵容', '预测'];
  return `<div class="dtabs prev-dtabs">${names.map((n) => `<button type="button" class="${n === on ? 'on' : ''}">${n}</button>`).join('')}</div>`;
};
const wxCard = () => `<section class="wx-slip" data-wx="sunny" data-source="SportMonks">
  <div class="wx-slip-sky"><i class="wx-slip-sky-fx" aria-hidden="true"></i>
    <div class="wx-slip-kicker">11月20日</div>
    <div class="wx-slip-venue">Kashima Soccer Stadium · Kashima</div>
  </div>
  <div class="wx-slip-body">
    <div class="wx-slip-temp"><b>9<small>°C</small></b><span>晴</span></div>
    <div class="wx-slip-metrics">
      <div class="wx-slip-m"><i>湿度</i><b>39%</b></div>
      <div class="wx-slip-m"><i>风速</i><b>7.6m/s</b></div>
      <div class="wx-slip-m"><i>气压</i><b>757mmHg</b></div>
    </div>
  </div>
  <p class="wx-slip-foot">天气来源 SportMonks · 当场天气</p>
</section>`;
const scorebar = (mode) => `<div class="anim-live-scorebar">
  <div class="als-sb-side is-home">${badge('鹿')}<span class="als-sb-name">鹿岛鹿角</span></div>
  <div class="als-sb-mid"><div class="als-sb-score">0-0</div><div class="als-sb-phase">下半场 53'</div></div>
  <div class="als-sb-side is-away"><span class="als-sb-name">清水鼓动</span>${badge('清')}</div>
</div>`;
const nav = () => `<div class="hero-edge-nav"><button type="button" class="ic-btn hero-ic" aria-label="返回">‹</button><div class="hero-lg"><span class="hero-lg-name">日职</span></div><button type="button" class="fav-btn">☆</button></div>`;
const stickyChip = `<div class="hero-sticky" id="match-sticky-kashima" data-weather="sunny" aria-hidden="true">
  <div class="hero-sticky-bar">
    <div class="hero-sticky-bg"></div>
    <button type="button" class="ic-btn hero-ic md-back" aria-label="返回">‹</button>
    <div class="hero-sticky-mid">${badge('鹿')}<b class="hero-sticky-score num">0</b><span class="hero-sticky-pill">下半场</span><b class="hero-sticky-score num">0</b>${badge('清')}</div>
    <button type="button" class="fav-btn" aria-label="关注">☆</button>
  </div>
</div>`;
const status = (t) => `<div class="prev-status"><span>${t}</span><span class="dots">•••••</span><span>19:20</span><span class="bat">118</span></div>`;

const names = `<div class="anim-live-names"><span class="is-home">鹿岛鹿角</span><span class="is-away">清水鼓动</span></div>`;

const dockedStage = (id, ctrls) => `<div class="anim-live-stage" id="anim-live-stage-${id}" data-mode="docked" data-phase="live">
  ${ctrls}
  <div class="anim-live-visual" id="anim-live-visual-${id}">
    <section class="pitch-live" id="${id}"></section>
  </div>
  ${scorebar()}
</div>`;

const landStage = `<div class="anim-live-stage" id="anim-live-stage-land" data-mode="landscape" data-phase="live">
  ${landCtrls}
  ${names}
  <div class="anim-live-visual" id="anim-live-visual-land">
    <section class="pitch-live" id="pitch-live-land"></section>
  </div>
  ${scorebar()}
</div>`;

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>407 预览</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
  .phone { width: 390px; background: #f6f7f9; overflow: hidden; position: relative; }
  .phone.land { width: 780px; height: 390px; background: #070a12; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .phone.view.sub.md-wrap { padding-top: 0; }
  .prev-dtabs { display: flex; margin: 0 !important; border-radius: 0; background: #fff; position: relative !important; top: auto !important; }
  .prev-dtabs button { flex: 1; min-width: 0; }
  .phone .detail-pane { background: #f6f7f9; }
  .prev-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; font: 600 12px/1.2 -apple-system, sans-serif; background: #070a12; color: #fff; }
  .phone.view.sub.md-wrap .prev-status { background: #070a12; }
  .phone:not(.land) .prev-status { background: #0a0b0e; }
  .hero.hero--anim-live { padding-bottom: 0; }
  .hero-anim-stage.is-on { display: block; }
  .live-note { margin: 14px 16px 0; color: #6a7384; font-size: 13px; }
  #after-exit .hero-sticky { position: absolute; left: 0; right: 0; top: 0; z-index: 20; height: auto; }
  /* Confirm the chip is hidden even if someone forced is-hero-stuck in the DOM. */
  #after-exit .view.is-anim-live.is-hero-stuck .hero-sticky-bar { }
  .land-frame { position: relative; width: 100%; height: 354px; }
  .land-frame .anim-live-land { position: absolute; inset: 0; display: flex; }
</style>
</head><body>
<div class="row">
  <div class="col" id="docked-icons">
    <p class="lab">1. 竖屏直播：旋转 / 大屏为图标按钮</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('19:20')}
      ${stickyChip}
      <div class="hero hero--edge hero--weather hero--anim-live" id="match-hero-kashima">
        ${nav()}
        <div class="hero-anim-stage is-on" id="hero-anim-stage-dock">${dockedStage('pitch-live-dock', dockCtrls)}</div>
      </div>
      ${tabs('实时')}
      <div class="detail-pane"><p class="live-note">动画直播正在上方播出</p>${wxCard()}</div>
    </div>
  </div>
  <div class="col" id="landscape-exit">
    <p class="lab">2. 横屏直播：左上角退出图标，右上小窗 / 关闭</p>
    <div class="phone land">
      ${status('19:20')}
      <div class="land-frame">
        <div class="anim-live-land" id="anim-live-land">${landStage}</div>
      </div>
    </div>
  </div>
  <div class="col" id="after-exit">
    <p class="lab">3. 退出横屏后：竖屏停靠，无顶部比分条残留</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('19:20')}
      ${stickyChip}
      <div class="hero hero--edge hero--weather hero--anim-live" id="match-hero-after">
        ${nav()}
        <div class="hero-anim-stage is-on">${dockedStage('pitch-live-after', dockCtrls)}</div>
      </div>
      ${tabs('实时')}
      <div class="detail-pane"><p class="live-note">动画直播正在上方播出</p>${wxCard()}</div>
    </div>
  </div>
  <div class="col" id="motion-poss">
    <p class="lab">4. 持球进攻可见，球沿最近坐标窗口回放（无球员坐标则不编造跑动）</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('19:20')}
      ${stickyChip}
      <div class="hero hero--edge hero--weather hero--anim-live">
        ${nav()}
        <div class="hero-anim-stage is-on">${dockedStage('pitch-live-motion', dockCtrls)}</div>
      </div>
      ${tabs('实时')}
      <div class="detail-pane"><p class="live-note">动画直播正在上方播出</p>${wxCard()}</div>
    </div>
  </div>
</div>
<script src="/js/pitch-live.js"></script>
<script>
(function () {
  const PATH = [
    { x: 0.42, y: 0.54, t: 100 },
    { x: 0.50, y: 0.48, t: 102 },
    { x: 0.58, y: 0.44, t: 104 },
    { x: 0.66, y: 0.42, t: 105.5 },
    { x: 0.74, y: 0.46, t: 107 },
    { x: 0.82, y: 0.50, t: 108.5 }
  ];
  function mount(id, pack) {
    const el = document.getElementById(id);
    if (!el || !window.JCPitchLive) return;
    window.JCPitchLive.mount(el, {
      tabVisible: true,
      allowPreviewDemo: false,
      weather: 'sunny',
      homeName: '鹿岛鹿角',
      awayName: '清水鼓动',
      phase: '2H',
      phaseZh: '下半场',
      elapsed: 53,
      live: true,
      kickoffMs: Date.now() - 98 * 60 * 1000,
      pack: pack
    });
  }
  const still = { live: true, phase: '2H', hasCoords: true, coords: [{ x: 0.72, y: 0.48, t: 200 }], attackingSide: 'home' };
  const moving = { live: true, phase: '2H', hasCoords: true, coords: PATH };
  mount('pitch-live-dock', still);
  mount('pitch-live-land', still);
  mount('pitch-live-after', still);
  mount('pitch-live-motion', moving);
  document.documentElement.setAttribute('data-preview-ready', '1');
})();
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-407-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-407-feed')) {
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
  { name: 'preview-407-docked-icons.png', w: 430, h: 980, sel: '#docked-icons .phone' },
  { name: 'preview-407-landscape-exit.png', w: 820, h: 460, sel: '#landscape-exit .phone' },
  { name: 'preview-407-after-exit-docked.png', w: 430, h: 980, sel: '#after-exit .phone' },
  { name: 'preview-407-motion-possession.png', w: 430, h: 980, sel: '#motion-poss .phone' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-407-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  try {
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.pitch-bg, .pitch-bg-hold')];
      return imgs.length >= 3 && imgs.every((im) => im.complete && im.naturalWidth > 0);
    }, { timeout: 15000 });
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 1800));
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
