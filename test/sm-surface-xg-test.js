'use strict';
const assert = require('assert');
const surface = require('../lib/sm-surface');

const officialFx = {
  xgfixture: [
    { type_id: 5304, participant_id: 10, data: { value: 2.31 } },
    { type_id: 5304, participant_id: 20, data: { value: 1.58 } },
  ],
  statistics: [
    { type_id: 49, participant_id: 10, location: 'home', data: { value: 8 } },
    { type_id: 49, participant_id: 20, location: 'away', data: { value: 5 } },
    { type_id: 50, participant_id: 10, location: 'home', data: { value: 4 } },
    { type_id: 50, participant_id: 20, location: 'away', data: { value: 7 } },
  ],
  lineups: [],
};

{
  const card = surface.buildXgCard(officialFx, 10, 20);
  assert.strictEqual(card.ok, true);
  assert.strictEqual(card.official, true);
  assert.strictEqual(card.source, 'official');
  assert.strictEqual(card.sourceLabel, '官方球队 xG');
  assert.strictEqual(card.home.xg, 2.31);
  assert.strictEqual(card.away.xg, 1.58);
  assert.strictEqual(card.inBox.home, 8);
  assert.strictEqual(card.outBox.away, 7);
  const html = surface.renderXgCardHtml({ xgCard: card, homeName: '曼城', awayName: '利物浦' });
  assert.ok(html.includes('2.31'));
  assert.ok(html.includes('官方'));
  assert.ok(html.includes('禁区内'));
  assert.ok(!/shot-dot|shotDot|落点点/.test(html));
  console.log('official team xG + box counts OK');
}

{
  const fx = {
    lineups: [
      { team_id: 10, xGLineup: [{ type_id: 5304, data: { value: 0.8 } }, { type_id: 5304, data: { value: 0.4 } }] },
      { team_id: 10, xglineup: [{ type_id: 5304, data: { value: 0.5 } }] },
      { team_id: 20, xglineup: [{ type_id: 5304, data: { value: 0.3 } }] },
    ],
    statistics: [],
  };
  // First lineup has xGLineup; the two 5304 rows on the same player bag should not double-count.
  // playerXgSum takes the first 5304 per lineup row.
  const card = surface.buildXgCard(fx, 10, 20);
  assert.strictEqual(card.ok, true);
  assert.strictEqual(card.official, false);
  assert.strictEqual(card.source, 'player-sum');
  assert.strictEqual(card.sourceLabel, '球员xG合计');
  assert.ok(Math.abs(card.home.xg - 1.3) < 1e-9, 'home sum ' + card.home.xg);
  assert.strictEqual(card.away.xg, 0.3);
  const html = surface.renderXgCardHtml({ xgCard: card, homeName: '主队', awayName: '客队' });
  assert.ok(html.includes('球员xG合计'));
  console.log('player-sum xG labeled OK');
}

{
  const empty = surface.buildXgCard({ statistics: [], lineups: [] }, 10, 20);
  assert.strictEqual(empty.ok, false);
  const html = surface.renderXgCardHtml({ xgCard: empty, homeName: '主队', awayName: '客队' });
  assert.ok(html.includes('暂无'));
  assert.ok(!html.includes('shot-dot'));
  console.log('honest 暂无 when no xG or box counts');
}

{
  const pack = {
    growth: {
      mode: '本场',
      rows: [
        { label: '禁区内射门', home: 3, away: 1, unit: '' },
        { label: '禁区外射门', home: 2, away: 4, unit: '' },
      ],
    },
    homeName: '主队',
    awayName: '客队',
  };
  const card = surface.xgCardFromGrowth(pack);
  assert.strictEqual(card.hasBox, true);
  assert.strictEqual(card.hasXg, false);
  const html = surface.renderXgCardHtml(pack);
  assert.ok(html.includes('暂无预期进球') || html.includes('暂无'));
  assert.ok(html.includes('禁区内'));
  console.log('cached 本场 box counts still render without official xG');
}


{
  // Official 周二008 匈牙利 vs 北爱尔兰 (2042835): player-xG 1.43 vs 0.46,
  // 禁区内 13 vs 3, 禁区外 4 vs 5. Pitch labels nearest the goal line must
  // be 禁区内; home attacks the top (away) goal.
  const card = {
    ok: true,
    official: false,
    source: 'player-sum',
    sourceLabel: '球员xG合计',
    noteZh: '官方球队 xG 暂缺，以下为球员 xG 合计，不是官方球队值。禁区内/外是次数，不是落点。',
    home: { xg: 1.43, xgot: 0.58 },
    away: { xg: 0.46, xgot: 1.03 },
    inBox: { home: 13, away: 3 },
    outBox: { home: 4, away: 5 },
    hasXg: true,
    hasBox: true,
  };
  const html = surface.renderXgCardHtml({ xgCard: card, homeName: '匈牙利', awayName: '北爱尔兰' });
  const zones = [];
  const re = /class="xg-zone (home|away)" style="top:(\d+(?:\.\d+)?)%"><b>([^<]*)<\/b><s>([^<]*)<\/s>/g;
  let m;
  while ((m = re.exec(html))) {
    zones.push({ side: m[1], top: Number(m[2]), count: m[3], label: m[4] });
  }
  assert.strictEqual(zones.length, 4, 'four pitch zone labels');
  const byLabel = Object.fromEntries(zones.map((z) => [z.label, z]));
  assert.ok(byLabel['主·禁区内'] && byLabel['主·禁区外'] && byLabel['客·禁区内'] && byLabel['客·禁区外']);
  assert.strictEqual(byLabel['主·禁区内'].count, '13');
  assert.strictEqual(byLabel['主·禁区外'].count, '4');
  assert.strictEqual(byLabel['客·禁区内'].count, '3');
  assert.strictEqual(byLabel['客·禁区外'].count, '5');
  // Counts themselves stay in the right bucket (bars match the pitch).
  assert.ok(html.includes('禁区内射门'));
  assert.ok(html.includes('禁区外射门'));
  assert.ok(byLabel['主·禁区内'].top < byLabel['主·禁区外'].top, 'home in-box nearer the top goal than home out-box');
  assert.ok(byLabel['客·禁区内'].top > byLabel['客·禁区外'].top, 'away in-box nearer the bottom goal than away out-box');
  assert.ok(byLabel['主·禁区内'].top < 50 && byLabel['主·禁区外'].top < 50, 'home attacks the top (away) goal');
  assert.ok(byLabel['客·禁区内'].top > 50 && byLabel['客·禁区外'].top > 50, 'away attacks the bottom (home) goal');
  const topGoal = Math.min(...zones.map((z) => z.top));
  const botGoal = Math.max(...zones.map((z) => z.top));
  assert.strictEqual(zones.find((z) => z.top === topGoal).label, '主·禁区内');
  assert.strictEqual(zones.find((z) => z.top === botGoal).label, '客·禁区内');
  console.log('hungary vs NI pitch 禁区内/外 placement OK');
}

console.log('sm-surface xG card tests passed');
