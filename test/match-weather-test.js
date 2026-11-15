'use strict';
const assert = require('assert');
const wx = require('../lib/match-weather');

assert.strictEqual(wx.mapDescription('sky is clear').type, 'sunny');
assert.strictEqual(wx.mapDescription('clear sky').type, 'sunny');
assert.strictEqual(wx.mapDescription('few clouds').type, 'cloudy');
assert.strictEqual(wx.mapDescription('broken clouds').type, 'cloudy');
assert.strictEqual(wx.mapDescription('overcast clouds').type, 'cloudy');
assert.strictEqual(wx.mapDescription('overcast clouds').labelZh, '阴');
assert.strictEqual(wx.mapDescription('light rain').type, 'light-rain');
assert.strictEqual(wx.mapDescription('moderate rain').type, 'rain');
assert.strictEqual(wx.mapDescription('moderate rain').labelZh, '中雨');
assert.strictEqual(wx.mapDescription('heavy intensity rain').type, 'rain');
assert.strictEqual(wx.mapDescription('heavy intensity rain').labelZh, '大雨');
assert.strictEqual(wx.mapDescription('thunderstorm').type, 'storm');
assert.strictEqual(wx.mapDescription('light rain').labelZh, '小雨');
assert.strictEqual(wx.mapWmo(63).type, 'rain');
assert.strictEqual(wx.mapWmo(61).type, 'light-rain');
assert.strictEqual(wx.mapWmo(95).type, 'storm');
assert.strictEqual(wx.parsePercent('79%'), 79);
assert.strictEqual(wx.parsePercent(83), 83);
assert.strictEqual(wx.pickDayPart(14), 'day');
assert.strictEqual(wx.pickDayPart(19), 'evening');

const actual = wx.normalizeWeather({
  temperature: { current: 11.84 },
  humidity: '79%',
  wind: { speed: 2.89 },
  pressure: 1007,
  description: 'heavy intensity rain',
  type: 'actual',
}, { name: 'SANKYO FRONTIER Kashiwa Stadium' }, { id: 19903098, starting_at: '2026-11-15 08:00:00' });
assert.strictEqual(actual.ok, true);
assert.strictEqual(actual.source, 'sportmonks');
assert.strictEqual(actual.type, 'rain');
assert.strictEqual(actual.labelZh, '大雨');
assert.strictEqual(actual.tempC, 11.84);
assert.strictEqual(actual.humidity, 79);
assert.strictEqual(actual.windMs, 2.89);
assert.strictEqual(actual.pressureHpa, 1007);
assert.ok(actual.pressureMmHg != null);
assert.strictEqual(actual.reportType, 'actual');
assert.strictEqual(actual.sourceNote, '当场天气');

const forecast = wx.normalizeWeather({
  temperature: { day: 7.61, morning: 4.47, evening: 4.12, night: 3.01, current: null },
  humidity: '77%',
  wind: { speed: 6.14 },
  pressure: 1015,
  description: 'overcast clouds',
  type: 'forecast',
  current: null,
}, { name: 'Stadions Skonto' }, { id: 19676750, starting_at: '2026-11-15 14:00:00' });
assert.strictEqual(forecast.ok, true);
assert.strictEqual(forecast.tempC, 7.61);
assert.strictEqual(forecast.type, 'cloudy');
assert.strictEqual(forecast.reportType, 'forecast');
assert.strictEqual(forecast.sourceNote, '预报');

const eve = wx.normalizeWeather({
  temperature: { day: 10.54, morning: 6.28, evening: 10.53, night: 8.7, current: null },
  humidity: '83%',
  wind: { speed: 8.12 },
  pressure: 1002,
  description: 'moderate rain',
  type: 'forecast',
}, { name: 'King Power at Den Dreef' }, { id: 19676655, starting_at: '2026-11-15 19:45:00' });
assert.strictEqual(eve.tempC, 10.53);
assert.strictEqual(eve.type, 'rain');
assert.strictEqual(eve.labelZh, '中雨');

const empty = wx.normalizeWeather({}, { name: 'X' }, { id: 1 });
assert.strictEqual(empty.ok, false);
assert.strictEqual(empty.reason, 'empty-weatherreport');
assert.strictEqual(empty.tempC, null);

console.log('match-weather-test ok');
