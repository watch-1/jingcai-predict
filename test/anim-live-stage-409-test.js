'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pitch = require('../public/js/pitch-live.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const version = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');

assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.ok(!app.includes("js/pitch-live.js?v=pitch408"));
assert.strictEqual((index.match(/216mf401/g) || []).length, 6, 'index cache stamp stays 216mf401');
assert.ok(/VERSION=2\.1\.5\b/.test(version) && /VERSION_CODE=332\b/.test(version));

/* ---- A: finished match tears down the 3D stage; 410 keeps the 直播 button for recap ---- */
assert.ok(app.includes('function isAnimLiveClosedPhase'));
assert.ok(app.includes('function canOpenAnimLive'));
assert.ok(app.includes('function closeAnimLiveIfFinished'));
assert.ok(app.includes('function animLiveWantPitch'));
assert.ok(app.includes('const liveOn = isAnimLiveOn(id)'));
assert.ok(!app.includes("const animLiveBtn = finished ? '' :"));
assert.ok(app.includes('try { closeAnimLiveIfFinished(id); } catch (_) {}'));
assert.ok(app.includes('if (nowFin) { try { closeAnimLiveIfFinished(x.id, x); } catch (_) {} }'));
assert.ok(app.includes('if (isMatchFinished(x) || isAnimLiveClosedPhase(x)) { try { closeAnimLiveIfFinished(x.id, x); } catch (_) {} }'));
assert.ok(app.includes('已完成'), 'isMatchFinished recognizes 已完成');
assert.ok(app.includes('tearDownAnimLiveModes(id, true)') || app.includes("tearDownAnimLiveModes(key, true)"));
assert.ok(app.includes('restoreAppOrientation()'));
assert.ok(app.includes('teardownOverlayEl') || app.includes('#overlay-scroll-guard') || app.includes("overlay-scroll-guard"));

const finStart = app.indexOf('function isMatchFinished');
const finEnd = app.indexOf('function predictPrematchQuery');
const liveStart = app.indexOf('function isAnimLiveOn');
const liveEnd = app.indexOf('function animLiveModeOf');
assert.ok(finStart > 0 && liveStart > 0 && liveEnd > liveStart);

const calls = [];
const box = {
  S: {
    animLiveOn: { m1: true, m2: true },
    liveStatsCache: {
      m1: { ok: true, finished: true, status: { short: 'FT' }, score: { home: 1, away: 1 } },
    },
    liveScores: { m3: { finished: true, phaseZh: '完场' } },
  },
  isMatchFinished: null,
  matchByPitchId: function (id) {
    if (id === 'm1') return { id: 'm1', full: '1:1', status: '完场' };
    if (id === 'm2') return { id: 'm2', status: '进行中' };
    return { id: id };
  },
  syncHeroAnimLive: function (id) { calls.push('sync:' + id); },
  document: {
    getElementById: function (id) {
      if (String(id).indexOf('hero-anim-stage') === 0 || String(id).indexOf('anim-live-stage') === 0 || String(id).indexOf('pitch-live') === 0) {
        return { classList: { remove: function () {} }, innerHTML: 'stage', querySelector: function () { return null; } };
      }
      if (String(id).indexOf('match-hero') === 0) {
        return {
          classList: { remove: function () { calls.push('hero-class'); } },
          querySelector: function () { return { remove: function () { calls.push('btn-removed'); } }; },
        };
      }
      return null;
    },
  },
};
box.isMatchFinished = function (x) {
  vm.runInNewContext(app.slice(finStart, finEnd) + '\nthis._r = isMatchFinished(x);', Object.assign({}, box, { x: x, S: box.S }));
  return box._lastFin;
};
// bind isMatchFinished properly
vm.runInNewContext(
  app.slice(finStart, finEnd) + '\nthis.isMatchFinished = isMatchFinished;\n'
  + app.slice(liveStart, liveEnd),
  box
);
assert.strictEqual(box.isMatchFinished({ status: '已完成', id: 'z' }), true);
assert.strictEqual(box.isMatchFinished({ full: '0:1', id: 'z' }), true);
assert.strictEqual(box.isMatchFinished({ status: '完场', id: 'z' }), true);
assert.strictEqual(box.isMatchFinished({ id: 'live', status: 'Selling' }), false);
assert.strictEqual(box.isAnimLiveClosedPhase({ id: 'm1', full: '1:1', status: '完场' }), true);
assert.strictEqual(box.isAnimLiveClosedPhase({ id: 'open', status: '进行中' }), false);
assert.strictEqual(box.canOpenAnimLive({ id: 'm1', full: '1:1', status: '完场' }), true, 'FT still opens recap');
assert.strictEqual(box.canOpenAnimLive({ id: 'open', status: '进行中' }), true);

