'use strict';
// 1.9.267: device registry + fav sync + goal detect → JPush payload (no network).
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-push-267-'));
process.env.DATA_DIR = tmp;
process.env.PUSH_GOALS_WORKER = '0';
delete process.env.JPUSH_APPKEY;
delete process.env.JPUSH_MASTER_SECRET;

const { db } = require('../lib/db');
const push = require('../lib/push-goals');
const { favGoalAlertDecision } = require('../lib/goal-alert');

assert.ok(push.DEVICE_ID_RE.test('jcdevicexxxxxxxx'));
assert.ok(!push.DEVICE_ID_RE.test('short'));
assert.ok(push.MATCH_ID_RE.test('123456'));

const a = push.upsertDevice({ deviceId: 'jcdevicexxxxxxxx', regId: 'reg_aaa111' });
assert.ok(a.deviceSecret && a.created);
const secret = a.deviceSecret;
const again = push.upsertDevice({ deviceId: 'jcdevicexxxxxxxx', secret: 'wrongsecret', regId: 'reg_bbbbbb' });
assert.strictEqual(again.status, 403);
const ok = push.upsertDevice({ deviceId: 'jcdevicexxxxxxxx', secret, regId: 'reg_aaa111' });
assert.strictEqual(ok.created, false);

const favs = push.replaceFavs('jcdevicexxxxxxxx', [
  { matchId: 'm1', home: '曼城', away: '利物浦', date: '2026-11-01', time: '20:00' },
  { matchId: 'm1', home: 'dup' },
  { matchId: 'bad id!!' },
  { matchId: 'm2', home: '阿森纳', away: '切尔西' },
]);
assert.strictEqual(favs.count, 2);
assert.deepStrictEqual(push.listFollowedMatchIds().sort(), ['m1', 'm2']);
assert.strictEqual(push.listDevicesForMatch('m1').length, 1);
assert.strictEqual(push.listDevicesForMatch('m1')[0].regId, 'reg_aaa111');

(async () => {
  const sent = [];
  push.setSender(async (payload) => { sent.push(payload); return { ok: true, mock: true }; });

  const live1 = {
    m1: { homeScore: 0, awayScore: 0, home: '曼城', away: '利物浦', minute: 12 },
    m2: { homeScore: 1, awayScore: 0, home: '阿森纳', away: '切尔西', minute: 33 },
  };
  let r = await push.detectAndPush({
    getLiveScores: async () => ({ data: live1 }),
  });
  assert.strictEqual(r.events.length, 0, 'first sight seeds, no notify');
  assert.strictEqual(sent.length, 0);

  const live2 = {
    m1: { homeScore: 1, awayScore: 0, home: '曼城', away: '利物浦', minute: 18 },
    m2: { homeScore: 1, awayScore: 0, home: '阿森纳', away: '切尔西', minute: 40 },
  };
  r = await push.detectAndPush({
    getLiveScores: async () => ({ data: live2 }),
  });
  assert.strictEqual(r.events.length, 1, 'only m1 goal');
  assert.strictEqual(r.events[0].matchId, 'm1');
  assert.strictEqual(r.events[0].scoreKey, '1-0');
  assert.ok(/曼城 1-0 利物浦/.test(r.events[0].body));
  assert.strictEqual(sent.length, 1);
  const payload = sent[0];
  assert.deepStrictEqual(payload.audience.registration_id, ['reg_aaa111']);
  assert.strictEqual(payload.notification.android.channel_id, 'goal_alerts');
  assert.strictEqual(payload.notification.android.display_foreground, '0');
  assert.strictEqual(payload.notification.android.extras.kind, 'fav_goal');
  assert.strictEqual(payload.notification.android.extras.scoreKey, '1-0');
  assert.ok(/MainActivity/.test(payload.notification.android.intent.url));
  assert.ok(/S.match_id=m1/.test(payload.notification.android.intent.url));

  r = await push.detectAndPush({
    getLiveScores: async () => ({ data: live2 }),
  });
  assert.strictEqual(r.events.length, 0, 'same score not resent');
  assert.strictEqual(sent.length, 1);

  const live3 = {
    m1: { homeScore: 1, awayScore: 1, home: '曼城', away: '利物浦', minute: 55 },
    m2: { homeScore: 1, awayScore: 0 },
  };
  r = await push.detectAndPush({
    getLiveScores: async () => ({ data: live3 }),
  });
  assert.strictEqual(r.events.length, 1);
  assert.strictEqual(r.events[0].scoreKey, '1-1');

  const built = push.buildJpushPayload({
    regIds: ['x'], title: '进球提醒', body: 'A 1-0 B', matchId: 'mid', scoreKey: '1-0',
  });
  assert.strictEqual(built.platform, 'android');
  assert.ok(!JSON.stringify(built).includes('MASTER'));

  const app = express();
  app.use('/api', push);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;
  try {
    let res = await fetch(base + '/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'jchttpdevice0001', regId: 'reg_http_1' }),
    });
    let j = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(j.deviceSecret);
    assert.strictEqual(j.pushEnabled, false);
    const sec = j.deviceSecret;
    res = await fetch(base + '/api/push/favs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'jchttpdevice0001',
        deviceSecret: sec,
        favorites: [{ matchId: 'http1', home: '主', away: '客' }],
      }),
    });
    j = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(j.count, 1);
    res = await fetch(base + '/api/push/favs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'jchttpdevice0001', deviceSecret: 'nope', favorites: [] }),
    });
    assert.strictEqual(res.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }

  assert.strictEqual(favGoalAlertDecision(null, { homeScore: 2, awayScore: 1 }, true).action, 'notify');
  console.log('push-goals-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
