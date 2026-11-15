'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

// ---- t1102: compact player tiles ----
const previewFn = app.slice(app.indexOf('function playerRadarPreview'), app.indexOf('function playerRadarCardHtml'));
const sizeM = previewFn.match(/compact:\s*true,\s*size:\s*(\d+)/);
assert.ok(sizeM, 'preview sets compact size');
const tile = Number(sizeM[1]);
assert.ok(tile >= 120 && tile <= 132, 'compact svg size in 120–132, got ' + tile);
assert.ok(app.includes('const RADAR_TINY'), 'RADAR_TINY short axis labels');
assert.ok(app.includes('function radarAxisName'), 'axis name helper prefers tiny on compact');
assert.ok(css.includes('.radar-svg.sm') && css.includes('max-width: 126px'), 'css caps compact svg at 126');
assert.ok(/\.radar-svg\.sm\s*\{[^}]*overflow:\s*hidden/.test(css), 'compact svg overflow hidden');
assert.ok(/\.sm-radar-card\s*\{[^}]*overflow:\s*hidden/.test(css), 'card overflow hidden so labels cannot balloon');
assert.ok(previewFn.includes('class="meta"'), 'one-line meta kept');
assert.ok(previewFn.includes('rk-chip'), 'winger badge is a chip');
assert.ok(previewFn.includes('playerRadarMeta'), 'preview uses compact meta');

const cardFn = app.slice(app.indexOf('function playerRadarCardHtml'), app.indexOf('function paintMatchRadar'));
assert.ok(!cardFn.includes('暂按前锋对照'), 'section caption must not also say 暂按前锋对照');

// ---- t1103: expand page header always visible, back button works ----
const rootFn = app.slice(app.indexOf('function radarExpandRoot'), app.indexOf('function closeRadarExpand'));
assert.ok(rootFn.includes('document.body.appendChild(el)'), 'expand page is a child of body, not .app');
assert.ok(!rootFn.includes("document.querySelector('.app')"), 'no longer appends inside .app');

const hdrFn = app.slice(app.indexOf('function radarPageHdr'), app.indexOf('function radarTeamExpandHtml'));
assert.ok(hdrFn.includes('data-act="radarExpandBack"'), 'header back button fires radarExpandBack');
assert.ok(hdrFn.includes('class="ic-btn rk-back"'), 'back uses rk-back');
assert.ok(hdrFn.includes('I.back'), 'chevron icon');
assert.ok(hdrFn.includes('<header class="rk-hdr">'), 'header element');

const teamExp = app.slice(app.indexOf('function radarTeamExpandHtml'), app.indexOf('function radarPlayerExpandHtml'));
const hdrThenBody = /radarPageHdr\('球队对照'\)\s*\+\s*`<div class="rk-body">/.test(teamExp)
  || /radarPageHdr\('球队对照'\)\s*\+/.test(teamExp) && teamExp.includes('class="rk-body"');
assert.ok(hdrThenBody, 'header is a sibling before rk-body, not inside the scroller');
assert.ok(!/rk-body`[\s\S]*rk-hdr/.test(teamExp.replace(/radarPageHdr[\s\S]*?<\/header>`;/, '')), 'hdr not nested in body via template');
// vacant + ok paths both start with radarPageHdr then rk-body
assert.ok(teamExp.includes("radarPageHdr('球队对照') + `<div class=\"rk-body\">")
  || (teamExp.includes("radarPageHdr('球队对照')") && teamExp.includes('<div class="rk-body">')),
  'hdr + body structure');