const closed = box.closeAnimLiveIfFinished('m1');
assert.strictEqual(closed, true);
assert.strictEqual(box.S.animLiveOn.m1, false);
assert.ok(calls.includes('sync:m1'), 'finished close reuses syncHeroAnimLive / teardown path');
assert.ok(!calls.includes('btn-removed'), '完场后保留直播按钮');

const kept = box.closeAnimLiveIfFinished('m2', { id: 'm2', status: '进行中' });
assert.strictEqual(kept, false);
assert.strictEqual(box.S.animLiveOn.m2, true, 'in-play live is not torn down');

const ftShort = box.isAnimLiveClosedPhase({ id: 'p', status: { short: 'AET' } });
assert.strictEqual(ftShort, true);
assert.strictEqual(box.isAnimLiveClosedPhase({ id: 'p2', status: { short: 'PEN' } }), true);

/* ---- B: continuous ball with official coords winning; out-of-play may sit ---- */
assert.ok(typeof pitch.stepSimBall === 'function');
assert.ok(typeof pitch.officialOutOfPlay === 'function');
assert.ok(pitch.isOutOfPlayKind('corner'));
assert.ok(pitch.isOutOfPlayKind('throw-in'));
assert.ok(pitch.isOutOfPlayKind('Goal Kick'));
assert.ok(pitch.isOutOfPlayKind('touch'));
assert.ok(!pitch.isOutOfPlayKind('shot_on'));
assert.ok(pitch.officialOutOfPlay({ events: [{ kind: 'corner' }] }));
assert.ok(pitch.officialOutOfPlay({ lastPoint: { x: 0.99, y: 0.05, kind: 'corner' } }));
assert.ok(!pitch.officialOutOfPlay({ events: [{ kind: 'corner' }, { kind: 'shot_on' }] }), 'taken corner then a shot is in play');
assert.ok(!pitch.officialOutOfPlay({ events: [{ kind: 'subst' }] }));

const sit = pitch.stepSimBall(
  { x: 0.02, y: 0.02, vx: 0.3, vy: 0.2 },
  { outOfPlay: true, official: { x: 0.02, y: 0.02 } },
  0.05
);
assert.strictEqual(sit.mode, 'dead');
assert.ok(Math.hypot(sit.x - 0.02, sit.y - 0.02) < 1e-9, 'out of play sits at restart spot');

const official = pitch.stepSimBall(
  { x: 0.40, y: 0.50, vx: 0, vy: 0 },
  { officialActive: true, official: { x: 0.42, y: 0.51 } },
  0.016
);
assert.strictEqual(official.mode, 'official');
assert.ok(Math.abs(official.x - 0.42) < 1e-9 && Math.abs(official.y - 0.51) < 1e-9);

let st = { x: 0.50, y: 0.50, vx: 0, vy: 0, side: 'home' };
const origin = { x: st.x, y: st.y };
for (let i = 0; i < 50; i++) {
  const players = pitch.simulatedPlayersAt(i * 0.04, { ball: st, attackingSide: st.side || 'home' });
  const next = pitch.stepSimBall(st, { attackingSide: st.side || 'home', players: players }, 0.04);
  const jump = Math.hypot(next.x - st.x, next.y - st.y);
  assert.ok(jump <= pitch.SIM_BALL_MAX_V * 0.04 * 1.3 + 1e-6, 'no teleport during coast');
  assert.ok(!next.player && !next.playerZh, 'does not invent a named holder');
  st = next;
}
assert.ok(st.simulated);
assert.ok(Math.hypot(st.x - origin.x, st.y - origin.y) > 0.02, 'ball keeps moving when official coords are stale');
assert.ok(st.mode === 'dribble' || st.mode === 'tackle', st.mode);

const players = pitch.simulatedPlayersAt(1, { ball: { x: 0.6, y: 0.5 }, attackingSide: 'home' });
const supported = pitch.applySimBallSupport(players, { x: 0.6, y: 0.5 }, { mode: 'dribble', side: 'home' });
assert.strictEqual(supported.length, 22);
assert.ok(supported.every((p) => Math.hypot(p.x - 0.6, p.y - 0.5) >= 0.02), 'support players stay off the ball');
const jumped = players.filter((p, i) => Math.hypot(p.x - supported[i].x, p.y - supported[i].y) > 0.6);
assert.strictEqual(jumped.length, 0);

console.log('anim-live-stage-409-test ok');
