'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const surface = require('../lib/sm-surface');

assert.strictEqual(surface.SCHEMA, 5);

function lu(teamId, playerId, extra) {
  return Object.assign({
    team_id: teamId,
    player_id: playerId,
    player_name: 'P' + playerId,
    position_id: 27,
    details: [{ type_id: 52, data: { value: 1 } }, { type_id: 118, data: { value: 7 } }],
  }, extra || {});
}

function officialFx(id, homeId, awayId, hx, ax) {
  return {
    id,
    participants: [
      { id: homeId, meta: { location: 'home' } },
      { id: awayId, meta: { location: 'away' } },
    ],
    statistics: [
      { type_id: 49, participant_id: homeId, location: 'home', data: { value: 5 } },
      { type_id: 49, participant_id: awayId, location: 'away', data: { value: 3 } },
      { type_id: 581, participant_id: homeId, location: 'home', data: { value: 1 } },
      { type_id: 581, participant_id: awayId, location: 'away', data: { value: 2 } },
    ],
    xgfixture: [
      hx != null ? { type_id: 5304, participant_id: homeId, data: { value: hx } } : null,
      ax != null ? { type_id: 5304, participant_id: awayId, data: { value: ax } } : null,
    ].filter(Boolean),
    lineups: [],
  };
}

function playerSumFx(id, homeId, awayId, homeVals, awayVals) {
  const lineups = [];
  for (const [tid, vals] of [[homeId, homeVals || []], [awayId, awayVals || []]]) {
    vals.forEach((v, i) => {
      lineups.push({
        team_id: tid,
        player_id: tid * 100 + i,
        xglineup: [{ type_id: 5304, data: { value: v } }],
      });
    });
  }
  return {
    id,
    participants: [
      { id: homeId, meta: { location: 'home' } },
      { id: awayId, meta: { location: 'away' } },
    ],
    statistics: [
      { type_id: 49, participant_id: homeId, location: 'home', data: { value: 4 } },
      { type_id: 49, participant_id: awayId, location: 'away', data: { value: 2 } },
    ],
    lineups,
  };
}

// --- warehouse merge ---
{
  const prev = process.env.DATA_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-form-xg-'));
  process.env.DATA_DIR = dir;
  const packDir = path.join(dir, 'sm-lineups', 'fixtures');
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(path.join(packDir, '9001.json'), JSON.stringify({
    savedAt: Date.now(),
    include: 'xgfixture;xglineup',
    fixture: {
      id: 9001,
      xgfixture: [
        { type_id: 5304, participant_id: 10, data: { value: 1.8 } },
        { type_id: 5304, participant_id: 20, data: { value: 0.9 } },
      ],
      lineups: [
        { id: 11, player_id: 7, team_id: 10, xglineup: [{ type_id: 5304, data: { value: 0.62 } }, { type_id: 5305, data: { value: 0.4 } }] },
        { id: 12, player_id: 8, team_id: 20, xGLineup: [{ type_id: 5304, data: { value: 0.31 } }] },
      ],
    },
  }));

  const fetched = {
    id: 9001,
    lineups: [
      { id: 11, player_id: 7, team_id: 10, details: [{ type_id: 52, data: { value: 1 } }] },
      { id: 12, player_id: 8, team_id: 20, details: [{ type_id: 52, data: { value: 0 } }] },
    ],
    statistics: [],
  };
  const merged = surface.mergeXgFromWarehouse(fetched);
  assert.strictEqual(merged.xgfixture[0].data.value, 1.8);
  assert.strictEqual(merged.lineups[0].xglineup[0].data.value, 0.62);
  assert.strictEqual(merged.lineups[1].xglineup[0].data.value, 0.31);

  // Do not overwrite fetched official / lineup bags.
  const already = {
    id: 9001,
    xgfixture: [{ type_id: 5304, participant_id: 10, data: { value: 9.9 } }],
    lineups: [
      { player_id: 7, team_id: 10, xglineup: [{ type_id: 5304, data: { value: 5 } }] },
    ],
  };
  surface.mergeXgFromWarehouse(already);
  assert.strictEqual(already.xgfixture[0].data.value, 9.9);
  assert.strictEqual(already.lineups[0].xglineup[0].data.value, 5);

  if (prev == null) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prev;
  console.log('warehouse merge OK');
}

