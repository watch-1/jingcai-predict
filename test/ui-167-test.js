// 1.9.167: tribe hub dual-scroll shell + tribe-club immersive hero + follow sig.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
assert.ok(/view--tribe-hub/.test(appJs));
assert.ok(/view--tribe-club/.test(appJs));
assert.ok(/tribe-club-hero/.test(appJs));
assert.ok(/tribe-join-btn/.test(appJs));
assert.ok(/tribe-club:/.test(appJs) && /isTribeFollow\(tid\)/.test(appJs));
assert.ok(/patchTribeJoinBtn/.test(appJs));
assert.ok(/\.view\.view--tribe-hub/.test(css));
assert.ok(/overscroll-behavior: contain/.test(css));
assert.ok(/tribe-club-hero/.test(css));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.167');

console.log('ui-167-test OK');
