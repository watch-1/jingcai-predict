'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const bootJs = fs.readFileSync(path.join(root, 'public/data-center-boot.json'), 'utf8');
const inlineJs = fs.readFileSync(path.join(root, 'public/data-center-boot-slices.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

assert.ok(/function seedBootPackFromInline/.test(appJs), 'inline boot seed');
assert.ok(/function resolveDcPlayerEspnId/.test(appJs), 'value-board espn id resolve');
assert.ok(/function dcAvatarImgError/.test(appJs), 'avatar fallback chain');
assert.ok(/data-center-boot-slices\.js/.test(indexHtml), 'index loads inline boot');
assert.ok(/window\.__JC_DC_BOOT__=/.test(inlineJs), 'inline boot payload');
assert.ok(/jc-v1\.9\.2\d\d/.test(swJs), 'SW VER 1.9.2xx');

const boot = JSON.parse(bootJs);
const pedri = boot.slices['laliga:playervalues'].rows.find((r) => r.player === 'Pedri');
assert.strictEqual(pedri.playerId, '250465', 'Pedri espn id in boot playervalues');
assert.ok(boot.slices['bundesliga:topscorers'].rows.length >= 10, 'bundesliga topscorers boot');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(/^1\.9\.2\d\d$/.test(pkg.version), 'package 1.9.2xx');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.2\d\d/.test(ver));
assert.ok(/VERSION_CODE=2[5-8]\d/.test(ver));

console.log('ui-209-test OK');
