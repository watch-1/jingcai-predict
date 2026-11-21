'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const coords = require('../lib/sm-ball-coords');
const pitch = require('../public/js/pitch-live.js');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const clientJs = fs.readFileSync(path.join(__dirname, '../public/js/pitch-live.js'), 'utf8');
const libJs = fs.readFileSync(path.join(__dirname, '../lib/sm-ball-coords.js'), 'utf8');

/* --- weather mapping (unknown → neutral; 大雨 is rain, not storm) --- */
assert.strictEqual(pitch.weatherType('sunny'), 'sunny');
assert.strictEqual(pitch.weatherType('cloudy'), 'cloudy');
assert.strictEqual(pitch.weatherType('light-rain'), 'light-rain');
assert.strictEqual(pitch.weatherType('rain'), 'rain');
assert.strictEqual(pitch.weatherType('storm'), 'storm');
assert.strictEqual(pitch.weatherType('neutral'), 'neutral');
assert.strictEqual(pitch.weatherType(''), 'neutral');
assert.strictEqual(pitch.weatherType(null), 'neutral');
assert.strictEqual(pitch.weatherType('unknown-xyz'), 'neutral');
assert.strictEqual(pitch.weatherType('fog'), 'cloudy');
assert.strictEqual(pitch.weatherType('mist'), 'cloudy');
assert.strictEqual(pitch.weatherType('clear'), 'sunny');
assert.strictEqual(pitch.weatherType('heavy-rain'), 'rain');
assert.strictEqual(pitch.weatherType('heavyrain'), 'rain');
assert.strictEqual(pitch.weatherType('大雨'), 'neutral'); // typographic raw; official map is English type
assert.strictEqual(pitch.weatherType('thunderstorm'), 'storm');
assert.strictEqual(pitch.weatherType('thunder'), 'storm');

/* --- kickoff gate: no live anim before kickoff / 未开赛 --- */
const future = Date.now() + 3600e3;
const past = Date.now() - 3600e3;
assert.strictEqual(pitch.canAnimateLive({ phase: 'NS', kickoffMs: future }, Date.now()), false);
assert.strictEqual(pitch.canAnimateLive({ phase: 'TBD', kickoffMs: future }, Date.now()), false);
assert.strictEqual(pitch.canAnimateLive({ phase: 'NS', kickoffMs: past }, past - 1000), false);
assert.strictEqual(pitch.canAnimateLive({ phase: 'NS', live: false, kickoffMs: future, now: future - 10 }, future - 10), false);
assert.ok(pitch.canAnimateLive({ phase: '1H', live: true, kickoffMs: past }, Date.now()));
assert.ok(pitch.canAnimateLive({ phase: 'LIVE', live: true, kickoffMs: past }, Date.now()));
assert.strictEqual(pitch.canAnimateLive({ phase: 'FT', finished: true, live: false, kickoffMs: past }, Date.now()), false);
assert.strictEqual(pitch.canAnimateLive({ phase: 'AET', finished: true, kickoffMs: past }, Date.now()), false);
assert.strictEqual(pitch.statusLabel({ phase: 'NS', kickoffMs: future, now: Date.now() }), '未开赛');
assert.strictEqual(pitch.statusLabel({ phase: 'FT', finished: true, phaseZh: '完场' }), '完场');
assert.strictEqual(pitch.statusLabel({ phase: '1H', phaseZh: '上半场', live: true, kickoffMs: past, hasCoords: false }), '暂无持球信息');

/* --- fail-closed empty coordinates --- */
assert.deepStrictEqual(pitch.pointsFromCoords([]), []);
assert.deepStrictEqual(pitch.pointsFromCoords(null), []);
assert.strictEqual(pitch.samplePath([], 1), null);
assert.strictEqual(pitch.mergeLastGood(null, { coords: [], hasCoords: false }).hasCoords, false);
assert.ok(pitch.mergeLastGood({ coords: [{ x: 0.5, y: 0.5, t: 1 }], hasCoords: true }, { coords: [], hasCoords: false, reason: 'no_coordinates' }).hasCoords);
assert.strictEqual(pitch.mergeLastGood({ coords: [{ x: 0.2, y: 0.3, t: 4 }], hasCoords: true }, { coords: [], ok: true, finished: true }).coords[0].x, 0.2);

