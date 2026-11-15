'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientWx = fs.readFileSync(path.join(root, 'public/js/match-weather.js'), 'utf8');

assert.ok(/216lu27/.test(index), 'cache 216lu27');
assert.ok(!/216lu26/.test(index), 'no stale 216lu26');
assert.ok(/js\/nt-flags\.js\?v=216lu27/.test(index), 'nt-flags.js is loaded');
assert.ok(/data-center-boot-slices\.js\?v=216lu27/.test(index), 'boot slices cache-busted');
assert.ok(/js\/match-weather\.js\?v=216lu27/.test(index), 'match-weather cache-busted');
assert.ok(/style\.css\?v=216lu27/.test(index), 'style cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.376\}"/.test(apkSh), 'apk default 2.1.5.376');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-376\}"/.test(apkSh), 'apk default 376');

assert.ok(/preview 370/.test(css), '370 css (sky/rain) left in place');
assert.ok(/preview 376/.test(css), '376 sunny split is documented');
assert.ok(!/wx-drift-sky/.test(css), 'no hitchy alternate sky keyframe');
assert.ok(/@keyframes wx-pan-sky/.test(css) && /translate3d\(-50%/.test(css), 'one-way 50% sky pan');
assert.ok(/52s linear infinite/.test(css), 'sky pan is linear, not ease-in-out');
assert.ok(!/hero-wx-drops/.test(css), 'no lens droplet canvas CSS');
assert.ok(/html\.wx-paused[\s\S]*hero-wx-sky::before/.test(css), 'sky pan pauses on wx-paused');

assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat');
assert.ok(/HERO_GLOW_VAL = 0\.20/.test(appJs), 'Neutral B val');
assert.ok(!/assets\/weather\/drops\.png/.test(appJs), 'no filled droplet sticker sheet');
assert.ok(!/function bindHeroRainDrops/.test(appJs), 'bindHeroRainDrops removed');
assert.ok(!/HERO_SKY_SRC/.test(appJs), 'no sky-sampling sheet for beads');
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
assert.ok(!/width:\s*13\.8vw/.test(css), 'fig-4 13.8vw hero flag size retired');

assert.ok(/liveFallbackPayload/.test(serverJs), 'server uses last-good live fallback');
assert.ok(!/mergeSeenIntoResults\(sampleData\)/.test(serverJs), 'sample is not merged into live results');
assert.ok(/nearby-prefetch/.test(serverJs), 'nearby prefetch job is wired');
assert.ok(/reason: 'timeout'/.test(serverJs), 'live-stats has a hard timeout');
assert.ok(/peekCachedPayload/.test(serverJs), 'live-stats does not refresh the slate to enrich');
assert.ok(/upload\.wikimedia\.org/.test(serverJs), 'logo proxy allows wikimedia');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');
assert.ok(/flagcdn\.com/.test(serverJs), 'logo proxy still allows flagcdn');
assert.ok(/版本 /.test(appJs) && /构建 /.test(appJs), 'about line still renders 版本 / 构建');

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

const enrichFn = extractNamed(appJs, 'enrichMatchDetail');
assert.ok(!/await loadLiveStats/.test(enrichFn), 'enrichMatchDetail does not await loadLiveStats');
assert.ok(/loadLiveStats\(x\)\.then/.test(enrichFn), 'kicked-off live-stats runs in the background');
assert.ok(!/await loadLiveStats/.test(extractNamed(appJs, 'ensureMatchWeather')), 'weather path still has no loadLiveStats');

assert.ok(/function playerIdNamespace/.test(appJs), 'playerIdNamespace kept from 375');
assert.ok(/function filterScorerRowsForDisplay/.test(appJs), 'filterScorerRowsForDisplay kept');
assert.ok(/function stashDetailHintFromEl/.test(appJs), 'stashDetailHintFromEl kept');
assert.ok(/PHOTO_IDB_NAME/.test(appJs), 'player photo IDB kept');
assert.ok(/DC_PHOTO_QUALITY_BAR = 10/.test(appJs), 'top-10 quality bar kept');

function ruleBody(hay, needle) {
  const i = hay.indexOf(needle);
  assert.ok(i >= 0, 'found rule ' + needle);
  const open = hay.indexOf('{', i);
  const close = hay.indexOf('}', open);
  assert.ok(open >= 0 && close > open, 'braces for ' + needle);
  return hay.slice(i, close + 1);
}

const sunnyBefore = ruleBody(
  css,
  '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::before',
);
assert.ok(/sunny-clouds\.webp/.test(sunnyBefore), 'sunny ::before pans the cloud plate');
assert.ok(!/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyBefore), 'sun plate is not on the panning ::before');
assert.ok(/z-index:\s*1/.test(sunnyBefore), 'clouds paint above the fixed sun');
assert.ok(/hero-sticky\[data-weather="sunny"\] \.hero-wx-sky::before/.test(sunnyBefore), 'sticky shares the cloud plate');

const sunnyAfter = ruleBody(
  css,
  '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::after',
);
assert.ok(/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyAfter), 'fixed sun lives on ::after');
assert.ok(/animation:\s*none/.test(sunnyAfter), 'sun layer is not animated');
assert.ok(!/wx-pan-sky/.test(sunnyAfter), 'sun layer does not use the sky pan keyframe');
assert.ok(/z-index:\s*0/.test(sunnyAfter), 'sun sits behind the clouds');
assert.ok(/hero-sticky\[data-weather="sunny"\] \.hero-wx-sky::after/.test(sunnyAfter), 'sticky shares the fixed sun plate');
assert.ok(/background-size:\s*100%\s*100%/.test(sunnyAfter), 'sun plate is a single un-tiled copy');
assert.ok(/width:\s*100%/.test(sunnyAfter), 'sun layer is one viewport wide, not a 200% strip');

