'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mf = require('../lib/sm-matchfacts');

assert.strictEqual(mf.tagZh('Very High'), '很高');
assert.strictEqual(mf.tagZh('Normal'), '正常');
assert.strictEqual(mf.leagueLabel('UEFA Nations League'), '欧国联');
assert.strictEqual(mf.leagueLabel('Premier League'), '英超');
assert.strictEqual(mf.leagueLabel('欧国联'), '欧国联');

const dumpPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/portugal-dump/matchfacts-trends.json'
);
const eventsPath = path.join(
  '/workspace/sportmonks-screenshots/2026-11-18-new-account/portugal-dump/events-timeline.json'
);
if (!fs.existsSync(dumpPath)) {
  console.log('sm-matchfacts: dump missing, skipped fixture parse');
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const fx = raw.payload.data;
if (fs.existsSync(eventsPath)) {
  const ev = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  const data = ev.payload && ev.payload.data;
  if (data && data.events) fx.events = data.events;
  if (data && data.scores && !fx.scores) fx.scores = data.scores;
  if (data && data.periods && !fx.periods) fx.periods = data.periods;
  if (data && data.league && !fx.league) fx.league = data.league;
}

const pack = mf.buildPackFromFixture(fx, {
  matchId: 'test-007',
  home: '威尔士',
  away: '葡萄牙',
  now: Date.now(),
});

assert.strictEqual(pack.ok, true);
assert.strictEqual(pack.smFixtureId, 19676648);
assert.strictEqual(pack.home.nameZh, '威尔士');
assert.strictEqual(pack.away.nameZh, '葡萄牙');
assert.strictEqual(pack.leagueZh, '欧国联');
assert.strictEqual(pack.state.nameZh, '完场');
assert.strictEqual(pack.score.home, 2);
assert.strictEqual(pack.score.away, 3);
assert.strictEqual(pack.insightTotal, 574);
assert.strictEqual(pack.insightCats.find((c) => c.key === 'statistics').count, 326);
assert.strictEqual(pack.insightCats.find((c) => c.key === 'streaks').count, 140);

const win = pack.streaks.find((s) => s.num === '6/7');
assert.ok(win, 'Portugal 6/7 win streak');
assert.strictEqual(win.side, 'away');
assert.ok(/葡萄牙/.test(win.line1));
assert.ok(/赢了 6 场/.test(win.line2));
assert.ok(pack.streaks.some((s) => s.num === '27/32'));
assert.ok(pack.streaks.some((s) => s.num === '4/5' && /输了 4 场/.test(s.line2)));
assert.ok(pack.streaks.some((s) => s.num === '8/10'));

const wr = pack.last5.find((r) => r.name === '胜率');
assert.strictEqual(wr.home, 20);
assert.strictEqual(wr.away, 80);
const gf = pack.last5.find((r) => r.name === '场均进球');
assert.strictEqual(gf.home, 0.6);
assert.strictEqual(gf.away, 2);
const ov = pack.last5.find((r) => r.name === '总进球超过 2.5');
assert.strictEqual(ov.away, 80);

const xg = pack.season.find((r) => r.name === '场均期望进球');
assert.ok(xg);
assert.ok(Math.abs(xg.away - 1.986) < 0.02);
assert.ok(Math.abs(xg.mean - 1.369) < 0.05);
assert.strictEqual(xg.awayTag, '偏高');

const cor = pack.live90.find((r) => r.name === '角球');
assert.ok(cor);
assert.strictEqual(cor.home, 6);
assert.strictEqual(cor.away, 1);
assert.strictEqual(cor.awayTag, '很低');

assert.ok(pack.goalBins);
assert.deepStrictEqual(pack.goalBins.away.slice(0, 2), [1, 3]);

const ramosXg = pack.players.find((p) => p.side === 'away' && p.metric === '场均 xG');
assert.ok(ramosXg);
assert.ok(/Ramos|拉莫斯/.test(ramosXg.name + ramosXg.nameZh));
assert.ok(Math.abs(ramosXg.value - 0.59) < 0.001);

assert.ok(pack.bullets.length >= 3);
assert.ok(pack.bullets.some((b) => /期望进球/.test(b) && /2\.0|2/.test(b)));
assert.ok(pack.bullets.some((b) => /超过 2\.5/.test(b)));

assert.ok(pack.hasTrends);
assert.ok(pack.trends.series.pos.home.length > 90);
const last = (arr) => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
};
assert.strictEqual(Math.round(last(pack.trends.series.pos.home)), 41);
assert.strictEqual(Math.round(last(pack.trends.series.pos.away)), 59);
assert.strictEqual(Math.round(last(pack.trends.series.pas.home)), 425);
assert.strictEqual(Math.round(last(pack.trends.series.pas.away)), 658);
assert.strictEqual(Math.round(last(pack.trends.series.sh.home)), 22);
assert.strictEqual(Math.round(last(pack.trends.series.sh.away)), 11);
assert.strictEqual(Math.round(last(pack.trends.series.sot.home)), 8);
assert.strictEqual(Math.round(last(pack.trends.series.sot.away)), 6);

const goals = pack.events.filter((e) => e.kind === 'goal');
const reds = pack.events.filter((e) => e.kind === 'red');
assert.strictEqual(goals.length, 5);
assert.strictEqual(goals[0].minute, 11);
assert.strictEqual(goals[0].side, 'away');
assert.strictEqual(goals[0].score, '0-1');
assert.strictEqual(goals[4].score, '2-3');
assert.strictEqual(reds.length, 1);
assert.strictEqual(reds[0].minute, 74);
assert.strictEqual(reds[0].side, 'away');

// empty fixture must not invent Wales/Portugal numbers
const empty = mf.buildPackFromFixture({ id: 1, participants: [], matchfacts: [], trends: [] }, { matchId: 'x', home: '甲', away: '乙' });
assert.strictEqual(empty.hasFacts, false);
assert.strictEqual(empty.hasTrends, false);
assert.strictEqual(empty.streaks.length, 0);
assert.strictEqual(empty.score.home, null);

console.log('sm-matchfacts-test ok');
