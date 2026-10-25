// 1.9.195: ha-card readable edge floor at g=0 + gold/silver wrap retained
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

const haCardBlock = css.match(/\.ha-card\s*\{[\s\S]*?\.ha-card:active/);
assert.ok(haCardBlock, 'ha-card CSS block');
const block = haCardBlock[0];

assert.ok(!/168,\s*206,\s*255|210,\s*232,\s*255|#a8ceff|#eef2f8/i.test(block), 'no sky-blue wrap RGBAs in ha-card');
assert.ok(/--ha-wrap-gold/.test(block) && /--ha-wrap-silver/.test(block), 'gold/silver wrap tokens');
assert.ok(/var\(--ha-wrap-gold\)/.test(block) && /var\(--ha-wrap-silver\)/.test(block), 'wrap uses gold→silver vars');

assert.ok(/--ha-edge-border-soft/.test(block) && /--ha-edge-shadow-a0/.test(block), 'g=0 edge floor tokens');
const softBorder = block.match(/--ha-edge-border-soft:\s*([^;]+)/);
assert.ok(softBorder, 'soft border floor defined');
const softAlpha = parseFloat((softBorder[1].match(/,\s*([\d.]+)\s*\)/) || [])[1] || '0');
assert.ok(softAlpha >= 0.75, 'soft border alpha floor readable at g=0');
const shA0 = parseFloat((block.match(/--ha-edge-shadow-a0:\s*([\d.]+)/) || [])[1] || '0');
const shB0 = parseFloat((block.match(/--ha-edge-shadow-b0:\s*([\d.]+)/) || [])[1] || '0');
assert.ok(shA0 >= 0.02 && shB0 >= 0.04, 'non-zero shadow floor at g=0');
const shA1 = parseFloat((block.match(/--ha-edge-shadow-a1:\s*([\d.]+)/) || [])[1] || '0');
const shB1 = parseFloat((block.match(/--ha-edge-shadow-b1:\s*([\d.]+)/) || [])[1] || '0');
assert.ok(shA1 > shA0 && shB1 > shB0, 'g→1 shadow still ramps above floor');

assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card scroll glow retained');
assert.ok(!/ha-pastel|ha-shell/.test(appJs), 'no section gradient flash layers');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(/^1\.9\.\d+$/.test(pkg.version), 'semver 1.9.x');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-195-test OK');
