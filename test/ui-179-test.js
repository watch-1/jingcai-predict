// 1.9.179: in-app delete confirm (no window.confirm), multi-select post reactions.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');

assert.ok(/function appConfirm/.test(tribeJs) && /global\.confirmDlg/.test(tribeJs), 'appConfirm uses confirmDlg');
assert.ok(!/window\.confirm/.test(tribeJs), 'tribe-feed never uses window.confirm');
assert.ok(/window\.confirmDlg = confirmDlg/.test(appJs), 'confirmDlg exposed globally');

assert.ok(/myReactions/.test(tribeJs) && /myReactionSet/.test(tribeJs), 'client multi-reaction helpers');
assert.ok(!/myReaction:/.test(tribeJs.replace(/myReactions/g, '')), 'no single myReaction field in client patches');

assert.ok(/PRIMARY KEY \(post_id, user_id, kind\)/.test(dbJs), 'reactions PK includes kind');
assert.ok(/tribe_post_reactions_v179/.test(dbJs), 'reactions table migration');

assert.ok(/myReactions/.test(feedLib) && !/myReaction:/.test(feedLib), 'API returns myReactions array');
assert.ok(/AND kind = \?/.test(feedLib), 'per-kind reaction toggle');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.179');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.179/.test(ver));
assert.ok(/VERSION_CODE=216/.test(ver));
assert.ok(/jc-v1\.9\.179/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-179-test OK');