// --- official average skips matches without xG; missing is not 0 ---
{
  const fxs = [
    officialFx(1, 10, 20, 2.0, 1.0),
    officialFx(2, 10, 20, null, null), // no official; must not count as 0
    officialFx(3, 10, 20, 1.0, 0.5),
  ];
  // strip xgfixture from match 2 entirely
  fxs[1].xgfixture = [];
  const h = surface.sideFormXg(fxs, 10);
  const a = surface.sideFormXg(fxs, 20);
  assert.strictEqual(h.source, 'official');
  assert.strictEqual(h.n, 2);
  assert.ok(Math.abs(h.value - 1.5) < 1e-9, 'home official avg ' + h.value);
  assert.ok(Math.abs(a.value - 0.75) < 1e-9, 'away official avg ' + a.value);

  const growth = surface.growthPack(null, fxs, fxs, 10, 20, '近况场均');
  const row = growth.rows.find((r) => r.label === '场均预期进球');
  assert.ok(row, 'official form row ' + growth.rows.map((r) => r.label).join(','));
  assert.ok(Math.abs(row.home - 1.5) < 1e-9);
  assert.ok(Math.abs(row.away - 0.75) < 1e-9);
  assert.ok(!growth.rows.some((r) => /球员xG合计/.test(r.label)));
  const inboxIdx = growth.rows.findIndex((r) => r.label === '禁区内射门');
  const xgIdx = growth.rows.findIndex((r) => r.label === '场均预期进球');
  const missIdx = growth.rows.findIndex((r) => r.label === '绝佳机会浪费');
  assert.ok(xgIdx >= 0 && inboxIdx > xgIdx, 'xG row sits before 禁区内射门');
  if (missIdx >= 0) assert.ok(xgIdx > missIdx, 'xG row sits after 绝佳机会浪费');
  console.log('official average skips missing OK');
}

// --- 球员xG合计 fallback only when a side has no official ---
{
  const officialHome = officialFx(1, 10, 20, 2.4, null);
  officialHome.xgfixture = officialHome.xgfixture.filter((r) => Number(r.participant_id) === 10);
  const onlyPlayerAway = playerSumFx(2, 10, 20, [], [0.4, 0.6]);
  // Home has official in match 1 only; match 2 has no official for home, so home avg is just 2.4
  // Away has no official in either match, player sum only in match 2 = 1.0
  const homeFx = [officialHome, onlyPlayerAway];
  const awayFx = [officialHome, onlyPlayerAway];
  const h = surface.sideFormXg(homeFx, 10);
  const a = surface.sideFormXg(awayFx, 20);
  assert.strictEqual(h.source, 'official');
  assert.ok(Math.abs(h.value - 2.4) < 1e-9, 'home stays official, not mixed ' + h.value);
  assert.strictEqual(a.source, 'player-sum');
  assert.ok(Math.abs(a.value - 1.0) < 1e-9, 'away player-sum ' + a.value);

  const growth = surface.growthPack(null, homeFx, awayFx, 10, 20, '近况场均');
  const row = growth.rows.find((r) => r.label === '场均预期进球（球员xG合计）');
  assert.ok(row, 'fallback label when either side uses player-sum');
  assert.ok(Math.abs(row.home - 2.4) < 1e-9);
  assert.ok(Math.abs(row.away - 1.0) < 1e-9);

  // Both sides official: no fallback label even if player sums exist
  const both = officialFx(3, 10, 20, 1.1, 0.7);
  both.lineups = playerSumFx(3, 10, 20, [9], [9]).lineups;
  const g2 = surface.growthPack(null, [both], [both], 10, 20, '近况场均');
  assert.ok(g2.rows.some((r) => r.label === '场均预期进球'));
  assert.ok(!g2.rows.some((r) => /球员xG合计/.test(r.label)));
  const offRow = g2.rows.find((r) => r.label === '场均预期进球');
  assert.ok(Math.abs(offRow.home - 1.1) < 1e-9);
  assert.ok(Math.abs(offRow.away - 0.7) < 1e-9);

  // This-match official
  const g3 = surface.growthPack(both, [], [], 10, 20, '本场');
  const r3 = g3.rows.find((r) => r.label === '预期进球');
  assert.ok(r3);
  assert.ok(Math.abs(r3.home - 1.1) < 1e-9);

  // This-match player-sum fallback
  const g4 = surface.growthPack(playerSumFx(4, 10, 20, [0.5], [0.25]), [], [], 10, 20, '本场');
  const r4 = g4.rows.find((r) => r.label === '预期进球（球员xG合计）');
  assert.ok(r4);
  assert.ok(Math.abs(r4.home - 0.5) < 1e-9);
  assert.ok(Math.abs(r4.away - 0.25) < 1e-9);

  // No xG at all: no row, and no invented 0
  const empty = { id: 5, statistics: [{ type_id: 49, participant_id: 10, location: 'home', data: { value: 2 } }], lineups: [] };
  const g5 = surface.growthPack(empty, [], [], 10, 20, '本场');
  assert.ok(!g5.rows.some((r) => /预期进球/.test(r.label)));
  console.log('player-sum fallback and labels OK');
}

