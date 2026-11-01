'use strict';
// 1.9.273: date strip clears the real header; splash lockup still from first paint.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const main = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');
const strings = fs.readFileSync(path.join(root, 'android/res/values/strings.xml'), 'utf8');

assert.ok(/VERSION=1\.9\.273/.test(ver));
assert.ok(/VERSION_CODE=309/.test(ver));
assert.ok(/jc-v1\.9\.273/.test(swJs));
assert.strictEqual(pkg.version, '1.9.273');
assert.strictEqual(cfg.version, '1.9.273');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.273\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-309\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.273.md')));
assert.ok(/package="com\.tiicai\.jingcai"/.test(androidManifest), 'package id unchanged');
assert.ok(/android:versionCode="309"/.test(androidManifest));
assert.ok(/android:versionName="1\.9\.273"/.test(androidManifest));
assert.ok(/<string name="app_name">云球迷<\/string>/.test(strings), 'name 云球迷');

// 1) date strip — real overlap, not clamp-only
assert.ok(/--top-chrome-h:\s*56px/.test(css), 'reserved chrome taller than 48');
assert.ok(/--top-chrome-pad/.test(css) && /padding-top:\s*var\(--top-chrome-pad/.test(css),
  'view pad follows measured header');
assert.ok(/function syncTopChromeHeight/.test(appJs), 'measure helper');
assert.ok(/window\.syncTopChromeHeight = syncTopChromeHeight/.test(appJs), 'exposed for sat inject');
assert.ok(/ResizeObserver/.test(appJs) && /bindTopChromePad/.test(appJs), 'resize + observer');
const dstripBlock = css.match(/\/\* 1\.9\.273: vertical room[\s\S]*?^\.chips /m);
assert.ok(dstripBlock, '273 dstrip block');
assert.ok(/padding:\s*10px var\(--dstrip-side\)/.test(dstripBlock[0]), '10px vertical pad');
assert.ok(/min-height:\s*58px/.test(dstripBlock[0]), 'strip min-height');
assert.ok(/min-height:\s*40px/.test(dstripBlock[0]), 'pill min-height');
assert.ok(/overflow-x:\s*auto/.test(dstripBlock[0]) && /overflow-y:\s*hidden/.test(dstripBlock[0]),
  'x-scroll still clips y, compensated by pad');
assert.ok(/padding-top:\s*10px/.test(css.match(/\.dstrip\.light \{[\s\S]*?\}/)[0]),
  'light strip pad not overridden back to 4px');
assert.ok(/h \+= dateStrip\(dates, S\.schDate, 'sdate'\)/.test(appJs), 'schedule uses dateStrip');
assert.ok(/dateStrip\(model\.dates, S\.rsDate, 'rdate'\)/.test(appJs), '开奖 uses dateStrip');
assert.ok(/syncTopChromeHeight\(\)/.test(main), 'native sat inject remasures chrome');

// 2) splash — no transform, same PNG, dp not sp, instant hide
const crit = html.match(/<style id="critical-chrome">([\s\S]*?)<\/style>/);
assert.ok(crit, 'critical chrome');
assert.ok(/padding:0 0 56px/.test(crit[1]), 'critical footer 56');
assert.ok(/transform:none/.test(crit[1]) && /position:static/.test(crit[1]), 'critical no translateX');
assert.ok(!/translateX\(-50%\)/.test(crit[1]), 'no 50% transform in first paint');
assert.ok(!/translateX\(-50%\)/.test(css.match(/\.boot-brand\{[\s\S]*?\}/)[0]), 'CSS brand no transform');
assert.ok(/padding:0 0 56px/.test(css.match(/\.boot-shell\{[\s\S]*?\}/)[0]), 'CSS shell footer 56');
assert.ok(/icons\/icon-192\.png/.test(html), 'HTML still Design G icon-192');
assert.ok(/splash_brand_icon/.test(main), 'native uses same PNG drawable');
assert.ok(!/setImageResource\(R\.mipmap\.ic_launcher\)/.test(main), 'native splash not adaptive launcher');
assert.ok(/COMPLEX_UNIT_DIP,\s*22/.test(main), 'native 22dp matches CSS 22px');
assert.ok(!/COMPLEX_UNIT_SP,\s*22/.test(main), 'native text not sp-scaled');
assert.ok(/onPageCommitVisible/.test(main), 'hide as soon as first HTML frame is visible');
assert.ok(/Instant remove/.test(main) && !/setDuration\(160\)/.test(main), 'no fade of a second lockup');
assert.ok(/bottomMargin = dp\(56\)/.test(main), 'native still 56dp');
assert.ok(fs.existsSync(path.join(root, 'android/res/drawable/splash_brand_icon.png')),
  'splash PNG shipped');
assert.ok(/data-boot="1"/.test(html), 'data-boot from first paint');

// 3) 272 invariants kept
assert.ok(/function matchNumSearchHit/.test(appJs), 'num search kept');
assert.ok(/placeholder="搜索球队\/场次"/.test(appJs), 'search placeholder kept');
assert.ok(/--match-mid-col:\s*120px/.test(css), 'desktop mid token remains 120px');
assert.ok(/match-meta-fav/.test(css) && /match-meta-time/.test(css), 'fav time alignment kept');
assert.ok(/package="com\.tiicai\.jingcai"/.test(androidManifest), 'package kept');
assert.ok(!/JPUSH_APPKEY=/.test(main), 'JPush wiring untouched');
assert.ok(/POST_NOTIFICATIONS/.test(androidManifest), 'notify permission kept');
assert.ok(/goal_alerts/.test(main), 'goal channel id kept');

console.log('ui-273-test OK');
