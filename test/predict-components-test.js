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
  sum: {
    dir: 'a',
    strength: 'mild',
    n: 4,
    shift: { h: -0.04, d: 0.01, a: 0.04 },
    open: { h: 2.4, d: 3.2, a: 2.7 },
    last: { h: 2.7, d: 3.15, a: 2.4 },
    spark: [
      { h: 0.42, d: 0.28, a: 0.30 },
      { h: 0.38, d: 0.27, a: 0.35 },
      { h: 0.36, d: 0.26, a: 0.38 },
      { h: 0.34, d: 0.26, a: 0.40 },
    ],
  },
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
assert.ok(move.viz.series.length >= 2, 'sparkline uses the odds history');
const noSeries = pc.buildPack({
  blocks: {
    movement: { hasData: true, lean: 'a', delta: 0, sum: { dir: 'a', shift: { h: -0.04, d: 0, a: 0.04 } } },
    context, form,
  },
});
const noSeriesHtml = pc.renderCards(noSeries.components, { skin: 'dqd', pack: noSeries });
assert.ok(noSeriesHtml.includes('没有赔率走势'));
assert.ok(!noSeriesHtml.includes('pc-spark'));
const twoPoint = pc.buildPack({
  blocks: {
    movement: {
      hasData: true, lean: 'a', delta: 0,
      sum: { dir: 'a', open: { h: 2.4, d: 3.2, a: 2.7 }, last: { h: 2.7, d: 3.15, a: 2.4 } },
    },
    context, form,
  },
});
const twoMove = twoPoint.components.find(c => c.id === 'move');
assert.strictEqual(twoMove.viz.series.length, 2);
assert.ok(twoMove.viz.series[1] > twoMove.viz.series[0], 'shorter away odds draw an upward line');
assert.strictEqual(twoMove.viz.chip, '近况与盘口相反');
const sameWay = pc.buildPack({
  blocks: {
    movement: {
      hasData: true, lean: 'h', delta: 0,
      sum: {
        dir: 'h', n: 2,
        open: { h: 2.2, d: 3.2, a: 3.1 },
        last: { h: 1.9, d: 3.3, a: 3.4 },
        spark: [{ h: 0.40, d: 0.30, a: 0.30 }, { h: 0.48, d: 0.28, a: 0.24 }],
      },
    },
    context, form,
  },
});
assert.strictEqual(sameWay.components.find(c => c.id === 'move').viz.chip, '近况与盘口同向');
assert.ok(pc.renderCards(twoPoint.components, { skin: 'dqd', pack: twoPoint }).includes('pc-spark'));
assert.strictEqual(noSeries.components.find(c => c.id === 'move').confDelta < 0, true);
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
assert.ok(!html.includes('pc-ev'));
assert.ok(!html.includes('证据足'));
assert.ok(!html.includes('角标是样本'));
assert.ok(html.includes('pc-move-rows'));
assert.ok(!html.includes('pc-move-cols'));
assert.ok(html.includes('对位提示'));
assert.ok(html.includes('客队这边松'));
assert.ok(html.includes('模型推理 vs 市场赔率'));
assert.ok(html.includes('pc-vgrp is-hot'));
assert.ok(/差 \d+pt/.test(html));
assert.ok(html.includes('pc-spark'));
assert.ok(html.includes('差在哪'));
assert.ok(html.includes('模型偏主胜，盘口偏客胜'));
assert.ok(html.includes('控球但打不进去'));
assert.ok(html.includes('先不看'));
assert.ok(html.includes('pc-card is-gold'));
assert.ok(html.includes('近况与盘口相反'));
assert.ok(!html.includes('方向相反'));
assert.ok(!html.includes('同向加强'));
assert.ok(html.includes('更看好主胜'));
assert.ok(html.includes('更看好客胜'));
assert.ok(html.includes('主胜水位抬高'));
assert.ok(html.includes('客胜赔率走低'));
assert.ok(!html.includes('往客胜挪'));
assert.ok(!html.includes('我们算的'));
assert.ok(html.includes('影响：'));
assert.ok(html.includes('样本不够，先不画'));
assert.ok(!html.includes('pc-arrows'));
assert.ok(!html.includes('动到：'));
assert.ok(!html.includes('客防空'));
assert.ok(!html.includes('启发式'));
assert.ok(!html.includes('归因'));
assert.ok(!html.includes('<ol'));
assert.ok(!html.includes('GPS'));
const order = ['额外表态', '模型与盘口', '近况攻防习惯', '对位提示', 'data-id="motive"', '胜平负 · 模型概率', '大小球（O2.5）'];
let prev = -1;
for (const bit of order) {
  const at = html.indexOf(bit);
  assert.ok(at > prev, 'page order ' + bit);
  prev = at;
}
const sm = pc.renderCards(after.components, { skin: 'sm', pack: after, deferred: after.deferred });
assert.ok(sm.includes('sm-kit'));
assert.ok(sm.includes('pc-card'));
assert.ok(sm.includes('data-id="motive"'));
assert.ok(sm.includes('高位逼抢'));
assert.ok(sm.includes('先不看'));
assert.ok(sm.includes('影响：'));
assert.ok(!sm.includes('pc-ev'));
assert.ok(sm.includes('pc-move-rows'));
assert.ok(!sm.includes('证据足'));
const clockHtml = pc.renderCards(clock.components, { skin: 'dqd', pack: clock });
assert.ok(clockHtml.includes('pc-gd'));
assert.ok(clockHtml.includes('主近 8 场'));
assert.ok(clockHtml.includes('客近 8 场'));
assert.ok(clockHtml.includes('场均'));
assert.ok(clockHtml.includes('>0.5<'));
assert.ok(!clockHtml.includes('>4<'));
assert.strictEqual(clock.components.find(c => c.id === 'clock').lambdaHome, 0.02);
const uneven = pc.buildPack({
  blocks: {
    goalClock: {
      home: { n_fixtures: 20, segments: { '0-15': 8, '16-30': 6, '31-45': 4, '46-60': 6, '61-75': 4, '76-90': 2 } },
      away: { n_fixtures: 6, segments: { '0-15': 2, '16-30': 1, '31-45': 1, '46-60': 2, '61-75': 2, '76-90': 3 } },
    },
  },
});
const unevenClock = uneven.components.find(c => c.id === 'clock');
assert.strictEqual(unevenClock.scoreDelta, 0);
assert.strictEqual(unevenClock.lambdaHome, 0);
const unevenHtml = pc.renderCards(uneven.components, { skin: 'dqd', pack: uneven });
assert.ok(unevenHtml.includes('主近 20 场'));
assert.ok(unevenHtml.includes('客近 6 场'));
assert.ok(unevenHtml.includes('>0.4<'));
assert.ok(!unevenHtml.includes('>8<'));
const spread = pc.buildPack({
  blocks: {
    goalClock: {
      home: { n_fixtures: 8, segments: { '0-15': 1, '16-30': 1, '31-45': 2, '46-60': 3, '61-75': 2, '76-90': 4 } },
      away: { n_fixtures: 8, segments: { '0-15': 1, '16-30': 1, '31-45': 2, '46-60': 2, '61-75': 3, '76-90': 4 } },
    },
  },
});
const spreadClock = spread.components.find(c => c.id === 'clock');
assert.strictEqual(spreadClock.fired, true);
assert.strictEqual(spreadClock.scoreDelta, 0);
assert.strictEqual(spreadClock.lambdaHome, 0);
assert.ok(pc.renderCards(spread.components, { skin: 'dqd', pack: spread }).includes('pc-gd'));
assert.ok(clockHtml.includes('00′'));
assert.ok(clockHtml.includes('90′'));
assert.ok(clockHtml.includes('home h1'));
assert.ok(clockHtml.includes('away h2'));
assert.ok(clockHtml.includes('先丢球习惯'));
assert.ok(clockHtml.includes('pc-rest'));
assert.ok(!clockHtml.includes('pc-time'));
const thinHtml = pc.renderCards(thin.components, { skin: 'dqd', pack: thin });
assert.ok(thinHtml.includes('分钟不够，改看上半场'));
assert.ok(!thinHtml.includes('pc-gd'));
const gkHtml = pc.renderCards(gk.components, { skin: 'sm', pack: gk });
assert.ok(gkHtml.includes('pc-card is-weak'));
assert.ok(gkHtml.includes('pc-saves'));
const noGkHtml = pc.renderCards(noGk.components, { skin: 'dqd', pack: noGk });
assert.ok(noGkHtml.includes('样本不够，先不画'));
assert.ok(!noGkHtml.includes('pc-saves'));
const laneHtml = pc.renderCards([{
  id: 'lanecore',
  name: '通道核心伤停',
  evidence: '弱',
  fired: true,
  markets: ['胜平负', '让球'],
  say: '只对上了位置，不是跑位热图 · 证据偏弱',
  viz: { kind: 'cores', people: [{ who: '萨卡', lane: '左路', image: '', matched: true }] },
}], { skin: 'dqd' });
assert.ok(laneHtml.includes('萨卡'));
assert.ok(laneHtml.includes('左路'));
assert.ok(laneHtml.includes('不是跑位热图'));
assert.ok(!laneHtml.includes('pc-av'));
assert.ok(!laneHtml.includes('>左<'));
const lanePhoto = pc.renderCards([{
  id: 'lanecore',
  name: '通道核心伤停',
  evidence: '弱',
  fired: true,
  markets: ['胜平负'],
  say: '只对上了位置，不是跑位热图 · 证据偏弱',
  viz: { kind: 'cores', people: [{ who: '萨卡', lane: '左路', image: 'https://cdn.sportmonks.com/images/soccer/players/2/18.png', matched: true }] },
}], { skin: 'dqd' });
assert.ok(lanePhoto.includes('pc-av'));
assert.ok(lanePhoto.includes('/api/logo?url='));

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
