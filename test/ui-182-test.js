// 1.9.182: schedule top date adjuster, all-day list, tribe name weight.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

assert.ok(/function schDateAdjusterHtml/.test(appJs), 'schedule date adjuster in top chrome');
assert.ok(/tc-sch-date-pill/.test(appJs), 'date pill markup');
assert.ok(/schDateStep/.test(appJs), 'date step handler');
assert.ok(!/data-act="schMode"/.test(appJs), 'schMode buttons removed from app');
assert.ok(/let modeRows = classifiedDay/.test(appJs), 'schedule shows all matches for day');
assert.ok(!/h \+= dateStrip\(dates, S\.schDate/.test(appJs), 'no date strip under top bar on schedule');

assert.ok(/\.tc-sch-date/.test(css), 'date adjuster styles');
assert.ok(/\.tribe-name[\s\S]*font-weight:\s*600/.test(css), 'tribe team names bolder');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
assert.strictEqual(pkg.version, '1.9.182');
const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
assert.ok(/VERSION=1\.9\.182/.test(ver));
assert.ok(/VERSION_CODE=219/.test(ver));
assert.ok(/jc-v1\.9\.182/.test(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8')));

console.log('ui-182-test OK');
