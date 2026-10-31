'use strict';
// 1.9.265: first launch shows the real Android POST_NOTIFICATIONS sheet (no favs required).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const mainJava = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');

assert.ok(/VERSION=1\.9\.265/.test(ver));
assert.ok(/VERSION_CODE=301/.test(ver));
assert.ok(/jc-v1\.9\.265/.test(swJs));
assert.strictEqual(pkg.version, '1.9.265');
assert.strictEqual(cfg.version, '1.9.265');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.265\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-301\}"/.test(apkSh));

// Boot / first paint: request even with zero favs (must not be gated on S.favs.length)
const bootIdx = appJs.indexOf('loadLocalLists();\nloadGoalAlertSeen();');
assert.ok(bootIdx > 0, 'boot still hydrates lists first');
const bootSlice = appJs.slice(bootIdx, bootIdx + 280);
assert.ok(/if \(IS_APP\) requestFavGoalNotifyPermission\(\);/.test(bootSlice),
  'cold start requests system notify permission without waiting for favs');
assert.ok(!/S\.favs/.test(bootSlice), 'first-launch request is not gated on favorites');

// refreshAccount backup must not require favs either
assert.ok(!/if \(\(S\.favs \|\| \[\]\)\.length\) requestFavGoalNotifyPermission/.test(appJs),
  'boot/account refresh no longer waits for a favorite');
assert.ok(/if \(!on\) requestFavGoalNotifyPermission\(\);/.test(appJs),
  'favoriting still requests permission');

// Native: first onPageFinished asks; session flag prevents double sheet
assert.ok(/requestGoalNotifyPermission\(\);/.test(
  mainJava.slice(mainJava.indexOf('public void onPageFinished'), mainJava.indexOf('public void onPageFinished') + 500)
), 'native asks on first page ready');
assert.ok(/boolean notifyPermAsked/.test(mainJava), 'session already-asked flag');
const reqFn = mainJava.match(/void requestGoalNotifyPermission\(\) \{[\s\S]*?\n    \}/)[0];
assert.ok(/if \(notifyPermAsked\) return;/.test(reqFn), 'second ask this session is no-op');
assert.ok(/notifyPermAsked = true;/.test(reqFn), 'marks asked before system dialog');
assert.ok(/if \(Build\.VERSION\.SDK_INT < 33\) return;/.test(reqFn), 'older than Tiramisu no-op');
assert.ok(/POST_NOTIFICATIONS/.test(reqFn), 'real system permission, not an in-app dialog');
assert.ok(!/AlertDialog/.test(mainJava) && !/自定义/.test(mainJava),
  'no custom in-app permission dialog');

console.log('ui-265-test OK');
