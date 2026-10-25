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

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.192');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.192/.test(ver));
assert.ok(/VERSION_CODE=229/.test(ver));
assert.ok(/jc-v1\.9\.192/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-192-test OK');
