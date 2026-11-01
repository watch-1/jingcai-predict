'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.270/.test(ver));
assert.ok(/VERSION_CODE=306/.test(ver));
assert.ok(/jc-v1\.9\.270/.test(swJs));
assert.strictEqual(pkg.version, '1.9.270');
assert.strictEqual(cfg.version, '1.9.270');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.270\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-306\}"/.test(apkSh));

// Live 0-0 with empty events must NOT be treated as a perpetual events gap.
const retryFnSrc = appJs.match(/function liveStatsNeedsEventsRetry\(live, x\) \{[\s\S]*?\n\}/)?.[0];
const behindFnSrc = appJs.match(/function liveStatsEventsBehindScore\(live, x\) \{[\s\S]*?\n\}/)?.[0];
const tallyFnSrc = appJs.match(/function liveStatsGoalCountFromEvents\(events\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(retryFnSrc && behindFnSrc && tallyFnSrc, 'events-retry helpers extractable');
assert.ok(
  !/live\.live && st\.elapsed/.test(retryFnSrc),
  'live elapsed alone must not force the events spinner (0-0 empty timeline is a legit empty state)'
);

const ctx = { console, eventGoalKind: (e) => e.goalKind || 'goal' };
vm.createContext(ctx);
vm.runInContext(`${tallyFnSrc}\n${behindFnSrc}\n${retryFnSrc}`, ctx);
const needsRetry = (live, x) => ctx.liveStatsNeedsEventsRetry(live, x);

// Everton–Newcastle case: live 11', score 0-0, successful fetch, empty events.
const live00 = {
  ok: true,
  live: true,
  status: { short: '1H', elapsed: 11 },
  score: { home: 0, away: 0 },
  events: [],
};
assert.ok(!needsRetry(live00, { id: 1, score: '0:0' }), 'live 0-0 empty events: no retry gate, show 暂无事件');
assert.ok(!needsRetry(live00, null), 'live 0-0 without fixture row: still no retry gate');
assert.ok(
  !needsRetry({ ...live00, status: { short: '2H', elapsed: 67 } }, { id: 1 }),
  'late-game 0-0 with no cards/subs: still legit empty'
);

// Real gaps keep the retry/spinner behavior (1.9.242 Frosinone–Lecce style).
assert.ok(
  needsRetry({ ...live00, score: { home: 1, away: 0 } }, { id: 1 }),
  'goals in score but empty events: retry'
);
assert.ok(
  needsRetry({ ...live00, score: { home: null, away: null } }, { id: 1, homeScore: 2, awayScore: 0 }),
  'fixture score has goals, events empty: retry'
);
assert.ok(
  needsRetry({ ...live00, eventsError: '上游错误' }, { id: 1 }),
  'eventsError: retry'
);
assert.ok(
  needsRetry({ ...live00, eventsScoreGap: true }, { id: 1 }),
  'server eventsScoreGap flag: retry'
);
assert.ok(
  needsRetry({
    ok: true,
    live: false,
    status: { short: 'FT' },
    score: { home: 2, away: 1 },
    events: [{ id: 'g1', kind: 'goal', goalKind: 'goal', side: 'home', elapsed: 30 }],
  }, { id: 1 }),
  'events behind non-zero score: retry'
);
assert.ok(!needsRetry({ ok: false, live: true, events: [] }, { id: 1 }), 'failed payload handled elsewhere');

// eventsTabHtml empty branch: spinner only when eventsGap, otherwise 暂无事件 copy.
const emptyBranch = appJs.match(/const empty = !rows\.length[\s\S]*?: '';/)?.[0];
assert.ok(emptyBranch, 'eventsTabHtml empty branch extractable');
assert.ok(/eventsGap\s*\n?\s*\?[\s\S]*事件加载中…/.test(emptyBranch), 'spinner copy gated on eventsGap');
assert.ok(/暂无事件记录（未开赛、无数据源或尚未产生进球\/牌\/换人）。/.test(emptyBranch), 'empty copy for no-gap case');

console.log('ui-243-test OK');
