// 1.9.191: home mid tabs compact layout + hot feed excludes match_vote
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/\.ha-sec-h\.ha-tabs[\s\S]*justify-content:\s*flex-start/.test(css), 'tabs row left-aligned not space-between');
assert.ok(/\.ha-tab[\s\S]*font-size:\s*14px/.test(css), 'smaller tab font');
assert.ok(/\.ha-tabs[\s\S]*gap:\s*14px/.test(css), 'gap between tabs');
assert.ok(/kind != 'match_vote'/.test(feedLib), 'hot API excludes match_vote');
assert.ok(/filter\(\(p\) => p\.kind !== 'match_vote'\)/.test(appJs), 'home hot client filter');

console.log('ui-191-test OK');
