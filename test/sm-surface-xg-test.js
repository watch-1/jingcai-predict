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

console.log('sm-surface xG card tests passed');
