
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.ok(/216mf392|216mf393|216mf394|216mf395|216mf397|216mf398|216mf399|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 392+');
assert.ok(!/216mf391/.test(indexHtml), 'index.html cache stamp moved off 391');

function extractNamed(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, name + ' exists');
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next > 0 ? next : start + 3500);
}

const buckets = extractNamed(appJs, 'homeFocusBuckets');
assert.ok(/const sortUp = \(a, b\) => kickoff\(a\.m\) - kickoff\(b\.m\) \|\| prio\(a\.m\.league\)/.test(buckets),
  'upcoming home cards sort by kickoff first');
assert.ok(!/const sortUp = \(a, b\) => prio\(a\.m\.league\) - prio\(b\.m\.league\) \|\| kickoff\(a\.m\)/.test(buckets),
  'upcoming sort is no longer league-priority first');

const compact = extractNamed(appJs, 'focusCardCompact');
const pitch = extractNamed(appJs, 'focusCardPitch');
assert.ok(/eager:\s*true/.test(compact) && /eager:\s*true/.test(pitch), 'home focus badges load eagerly');

const warm = extractNamed(appJs, 'warmCrestCacheForTeams');
assert.ok(/crestCacheFromRemote/.test(warm), 'boot warm prefetches unbundled /api/logo');

const hydrate = extractNamed(appJs, 'hydrateTribeCrests');
assert.ok(/classList\.add\('is-loaded'\)/.test(hydrate), 'hydrate marks a decoded crest loaded');
assert.ok(/setTimeout\(settle, 600\)/.test(hydrate), 'hydrate rescans after a short delay');

assert.ok(/style="background:\$\{bg\}"/.test(extractNamed(appJs, 'badge')), 'letter cover keeps its gradient while the crest decodes');

const pending = css.indexOf('.badge.crest:not(.flag) img');
assert.ok(pending >= 0, 'pending crest img rule exists');
const pendingRule = css.slice(pending, css.indexOf('}', pending) + 1);
assert.ok(!/opacity\s*:\s*0/.test(pendingRule), 'pending crest img is not hidden with opacity 0');
assert.ok(/opacity\s*:\s*1/.test(pendingRule), 'pending crest img stays visible under the letter so it can decode');

const phStart = css.indexOf('.badge.crest:not(.flag) .badge-ph');
const phRule = css.slice(phStart, css.indexOf('}', phStart) + 1);
assert.ok(/z-index:\s*2/.test(phRule), 'letter cover sits above the decoding crest');

// 391 close path stays
const td = extractNamed(appJs, 'teardownOverlayEl');
assert.ok(/overlay-inner-swap/.test(td), 'close still freezes only inner chrome');
assert.ok(!/classList\.add\('overlay-teardown'\)/.test(td), 'close still does not fade the overlay root');
assert.ok(/softPatchMatchHero/.test(appJs), 'softPatchMatchHero stays');
assert.ok(!/setLayerType/.test(appJs), 'WebView software layer is not forced');

const onloadLine = appJs.split(/\n/).find((l) => l.includes('onload="this.parentNode.classList.add'));
assert.ok(onloadLine);
assert.doesNotThrow(() => new Function(onloadLine), 'crest onload still parses');
console.log('ui-392-test ok');
