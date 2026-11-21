'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const pitch = require('../public/js/pitch-live.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

assert.ok(app.includes("js/pitch-live.js?v=pitch409"));
assert.ok(!app.includes("js/pitch-live.js?v=pitch403"));

/* A: 3D live never auto-opens; 实时 tab does not host the pitch */
const liveFn = app.slice(app.indexOf('function liveTabHtml'), app.indexOf('function liveTabHtml') + 900);
assert.ok(liveFn.includes('function liveTabHtml'));
assert.ok(!liveFn.includes('pitchLiveShellHtml(x)'), 'liveTabHtml no longer embeds the 3D pitch');
assert.ok(liveFn.includes('pitch-live-in-hero-note') && liveFn.includes('isAnimLiveOn(id)'),
  'note only when the user already opened 动画直播');

assert.ok(!/else if \(tab === 'live'\) \{ try \{ ensurePitchLive/.test(app),
  'softPatchDetailTab does not auto-mount pitch on 实时');
assert.ok(!/else if \(mx && detailTabOf\(mx\.id\) === 'live'\) \{ try \{ ensurePitchLive/.test(app),
  'render does not auto-mount pitch on 实时');
assert.ok(!/if \(isAnimLiveOn\(x\.id\)\) \{ try \{ syncHeroAnimLive\(x\.id\); \} catch \(_\) \{\} \}\s*else \{ try \{ ensurePitchLive\(x\); \}/.test(app),
  'enriching 实时 does not auto-mount the pitch');

const offSync = app.slice(app.indexOf('function syncHeroAnimLive'), app.indexOf('function syncPitchLiveMotion'));
assert.ok(offSync.includes('teardownPitchLive(key, { force: true })'));
assert.ok(!offSync.includes('liveTab.insertBefore') && !offSync.includes('note.replaceWith(el)'),
  'closing 动画直播 does not move the pitch into 实时');

assert.ok(app.includes('if (!isAnimLiveOn(key)) return stopPitchLivePoll()'));
assert.ok(app.includes('tabVisible: !!onHero'));
assert.ok(!/tabVisible:\s*!!\(onLive \|\| onHero\)/.test(app));
assert.ok(app.includes("S.animLiveOn[id] = !S.animLiveOn[id]"), 'only the button toggles the stage');
assert.ok(!/S\.animLiveOn\[id\]\s*=\s*true/.test(app.split("case 'openAnimLive'")[1].slice(0, 600)));

/* B: docked stage is a coherent surface, score under pitch, no hero fight */
const start = app.indexOf('function isAnimLiveOn');
const end = app.indexOf('function bindAnimLiveSwipe');
assert.ok(start > 0 && end > start);
const sandbox = {
  S: { animLiveOn: { m1: true }, animLiveMode: {}, statsCache: {}, liveScores: {}, liveStatsCache: {}, dataCache: {} },
  esc: (s) => String(s == null ? '' : s),
  window: { JCPitchLive: { canAnimateLive: () => false } },
  document: { querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ innerHTML: '', firstElementChild: null }) },
  pitchLivePhaseOf: (x, live) => ({
    phase: (live && live.status && live.status.short) || 'NS',
    finished: !!(live && live.finished),
    live: !!(live && live.live),
    kickoffMs: x && x.kickoffMs,
  }),
  liveStatusZh: (short, elapsed) => {
    const map = { NS: '未开赛', '1H': '上半场', HT: '中场', '2H': '下半场', FT: '完场', LIVE: '进行中' };
    const lab = map[short] || short || '';
    if (elapsed != null && ['1H', '2H', 'ET', 'LIVE'].includes(short)) return lab + ' ' + elapsed + "'";
    return lab;
  },
  badge: (name) => '<span class="badge">' + String(name || '').slice(0, 1) + '</span>',
  pitchLiveShellHtml: (x) => '<section class="pitch-live" id="pitch-live-' + String((x && x.id) || '') + '"></section>',
  matchKickoffMs: (x) => (x && x.kickoffMs),
};
vm.runInNewContext(app.slice(start, end), sandbox);

const x = { id: 'm1', home: '柏太阳神', away: '千叶市原', kickoffMs: Date.now() - 40 * 60 * 1000 };
const liveIn = { ok: true, status: { short: '1H', elapsed: 40 }, live: true, score: { home: 0, away: 0 } };
const dockLive = sandbox.animLiveStageInnerHtml(x, liveIn, 'docked');
assert.ok(dockLive.includes('anim-live-scorebar'), 'docked in-play has scorebar');
assert.ok(dockLive.indexOf('anim-live-visual') < dockLive.indexOf('anim-live-scorebar'), 'score is below the visual');
assert.ok(dockLive.includes('0-0') && dockLive.includes('上半场') && dockLive.includes("40'"));
assert.ok(!dockLive.includes('anim-live-cards') && !dockLive.includes('历史交手'));

assert.ok(/\.hero\.hero--anim-live\s*>\s*\.hero-wx\s*\{[^}]*display:\s*none/.test(css.replace(/\n/g, ' ')),
  'docked live hides hero weather so the stadium is not a transparent composite');
assert.ok(/\.hero\.hero--anim-live\s*>\s*\.teams\s*\{[^}]*display:\s*none/.test(css.replace(/\n/g, ' ')),
  'docked live hides the hero score/teams so they do not fight the stage');
assert.ok(css.includes('.anim-live-stage[data-mode="docked"][data-phase="live"]'));
assert.ok(/\[data-mode="docked"\]\[data-phase="live"\] \.anim-live-visual[^{]*\{[^}]*position:\s*relative/.test(css));
assert.ok(/\.anim-live-scorebar\s*\{[^}]*position:\s*relative/.test(css)
  && /\.anim-live-scorebar\s*\{[^}]*flex:\s*none/.test(css));
assert.ok(!/\.anim-live-scorebar\s*\{[^}]*position:\s*absolute/.test(css));
assert.ok(css.includes('#5b7cfa') && css.includes('#ff4d7a'));

/* C: team attacking side fallback; no invented player or path */
assert.strictEqual(pitch.PLAYHEAD_REPLAY_SEC, 8);
assert.strictEqual(pitch.attackingSideOf([{ x: 0.78, y: 0.4, t: 10 }]), 'home');
assert.strictEqual(pitch.attackingSideOf([{ x: 0.22, y: 0.5, t: 10 }]), 'away');
assert.strictEqual(pitch.attackingSideOf([{ x: 0.5, y: 0.5, t: 10 }]), null, 'midfield is not claimed');
assert.strictEqual(pitch.attackingSideOf([], { possessionSide: 'away' }), 'away', 'explicit side wins when no coords');
assert.strictEqual(pitch.attackingSideOf([{ x: 0.8, y: 0.5, t: 1 }], { attackingSide: 'away' }), 'away', 'explicit beats last x');
assert.strictEqual(pitch.attackingSideOf([]), null);
assert.strictEqual(pitch.startPlayhead([{ t: 100, x: 0.7, y: 0.4 }, { t: 120, x: 0.8, y: 0.4 }]), 112);
assert.strictEqual(pitch.startPlayhead([{ t: 3, x: 0.7, y: 0.4 }]), 3);

const past = Date.now() - 3600e3;
assert.strictEqual(pitch.statusLabel({
  phase: '1H', live: true, kickoffMs: past, hasCoords: false, homeName: '西悉尼', attackingSide: 'home',
}), '西悉尼进攻');
assert.strictEqual(pitch.statusLabel({
  phase: '1H', live: true, kickoffMs: past, hasCoords: true, points: [{ x: 0.2, y: 0.5, t: 1 }], awayName: '阿德莱德',
}), '阿德莱德进攻');
assert.strictEqual(pitch.statusLabel({
  phase: '1H', phaseZh: '上半场', live: true, kickoffMs: past, hasCoords: false,
}), '暂无持球信息');
assert.ok(!pitch.attackStatusLabel({ homeName: '西悉尼' }, [{ x: 0.5, y: 0.5, t: 1 }]), 'do not invent a side in midfield');

/* D: 阵容 tab — no top notices, flush pane class */
const luStart = app.indexOf('function lineupHtml');
const luEnd = app.indexOf('function squadSectionHtml');
const luFn = app.slice(luStart, luEnd);
assert.ok(luFn.includes('function lineupHtml'));
assert.ok(!luFn.includes('未收录本场，无法获取本场首发'));
assert.ok(!luFn.includes('下面是上一场实际首发，不是本场。'));
assert.ok(!luFn.includes('warn-bar'));
assert.ok(luFn.includes('首发阵型'));
assert.ok(app.includes("tab === 'squad' ? ' detail-pane--lineup'"));
assert.ok(css.includes('detail-pane--lineup'));
assert.ok(/detail-pane--lineup[^{]*\{[^}]*padding-top:\s*0/.test(css)
  || /detail-pane\.detail-pane--lineup[^{]*\{[^}]*padding-top:\s*0/.test(css));

const luSandbox = {
  S: { luView: {} },
  esc: (s) => String(s == null ? '' : s),
  stampLuMarks: () => {},
  luInjHtml: () => '<div class="lu-inj">伤停</div>',
  luTeamSeg: () => '',
  luTeamOf: () => 'home',
  smListCol: () => '',
  luScrub: () => '',
  luBenchHtml: () => '',
  luBoardHtml: () => '<div class="lu-board"></div>',
};
vm.runInNewContext(app.slice(luStart, luEnd), luSandbox);
const prevLu = luSandbox.lineupHtml(
  { id: '2042879', home: '西悉尼', away: '阿德莱德' },
  {
    ok: true,
    state: 'no-event',
    prevHome: { starters: [{ name: 'A', slot: 1 }], kind: 'prev' },
    prevAway: { starters: [{ name: 'B', slot: 1 }], kind: 'prev' },
  }
);
assert.ok(prevLu.includes('首发阵型') && prevLu.includes('lu-toolbar'));
assert.ok(!prevLu.includes('未收录本场') && !prevLu.includes('下面是上一场') && !prevLu.includes('warn-bar'));
assert.ok(prevLu.indexOf('lu-toolbar') < prevLu.indexOf('lu-board') || prevLu.includes('lu-fm'));

console.log('anim-live-stage-406-test ok');
