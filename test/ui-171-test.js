// 1.9.171: tribe compose gallery pick wired (toolbar button + file input + draft images).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/tribe-compose/.test(appJs) && /mountCompose\(composeTid\)/.test(appJs));
assert.ok(/data-act="tribeComposePick"/.test(tribeJs) && /pickComposeImages/.test(tribeJs));
assert.ok(/tribe-compose-files/.test(tribeJs) && /bindComposeFileInput/.test(tribeJs));
assert.ok(!/tf-pick-img input \{ display: none/.test(css), 'avoid display:none file input');
assert.ok(/tf-compose-file-input/.test(css));
assert.ok(/jc_tribe_compose_draft_v1/.test(tribeJs));

const mainJava = fs.readFileSync(path.join(__dirname, '../android/src/com/tiicai/jingcai/MainActivity.java'), 'utf8');
assert.ok(/onShowFileChooser/.test(mainJava), 'Android WebView file chooser');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.171', 'package version bumped');

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));

console.log('ui-171-test OK');
