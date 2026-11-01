'use strict';
// 1.9.267: followed-match goal push when the Android process is killed (JPush).
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
const manifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const appJava = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/JingcaiApp.java'), 'utf8');
const bootJava = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/PushBootstrap.java'), 'utf8');
const recvJava = fs.readFileSync(path.join(root, 'android/src-jpush/com/tiicai/jingcai/GoalPushReceiver.java'), 'utf8');
const pushJs = fs.readFileSync(path.join(root, 'lib/push-goals.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.ok(/VERSION=1\.9\.268/.test(ver));
assert.ok(/VERSION_CODE=304/.test(ver));
assert.ok(/jc-v1\.9\.268/.test(swJs));
assert.strictEqual(pkg.version, '1.9.268');
assert.strictEqual(cfg.version, '1.9.268');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.268\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-304\}"/.test(apkSh));

assert.ok(/android:name="\.JingcaiApp"/.test(manifest), 'Application class');
assert.ok(/JPUSH_COMPONENTS_BEGIN/.test(manifest), 'JPush merge markers');
assert.ok(/WAKE_LOCK/.test(manifest) && /VIBRATE/.test(manifest));
assert.ok(/JingcaiApp extends Application/.test(appJava));
assert.ok(/Class\.forName\("cn\.jpush\.android\.api\.JPushInterface"\)/.test(bootJava), 'JPush via reflection');
assert.ok(/extends JPushMessageReceiver/.test(recvJava));
assert.ok(/isNeedShowNotification/.test(recvJava), 'suppress duplicate JPush tray');
assert.ok(/void startPush\(/.test(mainJava));
assert.ok(/getPushRegId/.test(mainJava));
assert.ok(/isPushReady/.test(mainJava));
assert.ok(/maybeStartPush/.test(mainJava));
assert.ok(/onRequestPermissionsResult/.test(mainJava));
assert.ok(/JPUSH_APPKEY/.test(apkSh) && /prepare-jpush\.js/.test(apkSh));
assert.ok(/src-jpush/.test(apkSh));

assert.ok(/function syncPushRegistration\(/.test(appJs));
assert.ok(/function syncPushFavs\(/.test(appJs));
assert.ok(/function isNativePushReady\(/.test(appJs));
assert.ok(/window\.__onJPushRegId/.test(appJs));
assert.ok(/window\.__onJPushGoal/.test(appJs));
assert.ok(/api\('\/push\/register'/.test(appJs));
assert.ok(/api\('\/push\/favs'/.test(appJs));
assert.ok(/S\.pushEnabled && isNativePushReady\(\) && document\.hidden/.test(appJs), 'hidden + server push + native ready → skip local tray');
assert.ok(/scoreKey: d\.key/.test(appJs));
assert.ok(/极光推送/.test(appJs), 'privacy mentions JPush');

assert.ok(/app\.use\('\/api', require\('\.\/lib\/push-goals'\)\)/.test(serverJs));
assert.ok(/startWorker\(/.test(serverJs));
assert.ok(/JPUSH_APPKEY/.test(pushJs) && /JPUSH_MASTER_SECRET/.test(pushJs));
assert.ok(/api\.jpush\.cn\/v3\/push/.test(pushJs));
assert.ok(/display_foreground: '0'/.test(pushJs), 'no JPush banner in foreground');
assert.ok(/channel_id: 'goal_alerts'/.test(pushJs));
assert.ok(!/sk_[A-Za-z0-9]{8,}/.test(pushJs), 'no invented secrets');

const goalAlert = require('../lib/goal-alert');
assert.strictEqual(goalAlert.scorePairKey(2, 1), '2-1');
assert.strictEqual(goalAlert.favGoalAlertDecision(null, { homeScore: 1, awayScore: 0 }, false).action, 'seed');
assert.strictEqual(goalAlert.favGoalAlertDecision('1-0', { homeScore: 2, awayScore: 0 }, true).action, 'notify');

const ctx = {};
vm.createContext(ctx);
function extractFn(name) {
  const m = appJs.match(new RegExp('function ' + name + '\\([\\s\\S]*?^\\}', 'm'));
  assert.ok(m, name + ' extractable');
  return m[0];
}
vm.runInContext([
  extractFn('scorePairKey'),
  extractFn('parseScorePairKey'),
  extractFn('favGoalAlertDecision'),
].join('\n'), ctx);
assert.strictEqual(ctx.favGoalAlertDecision('2-1', { homeScore: 2, awayScore: 1 }, true).action, 'skip');

console.log('ui-267-test OK');
