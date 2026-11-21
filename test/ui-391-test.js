
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.ok(/216mf391|216mf392|216mf393|216mf394|216mf395|216mf397|216mf398|216mf399|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 391+');
assert.ok(!/216mf390/.test(indexHtml), 'index.html cache stamp moved off 390');

function extractNamed(src, name) {
  const start = src.indexOf('function ' + name);
  assert.ok(start >= 0, name + ' exists');
  const next = src.indexOf('\nfunction ', start + 10);
  return src.slice(start, next > 0 ? next : start + 2500);
}

const td = extractNamed(appJs, 'teardownOverlayEl');
assert.ok(/overlay-inner-swap/.test(td), 'close freezes only inner chrome');
assert.ok(/overlay-closing/.test(td), 'close keeps a busy flag without fading the mask');
assert.ok(!/[^n]freezeOverlayEl\(el\)/.test(td), 'close does not fade the whole overlay root');
assert.ok(!/classList\.add\('overlay-teardown'\)/.test(td), 'close does not add overlay-teardown to the root');
assert.ok((td.match(/afterCompositorIdle/g) || []).length >= 2, 'waits before hide and again before innerHTML clear');
assert.ok(!/requestAnimationFrame\(clear\)/.test(td), 'close no longer clears on a single rAF');

const closeSheet = extractNamed(appJs, 'closeSheet');
const closeRadar = extractNamed(appJs, 'closeRadarExpand');
assert.ok(/teardownOverlayEl/.test(closeSheet) && /teardownOverlayEl/.test(closeRadar), 'player sheet and 球员对照 still use delayed teardown');

assert.ok(/overlay-closing/.test(css), 'closing flag has CSS');
assert.ok(/#radar-expand\.overlay-closing/.test(css), 'radar close keeps pointer lock');
const closeStart = css.indexOf('#sheet.overlay-closing');
const closeRule = css.slice(closeStart, css.indexOf('}', closeStart) + 1);
assert.ok(closeRule.includes('#radar-expand.overlay-closing'), 'radar uses the closing flag');
assert.ok(!/opacity\s*:\s*0/.test(closeRule), 'closing flag does not fade the radar root');

assert.ok(/function swapOverlayHtml/.test(appJs) && /alreadyOpen/.test(appJs), '390 already-open path kept');
assert.ok(/softPatchMatchHero/.test(appJs), 'softPatchMatchHero stays');
assert.ok(!/setLayerType/.test(appJs), 'WebView software layer is not forced');

const onloadLine = appJs.split(/\n/).find((l) => l.includes('onload="this.parentNode.classList.add'));
assert.ok(onloadLine);
assert.doesNotThrow(() => new Function(onloadLine), 'crest onload still parses');
console.log('ui-391-test ok');
