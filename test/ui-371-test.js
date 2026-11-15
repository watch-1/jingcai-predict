'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientWx = fs.readFileSync(path.join(root, 'public/js/match-weather.js'), 'utf8');

assert.ok(/216lu22/.test(index), 'cache 216lu22');
assert.ok(!/216lu21/.test(index), 'no stale 216lu21');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.371\}"/.test(apkSh), 'apk default 2.1.5.371');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-371\}"/.test(apkSh), 'apk default 371');

assert.ok(/preview 370/.test(css), '370 css (sky/rain) left in place');
assert.ok(!/height:\s*46%/.test(css), 'cloudy is not a 46% hard cap');
assert.ok(!/wx-drift-sky/.test(css), 'no hitchy alternate sky keyframe');
assert.ok(!/infinite alternate/.test(css), 'no infinite alternate weather motion');
assert.ok(/@keyframes wx-pan-sky/.test(css) && /translate3d\(-50%/.test(css), 'one-way 50% sky pan');
assert.ok(/52s linear infinite/.test(css), 'sky pan is linear, not ease-in-out');
assert.ok(/assets\/weather\/cloudy\.webp/.test(css), 'cloudy uses a tileable plate');
assert.ok(/assets\/weather\/rain-fall\.webp/.test(css), 'atmospheric rain plate');
assert.ok(/@keyframes wx-rain-fall/.test(css), 'rain plate scrolls one way');
assert.ok(/hero-wx-rain::before/.test(css), 'rain atmosphere is a ::before plate');
assert.ok(/mix-blend-mode:\s*screen/.test(css), 'rain plate still screens');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-sky::before/.test(css), 'sky pan pauses on wx-paused');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-rain::before/.test(css), 'rain plate pauses on wx-paused');

assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(/rgb\(51 47 37\)/.test(appJs) && /rgb\(51 47 37\)/.test(css), 'Neutral B home glow');
assert.ok(/rgb\(37 47 51\)/.test(appJs) && /rgb\(37 47 51\)/.test(css), 'Neutral B away glow');
assert.ok(!/rgb\(107 90 56\)/.test(appJs) && !/rgb\(107 90 56\)/.test(css), 'no 369 harsh default glow');
assert.ok(!/HERO_GLOW_SAT = 0\.48/.test(appJs), 'no cranked 369 sat');

assert.ok(!/assets\/weather\/drops\.png/.test(appJs), 'no filled droplet sticker sheet');
assert.ok(/ensureHeroSky/.test(appJs) && /drawSkyInside/.test(appJs), 'drops sample the weather sky');
assert.ok(/HERO_SKY_SRC/.test(appJs) && /assets\/weather\/light-rain\.webp/.test(appJs), 'same sky webp as .hero-wx-sky');
assert.ok(/getComputedStyle\(sky, '::before'\)/.test(appJs), 'sky pan is read from the live ::before');
assert.ok(/source-atop/.test(appJs) && /createRadialGradient/.test(appJs), 'soft Fresnel rim + tight specular');
assert.ok(/lighter/.test(appJs), 'highlight uses lighter blending');
assert.ok(/sitting/.test(appJs) && /startSlide/.test(appJs), 'drops sit on the glass and occasionally slide');
assert.ok(/fov:/.test(appJs), 'wide-FOV / warped sky inside each bead');
assert.ok(!/rgba\(210,226,240,0\.08\)/.test(appJs), 'no pale-blue cartoon fallback fill');
assert.ok(!/vy:\s*\(18 \+ Math\.random\(\) \* 36/.test(appJs), 'no grey-balloon fall speed');
assert.ok(/classList\.contains\('wx-paused'\)/.test(appJs), 'drops pause on wx-paused');
assert.ok(/function bindHeroRainDrops/.test(appJs) && /function startHeroRain/.test(appJs), 'rain binder present');
assert.ok(/light-rain'\) return compact \? 7 : 14/.test(appJs), 'light-rain stays sparser');

assert.ok(/rectangularFlagSrc/.test(appJs), 'rectangular NT flags kept');
assert.ok(/function formatHeroRank/.test(appJs) && /小组/.test(appJs), '小组 label kept');
assert.ok(/hero-lg-block/.test(appJs), 'title+time block kept');

assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');
assert.ok(/flagcdn\.com/.test(serverJs), 'logo proxy still allows flagcdn');

const asset = (name) => path.join(root, 'public/assets/weather', name);
for (const name of ['sunny.webp', 'light-rain.webp', 'storm.webp', 'cloudy.webp', 'rain-fall.webp']) {
  assert.ok(fs.existsSync(asset(name)), 'asset ' + name);
}
assert.ok(fs.statSync(asset('sunny.webp')).size > 8000, 'sunny sky is a real plate');
assert.ok(fs.statSync(asset('cloudy.webp')).size > 8000, 'cloudy sky is a real plate');
assert.ok(fs.statSync(asset('light-rain.webp')).size > 4000, 'light-rain sky is present');
assert.ok(fs.statSync(asset('rain-fall.webp')).size > 4000, 'rain plate is present');
assert.ok(!fs.existsSync(asset('drops.png')), 'filled sticker sheet is not shipped');

const extract = (name) => {
  const re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}\\n');
  const m = appJs.match(re);
  assert.ok(m, 'extract ' + name);
  return m[0];
};
const mapStart = appJs.indexOf('const FLAG_CODE_TO_ISO2 = {');
const mapEnd = appJs.indexOf('};', mapStart);
assert.ok(mapStart >= 0 && mapEnd > mapStart, 'FLAG_CODE_TO_ISO2');
const stub = appJs.slice(mapStart, mapEnd + 2) + ';\n'
  + extract('isNationalFlagLogo')
  + extract('flagIso2FromLogo')
  + extract('flagcdnUrl')
  + extract('bundledFlagPath')
  + extract('rectangularFlagSrc');
const api = new Function(stub + '; return { isNationalFlagLogo, flagIso2FromLogo, flagcdnUrl, bundledFlagPath, rectangularFlagSrc };')();
assert.strictEqual(api.flagIso2FromLogo('https://a.espncdn.com/i/teamlogos/countries/500/arm.png'), 'am');
assert.strictEqual(api.rectangularFlagSrc('https://a.espncdn.com/i/teamlogos/countries/500/arm.png'), 'assets/flags/am.png');
assert.strictEqual(api.flagIso2FromLogo('https://a.espncdn.com/i/teamlogos/soccer/500/359.png'), '');

console.log('ui-371-test OK');
