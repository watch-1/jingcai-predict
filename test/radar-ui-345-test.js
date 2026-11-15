'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

// ---- structure: in-flow board, no absolute ring ----
assert.ok(app.includes('function radarTeamBoardHtml'), 'board helper');
assert.ok(app.includes('function radarAxisCellHtml'), 'axis cell helper');
assert.ok(app.includes('class="rk-radar-board"'), 'board class in HTML');
assert.ok(app.includes('class="rk-axis-col left"'), 'left axis column');
assert.ok(app.includes('class="rk-axis-col right"'), 'right axis column');
assert.ok(app.includes('class="rk-hex"'), 'center hex cell');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 0, 'top'"), 'i=0 top 进攻终结');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 1, 'ru'"), 'i=1 right-upper 机会创造');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 2, 'rl'"), 'i=2 right-lower 控球推进');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 3, 'bot'"), 'i=3 bottom 抢断拦截');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 4, 'll'"), 'i=4 left-lower 身体对抗');
assert.ok(app.includes("radarAxisCellHtml(dims, contrib, 5, 'lu'"), 'i=5 left-upper 防守贡献');
assert.ok(app.includes('rk-axis-title'), 'full axis title in the cell');
assert.ok(app.includes('rk-axis-chips') && app.includes('radarContribChipHtml'), 'chips (avatar+name) inside the cell');
assert.ok(app.includes('hideLabels: true'), 'expand SVG has no axis/contributor text');

