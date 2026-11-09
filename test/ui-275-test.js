'use strict';
// 2.1.4: 赛程比分 / 计算器只按业务日（businessDate）归一天。
// 2.1.2 改成开球日之后，周日001–019 留在昨天、周日020–030 凌晨场被拆到今天。
// 2.1.1 把期次日和开球日做并集，周六023 会和周日023 穿插；这里仍是单谓词，不做并集。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const apkSh = fs.readFileSync(path.join(root, 'android/build-apk.sh'), 'utf8');
const ver = fs.readFileSync(path.join(root, 'VERSION.txt'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cfgJs = fs.readFileSync(path.join(root, 'public/config.js'), 'utf8');
const cfg = Function('return ' + cfgJs.replace(/^window\.APP_CONFIG=/, ''))();
const androidManifest = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8');

assert.ok(/VERSION=2.1.4/.test(ver));
assert.ok(/VERSION_CODE=331/.test(ver));
assert.ok(/jc-v2.1.4/.test(swJs));
assert.strictEqual(pkg.version, '2.1.4');
assert.strictEqual(cfg.version, '2.1.4');
assert.ok(/VERSION_NAME="\$\{VERSION_NAME:-2.1.4\}"/.test(apkSh));
assert.ok(/VERSION_CODE="\$\{VERSION_CODE:-331\}"/.test(apkSh));
assert.ok(/android:versionCode="331"/.test(androidManifest));
assert.ok(/android:versionName="2\.1\.4"/.test(androidManifest));

assert.ok(/function scheduleCanonicalDay/.test(appJs), 'one canonical schedule day');
assert.ok(!/if \(issueDate\(m\) === day\) return true/.test(appJs), 'day filter is not issueDate OR kickoff');
assert.ok(!/\.date/.test(extractFunction(appJs, 'scheduleCanonicalDay')), '归属日不读开球日历日');
assert.ok(/return issueDate\(m\)/.test(extractFunction(appJs, 'scheduleCanonicalDay')), '归属日就是业务日');
assert.ok(/scheduleCanonicalDay\(m\) === String\(day\)/.test(extractFunction(appJs, 'matchOnScheduleDay')), '一场只比对一个业务日');
assert.ok(/union\.map\(scheduleCanonicalDay\)/.test(appJs), 'date strip buckets by canonical day');
assert.ok(/mergeScheduleSources\(ms, rs\)/.test(appJs), 'schedule and results collapse to one row');
assert.ok(/rs\.filter\(r => issueDate\(r\) === S\.rsDate\)/.test(appJs), '开奖 still follows 期次日');
assert.ok(/issueDate\(x\.m\) \|\| x\.m\.date/.test(appJs), '预测分组仍按期次日');
assert.ok(/finRank\(a\._kind\) - finRank\(b\._kind\)/.test(appJs), 'finished matches still sink');
assert.ok(/matchNumSortKey\(a\.num\) - matchNumSortKey\(b\.num\)/.test(appJs), 'number sort kept inside one day');
assert.ok(/modeRows = classifiedDay\.filter\(x => matchTeamSearchHit/.test(appJs), 'search still composes after the day filter');

function extractFunction(src, name) {
  const key = 'function ' + name;
  const start = src.indexOf(key);
  assert.ok(start >= 0, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const ISSUE_WEEK = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
const S = {
  schLeague: '全部',
  ssrc: {
    meta: {
      gaps: {
        '2026-11-07': { missing: ['002'], have: 20, max: 25 },
        '2026-11-09': { missing: ['099'], have: 10, max: 99 },
      },
    },
  },
};
const api = new Function('ISSUE_WEEK', 'S', [
  extractFunction(appJs, 'issueDate'),
  extractFunction(appJs, 'scheduleCanonicalDay'),
  extractFunction(appJs, 'matchOnScheduleDay'),
  extractFunction(appJs, 'scheduleRowKey'),
  extractFunction(appJs, 'mergeScheduleSources'),
  extractFunction(appJs, 'scheduleGapInfoForRows'),
  extractFunction(appJs, 'matchNumSortKey'),
  extractFunction(appJs, 'matchNumSearchHit'),
  extractFunction(appJs, 'matchTeamSearchHit'),
  extractFunction(appJs, 'scheduleListRows'),
  'return { matchOnScheduleDay, scheduleCanonicalDay, mergeScheduleSources, scheduleGapInfoForRows, scheduleListRows, matchTeamSearchHit };',
].join('\n'))(ISSUE_WEEK, S);

// Prod-shaped rows from 2026-11-09. 周六023 kicks off Nov 8 (businessDate Nov 7);
// 周日023 kicks off Nov 9 (businessDate Nov 8). The 2.1.1 OR put both on Nov 8.
const schedule = [
  { id: 'n23', num: '周六023', league: '英超', home: '诺丁汉', away: '曼城', date: '2026-11-08', time: '01:30', businessDate: '2026-11-07', _kind: 'ft' },
  { id: 's24', num: '周六024', league: '德甲', home: '斯图加特', away: '不来梅', date: '2026-11-08', time: '01:30', businessDate: '2026-11-07', _kind: 'ft' },
  { id: 's25', num: '周六025', league: '西甲', home: '奥萨苏纳', away: '毕尔巴鄂', date: '2026-11-08', time: '01:30', businessDate: '2026-11-07', _kind: 'ft' },
  { id: 'i23', num: '周日023', league: '意甲', home: '国际米兰', away: '科莫', date: '2026-11-09', time: '01:00', businessDate: '2026-11-08', _kind: 'ft' },
  { id: 'v24', num: '周日024', league: '西甲', home: '比利亚雷', away: '赫塔费', date: '2026-11-09', time: '01:30', businessDate: '2026-11-08', _kind: 'ft' },
  { id: 'leman', num: '周日020', league: '法甲', home: '勒芒', away: '摩纳哥', date: '2026-11-09', time: '00:15', businessDate: '2026-11-08', status: 'Selling', _kind: 'ns' },
  { id: 'sun1', num: '周日001', league: '英超', home: '阿森纳', away: '切尔西', date: '2026-11-08', time: '22:00', businessDate: '2026-11-08', _kind: 'ns' },
  { id: 'sun1', num: '周日001', league: '英超', home: '阿森纳', away: '切尔西', date: '2026-11-08', time: '22:00', businessDate: '2026-11-08', _kind: 'ns' },
  { id: 'sat1', num: '周六001', league: '意甲', home: '尤文', away: '那不勒斯', date: '2026-11-07', time: '22:00', businessDate: '2026-11-07', _kind: 'ft' },
  { id: 'nodate', num: '周一001', league: '日职', home: '横滨水手', away: '鹿岛鹿角', businessDate: '2026-11-09', time: '18:00', _kind: 'ns' },
];
const results = [
  { id: 'n23', num: '周六023', league: '英超', home: '诺丁汉', away: '曼城', date: '2026-11-07', time: '01:30', businessDate: '2026-11-07', full: '3:1', half: '2:0' },
];

const leman = schedule.find(r => r.id === 'leman');
assert.strictEqual(api.scheduleCanonicalDay(leman), '2026-11-08');
assert.strictEqual(api.matchOnScheduleDay(leman, '2026-11-08'), true, '凌晨场留在周日业务日');
assert.strictEqual(api.matchOnScheduleDay(leman, '2026-11-09'), false, '开球在周一 00:15 也不拆到下一天');
assert.strictEqual(api.scheduleCanonicalDay(schedule.find(r => r.id === 'nodate')), '2026-11-09', '没有开球日时仍用业务日');
const derivedEarly = { id: 'd20', num: '周日020', date: '2026-11-09', time: '00:15', home: '勒芒', away: '摩纳哥' };
assert.strictEqual(api.scheduleCanonicalDay(derivedEarly), '2026-11-08', '缺 businessDate 时按周几回推期次日，不按开球日');
assert.strictEqual(api.matchOnScheduleDay(derivedEarly, '2026-11-09'), false);

const union = api.mergeScheduleSources(schedule, results);
const ids = union.map(r => r.id);
assert.strictEqual(new Set(ids).size, ids.length, 'same id collapses to one row');
const nottingham = union.find(r => r.id === 'n23');
assert.strictEqual(nottingham.full, '3:1', 'result score fills the schedule row');
assert.strictEqual(nottingham.date, '2026-11-08', 'kickoff date stays when the result copy disagrees');
assert.strictEqual(union.filter(r => r.id === 'sun1').length, 1);

function numsOn(day) {
  return union.filter(r => api.matchOnScheduleDay(r, day)).map(r => r.num);
}
assert.deepStrictEqual(numsOn('2026-11-07').sort(), ['周六001', '周六023', '周六024', '周六025'], '周六001–025 整批在周六业务日');
const yday = numsOn('2026-11-08');
assert.deepStrictEqual(yday.slice().sort(), ['周日001', '周日020', '周日023', '周日024'], '周日晚场和周一凌晨场留在同一业务日');
assert.ok(!yday.some(n => n.startsWith('周六')), '周日业务日不混入周六编号');
const today = numsOn('2026-11-09');
assert.deepStrictEqual(today, ['周一001'], '周一业务日只有周一编号');
assert.ok(!today.includes('周日020') && !today.includes('周日023') && !today.includes('周日024'));

const seen = new Map();
for (const day of ['2026-11-07', '2026-11-08', '2026-11-09']) {
  for (const row of union.filter(r => api.matchOnScheduleDay(r, day))) {
    assert.ok(!seen.has(row.id), row.num + ' landed on two strip days');
    seen.set(row.id, day);
  }
}
assert.strictEqual(seen.size, union.length);

function listFor(day, { league = '全部', q = '' } = {}) {
  S.schLeague = league;
  const rows = union
    .filter(r => api.matchOnScheduleDay(r, day))
    .filter(r => api.matchTeamSearchHit(r, q));
  return api.scheduleListRows(rows).map(r => r.num);
}
assert.deepStrictEqual(listFor('2026-11-08'), ['周日001', '周日020', '周日023', '周日024'], '未完场在上，同一业务日内按编号');
assert.deepStrictEqual(listFor('2026-11-07'), ['周六001', '周六023', '周六024', '周六025']);
assert.deepStrictEqual(listFor('2026-11-09'), ['周一001']);
assert.deepStrictEqual(listFor('2026-11-08', { league: '英超' }), ['周日001']);
assert.deepStrictEqual(listFor('2026-11-07', { league: '英超', q: '曼城' }), ['周六023']);
assert.deepStrictEqual(listFor('2026-11-08', { q: '曼城' }), [], '搜索不会把别的业务日捞回来');
assert.deepStrictEqual(listFor('2026-11-08', { league: '法甲' }), ['周日020'], '周日业务日仍能筛到凌晨的勒芒');

assert.strictEqual(seen.get('n23'), '2026-11-07');
assert.strictEqual(seen.get('i23'), '2026-11-08');
assert.notStrictEqual(seen.get('n23'), seen.get('i23'), '周六023 与周日023 不在同一天');
assert.strictEqual(seen.get('sun1'), seen.get('leman'), '周日001 与周日020 同属一个业务日');

S.schDate = '2026-11-08';
const ydayRows = union.filter(r => api.matchOnScheduleDay(r, '2026-11-08'));
assert.strictEqual(api.scheduleGapInfoForRows(ydayRows), null, '该业务日没有编号缺口记录');
S.schDate = '2026-11-07';
const day7 = union.filter(r => api.matchOnScheduleDay(r, '2026-11-07'));
assert.deepStrictEqual(api.scheduleGapInfoForRows(day7).missing, ['002']);
S.schDate = '2026-11-09';
assert.deepStrictEqual(
  union.filter(r => api.matchOnScheduleDay(r, '2026-11-09')).map(r => r.id),
  ['nodate'],
  '周一凌晨的周日场次不出现在周一业务日',
);
assert.deepStrictEqual(api.scheduleGapInfoForRows(union.filter(r => api.matchOnScheduleDay(r, '2026-11-09'))).missing, ['099']);

console.log('ui-275-test OK');
