// 1.9.166: tribe circles hub + tribe-club placeholder feed.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
assert.ok(/function pageTribe\(\)/.test(appJs));
assert.ok(/function pageTribeClub\(/.test(appJs));
assert.ok(/tribe-hub/.test(appJs));
assert.ok(/暂无动态，发帖功能即将开放/.test(appJs));
assert.ok(/\/tribe-follows/.test(appJs));
assert.ok(/\.tribe-grid/.test(css));

const authJs = fs.readFileSync(path.join(__dirname, '../lib/auth.js'), 'utf8');
assert.ok(/tribe_follows/.test(authJs) || /tribe-follows/.test(authJs));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.166', 'package version bumped');

console.log('ui-166-test OK');
