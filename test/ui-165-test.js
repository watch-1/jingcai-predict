// 1.9.165: match detail 事件 tab must not surface raw English upstream errors.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(/function liveStatsUserMsg\(live\)/.test(appJs));
assert.ok(/const why = liveStatsUserMsg\(live\)/.test(appJs));
assert.ok(!/>\$\{esc\(live\.(error|detail)/.test(appJs), 'must not render raw live-stats error fields in HTML');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.165');

console.log('ui-165-test OK');
