'use strict';
// 1.9.263: live scores blue; 已结束 section separator on schedule list.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();

assert.ok(/VERSION=1\.9\.265/.test(ver));
assert.ok(/VERSION_CODE=301/.test(ver));
assert.ok(/jc-v1\.9\.265/.test(swJs));
assert.strictEqual(pkg.version, '1.9.265');
assert.strictEqual(cfg.version, '1.9.265');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.265\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-301\}"/.test(apkSh));

const scoreCol = appJs.match(/function matchScoreColumn\([\s\S]*?^\}/m);
assert.ok(scoreCol && /score num is-live/.test(scoreCol[0]), 'live score marked is-live');
assert.ok(scoreCol && /kind === 'ft'[\s\S]*?class="score num"/.test(scoreCol[0]), 'FT score not is-live');

const bodyFn = appJs.match(/function scheduleBodyHtml[\s\S]*?^\}/m)?.[0] || '';
assert.ok(/ls-sec-ft/.test(bodyFn), 'finished section separator');
assert.ok(/已结束/.test(bodyFn), '已结束 label');
assert.ok(!/lg-group/.test(bodyFn), 'still no league group headers');

assert.ok(/\.ls-mid \.score\.is-live/.test(css) && /color:\s*var\(--pri\)/.test(css), 'live score uses brand blue');
assert.ok(/\.ls-sec-ft \{/.test(css), 'separator styles');
assert.ok(/\.ls-mid \.score \{[^}]*color:\s*var\(--red\)/.test(css), 'default/FT score stays red');

console.log('ui-263-test OK');
