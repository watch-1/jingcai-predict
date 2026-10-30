#!/usr/bin/env node
/** Admin dashboard charts (1.9.251): merged 14d series + WoW deltas. */
'use strict';

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const charts = require('../lib/admin-dashboard-charts');
const pageViews = require('../lib/page-views');

const pv = pageViews.seriesDays(14);
ok(Array.isArray(pv) && pv.length === 14, 'page-view 14d baseline');

const pack = charts.buildDashboardCharts(pv);
ok(Array.isArray(pack.series14d) && pack.series14d.length === 14, 'merged series14d length');
ok(pack.series14d[0].day && 'views' in pack.series14d[0], 'merged row shape');
ok(pack.deltas && typeof pack.deltas.views === 'number', 'views delta number');

const users = charts.usersSeries14d();
ok(users.length === 14 && typeof users[0].signups === 'number', 'users series');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-251');
process.exit(fails ? 1 : 0);
