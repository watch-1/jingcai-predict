'use strict';
// 1.9.264: followed-match (关注场次) local Android goal notifications.
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
const mainJava = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');
const goalNotifyJava = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/GoalNotify.java'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const icon = fs.readFileSync(path.join(root, 'android/res/drawable/ic_notify_goal.xml'), 'utf8');

assert.ok(/VERSION=1\.9\.273/.test(ver));
assert.ok(/VERSION_CODE=309/.test(ver));
assert.ok(/jc-v1\.9\.273/.test(swJs));
assert.strictEqual(pkg.version, '1.9.273');
assert.strictEqual(cfg.version, '1.9.273');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.273\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-309\}"/.test(apkSh));

// --- native bridge + permission + channel ---
assert.ok(/POST_NOTIFICATIONS/.test(manifest), 'Android 13 notification permission');
assert.ok(/android:launchMode="singleTop"/.test(manifest), 'singleTop so tap reuses activity');
assert.ok(/GOAL_CHANNEL = "goal_alerts"/.test(mainJava), 'notification channel id');
assert.ok(/进球提醒/.test(mainJava), 'Chinese channel / title');
assert.ok(/requestNotifyPermission/.test(mainJava), 'JS → request permission');
assert.ok(/hasNotifyPermission/.test(mainJava), 'JS → permission probe');
assert.ok(/void notifyGoal\(String json\)/.test(mainJava), 'JS → local notify');
assert.ok(/__tickFavGoalPoll/.test(mainJava), 'native bg heartbeat pokes JS poll');
assert.ok(/R\.drawable\.ic_notify_goal/.test(goalNotifyJava) || /R\.drawable\.ic_notify_goal/.test(mainJava), 'small icon');
assert.ok(/vector/.test(icon), 'notification icon drawable');
assert.ok(/putExtra\("match_id"/.test(goalNotifyJava) || /putExtra\("match_id"/.test(mainJava), 'tap extra for match');
assert.ok(/location\.hash=/.test(mainJava), 'tap navigates WebView hash');
assert.ok(/if \(!hasGoalNotifyPermission\(\)\) return;/.test(mainJava), 'denied permission is graceful no-op');

// --- web client wiring ---
assert.ok(/function favGoalAlertDecision\(/.test(appJs), 'dedupe decision helper');
assert.ok(/function notifyFavGoalsFromScores\(/.test(appJs), 'score-diff notifier');
assert.ok(/function ensureFavGoalPoll\(/.test(appJs), 'followed-match poller');
assert.ok(/function requestFavGoalNotifyPermission\(/.test(appJs), 'permission request wrapper');
assert.ok(/bridge\.notifyGoal\(JSON\.stringify\(payload\)\)/.test(appJs), 'bridge notify call');
assert.ok(/JingcaiChrome\.requestNotifyPermission/.test(appJs), 'bridge permission call');
assert.ok(/if \(!IS_APP\) return;/.test(appJs.match(/function notifyFavGoalsFromScores[\s\S]*?^function /m)[0]),
  'web build no-ops notify');
assert.ok(/if \(!IS_APP\) \{ stopFavGoalPoll\(\); return; \}/.test(appJs), 'web build does not start extra poller');
assert.ok(/notifyFavGoalsFromScores\(prevScores, S\.liveScores\)/.test(appJs), 'reuse loadLiveScores merge');
assert.ok(/requestFavGoalNotifyPermission\(\)/.test(appJs), 'request on first need');
assert.ok(/window\.__tickFavGoalPoll = tickFavGoalPoll/.test(appJs), 'native can poke poll tick');
assert.ok(/document\.hidden/.test(appJs.match(/addEventListener\('visibilitychange'[\s\S]{0,500}/)[0])
  && /ensureFavGoalPoll\(\)/.test(appJs.match(/addEventListener\('visibilitychange'[\s\S]{0,800}/)[0]),
  'hidden still keeps fav-goal poll');

// 1.9.263 live-score blue / separator must stay
assert.ok(/score num is-live/.test(appJs), 'live score is-live class intact');
assert.ok(/ls-sec-ft/.test(appJs), 'finished section separator intact');

// --- unit: decision + copy ---
function extractFn(name) {
  const m = appJs.match(new RegExp('function ' + name + '\\([\\s\\S]*?^\\}', 'm'));
  assert.ok(m, name + ' extractable');
  return m[0];
}
const scoreFn = extractFn('scorePairKey');
const parseFn = extractFn('parseScorePairKey');
const decFn = extractFn('favGoalAlertDecision');
const copyFn = extractFn('buildFavGoalNotifyCopy');
const hintFn = extractFn('lastCachedGoalHint');
assert.ok(scoreFn && parseFn && decFn && copyFn && hintFn, 'helpers extractable');

const ctx = {};
vm.createContext(ctx);
vm.runInContext([scoreFn, parseFn, decFn, copyFn, hintFn].join('\n'), ctx);

assert.strictEqual(ctx.scorePairKey(2, 1), '2-1');
assert.strictEqual(ctx.scorePairKey(null, 1), null);
const parsed = ctx.parseScorePairKey('3-2');
assert.strictEqual(parsed.h, 3);
assert.strictEqual(parsed.a, 2);

// first sight: seed, never notify
assert.strictEqual(ctx.favGoalAlertDecision(null, { homeScore: 1, awayScore: 0 }, false).action, 'seed');
// same score: skip
assert.strictEqual(ctx.favGoalAlertDecision('1-0', { homeScore: 1, awayScore: 0 }, true).action, 'skip');
// home goal
const g1 = ctx.favGoalAlertDecision('1-0', { homeScore: 2, awayScore: 0 }, true);
assert.strictEqual(g1.action, 'notify');
assert.strictEqual(g1.key, '2-0');
// away goal
const g2 = ctx.favGoalAlertDecision('2-0', { homeScore: 2, awayScore: 1 }, true);
assert.strictEqual(g2.action, 'notify');
assert.strictEqual(g2.awayScore, 1);
// VAR / score drop: seed, no notify
assert.strictEqual(ctx.favGoalAlertDecision('2-1', { homeScore: 1, awayScore: 1 }, true).action, 'seed');
// already watching (poller saw no/0 score) then 1-0 → notify
const liveFirst = ctx.favGoalAlertDecision(null, { homeScore: 1, awayScore: 0 }, true);
assert.strictEqual(liveFirst.action, 'notify');
// no score yet
assert.strictEqual(ctx.favGoalAlertDecision(null, { homeScore: null, awayScore: null }, false).action, 'watch');

const copy = ctx.buildFavGoalNotifyCopy('曼城', '利物浦', 2, 1, 67, '哈兰德');
assert.strictEqual(copy.title, '进球提醒');
assert.ok(/曼城 2-1 利物浦/.test(copy.body));
assert.ok(/哈兰德/.test(copy.body));
assert.ok(/67'/.test(copy.body));

const hint = ctx.lastCachedGoalHint({
  events: [
    { kind: 'yellow', player: 'A' },
    { kind: 'goal', playerZh: '萨拉赫', elapsed: 88 },
  ],
});
assert.strictEqual(hint.player, '萨拉赫');
assert.strictEqual(hint.minute, 88);

console.log('ui-264-test OK');
