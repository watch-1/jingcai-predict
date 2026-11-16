'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const wx = require('../lib/match-weather');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const gen377 = fs.readFileSync(path.join(root, 'tools/gen-weather-377.py'), 'utf8');

assert.ok(/216lu33/.test(index), 'cache 216lu33');
assert.ok(!/216lu32/.test(index), 'no stale 216lu32');
assert.ok(/app\.js\?v=216lu33/.test(index), 'app.js cache-busted');
assert.ok(/style\.css\?v=216lu33/.test(index), 'style cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.382\}"/.test(apkSh), 'apk default 2.1.5.382');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-382\}"/.test(apkSh), 'apk default 382');

assert.ok(/preview 380/.test(css), '380 weather notes are in CSS');
assert.ok(/@keyframes wx-pan-sky/.test(css) && /translate3d\(-50%/.test(css), 'transform pan fallback is kept');
assert.ok(/52s linear infinite/.test(css), 'fallback sky pan is linear');
assert.ok(!/animation:\s*wx-pan-sky-tile/.test(css), 'WebView-hostile background-position tile pan is not used');
assert.ok(!/@keyframes\s+wx-pan-sky-tile/.test(css), 'tile keyframes are retired');
assert.ok(/--wx-pan-x/.test(css) && /is-js-pan/.test(css), 'clouds move via JS-driven transform');
assert.ok(/function tickWxPan/.test(appJs) && /function ensureWxPanLoop/.test(appJs), 'rAF pan loop exists');
assert.ok(/wxPosMod/.test(appJs) && /WX_SKY_PAN_MS = 52000/.test(appJs), 'sky wrap is a tile-width modulo, not a keyframe reset');
assert.ok(/--wx-rain-x/.test(css) && /--wx-rain-y/.test(css), 'rain/storm fall is also a transform, not background-position');
assert.ok(/WX_RAIN_DRIFT/.test(appJs) && /storm:/.test(appJs), 'storm rain plate is driven by the same loop');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-sky::before/.test(css), 'CSS fallback still pauses on wx-paused');
assert.ok(/classList\.contains\('wx-paused'\)/.test(appJs), 'JS pan honors wx-paused');
assert.ok(/if \(!off\) ensureWxPanLoop/.test(appJs), 'motion restarts when the match is visible');

const extractNamed = (src, name) => {
  const startAsync = src.indexOf('async function ' + name);
  const start = src.indexOf('function ' + name);
  let from = start;
  if (startAsync >= 0 && (start < 0 || startAsync < start)) from = startAsync;
  assert.ok(from >= 0, 'found ' + name);
  let i = src.indexOf('{', from);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  assert.fail('unterminated ' + name);
};

function ruleBody(hay, needle) {
  const i = hay.indexOf(needle);
  assert.ok(i >= 0, 'found rule ' + needle);
  const open = hay.indexOf('{', i);
  const close = hay.indexOf('}', open);
  assert.ok(open >= 0 && close > open, 'braces for ' + needle);
  return hay.slice(i, close + 1);
}

const sunnyAfter = ruleBody(css, '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::after');
assert.ok(/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyAfter), 'fixed sun lives on ::after');
assert.ok(/animation:\s*none/.test(sunnyAfter), 'sun layer is not animated');
assert.ok(/sx, sy = 0\.78, 0\.30/.test(gen377), 'sun stays at 0.78, 0.30');

const sunnyBefore = ruleBody(css, '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::before');
assert.ok(/sunny-clouds\.webp/.test(sunnyBefore), 'sunny ::before pans the cloud plate');
assert.ok(!/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyBefore), 'sun plate is not on the panning ::before');

assert.ok(!/hero-wx-drops/.test(css), 'no lens droplet canvas CSS');
assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(/softPatchMatchHero/.test(appJs), 'tab/status updates patch the hero in place');
assert.ok(/Never remount the hero/.test(appJs) || /softPatchMatchHero\(x\)/.test(appJs), 'refreshDetailTabs uses soft patch');
assert.ok(/softPatchMatchHero/.test(extractNamed(appJs, 'refreshDetailTabs')), 'refreshDetailTabs does not remount hero');
assert.ok(/bundledCrestFor\(logo, tid, opts\)/.test(appJs), '378 packed crests kept');
assert.ok(/object-fit:\s*contain\s*!important/.test(css), 'NT flags still contain');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + css), 'no token in the public pack');

/* SM documents thunderstorm / thunderstorm with light rain / thunderstorm
   with rain as weather types. Because SM does have a thunder type, heavy
   rain stays type rain / 大雨 — do not invent a thunderstorm visual. */
assert.ok(/SM already has a thunder type/.test(fs.readFileSync(path.join(root, 'lib/match-weather.js'), 'utf8')), 'mapping comment records that SM has thunder');
assert.strictEqual(wx.mapDescription('thunderstorm').type, 'storm');
assert.strictEqual(wx.mapDescription('thunderstorm').labelZh, '雷暴');
assert.strictEqual(wx.mapDescription('thunderstorm with light rain').type, 'storm');
assert.strictEqual(wx.mapDescription('thunderstorm with rain').type, 'storm');
assert.strictEqual(wx.mapDescription('heavy intensity rain').type, 'rain');
assert.strictEqual(wx.mapDescription('heavy intensity rain').labelZh, '大雨');
assert.strictEqual(wx.mapWmo(65).type, 'rain');
assert.strictEqual(wx.mapWmo(65).labelZh, '大雨');
assert.strictEqual(wx.mapWmo(82).type, 'rain');
assert.strictEqual(wx.mapWmo(95).type, 'storm');
assert.strictEqual(wx.mapWmo(96).type, 'storm');

console.log('ui-380-test OK', { version: '2.1.5.382', cache: '216lu33' });
