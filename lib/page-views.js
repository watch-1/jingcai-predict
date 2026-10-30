'use strict';

const { db } = require('./db');
const { shanghaiDayStr, shanghaiDayStartMs } = require('./admin-time');

function normalizePath(raw) {
  let p = String(raw || '/').trim();
  if (!p) p = '/';
  if (p.length > 120) p = p.slice(0, 120);
  return p;
}

function record(pathRaw, _clientKey) {
  const path = normalizePath(pathRaw);
  if (!/^[\#\/]/.test(path)) return { ok: false, reason: 'path' };
  const day = shanghaiDayStr();
  const now = Date.now();
  db.prepare(
    `INSERT INTO app_page_views (day, path, views, uniques, updated_at)
     VALUES (?,?,1,1,?)
     ON CONFLICT(day, path) DO UPDATE SET
       views = views + 1,
       updated_at = excluded.updated_at`
  ).run(day, path, now);
  return { ok: true, day, path };
}

function totalsForDay(day) {
  const row = db.prepare(
    'SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(uniques),0) uniques FROM app_page_views WHERE day = ?'
  ).get(day);
  return { views: row.views, uniques: row.uniques };
}

function seriesDays(nDays = 14) {
  const out = [];
  const today = shanghaiDayStartMs(shanghaiDayStr());
  for (let i = nDays - 1; i >= 0; i--) {
    const ms = today - i * 86400e3;
    const day = shanghaiDayStr(new Date(ms));
    const row = db.prepare(
      'SELECT COALESCE(SUM(views),0) v FROM app_page_views WHERE day = ?'
    ).get(day);
    out.push({ day, views: row.v });
  }
  return out;
}

function topPaths(day, limit = 20) {
  return db.prepare(
    `SELECT path, views, uniques FROM app_page_views WHERE day = ? ORDER BY views DESC LIMIT ?`
  ).all(day || shanghaiDayStr(), Math.min(limit, 100));
}

module.exports = {
  record,
  totalsForDay,
  seriesDays,
  topPaths,
  normalizePath,
};
