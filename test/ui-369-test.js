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

assert.ok(/216lu20/.test(index), 'cache 216lu20');
assert.ok(!/216lu19/.test(index), 'no stale 216lu19');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.369\}"/.test(apkSh), 'apk default 2.1.5.369');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-369\}"/.test(apkSh), 'apk default 369');

assert.ok(/preview 369/.test(css), '369 css section');
assert.ok(!/\.hero-wx-rain\s*\{[^}]*repeating-linear-gradient/.test(css), 'hero rain is not a streak grid');
assert.ok(!/repeating-linear-gradient\(\s*105deg/.test(css.split('.wx-slip')[0] + css.split('.wx-slip').slice(2).join('.wx-slip').split('.wx-slip-sky-fx')[0]),
  'no 105deg streak grid outside the small weather slip');
assert.ok(/hero-wx-drops/.test(css) && /function bindHeroRainDrops/.test(appJs), 'lens droplet system present');
assert.ok(/function startHeroRain/.test(appJs) && /createRadialGradient/.test(appJs), 'droplet highlight + body');
assert.ok(/html\.wx-paused/.test(css) && /classList\.contains\('wx-paused'\)/.test(appJs), 'drops pause on wx-paused');
assert.ok(/@keyframes wx-drift-sky/.test(css), 'sky drifts without tiling a 124% stamp');
assert.ok(/background-size:\s*cover/.test(css), 'rain/storm sky uses cover');
assert.ok(/assets\/weather\/storm\.webp/.test(css), 'storm uses its own unique sky');

assert.ok(/HERO_GLOW_VAL = 0\.42/.test(appJs), 'glow value is visible');
assert.ok(/HERO_GLOW_SAT = 0\.48/.test(appJs), 'glow sat is visible');
assert.ok(/rgb\(107 90 56\)/.test(appJs) && /rgb\(107 90 56\)/.test(css), 'stronger default home glow');
assert.ok(/\.tm \.badge img/.test(appJs), 'samples any side badge image, including flags');
assert.ok(/rectangularFlagSrc/.test(appJs) && /crestSampleSrc[\s\S]{0,200}rectangularFlagSrc/.test(appJs),
  'glow sampling prefers the rectangular flag asset');
assert.ok(/hero-wx-glow" style="background:\$\{esc\(bg\)\}"/.test(appJs)
  || /hero-wx-glow" style="background:\$\{esc\(bg\)}"/.test(appJs),
  'sticky glow is painted under the weather slice');
assert.ok(!/hero-sticky-bar" style="background:\$\{esc\(bg\)\}"/.test(appJs),
  'sticky bar is not an opaque glow plate');
assert.ok(/height: 46%/.test(css) && /preview 369: cloudy/.test(css),
  'cloudy sky is clipped to the upper band');

assert.ok(/function flagIso2FromLogo/.test(appJs), 'flag iso helper');
assert.ok(/function bundledFlagPath/.test(appJs), 'bundled flag path');
assert.ok(/badge crest\$\{flagCls\}/.test(appJs), 'flag class on badge');
assert.ok(/\.hero-sticky-mid \.badge\.crest\.flag/.test(css)
  && /aspect-ratio: 3 \/ 2/.test(css), 'sticky/hero flags use a rectangular ratio');
assert.ok(/assets\/flags\/' \+ c \+ '\.png/.test(appJs), 'bundled rectangular flags');
assert.ok(fs.existsSync(path.join(root, 'public/assets/flags/fi.png')), 'finland flag asset');
assert.ok(fs.existsSync(path.join(root, 'public/assets/flags/sm.png')), 'san marino flag asset');
assert.ok(fs.existsSync(path.join(root, 'public/assets/flags/ro.png')), 'romania flag asset');
assert.ok(fs.existsSync(path.join(root, 'public/assets/flags/hr.png')), 'croatia flag asset');

assert.ok(/let h = matchStickyHero\(x, m, r\);\s*h \+= matchHero\(x, m, r/.test(appJs),
  'sticky is first in the match page so it covers the viewport top');
assert.ok(/position: absolute !important/.test(css)
  && /\.hero-sticky-bar > \*:not\(\.hero-sticky-bg\)/.test(css),
  'sticky weather layer fills the compact bar');
assert.ok(/height: calc\(var\(--sat, 0px\) \+ 52px\)/.test(css), 'sticky covers sat + 52');

assert.ok(/flagcdn\.com/.test(serverJs) && /cdn\.flagcdn\.com/.test(serverJs),
  'logo proxy allows rectangular flagcdn assets');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');

// Helpers
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

const arm = 'https://a.espncdn.com/i/teamlogos/countries/500/arm.png';
const fin = 'https://a.espncdn.com/i/teamlogos/countries/500/fin.png';
const smr = 'https://a.espncdn.com/i/teamlogos/countries/500/smr.png';
const rou = 'https://a.espncdn.com/i/teamlogos/countries/500/rou.png';
const cro = 'https://a.espncdn.com/i/teamlogos/countries/500/cro.png';
const arsenal = 'https://a.espncdn.com/i/teamlogos/soccer/500/359.png';

assert.strictEqual(api.isNationalFlagLogo(arm), true);
assert.strictEqual(api.isNationalFlagLogo(arsenal), false);
assert.strictEqual(api.flagIso2FromLogo(arm), 'am', 'armenia ISO2');
assert.strictEqual(api.flagIso2FromLogo(fin), 'fi', 'finland ISO2');
assert.strictEqual(api.flagIso2FromLogo(smr), 'sm', 'san marino ISO2');
assert.strictEqual(api.flagIso2FromLogo(rou), 'ro', 'romania ISO2');
assert.strictEqual(api.flagIso2FromLogo(cro), 'hr', 'croatia IOC CRO → hr');
assert.strictEqual(api.flagIso2FromLogo(arsenal), '', 'club logo is not a flag');
assert.strictEqual(api.rectangularFlagSrc(arm), 'assets/flags/am.png');
assert.strictEqual(api.rectangularFlagSrc(arsenal), '');
assert.strictEqual(api.flagcdnUrl('fi'), 'https://flagcdn.com/w160/fi.png');
assert.strictEqual(api.flagIso2FromLogo('https://flagcdn.com/w160/gb-eng.png'), 'gb-eng');

const rain = fs.readFileSync(path.join(root, 'public/assets/weather/light-rain.webp'));
const storm = fs.readFileSync(path.join(root, 'public/assets/weather/storm.webp'));
assert.ok(rain.length > 20000, 'light-rain sky is a unique full image, not a tiny stamp');
assert.ok(storm.length > 15000, 'storm sky is a unique full image');

console.log('ui-369-test OK');
