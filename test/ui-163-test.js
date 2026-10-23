// 1.9.163: match-detail sticky tab strip must opaque-cover scrolling cards.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

const mdTabs = css.match(/\.view\.sub\.md-wrap \.dtabs\s*\{[^}]+\}/);
assert.ok(mdTabs, '.view.sub.md-wrap .dtabs rule must exist');
const mdBlock = mdTabs[0];
assert.ok(/position:\s*sticky/.test(mdBlock), 'md-wrap dtabs must be sticky');
assert.ok(/z-index:\s*32/.test(mdBlock), 'md-wrap dtabs needs z-index above scrolling cards');
assert.ok(/top:\s*0/.test(mdBlock), 'md-wrap dtabs sticks to viewport top (no phantom hdr offset)');
assert.ok(/background:\s*#fff/.test(mdBlock), 'md-wrap dtabs needs solid white strip');
assert.ok(/isolation:\s*isolate/.test(mdBlock), 'md-wrap dtabs should isolate stacking');

const mdBtn = css.match(/\.view\.sub\.md-wrap \.dtabs button\s*\{[^}]+\}/);
assert.ok(mdBtn && /background-color:\s*#fff/.test(mdBtn[0]), 'tab buttons need opaque default bg');

const mdPane = css.match(/\.view\.sub\.md-wrap \.detail-pane\s*\{[^}]+\}/);
assert.ok(mdPane && /z-index:\s*0/.test(mdPane[0]), 'detail-pane stays under tab strip');

console.log('ui-163-test OK');
