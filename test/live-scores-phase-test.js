'use strict';
const assert = require('assert');
const { fromSporttery, inferClockPhase, formatClockMinute, fromAf } = require('../lib/live-scores');

function check(name, row, expect) {
  const got = fromSporttery(row);
  assert.ok(got, name + ' null');
  for (const [k, v] of Object.entries(expect)) {
    assert.strictEqual(got[k], v, `${name}: ${k} want ${v} got ${got[k]} (phaseZh=${got.phaseZh} min=${got.minute})`);
  }
  console.log('ok', name, '→', got.phase, got.phaseZh, got.minute != null ? got.minute + "'" : '');
}

// Same score as half + late minute + season meta: do NOT invent 2H from minute alone
// (was sticky 中场 via ph=2; 1.9.54 used minute≥46→2H which broke 1H stoppage).
check('登博思-like late minute same as half → LIVE not invented 2H', {
  matchId: 2042006, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '2', matchPhaseTcName: '季后赛',
  sectionsNo999: '2:0', sectionsNo1: '2:0', matchMinute: 86,
}, { phase: 'LIVE', phaseZh: '进行中', live: true, finished: false });

check('海伦芬 score past HT', {
  matchId: 2042005, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '2', matchPhaseTcName: '季后赛',
  sectionsNo999: '3:0', sectionsNo1: '1:0', matchMinute: 86,
}, { phase: '2H', phaseZh: '下半场', live: true });

// 0-0 at 56' with season meta only: minute alone must NOT invent 2H
check('法兰克福 ambiguous late minute no score-past', {
  matchId: 2042007, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '2', matchPhaseTcName: '季后赛',
  sectionsNo999: '0:0', sectionsNo1: '0:0', matchMinute: 56,
}, { phase: 'LIVE', phaseZh: '进行中' });

// True HT: ph=10 中场休息, score==half, minute ~47 must stay 中场
check('true HT rest', {
  matchId: 2042008, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '10', matchPhaseTcName: '中场休息',
  sectionsNo999: '3:2', sectionsNo1: '3:2', matchMinute: 47,
}, { phase: 'HT', phaseZh: '中场', live: true });

// Sticky HT name but score already moved → 2H
check('HT name but score past', {
  matchId: 9, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '10', matchPhaseTcName: '中场休息',
  sectionsNo999: '2:1', sectionsNo1: '1:1', matchMinute: 48,
}, { phase: '2H', phaseZh: '下半场' });

// ph=1「当前赛季」+ minute 44 → 1H (not trust ph alone)
check('season code 1 + 1H minute', {
  matchId: 2042010, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '1', matchPhaseTcName: '当前赛季',
  sectionsNo999: '1:1', sectionsNo1: '', matchMinute: 45,
}, { phase: '1H', phaseZh: '上半场' });

check('explicit 下半场 name', {
  matchId: 1, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '3', matchPhaseTcName: '下半场',
  sectionsNo999: '1:0', sectionsNo1: '0:0', matchMinute: 67,
}, { phase: '2H', phaseZh: '下半场' });

check('FT', {
  matchId: 2, matchStatus: '6', matchStatusName: '直播结束',
  matchPhaseTc: '14', matchPhaseTcName: '比赛结束',
  sectionsNo999: '1:1', sectionsNo1: '0:0', matchMinute: 100,
}, { phase: 'FT', phaseZh: '完场', live: false, finished: true });

// --- 1.9.71: Brentford-like 1H stoppage must stay 上半场 ---
check('1H stoppage minute 46 no score-past', {
  matchId: 2042099, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '1', matchPhaseTcName: '当前赛季',
  sectionsNo999: '1:0', sectionsNo1: '1:0', matchMinute: 46,
}, { phase: '1H', phaseZh: '上半场', live: true });

check('1H stoppage minute 47 equal half', {
  matchId: 2042100, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '2', matchPhaseTcName: '季后赛',
  sectionsNo999: '0:0', sectionsNo1: '0:0', matchMinute: 47,
}, { phase: '1H', phaseZh: '上半场' });

check('explicit 上半场 + 46', {
  matchId: 3, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '', matchPhaseTcName: '上半场',
  sectionsNo999: '1:0', sectionsNo1: '1:0', matchMinute: 46, matchMinuteExtra: 1,
}, { phase: '1H', phaseZh: '上半场', minuteExtra: 1 });

