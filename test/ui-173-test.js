// 1.9.173: tribe feed/detail images use API-prefixed media URLs (Capacitor-safe).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

assert.ok(/function mediaUrl\s*\(/.test(tribeJs), 'mediaUrl helper');
assert.ok(/esc\(mediaUrl\(u\)\)/.test(tribeJs), 'images use mediaUrl');
assert.ok(tribeJs.includes('imagesHtml') && tribeJs.includes('detailImagesHtml'));
const imgFns = tribeJs.match(/function (?:imagesHtml|detailImagesHtml)\([\s\S]*?^  \}/gm) || [];
assert.ok(imgFns.length >= 2, 'both image html helpers present');
for (const fn of imgFns) {
  assert.ok(/mediaUrl\(u\)/.test(fn), 'helper prefixes with mediaUrl: ' + fn.slice(0, 40));
  assert.ok(! /src="\$\{esc\(u\)\}"/.test(fn), 'raw esc(u) src removed');
}
assert.ok(/window\.API\s*=\s*API/.test(appJs), 'API exposed on window');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.173');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.173/.test(ver));
assert.ok(/VERSION_CODE=210/.test(ver));
assert.ok(/jc-v1\.9\.173/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-173-test OK');
