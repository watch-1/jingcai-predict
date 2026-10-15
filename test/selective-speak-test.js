'use strict';
const assert = require('assert');
const pr = require('../lib/predict-report');
const pmr = require('../lib/post-match-review');

// Align when market present and no shock
{
  const st = pr._resolveSpeakStance({
    lean: 'h', pickText: '主胜', conf: 0.55, marketLean: 'h',
    processLean: 'h', formLean: 'h', conflict: false, risks: [], dataPoints: 3,
  });
  assert.strictEqual(st.speakMode, 'align');
  assert.ok(/与盘口一致/.test(st.speakLabel));
  assert.strictEqual(st.stanceLvl[1], '观望');
}

// Amplify on process vs market conflict
{
  const st = pr._resolveSpeakStance({
    lean: 'a', pickText: '客胜', conf: 0.62, marketLean: 'h',
    processLean: 'a', formLean: 'd', conflict: true,
    risks: ['过程数据与竞彩赔率方向不一致'], dataPoints: 4,
  });
  assert.strictEqual(st.speakMode, 'amplify');
  assert.ok(st.shockSignals.includes('conflict') || st.shockSignals.includes('process_market'));
  assert.strictEqual(st.stanceLvl[1], '稳胆');
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

const alignFb = pmr.buildLeanFeedback({
  lean: 'h', marketLean: 'h', speakMode: 'align', conf: 0.5,
}, 'a');
assert.strictEqual(alignFb.speakMode, 'align');
assert.strictEqual(alignFb.amplifyHit, null);
assert.ok(/与盘口一致/.test(alignFb.text));

const stats = pmr.getUsefulnessStats();
assert.ok(stats.ok);
assert.ok(typeof stats.sampleN === 'number');
assert.ok(stats.noteZh);

console.log('selective-speak-test OK');
