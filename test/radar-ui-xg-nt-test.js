'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

assert.ok(app.includes('id="sm-xg-'), '数据 tab has an xG slot');
assert.ok(app.includes('pack.xgHtml'), 'surface paints xgHtml');
assert.ok(server.includes('renderXgCardHtml'), 'API renders the xG card');
assert.ok(css.includes('.lu-xg'), 'xG card CSS');
assert.ok(css.includes('.xg-field'), 'zone field is counts, not dots');
assert.ok(app.includes('chartKind === \'nt-form\'') || app.includes('chartKind === "nt-form"') || app.includes("chartKind === 'nt-form'"));
assert.ok(app.includes('不拿俱乐部稳定水平冒充国家队真水平') || app.includes('不拿俱乐部稳定水平冒充'));
assert.ok(app.includes('function shootingCompareHtml'), 'xGoT stays a 对照 number');
assert.ok(app.includes("scale === 'fixed-club'") || app.includes('scale === "fixed-club"'));
assert.ok(app.includes('同一把俱乐部联赛尺子') || app.includes('不是两边互相压成 100'));
console.log('radar / xG UI source tests OK');
