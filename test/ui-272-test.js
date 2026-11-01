'use strict';
// 1.9.272: date-strip fit on narrow phones, slightly lighter list type, splash lockup still.
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

assert.ok(/VERSION=1\.9\.272/.test(ver));
assert.ok(/VERSION_CODE=308/.test(ver));
assert.ok(/jc-v1\.9\.272/.test(swJs));
assert.strictEqual(pkg.version, '1.9.272');
assert.strictEqual(cfg.version, '1.9.272');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.272\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-308\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.272.md')));
assert.ok(/package="com\.tiicai\.jingcai"/.test(androidManifest), 'package id unchanged');
assert.ok(/android:versionCode="308"/.test(androidManifest));
assert.ok(/android:versionName="1\.9\.272"/.test(androidManifest));
assert.ok(/<string name="app_name">云球迷<\/string>/.test(strings), 'name 云球迷');

// 1) date strip — fluid pills, shared schedule + results
assert.ok(/--dstrip-pill:\s*clamp\(48px,\s*17vw,\s*64px\)/.test(css), 'fluid pill width');
assert.ok(/--dstrip-side:\s*max\(10px,\s*env\(safe-area-inset-left/.test(css), 'safe-area side pad');
assert.ok(/--dstrip-gap:\s*clamp\(4px/.test(css), 'fluid gap');
assert.ok(/dstrip-wd/.test(appJs) && /dstrip-wd/.test(css), 'weekday wrapper');
assert.ok(/keep immediate neighbor pills/.test(appJs), 'neighbor-visible scroll');
assert.ok(/_dstripResizeBound/.test(appJs), 'resize recenters strip');
assert.ok(/h \+= dateStrip\(dates, S\.schDate, 'sdate'\)/.test(appJs), 'schedule still uses dateStrip');
assert.ok(/dateStrip\(model\.dates, S\.rsDate, 'rdate'\)/.test(appJs), '开奖 still uses dateStrip');
assert.ok(/function fillDateStripDays/.test(appJs), 'calendar pad kept');
assert.ok(/overflow-x:\s*auto/.test(css.match(/\.dstrip \{[\s\S]*?^\}/m)[0]), 'horizontal scroll kept');

// 2) phone type slightly lighter — list/card names only
const phoneMq = css.match(/@media \(max-width:\s*479px\) \{[\s\S]*?^\}/m);
assert.ok(phoneMq, 'phone media query');
assert.ok(/font-weight:\s*600/.test(phoneMq[0]) && /font-synthesis:\s*none/.test(phoneMq[0]),
  'phone names 600 + no synthetic bold');
assert.ok(/\.mc-teams \.t \.n/.test(phoneMq[0]) && /\.ls-body \.nm/.test(phoneMq[0]),
  'primary list/card names');
// scores stay heavy
assert.ok(/\.mc-mid \.score[\s\S]*font-weight:\s*800/.test(css), 'scores stay 800');

// 3) splash lockup pinned — no late inset / font swap
const crit = html.match(/<style id="critical-chrome">([\s\S]*?)<\/style>/);
assert.ok(crit, 'critical chrome');
assert.ok(/bottom:56px/.test(crit[1]) && /width:40px/.test(crit[1]) && /gap:10px/.test(crit[1]),
  'critical lockup 40/10/56');
assert.ok(/data-boot="1"/.test(html), 'data-boot from first paint');
assert.ok(/decoding="sync"/.test(html) && /fetchpriority="high"/.test(html), 'icon reserved + high priority');
assert.ok(/icons\/icon-192\.png/.test(html), 'Design G icon-192 unchanged');
assert.ok(/bottom:56px/.test(css) && /font-synthesis:\s*none/.test(css.match(/\.boot-brand-name\{[\s\S]*?\}/)[0]),
  'CSS lockup pinned, no synth bold');
assert.ok(!/env\(safe-area-inset-bottom/.test(css.match(/\.boot-brand\{[\s\S]*?\}/)[0]),
  'splash ignores late bottom inset');
assert.ok(/sans-serif", Typeface\.BOLD/.test(main), 'native typeface matches HTML sans-serif 700');
assert.ok(/setLetterSpacing\(0\.02f\)/.test(main), 'native letter-spacing matches CSS');
assert.ok(/bottomMargin = dp\(56\)/.test(main), 'native bottom 56dp');
assert.ok(/ic_launcher/.test(main), 'native still uses launcher art');
assert.ok(!/JPUSH_APPKEY=/.test(main), 'JPush wiring untouched');

// 271 geometry invariants
assert.ok(/--match-mid-col:\s*120px/.test(css), 'desktop mid token remains 120px');
assert.ok(/clamp\(76px,\s*22vw,\s*100px\)/.test(css), 'phone mid col fluid');
assert.ok(/match-meta-fav/.test(css) && /match-meta-time/.test(css), 'fav time alignment kept');
assert.ok(/-webkit-line-clamp:\s*2/.test(css), 'full names wrap');
assert.ok(/POST_NOTIFICATIONS/.test(androidManifest), 'notify permission kept');
assert.ok(/goal_alerts/.test(main), 'goal channel id kept');

console.log('ui-272-test OK');
