'use strict';
const assert = require('assert');
const ds = require('../lib/deepseek-prematch');

const report = {
  ok: true,
  matchId: 'T1',
  home: '甲',
  away: '乙',
  league: '英超',
  date: '2026-10-18',
  sections: {
    form: { hasData: true, text: '近况甲略优' },
    process: {
      hasData: true,
      lean: 'h',
      facts: {
        home: { n: 5, averages: { possession: 55, shots: 14, shotsOnTarget: 5, corners: 5, expectedGoals: 1.4 }, sos: { avgSi: 0.92, band: 'soft' } },
        away: { n: 5, averages: { possession: 48, shots: 11, shotsOnTarget: 4, corners: 4, expectedGoals: 1.1 }, sos: { avgSi: 1.05 } },
      },
    },
    h2h: { hasData: true, text: '近6交锋甲3胜' },
    market: { available: true, text: '竞彩偏主胜' },
    teamEvidence: {
      hasData: true,
      home: [{ opponent: '强敌', moistureLabelZh: '水分大', isHardTest: true, briefSummaryZh: '硬仗崩盘' }],
      away: [],
    },
    injuries: { hasData: false, text: '暂无' },
    conclusion: {
      lean: 'h', conf: 0.66, speakMode: 'amplify', speakLabel: '',
      marketLean: 'h', processLean: 'h', formLean: 'h',
      reasons: ['过程偏主', '近况偏主'], risks: [], conflict: false,
    },
  },
  predict: { top: 'h', conf: 0.66, speakMode: 'amplify', pickText: '主胜' },
  html: '<div class="pr-brief"><section class="pr-sec pr-concl"><h4>额外表态</h4><p>ok</p></section></div>',
};

assert.ok(ds.isEvidenceThickEnough(report));
assert.ok(ds.needsAiEnrich(report) || !ds.apiKeyPresent()); // needs enrich if key present or always true when no ai yet
const pack = ds.buildEvidencePack(report, { id: 'T1', home: '甲', away: '乙' });
assert.strictEqual(pack.local.综合倾向, '主胜');
assert.ok(pack.过程.主队);
assert.ok(pack.自有硬仗.有数据);

assert.strictEqual(ds.AI_PREMATCH_REV, 3);
assert.ok(pack.规则 && pack.规则.盘口篇幅);
assert.ok(/整体近期|球员表|对手对比|过程SoS|球员近场/.test(pack.规则.叙事重心 || ''));

const goodNarr = Array.from({ length: 7 }, (_, i) => `第${i + 1}行：主队过程与盘口同向，赛程偏软需折扣。`).join('\n');
const validated = ds.validateAiResponse({
  directionZh: '主胜',
  confidencePct: 66,
  unitForm: '同向表态主胜',
  narrativeZh: goodNarr + '\n分析参考非购彩建议。',
  alignWithLocal: true,
}, pack);
assert.ok(validated.ok, validated.reason);

const leak = ds.validateAiResponse({
  directionZh: '主胜',
  confidencePct: 66,
  unitForm: 'x',
  narrativeZh: goodNarr + '\nprocessLean supports amplify.\n分析参考非购彩建议。',
}, pack);
assert.ok(!leak.ok);

const html = ds.renderAiPrematchHtml({
  ok: true, directionZh: '主胜', confidencePct: 66, unitForm: '同向', narrativeZh: goodNarr,
});
assert.ok(/AI赛前解读/.test(html));
const injected = ds.injectAiHtml(report.html, html);
assert.ok(/pr-ai-prematch/.test(injected));

console.log('deepseek-prematch tests ok');
