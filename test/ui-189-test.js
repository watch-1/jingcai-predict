// 1.9.189: tribe match_vote confirm dialog + vote lock (UI + API).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');
const authLib = fs.readFileSync(path.join(__dirname, '../lib/auth.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/投后不可改/.test(tribeJs) && !/可改选/.test(tribeJs), 'hint copy says vote is final');
assert.ok(/appConfirm\(`确定选择/.test(tribeJs), 'castVote uses in-app confirm');
assert.ok(/已投票，不可修改/.test(tribeJs), 'castVote blocks repeat tap');
assert.ok(/vote-btns--locked/.test(tribeJs) && /\.vote-btns--locked/.test(css), 'locked vote button styling');
assert.ok(/status\(409\)\.json\(\{ error: '已投票，不可修改' \}\)/.test(feedLib), 'tribe vote API rejects changes');
assert.ok(/status\(409\)\.json\(\{ error: '已投票，不可修改' \}\)/.test(authLib), 'match-vote API rejects changes');
assert.ok(/canVote: myVote == null/.test(feedLib), 'canVote false when already voted');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(/^1\.9\.\d+$/.test(pkg.version), 'semver 1.9.x');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-189-test OK');