/* --- normalize 0–100 vs 0–1; do not invent --- */
assert.deepStrictEqual(pitch.normalizeXY(0.4, 0.6), { x: 0.4, y: 0.6 });
assert.deepStrictEqual(coords.normalizeXY(0.4, 0.6), { x: 0.4, y: 0.6 });
assert.deepStrictEqual(coords.normalizeXY(40, 60), { x: 0.4, y: 0.6 });
assert.deepStrictEqual(pitch.normalizeXY(40, 60), { x: 0.4, y: 0.6 });
assert.strictEqual(coords.normalizeXY('bad', 1), null);
assert.ok(coords.parseTimerToSec('12:30') === 12 * 60 + 30);
assert.ok(coords.periodOffsetSec('2nd half') === 45 * 60);

const slim = coords.slimPoints([
  { x: 50, y: 50, timer: '00:01', period_id: 1 },
  { x: 60, y: 40, timer: '00:03', period_id: 1 },
], [{ id: 1, description: '1st Half' }]);
assert.strictEqual(slim.length, 2);
assert.ok(Math.abs(slim[0].x - 0.5) < 1e-9);
assert.ok(slim[1].t >= slim[0].t);

/* v10 carry exists between real points */
const a = { x: 0.3, y: 0.5, t: 0 };
const b = { x: 0.5, y: 0.5, t: 2 };
assert.ok(pitch.wantsCarry(a, b));
assert.ok(pitch.carryFracFor(a, b) >= 0.28);
const mid = pitch.samplePath([a, b], 0.4);
assert.ok(mid && mid.carrying, 'early segment is on-ground carry');
const later = pitch.samplePath([a, b], 1.6);
assert.ok(later && !later.carrying, 'later segment leaves the feet');

/* --- pause on hide / overlay / tab --- */
assert.strictEqual(pitch.shouldPause({ hidden: true }), true);
assert.strictEqual(pitch.shouldPause({ overlayOpen: true }), true);
assert.strictEqual(pitch.shouldPause({ tabVisible: false }), true);
assert.strictEqual(pitch.shouldPause({ hidden: false, overlayOpen: false, tabVisible: true }), false);

/* --- last-good on the server helper + TTL --- */
const good = { ok: true, coords: slim, hasCoords: true, finished: true, fetchedAt: 1 };
const emptyFt = coords.emptyPack({}, 'no_coordinates', 2, { ok: true, finished: true, fixtureId: 9 });
const kept = coords.mergeLastGood(good, emptyFt);
assert.ok(kept.hasCoords && kept.keptLastGood);
assert.strictEqual(kept.coords.length, 2);
assert.ok(coords.ttlFor({ finished: true, coords: slim, live: false }) === coords.FT_TTL_MS);
assert.ok(coords.ttlFor({ live: true, coords: [], finished: false }) === coords.NEGATIVE_LIVE_MS);
assert.ok(coords.ttlFor({ live: true, coords: slim, finished: false }) === coords.LIVE_TTL_MS);


/* --- getBallCoords: empty fail-closed, then keep last-good --- */
async function testGetBallCoords() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-ball-'));
  process.env.DATA_DIR = tmp;
  coords._resetForTests();

  const fxEmpty = {
    id: 1001,
    state: { developer_name: 'FT' },
    periods: [{ id: 1, description: '1st Half' }],
    ballCoordinates: [],
  };
  async function fetchEmpty() {
    return { data: fxEmpty };
  }
  const first = await coords.getBallCoords({ matchId: 'm1', smFixtureId: 1001, fetchImpl: fetchEmpty, now: 1_000, skipDisk: false, force: true });
  assert.strictEqual(first.hasCoords, false);
  assert.ok(first.reason === 'no_coordinates' || first.ok === true);

  const fxLive = {
    id: 1001,
    state: { developer_name: 'INPLAY_2ND_HALF' },
    periods: [{ id: 1, description: '1st Half' }, { id: 2, description: '2nd Half' }],
    ballCoordinates: [
      { x: 20, y: 50, timer: '10:00', period_id: 2 },
      { x: 35, y: 48, timer: '10:02', period_id: 2 },
      { x: 48, y: 51, timer: '10:04', period_id: 2 },
    ],
  };
  async function fetchFull() {
    return { data: fxLive };
  }
  const filled = await coords.getBallCoords({ matchId: 'm1', smFixtureId: 1001, fetchImpl: fetchFull, now: 50_000, skipDisk: false, force: true });
  assert.ok(filled.hasCoords, 'real coords surface');
  assert.ok(filled.coords.length >= 3);
  assert.ok(filled.coords[0].x <= 1);

  async function fetchEmptyAgain() {
    return { data: { id: 1001, state: { developer_name: 'FT' }, periods: fxLive.periods, ballCoordinates: [] } };
  }
  const after = await coords.getBallCoords({ matchId: 'm1', smFixtureId: 1001, fetchImpl: fetchEmptyAgain, now: 80_000, skipDisk: false, force: true });
  assert.ok(after.hasCoords, 'empty FT response must keep last-good snapshot');
  assert.ok(after.keptLastGood);
  assert.ok(after.coords.length >= 3);

  assert.strictEqual(coords.emptyPack({}, 'no_key', 1, { ok: false }).reason, 'no_key');
  assert.ok(!String(JSON.stringify(first) + JSON.stringify(filled) + JSON.stringify(after)).includes('api_token'));
}