check('2H stoppage minute 92 stays 下半场 not ET', {
  matchId: 4, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '3', matchPhaseTcName: '下半场',
  sectionsNo999: '2:1', sectionsNo1: '1:0', matchMinute: 92, matchMinuteExtra: 2,
}, { phase: '2H', phaseZh: '下半场' });

check('explicit ET name', {
  matchId: 5, matchStatus: '5', matchStatusName: '直播中',
  matchPhaseTc: '', matchPhaseTcName: '加时',
  sectionsNo999: '2:2', sectionsNo1: '1:1', matchMinute: 105,
}, { phase: 'ET', phaseZh: '加时' });

// formatClockMinute mapping
assert.strictEqual(formatClockMinute('1H', 45, null), "45'");
assert.strictEqual(formatClockMinute('1H', 46, null), "45+1'");
assert.strictEqual(formatClockMinute('上半场', 45, 2), "45+2'");
assert.strictEqual(formatClockMinute('2H', 90, 3), "90+3'");
assert.strictEqual(formatClockMinute('下半场', 92, null), "90+2'");
assert.strictEqual(formatClockMinute('2H', 67, null), "67'");
console.log('ok formatClockMinute mapping');

// AF fromAf keeps status short as phase (minute does not invent half)
const af1h = fromAf({
  fixture: { status: { short: '1H', elapsed: 46, extra: 1 } },
  goals: { home: 1, away: 0 },
});
assert.strictEqual(af1h.phase, '1H');
assert.strictEqual(af1h.phaseZh, '上半场');
assert.strictEqual(af1h.minute, 46);
assert.strictEqual(af1h.minuteExtra, 1);
console.log('ok AF 1H stoppage elapsed 46');

const af2h = fromAf({
  fixture: { status: { short: '2H', elapsed: 92, extra: 2 } },
  goals: { home: 2, away: 1 },
});
assert.strictEqual(af2h.phase, '2H');
assert.strictEqual(af2h.phaseZh, '下半场');
console.log('ok AF 2H stoppage stays 2H');

// inferClockPhase direct: minute≥46 alone → 1H not 2H
const clock46 = inferClockPhase({
  ph: '1', phn: '当前赛季', minute: 46,
  full: { home: 1, away: 0 }, half: { home: 1, away: 0 },
});
assert.strictEqual(clock46.phase, '1H');
assert.strictEqual(clock46.phaseZh, '上半场');
console.log('ok inferClockPhase 46 → 上半场');

console.log('all live-scores phase tests passed');

// --- 1.9.120: AF FT overlay over empty sporttery NS (sale lag) ---
const { mergeAfOverlay } = require('../lib/live-scores');
const nsEmpty = {
  id: '2042111', phase: 'NS', phaseZh: '未开赛', live: false, finished: false,
  homeScore: null, awayScore: null, full: '', half: '', source: 'sporttery',
};
const afFt = fromAf({
  fixture: { status: { short: 'FT', elapsed: 90, extra: null } },
  goals: { home: 3, away: 1 },
});
assert.strictEqual(afFt.finished, true);
assert.strictEqual(afFt.homeScore, 3);
const mergedFt = mergeAfOverlay(nsEmpty, afFt, '2042111', true);
assert.strictEqual(mergedFt.finished, true);
assert.strictEqual(mergedFt.live, false);
assert.strictEqual(mergedFt.homeScore, 3);
assert.strictEqual(mergedFt.awayScore, 1);
assert.strictEqual(mergedFt.full, '3:1');
console.log('ok 1.9.120 AF FT overlays empty sporttery NS');

// sporttery status 已完成 but invalid score text → not finished (needs AF); still parses status
const inv = fromSporttery({
  matchId: 2041868, matchStatus: '11', matchStatusName: '已完成',
  matchPhaseTc: '', matchPhaseTcName: '',
  sectionsNo999: '无效场次', sectionsNo1: '无效场次', matchMinute: '',
});
assert.strictEqual(inv.finished, false);
assert.strictEqual(inv.statusName, '已完成');
console.log('ok sporttery 已完成 + 无效场次 keeps finished=false without inventing score');
