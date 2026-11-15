'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const radar = require('../lib/match-radar');

const AS_OF_MC = '2026-09-16'; // Man City research window end 2026-09-15
const AS_OF_TB = '2026-11-13';

function approx(a, b, tol) {
  const d = Math.abs(a - b);
  assert(d <= tol, `expected ${b}, got ${a}, delta ${d} > ${tol}`);
}

// --- Man City research snapshot (numbers.json) ---
{
  const haaland = radar.scorePlayerBySmId(154421, AS_OF_MC);
  assert(haaland.ok, 'Haaland should be scorable: ' + JSON.stringify(haaland.reason || haaland));
  const d = haaland.scored.details;
  const by = Object.fromEntries(d.map((x) => [x.name, x]));
  console.log('Haaland pool', haaland.scored.poolLabel, 'min', haaland.agg.minutes, 'apps', haaland.agg.apps);
  for (const x of d) {
    console.log(' ', x.name, x.score && x.score.toFixed(2), x.parts.map((p) => `${p.label}=${p.value && p.value.toFixed(3)} p=${p.percentile && p.percentile.toFixed(1)}`).join(' | '));
  }
  assert.strictEqual(haaland.agg.minutes, 3045);
  assert.strictEqual(haaland.scored.poolKey, 'CF');
  assert(haaland.scored.poolN >= 40, "CF pool " + haaland.scored.poolN);
  approx(by['进攻终结'].score, 97.87234042553192, 2);
  approx(by['机会转化'].score, 83.72093023255815, 3);
  approx(by['身体支点'].score, 100, 0.2);
  approx(by['机会创造'].score, 64.53900709219859, 3);
  approx(by['持球参与'].score, 4.25531914893617, 3);
  approx(by['回追压迫'].score, 18.085106382978722, 3);
  console.log('Haaland matches research numbers.');
}

{
  const silva = radar.scorePlayerBySmId(96353, AS_OF_MC);
  assert(silva.ok, 'Silva');
  const by = Object.fromEntries(silva.scored.details.map((x) => [x.name, x]));
  console.log('Silva pool', silva.scored.poolLabel, silva.scored.fallbackNote, 'n', silva.scored.poolN);
  assert.strictEqual(silva.scored.poolKey, 'MID'); // AM thin → all midfielders
  assert(silva.scored.poolN >= 140, "MID pool " + silva.scored.poolN);
  approx(by['控球参与'].score, 96.07843137254903, 3);
  approx(by['传球推进'].score, 80.91306698117843, 4);
  console.log('Silva midfield fallback + scores OK.');
}

{
  const doku = radar.scorePlayerBySmId(23697990, AS_OF_TB);
  console.log('Doku ok', doku.ok, doku.scored && doku.scored.poolLabel, doku.scored && doku.scored.plan && doku.scored.plan.wingerOverride, 'min', doku.agg && doku.agg.minutes);
  assert(doku.ok, 'Doku should be scorable in PL: ' + (doku.noteZh || doku.reason));
  assert.strictEqual(doku.scored.plan.wingerOverride, '暂按前锋对照');
  assert(doku.scored.poolLabel.includes('前锋'));
  assert(doku.scored.poolLabel.includes('英超'));
  assert(doku.scored.complete !== false);
  assert(doku.scored.details.every((d) => d.score != null));
}

{
  const guler = radar.scorePlayerBySmId(37547467, AS_OF_TB);
  console.log('Güler ok', guler.ok, guler.scored && guler.scored.poolLabel, guler.scored && guler.scored.fallbackNote, 'min', guler.agg && guler.agg.minutes, 'n', guler.scored && guler.scored.poolN);
  assert(guler.ok, 'Güler should be scorable in La Liga: ' + (guler.noteZh || guler.reason));
  assert(guler.agg.league === '西甲');
  assert(guler.agg.minutes >= 600);
  assert(guler.scored.poolLabel.includes('西甲'));
  assert(guler.scored.details.every((d) => d.score != null));
}


