'use strict';

const { db } = require('./db');
const { shanghaiDayStr, shanghaiDayStartMs } = require('./admin-time');

function lastNDayBuckets(nDays) {
  const today = shanghaiDayStartMs(shanghaiDayStr());
  const out = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const startMs = today - i * 86400e3;
    out.push({
      day: shanghaiDayStr(new Date(startMs)),
      startMs,
      endMs: startMs + 86400e3,
    });
  }
  return out;
}

function usersSeries14d() {
  const stmt = db.prepare(
    'SELECT COUNT(*) n FROM users WHERE created_at >= ? AND created_at < ?'
  );
  return lastNDayBuckets(14).map((b) => ({
    day: b.day,
    signups: stmt.get(b.startMs, b.endMs).n,
  }));
}

function ordersSeries14d() {
  const stmt = db.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(amount_fen), 0) fen
     FROM membership_orders
     WHERE status = 'paid'
       AND COALESCE(paid_at, created_at) >= ?
       AND COALESCE(paid_at, created_at) < ?`
  );
  return lastNDayBuckets(14).map((b) => {
    const r = stmt.get(b.startMs, b.endMs);
    return { day: b.day, paid: r.n, revenueFen: r.fen };
  });
}

/** Compare sum of days [7..13] vs [0..6] as percent change (recent week vs prior). */
function weekOverWeekDelta(series, key) {
  if (!series || series.length < 14) return null;
  const sum = (arr) => arr.reduce((s, row) => s + (Number(row[key]) || 0), 0);
  const prior = sum(series.slice(0, 7));
  const recent = sum(series.slice(7));
  if (prior === 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prior) / prior) * 100);
}

function mergeSeries(pageViewSeries, userSeries, orderSeries) {
  const byDay = new Map();
  for (const row of pageViewSeries || []) {
    byDay.set(row.day, { day: row.day, views: Number(row.views) || 0, signups: 0, paid: 0, revenueFen: 0 });
  }
  for (const row of userSeries || []) {
    const cur = byDay.get(row.day) || { day: row.day, views: 0, signups: 0, paid: 0, revenueFen: 0 };
    cur.signups = Number(row.signups) || 0;
    byDay.set(row.day, cur);
  }
  for (const row of orderSeries || []) {
    const cur = byDay.get(row.day) || { day: row.day, views: 0, signups: 0, paid: 0, revenueFen: 0 };
    cur.paid = Number(row.paid) || 0;
    cur.revenueFen = Number(row.revenueFen) || 0;
    byDay.set(row.day, cur);
  }
  const days = lastNDayBuckets(14).map((b) => b.day);
  return days.map((day) => byDay.get(day) || { day, views: 0, signups: 0, paid: 0, revenueFen: 0 });
}

function buildDashboardCharts(pageViewSeries) {
  const users14 = usersSeries14d();
  const orders14 = ordersSeries14d();
  const series14d = mergeSeries(pageViewSeries, users14, orders14);
  return {
    series14d,
    deltas: {
      views: weekOverWeekDelta(series14d, 'views'),
      signups: weekOverWeekDelta(series14d, 'signups'),
      paid: weekOverWeekDelta(series14d, 'paid'),
      revenueFen: weekOverWeekDelta(series14d, 'revenueFen'),
    },
  };
}

module.exports = {
  usersSeries14d,
  ordersSeries14d,
  weekOverWeekDelta,
  mergeSeries,
  buildDashboardCharts,
};
