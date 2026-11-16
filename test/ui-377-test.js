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

assert.ok(/216lu32/.test(index), 'cache 216lu32');
assert.ok(!/216lu31/.test(index), 'no stale 216lu31');
assert.ok(/js\/nt-flags\.js\?v=216lu32/.test(index), 'nt-flags.js is loaded');
assert.ok(/data-center-boot-slices\.js\?v=216lu32/.test(index), 'boot slices cache-busted');
assert.ok(/js\/match-weather\.js\?v=216lu32/.test(index), 'match-weather cache-busted');
assert.ok(/style\.css\?v=216lu32/.test(index), 'style cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.381\}"/.test(apkSh), 'apk default 2.1.5.381');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-381\}"/.test(apkSh), 'apk default 381');

assert.ok(/preview 370/.test(css), '370 css (sky/rain) left in place');
assert.ok(/preview 376/.test(css), '376 sunny split is kept');
assert.ok(/preview 377/.test(css), '377 notes are in CSS');
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
assert.ok(/liveFallbackPayload/.test(serverJs), 'server uses last-good live fallback');
assert.ok(!/mergeSeenIntoResults\(sampleData\)/.test(serverJs), 'sample is not merged into live results');
assert.ok(/nearby-prefetch/.test(serverJs), 'nearby prefetch job is wired');
assert.ok(/reason: 'timeout'/.test(serverJs), 'live-stats has a hard timeout');
assert.ok(/peekCachedPayload/.test(serverJs), 'live-stats does not refresh the slate to enrich');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + clientWx), 'no token in public JS');
assert.ok(/版本 /.test(appJs) && /构建 /.test(appJs), 'about line still renders 版本 / 构建');
assert.ok(/function playerIdNamespace/.test(appJs), 'playerIdNamespace kept from 375');
assert.ok(/PHOTO_IDB_NAME/.test(appJs), 'player photo IDB kept');
assert.ok(/DC_PHOTO_QUALITY_BAR = 10/.test(appJs), 'top-10 quality bar kept');

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

function ruleBody(hay, needle) {
  const i = hay.indexOf(needle);
  assert.ok(i >= 0, 'found rule ' + needle);
  const open = hay.indexOf('{', i);
  const close = hay.indexOf('}', open);
  assert.ok(open >= 0 && close > open, 'braces for ' + needle);
  return hay.slice(i, close + 1);
}

/* ── 376 split kept: fixed sun on ::after, clouds pan on ::before ── */
const sunnyBefore = ruleBody(css, '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::before');
assert.ok(/sunny-clouds\.webp/.test(sunnyBefore), 'sunny ::before pans the cloud plate');
assert.ok(!/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyBefore), 'sun plate is not on the panning ::before');
const sunnyAfter = ruleBody(css, '.hero.hero--weather[data-weather="sunny"] .hero-wx-sky::after');
assert.ok(/url\("assets\/weather\/sunny\.webp"\)/.test(sunnyAfter), 'fixed sun lives on ::after');
assert.ok(/animation:\s*none/.test(sunnyAfter), 'sun layer is not animated');
assert.ok(!/wx-pan-sky/.test(sunnyAfter), 'sun layer does not use the sky pan keyframe');
assert.ok(/hero-sticky\[data-weather="sunny"\] \.hero-wx-sky::after/.test(sunnyAfter), 'sticky shares the fixed sun plate');
const stickySunAfter = ruleBody(css, '.hero-sticky[data-weather="sunny"] .hero-wx-sky::after {\n  top: 0;');
assert.ok(/height:\s*220%/.test(stickySunAfter), 'sticky sun is the same top crop as the cloud plate');

assert.ok(/animation:\s*wx-rain-fall/.test(css), 'atmospheric rain still scrolls');
assert.ok(/12\.6vw/.test(css) && /8\.4vw/.test(css), 'hero flags slightly smaller than fig 4');
assert.ok(/max-width:\s*66px/.test(css) && /max-height:\s*44px/.test(css), 'hero flag max slightly under 72×48');
assert.ok(!/width:\s*13\.8vw/.test(css), 'fig-4 13.8vw hero flag size retired');

