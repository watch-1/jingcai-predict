'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8772);
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

const evBox = {
  eventGoalKind: (e) => (e && e.goalKind) || 'goal',
  S: {},
  esc: (s) => String(s == null ? '' : s)
};
vm.runInNewContext(
  appSrc.slice(appSrc.indexOf('function eventGoalKind'), appSrc.indexOf('function eventsTabHtml'))
  + '\n'
  + appSrc.slice(appSrc.indexOf('function liveEventDedupeToken'), appSrc.indexOf('function liveSubHeadHtml')),
  evBox
);

const events = evBox.dedupeLiveEvents([
  { id: 'sm:1', smId: 1, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, player: '科亚·基塔加瓦', info: '右脚', type: 'Goal' },
  { id: 'sm:2', smId: 2, kind: 'goal', goalKind: 'goal', side: 'away', elapsed: 73, player: '科亚·基塔加瓦', info: 'Right Footed Shot', type: 'Goal' },
  { id: 'sm:3', kind: 'shot_on', side: 'away', elapsed: 73, player: '科亚·基塔加瓦' },
  { id: 'sm:4', kind: 'shot_off', side: 'away', elapsed: 73 },
  { id: 'sm:5', kind: 'corner', side: 'away', elapsed: 73 },
  { id: 'sm:6', kind: 'subst', side: 'home', elapsed: 65, player: '换上 A', assist: '换下 B' },
  { id: 'sm:7', kind: 'subst', side: 'away', elapsed: 76, player: '换上 C', assist: '换下 D' },
]);
const livePack = {
  ok: true,
  live: true,
  events,
  home: { nameZh: '鹿岛鹿角', name: '鹿岛鹿角' },
  away: { nameZh: '清水鼓动', name: '清水鼓动' },
  status: { short: '2H', elapsed: 73 },
  score: { home: 0, away: 1 },
};
const x = { id: '2042003', home: '鹿岛鹿角', away: '清水鼓动' };
const tlHtml = evBox.liveImportantHtml(x, livePack, { sub: 'events' });
const feedHtml = evBox.liveCommentHtml(x, livePack);

const badge = (n) => `<span class="badge" style="display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#3a4a6a;color:#fff;font-size:10px;font-weight:800;flex:none">${n}</span>`;
const tabs = (on) => {
  const names = ['态度', '情报', '赔率', '数据', '实时', '阵容', '预测'];
  return `<div class="dtabs prev-dtabs">${names.map((n) => `<button type="button" class="${n === on ? 'on' : ''}">${n}</button>`).join('')}</div>`;
};
const status = (t) => `<div class="prev-status"><span>${t}</span><span class="dots">•••••</span><span>19:37</span><span class="bat">117</span></div>`;

function listRow(meta, home, away, clock, score, half) {
  return `<button type="button" class="ls-row live">
    <div class="ls-meta"><span>日职 · ${meta}</span><span>18:00</span></div>
    <div class="ls-body">
      <div class="ls-side h">${badge(home.slice(0, 1))}<span class="nm">${home}</span></div>
      <div class="ls-mid">
        <div class="match-st red">${clock}</div>
        <div class="score num is-live">${score}</div>
        <div class="match-ht">上半场 ${half}</div>
      </div>
      <div class="ls-side a"><span class="nm">${away}</span>${badge(away.slice(0, 1))}</div>
    </div>
  </button>`;
}