{
  const short = radar.captionShort('意甲', { roleZh: '中场' }, 'MID', 170);
  assert.strictEqual(short, '意甲中场≥450′ · 对照170');
  assert(!short.includes('分钟'));
  assert(!/\n/.test(short));
  const long = radar.captionFor('意甲', { roleZh: '中场', wingerOverride: '暂按前锋对照' }, 'ATT', 80, '');
  assert(!long.includes('暂按前锋对照'), 'captionFor must not duplicate the winger badge');
  assert(long.includes('意甲前锋'));
  assert.strictEqual(radar.shortPlayerName('斯科特·姆克托米内', 'Scott McTominay'), '姆克托米内');
  assert.strictEqual(radar.shortPlayerName('埃尔吉夫·埃尔马斯', 'Eljif Elmas'), '埃尔马斯');
  console.log('captionShort + shortPlayerName OK:', short);
}

// --- 347: relaxed 270-min gate for smaller club leagues only ---
{
  assert.strictEqual(radar.MIN_MIN, 450);
  assert.strictEqual(radar.RELAX_MIN, 270);
  assert.strictEqual(radar.poolFloorFor('英超', 'MID'), 20);
  assert.strictEqual(radar.poolFloorFor('英超', 'GK'), 15);
  assert.strictEqual(radar.poolFloorFor('芬超', 'MID'), 8);
  assert.strictEqual(radar.poolFloorFor('挪超', 'GK'), 6);
  assert(radar.isMainLeague('西甲') && radar.isMainLeague('英超') && radar.isMainLeague('意甲'));
  assert(radar.isMainLeague('德甲') && radar.isMainLeague('法甲') && radar.isMainLeague('英冠'));
  assert(radar.isMainLeague('荷甲') && radar.isMainLeague('葡超') && radar.isMainLeague('德乙'));
  assert(radar.isMainLeague('法乙') && radar.isMainLeague('美职') && radar.isMainLeague('日职'));
  assert(radar.isMainLeague('韩职') && radar.isMainLeague('巴甲'));
  assert(radar.isMainLeague('Premier League') && radar.isMainLeague('La Liga'));
  assert(radar.isMainLeague('Serie A') && radar.isMainLeague('Major League Soccer'));
  assert(radar.isMainLeague('Championship') && radar.isMainLeague('Brasileirão'));
  assert(radar.isMainLeague('Serie A Brazil') && radar.canonLeague('Serie A Brazil') === '巴甲');
  assert(!radar.isMainLeague('瑞超'), 'Super League is not auto-mapped; 瑞超 is relaxed');
  assert(!radar.isMainLeague('Super League'), '"Super League" is not automatically 瑞超 or a main league');
  assert(!radar.isMainLeague('芬超') && !radar.isMainLeague('挪超') && !radar.isMainLeague('沙职'));
  assert(!radar.isMainLeague('英甲') && !radar.isMainLeague('荷乙') && !radar.isMainLeague('日乙') && !radar.isMainLeague('澳超'));
  assert.strictEqual(radar.minMinutesForLeague('英超'), 450);
  assert.strictEqual(radar.minMinutesForLeague('芬超'), 270);
  assert.strictEqual(radar.captionShort('意甲', { roleZh: '中场' }, 'MID', 170), '意甲中场≥450′ · 对照170');
  const relaxShort = radar.captionShort('芬超', { roleZh: '中场' }, 'MID', 51);
  assert.strictEqual(relaxShort, '芬超中场≥270′ · 对照51');
  assert(!relaxShort.includes('450'), 'relaxed captions must not claim ≥450');
  const relaxLong = radar.captionFor('挪超', { roleZh: '前锋', wingerOverride: '暂按前锋对照' }, 'ATT', 66, '');
  assert(relaxLong.includes('≥270'));
  assert(!relaxLong.includes('450'));
  assert(!relaxLong.includes('暂按前锋对照'), 'winger badge still not duplicated in caption');
  assert.strictEqual(radar.belowMinutesNote('意甲'), '窗口内俱乐部联赛不足 450 分钟');
  assert.strictEqual(radar.belowMinutesNote('芬超'), '窗口内俱乐部联赛不足 270 分钟');
  console.log('league gate helpers OK');
}

