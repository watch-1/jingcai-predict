'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const clientWx = fs.readFileSync(path.join(root, 'public/js/match-weather.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const wxLib = fs.readFileSync(path.join(root, 'lib/match-weather.js'), 'utf8');

assert.ok(/216lu19/.test(index), 'cache 216lu19');
assert.ok(!/216lu18/.test(index), 'no stale 216lu18');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.368\}"/.test(apkSh), 'apk default 2.1.5.368');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-368\}"/.test(apkSh), 'apk default 368');

assert.ok(/preview 368/.test(css), '368 css section');
assert.ok(!/rgba\(210, 218, 230/.test(css), 'no translucent cloudy veil');
assert.ok(!/rgba\(16, 18, 24, \.08\)/.test(css), 'no cloudy alpha scrim');
assert.ok(/rgb\(66 69 74\)/.test(css), 'opaque cloudy stop');
assert.ok(/repeating-linear-gradient\(\s*105deg/.test(css), 'rain is ~15° from vertical');
assert.ok(!/repeating-linear-gradient\(\s*-18deg/.test(css), 'no near-horizontal rain bars');
assert.ok(/animation: wx-drift 14s/.test(css), 'rain/storm skies drift visibly');
assert.ok(/@keyframes wx-bolt/.test(css), 'branching bolt keyframes');
assert.ok(/html\.wx-paused/.test(css), 'respects wx-paused');
assert.ok(!/@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}hero-wx-sky/.test(css),
  'does not freeze hero weather on prefers-reduced-motion alone');

assert.ok(/'rain'/.test(appJs) && /MATCH_WEATHER_TYPES = \['neutral', 'sunny', 'cloudy', 'light-rain', 'rain', 'storm'\]/.test(appJs),
  'rain is a first-class weather type');
assert.ok(!/t === 'rain' \|\| t === 'lightrain'/.test(appJs), 'rain is not collapsed to light-rain');

assert.ok(/type: 'rain', labelZh: '中雨'/.test(clientWx), 'client WMO 中雨 is rain, not storm');
assert.ok(/weatherPrefetchJob/.test(serverJs), 'server weather prefetch hook');
assert.ok(/prefetchWeather/.test(wxLib) && /match-weather\.db/.test(wxLib), 'persistent weather db');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');

console.log('ui-368-test OK');
