// 1.9.175: me drawer stats, feed userFollow pill, post/reply reactions.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, '../lib/db.js'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');

assert.ok(/data-act="userFollow"/.test(tribeJs) && /function followPill/.test(tribeJs), 'followPill userFollow');
assert.ok(!/data-act="tribeFollow"/.test(tribeJs), 'no tribeFollow on feed card');
assert.ok(/data-act="tribeReact"/.test(tribeJs), 'tribeReact buttons');
assert.ok(/data-act="tribeReplyLike"/.test(tribeJs), 'reply like button');
assert.ok(/tribe_post_reactions/.test(dbJs) && /tribe_reply_likes/.test(dbJs), 'like tables');
assert.ok(/\/tribe\/posts\/:postId\/reactions/.test(feedLib), 'post reactions API');
assert.ok(/\/tribe\/replies\/:replyId\/like/.test(feedLib), 'reply like API');

assert.ok(/data-go="#\/column\/wallet"/.test(appJs), 'cloud wallet stat link');
assert.ok(/data-go="#\/friends"/.test(appJs) && /<span>好友<\/span>/.test(appJs), 'friends stat');
assert.ok(!/md-stats[\s\S]*?<span>方案<\/span>/.test(appJs), 'plans stat removed from md-stats');
assert.ok(!/md-stats[\s\S]*?<span>知识库<\/span>/.test(appJs), 'kb stat removed from md-stats');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.175', 'package version bumped');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-175-test OK');
