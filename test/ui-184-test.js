// 1.9.184: schedule top date spindle (continuous drag + snap, no gray/blue frames).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function schDateSpindleHtml/.test(appJs), 'spindle markup in top chrome');
assert.ok(/SCH_SPINDLE_SLOT = 70/.test(appJs), '70px slot spacing');
assert.ok(/function initSchDateSpindle/.test(appJs), 'spindle drag init');
assert.ok(/function paintSchDateSpindlePerspective/.test(appJs), 'perspective paint');
assert.ok(/function commitSchDate/.test(appJs), 'shared date commit');
assert.ok(/schDateStep/.test(appJs), 'date step handler');
assert.ok(!/data-act="schMode"/.test(appJs), 'schMode buttons removed from app');
assert.ok(/let modeRows = classifiedDay/.test(appJs), 'schedule shows all matches for day');
assert.ok(!/h \+= dateStrip\(dates, S\.schDate/.test(appJs), 'no date strip under top bar on schedule');
assert.ok(!/tc-sch-date-pill/.test(appJs), 'no center date pill');
assert.ok(!/background:\s*#e8eaef/.test(css), 'no gray capsule on schedule date');

assert.ok(/\.tc-sch-date-spindle-track/.test(css), 'spindle track styles');
assert.ok(/\.tc-sch-date-spindle-label/.test(css), 'spindle label styles');
assert.ok(!/tc-sch-date-slot--center/.test(css), 'no center pill slot styles');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.184');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.184/.test(ver));
assert.ok(/VERSION_CODE=221/.test(ver));
assert.ok(/jc-v1\.9\.184/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-184-test OK');
