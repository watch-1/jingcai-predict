// 1.9.177: visible reaction pops (defer DOM refresh), author delete post/reply.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');

assert.ok(/return new Promise/.test(tribeJs) && /POP_ANIM_MS/.test(tribeJs), 'bumpReactAnim returns promise');
assert.ok(/await animDone/.test(tribeJs) && /animDone\.then\(repaintFeedCard\)/.test(tribeJs), 'defer refresh until animation');
assert.ok(/refreshDetailReactions/.test(tribeJs), 'detail reaction refresh still present');
assert.ok(/data-act="tribePostDelete"/.test(tribeJs) && /data-act="tribeReplyDelete"/.test(tribeJs), 'delete UI markers');
assert.ok(/method: 'DELETE'/.test(tribeJs), 'client DELETE calls');

assert.ok(/-webkit-keyframes tf-pop-laugh-kf/.test(css), 'webkit laugh keyframes');
assert.ok(/\.68s/.test(css), 'longer fire animation duration');

assert.ok(/r\.delete\('\/tribe\/posts\/:postId'/.test(feedLib), 'delete post route');
assert.ok(/r\.delete\('\/tribe\/replies\/:replyId'/.test(feedLib), 'delete reply route');
assert.ok(/只能删除自己的帖子/.test(feedLib) && /只能删除自己的回贴/.test(feedLib), 'author-only messages');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.177', 'package version bumped');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-177-test OK');