{
  // Main-league players under 450 stay not drawable (佩西温 / 格赫拉西门科夫 examples).
  const perciun = radar.scorePlayerBySmId(37730058, AS_OF_TB); // Sergiu Perciun, 意甲 133′
  assert(!perciun.ok, 'Serie A 133 minutes must not become drawable');
  assert((perciun.noteZh || '').includes('450'), perciun.noteZh);
  assert.strictEqual(perciun.agg && perciun.agg.minutes, 133);
  const ghera = radar.scorePlayerBySmId(37643581, AS_OF_TB); // Mihail Gherasimencov, 美职 179′
  assert(!ghera.ok, 'MLS 179 minutes must not become drawable');
  assert((ghera.noteZh || '').includes('450'), ghera.noteZh);
  assert.strictEqual(ghera.agg && ghera.agg.minutes, 179);
  const benteke = radar.scorePlayerBySmId(853, AS_OF_TB); // MLS 285, still main-league 450
  assert(!benteke.ok, 'MLS 285 minutes still below 450');
  assert((benteke.noteZh || '').includes('450'));
  console.log('main-league <450 still blocked: Perciun, Gherasimencov, Benteke');
}

{
  // Small-league 270–449 with a complete hex IS drawable and flagged.
  const sheehan = radar.scorePlayerBySmId(902, AS_OF_TB); // Josh Sheehan, 英甲 360′ / 4 场
  assert(sheehan.ok, '英甲 360 minutes should draw: ' + (sheehan.noteZh || sheehan.reason));
  assert.strictEqual(sheehan.agg.league, '英甲');
  assert(sheehan.agg.minutes >= 270 && sheehan.agg.minutes < 450);
  assert(sheehan.scored.lowValue, 'must flag low-value minutes');
  assert.strictEqual(sheehan.scored.lowValueChip, '参考价值偏低');
  assert(sheehan.scored.lowValueNote.includes('参考价值偏低'));
  assert(sheehan.scored.lowValueNote.includes(String(sheehan.agg.apps) + ' 场'));
  assert(sheehan.scored.lowValueNote.includes(String(Math.round(sheehan.agg.minutes)) + ' 分钟'));
  assert(sheehan.scored.details.every((d) => d.score != null), 'hex complete');
  assert(sheehan.scored.poolLabel.includes('≥270'));
  assert(!sheehan.scored.poolLabel.includes('450'), sheehan.scored.poolLabel);
  const short = radar.captionShort(sheehan.agg.league, sheehan.scored.plan, sheehan.scored.poolKey, sheehan.scored.poolN);
  assert(short.includes('≥270′'));
  assert(!short.includes('450'));
  // Pool uses ≥270, so it is larger than a 450-only pool would be, and above the relaxed floor.
  assert(sheehan.scored.poolN >= radar.RELAX_POOL_FLOOR, 'relaxed pool floor 8, got ' + sheehan.scored.poolN);
  console.log('relaxed drawable', sheehan.agg.name, sheehan.agg.minutes, 'apps', sheehan.agg.apps, sheehan.scored.lowValueNote, 'pool', sheehan.scored.poolN);
}

{
  // Below 270 in a relaxed league is not drawable; reason says 270 not 450.
  const hellemaa = radar.scorePlayerBySmId(37571366, AS_OF_TB); // 芬超 239′
  assert(!hellemaa.ok, '芬超 239 must not draw');
  assert((hellemaa.noteZh || '').includes('270'), hellemaa.noteZh);
  assert(!(hellemaa.noteZh || '').includes('450'), hellemaa.noteZh);
  assert.strictEqual(hellemaa.agg && hellemaa.agg.minutes, 239);
  console.log('relaxed below 270 blocked:', hellemaa.noteZh);
}

{
  // Incomplete hex is still refused even in a relaxed league (Parfitt 芬超 377).
  const parfitt = radar.scorePlayerBySmId(4511, AS_OF_TB);
  assert(!parfitt.ok);
  assert.strictEqual(parfitt.scored && parfitt.scored.reason, 'incomplete');
  console.log('relaxed incomplete still refused');
}

