// 1.9.185: schedule date spindle v15 — center overlay, drag hides blue, calendar sheet, pointer-events on overlay.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/tc-sch-date-spindle-center-hi/.test(appJs), 'center blue overlay markup');
assert.ok(/function updateSchDateSpindleCenterHi/.test(appJs), 'center overlay updater');
assert.ok(/function openSchDateCalendar/.test(appJs), 'calendar sheet open handler');
assert.ok(/function renderSchDateCalendarSheet/.test(appJs), 'calendar sheet render');
assert.ok(/sch-date-cal-week/.test(appJs) && /日/.test(appJs), 'calendar weekday row');
assert.ok(/is-pressing/.test(appJs) && /is-dragging/.test(appJs), 'dragging/pressing hides blue overlay');
assert.ok(/lab\.style\.color = '#8E8E93'/.test(appJs), 'track labels gray only during paint');
assert.ok(!/isCenter \? '#007AFF'/.test(appJs), 'no blue on track labels');
assert.ok(/pointer-events:\s*none/.test(css) && /\.tc-sch-date-spindle-center-hi[\s\S]*pointer-events:\s*none/.test(css), 'blue overlay does not block drag');
assert.ok(/\.tc-sch-date-spindle\.is-dragging \.tc-sch-date-spindle-center-hi/.test(css), 'dragging hides center overlay in CSS');
assert.ok(/\.sch-date-cal-sheet/.test(css), 'calendar sheet styles');
assert.ok(/case 'schCalPick'/.test(appJs), 'calendar day pick commits date');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.185');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.185/.test(ver));
assert.ok(/VERSION_CODE=222/.test(ver));
assert.ok(/jc-v1\.9\.185/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-185-test OK');
