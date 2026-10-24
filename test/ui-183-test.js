// 1.9.183: schedule top date carousel (5-day taper + horizontal drag).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function schDateAdjusterHtml/.test(appJs), 'schedule date adjuster in top chrome');
assert.ok(/tc-sch-date-track/.test(appJs), 'five-day carousel track');
assert.ok(/tc-sch-date-slot--far/.test(appJs), 'far side date slots');
assert.ok(/function initSchDateCarousel/.test(appJs), 'drag carousel init');
assert.ok(/function commitSchDate/.test(appJs), 'shared date commit');
assert.ok(/schDateStep/.test(appJs), 'date step handler');
assert.ok(!/data-act="schMode"/.test(appJs), 'schMode buttons removed from app');
assert.ok(/let modeRows = classifiedDay/.test(appJs), 'schedule shows all matches for day');
assert.ok(!/h \+= dateStrip\(dates, S\.schDate/.test(appJs), 'no date strip under top bar on schedule');

assert.ok(/\.tc-sch-date-track/.test(css), 'carousel track grid');
assert.ok(/tc-sch-date-slot--center/.test(css), 'center pill slot styles');
assert.ok(/grid-template-columns/.test(css), 'fixed columns prevent pill overlap');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.183');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.183/.test(ver));
assert.ok(/VERSION_CODE=220/.test(ver));
assert.ok(/jc-v1\.9\.183/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-183-test OK');