const stickySunAfter = ruleBody(css, '.hero-sticky[data-weather="sunny"] .hero-wx-sky::after {\n  top: 0;');
assert.ok(/height:\s*220%/.test(stickySunAfter), 'sticky sun is the same top crop as the cloud plate');
assert.ok(/background-position:\s*0 0/.test(stickySunAfter), 'sticky sun crop starts at the top of the plate');

for (const name of ['light-rain', 'storm', 'cloudy']) {
  const file = name === 'light-rain' ? 'light-rain.webp' : name + '.webp';
  assert.ok(css.includes('assets/weather/' + file), name + ' sky plate kept');
  assert.ok(!new RegExp(file.replace('.', '\\.') + '[\\s\\S]{0,200}::after').test(css), name + ' is not on ::after');
}
assert.ok(/hero-wx-rain::before[\s\S]*rain-fall\.webp/.test(css) || /rain-fall\.webp[\s\S]*hero-wx-rain::before/.test(css),
  'atmospheric rain plate kept');
assert.ok(/animation:\s*wx-rain-fall/.test(css), 'atmospheric rain still scrolls');

const asset = (name) => path.join(root, 'public/assets/weather', name);
for (const name of ['sunny.webp', 'sunny-clouds.webp', 'light-rain.webp', 'storm.webp', 'cloudy.webp', 'rain-fall.webp']) {
  assert.ok(fs.existsSync(asset(name)), name + ' exists');
}
assert.ok(fs.statSync(asset('sunny.webp')).size > 8000, 'sunny sun/sky plate is real');
assert.ok(fs.statSync(asset('sunny-clouds.webp')).size > 8000, 'sunny cloud plate is real');
assert.ok(!fs.existsSync(asset('drops.png')), 'lens drop sheet is not in weather assets');

const qa = execFileSync('python3', ['-c', `
from pathlib import Path
import json
from PIL import Image
import numpy as np
root = Path(${JSON.stringify(root)})
sun = Image.open(root / 'public/assets/weather/sunny.webp')
clouds = Image.open(root / 'public/assets/weather/sunny-clouds.webp')
assert sun.size == (1600, 800), sun.size
assert clouds.size == (1600, 800), clouds.size
assert sun.mode == 'RGB', sun.mode
assert clouds.mode == 'RGBA', clouds.mode
s = np.array(sun)
c = np.array(clouds)
h, w = s.shape[:2]
cx, cy = int(0.50 * w), int(0.28 * h)
pix = s[cy, cx]
assert int(pix.min()) >= 230, ('sun core too dim', pix.tolist())
# sun is near the designed center; not off to a side
ys, xs = np.where(s.mean(axis=2) >= 240)
assert xs.size > 50, 'no bright sun disc'
assert abs(xs.mean() / w - 0.50) < 0.08, float(xs.mean() / w)
assert abs(ys.mean() / h - 0.28) < 0.12, float(ys.mean() / h)
# clouds have real alpha variation so the sun can show through
a = c[..., 3].astype(np.float64)
assert a.min() < 40 and a.max() > 200 and 80 < a.mean() < 200, (a.min(), a.max(), float(a.mean()))
# wrap seam: adjacent left/right columns, not a wide band (spatial variation is expected)
def edge_mad(arr):
    return float(np.mean(np.abs(arr[:, 0].astype(np.float64) - arr[:, -1].astype(np.float64))))
mad_a = edge_mad(a)
mad_rgb = edge_mad(c[..., :3])
mad_s = edge_mad(s)
assert mad_a < 4.0, mad_a
assert mad_rgb < 2.0, mad_rgb
assert mad_s < 2.0, mad_s
assert float(np.max(np.abs(a[:, 0] - a[:, -1]))) < 16.0
# t=0 composite still matches the 370 procedural sunny field
import sys
sys.path.insert(0, str(root / 'tools'))
import importlib.util
spec = importlib.util.spec_from_file_location('gen_weather_370', root / 'tools' / 'gen-weather-370.py')
gw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gw)
# Reconstruct t0 from the shipped plates (encoded), not the raw generator.
over = np.array(Image.alpha_composite(sun.convert('RGBA'), clouds).convert('RGB')).astype(np.float64)
ref = np.array(gw.generate_sunny()).astype(np.float64)
mad = float(np.mean(np.abs(over - ref)))
assert mad < 3.0, mad
# After a half-width cloud roll, the designed sun core stays put and still shines through.
rolled = np.array(clouds)
rolled = np.roll(rolled, w // 2, axis=1)
shifted = Image.alpha_composite(sun.convert('RGBA'), Image.fromarray(rolled, 'RGBA')).convert('RGB')
sh = np.array(shifted)
win = sh[cy-24:cy+24, cx-24:cx+24].astype(np.float64)
assert win.shape[0] == 48 and win.shape[1] == 48, win.shape
assert win[..., 0].max() >= 230 and float(win.mean(axis=2).max()) >= 220, 'sun core lost after cloud shift'
print(json.dumps({
  'sunCore': pix.tolist(),
  'alphaMean': round(float(a.mean()), 2),
  'seamAlpha': round(mad_a, 3),
  'seamCloudRgb': round(mad_rgb, 3),
  't0Mad': round(mad, 3),
  'shiftCoreMax': round(float(win.mean(axis=2).max()), 2),
}))
`], { encoding: 'utf8' });
const qaInfo = JSON.parse(qa.trim().split('\n').filter(Boolean).pop());

console.log('ui-376-test OK', qaInfo);
