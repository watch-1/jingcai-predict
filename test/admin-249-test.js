#!/usr/bin/env node
/** Admin Console v2 smoke (1.9.249): schema, audit, pageviews, health, covers catalog. */
'use strict';

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const { db } = require('../lib/db');
const audit = require('../lib/admin-audit');
const pageViews = require('../lib/page-views');
const adminHealth = require('../lib/admin-membership');
const newsCovers = require('../lib/admin-news-covers');
const adminBackup = require('../lib/admin-backup');

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('app_page_views','admin_audit_log','news_cover_assets')"
).all().map((r) => r.name);
ok(tables.includes('app_page_views'), 'app_page_views table');
ok(tables.includes('admin_audit_log'), 'admin_audit_log table');
ok(tables.includes('news_cover_assets'), 'news_cover_assets table');

const fakeReq = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
audit.log(fakeReq, 'test.admin_ping', 'test', '1', '单元测试写入');
const listed = audit.list({ action: 'test.admin_ping', limit: 5 });
ok(listed.total >= 1 && listed.logs[0].summary.includes('单元'), 'audit list filter');

const pv = pageViews.record('#/admin-test');
ok(pv.ok === true, 'page-view record');
const series = pageViews.seriesDays(3);
ok(Array.isArray(series) && series.length === 3, 'page-view series');

const health = adminHealth.computeHealth({ apiFootball: { remaining: 50, limit: 100 }, deepseekConfigured: true, liveEventsLagCount: 0, pendingCovers: 0 });
ok(Array.isArray(health.alerts) && health.alerts.length >= 3, 'health alerts');
ok(Array.isArray(health.todos), 'health todos');

const catalog = newsCovers.mergeCatalog();
ok(Array.isArray(catalog) && catalog.length >= 1, 'news cover catalog merge');

const bk = adminBackup.listBackups();
ok(bk && typeof bk.files === 'object', 'backup list');

const funnel = adminHealth.funnelMetrics();
ok(typeof funnel.registered === 'number', 'funnel metrics');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-249');
process.exit(fails ? 1 : 0);
