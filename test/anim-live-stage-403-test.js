'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pitch = require('../public/js/pitch-live.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public/js/pitch-live.js'), 'utf8');

assert.strictEqual((index.match(/216mf401/g) || []).length, 6);
assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.ok(app.includes('function ensureAnimLiveStage') && app.includes('function setAnimLiveMode'));
assert.ok(app.includes('data-act="animLiveLand"') && app.includes('data-act="animLivePip"') && app.includes('data-act="animLiveClose"'));
assert.ok(app.includes('anim-live-land') && app.includes('anim-live-pip') && app.includes('anim-live-stage'));
assert.ok(!app.includes('maybeExpandAnimLive') && !app.includes('animLiveExpand'));
assert.ok(app.includes("S.animLiveOn[id] = !S.animLiveOn[id]"), 'button still toggles hero stage');
assert.ok(!/S\.animLiveOn\[id\]\s*=\s*true/.test(app.split('case \'openAnimLive\'')[1].slice(0, 500)), 'tap does not force on-only auto popup');
assert.ok(app.includes('lockAnimLiveOrientation') && app.includes('JingcaiChrome.lockOrientation'));
assert.ok(app.includes('closeAnimLiveLandscape') && app.includes('closeTopOverlay'));
assert.ok(app.includes("'anim-live-land'") && app.includes('overlay-scroll-guard'));
assert.ok(!/document\.body\.style\.overflow/.test(app.slice(app.indexOf('function setAnimLiveMode'), app.indexOf('function setAnimLiveMode') + 8000)));
assert.ok(!/#view/.test(app.slice(app.indexOf('function placeAnimLiveStage'), app.indexOf('function placeAnimLiveStage') + 2000).match(/overflow/) || ['']), 'placeAnimLiveStage does not touch #view overflow');
assert.ok(client.includes('inst.onExpand') && client.includes('onExpand !== undefined'));
assert.ok(css.includes('.anim-live-land') && css.includes('.anim-live-pip') && css.includes('.anim-live-cards'));
assert.ok(css.includes('#5b7cfa') && css.includes('#ff4d7a'));
assert.ok(!/overflow\s*:\s*hidden/.test((css.match(/body\.sheet-on\s*\{[^}]+\}/) || [''])[0] || ''));

const start = app.indexOf('function animLiveModeOf');
const end = app.indexOf('function tickAnimLiveCountdown') > start
  ? app.indexOf('function animLiveH2hPageHtml')
  : -1;
assert.ok(start > 0 && end > start, 'countdown slice');
const sandbox = {
  S: { animLiveOn: { m1: true }, animLiveMode: {} },
  esc: (s) => String(s == null ? '' : s),
};
vm.runInNewContext(
  app.slice(app.indexOf('function isAnimLiveOn'), app.indexOf('function animLiveH2hPageHtml')),
  sandbox
);
assert.strictEqual(sandbox.animLiveModeOf('m1'), 'docked');
sandbox.S.animLiveMode.m1 = 'landscape';
assert.strictEqual(sandbox.animLiveModeOf('m1'), 'landscape');
const future = Date.now() + 2 * 86400 * 1000 + 3 * 3600 * 1000 + 4 * 60 * 1000 + 5 * 1000;
const parts = sandbox.animLiveCountdownParts(future, Date.now());
assert.ok(parts && parts.days >= 2);
assert.ok(parts.hours != null && parts.mins != null && parts.secs != null);
assert.strictEqual(sandbox.animLiveCountdownParts(Date.now() - 1000, Date.now()), null, 'no invented countdown after kickoff');
assert.strictEqual(sandbox.animLivePad2(3), '03');

assert.strictEqual(pitch.canAnimateLive({ phase: 'NS', kickoffMs: Date.now() + 3600e3 }, Date.now()), false);

console.log('anim-live-stage-403-test ok');
