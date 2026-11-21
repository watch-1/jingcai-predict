'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');
const live = require('../lib/live-stats');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8768);
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

const sides = { home: { id: 1, name: '主队联' }, away: { id: 2, name: '客队联' } };
const rawFx = {
  events: [
    { id: 10, type_id: 14, minute: 11, player_name: '布鲁诺', related_player_name: '内维斯', participant_id: 2, addition: '1st Goal', info: 'Right foot shot' },
    { id: 11, type_id: 14, minute: 13, player_name: '布鲁克斯', related_player_name: '科尔威尔', participant_id: 1, addition: '2nd Goal', info: 'Left foot shot' },
    { id: 17, type_id: 17, minute: 30, player_name: '托马斯', participant_id: 1, addition: '1st Missed Penalty' },
    { id: 12, type_id: 19, minute: 51, player_name: '卡班戈', participant_id: 1, addition: '1st Yellowcard', info: 'Foul' },
    { id: 13, type_id: 21, minute: 74, player_name: '佩德罗', participant_id: 2, addition: '1st Yellow/red Card', info: 'Foul' },
    { id: 14, type_id: 18, minute: 60, player_name: '约翰逊', related_player_name: '詹姆斯', participant_id: 1, injured: true, addition: '1st Substitution' },
    { id: 15, type_id: 10, minute: 55, participant_id: 2, info: 'Penalty confirmed' },
  ],
  timeline: [
    { id: 20, type_id: 126, minute: 25, participant_id: 1, addition: '1st Corner' },
    { id: 21, type_id: 570, minute: 40, participant_id: 1, addition: '2nd Shot Off Target' },
    { id: 22, type_id: 569, minute: 11, participant_id: 2, addition: '1st Shot On Target' },
    { id: 23, type_id: 48995, minute: 59, participant_id: 2, player_name: '佩德罗', addition: '1st Woodwork' },
  ],
  periods: [
    { id: 1, type_id: 1, description: '1st-half', started: 1, ended: 2, time_added: 2, minutes: 48, sort_order: 1 },
    { id: 2, type_id: 2, description: '2nd-half', started: 3, ended: 4, time_added: 3, minutes: 93, sort_order: 2 },
  ],
};
const evs = live.mergeSmEventLists(
  rawFx.events.map((e) => live.normalizeOneSmEvent(e, sides, 'event')),
  rawFx.timeline.map((e) => live.normalizeOneSmEvent(e, sides, 'timeline'))
).filter(Boolean);
const periods = live.normalizeSmPeriods(rawFx);

const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const aStart = appJs.indexOf('function eventGoalKind');
const aEnd = appJs.indexOf('function liveStatsUserMsg');
const bStart = appJs.indexOf('function liveStatNum');
const bEnd = appJs.indexOf('function pitchLiveShellHtml');
const sandbox = {
  S: { liveScores: {}, liveStatsCache: {} },
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  badge: (name) => '<span class="badge" style="display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#3a4a6a;color:#fff;font-size:9px;font-weight:800">' + String(name || '').slice(0, 1) + '</span>',
  weatherPackOf: () => ({ ok: true, labelZh: '晴', venueName: '卡迪夫球场', venueCity: '卡迪夫' }),
  venueFromLive: () => ({ name: '卡迪夫球场', city: '卡迪夫' }),
  donutPair: () => '',
};
vm.runInNewContext(appJs.slice(aStart, aEnd) + '\n' + appJs.slice(bStart, bEnd), sandbox);

