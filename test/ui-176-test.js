// 1.9.176: per-kind reaction pop animations, me-drawer back stack, version bump.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/tf-pop-laugh/.test(tribeJs) && /tf-pop-like/.test(tribeJs) && /tf-pop-fire/.test(tribeJs), 'per-kind pop class toggles');
assert.ok(/bumpReactAnim\(btnEl, kind\)/.test(tribeJs), 'bumpReactAnim passes kind');
assert.ok(/bumpReactAnim\(btnEl, 'like'\)/.test(tribeJs), 'reply like uses like pop');
assert.ok(/detailReactionsBar/.test(tribeJs), 'post detail reaction bar');
assert.ok(/ev\.stopPropagation\(\)/.test(tribeJs) && /tribeReact/.test(tribeJs), 'reaction click stops propagation');

assert.ok(/@keyframes tf-pop-laugh-kf/.test(css), 'laugh keyframes');
assert.ok(/@keyframes tf-pop-like-kf/.test(css), 'like keyframes');
assert.ok(/@keyframes tf-pop-fire-kf/.test(css), 'fire keyframes');
assert.ok(!/\.tf-pop[^-]/.test(css) && !/tf-react-pop/.test(css), 'generic tf-pop removed');

assert.ok(/meBackToDrawer/.test(appJs) && /isMeDrawerChildRoute/.test(appJs), 'me drawer back flag');
assert.ok(/el\.closest\('#me-drawer'\)/.test(appJs), 'me drawer nav sets back flag');
assert.ok(/reopenMe/.test(appJs) && /openMeDrawer\(\)/.test(appJs), 'back reopens me drawer');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.176');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.176/.test(ver));
assert.ok(/VERSION_CODE=213/.test(ver));
assert.ok(/jc-v1\.9\.176/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-176-test OK');
