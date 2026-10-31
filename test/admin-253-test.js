#!/usr/bin/env node
/** Admin sparkline zero-state fix (1.9.253): no SVG 「持平」, neutral 0% delta. */
'use strict';

const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const ver = fs.readFileSync(path.join(__dirname, '../VERSION.txt'), 'utf8');
ok(/VERSION=1\.9\.25[3-9]/.test(ver) || /VERSION=1\.9\.26/.test(ver), 'VERSION.txt at least 1.9.253');

const smooth = require('../public/admin/chart-smooth.js');

const zeros = smooth.renderSparklineSvg([0, 0, 0, 0, 0], '#6366f1');
ok(!zeros.includes('持平'), 'flat/zero sparkline has no SVG 持平 text');
ok(zeros === '' || !/<text[\s>]/.test(zeros), 'no SVG text in flat sparkline output');
ok(!zeros.includes('spark-track'), 'no dashed capsule track in SVG');

const flat = smooth.renderSparklineSvg([5, 5, 5, 5], '#14b8a6');
ok(!flat.includes('持平') && flat === '', 'non-zero flat series skips SVG');

const varied = smooth.renderSparklineSvg([0, 2, 1, 4], '#f59e0b');
ok(varied.includes(' C ') && !varied.includes('持平'), 'varied series still smooth');

const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin/admin.js'), 'utf8');
ok(/class="delta flat">0%/.test(adminJs), 'renderDelta uses neutral flat class for 0%');
ok(adminJs.includes('kpi-spark-wrap'), 'KPI sparklines wrapped for spacing');
ok(adminJs.includes('chart-bars-empty'), 'bar chart empty state');

const css = fs.readFileSync(path.join(__dirname, '../public/admin/admin.css'), 'utf8');
ok(css.includes('.delta.flat') && !css.includes('spark-flat-label'), 'CSS neutral delta, no flat SVG label style');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-253');
process.exit(fails ? 1 : 0);
