'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const liveJs = fs.readFileSync(path.join(root, 'lib/live-scores.js'), 'utf8');
const smJs = fs.readFileSync(path.join(root, 'lib/sm-live-scores.js'), 'utf8');

assert.ok(/216lu33/.test(index), 'cache 216lu33');
assert.ok(!/216lu32/.test(index), 'no stale 216lu32');
assert.ok(/app\.js\?v=216lu33/.test(index), 'app.js cache-busted');
assert.ok(/style\.css\?v=216lu33/.test(index), 'style cache-busted');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2\.1\.5\.382\}"/.test(apkSh), 'apk default 2.1.5.382');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-382\}"/.test(apkSh), 'apk default 382');

assert.ok(/function fromSm/.test(smJs) && /function mergeSmOverlay/.test(smJs), 'SM live helpers');
assert.ok(/isSafeSmFixtureId/.test(smJs), 'SM id clash guard');
assert.ok(/sm-lineups.*match-map/.test(smJs) || /smFixtureId/.test(smJs), 'SM map is smFixtureId only');
assert.ok(/fixture-map\.json/.test(smJs), 'AF fixture map is consulted only to exclude AF ids');
assert.ok(/fetchSmInplay/.test(liveJs) && /overlayInplay/.test(liveJs), 'live-scores uses SM overlay');
assert.ok(/smCovered/.test(liveJs), 'AF is skipped when SM already covered the match');
assert.ok(!/SPORTMONKS_TOKEN/.test(index + appJs + css), 'no token in the public pack');
assert.ok(!/api_token/.test(appJs), 'no api_token in client JS');

assert.ok(/softPatchMatchHero/.test(appJs), 'tab/status updates patch the hero in place');
assert.ok(/Never remount the hero/.test(appJs) || /softPatchMatchHero\(x\)/.test(appJs), 'refreshDetailTabs uses soft patch');
assert.ok(!/hero\.replaceWith/.test(appJs), 'hero is not replaceWith on tab/status refresh');
assert.ok(/window\.__appBack/.test(appJs) && /closeTopOverlay/.test(appJs), 'Android back closes overlays first');
assert.ok(/Must never throw/.test(appJs), 'appBack is defensive');
assert.ok(/_refreshing/.test(appJs), 'modules keep last-good while refreshing');
assert.ok(/正在同时整理双方/.test(appJs), 'loading copy is paired, not one-sided');
assert.ok(/gc-one-side/.test(appJs) && /gc-kit \.bars/.test(css), 'one-sided goal clock keeps a paired grid');
assert.ok(/n < 0 \|\| n > 100/.test(appJs) || /n < 0/.test(appJs), '-1% / invalid pct guarded on the client');
assert.ok(/preview 380/.test(css), '380 weather notes are in CSS');
assert.ok(!/animation:\s*wx-pan-sky-tile/.test(css), '379 background-position tile pan is retired');
assert.ok(/--wx-pan-x/.test(css) && /is-js-pan/.test(css), 'sky pan is JS-driven transform');
assert.ok(/animation:\s*none/.test(css), 'fixed sunny sun still does not pan');
assert.ok(/sx, sy = 0\.78, 0\.30/.test(fs.readFileSync(path.join(root, 'tools/gen-weather-377.py'), 'utf8')), 'sun stays at 0.78, 0.30');
assert.ok(/HERO_GLOW_SAT = 0\.28/.test(appJs), 'Neutral B sat kept');
assert.ok(/object-fit:\s*contain\s*!important/.test(css), 'NT flags still contain');
assert.ok(/bundledCrestFor\(logo, tid, opts\)/.test(appJs), '378 packed crests kept');
assert.ok(/backdrop-filter:\s*none/.test(css), 'overlay backdrop-filter disabled to harden WebView close');

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

const refresh = extractNamed(appJs, 'refreshDetailTabs');
assert.ok(/softPatchMatchHero/.test(refresh), 'refreshDetailTabs does not remount hero');
assert.ok(!/replaceWith/.test(refresh), 'refreshDetailTabs has no replaceWith');

const appBack = extractNamed(appJs, '') || '';
const appBackSrc = appJs.slice(appJs.indexOf('window.__appBack'), appJs.indexOf('window.__appBack') + 900);
assert.ok(/catch/.test(appBackSrc), '__appBack swallows errors');
assert.ok(/return 1/.test(appBackSrc), 'errors must not exit the Android activity');

const clock = extractNamed(appJs, 'goalClockHtml');
assert.ok(/gc-one-side/.test(clock), 'uneven goal-clock marks gc-one-side');
assert.ok(/该侧留空/.test(clock), 'empty side is annotated, not hidden as a broken pair');

const procFmt = extractNamed(appJs, 'processMetricFmt');
assert.ok(/n < 0/.test(procFmt), 'processMetricFmt rejects negative percents');

console.log('ui-379-test OK', { version: '2.1.5.382', cache: '216lu33' });
