'use strict';
// 1.9.272: 云球迷 rename + Dongqiudi-style splash + schedule lottery timeline / team search.
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
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const strings = fs.readFileSync(path.join(root, 'android/res/values/strings.xml'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'android/res/values/styles.xml'), 'utf8');
const styles31 = fs.readFileSync(path.join(root, 'android/res/values-v31/styles.xml'), 'utf8');
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');
const main = fs.readFileSync(path.join(root, 'android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');

assert.ok(/VERSION=1\.9\.273/.test(ver));
assert.ok(/VERSION_CODE=309/.test(ver));
assert.ok(/jc-v1\.9\.273/.test(swJs));
assert.strictEqual(pkg.version, '1.9.273');
assert.strictEqual(cfg.version, '1.9.273');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.273\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-309\}"/.test(apkSh));
assert.ok(fs.existsSync(path.join(root, 'docs/release-1.9.272.md')));

// package id unchanged
assert.ok(/package="com\.tiicai\.jingcai"/.test(androidManifest), 'package id unchanged');
assert.ok(/android:versionCode="309"/.test(androidManifest));
assert.ok(/android:versionName="1\.9\.273"/.test(androidManifest));

// 1) display name 云球迷
assert.ok(/<string name="app_name">云球迷<\/string>/.test(strings), 'Android label 云球迷');
assert.ok(!/app_name">竞彩预测/.test(strings), 'Android label no longer 竞彩预测');
assert.strictEqual(manifest.name, '云球迷');
assert.strictEqual(manifest.short_name, '云球迷');
assert.ok(/<title>云球迷/.test(html), 'HTML title');
assert.ok(/apple-mobile-web-app-title" content="云球迷"/.test(html), 'PWA title');
assert.ok(/欢迎来到云球迷/.test(appJs), 'login welcome');
assert.ok(/<h2>云球迷<\/h2>/.test(appJs), 'about product name');
assert.ok(/\+ '云球迷'/.test(appJs) || /\+ "云球迷"/.test(appJs), 'document.title suffix');
assert.ok(!/android:label="竞彩预测"/.test(androidManifest));

// 2) splash: light, bottom brand, 3–5s, preload
assert.ok(/boot-brand-name/.test(html) && /云球迷/.test(html), 'HTML splash lockup');
assert.ok(/icons\/icon-192\.png/.test(html), 'uses shipped Design G icon');
assert.ok(/\.boot-shell\{[^}]*background:#F7F7F8/.test(css.replace(/\s+/g, '')), 'HTML splash light');
assert.ok(/align-items:flex-end/.test(css), 'brand sits at bottom');
assert.ok(/BOOT_SPLASH_MIN_MS = 3000/.test(appJs), 'min ~3s');
assert.ok(/BOOT_SPLASH_MAX_MS = 5000/.test(appJs), 'max ~5s');
assert.ok(/function preloadBootCritical/.test(appJs), 'boot preload');
assert.ok(/function markBootSplashReady/.test(appJs), 'ready gate');
assert.ok(/windowBackground">#FFF7F7F8/.test(styles), 'Android window light');
assert.ok(/windowSplashScreenBackground">#FFF7F7F8/.test(styles31), 'API31 splash light');
assert.ok(/splash_transparent/.test(styles31), 'no centered system icon');
assert.ok(/#F7F7F8/.test(main), 'WebView fill light');
assert.ok(/云球迷/.test(main) && /buildSplashRoot/.test(main), 'native bottom lockup');
assert.ok(/splash_brand_icon/.test(main), 'native splash uses Design G PNG');
assert.ok(!/#1B2A4A/.test(main.match(/static final int CHROME.*/)[0]), 'CHROME no longer navy');

// 3) schedule chrome: lottery timeline + team search
assert.ok(/h \+= dateStrip\(dates, S\.schDate, 'sdate'\)/.test(appJs), 'schedule uses dateStrip');
assert.ok(/function schSearchBarHtml/.test(appJs), 'schedule search bar');
assert.ok(/placeholder="搜索球队\/场次"/.test(appJs), 'search placeholder');
assert.ok(/function matchTeamSearchHit/.test(appJs), 'team filter');
assert.ok(/modeRows = classifiedDay\.filter\(x => matchTeamSearchHit/.test(appJs), 'filter applies to day rows');
assert.ok(/id === 'sch-team-search'/.test(appJs), 'search input wired');
assert.ok(/case 'schSearchClear'/.test(appJs), 'clear search');
assert.ok(/\.sch-search/.test(css) && /border-radius:\s*999px/.test(css), 'pill search');
assert.ok(!/if \(rName === 'schedule'\) return schDateSpindleHtml/.test(appJs), 'spindle left top chrome');
assert.ok(/tc-tabs--schedule/.test(appJs), 'schedule top tabs');
assert.ok(/function fillDateStripDays/.test(appJs), 'date strip pads calendar days');
assert.ok(/fillDateStripDays\(srcDates\)/.test(appJs), 'schedule + results use padded strip');
assert.ok(!/top-chrome--modes/.test(css), 'no stretched equal-width tabs');
assert.ok(/比分[\s\S]*计算器[\s\S]*开奖/.test(appJs.match(/if \(rName === 'schedule'\) \{[\s\S]*?return `<nav class="tc-tabs tc-tabs--schedule/)[0]), 'top order 比分 计算器 开奖');
assert.ok(!/h \+= schChannelsHtml\(\)/.test(appJs), 'no duplicate 比分/计算器 row under search');
assert.ok(/topChromeCenterHtml/.test(appJs), 'top chrome helper kept');

// match cards 1.9.266+ invariants still present
assert.ok(/--match-mid-col:\s*120px/.test(css), 'desktop mid token remains 120px');
assert.ok(/已结束/.test(appJs), 'finished separator copy');
assert.ok(/POST_NOTIFICATIONS/.test(androidManifest), 'notify permission kept');
assert.ok(/goal_alerts/.test(main), 'goal channel id kept');

assert.ok(!/sk_[A-Za-z0-9]{8,}/.test(main + apkSh), 'no invented secrets');

console.log('ui-270-test OK');
