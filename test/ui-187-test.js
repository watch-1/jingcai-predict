// 1.9.187: schedule date spindle — equal chrome wings, calendar via click + dismiss guard, center tap path.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/--tc-sch-wing/.test(css), 'equal wing width variable for schedule chrome');
assert.ok(/grid-template-columns:\s*var\(--tc-sch-wing\)/.test(css), 'schedule grid uses equal wing columns');
assert.ok(/\.top-chrome--schedule \.tc-slot-l/.test(css) && /\.top-chrome--schedule \.tc-slot-r/.test(css), 'schedule wing slot sizing');
assert.ok(/data-act="schDateOpenCal"/.test(appJs), 'center blue opens calendar via click delegation');
assert.ok(/case 'schDateOpenCal'/.test(appJs), 'calendar open act handler');
assert.ok(/schSheetDismissGuardUntil/.test(appJs), 'mask dismiss guard after calendar open');
assert.ok(!/pointerup[\s\S]{0,800}openSchDateCalendar/.test(appJs), 'calendar not opened from pointerup handler');
assert.ok(/pointer-events:\s*auto/.test(css) && /\.tc-sch-date-spindle-center-hi[\s\S]*pointer-events:\s*auto/.test(css), 'center overlay receives taps');
assert.ok(!/tc-sch-date-step[\s\S]*schDateSpindleHtml/.test(appJs), 'no side step buttons in top-bar spindle');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(/^1\.9\.\d+$/.test(pkg.version), 'semver 1.9.x');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-187-test OK');
