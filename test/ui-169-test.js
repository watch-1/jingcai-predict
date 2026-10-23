// 1.9.169: tribe-club circle feed chrome (tabs, FAB, card list).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
assert.ok(/tribe-club-bar/.test(appJs));
assert.ok(/tribe-club-fabs/.test(appJs));
assert.ok(/tribeFeedTab/.test(tribeJs));
assert.ok(/tribeFeedRefresh/.test(tribeJs));
assert.ok(/tf-essence/.test(css));
assert.ok(/tribe-fab--post/.test(css));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.169');

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.169/.test(ver));
assert.ok(/VERSION_CODE=206/.test(ver));

console.log('ui-169-test OK');
