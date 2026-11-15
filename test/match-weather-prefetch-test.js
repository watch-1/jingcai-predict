'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wx-368-'));
process.env.DATA_DIR = dir;

const wx = require('../lib/match-weather');
wx.resetStoreForTest();

const base = {
  ok: true,
  source: 'sportmonks',
  type: 'cloudy',
  labelZh: '阴',
  description: 'overcast clouds',
  tempC: 7.6,
  humidity: 77,
  windMs: 6.1,
  pressureHpa: 1015,
  pressureMmHg: 761,
  venueName: 'Stadions Skonto',
  venueCity: 'Riga',
  asof: '2026-11-15 14:00:00',
  reportType: 'forecast',
  sourceNote: '预报',
  reason: '',
  error: '',
  smFixtureId: 19676750,
};

wx.writeStore('2042772', base, Date.now());
const row = wx.readStore('2042772');
assert.ok(row && row.payload);
assert.strictEqual(row.payload.tempC, 7.6);
assert.strictEqual(row.payload.ok, true);
assert.ok(wx.isFreshRow(row, Date.now()));
assert.ok(!wx.isFreshRow(row, Date.now() + wx.FORECAST_TTL_MS + 1000));

(async () => {
  const hit = await wx.getMatchWeather({ matchId: '2042772' });
  assert.strictEqual(hit.cached, true);
  assert.strictEqual(hit.stale, false);
  assert.strictEqual(hit.tempC, 7.6);
  assert.strictEqual(hit.source, 'sportmonks');
  assert.strictEqual(hit.labelZh, '阴');
  assert.strictEqual(hit.type, 'cloudy');

  const oldAt = Date.now() - wx.FORECAST_TTL_MS - 5000;
  wx.writeStore('2042772', base, oldAt);
  const stale = await wx.getMatchWeather({ matchId: '2042772' });
  assert.strictEqual(stale.cached, true);
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.tempC, 7.6, 'stale row is returned immediately, not invented');

  const selling = [{ id: '1', date: '2026-11-15', time: '22:00', home: '拉脱维亚' }];
  const schedule = [
    { id: '1', date: '2026-11-15', time: '22:00' },
    { id: '9', date: '2026-11-16', time: '01:00' },
    { id: '99', date: '2026-12-01', time: '03:00' },
  ];
  const now = Date.parse('2026-11-15T21:00:00+08:00');
  const picked = wx.selectPrefetchMatches(selling, schedule, now);
  const ids = picked.map((m) => String(m.id));
  assert.ok(ids.includes('1'));
  assert.ok(ids.includes('9'));
  assert.ok(!ids.includes('99'));

  wx.writeStore('2042772', base, Date.now());
  wx.resetPrefetchState();
  const st = await wx.prefetchWeather([
    { id: '2042772', date: '2026-11-15', time: '22:00', home: '拉脱维亚', away: '亚美尼亚' },
  ], { reason: 'test', gapMs: 0, force: false });
  assert.strictEqual(st.n, 1);
  assert.strictEqual(st.rows[0].status, 'fresh');

  wx.resetStoreForTest();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
  console.log('match-weather-prefetch-test ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
