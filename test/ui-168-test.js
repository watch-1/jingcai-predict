// 1.9.168: tribe in-circle feed + match-day vote post.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
assert.ok(/tribe-club-subnav/.test(appJs) || /clubFeedShell/.test(tribeJs));
assert.ok(/tribe-post/.test(appJs));
assert.ok(/JCTribeFeed/.test(tribeJs));
assert.ok(/tribe-feed\.js/.test(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')));
assert.ok(/\.tf-card/.test(css));
assert.ok(fs.existsSync(path.join(__dirname, '../lib/tribe-feed.js')));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.169');

console.log('ui-168-test OK');
