'use strict';
const assert = require('assert');
const unl = require('../lib/unl-ruler');

{
  const map = unl.midrankMap([
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
    { id: 'c', v: 2 },
    { id: 'd', v: 4 },
  ]);
  assert.strictEqual(map.get('a'), 0);
  assert.strictEqual(map.get('d'), 100);
  assert.strictEqual(map.get('b'), 50);
  assert.strictEqual(map.get('c'), 50);
  console.log('midrank ties OK');
}

{
  assert.strictEqual(unl.isUnlCompetition('欧国联'), true);
  assert.strictEqual(unl.isUnlCompetition('UEFA Nations League'), true);
  assert.strictEqual(unl.isUnlCompetition('国际友谊赛'), false);
  console.log('isUnlCompetition OK');
}

{
  const raws = [
    { id: 1, raw: { goals_pg: 0.5, sot_pg: 2, assists_pg: 0.2, kp_pg: 1, bcc_pg: 0.3, passes_pg: 400, da_pg: 40, pass_pct: 80, tackles_pg: 10, int_pg: 8, duel_win: 50, blk_pg: 1, save_pct: 70 } },
    { id: 2, raw: { goals_pg: 1.5, sot_pg: 5, assists_pg: 0.8, kp_pg: 3, bcc_pg: 1.0, passes_pg: 500, da_pg: 60, pass_pct: 88, tackles_pg: 12, int_pg: 9, duel_win: 55, blk_pg: 1.5, save_pct: 75 } },
    { id: 3, raw: { goals_pg: 2.5, sot_pg: 8, assists_pg: 1.2, kp_pg: 5, bcc_pg: 1.6, passes_pg: 600, da_pg: 80, pass_pct: 92, tackles_pg: 14, int_pg: 10, duel_win: 60, blk_pg: 2, save_pct: 80 } },
  ];
  const scored = unl.scoreRawAgainstPool(Object.assign({ id: 3 }, raws[2].raw), raws);
  assert.strictEqual(scored.complete, true);
  assert.ok(scored.axisScores[0] > 80, 'top attack scores high');
  console.log('scoreRawAgainstPool OK');
}

{
  const draft = {
    full_team_axis_scores: {
      10: { zh: '葡萄牙', en: 'Portugal', games: 4, raw: { goals_pg: 2, sot_pg: 6, assists_pg: 1, kp_pg: 4, bcc_pg: 1, passes_pg: 500, da_pg: 50, pass_pct: 88, tackles_pg: 12, int_pg: 8, duel_win: 55, blk_pg: 1, save_pct: 75 }, scores: [80, 80, 80, 50, 50, 50] },
      20: { zh: '西班牙', en: 'Spain', games: 4, raw: { goals_pg: 1, sot_pg: 4, assists_pg: 0.5, kp_pg: 2, bcc_pg: 0.5, passes_pg: 450, da_pg: 40, pass_pct: 84, tackles_pg: 10, int_pg: 7, duel_win: 50, blk_pg: 1, save_pct: 70 }, scores: [40, 40, 40, 40, 40, 40] },
    },
    samples: [{
      fixture_id: 99,
      pre: {
        home: {
          name_zh: '葡萄牙',
          name: 'Portugal',
          games: 3,
          raw: {},
          axes: [{ name: '进攻终结', score: 70 }],
          axis_scores: [70, 71, 72, 73, 74, 75],
        },
        away: {
          name_zh: '西班牙',
          name: 'Spain',
          games: 3,
          raw: {},
          axes: [{ name: '进攻终结', score: 40 }],
          axis_scores: [40, 41, 42, 43, 44, 45],
        },
      },
    }],
  };
  const finished = unl.scoreMatchTeams(10, 20, {
    draft,
    fixtureId: 99,
    finished: true,
    homeName: '葡萄牙',
    awayName: '西班牙',
  });
  assert.strictEqual(finished.ok, true);
  assert.strictEqual(finished.kind, 'unl-midrank');
  assert.strictEqual(finished.home.preMatch, true);
  assert.deepStrictEqual(finished.home.scores, [70, 71, 72, 73, 74, 75]);
  assert.ok(finished.noteZh.includes('不含本场') || finished.noteZh.includes('赛前'), finished.noteZh);

  const live = unl.scoreMatchTeams(10, 20, { draft, fixtureId: 100, finished: false });
  assert.strictEqual(live.ok, true);
  assert.strictEqual(live.home.preMatch, false);

  const missing = unl.scoreMatchTeams(10, 20, { draft: null });
  assert.strictEqual(missing.ok, false);
  assert.ok(missing.noteZh.includes('暂无'));
  console.log('scoreMatchTeams pre-match / fallback OK');
}

console.log('unl-ruler tests passed');
