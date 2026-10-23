// 1.9.164: data-center standings table must use fixed layout + compact columns (no right-edge clip).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

assert.ok(/\.dc-table:not\(\.dc-mv\)\s*\{[^}]*table-layout:\s*fixed/.test(css), 'standings table needs table-layout: fixed');
assert.ok(/\.dc-table:not\(\.dc-mv\)[^{]+\.tm[^{]+\{[^}]*max-width:\s*0/.test(css), 'team column needs max-width:0 shrink trick');
assert.ok(/th class="dc-st gfga">进\/失<\/th>/.test(appJs), 'standings header marks 进/失 column');
assert.ok(/<td class="num dc-st gfga">/.test(appJs), 'standings rows mark gfga cells');

console.log('ui-164-test OK');
