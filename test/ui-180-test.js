// 1.9.180: tribe feed list vote instant refresh, vote-btn borders, iOS-style tribe FABs.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function refreshVoteUi/.test(tribeJs), 'refreshVoteUi helper');
assert.ok(/patchPostInCache\(tribeId, pid, \{ vote: j\.vote \}\)/.test(tribeJs), 'castVote patches cache with String ids');
assert.ok(/refreshVoteUi\(post, tribeId\)/.test(tribeJs), 'castVote repaints vote UI');
assert.ok(/tf-post-main\[data-post=/.test(tribeJs) && /\.tf-match-card/.test(tribeJs), 'detail vote block refresh');
assert.ok(/act === 'tribeVote'\) \{ ev\.stopPropagation\(\)/.test(tribeJs), 'vote click does not open post');

assert.ok(/\.vote-btn \{[^}]*border: 1px solid #d5dbe6/.test(css), 'vote buttons have visible default border');
assert.ok(!/\.vote-btn \{[^}]*border: 1px solid transparent/.test(css), 'vote buttons not transparent border');

assert.ok(/\.tribe-fab \{[^}]*background: #fff/.test(css), 'tribe FAB white background');
assert.ok(!/\.tribe-fab \{[^}]*var\(--tab-green/.test(css), 'tribe FAB not green fill');
assert.ok(/\.tribe-fab--post \{[^}]*width: 48px/.test(css), 'smaller post FAB');
assert.ok(/\.tribe-fab--refresh \{[^}]*width: 40px/.test(css), 'smaller refresh FAB');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.180', 'package version bumped');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-180-test OK');
