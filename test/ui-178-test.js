// 1.9.178: ⋯ more-menu for author delete (post detail author row, feed, reply).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');

assert.ok(/data-act="tribeMoreOpen"/.test(tribeJs) && /\.tf-more-btn/.test(css), 'more-menu UI markers');
assert.ok(/function openMoreMenu/.test(tribeJs) && /tf-more-pop/.test(tribeJs), 'popover menu implementation');
assert.ok(/tf-post-author-r/.test(tribeJs) && /ownPostMoreBtn\(post\)/.test(tribeJs), 'detail author row more button');
assert.ok(!/tf-post-hdr-del/.test(tribeJs), 'no header delete button');
assert.ok(!/aria-label="删除帖子">删除<\/button>/.test(tribeJs), 'no naked post delete in markup');
assert.ok(/data-act="tribePostDelete"/.test(tribeJs) && /data-act="tribeReplyDelete"/.test(tribeJs), 'delete actions in menu');
assert.ok(/确定删除这条帖子？删除后不可恢复。/.test(tribeJs), 'post delete confirm copy');
assert.ok(/method: 'DELETE'/.test(tribeJs), 'client DELETE calls');

assert.ok(/r\.delete\('\/tribe\/posts\/:postId'/.test(feedLib), 'delete post route');
assert.ok(/r\.delete\('\/tribe\/replies\/:replyId'/.test(feedLib), 'delete reply route');
assert.ok(/只能删除自己的帖子/.test(feedLib) && /只能删除自己的回贴/.test(feedLib), 'author-only messages');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.178');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.178/.test(ver));
assert.ok(/VERSION_CODE=215/.test(ver));
assert.ok(/jc-v1\.9\.178/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-178-test OK');
