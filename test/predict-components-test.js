'use strict';
const assert = require('assert');
const heat = require('../lib/heat-pitch');
const cm = require('../lib/corridor-matchup');
const pc = require('../lib/predict-components');
const pr = require('../lib/predict-report');
const sc = require('../lib/strength-calib');

function pts(x, y, n) {
  return Array.from({ length: n || 80 }, () => ({ x, y, period_id: 1 }));
}
function fx(id, coordinates) {
  return {
    id,
    participants: [
      { id: 10, meta: { location: 'home' } },
      { id: 20, meta: { location: 'away' } },
    ],
    periods: [{ id: 1, description: '1st-half' }],
    ballcoordinates: coordinates,
    events: [],
  };
}

const homeFx = fx(1, pts(0.82, 0.12).concat(pts(0.18, 0.5)));
const awayFx = fx(2, pts(0.18, 0.5).concat(pts(0.82, 0.88)));
const matchHeat = heat.buildMatchHeat({
  homeId: 10,
  awayId: 20,
  homeFixtures: [homeFx],
  awayFixtures: [awayFx],
});
const corridor = cm.buildCorridorMatchup(matchHeat, { sidelined: [], cores: { home: [], away: [] } });
assert.strictEqual(corridor.available, true, 'corridor available');
assert.ok(corridor.mismatch_home_favors, 'home attack lane meets away thin lane');
assert.ok(!corridor.mismatch_away_favors, 'away mismatch stays off in this fixture');

const process = {
  hasData: true,
  lean: null,
  facts: {
    home: { n: 6, averages: { possession: 64, shots: 9.2, expectedGoals: 0.9, dangerousAttacks: 28 } },
    away: { n: 6, averages: { possession: 46, shots: 13.1, expectedGoals: 1.4, dangerousAttacks: 41 } },
  },
};
const context = {
  lean: 'h',
  delta: 0.15,
  tags: [
    { side: 'h', kind: 'motiv', text: '主队争冠' },
    { side: 'a', kind: 'motiv', text: '客队无欲无求' },
  ],
  facts: { restH: 6, restA: 2 },
};
const form = {
  hasData: true,
  facts: {
    home: { summary: { w: 4, d: 1, l: 0 } },
    away: { summary: { w: 1, d: 1, l: 3 } },
  },
};
const movement = {
  hasData: true,
  lean: 'a',
  delta: 0,
  sum: { dir: 'a', strength: 'mild', shift: { h: -0.04, d: 0.01, a: 0.04 } },
};

const before = pc.buildPack({
  m: { league: '英超', home: '主队', away: '客队' },
  blocks: {
    corridor, process, context, form, movement, heat: matchHeat,
    squad: { sidelined: [], cores: { home: [], away: [] }, half: { home: { n: 0 }, away: { n: 0 } } },
    goalClock: null,
    smPressure: { available: false, detail: '403-addon' },
  },
});
const corridorComp = before.components.find(c => c.id === 'corridor');
const sterile = before.components.find(c => c.id === 'sterile');
const tempo = before.components.find(c => c.id === 'tempo');
const motive = before.components.find(c => c.id === 'motive');
const sched = before.components.find(c => c.id === 'schedule');
const move = before.components.find(c => c.id === 'move');
const press = before.components.find(c => c.id === 'press');
assert.strictEqual(corridorComp.fired, true);
assert.ok(corridorComp.scoreDelta > 0, 'corridor lifts home');
assert.ok(corridorComp.chain.some(s => s.includes('不是进球走廊')));
assert.strictEqual(sterile.fired, true);
assert.ok(sterile.scoreDelta < 0, 'sterile possession discounts home');
assert.strictEqual(tempo.fired, true);
assert.ok(tempo.scoreDelta < 0, 'counter leans away');
assert.ok(tempo.lambdaHome > 0 && tempo.lambdaAway > 0);
assert.strictEqual(motive.scoreDelta, 0.12);
assert.ok(sched.scoreDelta > 0, 'away short rest lifts home');
assert.strictEqual(move.scoreDelta, 0, 'opposite odds move must not flip the lean');
assert.ok(move.confDelta < 0);
assert.strictEqual(press.fired, false);
assert.ok(press.chain.join('').includes('跳过'));

const oddsEdge = {
  exp: { expH: 1.35, expA: 1.05 },
  over25: sc.over25Prob(2.4),
  wdl: sc.wdlProbs(1.35, 1.05),
  rq: {
    line: -0.5,
    rows: [
      { k: 'h', lab: '让胜', model: 0.4, fair: 0.33, odd: 2.4 },
      { k: 'd', lab: '让平', model: 0.28, fair: 0.3, odd: 3.2 },
      { k: 'a', lab: '让负', model: 0.32, fair: 0.37, odd: 2.6 },
    ],
  },
};
const market = {
  p: { h: 0.3, d: 0.22, a: 0.48 },
  q: { h: 0.33, d: 0.3, a: 0.37 },
};
const overBefore = oddsEdge.over25;
const nudged = pc.nudgeOddsEdge(oddsEdge, before, market);
const after = pc.attachDivergence(before, { wdl: nudged.wdl, marketP: market.p, rq: nudged.rq });
const diverge = after.components.find(c => c.id === 'diverge');
assert.strictEqual(diverge.fired, true);
assert.strictEqual(diverge.scoreDelta, 0, 'divergence explains, it does not copy the market');
assert.ok(diverge.confDelta < 0);
assert.ok(after.notes.ou.includes('球权') || after.notes.ou.includes('节奏') || after.notes.ou.length > 0);
assert.notStrictEqual(nudged.over25, overBefore);
assert.ok(nudged.exp.expH !== oddsEdge.exp.expH || nudged.exp.expA !== oddsEdge.exp.expA);

