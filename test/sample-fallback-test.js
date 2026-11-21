'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fb = require('../lib/live-fallback');

const live = {
  source: 'live',
  fetchedAt: '2026-11-15T12:00:00.000Z',
  data: [
    { id: '2042772', league: '欧国联', home: '拉脱维亚', away: '亚美尼亚', full: '0:0' },
    { id: '2042773', league: '欧国联', home: '荷兰', away: '希腊', full: '7:0' },
  ],
};
const sample = {
  source: 'sample',
  note: '官方接口不可达，当前展示为示例数据（非真实赛事/赔率）',
  data: [
    { id: 'demo-1', league: '荷甲', home: '阿贾克斯', away: '费耶诺德', sample: true, tag: '示例' },
    { id: 'demo-2', league: '葡超', home: '本菲卡', away: '波尔图', sample: true },
    { id: 'demo-3', league: '日职', home: '神户胜利船', away: '川崎前锋', sample: true },
  ],
};

const kept = fb.liveFallbackPayload('results', ['timeout'], live);
assert.strictEqual(kept.source, 'live');
assert.strictEqual(kept.stale, true);
assert.strictEqual(kept.fromCache, true);
assert.ok(kept.note && /保留/.test(kept.note));
assert.strictEqual(kept.data.length, 2);
assert.ok(kept.data.every((r) => r.league === '欧国联'));
assert.ok(!kept.data.some((r) => /阿贾克斯|本菲卡|神户/.test(r.home + r.away)));

const empty = fb.liveFallbackPayload('results', ['timeout'], null);
assert.strictEqual(empty.source, 'empty');
assert.deepStrictEqual(empty.data, []);
assert.ok(/暂无场次|无法刷新/.test(empty.note));

const accepted = fb.acceptMatchPayload('results', sample, live);
assert.strictEqual(accepted.source, 'live');
assert.ok(accepted.stale);
assert.ok(!accepted.data.some((r) => r.league === '荷甲' || r.league === '葡超' || r.league === '日职'));

const acceptedEmpty = fb.acceptMatchPayload('results', sample, null);
assert.strictEqual(acceptedEmpty.source, 'empty');
assert.deepStrictEqual(acceptedEmpty.data, []);

const liveOk = fb.acceptMatchPayload('results', live, null);
assert.strictEqual(liveOk.source, 'live');
assert.strictEqual(liveOk.data.length, 2);

const recentLive = Object.assign({}, live, { fetchedAt: '2026-11-18T11:20:00.000Z' });
const nowRecent = Date.parse('2026-11-18T11:25:00.000Z');
const silent = fb.acceptMatchPayload('matches', null, recentLive, {
  silentIfRecent: true,
  now: nowRecent,
  silentMs: fb.SILENT_STALE_MS,
});
assert.strictEqual(silent.source, 'live');
assert.strictEqual(silent.silentStale, true);
assert.ok(!silent.note, 'recent last-good on a client blip has no orange-banner note');
assert.ok(fb.isRecentLiveCache(recentLive, nowRecent));

const oldLive = Object.assign({}, live, { fetchedAt: '2026-11-18T10:00:00.000Z' });
const nowOld = Date.parse('2026-11-18T11:25:00.000Z');
const oldFb = fb.acceptMatchPayload('matches', null, oldLive, {
  silentIfRecent: true,
  now: nowOld,
  silentMs: fb.SILENT_STALE_MS,
});
assert.ok(!oldFb.silentStale);
assert.ok(/官方接口暂时不可达/.test(oldFb.note), 'old last-good still shows the official-unreachable note');

const serverStale = Object.assign({}, live, {
  stale: true,
  fromCache: true,
  note: '官方接口暂时不可达，已保留上次成功刷新的场次',
  fetchedAt: '2026-11-18T11:20:00.000Z',
});
const fromServer = fb.acceptMatchPayload('matches', serverStale, recentLive, {
  silentIfRecent: true,
  now: nowRecent,
});
assert.strictEqual(fromServer.note, serverStale.note, 'explicit server stale+note is kept and shown');
assert.ok(!fromServer.silentStale);

// server.js must not merge sample into results archive
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(/liveFallbackPayload/.test(serverJs), 'refreshData uses liveFallbackPayload');
assert.ok(!/mergeSeenIntoResults\(sampleData\)/.test(serverJs), 'no mergeSeenIntoResults(sampleData)');
assert.ok(!/source: 'sample'/.test(serverJs) || !/sample\.results\(\)/.test(serverJs.replace(/\/\*[\s\S]*?\*\//g, '')), 'sample results path removed');
// stronger: the old fallback assignment is gone
assert.ok(!/let sampleData = kind === 'results' \? sample\.results\(\)/.test(serverJs));

const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
assert.ok(/function acceptMatchPayload/.test(appJs), 'client acceptMatchPayload');
assert.ok(!/SM\.results\(\)/.test(appJs) || !/source: 'sample', local: true/.test(appJs), 'client no longer injects SAMPLE on catch');
assert.ok(/无法刷新，暂无场次/.test(appJs), 'honest empty copy');

console.log('sample-fallback-test ok');
