// 1.9.188: tribe match_vote — team id+name guard, cleanup wrong cards, leagueKey on feed ensure.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const feedLib = fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');

assert.ok(/resolveTribeSideForMatch/.test(feedLib), 'tribe side requires id+name agreement');
assert.ok(/cleanupWrongMatchVotePosts/.test(feedLib), 'stale match_vote cleanup');
assert.ok(/leagueKey/.test(tribeJs) && /q\.set\('leagueKey'/.test(tribeJs), 'client passes leagueKey on feed ensure');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.188');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.188/.test(ver));
assert.ok(/VERSION_CODE=225/.test(ver));
assert.ok(/jc-v1\.9\.188/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-188-test OK');