assert.ok(/#radar-expand\.rk-page,\s*\n\.rk-page\s*\{/.test(css) || css.includes('#radar-expand.rk-page'), 'page selector includes #radar-expand');
assert.ok(css.includes('100dvh'), 'viewport height 100dvh');
assert.ok(css.includes('overflow: hidden !important'), 'page itself cannot scroll');
assert.ok(/\.rk-hdr\s*\{[^}]*flex:\s*none\s*!important/.test(css), 'header is flex:none, outside the scroller');
assert.ok(!/\.rk-hdr\s*\{[^}]*position:\s*sticky/.test(css), 'header is not sticky-inside-a-scroller');
assert.ok(/\.rk-hdr\s*\.rk-back\s*\{[^}]*width:\s*40px/.test(css)
  || /\.rk-hdr \.ic-btn,\s*\n\.rk-hdr \.rk-back\s*\{[^}]*width:\s*40px/.test(css),
  'back chevron is 40px tappable');
assert.ok(/\.rk-body\s*\{[^}]*overflow-y:\s*auto/.test(css), 'rk-body is the only scroller');
assert.ok(/\.rk-body\s*\{[^}]*min-height:\s*0/.test(css), 'rk-body can shrink in the flex column');

const renderFn = app.slice(app.indexOf('function renderRadarExpand'), app.indexOf('function openRadarExpand') > app.indexOf('function renderRadarExpand') ? app.indexOf('function openRadarExpand') : app.indexOf('function radarPageHdr'));
assert.ok(renderFn.includes("querySelector('.rk-body')"), 'render resets / scrolls rk-body');
assert.ok(renderFn.includes('body.scrollTop = 0') || renderFn.includes('scrollTop = 0'), 'opens at top of body scroller');

assert.ok(app.includes("case 'radarExpandBack':"), 'click handler for back');
const backCase = app.slice(app.indexOf("case 'radarExpandBack':"), app.indexOf("case 'radarExpandBack':") + 500);
assert.ok(backCase.includes('closeRadarExpand()'), 'radarExpandBack still closes the page');
assert.ok(backCase.includes('from.kind === \'team\'') || backCase.includes('closeRadarExpand()'), 'back closes, or returns to team if stacked');

const jump = app.slice(app.indexOf("case 'radarAxisJump'"), app.indexOf("case 'radarPlayer'"));
assert.ok(jump.includes("querySelector('.rk-body')"), 'axis jump scrolls rk-body, not the page');

assert.ok(!/size:\s*400/.test(teamExp), 'no 400px expand chart');

// ---- t1104: contributor avatars ----
assert.ok(app.includes('function radarAvatarHtml'), 'avatar helper');
assert.ok(app.includes('function radarPhotoUrl'), 'photo goes through proxy helper');
assert.ok(app.includes('smPlayerPhotoUrl(photo)'), 'reuses /api/logo proxy, no invented ESPN/TM urls');
assert.ok(app.includes('data-letter=') && app.includes('onerror='), 'missing/broken photo falls back to a letter, never a broken image');
assert.ok(app.includes('function radarContribChipHtml') && app.includes('rk-contrib-chip'), 'chip = avatar + short name');
assert.ok(app.includes('function radarClipName'), 'long names truncated');
assert.ok(app.includes("radarClipName(c.short || c.nameZh || c.name || '', 4)"), 'truncate to 4 glyphs (德斯波托夫斯基)');
assert.ok(app.includes('function radarTeamBoardHtml') || app.includes('function radarContribRingHtml'), 'expand page has contributor layout helper');
assert.ok(teamExp.includes('radarTeamBoardHtml') || teamExp.includes('rk-radar-board') || teamExp.includes('radarContribRingHtml'), 'expand page draws contributor chips');
assert.ok(!teamExp.includes('rk-radar-stage') || teamExp.includes('rk-radar-board'), 'expand uses in-flow board (or legacy stage during transition)');
assert.ok(css.includes('.rk-av.xs') && /width:\s*18px/.test(css), 'expand avatars ~18px');
assert.ok(css.includes('.rk-contrib-chip'), 'chip CSS');

const teamCard = app.slice(app.indexOf('function teamRadarCardHtml'), app.indexOf('function radarCoverageOf'));
assert.ok(!teamCard.includes('contributors:'), 'compact data-tab team chart has no contributor name stack');
assert.ok(!teamCard.includes('radarContribRingHtml'), 'compact team chart does not draw chips (avoids bloat)');
assert.ok(/size:\s*280/.test(teamCard), 'compact team radar is 280');
assert.ok(teamCard.includes('tinyLabels: true'), 'compact team uses 2-char axis names');

const groupsFn = app.slice(app.indexOf('function radarTeamGroups'), app.indexOf('function radarTeamContributors'));
assert.ok(groupsFn.includes('radarContribChipHtml'), 'compare rows under the chart show avatar + name');
assert.ok(groupsFn.includes('whoHtml: true'), 'compare who is HTML chips, not escaped plain text');

// ---- t1105: 身价 visual tighten, no calc change; overflow safety ----
assert.ok(css.includes('.sm-kit.sm-value { padding: 10px 10px 8px'), 'tighter 身价 kit padding');
assert.ok(css.includes('.sm-kit.sm-value .duel { padding: 3px 0'), 'tighter 3v3 row height');
assert.ok(css.includes('.sm-kit.sm-value .mv-top-hd {') && css.includes('margin-bottom: 4px'), 'tighter 身价最高 heading');
assert.ok(/overflow-x:\s*clip/.test(css), 'data tab clips horizontal overflow');
// 身价 JS (calculations) must be untouched — mvValueCardHtml still present, no score logic in this change.
assert.ok(app.includes('function mvValueCardHtml'), '身价 card renderer unchanged in presence');

console.log('radar UI 344 source tests OK');
