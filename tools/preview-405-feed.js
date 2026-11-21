'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8769);
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

const kickMs = Date.now() + 2 * 3600 * 1000 + 15 * 60 * 1000 + 8 * 1000;
const cd = (() => {
  const left = kickMs - Date.now();
  let sec = Math.floor(left / 1000);
  const days = Math.floor(sec / 86400); sec -= days * 86400;
  const hours = Math.floor(sec / 3600); sec -= hours * 3600;
  const mins = Math.floor(sec / 60);
  const secs = sec - mins * 60;
  const cell = (k, lab, v) => `<div class="als-cd-cell"><b data-cd="${k}">${v}</b><span>${lab}</span></div>`;
  return `<div class="als-cd" data-anim-cd="${kickMs}">${cell('days','天',days)}${cell('hours','时',String(hours).padStart(2,'0'))}${cell('mins','分',String(mins).padStart(2,'0'))}${cell('secs','秒',String(secs).padStart(2,'0'))}</div>`;
})();

const cardsNs = `<div class="anim-live-cards">
  <div class="anim-live-track">
    <div class="als-page" data-page="h2h">
      <div class="als-h2h"><div class="als-k">历史交手</div>
        <div class="als-h2h-sum">威尔士 1胜1平3负</div>
        <div class="als-form"><i class="l">负</i><i class="d">平</i><i class="l">负</i><i class="w">胜</i><i class="l">负</i></div>
      </div>
    </div>
    <div class="als-page" data-page="count">
      <div class="als-k">开赛倒计时</div>
      ${cd}
      <div class="als-meta-row">场地 卡迪夫球场 · 卡迪夫</div>
      <div class="als-meta-row">天气 晴</div>
    </div>
  </div>
  <div class="anim-live-dots"><i class="on"></i><i></i></div>
</div>`;

const ctrlsLand = `<div class="anim-live-ctrls">
  <button type="button" class="als-btn als-land">退出横屏</button>
  <button type="button" class="als-btn als-pip">小窗</button>
  <button type="button" class="als-btn als-x">✕</button>
</div>`;
const ctrlsDock = `<div class="anim-live-ctrls">
  <button type="button" class="als-btn als-land">旋转</button>
  <button type="button" class="als-btn als-pip">小窗</button>
  <button type="button" class="als-btn als-x">✕</button>
</div>`;

const badge = (n) => `<span class="badge" style="display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#3a4a6a;color:#fff;font-size:9px;font-weight:800;flex:none">${n}</span>`;

