// 1.9.190: home mid-page tabs 比赛态度 | 圈子热议 + GET /tribe/hot
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');
const tribeUi = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/homeMidTab/.test(appJs) && /圈子热议/.test(appJs), 'home mid tabs in app.js');
assert.ok(/fillHomeTribeHot/.test(appJs) && /\/tribe\/hot/.test(appJs), 'home hot feed loader');
assert.ok(/homeHotFeed/.test(appJs), 'home hot feed container id');
assert.ok(/r\.get\('\/tribe\/hot'/.test(feedLib) && /listHotTribePosts/.test(feedLib), 'tribe hot API');
assert.ok(/tribeLabel/.test(tribeUi) && /homeHot/.test(tribeUi), 'tribe card home hot options');
assert.ok(/\.ha-tab/.test(css) && /\.tf-tribe-pill/.test(css), 'home tab + tribe pill styles');

console.log('ui-190-test OK');
