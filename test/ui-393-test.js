
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.strictEqual((indexHtml.match(/216mf401/g) || []).length, 6, 'index.html has 6× 216mf401');
assert.ok(!/216mf395/.test(indexHtml), 'index.html cache stamp moved off 395');

function extractNamed(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, name + ' exists');
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next > 0 ? next : start + 4000);
}

function rule(src, selector) {
  const start = src.indexOf(selector);
  assert.ok(start >= 0, selector + ' exists');
  const end = src.indexOf('}', start);
  return src.slice(start, end + 1);
}

const sheetOn = rule(css, 'body.sheet-on {');
assert.ok(!/overflow\s*:\s*hidden/.test(sheetOn), 'body.sheet-on does not toggle overflow');
const viewLock = rule(css, 'body.sheet-on #view.sheet-lock {');
assert.ok(!/overflow\s*:\s*hidden/.test(viewLock), '#view.sheet-lock does not toggle overflow');
const rk = rule(css, 'body.rk-lock {');
assert.ok(!/overflow\s*:\s*hidden/.test(rk), 'body.rk-lock does not toggle overflow');
const mf = rule(css, 'body.mf-lock {');
assert.ok(!/overflow\s*:\s*hidden/.test(mf), 'body.mf-lock does not toggle overflow');

assert.ok(/#overlay-scroll-guard/.test(css) && /#overlay-scroll-guard\.is-on/.test(css), 'empty scroll guard is styled');
assert.ok(/touch-action:\s*none/.test(rule(css, '#overlay-scroll-guard.is-on')), 'guard swallows touch while on');

const sync = extractNamed(appJs, 'syncSheetScrollLock');
const ensure = extractNamed(appJs, 'ensureOverlayScrollGuard');
assert.ok(/overlay-scroll-guard/.test(ensure) && /classList\.remove\('sheet-lock'\)/.test(sync) && /is-on/.test(sync),
  'lock sync uses the guard and clears leftover sheet-lock');
assert.ok(/function anyOverlayBusy/.test(appJs) && /mf-fullview/.test(extractNamed(appJs, 'overlayHostEls')),
  'lock tracks every overlay host');

const td = extractNamed(appJs, 'teardownOverlayEl');
assert.ok(/recycleOverlayEl/.test(td), 'close recycles the overlay node to drop compositor layers');
assert.ok(/syncSheetScrollLock/.test(td), 'close keeps the guard in sync');
assert.ok(/overlay-inner-swap/.test(td), 'close still freezes only inner chrome');
assert.ok(!/classList\.add\('overlay-teardown'\)/.test(td), 'close still does not fade the overlay root');
assert.ok((td.match(/afterCompositorIdle/g) || []).length >= 2, 'waits before hide and again before clear');

assert.ok(/function recycleOverlayEl/.test(appJs) && /cloneNode\(false\)/.test(extractNamed(appJs, 'recycleOverlayEl')),
  'recycle replaces the overlay with an empty clone');

// 392 homepage / crest fixes stay
const buckets = extractNamed(appJs, 'homeFocusBuckets');
assert.ok(/const sortUp = \(a, b\) => kickoff\(a\.m\) - kickoff\(b\.m\) \|\| prio\(a\.m\.league\)/.test(buckets),
  'upcoming home cards still sort by kickoff first');

assert.ok(/softPatchMatchHero/.test(appJs), 'softPatchMatchHero stays');
assert.ok(!/setLayerType/.test(appJs), 'WebView software layer is not forced');

const onloadLine = appJs.split(/\n/).find((l) => l.includes('onload="this.parentNode.classList.add'));
assert.ok(onloadLine);
assert.doesNotThrow(() => new Function(onloadLine), 'crest onload still parses');
console.log('ui-393-test ok');
