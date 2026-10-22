'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const te = require('../lib/team-evidence');

// schedule softness bands
assert.strictEqual(te.classifyScheduleSoftness(0.90).band, 'soft');
assert.strictEqual(te.classifyScheduleSoftness(1.12).band, 'hard');
assert.strictEqual(te.classifyScheduleSoftness(1.00).band, 'neutral');
assert.strictEqual(te.classifyScheduleSoftness(null).band, 'unknown');

// moisture: soft schedule + strong opp + multi-metric collapse → 高
const crushedDeltas = {
  possession: { actual: 38, baseline: 58, delta: -20, missing: false },
  shots: { actual: 6, baseline: 14, delta: -8, missing: false },
  shotsOnTarget: { actual: 1, baseline: 5, delta: -4, missing: false },
  passesPct: { actual: 72, baseline: 84, delta: -12, missing: false },
  corners: { actual: 2, baseline: 6, delta: -4, missing: false },
  expectedGoals: { actual: 0.4, baseline: 1.6, delta: -1.2, missing: false },
};
const high = te.assessMoisture({
  deltas: crushedDeltas,
  opponentSi: 1.18,
  scheduleSoftnessBefore: 0.88,
  teamName: '软赛程队',
  opponentName: '豪门',
});
assert.strictEqual(high.moistureTag, '高');
assert.ok(high.isHardTest);
assert.ok(high.comprehensivelyCrushed);
assert.ok(/水分大/.test(high.moistureLabelZh));

// hard opp but produced chances → 低
const heldDeltas = {
  possession: { actual: 42, baseline: 55, delta: -13, missing: false },
  shots: { actual: 13, baseline: 11, delta: 2, missing: false },
  shotsOnTarget: { actual: 5, baseline: 3.5, delta: 1.5, missing: false },
  passesPct: { actual: 80, baseline: 82, delta: -2, missing: false },
  corners: { actual: 5, baseline: 4, delta: 1, missing: false },
  expectedGoals: { actual: 1.4, baseline: 1.1, delta: 0.3, missing: false },
};
const low = te.assessMoisture({
  deltas: heldDeltas,
  opponentSi: 1.15,
  scheduleSoftnessBefore: 1.0,
  teamName: '硬仗队',
  opponentName: '强敌',
});
assert.strictEqual(low.moistureTag, '低');
assert.ok(low.isHardTest);
assert.ok(/硬仗仍能产机会/.test(low.moistureLabelZh));

// weak opponent → not hard test
const na = te.assessMoisture({
  deltas: crushedDeltas,
  opponentSi: 0.85,
  scheduleSoftnessBefore: 1.0,
  teamName: 'A',
  opponentName: '弱旅',
});
assert.strictEqual(na.moistureTag, '—');
assert.ok(!na.isHardTest);

// applyEvidenceToProcessLean downgrades when moisture 高
const adj = te.applyEvidenceToProcessLean({
  processLean: 'h',
  homeSos: { avgSi: 0.88, ok: true },
  awaySos: { avgSi: 1.1, ok: true },
  homeEvidence: [{
    moistureTag: '高', moistureLabelZh: '水分大', isHardTest: true,
    coreCollapse: 4, opponent: '豪门', matchId: 'x1',
  }],
  awayEvidence: [],
  homeName: '软主',
  awayName: '客',
});
assert.strictEqual(adj.processLean, 'd');
assert.ok(adj.moistureMislead);
assert.ok(adj.adjusted);
assert.ok(adj.reasons.some(r => /硬仗检验/.test(r)));

// record + read roundtrip (temp store via monkeypatch path — use real DATA_DIR under data/)
const review = {
  ok: true,
  matchId: 'TEST-EV-1',
  home: '测试主',
  away: '曼城',
  homeTeamId: 'T-H',
  awayTeamId: '19',
  league: 'UEFA Champions League',
  date: '2026-10-16',
  ft: '0:3',
  result: 'a',
  hasActualStats: true,
  deltas: { home: crushedDeltas, away: heldDeltas },
  baselines: {
    home: { n: 5, averages: {}, sos: { avgSi: 0.88, ok: true } },
    away: { n: 5, averages: {}, sos: { avgSi: 1.05, ok: true } },
  },
};
const rec = te.recordFromReview(review);
assert.ok(rec.ok);
assert.ok(rec.home && rec.home.moistureTag === '高');
const eps = te.getTeamEpisodes('T-H', { limit: 3 });
assert.ok(eps.length >= 1);
assert.strictEqual(eps[0].matchId, 'TEST-EV-1');

