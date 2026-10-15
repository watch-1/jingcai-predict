// Verifies live-API parser against a real historical getMatchCalculatorV1 payload (from github.com/Johnserf-Seed/SportteryAPI sample.json, MIT)
const assert = require('assert');
const { normalizeMatches } = require('../server.js');
const l = normalizeMatches(require('./upstream-sample-2026-06-19.json'));
assert(l.length > 0 && l[0].num && l[0].home && l[0].had.h);
console.log('parser OK:', l.length, 'matches, e.g.', l[0].num, l[0].home, 'vs', l[0].away, l[0].had, l[0].hhad);
assert(l[0].homeLogo.endsWith('/523.png') && l[0].awayLogo.endsWith('/421.png'), 'crest URL from sporttery team id');
const api = require('../server.js');
assert.strictEqual(api.teamLogo('//static.sporttery.cn/res_1_0/jcw/upload/teamlogo/teamdef_zq.png', '523'), 'https://static.sporttery.cn/res_1_0/jcw/upload/mnjc/zq/523.png');
assert(api.teamLogo('', '581').startsWith('https://r2.thesportsdb.com/images/media/team/badge/'), 'Santos uses verified crest');
assert.strictEqual(api.safeLogoTarget('https://evil.example/a.png'), null);
assert.strictEqual(api.safeLogoTarget('https://r2.thesportsdb.com/images/media/team/fanart/x.png'), null);
assert(api.safeLogoTarget('https://r2.thesportsdb.com/images/media/team/badge/j8xk9g1679447486.png'));

// Results parser against a real getUniformMatchResultV1 payload (2026-09-27..30), incl. in-progress + 无效场次 rows
const { normalizeResults } = require('../server.js');
const r = normalizeResults(require('./upstream-results-2026-09-30.json'));
assert(r.length > 0 && r.every(x => x.full && x.num && x.home && x.away));
const x = r.find(y => /^\d+:\d+$/.test(y.full) && y.half && y.had && y.goalLine);
assert(x, 'has a scored result with half-time, odds and goal line');
const [hg, ag] = x.full.split(':').map(Number); const hr = hg > ag ? 'H' : hg === ag ? 'D' : 'A';
assert.strictEqual(hr, x.winFlag, '胜平负 derived from score matches official winFlag');
const rq = hg + Number(x.goalLine) - ag; console.log('results OK:', r.length, 'finished, e.g.', x.date, x.num, x.league, x.home, x.full, x.away, '半场', x.half, '胜平负', hr, '@', x.had[hr.toLowerCase()], `让球(${x.goalLine})`, rq > 0 ? '让胜' : rq === 0 ? '让平' : '让负');
assert(r.every(y => !/^\d+:\d+$/.test(y.full) || (([a, b]) => (a > b ? 'H' : a === b ? 'D' : 'A'))(y.full.split(':').map(Number)) === y.winFlag), 'all winFlags consistent');

const { issueDateFromNum } = require('../server.js');
assert.strictEqual(issueDateFromNum('2026-10-08', '周三006'), '2026-10-07', '周三 issue is the day before a Thursday kickoff');
assert.strictEqual(issueDateFromNum('2026-10-06', '周二001'), '2026-10-06', 'same-calendar-day issue stays put');
assert.strictEqual(issueDateFromNum('2026-10-06', '周一007'), '2026-10-05', '周一 early-morning kickoff stays on Monday issue');
assert.strictEqual(issueDateFromNum('2026-10-09', '周四002'), '2026-10-08', '周四 after midnight stays on Thursday issue');
const wed = normalizeResults({ value: { matchResult: [{ matchId: 1, matchNumStr: '周三001', matchDate: '2026-10-08', leagueNameAbbr: '芬超', homeTeam: '赫尔火花', awayTeam: '国际图尔', sectionsNo1: '0:0', sectionsNo999: '0:0', matchResultStatus: '2', winFlag: 'D', h: '2.1', d: '3.2', a: '3.0', goalLine: '' }] } });
assert.strictEqual(wed[0].businessDate, '2026-10-07');
assert.strictEqual(wed[0].num, '周三001');
assert.strictEqual(wed[0].date, '2026-10-08');
console.log('issue date OK');
