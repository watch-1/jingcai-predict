// 1.9.172: tribe image upload body limit + post detail 回贴 UI.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

assert.ok(/\/api\/tribe\/upload.*express\.json\(\{ limit: '3mb' \}\)/.test(serverJs), 'tribe upload json limit');
assert.ok(/express\.json\(\{ limit: '3mb' \}\)/.test(fs.readFileSync(path.join(__dirname, '../lib/tribe-feed.js'), 'utf8')));
assert.ok(/tf-post-hdr/.test(tribeJs) && /回贴/.test(tribeJs) && /tf-huitie-bar/.test(tribeJs));
assert.ok(/view--tribe-post/.test(appJs) && /view--tribe-post/.test(css));
assert.ok(/tf-post-foot/.test(css) && /回复楼主/.test(tribeJs));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.172', 'package version bumped');

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.172/.test(ver));
assert.ok(/VERSION_CODE=209/.test(ver));

console.log('ui-172-test OK');