const pack = te.getEvidenceForMatch({ id: 'other', homeTeamId: 'T-H', awayTeamId: '19', home: '测试主', away: '曼城' }, { limit: 2 });
assert.ok(pack.hasData);
assert.ok(pack.home.length >= 1);

const html = te.renderEvidenceHtml({ home: '测试主', away: '曼城' }, pack);
assert.ok(/自有检验/.test(html));
assert.ok(/水分大/.test(html));

const hard = te.buildHardTestBlock(review);
assert.ok(hard.available);
const hardHtml = te.renderHardTestHtml(hard, review);
assert.ok(/硬仗检验/.test(hardHtml));
assert.ok(/本场/.test(hardHtml));

console.log('team-evidence-test OK');

// 1.9.60: empty teamIds must NOT yield bare「暂无」when deltas exist
const frosReview = {
  ok: true,
  matchId: 'TEST-NO-ID',
  home: '弗洛西诺',
  away: '萨索洛',
  homeTeamId: '',
  awayTeamId: '',
  league: '意甲',
  date: '2026-10-17',
  ft: '4:2',
  result: 'h',
  hasActualStats: true,
  deltas: {
    home: {
      possession: { actual: 58, baseline: 45.3, delta: 12.7, missing: false },
      shots: { actual: 14, baseline: 17.3, delta: -3.3, missing: false },
      shotsOnTarget: { actual: 6, baseline: 5.4, delta: 0.6, missing: false },
      passesPct: { actual: 80.9, baseline: 76.3, delta: 4.6, missing: false },
      corners: { actual: 4, baseline: 5.3, delta: -1.3, missing: false },
      expectedGoals: { actual: 1.9, baseline: 1.4, delta: 0.5, missing: false },
    },
    away: {
      possession: { actual: 42, baseline: 47.8, delta: -5.8, missing: false },
      shots: { actual: 21, baseline: 15.1, delta: 5.9, missing: false },
      shotsOnTarget: { actual: 10, baseline: 6.3, delta: 3.7, missing: false },
      passesPct: { actual: 73.9, baseline: 86.7, delta: -12.8, missing: false },
      corners: { actual: 5, baseline: 4.5, delta: 0.5, missing: false },
      expectedGoals: { actual: 2.1, baseline: 1.6, delta: 0.5, missing: false },
    },
  },
  baselines: { home: { n: 8, averages: {} }, away: { n: 8, averages: {} }, source: 'pre-match-report' },
};
assert.ok(te.needsHardTestRepair({ ...frosReview, hardTest: { available: true, home: null, away: null } }));
const repaired = te.repairHardTest({ ...frosReview });
assert.ok(repaired.hardTest && repaired.hardTest.available);
assert.ok(repaired.hardTest.home, 'home episode after repair');
assert.ok(repaired.hardTest.away, 'away episode after repair');
assert.ok(repaired.hardTest.home.moistureLabelZh);
assert.ok(repaired.hardTest.away.briefSummaryZh);
const brokenHtml = te.renderHardTestHtml({ available: true, home: null, away: null, noteZh: 'x' }, frosReview);
assert.ok(!/暂无<\/p>/.test(brokenHtml), 'must not show bare 暂无 when deltas exist');
assert.ok(/水分|硬仗|非硬仗|不作硬仗/.test(brokenHtml));

console.log('team-evidence tests ok (incl. 1.9.60 empty-id hardTest)');


// 1.9.69: plain Chinese, no SI, no promo, sort by match-date proximity
const plain = te.assessMoisture({
  deltas: heldDeltas,
  opponentSi: 1.22,
  scheduleSoftnessBefore: 1.0,
  teamName: 'Real Betis',
  opponentName: 'FC Porto',
});
assert.ok(!/SI\s*\d/i.test(plain.summaryZh), 'summary must not contain SI numbers: ' + plain.summaryZh);
assert.ok(/贝蒂斯/.test(plain.summaryZh), 'Betis → 贝蒂斯: ' + plain.summaryZh);
assert.ok(/波尔图/.test(plain.summaryZh), 'Porto → 波尔图: ' + plain.summaryZh);
assert.ok(/对手偏强/.test(plain.summaryZh), 'plain strength: ' + plain.summaryZh);

const barcaMid = te.assessMoisture({
  deltas: {
    possession: { actual: 55, baseline: 62, delta: -7, missing: false },
    shots: { actual: 8, baseline: 14, delta: -6, missing: false },
    shotsOnTarget: { actual: 2, baseline: 5, delta: -3, missing: false },
    passesPct: { actual: 84, baseline: 88, delta: -4, missing: false },
    corners: { actual: 3, baseline: 6, delta: -3, missing: false },
    expectedGoals: { actual: 0.7, baseline: 1.5, delta: -0.8, missing: false },
  },
  opponentSi: 1.1,
  scheduleSoftnessBefore: 1.0,
  teamName: 'Barcelona',
  opponentName: 'Sevilla',
});
assert.ok(barcaMid.moistureTag === '中' || barcaMid.moistureTag === '高');
assert.ok(/巴塞罗那/.test(barcaMid.summaryZh));
assert.ok(/塞维利亚/.test(barcaMid.summaryZh));
assert.ok(!/SI\s*\d/i.test(barcaMid.summaryZh));

