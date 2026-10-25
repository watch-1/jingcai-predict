// 1.9.194: 比赛态度卡片包裹 淡金→银灰（去除天蓝光晕）
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
assert.ok(/255,\s*218,\s*168/.test(block), 'pale gold stop present');
assert.ok(/186,\s*194,\s*206/.test(block), 'silver-gray stop present');

assert.ok(/homeAttitudeCardGlow/.test(appJs), 'per-card scroll glow retained');
assert.ok(!/ha-pastel|ha-shell/.test(appJs), 'no section gradient flash layers');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.194');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.194/.test(ver));
assert.ok(/VERSION_CODE=231/.test(ver));
assert.ok(/jc-v1\.9\.194/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-194-test OK');