testGetBallCoords().then(() => {
/* --- integration wiring (no invented client token, v9d/v10 assets, tab hook) --- */
assert.ok(app.includes('function pitchLiveShellHtml'), 'shell helper');
assert.ok(app.includes('pitchLiveShellHtml(x)'), 'pitch shell is used by the animation-live stage');
assert.ok(app.includes('hero-anim-stage') && app.includes('function syncHeroAnimLive'), 'click uses hero as 投放屏');
assert.ok(!app.includes('maybeExpandAnimLive') && !app.includes('animLiveExpand'), 'button does not auto-fullscreen');
assert.ok(app.includes("S.animLiveOn[id] = !S.animLiveOn[id]"), '动画直播 toggles the hero stage');
assert.ok(css.includes('hero-anim-stage'), 'hero stage CSS');
assert.ok(app.includes('function ensurePitchLive'), 'mount hook');
assert.ok(app.includes('data-act="openAnimLive"') && app.includes('动画直播'), 'hero 动画直播 button');
assert.ok(css.includes('hero-anim-live'), 'hero 动画直播 CSS');
assert.ok(clientJs.includes('inst.expand'), 'pitch expand API');
assert.ok(app.includes('function loadBallCoords'), 'coords loader');
assert.ok(app.includes('/sm-ball-coords?'), 'client hits server route only');
assert.ok(app.includes('teardownPitchLive'), 'teardown on tab/leave');
assert.ok(app.includes('syncPitchLiveMotion'), 'pause hook');
assert.ok(server.includes("app.get('/api/sm-ball-coords'"), 'server route');
assert.ok(server.includes("require('./lib/sm-ball-coords')"), 'server uses new lib');
assert.ok(!/SPORTMONKS_TOKEN|api_token\s*[:=]/.test(clientJs), 'client module has no token');
assert.ok(!clientJs.includes('api_token'), 'client never sends api_token');
assert.ok(css.includes('Pitch Live v9d/v10'), 'marked CSS block');
assert.ok(css.includes('aspect-ratio: 16 / 9'), 'v10 16:9 lock');
assert.ok(css.includes('object-fit: fill'), 'v10 plate fill');
assert.ok(css.includes('pitchLiveLedDrift'), 'LED soft drift');
assert.ok(css.includes('1.1s ease-in-out'), 'v9d LED crossfade');
assert.ok(!/hero-wx-rain|雨珠|droplet/i.test(css.slice(css.indexOf('Pitch Live v9d/v10'))), 'no lens droplets in pitch CSS');
assert.strictEqual((index.match(/216mf401/g) || []).length, 6, 'index.html stamp count unchanged');
assert.ok(!index.includes('js/pitch-live.js?v=216mf401'), 'new module is not a 216mf401 stamp');

for (const i of [0, 1, 2]) {
  const f = path.join(__dirname, `../public/assets/pitch/pitch45_v9d_p${i}.webp`);
  assert.ok(fs.existsSync(f), 'plate ' + i);
  assert.ok(fs.statSync(f).size < 400000, 'plate compressed');
}

/* production path must refuse preview-only demo coords */
assert.ok(clientJs.includes('previewDemoCoords') && clientJs.includes('allowPreviewDemo'), 'preview opt-in exists');
assert.ok(clientJs.includes('previewRejected'), 'production rejects demo coords');

/* LED timing */
assert.strictEqual(pitch.LED_PHASE_MS, 6000);
assert.strictEqual(pitch.LED_FADE_MS, 1100);

/* no cartoon sun on the stadium; goals project onto both mouths */
const pitchCss = css.slice(css.indexOf('.pitch-live-wx'), css.indexOf('.pitch-live-chrome'));
assert.ok(!/pl-wx-sun/.test(clientJs), 'pitch-live shell has no cartoon sun');
assert.ok(!/pl-wx-sun/.test(pitchCss), 'pitch-live weather CSS has no cartoon sun');
assert.ok(!/pl-wx-clouds/.test(clientJs), 'pitch-live shell has no cloud plate');
assert.ok(!/clouds-sunny|clouds-cloudy|pl-wx-clouds|pitchLiveClouds/.test(css.slice(css.indexOf('Pitch Live v9d/v10'))), 'pitch-live CSS has no floating clouds');
const liveCss = css.slice(css.indexOf('Pitch Live v9d/v10'));
assert.ok(!/pitchLiveFlash 22s/.test(liveCss) && !/@keyframes pitchLiveFlash/.test(liveCss), 'storm flash is no longer a fixed CSS loop');
assert.ok(liveCss.includes('sky-openings-mask.png') && liveCss.includes('pl-wx-open-sky'), 'opening sky is masked to the stadium gaps');
assert.ok(fs.existsSync(path.join(__dirname, '../public/assets/pitch/sky-openings-mask.png')), 'sky openings mask is packaged');
assert.ok(/\[data-wx="sunny"\] \.pl-wx-open-sky \{[\s\S]*#3e96df/.test(liveCss), 'sunny opening sky is bright blue');
assert.ok(clientJs.includes('pl-wx-sky-flash') && clientJs.includes('paintSkyFlash'), 'storm paints a streak in the opening sky');
assert.ok(/is-flashing \.pitch-world \{[^}]*brightness\(1\.22\)/.test(liveCss.replace(/\n/g, ' ')), 'storm flash brightens the stadium');
assert.ok(/is-flashing \.pl-wx-open-sky/.test(liveCss), 'storm flash also brightens the opening sky');
assert.ok(/:not\(\[data-wx="storm"\]\) \.pl-wx-sky-flash/.test(liveCss), 'sunny and cloudy never run lightning');
assert.ok(clientJs.includes('function armStormFlash') && clientJs.includes('burstStormFlash'), 'lightning interval is JS-random');
assert.ok(clientJs.includes('20000 + Math.random() * 40000'), 'lightning waits 20–60s');
assert.ok(clientJs.includes('pitch-bg-hold'), 'LED crossfade keeps a hold plate so the scene never drops to black');
assert.ok(!/url\([^)]*(lightning|bolt|flash)\.(png|webp|svg|gif)/i.test(liveCss), 'no in-stadium lightning graphic');
assert.ok(/\[data-wx="rain"\] \.pitch-world \{\s*filter:[^}]*brightness\(\.94\)/.test(liveCss), 'rain is not overly dark');
assert.strictEqual(typeof pitch.drawGoals, 'function');
assert.strictEqual(typeof pitch.project3, 'function');
const leftMouth = pitch.goalMouth(-1);
const rightMouth = pitch.goalMouth(1);
assert.strictEqual(leftMouth.u, 0);
assert.strictEqual(rightMouth.u, 1);
assert.ok(leftMouth.uBack < 0 && rightMouth.uBack > 1, 'nets extend behind the goal line');
const lp = pitch.project3(leftMouth.u, 0.5, 0);
const rp = pitch.project3(rightMouth.u, 0.5, 0);
const lbar = pitch.project3(leftMouth.u, 0.5, pitch.GOAL_H);
assert.ok(lp.x < 500 && rp.x > 1100, 'goal mouths sit at opposite ends');
assert.ok(lbar.y < lp.y - 8, 'crossbar sits above the goal line');

/* 403 stage hooks must not regress 402 behaviour */
assert.ok(app.includes('hero-anim-stage') && app.includes('function syncHeroAnimLive'));
assert.ok(!app.includes('maybeExpandAnimLive'));
assert.ok(app.includes('data-act="animLiveLand"') && app.includes('data-act="animLivePip"'));
assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.ok(css.includes('.anim-live-land') && css.includes('.anim-live-pip'));

console.log('pitch-live-402-test ok');
}).catch((err) => { console.error(err); process.exit(1); });
