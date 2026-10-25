// 1.9.196: ha-card wrap paints gold→silver via rgba (no color-mix sole path) + neutral av halo
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

const haCardBlock = css.match(/\.ha-card\s*\{[\s\S]*?\.ha-card:active/);
assert.ok(haCardBlock, 'ha-card CSS block');
const block = haCardBlock[0];

const beforeBlock = css.match(/\.ha-card::before\s*\{[\s\S]*?\n\}/);
assert.ok(beforeBlock, 'ha-card::before block');
const before = beforeBlock[0];

assert.ok(!/color-mix/.test(before), '::before must not rely on color-mix for wrap paint');
assert.ok(/rgba\(var\(--ha-wrap-gold\)/.test(before), 'gold wrap uses rgba + token');
assert.ok(/rgba\(var\(--ha-wrap-silver\)/.test(before), 'silver wrap uses rgba + token');
assert.ok(/255,\s*218,\s*168/.test(block), 'pale gold RGB token');
assert.ok(/186,\s*194,\s*206/.test(block), 'silver-gray RGB token');
assert.ok(!/color-mix/.test(block), 'ha-card shell must not use color-mix');

assert.ok(!/168,\s*206,\s*255|210,\s*232,\s*255|#a8ceff|#eef2f8/i.test(block + before), 'no sky-blue wrap');

const avBlock = css.match(/\.ha-av\s*\{[\s\S]*?\n\}/);
assert.ok(avBlock, '.ha-av block');
assert.ok(!/47,\s*111,\s*237/.test(avBlock[0]), 'no product-blue glow on .ha-av');
assert.ok(/box-shadow:[^;]*rgba\(\s*188,\s*152,\s*96/.test(avBlock[0]), 'warm neutral av shadow');

assert.ok(/--ha-edge-border-soft/.test(block) && /--ha-edge-shadow-a0/.test(block), 'g=0 edge floor tokens retained');
assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card scroll glow retained');
assert.ok(!/ha-pastel|ha-shell/.test(appJs), 'no section gradient flash layers');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(/^1\.9\.\d+$/.test(pkg.version), 'semver 1.9.x');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-196-test OK');
