'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const layout = require('../public/js/lineup-layout');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.ok(/216mf398|216mf399|216mf400|216mf401/.test(index), 'cache stamp 398');
assert.ok(app.includes('function luPitchLinesSvg'), 'pitch svg helper');
assert.ok(app.includes('${luPitchLinesSvg()}') || app.includes('${luPitchLinesSvg() }'), 'board uses pitch svg');
assert.ok(app.includes('class="lu-box"'), 'penalty area class');
assert.ok(app.includes('class="lu-goal"'), 'goal frame class');
assert.ok(app.includes('class="lu-six"'), 'six-yard box');
assert.ok(!/luBoardHtml[\s\S]{0,800}class="lu-mid"/.test(app), 'old mid-only marks are gone from the board');
assert.ok(css.includes('.lu-lines'), 'line layer css');
assert.ok(css.includes('margin-left:-12px'), 'pitch breaks the 12px pane gutter');
assert.ok(!css.includes('.lu-pitch{'), 'no green pitch layer');

assert.deepStrictEqual(layout.xsForCount(3), [10, 50, 90]);
assert.strictEqual(layout.xsForCount(4)[0], 8);
assert.strictEqual(layout.xsForCount(4)[3], 92);
assert.strictEqual(layout.xsForCount(5)[0], 6);
assert.ok(layout.xsForCount(3)[0] < 18, 'a 3-man line sits closer to the touchline than the old 18% pad');
assert.deepStrictEqual(layout.xsForCount(2), [22, 78], 'a pair stays central, not on the touchlines');

const svg = (app.match(/function luPitchLinesSvg\(\) \{[\s\S]*?\n\}/) || [''])[0];
assert.ok(svg.includes('width="403.2"') && svg.includes('height="165"'), 'penalty box uses 40.32m × 16.5m');
assert.ok(svg.includes('width="73.2"') && svg.includes('height="22"'), 'goal frame 7.32m wide');
assert.ok((svg.match(/class="lu-goal"/g) || []).length >= 1, 'goal group present');
assert.ok((svg.match(/x="303.4"/g) || []).length === 2, 'two goal mouths, one at each end');
console.log('ui-398-pitch-test ok');