(async () => {
  const squad = JSON.parse(fs.readFileSync('/tmp/sv-2042692-refresh2.json', 'utf8'));
  const m = {
    id: '2042692',
    date: '2026-11-13',
    time: '01:00',
    league: '欧国联',
    home: '土耳其',
    away: '比利时',
    homeTeamId: '404',
    awayTeamId: '363',
  };
  const out = await radar.forMatch(m, { squad, asOf: AS_OF_TB });
  const dest = path.join(__dirname, '..', 'data', 'radar', 'sample-2042692.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log('wrote', dest, 'ok', out.ok);
  console.log('team', out.team && out.team.ok, out.team && out.team.noteZh);
  console.log('players', (out.players || []).map((p) => `${p.side} ${p.nameZh} ${p.poolLabel} scores=${(p.scores||[]).map((s)=>Math.round(s)).join(',')}`));
  console.log('coverage', JSON.stringify(out.coverage, null, 2));
  assert(out.ok);
  assert.strictEqual(out.team.kind, 'best-xi', 'NT team radar is theoretical best XI, not competition pool');
  assert.strictEqual(out.team.ok, true, 'Turkey/Belgium should have a best-XI radar: ' + (out.team && out.team.noteZh));
  assert(out.team.home && out.team.home.nWithStats >= 11, 'Turkey XI with stats');
  assert(out.team.away && out.team.away.nWithStats >= 11, 'Belgium XI with stats');
  assert.strictEqual((out.team.home.xi || []).length, 11);
  assert.strictEqual((out.team.away.xi || []).length, 11);
  assert.strictEqual(out.team.home.xi.filter((p) => p.line === 'GK').length, 1);
  assert.strictEqual(out.team.home.xi.filter((p) => p.line === 'DEF').length, 4);
  assert.strictEqual(out.team.home.xi.filter((p) => p.line === 'MID').length, 3);
  assert.strictEqual(out.team.home.xi.filter((p) => p.line === 'ATT').length, 3);
  assert(out.team.home.scores.length === 6 && out.team.home.scores.every((x) => x != null));
  assert(out.team.away.scores.length === 6 && out.team.away.scores.every((x) => x != null));
  // Two-side relative: each part is 100 for the side with the better raw
  // value. An axis with several parts can average below 100 when the two
  // sides split those parts. Scores stay in [0, 100].
  for (let i = 0; i < 6; i++) {
    const h = out.team.home.scores[i], a = out.team.away.scores[i];
    assert(h != null && a != null && h >= 0 && h <= 100.01 && a >= 0 && a <= 100.01, 'axis ' + i + ' in 0-100: ' + h + '/' + a);
  }
  const dimsH = out.team.home.dims;
  assert(dimsH.every((d) => d.contributor && d.contributor.short), 'each axis has a home contributor');
  assert(out.team.away.dims.every((d) => d.contributor && d.contributor.short), 'each axis has an away contributor');
  const namesH = dimsH.map((d) => d.contributor.short).join(',');
  assert(namesH.length > 0);
  console.log('best-XI contributors home', dimsH.map((d) => d.name + ':' + d.contributor.short).join(' | '));
  console.log('best-XI contributors away', out.team.away.dims.map((d) => d.name + ':' + d.contributor.short).join(' | '));
  const names = out.players.map((p) => p.nameZh);
  assert(names.includes('阿尔达·居莱尔') || names.includes('Arda Güler') || out.players.some((p) => p.smId === 37547467), 'Güler should be picked: ' + names);
  assert(out.players.some((p) => p.smId === 23697990), 'Doku should be picked: ' + names);
  const dokuP = out.players.find((p) => p.smId === 23697990);
  assert(dokuP.wingerOverride === '暂按前锋对照');
  assert(!dokuP.poolLabel.includes('暂按前锋对照'), 'poolLabel must not also carry the winger badge text');
  assert(dokuP.poolLabelShort && !dokuP.poolLabelShort.includes('\n') && !dokuP.poolLabelShort.includes('分钟'));
  assert(dokuP.poolLabelShort.includes('英超前锋'));
  assert(dokuP.poolLabelShort.includes('对照'));
  assert(!dokuP.poolLabelShort.includes('暂按前锋对照'));
  const gulerP = out.players.find((p) => p.smId === 37547467);
  assert(gulerP.poolLabel.includes('西甲'));
  assert(gulerP.minutes >= 600);
  assert(Array.isArray(gulerP.poolScores) && gulerP.poolScores.length === 6, 'poolScores should be a 6-axis average polygon');
  assert(gulerP.poolScores.every((s) => s != null && Number.isFinite(s)));
  assert(out.drawable && out.drawable.home.length >= 3 && out.drawable.away.length >= 3, 'drawable lists');
  assert(out.drawable.home.some((p) => p.smId === 37547467));
  assert(out.drawable.away.some((p) => p.smId === 23697990));
  console.log('2042692 payload OK. drawable', out.drawable.home.length, out.drawable.away.length, 'Güler poolScores', gulerP.poolScores.map((s) => Math.round(s)).join(','));
  console.log('ALL TESTS PASSED (2042692)');

  const svPath = '/tmp/sv-2042729.json';
  if (fs.existsSync(svPath)) {
    const squad2 = JSON.parse(fs.readFileSync(svPath, 'utf8'));
    const m2 = {
      id: '2042729', date: '2026-11-14', time: '03:00', league: '欧国联',
      home: '苏格兰', away: '北马其顿',
    };
    const out2 = await radar.forMatch(m2, { squad: squad2, asOf: AS_OF_TB });
    assert(out2.ok);
    assert.strictEqual(out2.team.kind, 'best-xi');
    assert(out2.team.ok, 'Scotland/NM best-XI should draw: ' + (out2.team && out2.team.noteZh));
    assert(out2.team.home.nWithStats >= 11, 'Scotland should fill 11 with stats, got ' + out2.team.home.nWithStats);
    assert(out2.team.away.nWithStats >= 3, 'NM has at least 3 with stats, got ' + out2.team.away.nWithStats);
    assert(out2.team.noteZh.includes('北马其顿') && (out2.team.noteZh.includes('不足') || out2.team.poolLabel.includes('3 人')), 'honest about incomplete NM XI');
    const mc = out2.players.find((p) => p.smId === 455376 || /姆克托|McTominay|麥湯明尼/i.test((p.nameZh || '') + (p.name || '')));
    assert(mc, 'McTominay should be among preview players');
    assert(mc.poolLabelShort === '意甲中场≥450′ · 对照170' || (mc.poolLabelShort && mc.poolLabelShort.includes('意甲中场') && mc.poolLabelShort.includes('对照') && !mc.poolLabelShort.includes('分钟')), mc.poolLabelShort);
    assert(mc.poolLabelShort.length < 22, 'short meta should be compact: ' + mc.poolLabelShort + ' len=' + mc.poolLabelShort.length);
    assert(out2.team.home.dims.every((d) => d.contributor && d.contributor.short));
    assert(out2.team.away.dims.every((d) => d.contributor && d.contributor.short));
    const elmas = out2.team.away.xi.find((p) => /埃尔马斯|Elmas/i.test((p.nameZh || '') + (p.name || '')))
      || out2.team.away.dims.some((d) => d.contributor && /埃尔马斯|Elmas/i.test(d.contributor.nameZh + d.contributor.short));
    assert(elmas, 'Elmas should be in NM XI or a contributor');
    console.log('2042729 best-XI OK', out2.team.poolLabel);
    console.log('  home contrib', out2.team.home.dims.map((d) => d.name + ':' + d.contributor.short).join(' | '));
    console.log('  away contrib', out2.team.away.dims.map((d) => d.name + ':' + d.contributor.short).join(' | '));
  } else {
    console.log('skip 2042729 (no squad file)');
  }
  console.log('ALL TESTS PASSED');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
