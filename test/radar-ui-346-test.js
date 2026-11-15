'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

// smId is passed through, not dropped.
const contribOf = app.slice(app.indexOf('function radarContribOf'), app.indexOf('function radarContribChipHtml'));
assert.ok(contribOf.includes('smId: c.smId'), 'radarContribOf keeps smId');
assert.ok(app.includes('function radarTeamContributors'), 'contributors helper');

// Chips with smId are buttons with data-act + data-sm (+ peer for same-axis h2h).
const chipFn = app.slice(app.indexOf('function radarContribChipHtml'), app.indexOf('function radarAxisCellHtml'));
assert.ok(chipFn.includes('data-act="radarContrib"'), 'tappable chip data-act');
assert.ok(chipFn.includes('data-sm='), 'chip carries data-sm');
assert.ok(chipFn.includes('data-peer='), 'chip carries the same-axis peer smId');
assert.ok(chipFn.includes('<button type="button"'), 'keyboard-accessible button');
assert.ok(chipFn.includes('aria-label='), 'accessible name');
assert.ok(chipFn.includes("if (!sm) return `<span class="), 'no smId: not a button, do nothing');

const axisFn = app.slice(app.indexOf('function radarAxisCellHtml'), app.indexOf('function radarTeamBoardHtml'));
assert.ok(axisFn.includes('peerSm: awayC && awayC.smId'), 'board home chip knows away peer');
assert.ok(axisFn.includes('peerSm: homeC && homeC.smId'), 'board away chip knows home peer');

const groupsFn = app.slice(app.indexOf('function radarTeamGroups'), app.indexOf('function radarTeamContributors'));
assert.ok(groupsFn.includes('peerSm: aWho && aWho.smId'), 'compare-row chips get peer smId');
assert.ok(groupsFn.includes('data-act') || groupsFn.includes('radarContribChipHtml(hWho'), 'compare who uses tappable chips');

const teamExp = app.slice(app.indexOf('function radarTeamExpandHtml'), app.indexOf('function radarPlayerExpandHtml'));
assert.ok(teamExp.includes('data-act="radarContrib"'), 'XI names are tappable');
assert.ok(teamExp.includes('class="rk-xi-name'), 'XI button class');
assert.ok(teamExp.includes('data-sm="${esc(sm)}"'), 'XI carries data-sm');
assert.ok(teamExp.includes('radarTeamGroups(team.home, team.away, { matchId: id })'), 'compare block gets matchId');

// Handler
assert.ok(app.includes("case 'radarContrib':"), 'click handler');
assert.ok(app.includes('e.stopPropagation()'), 'chip click does not fire parent radarAxisJump');
assert.ok(app.includes('function openRadarContribJump') && app.includes('function radarContribOpenState'), 'jump helpers');
assert.ok(app.includes("state.mode = 'h2h'"), 'same-axis drawable pair opens h2h');
assert.ok(app.includes("state.mode = 'pool'"), 'otherwise pool (or vacant if not drawable)');

// Back stack: 球员对照 returns to 球队对照
const back = app.slice(app.indexOf("case 'radarExpandBack':"), app.indexOf("case 'radarExpandBack':") + 450);
assert.ok(back.includes("from.kind === 'team'"), 'back uses from: team');
assert.ok(back.includes("openRadarExpand({ kind: 'team'"), 'back re-opens team page, does not dump out of the match');
assert.ok(back.includes('closeRadarExpand()'), 'without from, back still closes');

assert.ok(css.includes('cursor: pointer') && css.includes('button.rk-contrib-chip'), 'pointer cursor on chips');
assert.ok(css.includes('.rk-xi-name'), 'XI name button style');