const scorebar = () => `<div class="anim-live-scorebar">
  <div class="als-sb-side is-home">${badge('鹿')}<span class="als-sb-name">鹿岛鹿角</span></div>
  <div class="als-sb-mid"><div class="als-sb-score">0-1</div><div class="als-sb-phase">下半场 73'</div></div>
  <div class="als-sb-side is-away"><span class="als-sb-name">清水鼓动</span>${badge('清')}</div>
</div>`;
const nav = () => `<div class="hero-edge-nav"><button type="button" class="ic-btn hero-ic" aria-label="返回">‹</button><div class="hero-lg"><span class="hero-lg-name">日职</span></div><button type="button" class="fav-btn">☆</button></div>`;
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
<title>408 预览</title>
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
  .sch-head { background: #fff; padding: 10px 16px 0; }
  .sch-head h1 { margin: 0; font-size: 18px; }
  .sch-chips { display: flex; gap: 8px; padding: 10px 16px; background: #fff; overflow: auto; }
  .sch-chips span { flex: none; padding: 6px 10px; border-radius: 10px; background: #f0f2f6; font-size: 12px; color: #6a7384; }
  .sch-chips span.on { background: #3b5bdb; color: #fff; }
  .sch-filters { display: flex; gap: 8px; padding: 0 16px 10px; background: #fff; }
  .sch-filters i { padding: 4px 10px; border-radius: 999px; background: #edf0f5; font: 650 12px/1.4 sans-serif; font-style: normal; }
  .sch-filters i.on { background: #3b5bdb; color: #fff; }
  .phone .ls-row { width: 100%; border: 0; background: #fff; border-bottom: 1px solid #eceff3; padding: 10px 16px; text-align: left; }
  .phone .ls-meta { display: flex; justify-content: space-between; color: #8b93a3; font-size: 11px; margin-bottom: 6px; }
  .phone .ls-body { display: flex; align-items: center; gap: 8px; }
  .phone .ls-side { display: flex; align-items: center; gap: 6px; flex: 1; font-weight: 700; font-size: 14px; }
  .phone .ls-side.a { justify-content: flex-end; }
  .phone .ls-mid { flex: none; text-align: center; min-width: 90px; }
  .hero.hero--weather { background: linear-gradient(180deg, #7ea8c9 0%, #c5d8ea 55%, #e8eef5 100%); color: #fff; padding: 8px 16px 16px; }
  .hero .hero-score { text-align: center; font-size: 34px; font-weight: 800; }
  .hero .hero-phase { text-align: center; font-size: 13px; opacity: .9; }
  .hero .hero-teams { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
  .hero .tname { font-weight: 800; font-size: 14px; }
  .prev-dtabs { display: flex; margin: 0 !important; border-radius: 0; background: #fff; position: relative !important; top: auto !important; }
  .prev-dtabs button { flex: 1; min-width: 0; }
  .anim-btn { display: inline-flex; align-items: center; gap: 4px; margin: 8px auto 0; padding: 4px 10px; border-radius: 999px; background: rgba(12,16,26,.35); font-size: 11px; }
  .land-frame { position: relative; width: 100%; height: 354px; }
  .land-frame .anim-live-land { position: absolute; inset: 0; display: flex; }
  .feed-pane { background: #fff; padding: 8px 0 16px; min-height: 420px; }
  .hero.hero--anim-live { padding-bottom: 0; }
</style>
</head><body>
<div class="row">
  <div class="col" id="sched-clock">
    <p class="lab">1. 赛程列表：官方下半场 71'，不是 90+</p>
    <div class="phone">
      ${status('19:31')}
      <div class="sch-head"><h1>比分</h1></div>
      <div class="sch-chips"><span>昨天<br>11-19</span><span class="on">今天<br>11-20</span><span>明天<br>11-21</span></div>
      <div class="sch-filters"><i class="on">全部 8</i><i>日职 2</i></div>
      ${listRow('周五002', '柏太阳神', '千叶市原', "下半场 71'", '0 : 0', '0:0')}
      ${listRow('周五003', '鹿岛鹿角', '清水鼓动', "下半场 71'", '0 : 0', '0:0')}
    </div>
  </div>
  <div class="col" id="detail-clock">
    <p class="lab">2. 详情头部：同一场也是下半场 71'</p>
    <div class="phone">
      ${status('19:31')}
      <div class="hero hero--weather">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <span>‹</span><span>日职 · 周五003<br>2026/11/20 18:00 北京时间</span><span>☆ 关注</span>
        </div>
        <div class="hero-teams">
          <div style="text-align:center">${badge('鹿')}<div class="tname">鹿岛鹿角</div><small>主队</small></div>
          <div><div class="hero-score">0 : 0</div><div class="hero-phase">下半场 71'</div><div class="anim-btn">▷ 动画直播</div></div>
          <div style="text-align:center">${badge('清')}<div class="tname">清水鼓动</div><small>客队</small></div>
        </div>
      </div>
      ${tabs('预测')}
      <div class="detail-pane" style="padding:12px 16px;background:#fff">头部时钟与列表一致，均为官方 71'。</div>
    </div>
  </div>
  <div class="col" id="sim-docked">
    <p class="lab">3. 竖屏直播：模拟无球跑动（无真实球员坐标时）</p>
    <div class="phone view sub md-wrap is-anim-live">
      ${status('19:37')}
      <div class="hero hero--edge hero--weather hero--anim-live">
        ${nav()}
        <div class="hero-anim-stage is-on">${dockedStage('pitch-live-dock', dockCtrls)}</div>
      </div>
      ${tabs('实时')}
    </div>
  </div>
  <div class="col" id="sim-land">
    <p class="lab">4. 横屏直播：同样可见双方球员跑动</p>
    <div class="phone land">
      ${status('19:37')}
      <div class="land-frame">
        <div class="anim-live-land">${landStage}</div>
      </div>
    </div>
  </div>
  <div class="col" id="goal-tl">
    <p class="lab">5. 实时时间轴：73' 只出现一次进球，比分 0-1</p>
    <div class="phone">
      ${status('19:38')}
      <div style="background:#1d6fd4;color:#fff;padding:10px 16px;font-weight:700">鹿岛鹿角 0 : 1 清水鼓动 · 下半场 73'</div>
      ${tabs('实时')}
      <div class="feed-pane">${tlHtml}</div>
    </div>
  </div>
  <div class="col" id="goal-feed">
    <p class="lab">6. 文字直播：只有第1个进球，没有第2个进球</p>
    <div class="phone">
      ${status('19:38')}
      <div style="background:#1d6fd4;color:#fff;padding:10px 16px;font-weight:700">鹿岛鹿角 0 : 1 清水鼓动 · 下半场 73'</div>
      ${tabs('实时')}
      <div class="feed-pane">${feedHtml}</div>
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
  function mount(id) {
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
      elapsed: 73,
      live: true,
      kickoffMs: Date.now() - 98 * 60 * 1000,
      attackingSide: 'home',
      pack: { live: true, phase: '2H', hasCoords: true, coords: PATH }
    });
  }
  mount('pitch-live-dock');
  mount('pitch-live-land');
  document.documentElement.setAttribute('data-preview-ready', '1');
})();
</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-408-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-408-feed')) {
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
  { name: 'preview-408-sched-clock.png', w: 430, h: 820, sel: '#sched-clock .phone' },
  { name: 'preview-408-detail-clock.png', w: 430, h: 820, sel: '#detail-clock .phone' },
  { name: 'preview-408-sim-players-docked.png', w: 430, h: 900, sel: '#sim-docked .phone' },
  { name: 'preview-408-sim-players-landscape.png', w: 820, h: 460, sel: '#sim-land .phone' },
  { name: 'preview-408-goal-dedup-timeline.png', w: 430, h: 980, sel: '#goal-tl .phone' },
  { name: 'preview-408-goal-dedup-feed.png', w: 430, h: 980, sel: '#goal-feed .phone' },
];

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-408-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  try {
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.pitch-bg, .pitch-bg-hold')];
      return imgs.length >= 2 && imgs.every((im) => im.complete && im.naturalWidth > 0);
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
