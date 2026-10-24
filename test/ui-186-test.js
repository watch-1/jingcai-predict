// 1.9.186: schedule spindle pointer helpers (retained in 1.9.187 with click-to-open calendar).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function schSpindleCenterTapHit/.test(appJs), 'center tap hit test helper');
assert.ok(/SCH_SPINDLE_TAP_MOVE_PX/.test(appJs), 'tap vs drag move threshold');
assert.ok(/wrap\.addEventListener\('pointerdown'/.test(appJs), 'spindle wrap pointer handlers');
assert.ok(/schSpindlePointerXY/.test(appJs) && /clientX/.test(appJs), 'pointer coords from event clientX/Y');
assert.ok(/case 'schCalPick'/.test(appJs) && /commitSchDate/.test(appJs), 'calendar sheet still commits via commitSchDate');
assert.ok(/\.tc-sch-date-spindle-center-hi/.test(css), 'center blue overlay styles');

console.log('ui-186-test OK');
