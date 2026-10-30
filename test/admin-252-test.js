#!/usr/bin/env node
/** Admin dashboard polish (1.9.252): smooth chart paths + inline SVG icons. */
'use strict';

const fs = require('fs');
const path = require('path');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const charts = require('../lib/admin-dashboard-charts');
const smooth = charts.chartSmooth;
ok(smooth && typeof smooth.smoothPathThrough === 'function', 'chartSmooth export');

const curve = smooth.smoothPathThrough([
  { x: 0, y: 10 },
  { x: 20, y: 30 },
  { x: 40, y: 5 },
  { x: 60, y: 25 },
]);
ok(curve.includes(' C '), 'smooth path uses cubic beziers');
ok(!curve.includes(' L 20'), 'smooth path avoids crude polyline segments');

const area = smooth.smoothAreaBetween(
  [{ x: 0, y: 10 }, { x: 30, y: 20 }, { x: 60, y: 15 }],
  [{ x: 0, y: 40 }, { x: 30, y: 40 }, { x: 60, y: 40 }]
);
ok(area.endsWith(' Z') && area.includes(' C '), 'smooth stacked band');

const spark = smooth.renderSparklineSvg([0, 1, 2, 1, 4], '#14b8a6');
ok(spark.includes('linearGradient') && spark.includes('spark-baseline'), 'sparkline gradient + baseline');
ok(spark.includes(' C '), 'sparkline smooth stroke');

const flatSpark = smooth.renderSparklineSvg([3, 3, 3, 3], '#6366f1');
ok(!flatSpark.includes('持平') && flatSpark.includes('sparkline--quiet'), 'flat sparkline quiet track without label');

const adminJs = fs.readFileSync(path.join(__dirname, '../public/admin/admin.js'), 'utf8');
ok(adminJs.includes('NAV_ICONS') && adminJs.includes('nav-ico'), 'admin.js nav icon set');
ok(adminJs.includes('KPI_ICONS') && adminJs.includes('chip-ico-wrap'), 'admin.js KPI + alert icons');
ok(adminJs.includes('smoothAreaBetween') || adminJs.includes('AdminChartSmooth'), 'admin.js uses smooth chart helper');
ok(adminJs.includes('linearGradient'), 'admin.js trend chart gradients');

const indexHtml = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
ok(indexHtml.includes('chart-smooth.js'), 'index loads chart-smooth.js');

const pack = charts.buildDashboardCharts(require('../lib/page-views').seriesDays(14));
ok(pack.series14d.length === 14, 'dashboard charts API unchanged');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-252');
process.exit(fails ? 1 : 0);