assert.strictEqual(te.toTeamZh('Galatasaray'), '加拉塔萨雷');
assert.strictEqual(te.opponentStrengthPlainZh(1.22), '对手偏强');
assert.strictEqual(te.opponentStrengthPlainZh(0.9), '对手偏弱');
assert.strictEqual(te.moistureTagClass({ moistureTag: '低' }), 'ht-low');
assert.strictEqual(te.moistureTagClass({ moistureTag: '中' }), 'ht-mid');
assert.strictEqual(te.moistureTagClass({ moistureTag: '—' }), 'ht-na');

const sorted = te.sortEpisodesByRecencyToMatch([
  { date: '2026-09-19', matchId: 'a' },
  { date: '2026-10-14', matchId: 'b' },
  { date: '2026-10-10', matchId: 'c' },
], '2026-10-17');
assert.deepStrictEqual(sorted.map(e => e.matchId), ['b', 'c', 'a'], 'nearest to match date first');

const html69 = te.renderEvidenceHtml(
  { home: '贝蒂斯', away: '某客', homeTeamId: '543', awayTeamId: 'x' },
  {
    hasData: true,
    home: [{
      matchId: '1', date: '2026-10-14', teamName: 'Real Betis', teamId: '543',
      opponent: 'FC Porto', opponentId: '212', moistureTag: '低',
      moistureLabelZh: '硬仗仍能产机会', opponentStrength: 1.22, isHardTest: true,
      mechanismTags: ['硬仗仍能产机会', '撑住：射正'],
      briefSummaryZh: 'Real Betis硬仗对阵FC Porto（SI 1.22）旧文案',
    }],
    away: [],
  }
);
assert.ok(/自有检验/.test(html69));
assert.ok(!/非千篇一律/.test(html69), 'promo removed');
assert.ok(!/本程序硬仗记忆/.test(html69), 'promo removed');
assert.ok(/对阵\s*波尔图/.test(html69), 'vs title Chinese: ' + html69);
assert.ok(!/Real Betis|FC Porto|SI\s*1\.22/.test(html69), 'no EN/SI in card: ' + html69);
assert.ok(/ht-low/.test(html69), 'positive tag class');
assert.ok(/贝蒂斯/.test(html69));

console.log('team-evidence-test 1.9.69 extras OK');



// 1.9.106: 自有检验 shows FT + 胜/平/负 relative to focus team
const html106 = te.renderEvidenceHtml(
  { home: '皇马', away: '莱红牛', homeTeamId: '664', awayTeamId: '1619' },
  {
    hasData: true,
    home: [{
      matchId: '2041968', date: '2026-10-15', side: 'away',
      teamName: '皇马', teamId: '664', opponent: '罗马',
      moistureTag: '低', moistureLabelZh: '硬仗仍能产机会',
      opponentStrength: 1.15, isHardTest: true, ft: '3:4', result: 'a',
      mechanismTags: ['撑住：角球'],
    }],
    away: [],
  }
);
assert.ok(/3:4\s*·\s*胜/.test(html106), 'score+胜: ' + html106);
assert.ok(/pr-ev-score/.test(html106));
assert.ok(/ev-w/.test(html106));

const fr = te.focusResultFromEpisode({ side: 'home', ft: '1:0', result: 'H' });
assert.strictEqual(fr.outcome, 'W');
assert.strictEqual(fr.outcomeZh, '胜');
const frL = te.focusResultFromEpisode({ side: 'away', ft: '2:1', result: 'H' });
assert.strictEqual(frL.outcome, 'L');
assert.strictEqual(frL.outcomeZh, '负');

const lt = require('../lib/league-tables');
assert.strictEqual(lt.teamZh('SV Elversberg'), '埃沃斯堡');
assert.strictEqual(lt.teamZh('FC Schalke 04'), '沙尔克04');
assert.strictEqual(lt.teamZh('Hamburg SV'), '汉堡');
assert.strictEqual(lt.teamZh('Rot-Weiß Essen'), '红白埃森');
assert.strictEqual(lt.leagueZh('DFB Pokal'), '德国杯');

console.log('team-evidence-test 1.9.106 score + namezh OK');
