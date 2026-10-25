'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const tribeUi = fs.readFileSync(path.join(root, 'public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

assert.ok(/homeHotPosts/.test(appJs) && /S\.homeHotPosts = posts/.test(appJs), 'home hot posts cached in app state');
assert.ok(/patchHomeHotPost/.test(tribeUi) && /findReactionPost/.test(tribeUi), 'home hot reaction lookup');
assert.ok(/refreshFeedReactionUi/.test(tribeUi) && /refreshCardReactionUi/.test(tribeUi), 'immediate feed reaction paint');
assert.ok(/data-act="tribeReact".*data-kind="like"/.test(tribeUi), 'footer 赞 triggers like reaction');

assert.ok(/jc-v1\.9\.211/.test(swJs), 'SW VER 1.9.211');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.211');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.211/.test(ver));
assert.ok(/VERSION_CODE=248/.test(ver));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
assert.strictEqual(cfg.version, '1.9.211');

console.log('ui-211-test OK');
