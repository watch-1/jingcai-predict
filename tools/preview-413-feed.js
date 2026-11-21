'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PREVIEW_PORT || 8777);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function sliceBetween(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + 1);
  if (a < 0 || b <= a) throw new Error('slice missing ' + start);
  return src.slice(a, b);
}
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const box = {
  S: { calcSel: {} },
  LBL: { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } },
  esc,
  fmtOdd: function (v) {
    if (v == null || v === '' || Number.isNaN(Number(v))) return '-';
    const n = Number(v);
    return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, (m) => m.startsWith('.') ? m : '');
  },
  CRS_MORE_WIN: [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2]],
  CRS_MORE_DRAW: [[0, 0], [1, 1], [2, 2], [3, 3]],
  CRS_MORE_LOSE: [[0, 1], [1, 2], [2, 3], [0, 2], [1, 3], [2, 4], [0, 3], [1, 4], [2, 5], [0, 4], [1, 5], [0, 5]],
  crsPoolKey: function (hg, ag) { return 's' + String(hg).padStart(2, '0') + 's' + String(ag).padStart(2, '0'); },
  crsCalcSelKey: function (hg, ag) { return 'crs_s' + String(hg).padStart(2, '0') + 's' + String(ag).padStart(2, '0'); },
  calcMatchClosed: function () { return false; },
};
vm.runInNewContext(
  sliceBetween(appSrc, 'function calcMorePickCell', 'function bonusOptModes')
  + '\n'
  + sliceBetween(appSrc, 'function renderCalcMorePickables', 'function calcMoreLoadBudgetMs'),
  box
);

const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'preview-413-odds-2042905.json'), 'utf8'));
if (!snap || !snap.ok || !snap.pools) throw new Error('missing real 2042905 pools');
const m = {
  id: String(snap.matchId || '2042905'),
  home: snap.home || '布里斯班',
  away: snap.away || '悉尼FC',
  date: snap.date,
  time: snap.time,
  had: snap.pools.had,
  hhad: snap.pools.hhad,
};
const body = box.renderCalcMorePickables(m.id, snap, m);
const shell = box.calcMoreSheetShell(m, body);

const html = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>413 预览 · 更多玩法</title>
<link rel="stylesheet" href="/style.css">
<style>
  body { margin: 0; background: #1a1d24; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif; }
  .row { display: flex; gap: 24px; padding: 16px; align-items: flex-start; }
  .lab { color: #e8edf5; font-size: 13px; font-weight: 600; margin: 0 0 8px; }
  .col { display: flex; flex-direction: column; }
  .phone { width: 390px; height: 844px; background: #f6f7f9; overflow: hidden; position: relative; }
  .prev-status { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px 2px; font: 600 12px/1.2 -apple-system, sans-serif; background: #0a0b0e; color: #fff; }
  .behind { padding: 10px 12px; filter: blur(2px); opacity: .45; pointer-events: none; }
  .behind .card { background: #fff; border-radius: 10px; padding: 10px; margin-bottom: 8px; }
  #sheet.preview-sheet {
    position: absolute; left: 0; right: 0; bottom: 0; top: 24px;
    background: rgba(10, 16, 32, .45); display: flex; align-items: flex-end;
    z-index: 20;
  }
  #sheet.preview-sheet .calc-more-sheet { width: 100%; max-height: 92%; background: #eef3fb; }
</style>
</head><body>
<div class="row">
  <div class="col" id="more-plays">
    <p class="lab">计算器 · 周六004 布里斯班 vs 悉尼FC · 更多玩法（真实体彩赔率）</p>
    <div class="phone">
      <div class="prev-status"><span>14:01</span><span class="dots">•••••</span><span>14:01</span><span>117</span></div>
      <div class="behind">
        <div style="display:flex;gap:8px;padding:8px 0 12px;font-weight:700;color:#333">比分　计算器　开奖</div>
        <div class="card">布里斯班 VS 悉尼FC · 周六004<br>胜 2.35　平 3.05　负 2.60</div>
        <div class="card">让胜 5.25　让平 4.00　让负 1.43</div>
      </div>
      <div id="sheet" class="preview-sheet">
        <div class="sheet calc-more-sheet calc-more-sheet--official">${shell}</div>
      </div>
    </div>
  </div>
</div>
<script>document.documentElement.setAttribute('data-preview-ready', '1');</script>
</body></html>`;

const PREVIEW_HTML = path.join(__dirname, 'preview-413-feed.html');
fs.writeFileSync(PREVIEW_HTML, html);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/' || rel.startsWith('/preview-413-feed')) {
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

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/preview-413-feed.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-preview-ready') === '1', { timeout: 10000 });
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, 'preview-413-calc-more-plays.png');
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
  const el = await page.$('#more-plays .phone');
  if (!el) throw new Error('missing phone');
  await el.screenshot({ path: dest, type: 'png' });
  console.log('saved', dest, fs.statSync(dest).size);
  await browser.close();
  server.close();
})().catch((err) => {
  console.error(err);
  try { server.close(); } catch (_) {}
  process.exit(1);
});
