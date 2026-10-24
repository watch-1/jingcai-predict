// Regression: cross-league teamId collision must not attach foreign match_vote cards.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tribe-mv-'));
process.env.DATA_DIR = tmp;
delete require.cache[require.resolve('../lib/db')];
delete require.cache[require.resolve('../lib/tribe-feed')];

const { db } = require('../lib/db');
const tribeFeed = require('../lib/tribe-feed');

const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const romaSerieA = {
  id: '2042204',
  league: '意甲',
  date: today,
  time: '00:00',
  home: '那不勒斯',
  away: '罗马',
  homeTeamId: '100',
  awayTeamId: '132',
};

const bayernBundesliga = {
  id: '9000001',
  league: '德甲',
  date: today,
  time: '21:30',
  home: '拜仁慕尼黑',
  away: '多特蒙德',
  homeTeamId: '132',
  awayTeamId: '200',
};

const tribeId = 'bundesliga-132';

tribeFeed.configure({ listMatches: () => [romaSerieA] });
assert.strictEqual(
  tribeFeed.findTodayMatch('132', '拜仁慕尼黑', { tribeId }),
  null,
  'id collision with Roma away must not match when tribe name is Bayern'
);

tribeFeed.configure({ listMatches: () => [romaSerieA, bayernBundesliga] });

const romaHit = tribeFeed.findTodayMatch('132', '罗马', { tribeId: 'seriea-132' });
assert.ok(romaHit && romaHit.match.id === '2042204' && romaHit.tribeSide === 'away', 'Roma name+id still matches Serie A fixture');

const bayernHit = tribeFeed.findTodayMatch('132', '拜仁慕尼黑', { tribeId, leagueKey: 'bundesliga' });
assert.ok(bayernHit && bayernHit.match.id === '9000001' && bayernHit.tribeSide === 'home', 'Bayern Bundesliga fixture when name agrees');

const now = Date.now();
const wrongJson = JSON.stringify({
  matchId: '2042204',
  league: '意甲',
  home: '那不勒斯',
  away: '罗马',
  tribeSide: 'away',
  tribeTeamName: '罗马',
});
db.prepare(`
  INSERT INTO tribe_posts (tribe_id, user_id, kind, body, images_json, match_id, match_json, pinned, reply_count, created_at, updated_at, deleted_at)
  VALUES (?, NULL, 'match_vote', 'wrong', '[]', '2042204', ?, 1, 0, ?, ?, NULL)
`).run(tribeId, wrongJson, now, now);

const cleaned = tribeFeed.cleanupWrongMatchVotePosts(tribeId, '拜仁慕尼黑');
assert.strictEqual(cleaned, 1, 'cleanup soft-deletes foreign match_vote for Bayern tribe');

const row = db.prepare('SELECT deleted_at, pinned FROM tribe_posts WHERE tribe_id = ? AND match_id = ?').get(tribeId, '2042204');
assert.ok(row && row.deleted_at, 'wrong post marked deleted');
assert.strictEqual(row.pinned, 0, 'wrong post unpinned');

tribeFeed.configure({ listMatches: () => [romaSerieA, bayernBundesliga] });
const postId = tribeFeed.ensureMatchVotePost(tribeId, '132', '拜仁慕尼黑', { leagueKey: 'bundesliga' });
assert.ok(postId, 'ensure creates Bayern match_vote when fixture exists');

const kept = db.prepare(
  "SELECT match_json FROM tribe_posts WHERE id = ? AND deleted_at IS NULL"
).get(postId);
const mj = JSON.parse(kept.match_json);
assert.strictEqual(mj.home, '拜仁慕尼黑', 'ensured card is Bayern home');

console.log('tribe-feed-match-vote-test OK');
