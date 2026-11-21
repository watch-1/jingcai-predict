'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pitch = require('../public/js/pitch-live.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const smBall = fs.readFileSync(path.join(root, 'lib/sm-ball-coords.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.ok(!app.includes("js/pitch-live.js?v=pitch406"));
assert.strictEqual((index.match(/216mf401/g) || []).length, 6, 'index cache stamp stays 216mf401');
assert.ok(/VERSION=2\.1\.5\b/.test(version) && /VERSION_CODE=332\b/.test(version));

/* A: icon-only 大屏 / 退出横屏, no text labels in the button body */
assert.ok(app.includes('function animLiveIconSvg'));
assert.ok(app.includes("kind === 'expand'") && app.includes("kind === 'collapse'") && app.includes("kind === 'close'"));
assert.ok(app.includes('als-ico-btn') && app.includes('als-expand'));
assert.ok(!/>\s*旋转\s*</.test(app), 'rotate control is not a text 旋转 button');
assert.ok(!/>\s*大屏\s*</.test(app) && !/>\s*全屏\s*</.test(app));
assert.ok(!/>\s*退出横屏\s*</.test(app), 'landscape exit is an icon, not the 退出横屏 text');

const icoStart = app.indexOf('function animLiveIconSvg');
const icoEnd = app.indexOf('function animLiveScorebarHtml');
assert.ok(icoStart > 0 && icoEnd > icoStart);
const icoBox = { esc: (s) => String(s == null ? '' : s) };
vm.runInNewContext(app.slice(icoStart, icoEnd), icoBox);
const dockCtrls = icoBox.animLiveCtrlsHtml('m1', 'docked');
const landCtrls = icoBox.animLiveCtrlsHtml('m1', 'landscape');
assert.ok(!dockCtrls.includes('aria-label="旋转屏幕"') && !dockCtrls.includes('als-land'), 'docked drops the duplicate rotate control');
assert.ok(dockCtrls.includes('aria-label="全屏观看"') && dockCtrls.includes('als-expand') && dockCtrls.includes('data-act="animLiveLand"'));
assert.ok((dockCtrls.match(/data-act="animLiveLand"/g) || []).length === 1);
assert.ok(!/>旋转</.test(dockCtrls) && !/>大屏</.test(dockCtrls) && !/>全屏</.test(dockCtrls));
assert.ok(landCtrls.includes('aria-label="退出横屏"') && landCtrls.includes('als-land') && landCtrls.includes('<svg'));
assert.ok(!landCtrls.includes('als-expand'), 'expand button is hidden in landscape');
assert.ok(!/>退出横屏</.test(landCtrls));
assert.ok(dockCtrls.includes('als-ctrls-end') && landCtrls.includes('data-act="animLiveLand"'));
assert.ok(pitch.EXPAND_ICON_SVG && pitch.EXPAND_ICON_SVG.includes('<svg') && pitch.EXPAND_ICON_SVG.includes('rect'));

assert.ok(css.includes('--als-face: 30px'), 'iOS face is 30px, not a 40px disc');
assert.ok(!/\.als-btn\.als-ico-btn\s*\{[^}]*min-width:\s*40px/.test(css.replace(/\n/g, ' ')));
assert.ok(css.includes('.anim-live-stage .pl-expand { display: none; }') || /anim-live-stage \.pl-expand\s*\{[^}]*display:\s*none/.test(css));
assert.ok(css.includes('als-ctrls-ios'));

/* B: leftover landscape / sticky score chip is torn down when live is on */
assert.ok(app.includes('function unstickMatchHeroForAnimLive'));
assert.ok(app.includes('function relayoutAnimLiveAfterMode'));
assert.ok(app.includes('wrap.classList.toggle(\'is-anim-live\''));
assert.ok(app.includes("wrap.classList.remove('is-hero-stuck')"));
assert.ok(app.includes('relayoutAnimLiveAfterMode(key, want)'));
const stickyFn = app.slice(app.indexOf('function syncMatchHeroSticky'), app.indexOf('function bindMatchHeroSticky'));
assert.ok(stickyFn.includes('is-anim-live') && stickyFn.includes('hero--anim-live') && stickyFn.includes("aria-hidden', 'true'"));
assert.ok(/is-anim-live[^{]*hero-sticky/.test(css.replace(/\n/g, ' ')) || css.includes('is-anim-live .hero-sticky'));
assert.ok(css.includes('visibility: hidden !important'));

/* C: exit releases orientation lock; no auto-reenter landscape */
assert.ok(app.includes('function restoreAppOrientation'));
assert.ok(app.includes("lockAnimLiveOrientation('portrait')"));
assert.ok(app.includes("lockAnimLiveOrientation('unlock')"));
assert.ok(app.includes('function markAnimLiveOrientationLocked'));
assert.ok(app.includes('S._animLiveDidLockOri = true'));
assert.ok(app.includes('S.animLiveOriIgnoreUntil'));
assert.ok(app.includes('markAnimLiveOrientationLocked()'));
assert.ok(app.includes('if (prev === \'landscape\' || (typeof S !== \'undefined\' && S._animLiveDidLockOri)) restoreAppOrientation()'));
assert.ok(app.includes('if (prev === \'landscape\') restoreAppOrientation()'), 'pip exit also restores if coming from landscape');
const teardown = app.slice(app.indexOf('function tearDownAnimLiveModes'), app.indexOf('function bindAnimLiveOrientation'));
assert.ok(teardown.includes('restoreAppOrientation()'));
const bind = app.slice(app.indexOf('function bindAnimLiveOrientation'), app.indexOf('function pitchLivePark'));
assert.ok(bind.includes('S.animLiveOriIgnoreUntil'));
assert.ok(!bind.includes("if (now && mode === 'docked') setAnimLiveMode"));
assert.ok(bind.includes("if (!now && mode === 'landscape') setAnimLiveMode(r.arg, 'docked')"));
assert.ok(app.includes('if (typeof S !== \'undefined\' && S._animLiveDidLockOri) restoreAppOrientation()'),
  'leaving the match page releases a leftover lock');

/* D: real path replay + action/attack labels; no invented players */
assert.strictEqual(pitch.PLAYHEAD_REPLAY_SEC, 8);
assert.ok(typeof pitch.pathHasReplayableMotion === 'function');
assert.ok(pitch.pathHasReplayableMotion([
  { t: 0, x: 0.40, y: 0.50 },
  { t: 4, x: 0.70, y: 0.45 },
  { t: 8, x: 0.82, y: 0.40 },
]));
assert.ok(!pitch.pathHasReplayableMotion([{ t: 1, x: 0.5, y: 0.5 }]));
assert.ok(!pitch.pathHasReplayableMotion([
  { t: 1, x: 0.50, y: 0.50 },
  { t: 2, x: 0.501, y: 0.500 },
]), 'jitter-only path is not replayed as motion');

const pts = [
  { t: 100, x: 0.40, y: 0.50 },
  { t: 104, x: 0.62, y: 0.46 },
  { t: 108, x: 0.80, y: 0.44 },
];
let playhead = pitch.startPlayhead(pts);
assert.strictEqual(playhead, 100);
const lastT = pts[pts.length - 1].t;
let looped = 0;
for (let i = 0; i < 40; i++) {
  playhead = Math.min(lastT, playhead + 0.5);
  if (playhead < lastT - pitch.PLAYHEAD_REPLAY_SEC) playhead = Math.max(playhead, lastT - pitch.PLAYHEAD_REPLAY_SEC);
  if (pitch.pathHasReplayableMotion(pts) && playhead >= lastT - 1e-4) {
    playhead = pitch.startPlayhead(pts);
    looped += 1;
  }
}
assert.ok(looped >= 1, 'playhead restarts the real window instead of sticking on the last point');
assert.ok(playhead < lastT);

const past = Date.now() - 3600e3;
assert.strictEqual(pitch.lastActionOf([{ kind: 'corner' }]).text, '角球');
assert.strictEqual(pitch.lastActionOf([{ kind: 'shot_on', player: 'Naomoto' }]).text, '射正 · Naomoto');
assert.strictEqual(pitch.lastActionOf([{ kind: 'unknown-foo' }]), null, 'unknown kinds are not labeled');
assert.strictEqual(pitch.statusLabel({
  phase: '2H', live: true, kickoffMs: past, hasCoords: true, homeName: '鹿岛鹿角', attackingSide: 'home',
  events: [{ kind: 'corner' }],
}), '鹿岛鹿角进攻 · 角球');
assert.strictEqual(pitch.statusLabel({
  phase: '2H', live: true, kickoffMs: past, hasCoords: true, points: [{ x: 0.7, y: 0.5, t: 1 }], homeName: '鹿岛鹿角',
}), '鹿岛鹿角进攻');
assert.strictEqual(pitch.statusLabel({
  phase: '2H', phaseZh: '下半场', live: true, kickoffMs: past, hasCoords: false,
}), '暂无持球信息');

assert.ok(smBall.includes("INCLUDE = 'ballCoordinates;periods;state'"));
assert.ok(!/INCLUDE = '[^']*lineup/.test(smBall) && !/INCLUDE = '[^']*lineups/.test(smBall));
assert.ok(!/INCLUDE = '[^']*playerCoordinates/.test(smBall)
  && !/INCLUDE = '[^']*formations/.test(smBall),
  'current ball-coords payload has no player positions — 无球跑动 is not available');

/* t1383/t1384 still held */
assert.ok(!app.slice(app.indexOf('function liveTabHtml'), app.indexOf('function liveTabHtml') + 900).includes('pitchLiveShellHtml(x)'));
assert.ok(!/else if \(tab === 'live'\) \{ try \{ ensurePitchLive/.test(app));
assert.ok(css.includes('.anim-live-stage[data-mode="docked"][data-phase="live"]'));
assert.ok(css.includes('#5b7cfa') && css.includes('#ff4d7a'));
const luFn = app.slice(app.indexOf('function lineupHtml'), app.indexOf('function squadSectionHtml'));
assert.ok(!luFn.includes('未收录本场，无法获取本场首发'));
assert.ok(!luFn.includes('下面是上一场实际首发，不是本场。'));

console.log('anim-live-stage-407-test ok');
