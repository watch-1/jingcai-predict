// 1.9.193: per-card scroll morph 图2 blend → 图3 separated wrap
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card glow scroll helper');
assert.ok(/offset < 0/.test(appJs), 'fade when card scrolls above feed top');
assert.ok(/offset \/ range/.test(appJs), 'g increases as card moves down feed');
assert.ok(!/1 - Math\.max\(0, offset\) \/ range/.test(appJs), 'inverted top-only glow removed');
assert.ok(/--ha-g: var\(--ha-card-glow/.test(css), 'glow drives border/shadow morph');
assert.ok(/color-mix\(in srgb, #f4efe6/.test(css), 'blend-state card fill (warm gold-gray)');

console.log('ui-193-test OK');
