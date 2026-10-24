// 1.9.186: schedule date spindle — smaller center blue label + wrap pointerup center tap opens calendar.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function schSpindleCenterTapHit/.test(appJs), 'center tap hit test helper');
assert.ok(/SCH_SPINDLE_TAP_MOVE_PX/.test(appJs), 'tap vs drag move threshold');
assert.ok(/wrap\.addEventListener\('pointerup'/.test(appJs), 'calendar tap resolved on spindle wrap pointerup');
assert.ok(/schSpindleCenterTapHit\(spindle/.test(appJs) && /openSchDateCalendar\(\)/.test(appJs), 'center tap opens calendar');
assert.ok(/schSpindlePointerXY/.test(appJs) && /clientX/.test(appJs), 'pointer coords from event clientX/Y');
assert.ok(/case 'schCalPick'/.test(appJs) && /commitSchDate/.test(appJs), 'calendar sheet still commits via commitSchDate');

assert.ok(/\.tc-sch-date-spindle-center-hi[\s\S]*font-size:\s*15px/.test(css), 'center blue label slightly smaller');
assert.ok(/pointer-events:\s*none/.test(css) && /\.tc-sch-date-spindle-center-hi[\s\S]*pointer-events:\s*none/.test(css), 'overlay still does not block drag');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.186');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.186/.test(ver));
assert.ok(/VERSION_CODE=223/.test(ver));
assert.ok(/jc-v1\.9\.186/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-186-test OK');
