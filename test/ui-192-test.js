// 1.9.192: per-card home attitude blue wrap (no shared section gradient flash)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(!/ha-pastel|ha-shell/.test(appJs), 'section gradient layers removed from home attitude markup');
assert.ok(!/\.home-attitude-wrap \.ha-shell/.test(css), 'section navy shell CSS removed');
assert.ok(/--ha-card-glow/.test(css), 'per-card glow CSS variable');
assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card glow scroll helper');
assert.ok(/syncHomeAttitudeScroll\(\)/.test(appJs), 'sync after tab/feed updates');
assert.ok(/requestAnimationFrame\(\(\) => syncHomeAttitudeScroll\(\)\)/.test(appJs), 'tab switch resyncs card glow');

console.log('ui-192-test OK');
