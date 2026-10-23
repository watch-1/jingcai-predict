// 1.9.174: avatars via avatarHtml, post detail user-follow, friends route, trimmed bottom bar.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const authJs = fs.readFileSync(path.join(__dirname, '../lib/auth.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8');

assert.ok(/function avatarHtml\s*\(/.test(appJs), 'avatarHtml in app.js');
assert.ok(/window\.avatarHtml\s*=\s*avatarHtml/.test(appJs), 'avatarHtml exposed');
assert.ok(/user_follows/.test(dbJs), 'user_follows table');
assert.ok(/\/user-follows\/following/.test(authJs), 'following API');
assert.ok(/detailUserFollowBtn/.test(tribeJs), 'user follow on post detail');
assert.ok(/data-act="userFollow"/.test(tribeJs), 'userFollow act');
assert.ok(!/detailFollowBtn/.test(tribeJs), 'tribe follow btn removed from detail');
assert.ok(!/tf-post-foot-acts/.test(tribeJs), 'bottom icon strip removed');
assert.ok(/pageFriends/.test(appJs) && /friends:\s*pageFriends/.test(appJs), 'friends page registered');
assert.ok(/meDrawerRow\('#\/friends'/.test(appJs), 'friends drawer row');
assert.ok(/好友/.test(appJs), 'friends label');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.174', 'package version bumped');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-174-test OK');