const x = { id: 'm1', home: '威尔士', away: '葡萄牙', homeTeamId: 'h', awayTeamId: 'a' };
const livePack = {
  ok: true,
  status: { short: 'FT', elapsed: 93 },
  finished: true,
  home: { nameZh: '威尔士', name: 'Wales' },
  away: { nameZh: '葡萄牙', name: 'Portugal' },
  stats: {
    corners: { home: 7, away: 1 },
    yellowCards: { home: 3, away: 2 },
    redCards: { home: 0, away: 1 },
    shots: { home: 10, away: 12 },
    shotsOnTarget: { home: 4, away: 5 },
  },
  periods,
  events: evs,
};
const strip = sandbox.liveStatsStripHtml(x, livePack);
const text = sandbox.liveCommentHtml(x, livePack);
const important = sandbox.liveImportantHtml(x, livePack, { sub: 'events', goalsOnly: false });
const legend = sandbox.liveLegendHtml();
const subhead = sandbox.liveSubHeadHtml(x, { sub: 'text', goalsOnly: false });
const subheadEv = sandbox.liveSubHeadHtml(x, { sub: 'events', goalsOnly: false });

function phone(inner, title) {
  return `<div class="phone" data-title="${title}">
    <div class="prev-hero"><div class="ph-top"><span>‹</span><b>友谊赛</b><span>关注</span></div>
      <div class="ph-teams"><div>威尔士<br><small>主队</small></div><div class="mid"><b>2 : 3</b><small>完场</small></div><div>葡萄牙<br><small>客队</small></div></div>
    </div>
    <div class="prev-tabs"><span>态度</span><span>情报</span><span>赔率</span><span>预测</span><span class="on">实时</span><span>阵容</span></div>
    ${inner}
  </div>`;
}

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

const cardsNsDocked = `<div class="anim-live-cards">
  <div class="anim-live-track">
    <div class="als-page" data-page="h2h">
      <div class="als-h2h"><div class="als-k">历史交手</div>
        <div class="als-h2h-sum">威尔士 1胜1平3负</div>
        <div class="als-form"><i class="l">负</i><i class="d">平</i><i class="l">负</i><i class="w">胜</i><i class="l">负</i></div>
      </div>
      <div class="als-k" style="margin-top:12px">开赛倒计时</div>
      ${cd}
      <div class="als-meta-row">场地 卡迪夫球场 · 卡迪夫</div>
      <div class="als-meta-row">天气 晴</div>
    </div>
  </div>
</div>`;

const ctrls = `<div class="anim-live-ctrls">
  <button type="button" class="als-btn als-land">旋转</button>
  <button type="button" class="als-btn als-pip">小窗</button>
  <button type="button" class="als-btn als-x">✕</button>
</div>`;

