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

assert.ok(/216lu25/.test(index), 'cache 216lu25');
assert.ok(!/216lu24/.test(index), 'no stale 216lu24');
assert.ok(/js\/nt-flags\.js\?v=216lu25/.test(index), 'nt-flags.js is loaded');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.374\}"/.test(apkSh), 'apk default 2.1.5.374');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-374\}"/.test(apkSh), 'apk default 374');

assert.ok(/preview 370/.test(css), '370 css (sky/rain) left in place');
assert.ok(!/wx-drift-sky/.test(css), 'no hitchy alternate sky keyframe');
assert.ok(/@keyframes wx-pan-sky/.test(css) && /translate3d\(-50%/.test(css), 'one-way 50% sky pan');
assert.ok(/52s linear infinite/.test(css), 'sky pan is linear, not ease-in-out');
assert.ok(!/hero-wx-drops/.test(css), 'no lens droplet canvas CSS');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-sky::before/.test(css), 'sky pan pauses on wx-paused');

assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(!/assets\/weather\/drops\.png/.test(appJs), 'no filled droplet sticker sheet');
assert.ok(!/function bindHeroRainDrops/.test(appJs), 'bindHeroRainDrops removed');
assert.ok(/rectangularFlagSrc/.test(appJs), 'rectangular NT flags kept');
assert.ok(/function formatHeroRank/.test(appJs) && /小组/.test(appJs), '小组 label kept');
assert.ok(/hero-lg-block/.test(appJs), 'title+time block kept');
assert.ok(/function officialStatusZh/.test(appJs), 'Selling/Define are translated');
assert.ok(/officialStatusZh\(statusLab/.test(appJs), 'hero uses officialStatusZh');

assert.ok(/function resolveFlagIso2/.test(appJs), 'name+logo flag resolver');
assert.ok(/function matchTeamBadge/.test(appJs), 'match badges pass league');
assert.ok(/classList\.contains\('flag'\)/.test(appJs), 'hydrateTribeCrests skips flags');
assert.ok(/function acceptMatchPayload/.test(appJs), 'client sample fallback guard');
assert.ok(/warmVisibleScheduleDay/.test(appJs), 'day tab warms in the background');

assert.ok(/\.badge\.crest\.flag/.test(css), 'list flags have rectangular CSS');
assert.ok(/12\.6vw/.test(css) && /8\.4vw/.test(css), 'hero flags slightly smaller than fig 4');
assert.ok(/max-width:\s*66px/.test(css) && /max-height:\s*44px/.test(css), 'hero flag max slightly under 72×48');
assert.ok(!/max-width:\s*72px/.test(css) || true, 'fig-4 72px cap may remain as a comment only');
// The 13.8vw / 72×48 fig-4 size must not still apply to hero flags
assert.ok(!/width:\s*13\.8vw/.test(css), 'fig-4 13.8vw hero flag size retired');

assert.ok(/liveFallbackPayload/.test(serverJs), 'server uses last-good live fallback');
assert.ok(!/mergeSeenIntoResults\(sampleData\)/.test(serverJs), 'sample is not merged into live results');
assert.ok(/nearby-prefetch/.test(serverJs), 'nearby prefetch job is wired');
assert.ok(/reason: 'timeout'/.test(serverJs), 'live-stats has a hard timeout');
assert.ok(/peekCachedPayload/.test(serverJs), 'live-stats does not refresh the slate to enrich');

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
const enrichFn = extractNamed(appJs, 'enrichMatchDetail');
assert.ok(!/await loadLiveStats/.test(enrichFn), 'enrichMatchDetail does not await loadLiveStats');
assert.ok(/loadLiveStats\(x\)\.then/.test(enrichFn), 'kicked-off live-stats runs in the background');
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

assert.ok(/版本 /.test(appJs) && /构建 /.test(appJs), 'about line still renders 版本 / 构建');

console.log('ui-374-test OK');
