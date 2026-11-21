
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const surface = require('../lib/sm-surface');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.ok(/216mf390|216mf391|216mf392|216mf393|216mf394|216mf395|216mf397|216mf398|216mf399|216mf400|216mf401/.test(indexHtml), 'index.html cache stamp is 390+');
assert.ok(!/216mf389/.test(indexHtml), 'index.html cache stamp moved off 389');

const formHtml = surface.renderFormHtml({
  players: {
    home: [{ name: 'Home P', nameZh: '主将', image: '', label: '前锋', goals: 1, assists: 0, shots: 2, passPct: 80, tackles: 1, rating: 7, jersey: '9' }],
    away: [{ name: 'Away P', nameZh: '客将', image: '', label: '后卫', goals: 0, assists: 0, shots: 1, passPct: 70, tackles: 2, rating: 6.5, jersey: '4' }],
  },
  homeName: '科里蒂巴',
  awayName: '桑托斯',
});
assert.ok(/sm-form-panes/.test(formHtml) && (formHtml.match(/sm-form-pane/g) || []).length >= 2, 'both sides are panes');
assert.ok(!/<template/.test(formHtml), 'no templates');
assert.ok(formHtml.includes('主将') && formHtml.includes('客将'), 'both rosters present');
const paneStart = css.indexOf('.sm-form[data-side="home"] .sm-form-pane[data-for="away"]');
const paneRule = css.slice(paneStart, css.indexOf('}', paneStart) + 1);
assert.ok(paneRule.includes('visibility: hidden'), 'inactive pane uses visibility');
assert.ok(!/display\s*:\s*none/.test(paneRule), 'inactive pane is not display:none');


assert.ok(/function applySmFormSide/.test(appJs) && /function normalizeSmForm/.test(appJs));
const normFn = appJs.slice(appJs.indexOf('function normalizeSmForm'), appJs.indexOf('function paintSmSurface'));
assert.ok(/sm-form-list/.test(normFn), 'normalizeSmForm upgrades current prod list markup, not only 382 templates');

assert.ok(/function applyMvSheetSide/.test(appJs));
assert.ok(/mv-sheet-panes/.test(appJs) && /mv-rank-list" data-for="away"/.test(appJs), 'value sheet mounts both sides');
assert.ok(/alreadyOpen/.test(appJs) && /overlay-inner-swap/.test(appJs) && /overlay-inner-swap/.test(css), 'already-open overlay keeps the mask');
assert.ok(/softPatchMatchHero/.test(appJs), 'softPatchMatchHero stays');
assert.ok(/function swapOverlayHtml/.test(appJs) && /function teardownOverlayEl/.test(appJs), '381/382 open-close path kept');

const onloadLine = appJs.split(/\n/).find((l) => l.includes('onload="this.parentNode.classList.add'));
assert.ok(onloadLine);
assert.doesNotThrow(() => new Function(onloadLine), 'crest onload still parses');
console.log('ui-390-test ok');