const teamExp = app.slice(app.indexOf('function radarTeamExpandHtml'), app.indexOf('function radarPlayerExpandHtml'));
assert.ok(teamExp.includes('radarTeamBoardHtml('), 'expand page uses the in-flow board');
assert.ok(!teamExp.includes('radarContribRingHtml'), 'no absolute ring helper on expand');
assert.ok(!/style="left:/.test(teamExp), 'no left:% positioning in expand HTML');
assert.ok(!app.includes('function radarContribRingHtml'), 'absolute ring helper removed');
assert.ok(!app.includes('rk-contrib-ring'), 'no rk-contrib-ring markup');
assert.ok(!app.includes('rk-contrib-slot'), 'no rk-contrib-slot markup');
assert.ok(!/left:\$\{x/.test(app) && !/top:\$\{y/.test(app), 'no left/top percent ring math');

assert.ok(css.includes('.rk-radar-board'), 'board CSS');
assert.ok(css.includes('minmax(0, 1fr)'), 'side columns minmax(0, 1fr)');
assert.ok(/minmax\(\s*140px\s*,\s*min\(\s*280px/.test(css), 'hex column minmax(140px, min(280px, …))');
assert.ok(/overflow:\s*hidden/.test(css.slice(css.indexOf('.rk-radar-board'), css.indexOf('.rk-radar-board') + 700)), 'board overflow hidden');
assert.ok(css.includes('min-width: 0'), 'min-width 0 present');
assert.ok(css.includes('safe-area-inset-left') && css.includes('safe-area-inset-right'), 'horizontal safe-area padding');
assert.ok(css.includes('box-sizing: border-box'), 'border-box');
assert.ok(!css.includes('.rk-contrib-ring'), 'ring CSS gone');
assert.ok(!css.includes('.rk-contrib-slot'), 'slot CSS gone');
assert.ok(!css.includes('translate(-104%'), 'no outward translate that escaped the viewport');
assert.ok(!css.includes('.rk-radar-stage'), 'absolute stage CSS gone');
assert.ok(/\.rk-contrib-chip\s*\{[^}]*max-width:\s*100%/.test(css), 'chips max-width 100%');
assert.ok(/\.rk-contrib-chip\s*\{[^}]*overflow:\s*hidden/.test(css), 'chips clip internally');
assert.ok(/\.rk-contrib-chip \.rk-av\s*\{[^}]*flex:\s*none/.test(css), 'avatar flex:none stays visible');
assert.ok(/\.rk-hex \.radar-svg(?:\.lg)?\s*,?\s*(?:\.rk-hex \.radar-svg\.lg)?\s*\{[^}]*max-width:\s*280px/.test(css)
  || css.includes('max-width: 280px'), 'hex scales, max 280');
assert.ok(app.includes('bindRadarBoardFit') && app.includes('hex.clientWidth'), 'ResizeObserver keeps svg size <= center column');

// ---- no regressions from 344 ----
const previewFn = app.slice(app.indexOf('function playerRadarPreview'), app.indexOf('function playerRadarCardHtml'));
const sizeM = previewFn.match(/compact:\s*true,\s*size:\s*(\d+)/);
assert.ok(sizeM && Number(sizeM[1]) >= 120 && Number(sizeM[1]) <= 132, 'compact player tile still ~126');
assert.ok(previewFn.includes('class="meta"') && previewFn.includes('rk-chip'), 'one-line meta + winger chip');
const cardFn = app.slice(app.indexOf('function playerRadarCardHtml'), app.indexOf('function paintMatchRadar'));
assert.ok(!cardFn.includes('暂按前锋对照'), 'no duplicate winger badge in section');
assert.ok(app.includes('document.body.appendChild(el)'), 'expand page on body');
assert.ok(app.includes('data-act="radarExpandBack"') && app.includes('closeRadarExpand()'), 'back button');
const teamCard = app.slice(app.indexOf('function teamRadarCardHtml'), app.indexOf('function radarCoverageOf'));
assert.ok(!teamCard.includes('contributors:') && !teamCard.includes('radarTeamBoardHtml'), 'data-tab team radar has no contributor stacks');
assert.ok(app.includes('smPlayerPhotoUrl(photo)') && app.includes('data-letter=') && app.includes('onerror='), 'logo proxy + letter fallback');
assert.ok(css.includes('.sm-kit.sm-value { padding: 10px 10px 8px'), '身价 tightness kept');

console.log('radar UI 345 source tests OK');

// ---- layout check in headless Chrome, if available ----
function findChrome() {
  const cands = [
    process.env.CHROME,
    '/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of cands) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function axisCell(pos, title, home, away, style) {
  const st = style ? ' style' : '';
  return `<div class="rk-axis-cell ${pos}${st}">
    <div class="rk-axis-title">${title}</div>
    <div class="rk-axis-chips">
      <span class="rk-contrib-chip h"><span class="rk-av xs letter">${home[0]}</span><span class="nm">${home}</span></span>
      <span class="rk-contrib-chip a"><span class="rk-av xs letter">${away[0]}</span><span class="nm">${away}</span></span>
    </div>
  </div>`;
}

function boardHtml() {
  // Long-ish short names (4 glyphs + ellipsis) matching radarClipName(..., 4)
  return `<div class="rk-radar-board">
    ${axisCell('top', '进攻终结', '马丁内斯', '扎拉扎尔')}
    <div class="rk-axis-col left">
      ${axisCell('lu', '防守贡献', '塞内西', '布埃诺')}
      ${axisCell('ll', '身体对抗', '帕斯', '宾尼亚斯')}
    </div>
    <div class="rk-hex"><div class="radar-wrap lg">
      <svg class="radar-svg lg" viewBox="0 0 280 280" role="img" aria-label="双方球队六围">
        <polygon points="140,30 249,85 249,195 140,250 31,195 31,85" fill="none" stroke="#e2e5ee" stroke-width="1.15"/>
        <polygon points="140,60 210,100 210,180 140,220 70,180 70,100" fill="rgba(91,124,250,.30)" stroke="#5b7cfa" stroke-width="2.1"/>
      </svg>
    </div></div>
    <div class="rk-axis-col right">
      ${axisCell('ru', '机会创造', '西梅翁', '卡诺比')}
      ${axisCell('rl', '控球推进', '马丁内斯', '阿劳雷')}
    </div>
    ${axisCell('bot', '抢断拦截', '帕斯', '乌加特', true)}
  </div>`;
}

const chrome = findChrome();
if (!chrome) {
  console.log('radar UI 345 layout check SKIPPED (no Chrome)');
  process.exit(0);
}

const widths = [320, 360, 390, 414];
const phones = widths.map((w) => `
  <section class="phone" data-w="${w}" style="width:${w}px;margin:0;padding:0;background:#F5F7FB;position:relative;">
    ${boardHtml()}
  </section>`).join('') + `
  <section class="phone lgfont" data-w="360" data-font="lg" style="width:360px;margin:0;padding:0;background:#F5F7FB;position:relative;">
    ${boardHtml()}
  </section>`;

const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${css}
/* simulate a larger Android system font on one fixture */
.phone.lgfont .rk-axis-title { font-size: 18px; }
.phone.lgfont .rk-contrib-chip { font-size: 16px; }
html, body { margin: 0; padding: 0; background: #fff; }
</style>
</head>
<body>
${phones}
<script>
(function () {
  const slop = 0.75;
  const results = [];
  document.querySelectorAll('.phone').forEach((phone) => {
    const board = phone.querySelector('.rk-radar-board');
    const br = board.getBoundingClientRect();
    const overflows = [];
    const sels = '.rk-axis-cell, .rk-axis-title, .rk-contrib-chip, .rk-av, .rk-axis-col, .rk-hex, .radar-svg';
    phone.querySelectorAll(sels).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const left = r.left - br.left;
      const right = r.right - br.right;
      const over = (left < -slop) || (right > slop);
      if (over) {
        overflows.push({
          cls: el.className,
          text: (el.textContent || '').trim().slice(0, 24),
          left: +left.toFixed(2),
          right: +right.toFixed(2),
          w: +r.width.toFixed(2),
          boardW: +br.width.toFixed(2),
        });
      }
    });
    // titles must not be emptied / fully clipped: each title has a non-zero height and some visible width
    const titles = [...phone.querySelectorAll('.rk-axis-title')].map((t) => ({
      t: t.textContent.trim(),
      w: t.getBoundingClientRect().width,
      h: t.getBoundingClientRect().height,
    }));
    const missingTitle = titles.filter((t) => t.w < 4 || t.h < 4 || !t.t);
    // avatars visible
    const avs = [...phone.querySelectorAll('.rk-av')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width < 12 || r.height < 12;
    });
    results.push({
      w: phone.getAttribute('data-w'),
      font: phone.getAttribute('data-font') || 'normal',
      boardW: +br.width.toFixed(2),
      ok: overflows.length === 0 && missingTitle.length === 0 && avs.length === 0,
      overflows,
      missingTitle,
      tinyAvatars: avs.length,
    });
  });
  const pre = document.createElement('pre');
  pre.id = 'layout-result';
  pre.textContent = JSON.stringify(results, null, 2);
  document.body.appendChild(pre);
})();
</script>
</body></html>`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rk345-'));
const file = path.join(dir, 'board.html');
const outFile = path.join(dir, 'out.html');
fs.writeFileSync(file, html);

const r = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--window-size=900,2000',
  '--virtual-time-budget=4000',
  '--dump-dom',
  'file://' + file,
], { encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024 });

if (r.status !== 0) {
  console.error(r.stderr && r.stderr.slice(-1000));
  assert.fail('chrome layout run failed, status ' + r.status);
}
const dump = (r.stdout || '') + (r.stderr || '');
const m = dump.match(/<pre id="layout-result">([\s\S]*?)<\/pre>/);
assert.ok(m, 'chrome dumped layout-result');
const raw = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const results = JSON.parse(raw);
fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
const bad = results.filter((x) => !x.ok);
if (bad.length) {
  console.error(JSON.stringify(bad, null, 2));
}
assert.strictEqual(bad.length, 0, 'no axis/chip box overflows the board at 320/360/390/414 or large font');
assert.strictEqual(results.length, 5, 'checked 4 widths + large font');
console.log('radar UI 345 layout tests OK', results.map((x) => x.w + (x.font === 'lg' ? 'lg' : '') + '@' + x.boardW).join(', '));