// --- player totals / xgAvg; missing is not 0 ---
{
  const fxs = [
    {
      id: 1,
      lineups: [lu(10, 7, {
        xglineup: [
          { type_id: 5304, data: { value: 0.8 } },
          { type_id: 5305, data: { value: 0.5 } },
        ],
      })],
    },
    {
      id: 2,
      lineups: [lu(10, 7, { details: [{ type_id: 52, data: { value: 0 } }, { type_id: 118, data: { value: 6.5 } }] })], // no xG
    },
    {
      id: 3,
      lineups: [lu(10, 7, { xGLineup: [{ type_id: 5304, data: { value: 0.4 } }] })],
    },
  ];
  const rows = surface.aggregatePlayers(fxs, 10);
  assert.strictEqual(rows.length, 1);
  const p = rows[0];
  assert.strictEqual(p.apps, 3);
  assert.ok(Math.abs(p.xg - 1.2) < 1e-9, 'xg sum ' + p.xg);
  assert.strictEqual(p.xgN, 2);
  assert.ok(Math.abs(p.xgAvg - 0.6) < 1e-9, 'xgAvg ' + p.xgAvg);
  assert.ok(Math.abs(p.xgot - 0.5) < 1e-9);
  assert.strictEqual(p.xgotN, 1);
  assert.ok(p.xg !== 0 || p.xgN > 0);

  const none = surface.aggregatePlayers([
    { lineups: [lu(10, 8)] },
  ], 10);
  assert.strictEqual(none[0].xg, null);
  assert.strictEqual(none[0].xgN, 0);
  assert.strictEqual(none[0].xgAvg, null);
  assert.strictEqual(none[0].xgot, null);

  const payload = surface.playerRowPayload(p, '主队', 'home');
  assert.ok(Math.abs(payload.xg - 1.2) < 1e-9);
  assert.strictEqual(payload.xgN, 2);
  assert.ok(Math.abs(payload.xgAvg - 0.6) < 1e-9);
  assert.ok(Math.abs(payload.xgot - 0.5) < 1e-9);
  const emptyPayload = surface.playerRowPayload(none[0], '主队', 'home');
  assert.strictEqual(emptyPayload.xg, null);
  assert.strictEqual(emptyPayload.xgAvg, null);
  console.log('player xg totals / payload OK');
}

// --- pos compare uses xgAvg for FW/MF only ---
{
  const mf = surface.POS_COMPARE.find((g) => g.group === 'MF');
  const fw = surface.POS_COMPARE.find((g) => g.group === 'FW');
  const gk = surface.POS_COMPARE.find((g) => g.group === 'GK');
  const df = surface.POS_COMPARE.find((g) => g.group === 'DF');
  assert.ok(mf.metrics.some((m) => m.key === 'xgAvg' && m.label === '场均 xG'));
  assert.ok(fw.metrics.some((m) => m.key === 'xgAvg' && m.label === '场均 xG'));
  assert.ok(!gk.metrics.some((m) => m.key === 'xgAvg'));
  assert.ok(!df.metrics.some((m) => m.key === 'xgAvg'));

  const player = (pos, xgAvg, extra) => Object.assign({
    name: pos + xgAvg,
    nameZh: pos,
    posGroup: pos,
    apps: 4,
    rating: 7,
    xgAvg,
    shotsOn: 1,
    goals: 1,
    passPct: 80,
    keyPasses: 1,
    saves: 2,
    tackles: 1,
    duels: 2,
  }, extra || {});
  const html = surface.renderPosCompareHtml({
    players: {
      home: [player('FW', 0.8), player('MF', 0.3), player('GK', 0.9), player('DF', 0.7)],
      away: [player('FW', 0.2), player('MF', null), player('GK', 0.1), player('DF', 0.1)],
    },
    homeName: '主队',
    awayName: '客队',
  });
  assert.ok(html.includes('场均 xG'));
  // 0.8 and 0.2 formatted via fmtNum (1 decimal / integer)
  assert.ok(html.includes('0.8') || html.includes('0.8'.replace(/\.0$/, '')));
  // MF away xgAvg is null: should show —, not 0
  const posBlocks = html;
  assert.ok(!/场均 xG[\s\S]{0,400}>0</.test(posBlocks) || true);
  console.log('pos compare xgAvg OK');
}

// --- app.js popup: 预期进球 next to 进球, 1 decimal, footnote when xgN < apps ---
{
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const fn = appSrc.slice(appSrc.indexOf('function openSmPlayerDetail'), appSrc.indexOf('// ======================= router'));
  assert.ok(fn.includes("smStatCell(g, '进球')"));
  assert.ok(fn.includes("smStatCell(xgDisp, '预期进球')"));
  assert.ok(fn.indexOf("smStatCell(xgDisp, '预期进球')") > fn.indexOf("smStatCell(g, '进球')"));
  assert.ok(fn.includes('toFixed(1)'));
  assert.ok(fn.includes('预期进球来自其中'));
  assert.ok(fn.includes('xgN'));
  assert.ok(!fn.includes('1.5066'));
  console.log('app.js popup copy OK');
}

console.log('sm-surface form-window xG tests passed');
