// 1.9.181: tribe hub search bar, layout fill, post detail reply chrome.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(!/进圈/.test(appJs) || !/tc-tab--tribe/.test(appJs), 'tribe sub tabs removed from top chrome');
assert.ok(/tribe-hub-search/.test(appJs) && /tribeFilterTeams/.test(appJs), 'tribe hub search + filter');
assert.ok(/搜索球队\/圈子/.test(appJs), 'search placeholder');
assert.ok(/softPatchTribeHub/.test(appJs), 'soft patch tribe grid on search');

assert.ok(/class="tf-post-reply-btn"/.test(tribeJs) && !/btn pri sm tf-post-reply-btn/.test(tribeJs), 'ios-style send button class');
assert.ok(/回贴/.test(tribeJs), 'huitie section preserved');

assert.ok(/\.tc-tribe-search/.test(css), 'tribe search chrome styles');
assert.ok(/\.app\.has-top-chrome \.view\.view--tribe-hub/.test(css), 'tribe hub height uses tab bar only');
assert.ok(/\.tf-huitie-title[\s\S]*font-size:\s*14px/.test(css), 'smaller huitie title');
assert.ok(/\.tf-post-reply-btn[\s\S]*background:\s*#fff/.test(css), 'white send button');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.181');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.181/.test(ver));
assert.ok(/VERSION_CODE=218/.test(ver));
assert.ok(/jc-v1\.9\.181/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-181-test OK');