const baseBlocks = {
  background: { hasData: false },
  form: { hasData: false },
  h2h: { hasData: false },
  injuries: { hasData: false, available: false },
  schedule: { hasData: false, text: '' },
  market: { available: false },
  process: { hasData: false },
  movement: null,
  context: null,
  intel: null,
};
const m = { id: 't', home: '主队', away: '客队', league: '英超', date: '2026-11-08', time: '20:00' };
const leanOnly = pc.buildPack({
  m,
  blocks: {
    corridor,
    context,
    heat: matchHeat,
    squad: { sidelined: [], cores: { home: [], away: [] } },
  },
});
const plain = pr._synthesize(m, baseBlocks);
const lifted = pr._synthesize(m, Object.assign({}, baseBlocks, { components: leanOnly }));
const withOdds = pr._synthesize(m, Object.assign({}, baseBlocks, {
  market: { available: true, p: market.p, gap: 18, conf: 0.55 },
  movement,
  form,
  process,
  context,
  components: after,
}));
const oddsBase = pr._synthesize(m, Object.assign({}, baseBlocks, {
  market: { available: true, p: market.p, gap: 18, conf: 0.55 },
  movement,
  form,
  process,
  context,
}));
assert.strictEqual(plain.lean, 'd');
assert.strictEqual(lifted.lean, 'h', 'corridor + rest + motive cross the home lean line');
assert.ok(withOdds.conf < oddsBase.conf - 0.01, 'divergence and reverse move cut confidence');
assert.strictEqual(withOdds.lean, oddsBase.lean, 'those two cards do not flip the lean');
assert.ok((lifted.reasons || []).some(r => /推导组件/.test(r)));

const clock = pc.buildPack({
  blocks: {
    goalClock: {
      home: { n_fixtures: 8, segments: { '0-15': 4, '16-30': 3, '31-45': 1, '46-60': 1, '61-75': 0, '76-90': 1, et: 0 }, concede_first_index: 0.62 },
      away: { n_fixtures: 8, segments: { '0-15': 3, '16-30': 3, '31-45': 1, '46-60': 1, '61-75': 1, '76-90': 0, et: 0 }, concede_first_index: 0.2 },
    },
    squad: { half: { home: { n: 2, lead: 0, trail: 0 }, away: { n: 2, lead: 0, trail: 0 } } },
  },
});
assert.strictEqual(clock.components.find(c => c.id === 'clock').fired, true);
assert.strictEqual(clock.components.find(c => c.id === 'concede').fired, true);

const thin = pc.buildPack({
  blocks: {
    goalClock: { home: { n_fixtures: 1, segments: { '0-15': 1 } }, away: null },
    squad: {
      half: {
        home: { lead: 4, draw: 1, trail: 1, n: 6 },
        away: { lead: 3, draw: 1, trail: 2, n: 6 },
      },
    },
  },
});
const thinClock = thin.components.find(c => c.id === 'clock');
assert.strictEqual(thinClock.fired, true);
assert.ok(thinClock.chain.some(s => s.includes('半场比分')));

const gk = pc.buildPack({
  gk: { home: { avg: 3.4, n: 6 }, away: { avg: 1.8, n: 6 } },
  blocks: {},
});
assert.strictEqual(gk.components.find(c => c.id === 'keeper').fired, true);
assert.ok(gk.components.find(c => c.id === 'keeper').chain.join('').includes('弱证据'));

const noGk = pc.buildPack({ blocks: {} });
assert.strictEqual(noGk.components.find(c => c.id === 'keeper').fired, false);

const html = require('../lib/predict-surface').renderPredictSurface({
  home: '主队',
  away: '客队',
  concl: { lean: lifted.lean, pickText: lifted.pickText, conf: lifted.conf, speakMode: 'amplify', _speakResolved: true },
  components: after,
  oddsEdge: nudged,
  market,
  heat: matchHeat,
  corridor,
});
assert.ok(html.includes('推导组件'));
assert.ok(html.includes('进攻走廊对防守走廊'));
assert.ok(html.includes('模型与盘口分歧'));
assert.ok(html.includes('无效控球'));
assert.ok(html.includes('先不进权重'));
assert.ok(!html.includes('GPS'));
const sm = pc.renderCards(after.components, { skin: 'sm', pack: after, deferred: after.deferred });
assert.ok(sm.includes('sm-kit'));
assert.ok(sm.includes('动机不对称'));
assert.ok(sm.includes('高位逼抢'));

const signed = n => (n > 0 ? '+' : '') + Number(n).toFixed(2);
console.log('EXAMPLE corridor mismatch / odds divergence');
console.log('lean-only before', plain.lean, plain.conf.toFixed(3), 'after', lifted.lean, lifted.conf.toFixed(3), 'score', signed(leanOnly.scoreDelta));
console.log('with-market before lean', oddsBase.lean, 'conf', oddsBase.conf.toFixed(3), 'after lean', withOdds.lean, 'conf', withOdds.conf.toFixed(3));
console.log('over25', overBefore.toFixed(3), '->', nudged.over25.toFixed(3), 'expH', oddsEdge.exp.expH.toFixed(2), '->', nudged.exp.expH.toFixed(2));
console.log('full scoreDelta', signed(after.scoreDelta), 'confDelta', signed(after.confDelta),
  'lambda', signed(after.lambda.home), signed(after.lambda.away));
console.log('ou', after.notes.ou);
console.log('diverge', diverge.chain[0]);
console.log('predict-components-test OK');