const scorebar = `<div class="anim-live-scorebar">
  <div class="als-sb-side is-home">${badge('威')}<span class="als-sb-name">威尔士</span><span class="als-sb-tcc"><i class="als-sb-yc">1</i></span></div>
  <div class="als-sb-mid"><div class="als-sb-score">1-0</div><div class="als-sb-phase">上半场 32'</div></div>
  <div class="als-sb-side is-away"><span class="als-sb-name">葡萄牙</span>${badge('葡')}</div>
</div>`;

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>405 预览</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; flex-wrap: wrap; }
  .phone { width: 390px; background: #f6f7f9; overflow: hidden; }
  .prev-hero { background: #0A0B0E; color: #fff; padding: 8px 12px 14px; }
  .ph-top { display: flex; justify-content: space-between; font-size: 13px; }
  .ph-teams { display: grid; grid-template-columns: 1fr auto 1fr; text-align: center; margin-top: 10px; font-weight: 800; }
  .ph-teams .mid b { font-size: 22px; }
  .ph-teams small { display: block; font-weight: 500; opacity: .7; font-size: 11px; }
  .prev-tabs { display: flex; background: #fff; border-bottom: 1px solid #ececef; font-size: 13px; color: #6b7280; font-weight: 600; }
  .prev-tabs span { flex: 1; text-align: center; padding: 11px 0; }
  .prev-tabs span.on { color: #1a1d24; box-shadow: inset 0 -2px 0 #5b7cfa; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .land-frame { width: 720px; height: 390px; background: #070a12; overflow: hidden; position: relative; isolation: isolate; }
  .land-frame .anim-live-land { position: absolute !important; inset: 0 !important; display: flex !important; }
  .land-frame .anim-live-stage { width: 100%; height: 100%; }
  .fake-pane { padding: 14px; font-size: 13px; color: #3b4048; background: #fff; min-height: 200px; }
</style>
</head><body>
<div class="row" id="land-live">
  <div class="col"><div class="lab">动画直播 · 横屏 · 开赛后（球场完整可见，比分条在下方）</div>
    <div class="land-frame">
      <div class="anim-live-land">
        <div class="anim-live-stage" data-phase="live" data-mode="landscape">
          <div class="anim-live-visual"><div class="pitch-live" id="pitch-live-landscape"></div></div>
          <div class="anim-live-names"><span class="is-home">威尔士</span><span class="is-away">葡萄牙</span></div>
          ${scorebar}
          ${ctrlsLand}
        </div>
      </div>
    </div>
  </div>
</div>
<div class="row" id="docked-live">
  <div class="col"><div class="lab">动画直播 · 竖屏投放 · 进行中（仅球场，比分在英雄区）</div>
    <div class="phone">
      <div class="prev-hero">
        <div class="ph-top"><span>‹</span><b>友谊赛</b><span>关注</span></div>
        <div class="hero-anim-stage is-on">
          <div class="anim-live-stage" data-phase="live" data-mode="docked">
            <div class="anim-live-visual"><div class="pitch-live" id="pitch-live-docked"></div></div>
            ${ctrlsDock}
          </div>
        </div>
        <div class="ph-teams"><div>威尔士<br><small>主队</small></div><div class="mid"><b>1 : 0</b><small>上半场</small><button class="hero-anim-live is-on">动画直播</button></div><div>葡萄牙<br><small>客队</small></div></div>
      </div>
      <div class="prev-tabs"><span>态度</span><span>情报</span><span>赔率</span><span>预测</span><span class="on">实时</span><span>阵容</span></div>
      <div class="fake-pane">开赛后竖屏只保留 3D 球场，比分在球场下方的对阵区，不再叠信息卡。</div>
    </div>
  </div>
</div>
<div class="row" id="land-ns">
  <div class="col"><div class="lab">动画直播 · 横屏 · 未开赛（交手 + 倒计时不变）</div>
    <div class="land-frame">
      <div class="anim-live-land">
        <div class="anim-live-stage" data-phase="ns" data-mode="landscape">
          <div class="anim-live-visual"><div class="pitch-live" id="pitch-ns-landscape"></div></div>
          <div class="anim-live-names"><span class="is-home">威尔士</span><span class="is-away">葡萄牙</span></div>
          ${cardsNs}
          ${ctrlsLand}
        </div>
      </div>
    </div>
  </div>
</div>
<script src="/js/pitch-live.js?v=pitch403"></script>
<script>
(function () {
  function mount(id, wx, live) {
    const el = document.getElementById(id);
    if (!el || !window.JCPitchLive) return;
    window.JCPitchLive.mount(el, {
      weather: wx || 'sunny',
      homeName: '威尔士',
      awayName: '葡萄牙',
      tabVisible: true,
      allowPreviewDemo: false,
      phase: live ? '1H' : 'NS',
      phaseZh: live ? '上半场' : '',
      elapsed: live ? 32 : undefined,
      live: !!live,
    });
  }
  mount('pitch-live-landscape', 'cloudy', true);
  mount('pitch-live-docked', 'cloudy', true);
  mount('pitch-ns-landscape', 'sunny', false);
  document.documentElement.setAttribute('data-preview-ready', '1');
})();
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-405-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-405-feed')) {
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
  { name: 'preview-405-anim-landscape-live.png', w: 780, h: 460, sel: '#land-live .land-frame' },
  { name: 'preview-405-anim-docked-live.png', w: 430, h: 900, sel: '#docked-live .phone' },
  { name: 'preview-405-anim-landscape-ns.png', w: 780, h: 460, sel: '#land-ns .land-frame' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-405-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  try {
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.pitch-bg, .pitch-bg-hold')];
      return imgs.length >= 3 && imgs.every((im) => im.complete && im.naturalWidth > 0);
    }, { timeout: 15000 });
  } catch (_) {}
  await new Promise((r) => setTimeout(r, 700));
  for (const shot of shots) {
    const dest = path.join(OUT, shot.name);
    if (/preview-404/.test(dest)) throw new Error('refusing to overwrite 404 preview');
    await page.setViewport({ width: shot.w, height: shot.h, deviceScaleFactor: 2 });
    const el = await page.$(shot.sel);
    if (!el) throw new Error('missing ' + shot.sel);
    const box = await el.boundingBox();
    if (box && box.height > shot.h) {
      await page.setViewport({ width: shot.w, height: Math.ceil(box.height) + 20, deviceScaleFactor: 2 });
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
