'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');

assert.ok(/1\.9\.213 compact/.test(css), 'compact match card block');
assert.ok(/\.mc-teams \.badge \{ width: 21px/.test(css), 'compact crest in mc-teams');
assert.ok(/\.ls-side \.badge \{ width: 21px/.test(css), 'compact crest in schedule row');
assert.ok(/\.mc-teams \.t \.n \{[^}]*font-size: 13\.5px/.test(css), 'compact team name');
assert.ok(/\.mc-mid \.score \{ font-size: 19px/.test(css), 'compact main score');
assert.ok(/\.mc \{ padding: 5px 12px 6px/.test(css), 'tight mc padding');
assert.ok(/\.ls-row \{[^}]*padding: 5px 12px 6px/.test(css), 'tight ls-row padding');

assert.ok(/jc-v1\.9\.218/.test(swJs), 'SW VER 1.9.218');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.218');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.218/.test(ver));
assert.ok(/VERSION_CODE=255/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.218');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-1\.9\.215\}"/.test(apkSh), 'build-apk default VERSION_NAME');
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-255\}"/.test(apkSh), 'build-apk default VERSION_CODE');

console.log('ui-213-test OK');