function stageBlock(phase, mode, extraCards) {
  return `<div class="hero-anim-stage is-on"><div class="anim-live-stage" data-phase="${phase}" data-mode="${mode}">
    <div class="anim-live-visual"><div class="pitch-live" id="pitch-${phase}-${mode}"></div></div>
    <div class="anim-live-names"><span class="is-home">威尔士</span><span class="is-away">葡萄牙</span></div>
    ${extraCards || ''}
    ${ctrls}
  </div></div>`;
}

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>404 预览</title>
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
  .land-frame { width: 720px; height: 390px; background: #070a12; overflow: hidden; position: relative; }
  .land-frame { isolation: isolate; }
  .land-frame .anim-live-land { position: absolute !important; inset: 0 !important; display: flex !important; }
  .land-frame .hero-anim-stage, .land-frame .anim-live-stage { width: 100%; height: 100%; }
  .pip-page { position: relative; width: 390px; background: #f6f7f9; min-height: 640px; }
  .pip-page .anim-live-pip { position: absolute; right: 10px; bottom: 24px; display: block; }

  .fake-pane { padding: 14px; font-size: 13px; color: #3b4048; background: #fff; min-height: 200px; }
</style>
</head><body>
<div class="row" id="text">
  <div class="col"><div class="lab">文字直播</div>${phone(subhead + `<div class="live-sub-body">${text}</div>` + legend, 'text')}</div>
</div>
<div class="row" id="events">
  <div class="col"><div class="lab">重要事件</div>${phone(subheadEv + `<div class="live-sub-body">${important}</div>` + legend, 'events')}</div>
</div>
<div class="row" id="strip">
  <div class="col"><div class="lab">汇总条（含角球）</div>${phone(strip, 'strip')}</div>
</div>
<div class="row" id="docked-ns">
  <div class="col"><div class="lab">动画直播 · 竖屏投放 · 未开赛（交手 + 倒计时）</div>
    <div class="phone">
      <div class="prev-hero">
        <div class="ph-top"><span>‹</span><b>友谊赛</b><span>关注</span></div>
        ${stageBlock('ns', 'docked', cardsNsDocked)}
        <div class="ph-teams"><div>威尔士<br><small>主队</small></div><div class="mid"><div>VS</div><small>18:00 开赛</small><button class="hero-anim-live is-on">动画直播</button></div><div>葡萄牙<br><small>客队</small></div></div>
      </div>
      <div class="prev-tabs"><span>态度</span><span>情报</span><span>赔率</span><span>预测</span><span class="on">实时</span><span>阵容</span></div>
      <div class="fake-pane">下方赛况、数据仍可滚动查看。</div>
    </div>
  </div>
</div>
<div class="row" id="docked-live">
  <div class="col"><div class="lab">动画直播 · 竖屏投放 · 进行中（仅球场）</div>
    <div class="phone">
      <div class="prev-hero">
        <div class="ph-top"><span>‹</span><b>友谊赛</b><span>关注</span></div>
        ${stageBlock('live', 'docked', '')}
        <div class="ph-teams"><div>威尔士<br><small>主队</small></div><div class="mid"><b>0 : 1</b><small>上半场</small><button class="hero-anim-live is-on">动画直播</button></div><div>葡萄牙<br><small>客队</small></div></div>
      </div>
      <div class="prev-tabs"><span>态度</span><span>情报</span><span>赔率</span><span>预测</span><span class="on">实时</span><span>阵容</span></div>
      <div class="fake-pane">开赛后只保留 3D 球场，不再叠信息卡。</div>
    </div>
  </div>
</div>
<div class="row" id="land">
  <div class="col"><div class="lab">动画直播 · 横屏全屏</div>
    <div class="land-frame">
      <div class="anim-live-land">
        ${stageBlock('ns', 'landscape', cardsNs)}
      </div>
    </div>
  </div>
</div>
<div class="row" id="pip">
  <div class="col"><div class="lab">动画直播 · 小窗</div>
    <div class="pip-page">
      <div class="prev-hero">
        <div class="ph-top"><span>‹</span><b>友谊赛</b><span>关注</span></div>
        <div class="ph-teams"><div>威尔士<br><small>主队</small></div><div class="mid"><b>0 : 1</b><small>上半场</small><button class="hero-anim-live is-on">动画直播</button></div><div>葡萄牙<br><small>客队</small></div></div>
      </div>
      <div class="prev-tabs"><span>态度</span><span>情报</span><span>赔率</span><span>预测</span><span class="on">实时</span><span>阵容</span></div>
      ${strip}
      ${subheadEv}
      <div class="live-sub-body">${important}</div>
      <div class="anim-live-pip">
        ${stageBlock('live', 'pip', '')}
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
      elapsed: live ? 23 : undefined,
      live: !!live,
    });
  }
  mount('pitch-ns-docked', 'sunny', false);
  mount('pitch-live-docked', 'cloudy', true);
  mount('pitch-ns-landscape', 'sunny', false);
  mount('pitch-live-pip', 'cloudy', true);
  document.documentElement.setAttribute('data-preview-ready', '1');
})();
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-404-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-404-feed')) {
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
  { hash: 'docked-ns', name: 'preview-404-anim-docked-pre.png', w: 430, h: 900, sel: '#docked-ns .phone' },
  { hash: 'docked-live', name: 'preview-404-anim-docked-live.png', w: 430, h: 900, sel: '#docked-live .phone' },
  { hash: 'land', name: 'preview-404-anim-landscape.png', w: 780, h: 460, sel: '#land .land-frame' },
  { hash: 'pip', name: 'preview-404-anim-pip.png', w: 430, h: 900, sel: '#pip .pip-page' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-404-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
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
