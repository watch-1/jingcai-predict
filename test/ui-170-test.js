// 1.9.170: immersive tribe-club hero, top-right 入驻, full-page compose + draft.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const tribeJs = fs.readFileSync(path.join(__dirname, '../public/js/tribe-feed.js'), 'utf8');

assert.ok(!/tribeClubMore/.test(appJs), 'removed more sheet');
assert.ok(/tribe-club-hero/.test(appJs) && /tribe-join-btn/.test(appJs));
assert.ok(/tribe-compose/.test(appJs) && /pageTribeCompose/.test(appJs));
assert.ok(/tribeComposeCancel/.test(tribeJs) && /jc_tribe_compose_draft_v1/.test(tribeJs));
assert.ok(/发布帖子/.test(tribeJs) && /取消/.test(tribeJs));
assert.ok(!/closeSheet/.test(tribeJs), 'compose no longer uses sheet');
assert.ok(/tribe-compose-page/.test(css));

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.170', 'package version bumped');

console.log('ui-170-test OK');
