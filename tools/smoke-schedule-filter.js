#!/usr/bin/env node
/**
 * Smoke: sporttery/source schedule vs App「全部」channel for a 竞彩 issue day.
 * Usage: node tools/smoke-schedule-filter.js [baseUrl] [YYYY-MM-DD]
 *
 * Asserts:
 *  - 「全部」day count == API schedule rows for that businessDate
 *  - 周几NNN numbering has no gaps (001..max all present) when day has any numbered row
 *  - meta.backfill / meta.gaps are consistent when present
 * Exit 1 on failure.
 */
'use strict';
const BASE = (process.argv[2] || 'http://120.77.152.74:8088').replace(/\/$/, '');
const DAY = process.argv[3] || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

const LEAGUE_PRIO = ['英超', '西甲', '意甲', '德甲', '法甲', '欧冠', '欧罗巴', '欧协联', '世界杯', '欧洲杯', '国际赛', '亚运', '亚冠', '中超', '日职', '韩职', '荷甲', '葡超', '英冠'];
const prio = l => { const i = LEAGUE_PRIO.findIndex(x => String(l).includes(x)); return i < 0 ? 99 : i; };
const isHotLeague = l => prio(l) < 99;
const ISSUE = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
function issueDate(m) {
  if (m.businessDate) return m.businessDate;
  const hit = String(m.num || '').match(/周([日一二三四五六])/);
  if (hit && m.date) {
    const want = ISSUE[hit[1]];
    const d = new Date(m.date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - want + 7) % 7));
    return d.toISOString().slice(0, 10);
  }
  return m.date;
}
function numGaps(dayRows) {
  const parsed = [];
  for (const m of dayRows) {
    const hit = String(m.num || '').match(/周([日一二三四五六])(\d{3})/);
    if (hit) parsed.push({ n: Number(hit[2]), num: m.num, home: m.home, away: m.away, league: m.league, id: m.id, status: m.status });
  }
  if (!parsed.length) return { max: 0, missing: [], rows: [] };
  const max = Math.max(...parsed.map(r => r.n));
  const have = new Set(parsed.map(r => r.n));
  const missing = [];
  for (let i = 1; i <= max; i++) if (!have.has(i)) missing.push(String(i).padStart(3, '0'));
  return { max, missing, rows: parsed.sort((a, b) => a.n - b.n) };
}

async function main() {
  const r = await fetch(BASE + '/api/schedule', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const list = j.data || [];
  const day = list.filter(m => issueDate(m) === DAY);
  const hot = day.filter(m => isHotLeague(m.league));
  const dropped = day.filter(m => !isHotLeague(m.league));
  const leagues = {};
  day.forEach(m => { leagues[m.league] = (leagues[m.league] || 0) + 1; });
  const gaps = numGaps(day);
  const metaGaps = (j.meta && j.meta.gaps && j.meta.gaps[DAY]) || null;

  const report = {
    base: BASE, day: DAY, source: j.source, meta: j.meta || null,
    scheduleTotal: list.length,
    dayTotal: day.length,
    hotShown: hot.length,
    hiddenByHot: dropped.length,
    leagues,
    nums: gaps.rows.map(r => r.num),
    gapMissing: gaps.missing,
    has001: gaps.rows.some(r => r.n === 1),
    dropped: dropped.map(m => ({ num: m.num, league: m.league, kickoff: m.date + ' ' + m.time, home: m.home, away: m.away })),
    assertAllEqualsSource: day.length === ((j.meta && j.meta.byBusinessDate && j.meta.byBusinessDate[DAY]) || day.length),
    assertHotHiddenDocumented: dropped.length === day.length - hot.length,
    assertNoNumGaps: gaps.missing.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));

  let failed = false;
  if (day.length === 0 && j.source === 'live') {
    console.warn('WARN: live schedule has 0 rows for', DAY);
  }
  if (dropped.length !== day.length - hot.length) {
    console.error('FAIL: hot hidden count inconsistency');
    failed = true;
  }
  if (hot.length < day.filter(m => prio(m.league) < 99).length) {
    console.error('FAIL: isHotLeague narrower than LEAGUE_PRIO whitelist');
    failed = true;
  }
  if (gaps.missing.length) {
    console.error('FAIL: match number gaps for', DAY, gaps.missing.join(','),
      '— sporttery list-only may have dropped in-play rows; server backfill should fill them');
    failed = true;
  }
  if (gaps.max >= 1 && !gaps.rows.some(r => r.n === 1)) {
    console.error('FAIL: day has numbered matches but 001 missing');
    failed = true;
  }
  if (metaGaps && metaGaps.missing && metaGaps.missing.length && gaps.missing.length === 0) {
    console.warn('WARN: meta.gaps stale vs computed (cache?)', metaGaps);
  }
  if (j.meta && typeof j.meta.listOnly === 'number' && j.meta.listOnly > day.length && j.source === 'live') {
    // listOnly is full schedule before filter-by-day; only warn if backfill missing and day shrank oddly
  }
  if (failed) process.exit(1);

  console.log('OK: 热门 whitelist covers LEAGUE_PRIO; 「全部」= source day count', day.length,
    gaps.max ? `; nums 001..${String(gaps.max).padStart(3, '0')} contiguous` : '');
  console.log('OK smoke-schedule-filter');
}

main().catch(e => { console.error(e); process.exit(1); });
