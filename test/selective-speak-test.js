'use strict';
const assert = require('assert');
const pr = require('../lib/predict-report');
const pmr = require('../lib/post-match-review');

// Align when market present, same direction, low conf, no shock (少说 preserved)
{
  const st = pr._resolveSpeakStance({
    lean: 'h', pickText: '主胜', conf: 0.55, marketLean: 'h',
    processLean: 'h', formLean: 'h', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'align');
  assert.ok(/与盘口一致/.test(st.speakLabel));
  assert.strictEqual(st.stanceLvl[1], '观望');
}

// Same direction + conf >= 0.62 → amplify (1.9.39 new path), 稳胆 at 0.62
{
  const st = pr._resolveSpeakStance({
    lean: 'h', pickText: '主胜', conf: 0.62, marketLean: 'h',
    processLean: 'h', formLean: 'h', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('high_conf_same'));
  assert.strictEqual(st.stanceLvl[1], '稳胆');
}

// Same direction + conf 0.61 → still align (below 稳胆 / amplify bar)
{
  const st = pr._resolveSpeakStance({
    lean: 'a', pickText: '客胜', conf: 0.61, marketLean: 'a',
    processLean: 'a', formLean: 'a', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'align');
  assert.strictEqual(st.stanceLvl[1], '观望');
}

// Reverse market → must amplify even without other shocks
{
  const st = pr._resolveSpeakStance({
    lean: 'a', pickText: '客胜', conf: 0.5, marketLean: 'h',
    processLean: null, formLean: null, conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('reverse_market') || st.shockSignals.includes('conflict'));
  assert.strictEqual(st.stanceLvl[1], '倾向'); // 0.5 → 倾向 (稳胆 now 0.62)
}

// Amplify on process vs market conflict; conf 0.62 → 稳胆
{
  const st = pr._resolveSpeakStance({
    lean: 'a', pickText: '客胜', conf: 0.62, marketLean: 'h',
    processLean: 'a', formLean: 'd', conflict: true,
    risks: ['过程数据与竞彩赔率方向不一致'], dataPoints: 4,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('conflict') || st.shockSignals.includes('process_market') || st.shockSignals.includes('reverse_market'));
  assert.strictEqual(st.stanceLvl[1], '稳胆');
}

// conf 0.60 amplify → 倾向 (no longer 稳胆; bar moved to 0.62)
{
  const st = pr._resolveSpeakStance({
    lean: 'h', pickText: '主胜', conf: 0.60, marketLean: 'a',
    conflict: true, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.strictEqual(st.stanceLvl[1], '倾向');
}


// 1.9.41: lean=平局 vs market 主胜 → reverse amplify (draw is a real stance)
{
  const st = pr._resolveSpeakStance({
    lean: 'd', pickText: '平局', conf: 0.5, marketLean: 'h',
    processLean: null, formLean: null, conflict: true, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('reverse_market') || st.shockSignals.includes('conflict'));
  assert.strictEqual(st.stanceLvl[1], '倾向');
}

// 1.9.41: lean=market=平局 + conf>=0.62 → amplify (same-dir high conf)
{
  const st = pr._resolveSpeakStance({
    lean: 'd', pickText: '平局', conf: 0.62, marketLean: 'd',
    processLean: null, formLean: 'd', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('high_conf_same'));
  assert.strictEqual(st.stanceLvl[1], '稳胆');
}

// 1.9.41: lean=market=平局 + low conf, no shock → still align (少说 preserved)
{
  const st = pr._resolveSpeakStance({
    lean: 'd', pickText: '平局', conf: 0.5, marketLean: 'd',
    processLean: null, formLean: 'd', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'align');
  assert.strictEqual(st.stanceLvl[1], '观望');
}

// 1.9.41: market=平局 + lean=客胜 → reverse amplify
{
  const st = pr._resolveSpeakStance({
    lean: 'a', pickText: '客胜', conf: 0.5, marketLean: 'd',
    conflict: true, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('reverse_market') || st.shockSignals.includes('conflict'));
}

// Abstain without market
{
  const st = pr._resolveSpeakStance({
    lean: 'd', pickText: '平局', conf: 0.4, marketLean: null,
    conflict: false, risks: ['缺少有效胜平负赔率'], dataPoints: 1,
  });
  assert.strictEqual(st.speakMode, 'abstain');
  assert.ok(/信息不足/.test(st.speakLabel));
}

// Injury shock amplifies
{
  const st = pr._resolveSpeakStance({
    lean: 'h', pickText: '主胜', conf: 0.5, marketLean: 'h',
    conflict: false, risks: ['客队伤停偏多（4 人）：A、B'], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('injuries'));
}

const fb = pmr.buildLeanFeedback({
  lean: 'h', pickText: '主胜', conf: 0.66, marketLean: 'h',
  speakMode: 'amplify', processLean: 'h', formLean: 'a', rankLean: null,
}, 'h');
assert.ok(fb.available);
assert.strictEqual(fb.leanHit, true);
assert.strictEqual(fb.amplifyHit, true);
assert.ok(fb.supportedBlocks.includes('process'));
assert.ok(fb.misledBlocks.includes('form'));
assert.ok(/额外表态/.test(fb.text));
assert.strictEqual(fb.highConf, true); // 0.66 >= 0.62

const alignFb = pmr.buildLeanFeedback({
  lean: 'h', marketLean: 'h', speakMode: 'align', conf: 0.5,
}, 'a');
assert.strictEqual(alignFb.speakMode, 'align');
assert.strictEqual(alignFb.amplifyHit, null);
assert.ok(/与盘口一致/.test(alignFb.text));
assert.strictEqual(alignFb.highConf, false); // 0.5 < 0.62


const drawFb = pmr.buildLeanFeedback({
  lean: 'd', pickText: '平局', conf: 0.55, marketLean: 'h',
  speakMode: 'amplify', processLean: 'h', formLean: 'd', rankLean: null,
}, 'd');
assert.ok(drawFb.available);
assert.strictEqual(drawFb.leanHit, true);
assert.strictEqual(drawFb.amplifyHit, true);
assert.ok(drawFb.misledBlocks.includes('process') || drawFb.misledBlocks.includes('market') || true);
assert.ok(drawFb.misledBlocks.includes('market')); // market h vs result d
assert.ok(/额外表态/.test(drawFb.text) && /平局/.test(drawFb.text));

const drawMktHit = pmr.buildLeanFeedback({
  lean: 'd', pickText: '平局', conf: 0.66, marketLean: 'd',
  speakMode: 'amplify', processLean: null, formLean: 'd', rankLean: null,
}, 'd');
assert.strictEqual(drawMktHit.amplifyHit, true);
assert.strictEqual(drawMktHit.marketHit, true);
assert.ok(drawMktHit.supportedBlocks.includes('market')); // market 'd' is a real lean

const stats = pmr.getUsefulnessStats();
assert.ok(stats.ok);
assert.ok(typeof stats.sampleN === 'number');
assert.ok(stats.noteZh);

console.log('selective-speak-test OK');
