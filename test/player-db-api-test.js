'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdb-api-'));
process.env.DATA_DIR = tmp;
process.env.PLAYER_DB_VIEW_KEY = 'test-view-key-xyz';
process.env.PORT = '0';

// Seed DB
delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/player-match-db')];
const pmdb = require('../lib/player-match-db');
pmdb.upsertFromFixturePayload({
  ok: true, fixtureId: 1, matchId: 'm1', date: '2026-10-01', ft: '1:0',
  homeTeamId: 'h', awayTeamId: 'a', homeName: 'Home', awayName: 'Away',
  homeNameZh: '主队', awayNameZh: '客队', fetchedAt: '2026-10-01T12:00:00.000Z', source: 'test',
  home: { players: [{ id: 'p1', name: 'Test Player', nameZh: '测试球员', position: 'F', positionZh: '前锋',
    minutes: 90, goals: 1, assists: 0, shots: 3, shotsOn: 2, keyPasses: 1, tackles: 0, rating: 7.5 }] },
  away: { players: [] },
});
pmdb.upsertOutcomeFromReview({
  ok: true, matchId: 'm1', home: '主队', away: '客队', homeTeamId: 'h', awayTeamId: 'a',
  date: '2026-10-01', league: '测试', ft: '1:0', result: 'h', fixtureId: 1,
  hasActualStats: false,
  prediction: { lean: 'h', conf: 0.7, pickText: '主胜', speakMode: 'amplify', marketLean: 'h' },
  leanFeedback: { available: true, leanHit: true, marketHit: true, amplified: true, amplifyHit: true },
  intelSnippets: ['主队胜命中'],
  angles: [{ key: 'prediction', hasData: true, hit: true, text: '命中' }],
  generatedAt: '2026-10-01T12:00:00.000Z',
});

const express = require('express');
const app = express();
app.use('/api', require('../lib/auth'));
app.use('/api', require('../lib/player-db-api'));

function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, 'http://127.0.0.1:' + port);
    http.get(u, { headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        let j = null; try { j = JSON.parse(b); } catch {}
        resolve({ status: res.statusCode, json: j, body: b });
      });
    }).on('error', reject);
  });
}

let port;
const server = app.listen(0, async () => {
  port = server.address().port;
  try {
    // Phone login alone is NOT enough — missing key → 403 when env is set
    const denied = await get('/api/player-db/overview');
    assert.strictEqual(denied.status, 403);

    const ok = await get('/api/player-db/overview?key=test-view-key-xyz');
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.json.ok);
    assert.strictEqual(ok.json.matches, 1);
    assert.strictEqual(ok.json.playerRows, 1);

    const hdrOk = await get('/api/player-db/overview', { 'X-Player-Db-Key': 'test-view-key-xyz' });
    assert.strictEqual(hdrOk.status, 200);

    const bad = await get('/api/player-db/overview?key=wrong');
    assert.strictEqual(bad.status, 403);

    const search = await get('/api/player-db/search?q=' + encodeURIComponent('测试') + '&key=test-view-key-xyz');
    assert.strictEqual(search.status, 200);
    assert.ok(search.json.rows.length >= 1);

    const match = await get('/api/player-db/matches/m1?key=test-view-key-xyz');
    assert.strictEqual(match.status, 200);
    assert.strictEqual(match.json.home.length, 1);
    assert.strictEqual(match.json.home[0].goals, 1);

    const player = await get('/api/player-db/players/p1?key=test-view-key-xyz');
    assert.strictEqual(player.status, 200);
    assert.ok(player.json.rows.length >= 1);

    assert.ok((ok.json.outcomes || 0) >= 1);

    const outs = await get('/api/player-db/outcomes?limit=10&key=test-view-key-xyz');
    assert.strictEqual(outs.status, 200);
    assert.ok(outs.json.outcomes.length >= 1);
    assert.strictEqual(outs.json.outcomes[0].matchId, 'm1');
    assert.strictEqual(outs.json.outcomes[0].leanHit, 1);

    console.log('player-db-api-test OK');
    server.close();
    pmdb.closeDb();
    process.exit(0);
  } catch (e) {
    console.error(e);
    server.close();
    process.exit(1);
  }
});
