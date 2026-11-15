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

assert.ok(/216lu24/.test(index), 'cache 216lu24');
assert.ok(!/216lu23/.test(index), 'no stale 216lu23');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.373\}"/.test(apkSh), 'apk default 2.1.5.373');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-373\}"/.test(apkSh), 'apk default 373');

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
assert.ok(!/hero-wx-drops/.test(css), 'no lens droplet canvas CSS');

assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(/rgb\(51 47 37\)/.test(appJs) && /rgb\(51 47 37\)/.test(css), 'Neutral B home glow');
assert.ok(/rgb\(37 47 51\)/.test(appJs) && /rgb\(37 47 51\)/.test(css), 'Neutral B away glow');
assert.ok(!/rgb\(107 90 56\)/.test(appJs) && !/rgb\(107 90 56\)/.test(css), 'no 369 harsh default glow');
assert.ok(!/HERO_GLOW_SAT = 0\.48/.test(appJs), 'no cranked 369 sat');

assert.ok(!/assets\/weather\/drops\.png/.test(appJs), 'no filled droplet sticker sheet');
assert.ok(!/function bindHeroRainDrops/.test(appJs), 'bindHeroRainDrops removed');
assert.ok(!/function startHeroRain/.test(appJs), 'startHeroRain removed');
assert.ok(!/function stopHeroRain/.test(appJs), 'stopHeroRain removed');
assert.ok(!/function ensureHeroSky/.test(appJs), 'ensureHeroSky removed');
assert.ok(!/drawProcedural/.test(appJs), 'drawProcedural removed');
assert.ok(!/const drawDrop/.test(appJs) && !/function drawDrop/.test(appJs), 'drawDrop removed');
assert.ok(!/hero-wx-drops/.test(appJs), 'no droplet canvas class');
assert.ok(!/HERO_SKY_SRC/.test(appJs), 'no sky-sampling sheet for beads');
assert.ok(/hero-wx-fx hero-wx-rain/.test(appJs), 'atmospheric rain host layer kept');

assert.ok(/rectangularFlagSrc/.test(appJs), 'rectangular NT flags kept');
assert.ok(/function formatHeroRank/.test(appJs) && /小组/.test(appJs), '小组 label kept');
assert.ok(/hero-lg-block/.test(appJs), 'title+time block kept');

assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');
assert.ok(/flagcdn\.com/.test(serverJs), 'logo proxy still allows flagcdn');

const extractNamed = (src, name) => {
  const start = src.indexOf('async function ' + name) >= 0 && src.indexOf('function ' + name) > src.indexOf('async function ' + name)
    ? src.indexOf('async function ' + name)
    : src.indexOf('function ' + name);
  assert.ok(start >= 0, 'found ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail('unterminated ' + name);
};
const ensureFn = extractNamed(appJs, 'ensureMatchWeather');
const fetchFn = extractNamed(appJs, 'fetchMatchWeatherApi');
const warmFn = extractNamed(appJs, 'warmupMatchWeather');
assert.ok(!/loadLiveStats/.test(ensureFn), 'ensureMatchWeather does not await loadLiveStats');
assert.ok(!/loadLiveStats/.test(fetchFn), 'fetchMatchWeatherApi does not call loadLiveStats');
assert.ok(!/JCWeather\.load/.test(ensureFn + fetchFn), 'no client Open-Meteo chain on the weather critical path');
assert.ok(/timeout:\s*timeoutMs \|\| 5000/.test(fetchFn), 'match-weather timeout is 5s');
assert.ok(!/timeout:\s*10000/.test(fetchFn + ensureFn), 'no 10s match-weather timeout');
assert.ok(/status:\s*'pending'/.test(ensureFn) && /天气读取中/.test(appJs), 'pending paints 天气读取中');
assert.ok(/warmupMatchWeather\(j\.data\)/.test(appJs), 'selling list load warms weather');
assert.ok(/warmupMatchWeather\(classifiedDay\)/.test(appJs), 'visible schedule day warms weather');
assert.ok(/concurrency\)\s*\|\|\s*3/.test(warmFn), 'warmup concurrency is modest');
assert.ok(/try \{ ensureMatchWeather\(x\); \} catch/.test(appJs), 'match-route weather is not awaited');
assert.ok(/try \{ ensureMatchWeather\(mx\); \} catch/.test(appJs), 'render weather is not awaited');

