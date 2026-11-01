#!/usr/bin/env node
/** Admin chart headroom + spark empty state (1.9.254). */
'use strict';

const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
ok(/VERSION=1\.9\.25[4-9]/.test(ver) || /VERSION=1\.9\.26/.test(ver) || /VERSION=1\.9\.27/.test(ver), 'VERSION.txt at least 1.9.254');

const smooth = require('../public/admin/chart-smooth.js');

const flatSvg = smooth.renderSparklineSvg([0, 0, 0], '#6366f1');
ok(flatSvg === '', 'flat sparkline SVG omitted');
ok(!flatSvg.includes('持平') && !flatSvg.includes('spark-track'), 'no 持平 or dashed capsule in SVG');

const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin/admin.js'), 'utf8');
ok(adminJs.includes('spark-empty-hint') && adminJs.includes('近14日无波动'), 'CSS empty hint for flat KPI');
ok(adminJs.includes('stackedTrendYExtents'), 'trend chart uses Y extent helper');
ok(adminJs.includes('valueToChartY'), 'trend chart maps values with padding');

const ext = smooth.stackedTrendYExtents([[1, 0, 1], [1, 0, 0], [1, 1, 0]]);
ok(ext.maxCum >= 2.99 && ext.yMax > ext.maxCum, 'stacked cumulative max gets headroom');

const padT = 22;
const innerH = 170;
const yPeak = smooth.valueToChartY(ext.maxCum, ext.yMin, ext.yMax, padT, innerH);
ok(yPeak > padT + 10, 'peak plots below top inset (no ceiling clip at maxCum)');

const yAtZero = smooth.valueToChartY(0, ext.yMin, ext.yMax, padT, innerH);
ok(yAtZero < padT + innerH - 4, 'baseline has bottom inset');

const css = fs.readFileSync(path.join(__dirname, '../public/admin/admin.css'), 'utf8');
ok(css.includes('.spark-empty-hint') && !css.includes('.spark-track'), 'CSS empty state, no spark-track');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-254');
process.exit(fails ? 1 : 0);
