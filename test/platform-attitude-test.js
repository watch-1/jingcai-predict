#!/usr/bin/env node
/** Platform brief → column_posts same-source (1.9.139). */
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('../lib/db');
const pa = require('../lib/platform-attitude');

const report = {
  ok: true,
  matchId: 'plat_att_test_' + Date.now(),
  home: '测试主队',
  away: '测试客队',
  league: '测试联赛',
  date: '2099-12-31',
  time: '20:00',
  summary: '测试摘要：近况偏主胜。',
  sections: {
    conclusion: {
      lean: 'h',
      pickText: '主胜',
      conf: 0.75,
      speakMode: 'amplify',
      reasons: ['近况偏主胜', '竞彩偏主胜'],
    },
  },
  predict: {
    top: 'h',
    conf: 0.75,
    pickText: '主胜',
    text: '主胜',
    lvl: ['l2', '稳胆'],
    speakMode: 'amplify',
  },
};

const postId = pa.syncFromReport(report);
assert(postId, 'upsert platform post');

const uid = pa.ensurePlatformUserId();
const row = db.prepare('SELECT * FROM column_posts WHERE id = ?').get(postId);
assert(row && row.user_id === uid, 'platform user owns post');
assert(row.match_id === report.matchId, 'match_id linked');
assert(Number(row.price_coins) === pa.PLATFORM_BRIEF_PRICE, 'default 云朵价');
assert(row.pick === 'H', 'pick from lean');

const st = pa.platformAuthorStats();
assert(st && typeof st.recentLabel === 'string', 'stats object');
assert(!/近8中6/.test(JSON.stringify(st)), 'no invented hit line');

const id2 = pa.syncFromReport({ ...report, summary: '更新摘要' });
assert(id2 === postId, 'upsert same post id');

db.prepare('UPDATE column_posts SET deleted_at = ? WHERE id = ?').run(Date.now(), postId);

console.log('platform-attitude-test ok');
