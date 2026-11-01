// 1.9.183: schedule top date carousel (5-day taper + horizontal drag).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function commitSchDate/.test(appJs), 'shared date commit');
assert.ok(/schDateStep/.test(appJs), 'date step handler');
assert.ok(!/data-act="schMode"/.test(appJs), 'schMode buttons removed from app');
assert.ok(/let modeRows = classifiedDay/.test(appJs), 'schedule shows all matches for day');
assert.ok(/h \+= dateStrip\(dates, S\.schDate/.test(appJs), 'schedule reuses 开奖 dateStrip under top bar');

assert.ok(/\.tc-sch-date-spindle/.test(css) || /\.tc-sch-date/.test(css), 'schedule date chrome styles');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.ok(pkg.version >= '1.9.183', 'package version at least 1.9.183');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.\d+/.test(ver));
assert.ok(/VERSION_CODE=\d+/.test(ver));
assert.ok(/jc-v1\.9\.\d+/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-183-test OK');