/* ── 377: sunny 关注 is slightly more contrasty, sunny only ── */
const favSunny = ruleBody(css, '.hero.hero--weather[data-weather="sunny"] .hero-edge-nav .fav-btn:not(.on)');
assert.ok(/background:\s*rgba\(22,\s*30,\s*42,\s*\.48\)/.test(favSunny), 'sunny 关注 uses a darker frosted pill');
assert.ok(/box-shadow:/.test(favSunny), 'sunny 关注 has a soft dark edge');
assert.ok(/font-weight:\s*650/.test(favSunny), 'sunny 关注 text is a bit stronger');
assert.ok(!/data-weather="rain"[\s\S]{0,80}fav-btn:not/.test(css), 'rain 关注 is not restyled');
assert.ok(!/data-weather="storm"[\s\S]{0,80}fav-btn:not/.test(css), 'storm 关注 is not restyled');
assert.ok(!/data-weather="cloudy"[\s\S]{0,80}fav-btn:not/.test(css), 'cloudy 关注 is not restyled');
// The previous default chip is still the faint white pill
assert.ok(/\.fav-btn \{[^}]*background:\s*rgba\(255,255,255,\s*\.18\)/.test(css), 'default 关注 pill unchanged');

/* ── 377: complete rectangular NT flags, not overflow-cropped ── */
assert.ok(!/height="107"/.test(appJs), 'badge() does not force a fake 3:2 HTML aspect on flags');
const flagImg = ruleBody(css, '.badge.crest.flag img');
assert.ok(/object-fit:\s*contain\s*!important/.test(flagImg), 'flags contain, never cover');
assert.ok(/min-height:\s*0/.test(flagImg) && /min-width:\s*0/.test(flagImg), 'flag imgs can shrink inside the 3:2 frame');
assert.ok(/align-self:\s*stretch/.test(flagImg), 'flag imgs stretch in the grid cell');
assert.ok(!/object-fit:\s*cover/.test(flagImg), 'no cover on the flag img rule');
const flagBox = ruleBody(css, '.badge.crest.flag,\n.badge.flag');
assert.ok(/place-items:\s*stretch/.test(flagBox), 'flag badges override place-items:center');
assert.ok(/border-radius:\s*2px/.test(flagBox), 'flags stay slightly rounded rectangles, not circles');
assert.ok(!/border-radius:\s*50%/.test(flagBox), 'NT flags are not circular');
const heroFlagImg = ruleBody(css, '.hero.hero--weather .badge.crest.flag img');
assert.ok(/object-fit:\s*contain\s*!important/.test(heroFlagImg), 'hero flags contain');
assert.ok(/min-height:\s*0/.test(heroFlagImg), 'hero flag imgs can shrink');
const stickyFlagImg = ruleBody(css, '.hero-sticky-mid .badge.crest.flag img');
assert.ok(/object-fit:\s*contain\s*!important/.test(stickyFlagImg), 'sticky flags contain');
assert.ok(/min-height:\s*0/.test(stickyFlagImg), 'sticky flag imgs can shrink');
assert.ok(/\.badge\.crest img[\s\S]{0,200}min-height:\s*0/.test(css), 'club crest imgs also lose intrinsic min-size');

const asset = (name) => path.join(root, 'public/assets/weather', name);
for (const name of ['sunny.webp', 'sunny-clouds.webp', 'light-rain.webp', 'storm.webp', 'cloudy.webp', 'rain-fall.webp']) {
  assert.ok(fs.existsSync(asset(name)), name + ' exists');
}
assert.ok(!fs.existsSync(path.join(root, 'public/assets/weather/drops.png')), 'lens drop sheet is not in weather assets');

