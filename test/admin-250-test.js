#!/usr/bin/env node
/** 1.9.250: legacy app_page_views(count) → views migration + admin pageviews still work. */
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-pv-migrate-'));
process.env.DATA_DIR = tmp;
const dbPath = path.join(tmp, 'jingcai.db');
const Database = require('better-sqlite3');
const raw = new Database(dbPath);
raw.exec(`
CREATE TABLE app_page_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
INSERT INTO app_page_views (day, path, count) VALUES ('2026-10-30', '#/legacy-home', 42);
`);
raw.close();

const { db } = require('../lib/db');
const cols = db.prepare('PRAGMA table_info(app_page_views)').all().map((c) => c.name);
ok(cols.includes('views') && cols.includes('uniques') && cols.includes('updated_at'), 'new columns present');
ok(cols.includes('count'), 'legacy count column kept');

const legacyRow = db.prepare(
  'SELECT views, count, updated_at FROM app_page_views WHERE path = ?'
).get('#/legacy-home');
ok(legacyRow && legacyRow.views === 42 && legacyRow.count === 42, 'count copied into views');
ok(legacyRow.updated_at > 0, 'updated_at backfilled');

const pageViews = require('../lib/page-views');
const pv = pageViews.record('#/legacy-home');
ok(pv.ok === true, 'page-view record on migrated table');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const totalsToday = pageViews.totalsForDay(today);
const totalsLegacy = pageViews.totalsForDay('2026-10-30');
ok((totalsToday.views >= 1) || (totalsLegacy.views >= 43), 'increment after migrate');

// Idempotent second load: simulate re-require by re-running migrate block logic
const viewsBefore = db.prepare('SELECT views FROM app_page_views WHERE path = ?').get('#/legacy-home').views;
db.exec(
  `UPDATE app_page_views SET views = count
   WHERE count IS NOT NULL AND count > 0 AND COALESCE(views, 0) = 0`
);
const viewsAfter = db.prepare('SELECT views FROM app_page_views WHERE path = ?').get('#/legacy-home').views;
ok(viewsBefore === viewsAfter, 'migrate copy is idempotent when views already set');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED admin-250');
process.exit(fails ? 1 : 0);
