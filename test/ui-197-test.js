// 1.9.197: slightly stronger rgba gold wrap + attitude feed cache/card markup guards
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

assert.ok(/opacity:\s*calc\(\.47 \+ var\(--ha-g\) \* \.48\)/.test(before), '1.9.197 ::before opacity bump');
assert.ok(/rgba\(var\(--ha-wrap-gold\),\s*calc\(0\.55 \+ \(1 - var\(--ha-g\)\) \* 0\.40\)/.test(before), 'gold radial alpha bump');

const shA0 = parseFloat((block.match(/--ha-edge-shadow-a0:\s*([\d.]+)/) || [])[1] || '0');
assert.ok(shA0 >= 0.028, 'edge shadow floor bumped');

const avBlock = css.match(/\.ha-av\s*\{[\s\S]*?\n\}/);
assert.ok(avBlock, '.ha-av block');
assert.ok(!/47,\s*111,\s*237/.test(avBlock[0]), 'no product-blue glow on .ha-av');
assert.ok(/box-shadow:[^;]*rgba\(\s*188,\s*152,\s*96/.test(avBlock[0]), 'warm neutral av shadow');

assert.ok(/z-index:\s*2/.test(css.match(/\.ha-card > \*\s*\{[^}]+\}/)[0]), 'card content above ::before glow');

assert.ok(/homeAttitudeFeedHtmlValid/.test(appJs), 'cache HTML validator');
assert.ok(/homeAttitudeFeedDomValid/.test(appJs), 'live DOM validator');
assert.ok(/jc_home_att_v[23]/.test(appJs), 'cache key bumped to drop corrupt v1 snaps');
assert.ok(/homeAttitudeCardFromPost[\s\S]*?ha-hd[\s\S]*?ha-name[\s\S]*?ha-teaser/.test(appJs), 'card template includes header + teaser');
assert.ok(/homeAttitudeFeedHtmlValid\(html\)/.test(appJs), 'persist validates markup');
assert.ok(/homeSnapAttitudeFeedChunk/.test(appJs), 'home snap attitude chunk guard');
assert.ok(!/ha-pastel|ha-shell/.test(appJs), 'no section gradient flash layers');
assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card scroll glow retained');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(/^1\.9\.\d+$/.test(pkg.version), 'semver 1.9.x');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-197-test OK');