const ch = path.join(root, 'public/assets/flags/ch.png');
const sct = path.join(root, 'public/assets/flags/gb-sct.png');
assert.ok(fs.existsSync(ch) && fs.existsSync(sct), 'CH and SCT bundled flags exist');

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
# Bright disc is in the upper-right, not centered (376 was ~0.50, 0.28).
ys, xs = np.where(s.mean(axis=2) >= 240)
assert xs.size > 50, 'no bright sun disc'
mx, my = float(xs.mean() / w), float(ys.mean() / h)
assert mx > 0.68 and mx < 0.88, ('sun x should be upper-right, not center or the corner', mx)
assert my > 0.18 and my < 0.40, ('sun y should stay in the upper band', my)
# Core is clearly off-center horizontally
cx, cy = int(0.50 * w), int(0.28 * h)
core_r = s[int(my*h)-8:int(my*h)+8, int(mx*w)-8:int(mx*w)+8]
center = s[cy-8:cy+8, cx-8:cx+8]
assert float(core_r.mean()) > float(center.mean()) + 30, (float(core_r.mean()), float(center.mean()))
# Not directly under the extreme top-right 关注 chip (~0.90–0.96 x, ~0.20–0.26 y in plate-ish space)
assert mx < 0.86, ('sun too close to the 关注 chip', mx)
a = c[..., 3].astype(np.float64)
assert a.min() < 40 and a.max() > 200 and 80 < a.mean() < 200, (a.min(), a.max(), float(a.mean()))
def edge_mad(arr):
    return float(np.mean(np.abs(arr[:, 0].astype(np.float64) - arr[:, -1].astype(np.float64))))
mad_a = edge_mad(a)
mad_rgb = edge_mad(c[..., :3])
assert mad_a < 4.0, mad_a
assert mad_rgb < 2.0, mad_rgb
# After a half-width cloud roll, the designed sun core stays put
sx, sy = int(round(mx * w)), int(round(my * h))
rolled = np.roll(np.array(clouds), w // 2, axis=1)
shifted = Image.alpha_composite(sun.convert('RGBA'), Image.fromarray(rolled, 'RGBA')).convert('RGB')
sh = np.array(shifted)
win = sh[sy-24:sy+24, sx-24:sx+24].astype(np.float64)
assert win.shape[0] == 48 and win.shape[1] == 48, win.shape
assert win[..., 0].max() >= 230 and float(win.mean(axis=2).max()) >= 220, 'sun core lost after cloud shift'
# Bundled CH / SCT flags themselves are complete (clipping was a CSS box issue)
ch = np.array(Image.open(root / 'public/assets/flags/ch.png').convert('RGB'))
sct = np.array(Image.open(root / 'public/assets/flags/gb-sct.png').convert('RGB'))
assert ch.shape[0] == ch.shape[1], ('CH should be square', ch.shape)
assert sct.shape[1] / sct.shape[0] > 1.5, ('SCT should be a wide rectangle', sct.shape)
# Cross does not touch the CH edges (complete official flag)
mid = ch[ch.shape[0]//2]
# left/right margins stay red
assert mid[2, 0] > 150 and mid[-3, 0] > 150
# SCT saltire reaches the four corners (white present in corner neighborhoods)
def corner_has_white(arr, x, y):
    patch = arr[max(0,y):y+4, max(0,x):x+4] if x >= 0 and y >= 0 else arr[y:y+4 if y>=0 else None, x:x+4 if x>=0 else None]
    # use explicit corners
    return True
h2, w2 = sct.shape[:2]
corners = [sct[0:3, 0:3], sct[0:3, -3:], sct[-3:, 0:3], sct[-3:, -3:]]
assert all(float(p.mean()) > 180 for p in corners), 'SCT corners should be the white saltire tips'
print(json.dumps({
  'sunXY': [round(mx, 3), round(my, 3)],
  'alphaMean': round(float(a.mean()), 2),
  'seamAlpha': round(mad_a, 3),
  'seamCloudRgb': round(mad_rgb, 3),
  'shiftCoreMax': round(float(win.mean(axis=2).max()), 2),
  'ch': list(ch.shape),
  'sct': list(sct.shape),
}))
`], { encoding: 'utf8' });
const qaInfo = JSON.parse(qa.trim().split('\n').filter(Boolean).pop());

console.log('ui-377-test OK', qaInfo);