// 345 board / 344 header / compact tiles not regress
assert.ok(app.includes('rk-radar-board') && !app.includes('function radarContribRingHtml'), 'in-flow board kept');
assert.ok(app.includes('data-act="radarExpandBack"') && app.includes('document.body.appendChild(el)'), 'team header/back kept');
const previewFn = app.slice(app.indexOf('function playerRadarPreview'), app.indexOf('function playerRadarCardHtml'));
const sizeM = previewFn.match(/compact:\s*true,\s*size:\s*(\d+)/);
assert.ok(sizeM && Number(sizeM[1]) >= 120 && Number(sizeM[1]) <= 132, 'compact tiles kept');
assert.ok(css.includes('.sm-kit.sm-value { padding: 10px 10px 8px'), '身价 tightness kept');
assert.ok(app.includes('smPlayerPhotoUrl(photo)') && app.includes('data-letter='), 'logo proxy + letter fallback');

// ---- decision logic (eval helpers with stubs) ----
const start = app.indexOf('function radarPlayerIsDrawable');
const end = app.indexOf('function radarExpandSnapshot');
assert.ok(start > 0 && end > start, 'helpers located');
const ctx = {
  radarFindPlayer(pack, smId) {
    const all = [
      ...(((pack && pack.players) || [])),
      ...((((pack && pack.drawable) || {}).home) || []),
      ...((((pack && pack.drawable) || {}).away) || []),
    ];
    return all.find((x) => String(x.smId) === String(smId)) || null;
  },
  radarDrawable(pack) {
    const d = pack && pack.drawable;
    return { home: (d && d.home) || [], away: (d && d.away) || [] };
  },
};
vm.createContext(ctx);
vm.runInContext(app.slice(start, end), ctx);

const pack = {
  drawable: {
    home: [{ smId: 11, side: 'home', scores: [90, 80] }],
    away: [{ smId: 22, side: 'away', scores: [70, 60] }],
  },
  players: [
    { smId: 11, side: 'home', scores: [90, 80] },
    { smId: 22, side: 'away', scores: [70, 60] },
  ],
};

let st = ctx.radarContribOpenState(pack, '2042', '11', 'home', '22', { kind: 'team', id: '2042' });
assert.strictEqual(st.mode, 'h2h', 'same-axis drawable pair → h2h');
assert.strictEqual(st.homeSm, '11');
assert.strictEqual(st.awaySm, '22');
assert.strictEqual(st.sm, '11');
assert.strictEqual(st.kind, 'player');
assert.strictEqual(st.from.kind, 'team');

st = ctx.radarContribOpenState(pack, '2042', '22', 'away', '11', { kind: 'team', id: '2042' });
assert.strictEqual(st.mode, 'h2h', 'tapping away still h2h');
assert.strictEqual(st.homeSm, '11');
assert.strictEqual(st.awaySm, '22');

st = ctx.radarContribOpenState(pack, '2042', '11', 'home', '999', { kind: 'team', id: '2042' });
assert.strictEqual(st.mode, 'pool', 'peer not drawable → pool, do not invent a radar');
assert.ok(!st.homeSm);

st = ctx.radarContribOpenState(pack, '2042', '11', 'home', '', null);
assert.strictEqual(st.mode, 'pool', 'XI / no peer → pool');

st = ctx.radarContribOpenState(pack, '2042', '777', 'home', '22', { kind: 'team', id: '2042' });
assert.strictEqual(st.mode, 'pool', 'tapped not drawable but smId exists → pool/vacant, not a crash');
assert.strictEqual(st.sm, '777');

assert.strictEqual(ctx.radarContribOpenState(pack, '2042', '', 'home', '22'), null, 'no smId → do nothing');
assert.strictEqual(ctx.radarContribOpenState(pack, '2042', null, 'home', '22'), null);

assert.strictEqual(ctx.radarPlayerIsDrawable(pack, 11), true);
assert.strictEqual(ctx.radarPlayerIsDrawable(pack, '22'), true);
assert.strictEqual(ctx.radarPlayerIsDrawable(pack, 777), false);
assert.strictEqual(ctx.radarPlayerIsDrawable(null, 11), false);

console.log('radar UI 346 source + logic tests OK');