const asset = (name) => path.join(root, 'public/assets/weather', name);
for (const name of ['sunny.webp', 'light-rain.webp', 'storm.webp', 'cloudy.webp', 'rain-fall.webp']) {
  assert.ok(fs.existsSync(asset(name)), 'asset ' + name);
}
assert.ok(fs.statSync(asset('sunny.webp')).size > 8000, 'sunny sky is a real plate');
assert.ok(fs.statSync(asset('cloudy.webp')).size > 8000, 'cloudy sky is a real plate');
assert.ok(fs.statSync(asset('light-rain.webp')).size > 4000, 'light-rain sky is present');
assert.ok(fs.statSync(asset('rain-fall.webp')).size > 4000, 'rain plate is present');
assert.ok(!fs.existsSync(asset('drops.png')), 'filled sticker sheet is not shipped');


const enrichFn = extractNamed(appJs, 'enrichMatchDetail');
const oddsFn = extractNamed(appJs, 'loadOddsSnapshot');
const slateWarmFn = extractNamed(appJs, 'warmupMatchOddsAndReports');
assert.ok(!/await loadLiveStats/.test(enrichFn), 'enrichMatchDetail does not await loadLiveStats');
assert.ok(/loadLiveStats\(x\)\.then/.test(enrichFn), 'kicked-off live-stats runs in the background');
assert.ok(/refreshDetailTabs/.test(enrichFn), 'hero / tabs refresh when live-stats arrives');
const wxAt = enrichFn.indexOf('ensureMatchWeather');
const predAt = enrichFn.indexOf('loadPredictReport');
const oddsAt = enrichFn.indexOf('loadOddsSnapshot');
const liveAt = enrichFn.indexOf('loadLiveStats(x)');
assert.ok(wxAt >= 0 && wxAt < liveAt, 'weather starts before live-stats');
assert.ok(predAt >= 0 && predAt < liveAt, 'predict-report starts before live-stats');
assert.ok(oddsAt >= 0 && oddsAt < liveAt, 'odds-snapshot starts before live-stats');
assert.ok(/const reportP/.test(enrichFn) && /const oddsP/.test(enrichFn), 'odds and predict start in parallel');
assert.ok(/await oddsP/.test(enrichFn) && /await Promise\.all\(\[reportP, oddsP\]\)/.test(enrichFn), 'tabs await the in-flight odds/report promises');
assert.ok(/if \(!started\)/.test(oddsFn) && /\/odds-snapshot\?matchId=/.test(oddsFn), 'after kickoff uses odds-snapshot, not odds-live');
assert.ok(/Date\.now\(\) >= ko\) return/.test(appJs), 'odds-live poll still stops after kickoff');
assert.ok(/warmupMatchOddsAndReports\(j\.data\)/.test(appJs), 'selling list warms odds + predict-report');
assert.ok(/warmupMatchOddsAndReports\(classifiedDay\)/.test(appJs), 'visible schedule day warms odds + predict-report');
assert.ok(/concurrency\)\s*\|\|\s*3/.test(slateWarmFn), 'odds/report warmup concurrency is modest');
assert.ok(/function warmupMatchWeather/.test(appJs) && /timeoutMs \|\| 5000/.test(appJs), '372 weather path kept');
assert.ok(!/await loadLiveStats/.test(extractNamed(appJs, 'ensureMatchWeather')), 'weather path still has no loadLiveStats');

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

console.log('ui-373-test OK');
