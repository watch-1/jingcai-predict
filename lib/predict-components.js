/**
 * Soft predict components (2.0.5).
 * Each card can move 胜平负软分, 信心, or 期望进球. Poisson stays the base model;
 * these are capped nudges plus an explainable chain.
 * Corridor input is the same object heat-pitch draws (buildCorridorMatchup).
 * 球权走廊 is possession share, not a goal-lane map.
 */
'use strict';

const PICK = { h: '主胜', d: '平局', a: '客胜' };

function r2(n) {
  return Math.round(Number(n) * 100) / 100;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function avgOf(side, key) {
  const a = side && side.averages;
  if (!a || a[key] == null) return null;
  return num(a[key]);
}

function card(partial) {
  const c = {
    wave: 1,
    evidence: '无',
    markets: [],
    fired: false,
    effect: '不改权重',
    chain: [],
    scoreDelta: 0,
    confDelta: 0,
    lambdaHome: 0,
    lambdaAway: 0,
    ouNote: '',
    hcapNote: '',
    wdlNote: '',
    risk: '',
    ...partial,
  };
  c.effect = effectText(c);
  return c;
}

function effectText(c) {
  if (!c || !c.fired) return '不改权重';
  const bits = [];
  if (c.scoreDelta) bits.push(`胜平负软分 ${c.scoreDelta > 0 ? '+' : ''}${r2(c.scoreDelta).toFixed(2)}（正数偏主）`);
  if (c.confDelta) bits.push(`信心 ${c.confDelta > 0 ? '+' : ''}${r2(c.confDelta * 100).toFixed(1)} 个百分点`);
  if (c.lambdaHome || c.lambdaAway) {
    const h = r2(c.lambdaHome || 0);
    const a = r2(c.lambdaAway || 0);
    bits.push(`期望进球 主 ${h > 0 ? '+' : ''}${h.toFixed(2)} / 客 ${a > 0 ? '+' : ''}${a.toFixed(2)}`);
  }
  return bits.join('；') || '只补充说明';
}

function formLeanOf(form) {
  if (!(form && form.hasData && !form.sparse && form.facts && form.facts.home && form.facts.away)) return null;
  const hs = form.facts.home.summary;
  const as = form.facts.away.summary;
  if (!hs || !as) return null;
  const hp = hs.w * 3 + hs.d;
  const ap = as.w * 3 + as.d;
  if (hp - ap >= 4) return 'h';
  if (ap - hp >= 4) return 'a';
  return 'd';
}

function restDays(v) {
  const n = num(v);
  if (n == null || n < 0 || n > 14) return null;
  return n;
}

function motivOf(tags, side) {
  const t = (tags || []).find(x => x && x.kind === 'motiv' && x.side === side);
  if (!t) return null;
  const text = String(t.text || '');
  if (/争冠/.test(text)) return { tag: '争冠', pressure: 1 };
  if (/保级/.test(text)) return { tag: '保级', pressure: 1 };
  if (/欧战/.test(text)) return { tag: '欧战资格', pressure: 0.6 };
  if (/无欲/.test(text)) return { tag: '无欲无求', pressure: -1 };
  return null;
}

function sideFromScore(delta) {
  if (delta > 0.04) return 'h';
  if (delta < -0.04) return 'a';
  return null;
}

function argmaxPick(p, gapMin) {
  if (!p || p.h == null || p.d == null || p.a == null) return null;
  const keys = ['h', 'd', 'a'];
  let best = 'h';
  for (const k of keys) if (Number(p[k]) > Number(p[best])) best = k;
  const sorted = keys.map(k => Number(p[k])).sort((a, b) => b - a);
  if (sorted[0] - sorted[1] < (gapMin == null ? 0.03 : gapMin)) return null;
  return best;
}

function laneFromText(s) {
  const n = String(s || '').toLowerCase();
  if (!n) return null;
  if (/left|左边|左路|左前|左后|左翼|左边锋|左后卫/.test(n)) return 'left';
  if (/right|右边|右路|右前|右后|右翼|右边锋|右后卫/.test(n)) return 'right';
  if (/centre|center|中锋|中卫|中路|中前卫|中场/.test(n)) return 'central';
  return null;
}

function goalMass(profile) {
  const segs = profile && profile.segments;
  if (!segs) return { n: 0, early: 0, late: 0, all: 0 };
  const early = (Number(segs['0-15']) || 0) + (Number(segs['16-30']) || 0);
  const late = (Number(segs['76-90']) || 0) + (Number(segs.et) || 0);
  const all = Object.values(segs).reduce((s, v) => s + (Number(v) || 0), 0);
  return { n: Number(profile.n_fixtures) || 0, early, late, all };
}

function emptyPack(reason) {
  return {
    components: [],
    deferred: deferredList(),
    scoreDelta: 0,
    confDelta: 0,
    lambda: { home: 0, away: 0 },
    notes: { ou: '', hcap: '', wdl: '' },
    risks: [],
    error: reason || '',
  };
}

function deferredList() {
  return [
    { id: 'setpiece', name: '定位球', reason: '没有稳定的定位球进球或战术样本。' },
    { id: 'subs', name: '换人窗口', reason: '没有赛前换人时间窗。' },
    { id: 'aerial', name: '高空与传中', reason: '传中和争顶没有成对样本，先不进权重。' },
    { id: 'weather', name: '天气', reason: '没有天气数据源。' },
  ];
}

function processSide(process, which) {
  return process && process.facts && process.facts[which];
}

function corridorCard(corridor) {
  const base = {
    id: 'corridor',
    name: '进攻走廊对防守走廊',
    markets: ['胜平负', '大小球', '让球'],
  };
  if (!corridor || !corridor.available) {
    return card({
      ...base,
      evidence: '无',
      chain: ['近况球权样本不够，走廊对位空着。', '这是球权走廊，不是进球落点。没有射门坐标，也不编造进球百分比。'],
    });
  }
  const homeM = corridor.mismatch_home_favors;
  const awayM = corridor.mismatch_away_favors;
  const wH = num(corridor.heuristic && corridor.heuristic.home_lane_threat_weight) || 1;
  const wA = num(corridor.heuristic && corridor.heuristic.away_lane_threat_weight) || 1;
  const chain = [
    '读的是球场图同一份走廊对位：进攻侧重对上对方防守空隙。',
    '球权走廊只表示近况控球落在左/中/右，不是进球走廊，没有射门或进球坐标。',
  ];
  let scoreDelta = 0;
  let lambdaHome = 0;
  let lambdaAway = 0;
  let ouNote = '';
  let hcapNote = '';
  let wdlNote = '';
  if (homeM && !awayM) {
    scoreDelta = r2(0.22 * wH);
    lambdaHome = r2(0.05 * wH);
    const lane = homeM.lane_zh || '这一路';
    chain.push(`主队主要球权在${lane}，客队这一侧防守占比更低，软分偏主。`);
    if (wH < 1) chain.push('主队核心缺阵，这条走廊的加成已按启发式打折。');
    ouNote = `主队常走${lane}，客队这一侧更松，主队进球期望略抬。不是进球落点。`;
    hcapNote = ouNote;
    wdlNote = `主队常走${lane}，客队这一侧更松。`;
  } else if (awayM && !homeM) {
    scoreDelta = r2(-0.22 * wA);
    lambdaAway = r2(0.05 * wA);
    const lane = awayM.lane_zh || '这一路';
    chain.push(`客队主要球权在${lane}，主队这一侧防守占比更低，软分偏客。`);
    if (wA < 1) chain.push('客队核心缺阵，这条走廊的加成已按启发式打折。');
    ouNote = `客队常走${lane}，主队这一侧更松，客队进球期望略抬。不是进球落点。`;
    hcapNote = ouNote;
    wdlNote = `客队常走${lane}，主队这一侧更松。`;
  } else if (homeM && awayM) {
    scoreDelta = r2(0.08 * wH - 0.08 * wA);
    lambdaHome = r2(0.03 * wH);
    lambdaAway = r2(0.03 * wA);
    chain.push('两边都有一条更好打的球权走廊，胜平负只留差额，大小球两边都略抬。');
    ouNote = '两边常走的路都对上对方更松的一侧，总进球略抬。不是进球落点。';
    hcapNote = '两边都有更好打的一侧，让球只跟着差额，不单独翻盘。';
  } else {
    const ov = num(corridor.overlap_home_atk_vs_away_def);
    chain.push(ov != null
      ? `没有「更好打」的错位。主队进攻和客队防守的重合大约 ${Math.round(ov * 100)}%，只作说明。`
      : '没有「更好打」的错位，软分不动。');
    return card({ ...base, evidence: '弱', fired: false, chain });
  }
  const evidence = (homeM || awayM) && (wH < 1 || wA < 1) ? '中' : '中';
  return card({
    ...base,
    evidence,
    fired: true,
    chain,
    scoreDelta,
    lambdaHome,
    lambdaAway,
    ouNote,
    hcapNote,
    wdlNote,
    say: homeM && wH < 1
      ? `主队${(homeM.lane_zh || '这一路')}关键人缺阵，这条优势已打折`
      : awayM && !homeM && wA < 1
        ? `客队${(awayM.lane_zh || '这一路')}关键人缺阵，这条优势已打折`
        : homeM && !awayM
          ? `主队常走${homeM.lane_zh || '这一路'}，客队这一侧更松`
          : awayM && !homeM
            ? `客队常走${awayM.lane_zh || '这一路'}，主队这一侧更松`
            : '两边都有更好打的一侧，总进球略抬',
    viz: {
      kind: 'lanes',
      homeAtk: corridor.home_attack_lane_zh || '',
      awayThin: corridor.away_defend_thin_lane_zh || '',
      awayAtk: corridor.away_attack_lane_zh || '',
      homeThin: corridor.home_defend_thin_lane_zh || '',
      homeOn: !!homeM,
      awayOn: !!awayM,
    },
  });
}

function sterileCard(process, heat) {
  const base = {
    id: 'sterile',
    name: '无效控球',
    markets: ['胜平负'],
  };
  const home = processSide(process, 'home');
  const away = processSide(process, 'away');
  const hp = avgOf(home, 'possession');
  const ap = avgOf(away, 'possession');
  const hs = avgOf(home, 'shots');
  const as = avgOf(away, 'shots');
  const hx = avgOf(home, 'expectedGoals');
  const ax = avgOf(away, 'expectedGoals');
  if (hp == null || ap == null || (hs == null && hx == null) || (as == null && ax == null)) {
    return card({
      ...base,
      chain: ['控球和射门（或预期进球）没有成对样本，不判断无效控球，也不把控球当胜率。'],
    });
  }
  const chain = ['先看控球，再看射门和预期进球。控球高但终结没跟上，就先把控球从模型里打折。'];
  const judge = (poss, oppPoss, shots, oppShots, xg, oppXg, side) => {
    if (poss - oppPoss < 8) return null;
    const shotsLag = shots != null && oppShots != null && shots <= oppShots + 0.4;
    const xgLag = xg != null && oppXg != null && xg <= oppXg + 0.05;
    if (!(shotsLag || xgLag)) return null;
    const central = heat && heat[side === 'h' ? 'homeAttack' : 'awayAttack'];
    const mid = central && central.lcr ? num(central.lcr.central) : null;
    return { side, mid, shotsLag, xgLag };
  };
  const hit = judge(hp, ap, hs, as, hx, ax, 'h') || judge(ap, hp, as, hs, ax, hx, 'a');
  if (!hit) {
    chain.push(`控球主 ${hp}% / 客 ${ap}%，射门或预期进球没有明显掉队，控球维持原样。`);
    return card({ ...base, evidence: '弱', chain });
  }
  const who = hit.side === 'h' ? '主队' : '客队';
  chain.push(`${who}控球更高，但射门或预期进球没有同步占优。`);
  if (hit.mid != null && hit.mid >= 0.42) chain.push(`该队进攻半场的中路球权约 ${Math.round(hit.mid * 100)}%，更像中场来回，不是前场转化。`);
  else chain.push('没有把中路占比写成进球通道。');
  const evidence = hit.xgLag && hit.mid != null && hit.mid >= 0.42 ? '中' : '弱';
  const scoreDelta = hit.side === 'h' ? -0.1 : 0.1;
  const rows = [{ lab: '控球', h: hp, a: ap, max: 100 }];
  if (hs != null && as != null) rows.push({ lab: '射门', h: hs, a: as, max: Math.max(hs, as, 1) });
  if (hx != null && ax != null) rows.push({ lab: '预期', h: hx, a: ax, max: Math.max(hx, ax, 0.2) });
  return card({
    ...base,
    evidence,
    fired: true,
    chain,
    scoreDelta,
    wdlNote: `${who}控球更高，但没有打进去，不把控球当成优势。`,
    say: `${who}控球更高，但射门没有跟上，不把控球当成优势`,
    viz: { kind: 'bars', rows, mark: hit.side },
  });
}

function tempoViz(hp, ap, hs, as, hx, ax, low, tag) {
  const rows = [];
  if (hp != null && ap != null) rows.push({ lab: '控球', h: hp, a: ap, max: 100 });
  if (hs != null && as != null) rows.push({ lab: '射门', h: hs, a: as, max: Math.max(hs, as, 1) });
  else if (hx != null && ax != null) rows.push({ lab: '预期', h: hx, a: ax, max: Math.max(hx, ax, 0.2) });
  return { kind: 'tempo', rows, low, tag };
}

function tempoCard(process, sterile) {
  const base = {
    id: 'tempo',
    name: '节奏错配与反击',
    markets: ['大小球', '胜平负'],
  };
  const home = processSide(process, 'home');
  const away = processSide(process, 'away');
  const hp = avgOf(home, 'possession');
  const ap = avgOf(away, 'possession');
  const hs = avgOf(home, 'shots');
  const as = avgOf(away, 'shots');
  const hx = avgOf(home, 'expectedGoals');
  const ax = avgOf(away, 'expectedGoals');
  const hd = avgOf(home, 'dangerousAttacks');
  const ad = avgOf(away, 'dangerousAttacks');
  if ((hs == null || as == null) && (hx == null || ax == null)) {
    return card({
      ...base,
      chain: ['射门和预期进球都缺，节奏和反击先空着。'],
    });
  }
  const chain = ['用控球、射门、预期进球看节奏。反击看的是低控球一方的射门或预期进球没有掉队。'];
  const possGap = hp != null && ap != null ? hp - ap : null;
  let low = null;
  if (possGap != null && Math.abs(possGap) >= 8) low = possGap > 0 ? 'a' : 'h';
  const lowShotsOk = low === 'a'
    ? ((as != null && hs != null && as + 0.4 >= hs) || (ax != null && hx != null && ax + 0.05 >= hx))
    : low === 'h'
      ? ((hs != null && as != null && hs + 0.4 >= as) || (hx != null && ax != null && hx + 0.05 >= ax))
      : false;
  if (low && lowShotsOk) {
    const sterileSame = sterile && sterile.fired && sideFromScore(sterile.scoreDelta) && (
      (low === 'a' && sterile.scoreDelta < 0) || (low === 'h' && sterile.scoreDelta > 0)
    );
    const mag = sterileSame ? 0.08 : 0.14;
    const scoreDelta = low === 'a' ? -mag : mag;
    const who = low === 'a' ? '客队' : '主队';
    chain.push(`${who}控球更低，但射门或预期进球没有落后，按反击对控球空虚处理。`);
    if (sterileSame) chain.push('无效控球已经打过折，这里的胜平负软分减半，大小球仍略抬。');
    const xg = (hx != null && ax != null);
    return card({
      ...base,
      evidence: xg ? '中' : '弱',
      fired: true,
      chain,
      scoreDelta,
      lambdaHome: 0.02,
      lambdaAway: 0.02,
      ouNote: `${who}更像反击，总进球略抬。`,
      wdlNote: `更看好${who}这种踢法。`,
      say: `${who}更像反击，总进球略抬`,
      viz: tempoViz(hp, ap, hs, as, hx, ax, low, '反击'),
    });
  }
  const shotDiff = hs != null && as != null ? hs - as : null;
  const bothOpen = hs != null && as != null && hs >= 14 && as >= 14;
  const bothSlow = hs != null && as != null && hs <= 9 && as <= 9;
  if (bothOpen || (shotDiff != null && Math.abs(shotDiff) >= 4 && (possGap == null || Math.abs(possGap) < 8))) {
    const toward = shotDiff != null && shotDiff >= 4 ? 0.04 : shotDiff != null && shotDiff <= -4 ? -0.04 : 0;
    const open = bothOpen || (hd != null && ad != null && hd >= 40 && ad >= 40);
    chain.push(open ? '两边射门都多，节奏偏快，大小球略抬。' : '射门差一截，但控球差不大，只轻微动大小球和软分。');
    return card({
      ...base,
      evidence: '弱',
      fired: true,
      chain,
      scoreDelta: toward,
      lambdaHome: open ? 0.03 : 0.015,
      lambdaAway: open ? 0.03 : 0.015,
      ouNote: open ? '两边射门偏多，总进球略抬。' : '射门节奏有差，总进球略抬。',
      say: open ? '两边射门都多，总进球略抬' : '射门节奏有差，总进球略抬',
      viz: tempoViz(hp, ap, hs, as, hx, ax, null, open ? '偏快' : '有差'),
    });
  }
  if (bothSlow) {
    chain.push('两边射门都少，节奏偏慢，总进球略看低。');
    return card({
      ...base,
      evidence: '弱',
      fired: true,
      chain,
      lambdaHome: -0.02,
      lambdaAway: -0.02,
      ouNote: '两边射门都少，总进球略看低。',
      say: '两边射门都少，总进球略看低',
      viz: tempoViz(hp, ap, hs, as, hx, ax, null, '偏慢'),
    });
  }
  chain.push('控球、射门、预期进球的错位不够明显，节奏项不动。');
  return card({ ...base, evidence: '弱', chain });
}

function scheduleCard(context, league) {
  const base = {
    id: 'schedule',
    name: '赛程拥挤',
    markets: ['胜平负', '大小球'],
  };
  const facts = (context && context.facts) || {};
  const restH = restDays(facts.restH);
  const restA = restDays(facts.restA);
  const tags = (context && context.tags) || [];
  const euroH = tags.some(t => t && t.kind === 'euro' && t.side === 'h');
  const euroA = tags.some(t => t && t.kind === 'euro' && t.side === 'a');
  const cup = /杯|欧冠|欧罗巴|欧协|亚冠/.test(String(league || ''));
  const chain = [];
  if (restH == null && restA == null && !euroH && !euroA) {
    chain.push('两边休息天数都不在近两周的可靠范围内，赛程项先空着。');
    return card({ ...base, chain });
  }
  if (restH != null) chain.push(`主队距上一场 ${restH} 天。`);
  if (restA != null) chain.push(`客队距上一场 ${restA} 天。`);
  let scoreDelta = 0;
  let confDelta = 0;
  let lambdaHome = 0;
  let lambdaAway = 0;
  let fired = false;
  let schedSay = '';
  if (restH != null && restA != null && restH <= 3 && restA >= 5) {
    scoreDelta -= 0.18;
    fired = true;
    chain.push('主队休息明显更短，软分偏客。以前这项权重是 0，现在入模。');
    schedSay = '主队赛程更挤，更看好客队';
  } else if (restH != null && restA != null && restA <= 3 && restH >= 5) {
    scoreDelta += 0.18;
    fired = true;
    chain.push('客队休息明显更短，软分偏主。以前这项权重是 0，现在入模。');
    schedSay = '客队赛程更挤，更看好主队';
  } else if (restH != null && restA != null && restH <= 3 && restA <= 3) {
    confDelta -= 0.03;
    lambdaHome -= 0.02;
    lambdaAway -= 0.02;
    fired = true;
    chain.push('两边都在三天内踢过，信心下降，总进球略看低。');
    schedSay = '两边都踢得密，信心下降，总进球略看低';
  }
  if (euroH) {
    scoreDelta -= 0.08;
    confDelta -= 0.015;
    fired = true;
    chain.push('主队前后有欧战，轮换风险记进软分。');
    if (!schedSay) schedSay = '主队前后有欧战，轮换风险算进去';
  }
  if (euroA) {
    scoreDelta += 0.08;
    confDelta -= 0.015;
    fired = true;
    chain.push('客队前后有欧战，轮换风险记进软分。');
    if (!schedSay) schedSay = '客队前后有欧战，轮换风险算进去';
  }
  if (cup && !fired) {
    chain.push('本场是杯赛或洲际赛，但休息差和欧战间隔都不够明确，不额外加减。');
    return card({ ...base, evidence: '弱', chain });
  }
  if (!fired) {
    chain.push('休息差没有到拥挤线，不改权重。');
    return card({ ...base, evidence: '弱', chain });
  }
  scoreDelta = r2(clamp(scoreDelta, -0.26, 0.26));
  confDelta = r2(clamp(confDelta, -0.04, 0));
  return card({
    ...base,
    evidence: (euroH || euroA) && restH == null ? '弱' : '中',
    fired: true,
    chain,
    scoreDelta,
    confDelta,
    lambdaHome: r2(lambdaHome),
    lambdaAway: r2(lambdaAway),
    ouNote: lambdaHome || lambdaAway ? '两边赛程都密，总进球略看低。' : '',
    wdlNote: scoreDelta ? (schedSay || '赛程有差，已算进胜平负。') : '',
    say: schedSay || '赛程有差，已算进去',
    viz: { kind: 'rest', home: restH, away: restA },
  });
}

function motiveCard(context) {
  const base = {
    id: 'motive',
    name: '动机不对称',
    markets: ['胜平负', '让球'],
  };
  const tags = (context && context.tags) || [];
  const mh = motivOf(tags, 'h');
  const ma = motivOf(tags, 'a');
  if (!mh && !ma) {
    return card({
      ...base,
      chain: ['积分榜看不出争冠、保级、欧战或无欲，动机项先空着。'],
    });
  }
  const ph = mh ? mh.pressure : 0;
  const pa = ma ? ma.pressure : 0;
  const diff = ph - pa;
  const chain = [];
  if (mh) chain.push(`主队${mh.tag}。`);
  else chain.push('主队没有动机标签。');
  if (ma) chain.push(`客队${ma.tag}。`);
  else chain.push('客队没有动机标签。');
  let scoreDelta = 0;
  if (diff >= 1.6) scoreDelta = 0.12;
  else if (diff >= 0.6) scoreDelta = 0.06;
  else if (diff <= -1.6) scoreDelta = -0.12;
  else if (diff <= -0.6) scoreDelta = -0.06;
  if (!scoreDelta) {
    chain.push('两边动机同级，不额外偏让球或胜平负。');
    return card({ ...base, evidence: '弱', chain });
  }
  const hi = scoreDelta > 0 ? '主队' : '客队';
  chain.push(`${hi}动机更高。这是背景分之外的附加软分，让球说明跟着这一侧，不改盘口数字。`);
  if (Math.abs(diff) >= 1.6) chain.push('一侧争冠或保级，另一侧无欲，附加分用较高一档。');
  return card({
    ...base,
    evidence: Math.abs(diff) >= 1.6 ? '中' : '弱',
    fired: true,
    chain,
    scoreDelta,
    hcapNote: `${hi}更想拿分，让球说明跟着这一侧，盘口数字不变。`,
    wdlNote: `${mh ? mh.tag : '主队'}对${ma ? ma.tag : '客队'}，更看好${hi}。`,
    say: `${mh ? '主队' + mh.tag : '主队没有特别动机'}，${ma ? '客队' + ma.tag : '客队没有特别动机'}，更看好${hi}`,
    viz: {
      kind: 'chips',
      home: mh ? mh.tag : '无标签',
      away: ma ? ma.tag : '无标签',
      hi: scoreDelta > 0 ? 'h' : 'a',
    },
  });
}

function clockCard(goalClock, half) {
  const base = {
    id: 'clock',
    wave: 2,
    name: '进球时钟',
    markets: ['大小球', '半全场'],
  };
  const home = goalClock && goalClock.home;
  const away = goalClock && goalClock.away;
  const gh = goalMass(home);
  const ga = goalMass(away);
  const minuteOk = gh.n >= 4 && ga.n >= 4 && gh.all >= 4 && ga.all >= 4;
  if (minuteOk) {
    const eh = gh.early / gh.all;
    const ea = ga.early / ga.all;
    const pct = (x) => `${Math.round(x * 100)}%`;
    const chain = [
      `进球分钟来自已缓存的进球事件。主队近 ${gh.n} 场、客队近 ${ga.n} 场。格子是该段进球数除以场次。`,
      `权重看前 30 分钟进球占该队全部进球的比例：主队 ${pct(eh)}，客队 ${pct(ea)}。`,
    ];
    const viz = {
      kind: 'segs',
      home: home.segments,
      away: away.segments,
      homeN: gh.n,
      awayN: ga.n,
      fallback: false,
    };
    const sub = '近况场均：该段进球 ÷ 场次，不是本场预测';
    if (eh >= 0.4 && ea >= 0.4) {
      chain.push('两边近况进球都偏向前 30 分钟，总进球略抬，上半场更值得看。');
      return card({
        ...base,
        sub,
        evidence: gh.n >= 8 && ga.n >= 8 ? '中' : '弱',
        fired: true,
        chain,
        lambdaHome: 0.02,
        lambdaAway: 0.02,
        ouNote: '近况进球偏早，总进球略抬。',
        wdlNote: '',
        say: '按各队自己的进球占比，两边都偏早，总进球略抬',
        viz,
      });
    }
    chain.push('分钟分布没有同时偏早，时钟只展示，不改权重。');
    return card({
      ...base,
      sub,
      evidence: '弱',
      fired: true,
      chain,
      say: '按场均看没有偏早，只展示，不改倾向',
      viz,
    });
  }
  const hh = half && half.home;
  const ah = half && half.away;
  if (hh && ah && hh.n >= 4 && ah.n >= 4) {
    const hl = hh.lead / hh.n;
    const al = ah.lead / ah.n;
    const chain = [
      '进球分钟样本不够，退回半场比分：只看近况上半场谁领先。',
      `主队上半领先 ${hh.lead}/${hh.n}，客队 ${ah.lead}/${ah.n}。`,
    ];
    if (hl >= 0.45 && al >= 0.45) {
      chain.push('两边都常在上半场领先，总进球只轻微抬，证据弱。');
      return card({
        ...base,
        evidence: '弱',
        fired: true,
        chain,
        lambdaHome: 0.015,
        lambdaAway: 0.015,
        ouNote: '分钟不够，改看上半场：两边常在上半领先，总进球轻微抬。',
        sub: '分钟不够，改看上半场谁常领先',
        say: '分钟不够，改看上半场谁常领先，总进球只轻微抬',
        viz: {
          kind: 'segs',
          fallback: true,
          homeLead: Math.round(hl * 100),
          awayLead: Math.round(al * 100),
        },
      });
    }
    chain.push('半场领先比例不够齐，不改权重。');
    return card({ ...base, evidence: '弱', chain });
  }
  return card({
    ...base,
    chain: ['进球分钟和半场比分都不够，进球时钟先空着。'],
  });
}

function concedeCard(goalClock, half) {
  const base = {
    id: 'concede',
    wave: 2,
    name: '先丢球',
    markets: ['胜平负', '大小球'],
  };
  const sides = [
    ['h', '主队', goalClock && goalClock.home, half && half.home],
    ['a', '客队', goalClock && goalClock.away, half && half.away],
  ];
  const shown = {};
  for (const [side, , prof, ht] of sides) {
    const n = prof && num(prof.n_fixtures);
    const idx = prof && num(prof.concede_first_index);
    if (n != null && n >= 5 && idx != null) shown[side] = { pct: Math.round(idx * 100), via: 'minute' };
    else if (ht && ht.n >= 4 && ht.trail != null) shown[side] = { pct: Math.round((ht.trail / ht.n) * 100), via: 'half' };
  }
  let best = null;
  for (const [side, name, prof, ht] of sides) {
    const n = prof && num(prof.n_fixtures);
    const idx = prof && num(prof.concede_first_index);
    if (n != null && n >= 5 && idx != null && idx >= 0.48) {
      const rank = idx * 10 + n / 100;
      if (!best || rank > best.rank) best = { side, name, idx, n, via: 'minute', rank };
    }
  }
  if (!best) {
    for (const [side, name, , ht] of sides) {
      if (!ht || !ht.n || ht.n < 4) continue;
      const idx = ht.trail / ht.n;
      if (idx >= 0.5) {
        const rank = idx;
        if (!best || rank > best.rank) best = { side, name, idx, n: ht.n, via: 'half', rank };
      }
    }
  }
  if (!best) {
    return card({
      ...base,
      chain: ['先丢球分钟和上半场落后场次都不够，这项先空着。'],
    });
  }
  const scoreDelta = best.side === 'h' ? -0.08 : 0.08;
  const chain = best.via === 'minute'
    ? [
      `${best.name}近 ${best.n} 场里，先丢球大约 ${Math.round(best.idx * 100)}%。`,
      '这是近况先丢比例，不是本场会崩。略更看好对手，总进球略抬。',
    ]
    : [
      `分钟时间线不够，用上半场落后代替：${best.name} ${Math.round(best.idx * 100)}% 的样本上半落后（${best.n} 场）。`,
      '证据弱，只轻微调软分。',
    ];
  const mag = best.via === 'minute' ? scoreDelta : r2(scoreDelta / 2);
  return card({
    ...base,
    evidence: best.via === 'minute' && best.idx >= 0.55 && best.n >= 8 ? '中' : '弱',
    fired: true,
    chain,
    scoreDelta: mag,
    lambdaHome: best.via === 'minute' ? 0.015 : 0,
    lambdaAway: best.via === 'minute' ? 0.015 : 0,
    ouNote: best.via === 'minute' ? `${best.name}近况更容易先丢球，总进球略抬。` : '',
    wdlNote: `${best.name}近况更容易先丢球，略更看好对手。`,
    say: best.via === 'minute'
      ? `${best.name}近况更容易先丢球，略更看好对手，总进球略抬`
      : `${best.name}上半场更容易落后，只轻微更看好对手`,
    viz: {
      kind: 'ratios',
      home: shown.h || null,
      away: shown.a || null,
      focus: best.side,
    },
  });
}

function roleOf(row) {
  const id = Number(row && row.position_id);
  const n = String((row && (row.position_name || row.name)) || '').toLowerCase();
  const pos = String((row && row.position_name) || '').toLowerCase();
  if (/keeper|goalkeeper|门将|守门/.test(pos) || id === 1) return 'gk';
  if (id === 24 || id === 25 || /defender|后卫|中卫|中后/.test(pos)) return 'defend';
  if (id === 26 || /midfield|中场|前卫/.test(pos)) return 'organize';
  if (id === 27 || /attack|forward|striker|winger|前锋|边锋/.test(pos)) return 'attack';
  if (/keeper|goalkeeper|门将|守门/.test(n)) return 'gk';
  return null;
}

function playerEur(row) {
  if (!row) return null;
  if (Object.prototype.hasOwnProperty.call(row, 'marketValueEur')) {
    const n = num(row.marketValueEur);
    return n != null && n > 0 ? n : null;
  }
  const name = String(row.name || '');
  if (!/[A-Za-z]/.test(name)) return null;
  try {
    const mv = require('./market-value').lookupPlayer(name, { club: row.club || '' });
    if (mv && mv.ok && Number(mv.eur) > 0) return Number(mv.eur);
  } catch { /* index missing */ }
  return null;
}

function contribScore(row, role) {
  const apps = Number(row && row.apps) || 0;
  const impact = Number(row && row.impact) || 0;
  if (apps < 2 && impact < 8) return 0;
  const per = apps > 0 ? 1 / apps : 0;
  const ga = ((Number(row.goals) || 0) + (Number(row.assists) || 0)) * per;
  let raw = 0;
  if (role === 'attack' || role === 'organize') raw = ga / 0.55;
  else if (role === 'defend') raw = ((Number(row.tackles) || 0) * per) / 2.5;
  else if (role === 'gk') raw = Math.max(((Number(row.tackles) || 0) * per) / 2.5, apps >= 3 ? 0.75 : 0.45);
  else raw = impact / 12;
  if (apps >= 3) raw = Math.max(raw, 0.35);
  if (!raw && impact >= 8) raw = impact / 14;
  return clamp(raw, 0, 1);
}

function absenceMode(person, sideKey, context) {
  const text = `${person.type || ''} ${person.reason || ''}`;
  if (/轮换|休息|保分|rotation|rested|workload|负荷/.test(text)) return 'rotation';
  const motiv = motivOf((context && context.tags) || [], sideKey);
  if (motiv && motiv.pressure < 0) return 'rotation';
  const euro = ((context && context.tags) || []).some(t => t && t.kind === 'euro' && t.side === sideKey);
  if (euro) return 'rotation';
  if (/伤|停赛|红牌|黄牌|病|肌肉|膝盖|腿|ankle|injury|suspend|card|knock|illness/.test(text)) return 'forced';
  if (person.type || person.reason) return 'forced';
  return 'unknown';
}

function marketCut(sideKey, market, oddsEdge) {
  const model = oddsEdge && oddsEdge.wdl;
  const p = market && market.p;
  if (!model || !p || model.h == null || p.h == null) return false;
  if (sideKey === 'h') return Number(p.a) - Number(model.a) >= 0.06;
  return Number(p.h) - Number(model.h) >= 0.06;
}

function laneCoreCard(corridor, squad, context, market, oddsEdge) {
  const base = {
    id: 'lanecore',
    wave: 2,
    name: '核心缺席',
    markets: ['胜平负', '让球', '大小球'],
    sub: '核心缺席会动进球期望；轮换或保分只降低信心',
  };
  const cores = (squad && squad.cores) || {};
  const sidelined = (squad && squad.sidelined) || [];
  const corridorOk = !!(corridor && corridor.available);
  const sides = {
    h: {
      list: 'home',
      lane: corridorOk ? corridor.home_attack_lane : null,
      zh: corridorOk ? corridor.home_attack_lane_zh : '',
      opp: corridorOk ? corridor.away_attack_lane : null,
    },
    a: {
      list: 'away',
      lane: corridorOk ? corridor.away_attack_lane : null,
      zh: corridorOk ? corridor.away_attack_lane_zh : '',
      opp: corridorOk ? corridor.home_attack_lane : null,
    },
  };
  const outIds = new Set(sidelined.filter(s => s && s.player_id != null).map(s => Number(s.player_id)));
  const rated = [];
  for (const sideKey of ['h', 'a']) {
    const meta = sides[sideKey];
    const list = cores[meta.list] || [];
    const byId = new Map();
    for (const row of list) {
      if (row && row.player_id != null) byId.set(Number(row.player_id), row);
    }
    const prices = list.map(playerEur).filter(n => n > 0);
    for (const s of sidelined) {
      if (!s || s.side !== meta.list) continue;
      const row = byId.get(Number(s.player_id)) || null;
      if (!s.core && !row) continue;
      const who = (row && row.name) || s.name || '';
      if (!who || who === '核心') continue;
      const merged = Object.assign({}, row || {}, s, { name: who });
      const role = roleOf(merged);
      const lane = laneFromText(merged.position_name || '');
      let kind = 'miss';
      let fit = 0.2;
      if (role === 'gk') { kind = 'gk'; fit = 1; }
      else if (lane && meta.lane && lane === meta.lane && role !== 'defend') {
        kind = 'attack';
        fit = role === 'organize' ? 0.75 : 1;
      } else if (lane && meta.opp && lane === meta.opp && (role === 'defend' || role === 'gk')) {
        kind = 'defend';
        fit = 0.9;
      }
      const contrib = contribScore(merged, role);
      const eur = playerEur(merged);
      let importance = contrib;
      if (eur && prices.length >= 2) {
        const share = eur / prices.reduce((sum, n) => sum + n, 0);
        const mv = clamp(share / 0.4, 0, 1);
        importance = clamp(0.5 * mv + 0.5 * Math.max(contrib, 0.2), 0, 1);
      }
      if (importance < 0.28 && !(fit >= 0.75 && importance >= 0.2)) continue;
      const backups = list.filter(c => c && !outIds.has(Number(c.player_id)) && roleOf(c) === role && role);
      const mine = Number(merged.impact) || ((Number(merged.goals) || 0) + (Number(merged.assists) || 0));
      let rep = 1;
      if (backups.length) {
        const best = Math.max(...backups.map(b => Number(b.impact) || ((Number(b.goals) || 0) + (Number(b.assists) || 0))));
        const ratio = mine > 0 ? best / mine : 1;
        rep = ratio >= 0.8 ? 0.35 : ratio >= 0.45 ? 0.6 : 0.85;
      }
      const mode = absenceMode(merged, sideKey, context);
      const priced = marketCut(sideKey, market, oddsEdge);
      const unit = importance * rep * fit * (priced ? 0.45 : 1);
      rated.push({
        side: sideKey,
        who,
        image: (row && (row.image || row.image_path)) || s.image || '',
        lane: meta.zh || '',
        matched: kind === 'attack' || kind === 'defend' || kind === 'gk',
        kind,
        mode,
        rep,
        priced,
        unit,
        importance,
      });
    }
  }
  if (!rated.length) {
    const anyCore = sidelined.some(s => s && s.core);
    return card({
      ...base,
      chain: [anyCore
        ? '缺阵的人没有够用的出场或同队身价对照，先不画。'
        : '没有对得上的缺阵核心。位置对不上、也没有出场记录，就不写成这条路没人。'],
    });
  }
  const bySideHits = { h: [], a: [] };
  for (const row of rated) bySideHits[row.side].push(row);
  let scoreDelta = 0;
  let lambdaHome = 0;
  let lambdaAway = 0;
  let confDelta = 0;
  const kept = [];
  const lineKey = (row) => {
    if (row.kind === 'gk') return 'gk';
    if (row.kind === 'miss') return 'miss:' + row.who;
    return row.kind + ':' + (row.lane || row.who);
  };
  for (const sideKey of ['h', 'a']) {
    const rows = bySideHits[sideKey].sort((a, b) => b.unit - a.unit).slice(0, 3);
    const groups = new Map();
    for (const row of rows) {
      const key = (row.mode === 'forced' && row.kind !== 'miss') ? lineKey(row) : ('solo:' + row.who);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const ordered = [...groups.values()].sort((a, b) => b[0].unit - a[0].unit);
    ordered.forEach((group, gi) => {
      const accelerate = group.length >= 2 && group.every(r => r.mode === 'forced' && r.kind !== 'miss');
      group.forEach((row, i) => {
        const within = accelerate ? [1, 1.25, 1.45][Math.min(i, 2)] : 1;
        const across = accelerate ? 1 : [1, 0.55, 0.35][Math.min(gi, 2)];
        const w = row.unit * within * across;
        const sign = sideKey === 'h' ? -1 : 1;
        let dScore = 0;
        let dLh = 0;
        let dLa = 0;
        if (row.kind === 'attack') {
          dScore = sign * 0.14 * w;
          if (sideKey === 'h') dLh = -0.12 * w;
          else dLa = -0.12 * w;
        } else if (row.kind === 'defend' || row.kind === 'gk') {
          dScore = sign * 0.10 * w;
          if (sideKey === 'h') dLa = 0.10 * w;
          else dLh = 0.10 * w;
        } else {
          dScore = sign * 0.14 * w * 0.35;
        }
        if (row.mode === 'rotation') {
          dScore *= 0.2;
          dLh *= 0.2;
          dLa *= 0.2;
          confDelta -= 0.015;
        } else if (row.mode === 'unknown') {
          dScore *= 0.55;
          dLh *= 0.55;
          dLa *= 0.55;
        }
        scoreDelta += dScore;
        lambdaHome += dLh;
        lambdaAway += dLa;
        if (row.priced) confDelta -= 0.01;
        kept.push(row);
      });
    });
  }
  lambdaHome = r2(clamp(lambdaHome, -0.32, 0.32));
  lambdaAway = r2(clamp(lambdaAway, -0.32, 0.32));
  scoreDelta = r2(clamp(scoreDelta, -0.38, 0.38));
  confDelta = r2(clamp(confDelta, -0.04, 0));
  kept.sort((a, b) => b.unit - a.unit);
  const top = kept[0];
  const sideName = top.side === 'h' ? '主队' : '客队';
  const whyOf = (row) => {
    const bits = [];
    if (row.mode === 'rotation') bits.push('更像轮换或保分');
    else if (row.mode === 'forced') bits.push('伤病或缺席');
    else bits.push('缺席原因不清楚');
    if (row.kind === 'attack') bits.push(row.lane ? `常走${row.lane}` : '常走的那条路');
    else if (row.kind === 'defend') bits.push('守在对方常攻的一侧');
    else if (row.kind === 'gk') bits.push('门将');
    else bits.push('位置对不上常走的路');
    if (row.rep >= 0.85) bits.push('替补偏弱');
    else if (row.rep <= 0.4) bits.push('还有人能顶上');
    if (row.priced) bits.push('盘口已有体现');
    return bits.join(' · ');
  };
  const people = kept.slice(0, 2).map(row => ({
    who: personZh(row.who),
    nameEn: row.who,
    lane: row.lane,
    image: row.image,
    matched: row.matched,
    why: whyOf(row),
  }));
  const whoZh = personZh(top.who);
  let say = '';
  if (top.mode === 'rotation') say = `${whoZh}更像轮换或在保分，进球期望几乎不动，只降低一点信心`;
  else if (top.kind === 'attack') say = `${whoZh}缺阵，${top.lane || '常走的那条路'}这边更吃亏，${sideName}进球期望下调`;
  else if (top.kind === 'defend' || top.kind === 'gk') say = `${whoZh}缺阵，对方从这边更容易打穿`;
  else say = `${whoZh}缺阵，但位置对不上常走的那条路，只轻微调整`;
  if (top.priced && top.mode !== 'rotation') say += '。盘口已经偏向这边，不再重复压进球';
  const chain = kept.slice(0, 3).map(row => `${row.side === 'h' ? '主队' : '客队'} ${personZh(row.who)}：${whyOf(row)}。`);
  chain.push('同一条路上的伤病会加重；不同位置则分量递减。身价只在能对上同队其他人时才参与，不用两队身价总额比。');
  const hard = kept.some(row => row.mode !== 'rotation' && row.kind !== 'miss' && Math.abs(row.side === 'h' ? lambdaHome : lambdaAway) >= 0.03);
  return card({
    ...base,
    evidence: hard ? '中' : '弱',
    fired: true,
    chain,
    scoreDelta,
    lambdaHome,
    lambdaAway,
    confDelta,
    ouNote: (lambdaHome || lambdaAway) ? '关键人缺席已计入期望进球，轮换几乎不计入。' : '',
    hcapNote: '关键人缺席写进让球说明，轮换只降低信心。',
    wdlNote: '关键人缺席已算进胜平负。',
    say,
    viz: { kind: 'cores', people },
  });
}

function disciplineCard(process) {
  const base = {
    id: 'cards',
    wave: 2,
    name: '牌相',
    markets: ['胜平负'],
  };
  const home = processSide(process, 'home');
  const away = processSide(process, 'away');
  const hd = home && home.discipline;
  const ad = away && away.discipline;
  const hy = hd && num(hd.yellow);
  const ay = ad && num(ad.yellow);
  const hr = hd && num(hd.red);
  const ar = ad && num(ad.red);
  if (hy == null && ay == null && hr == null && ar == null) {
    return card({
      ...base,
      chain: ['近况黄牌、红牌场均不够，不编造犯规率，牌相不进权重。'],
    });
  }
  const chain = [];
  if (hy != null || ay != null) chain.push(`黄牌场均 主 ${hy == null ? '—' : hy} / 客 ${ay == null ? '—' : ay}。`);
  if (hr != null || ar != null) chain.push(`红牌场均 主 ${hr == null ? '—' : hr} / 客 ${ar == null ? '—' : ar}。`);
  let scoreDelta = 0;
  let confDelta = 0;
  if (hy != null && ay != null && Math.abs(hy - ay) >= 0.7 && Math.max(hy, ay) >= 2.2) {
    scoreDelta = hy > ay ? -0.06 : 0.06;
    chain.push('黄牌场均更高的一侧，胜平负软分略降。');
  }
  if ((hr != null && hr >= 0.2) || (ar != null && ar >= 0.2)) {
    confDelta = -0.02;
    chain.push('有一侧红牌场均偏高，信心略降。没有把红牌写成本场必罚下。');
  }
  if (!scoreDelta && !confDelta) {
    chain.push('牌差不够大，不改权重。');
    return card({ ...base, evidence: '弱', chain });
  }
  return card({
    ...base,
    evidence: '弱',
    fired: true,
    chain,
    scoreDelta,
    confDelta,
    wdlNote: '吃牌更多的一边，只轻微让一让。',
    say: '吃牌更多的一边，胜平负只轻微让一让',
    viz: { kind: 'yr', hy, ay, hr, ar },
  });
}

function keeperFromDb(teamId) {
  if (!teamId) return null;
  try {
    const db = require('./player-match-db').getDb();
    if (!db) return null;
    const row = db.prepare(`
      SELECT AVG(saves) AS a, COUNT(saves) AS n
      FROM player_match_stats
      WHERE team_id = ? AND saves IS NOT NULL
        AND (
          LOWER(IFNULL(position, '')) LIKE '%goal%'
          OR IFNULL(position, '') LIKE '%门将%'
          OR IFNULL(position, '') LIKE '%守门%'
        )
    `).get(String(teamId));
    if (!row || !row.n || row.n < 3 || row.a == null) return null;
    return { avg: r2(row.a), n: row.n };
  } catch {
    return null;
  }
}

function keeperCard(input) {
  const base = {
    id: 'keeper',
    wave: 2,
    name: '门将扑救',
    markets: ['胜平负'],
  };
  const given = input && input.gk;
  const m = input && input.m;
  const home = given ? given.home : keeperFromDb(m && m.homeTeamId);
  const away = given ? given.away : keeperFromDb(m && m.awayTeamId);
  if (!home || !away || home.avg == null || away.avg == null) {
    return card({
      ...base,
      chain: ['没有两边都够用的门将扑救样本。缺的一侧不补 0，这项不进权重。'],
    });
  }
  const diff = home.avg - away.avg;
  const chain = [
    `扑救场均 主 ${home.avg}（${home.n} 条）/ 客 ${away.avg}（${away.n} 条）。`,
    '弱证据：扑救多也可能是面对的射门多，所以只轻微动胜平负。',
  ];
  if (Math.abs(diff) < 0.8) {
    chain.push('差距不够，不改权重。');
    return card({ ...base, evidence: '弱', chain });
  }
  const scoreDelta = diff > 0 ? 0.05 : -0.05;
  chain.push(diff > 0 ? '主队扑救场均更高，胜平负软分轻微偏主。' : '客队扑救场均更高，胜平负软分轻微偏客。');
  return card({
    ...base,
    evidence: '弱',
    fired: true,
    chain,
    scoreDelta,
    wdlNote: '扑救有差，只轻微调整。扑救多也可能是被射得多。',
    say: '扑救有差，只轻微调整。扑救多也可能是被射得多',
    viz: { kind: 'saves', home: home.avg, away: away.avg },
  });
}

function pressCard(smPressure) {
  const probed = smPressure && smPressure.available === true;
  return card({
    id: 'press',
    wave: 2,
    name: '高位逼抢',
    markets: [],
    evidence: '无',
    fired: false,
    chain: probed
      ? [
        '压力接口探测是通的，但没有逐队、逐场的逼抢样本。',
        '不能把「接口存在」写成高位逼抢强弱，这项跳过。',
      ]
      : [
        '当前没有可用的逐场高位逼抢数据。',
        '不另购、不估算逼抢强度，这项跳过。',
      ],
  });
}

function moveSeries(sum, dir) {
  if (!sum || !dir) return [];
  const spark = Array.isArray(sum.spark)
    ? sum.spark.map(p => Number(p && p[dir])).filter(n => Number.isFinite(n))
    : [];
  if (spark.length >= 2) return spark;
  const open = sum.open && Number(sum.open[dir]);
  const last = sum.last && Number(sum.last[dir]);
  if (open > 1 && last > 1) return [1 / open, 1 / last];
  return [];
}

function moveCaption(sum, dir) {
  if (!sum || !dir) return '';
  const bit = (name, key) => {
    const o = sum.open && Number(sum.open[key]);
    const l = sum.last && Number(sum.last[key]);
    if (!(o > 1) || !(l > 1) || Math.abs(l - o) < 0.01) return '';
    return l > o ? `${name}水位抬高 ${o.toFixed(2)}→${l.toFixed(2)}` : `${name}赔率走低 ${o.toFixed(2)}→${l.toFixed(2)}`;
  };
  const order = dir === 'a' ? [['主胜', 'h'], ['客胜', 'a']]
    : dir === 'h' ? [['客胜', 'a'], ['主胜', 'h']]
      : [['平局', 'd']];
  const bits = order.map(([name, key]) => bit(name, key)).filter(Boolean);
  if (bits.length) return bits.join('，');
  const sh = sum.shift && Number(sum.shift[dir]);
  if (!Number.isFinite(sh)) return '';
  const who = dir === 'h' ? '主胜' : dir === 'a' ? '客胜' : '平局';
  return sh > 0 ? `${who}隐含上升` : `${who}隐含下降`;
}

function moveViz(fund, dir, movement) {
  let chip = '近况没站边';
  let tone = 'twist';
  if (fund && dir && fund === dir) {
    chip = '近况与盘口同向';
    tone = 'same';
  } else if (fund && dir && fund !== dir) {
    chip = '近况与盘口相反';
  } else if (!fund) {
    chip = '近况没站边';
  }
  const formText = fund === 'h' ? '更看好主胜' : fund === 'a' ? '更看好客胜' : '没有站到一边';
  const moveText = dir === 'h' ? '更看好主胜' : dir === 'a' ? '更看好客胜' : dir === 'd' ? '更看好平局' : '看不出方向';
  const sum = movement && movement.sum;
  return {
    kind: 'move',
    formText,
    moveText,
    chip,
    tone,
    series: moveSeries(sum, dir),
    caption: moveCaption(sum, dir),
    points: sum && sum.n || (sum && sum.spark && sum.spark.length) || 0,
  };
}

function moveCard(movement, form, process, motive) {
  const base = {
    id: 'move',
    name: '变盘与基本面',
    markets: ['胜平负'],
  };
  const dir = movement && (movement.lean || (movement.sum && movement.sum.dir));
  if (!movement || !movement.hasData || !dir) {
    return card({
      ...base,
      chain: ['开盘到现在的变盘幅度不够，或没有变盘记录。不拿变盘改倾向。'],
    });
  }
  const votes = { h: 0, a: 0 };
  const fl = formLeanOf(form);
  const pl = process && process.lean;
  if (fl === 'h' || fl === 'a') votes[fl] += 1;
  if (pl === 'h' || pl === 'a') votes[pl] += 1;
  const ms = motive && motive.fired ? sideFromScore(motive.scoreDelta) : null;
  if (ms) votes[ms] += 1;
  let fund = null;
  if (votes.h > 0 && votes.a === 0) fund = 'h';
  else if (votes.a > 0 && votes.h === 0) fund = 'a';
  const chain = [
    fund ? `基本面（近况 / 过程 / 动机）站在${PICK[fund]}。` : '近况、过程和动机没有站在同一边。',
    `变盘方向是${PICK[dir] || dir}。`,
  ];
  if (fund && (dir === 'h' || dir === 'a') && fund !== dir) {
    chain.push('方向相反：只降低信心，不跟着变盘改倾向。');
    return card({
      ...base,
      evidence: '中',
      fired: true,
      chain,
      confDelta: -0.04,
      risk: '变盘和基本面反向，已降低信心，倾向不跟着盘口改。',
      wdlNote: '近况和盘口走势相反，只降低信心，不跟着盘口改倾向。',
      say: '只降低信心，不跟着盘口改倾向',
      viz: moveViz(fund, dir, movement),
    });
  }
  if (fund && dir === fund) {
    chain.push('变盘和基本面同向，信心略抬，幅度很小。');
    return card({
      ...base,
      evidence: '弱',
      fired: true,
      chain,
      confDelta: 0.01,
      wdlNote: '近况和盘口走势同向，信心略抬。',
      say: '和近况同向，信心略抬',
      viz: moveViz(fund, dir, movement),
    });
  }
  if (fund && dir === 'd') {
    chain.push('变盘偏平，和基本面的胜负方向不一致。不把倾向改成平局，只略降信心。');
    return card({
      ...base,
      evidence: '弱',
      fired: true,
      chain,
      confDelta: -0.02,
      risk: '变盘偏平，与基本面胜负方向不一致，已略降信心。',
      say: '更看好平局，只降低信心，不改倾向',
      viz: moveViz(fund, dir, movement),
    });
  }
  chain.push('基本面不一致时，变盘只记一笔，不改倾向。');
  return card({
    ...base,
    evidence: '弱',
    fired: !!(dir && (dir === 'h' || dir === 'a' || dir === 'd')),
    chain,
    confDelta: dir ? -0.01 : 0,
    risk: dir ? '基本面不一致，变盘未用来改倾向。' : '',
    say: '近况没有站到一边，不跟着盘口改倾向',
    viz: dir ? moveViz(fund, dir, movement) : null,
  });
}

function finish(components) {
  let score = 0;
  let conf = 0;
  let lh = 0;
  let la = 0;
  const ou = [];
  const hcap = [];
  const wdl = [];
  const risks = [];
  for (const c of components) {
    score += Number(c.scoreDelta) || 0;
    conf += Number(c.confDelta) || 0;
    lh += Number(c.lambdaHome) || 0;
    la += Number(c.lambdaAway) || 0;
    if (c.fired && c.ouNote) ou.push(c.ouNote);
    if (c.fired && c.hcapNote) hcap.push(c.hcapNote);
    if (c.fired && c.wdlNote) wdl.push(c.wdlNote);
    if (c.fired && c.risk) risks.push(c.risk);
  }
  return {
    components,
    deferred: deferredList(),
    scoreDelta: r2(clamp(score, -0.85, 0.85)),
    confDelta: r2(clamp(conf, -0.07, 0.03)),
    lambda: { home: r2(clamp(lh, -0.34, 0.34)), away: r2(clamp(la, -0.34, 0.34)) },
    notes: {
      ou: ou.slice(0, 3).join(' '),
      hcap: hcap.slice(0, 3).join(' '),
      wdl: wdl.slice(0, 3).join(' '),
    },
    risks,
  };
}

function buildPack(input) {
  try {
    const src = input || {};
    const blocks = src.blocks || src;
    const corridor = blocks.corridor || src.corridor || null;
    const process = blocks.process || null;
    const context = blocks.context || null;
    const squad = blocks.squad || null;
    const heat = blocks.heat || null;
    const goalClock = blocks.goalClock || null;
    const half = squad && squad.half;
    const sterile = sterileCard(process, heat);
    const motive = motiveCard(context);
    const components = [
      corridorCard(corridor),
      sterile,
      tempoCard(process, sterile),
      scheduleCard(context, (src.m && src.m.league) || (blocks.m && blocks.m.league) || ''),
      motive,
      moveCard(blocks.movement, blocks.form, process, motive),
      clockCard(goalClock, half),
      concedeCard(goalClock, half),
      laneCoreCard(corridor, squad, context, blocks.market, blocks.oddsEdge),
      disciplineCard(process),
      keeperCard(src.gk ? { gk: src.gk, m: src.m } : { m: src.m || blocks.m }),
      pressCard(blocks.smPressure),
    ];
    return finish(components);
  } catch (e) {
    return emptyPack(e.message);
  }
}

function plainFactor(c) {
  if (!c || !c.fired) return '';
  const side = sideFromScore(c.scoreDelta);
  const who = side === 'h' ? '主队' : side === 'a' ? '客队' : '';
  if (c.id === 'corridor' && c.viz) {
    const lane = c.viz.homeOn ? c.viz.homeAtk : c.viz.awayOn ? c.viz.awayAtk : '';
    return lane ? `${lane}对位更占优` : '常走的路对上更松的一侧';
  }
  if (c.id === 'schedule') {
    if (side === 'a') return '主队赛程更挤';
    if (side === 'h') return '客队赛程更挤';
    return '两边赛程都紧';
  }
  if (c.id === 'motive') return '比赛动机不同';
  if (c.id === 'sterile') return who ? `${who}控球但打不进去` : '控球但打不进去';
  if (c.id === 'tempo') return who ? `${who}更像反击` : '节奏不一样';
  if (c.id === 'lanecore') return who ? `${who}这条路的关键人缺阵` : '关键人缺阵';
  if (c.id === 'concede') return who ? `${who}近况更容易先丢球` : '先丢球习惯有差';
  if (c.id === 'cards') return who ? `${who}吃牌更多` : '吃牌有差';
  if (c.id === 'keeper') return who ? `${who}扑救更多` : '门将扑救有差';
  if (c.id === 'clock') return '进球偏早';
  return '';
}

function dualViz(wdl, marketP, mk, ok, support) {
  return {
    kind: 'dual',
    rows: ['h', 'd', 'a'].map(k => ({
      lab: PICK[k].slice(0, 1),
      full: PICK[k],
      model: Math.round(Number(wdl[k]) * 100),
      odds: Math.round(Number(marketP[k]) * 100),
      modelOn: k === mk,
      oddsOn: k === ok,
    })),
    attr: (support || []).slice(0, 3),
  };
}

function handicapPick(rq) {
  if (!rq || !rq.rows || !rq.rows.length) return { model: null, fair: null };
  const model = {};
  const fair = {};
  for (const row of rq.rows) {
    if (!row || !row.k) continue;
    if (row.model != null) model[row.k] = Number(row.model);
    if (row.fair != null) fair[row.k] = Number(row.fair);
  }
  return { model: argmaxPick(model, 0.03), fair: argmaxPick(fair, 0.03) };
}

function attachDivergence(pack, { wdl, marketP, rq } = {}) {
  const base = pack || emptyPack();
  const others = (base.components || []).filter(c => c.id !== 'diverge');
  const mk = argmaxPick(wdl, 0.03);
  const ok = argmaxPick(marketP, 0.03);
  const hcap = handicapPick(rq);
  const hcapSplit = !!(hcap.model && hcap.fair && hcap.model !== hcap.fair);
  const name = '模型与盘口分歧';
  let comp;
  if (!mk || !ok) {
    const noWdl = !(marketP && marketP.h != null && marketP.d != null && marketP.a != null);
    comp = card({
      id: 'diverge',
      name,
      markets: ['胜平负', '让球'],
      omitIdle: noWdl,
      chain: [
        !mk ? '模型胜平负拉不开差距，或还没有模型概率。' : `模型更接近${PICK[mk]}。`,
        !ok ? (noWdl ? '胜平负暂无，不拿让球隐含冒充胜平负，也不编造赔率。' : '盘口胜平负拉不开差距。') : `盘口更接近${PICK[ok]}。`,
        '对照不成立时不降信心，也不用盘口覆盖模型。',
      ],
    });
  } else if (mk === ok && !hcapSplit) {
    comp = card({
      id: 'diverge',
      name,
      markets: ['胜平负', '让球'],
      evidence: '弱',
      chain: [`模型和盘口都更接近${PICK[mk]}，胜平负分歧项不改权重。`],
    });
  } else if (mk === ok && hcapSplit) {
    comp = card({
      id: 'diverge',
      name,
      evidence: '弱',
      fired: true,
      markets: ['让球'],
      chain: [
        `胜平负模型和盘口同向（${PICK[mk]}）。`,
        `让球模型更接近${PICK[hcap.model]}，让球盘更接近${PICK[hcap.fair]}。`,
        '只略降信心，不把让球倾向改成盘口。',
      ],
      confDelta: -0.015,
      risk: '让球模型与让球盘不一致，已略降信心。',
      hcapNote: '让球方向和盘口不一致，只降低信心，不跟着盘口改。',
      say: '胜平负同向，让球方向不一致，只降低信心',
      viz: dualViz(wdl, marketP, mk, ok, []),
    });
  } else {
    const gap = Math.abs(Number(wdl[mk]) - Number(marketP[mk]));
    const severe = gap >= 0.08;
    const support = [];
    const against = [];
    for (const c of others) {
      if (!c.fired) continue;
      const side = sideFromScore(c.scoreDelta);
      if (!side) continue;
      const phrase = plainFactor(c);
      if (!phrase) continue;
      if (side === mk) support.push(phrase);
      else if (side === ok) against.push(phrase);
    }
    const chain = [
      `模型更接近${PICK[mk]}（${Math.round(Number(wdl[mk]) * 100)}%），盘口更接近${PICK[ok]}（${Math.round(Number(marketP[ok]) * 100)}%）。`,
      `模型在「${PICK[mk]}」上和盘口隐含差大约 ${Math.round(gap * 100)} 个百分点。`,
    ];
    if (support.length) chain.push(`和模型同向的组件：${support.join('、')}。`);
    else chain.push('没有组件站在模型这一侧。偏离先当成样本不稳，只降信心，不当成反向价值。');
    if (against.length) chain.push(`和盘口同向的组件：${against.join('、')}。`);
    chain.push('盘口只用来标偏离。软分不加到盘口那一侧，倾向不跟着盘口翻。');
    if (hcapSplit) chain.push(`让球也不同向：模型${PICK[hcap.model]}，盘口${PICK[hcap.fair]}。`);
    comp = card({
      id: 'diverge',
      name,
      evidence: !support.length ? '弱' : (severe ? '中' : '弱'),
      fired: true,
      markets: hcapSplit ? ['胜平负', '让球'] : ['胜平负'],
      chain,
      confDelta: severe ? -0.03 : -0.02,
      risk: support.length
        ? '模型与盘口不一致，已按组件来源降低信心，不用盘口覆盖模型。'
        : '模型与盘口不一致，但没有组件解释这个偏离，已降低信心。',
      wdlNote: `模型偏${PICK[mk]}，盘口偏${PICK[ok]}，只降低信心，不跟着盘口改。`,
      say: `模型偏${PICK[mk]}，盘口偏${PICK[ok]}`,
      viz: dualViz(wdl, marketP, mk, ok, support),
    });
  }
  return finish(others.concat(comp));
}

function nudgeOddsEdge(oddsEdge, pack, market) {
  if (!oddsEdge || !oddsEdge.exp || !pack || !pack.lambda) return oddsEdge;
  const dh = Number(pack.lambda.home) || 0;
  const da = Number(pack.lambda.away) || 0;
  if (!dh && !da) return oddsEdge;
  const sc = require('./strength-calib');
  const beforeH = Number(oddsEdge.exp.expH);
  const beforeA = Number(oddsEdge.exp.expA);
  const expH = clamp(beforeH + dh, 0.2, 4.2);
  const expA = clamp(beforeA + da, 0.2, 4.2);
  const exp = Object.assign({}, oddsEdge.exp, { expH, expA, beforeH, beforeA });
  const over25 = sc.over25Prob(expH + expA);
  const wdl = sc.wdlProbs(expH, expA);
  let rq = oddsEdge.rq;
  const q = market && market.q;
  if (rq && Number.isFinite(Number(rq.line)) && q) {
    const model = sc.handicapWdl(expH, expA, Number(rq.line));
    if (model) {
      const prev = {};
      for (const row of rq.rows || []) if (row && row.k) prev[row.k] = row;
      const HHAD = { h: '让胜', d: '让平', a: '让负' };
      rq = {
        line: Number(rq.line),
        rows: ['h', 'd', 'a'].map(k => {
          const old = prev[k] || {};
          return {
            k,
            lab: old.lab || HHAD[k],
            model: model[k],
            fair: q[k],
            odd: old.odd,
            deltaPp: q[k] != null ? (model[k] - q[k]) * 100 : null,
          };
        }),
      };
    }
  }
  return Object.assign({}, oddsEdge, {
    exp,
    over25,
    wdl,
    rq,
    componentNudge: { home: r2(expH - beforeH), away: r2(expA - beforeA) },
  });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function summaryLine(pack) {
  if (!pack) return '推导组件还没有生成。';
  const fired = (pack.components || []).filter(c => c.fired).length;
  if (!fired) return '这几项样本都不够，倾向和信心不动。';
  const s = pack.scoreDelta || 0;
  const c = pack.confDelta || 0;
  const lh = pack.lambda && pack.lambda.home || 0;
  const la = pack.lambda && pack.lambda.away || 0;
  const lean = s > 0.04 ? '更偏向主队' : s < -0.04 ? '更偏向客队' : '没有把胜平负推向一边';
  return `合计${lean}，信心${c > 0 ? '多' : '少'} ${Math.abs(r2(c * 100)).toFixed(1)} 个百分点，期望进球主 ${lh > 0 ? '+' : ''}${r2(lh).toFixed(2)}、客 ${la > 0 ? '+' : ''}${r2(la).toFixed(2)}。球权分布不是进球落点。`;
}

const SHORT = {
  diverge: '模型与盘口',
  move: '变盘对照',
  corridor: '对位提示',
  motive: '动机',
  schedule: '赛程',
  sterile: '控球但打不进去',
  tempo: '节奏',
  clock: '进球时钟',
  concede: '先丢球习惯',
  lanecore: '这条路的关键人',
  cards: '牌相',
  keeper: '门将',
};

const SUB = {
  diverge: '模型推理 vs 市场赔率',
  move: '近况看好谁，赔率往哪边走',
  corridor: '常走的路，对上对方更松的一侧 · 非本场实时',
  motive: '这场谁更想拿分',
  schedule: '上一场隔了几天',
  sterile: '控球多，威胁没跟上',
  tempo: '更快，或更像反击',
  clock: '近况场均：该段进球 ÷ 场次，不是本场预测',
  concede: '近况谁更容易先失球 · 不是本场必崩',
  lanecore: '核心缺席会动进球期望；轮换或保分只降低信心',
  cards: '近况场均黄牌、红牌',
  keeper: '扑救只作参考，多也可能是被射得多',
};


// 变盘对照仍写入组件信心，但不进预测页 Wave，也不进「样本不够」脚注。
const HIDDEN_WAVE = new Set(['move']);

const GROUP = {
  head: ['diverge'],
  corridor: ['corridor'],
  grid: ['motive', 'schedule', 'sterile', 'tempo'],
  later: ['clock', 'concede', 'lanecore', 'cards', 'keeper'],
};

function pctWidth(v, max) {
  const n = Number(v);
  const m = Number(max);
  if (!Number.isFinite(n) || !Number.isFinite(m) || m <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((n / m) * 100)));
}

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n * 100) / 100);
}

function halfSentence(c) {
  const lines = (c.chain || []).map(s => String(s || '').trim()).filter(Boolean);
  const last = lines[lines.length - 1] || c.effect || '';
  if (last.length <= 42) return last;
  const cut = last.slice(0, 40);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('，'));
  return (stop > 12 ? cut.slice(0, stop) : cut) + '…';
}

function barRow(lab, h, a, max) {
  return `<div class="pc-row"><span class="lab">${esc(lab)}</span><div class="pc-duo">
    <i class="h" title="主"><b style="width:${pctWidth(h, max)}%"></b></i>
    <i class="a" title="客"><b style="width:${pctWidth(a, max)}%"></b></i>
    <em>主 ${esc(fmtNum(h))} · 客 ${esc(fmtNum(a))}</em>
  </div></div>`;
}

function goalAvg(count, fixtures) {
  const n = Number(fixtures);
  if (!(n > 0)) return null;
  return (Number(count) || 0) / n;
}

function goalDist(homeSeg, awaySeg, homeN, awayN) {
  const hn = Number(homeN) || 0;
  const an = Number(awayN) || 0;
  if (hn < 4 || an < 4) {
    return '<p class="pc-idle">两边场次不够，不把进球分钟放在一起比。</p>';
  }
  const order = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const ticks = ['00′', '15′', '30′', '45′', '60′', '75′', '90′'];
  const blocks = (segs, side, fixtures) => order.map((k, i) => {
    const avg = goalAvg(segs && segs[k], fixtures);
    const half = i < 3 ? 'h1' : 'h2';
    const text = avg == null ? '—' : avg.toFixed(1);
    return `<i class="${side} ${half}${avg ? '' : ' is-empty'}">${text}</i>`;
  }).join('');
  const row = (lab, segs, side, fixtures) => `<div class="pc-gd-row"><span>${lab}</span><div class="pc-gd-blocks">${blocks(segs, side, fixtures)}</div></div>`;
  return `<div class="pc-gd"><p class="pc-gd-n">主近 ${esc(hn)} 场 · 客近 ${esc(an)} 场</p><div class="pc-gd-axis">${ticks.map(t => `<span>${t}</span>`).join('')}</div>${row('主', homeSeg, 'home', hn)}${row('客', awaySeg, 'away', an)}</div>`;
}

function personZh(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw) && !/[A-Za-z]/.test(raw)) return raw;
  try {
    const zh = require('./league-tables').playerZh(raw);
    if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  } catch { /* keep the source name */ }
  return raw;
}

function applyPersonZh(text, people) {
  let s = String(text || '');
  const names = [];
  for (const p of people || []) {
    if (p && p.nameEn) names.push(p.nameEn);
    if (p && p.who) names.push(p.who);
  }
  const uniq = [...new Set(names.filter(n => n && /[A-Za-z]/.test(n)))].sort((a, b) => b.length - a.length);
  for (const en of uniq) {
    const zh = personZh(en);
    if (zh && zh !== en) s = s.split(en).join(zh);
  }
  return s;
}

function namedPeople(c) {
  return ((c && c.viz && c.viz.people) || []).filter(p => p && p.who && p.who !== '核心');
}

function visual(c) {
  const v = c.viz;
  if (!v) return `<p class="pc-plain">${esc(c.effect || '')}</p>`;
  if (v.kind === 'dual') {
    const rows = (v.rows || []).map(r => ({
      ...r,
      abs: Math.abs((Number(r.model) || 0) - (Number(r.odds) || 0)),
    }));
    const maxAbs = rows.reduce((m, r) => Math.max(m, r.abs), 0);
    const groups = rows.map(r => {
      const hot = maxAbs > 0 && r.abs === maxAbs;
      const track = 62;
      const hPx = Math.max(4, Math.round(track * Math.max(0, Number(r.model) || 0) / 100));
      const aPx = Math.max(4, Math.round(track * Math.max(0, Number(r.odds) || 0) / 100));
      return `<div class="pc-vgrp${hot ? ' is-hot' : ' is-dim'}">
        <div class="pc-vdelta">${hot ? `差 ${esc(Math.round(r.abs))}pt` : ''}</div>
        <div class="pc-vbars" aria-hidden="true">
          <span class="vb"><b>${esc(r.model)}</b><i class="h" style="height:${hPx}px"></i></span>
          <span class="vb"><b>${esc(r.odds)}</b><i class="m" style="height:${aPx}px"></i></span>
        </div>
        <em>${esc(r.full || r.lab)}</em>
      </div>`;
    }).join('');
    const attr = v.attr && v.attr.length
      ? `差在哪：${v.attr.join(' · ')}`
      : '差在哪：没有哪一项站在模型这边，先当成样本不稳';
    return `<div class="pc-dual-key"><i class="h"></i>模型推理<i class="a"></i>市场赔率</div><div class="pc-v3">${groups}</div><p class="pc-attr">${esc(attr)}</p>`;
  }
  if (v.kind === 'chips') {
    return `<div class="pc-chips">
      <b class="${v.hi === 'h' ? 'on' : ''}">主 · ${esc(v.home)}</b>
      <b class="${v.hi === 'a' ? 'on' : ''}">客 · ${esc(v.away)}</b>
    </div>`;
  }
  if (v.kind === 'rest') {
    const line = (lab, days) => {
      if (days == null) return `<div class="line"><span>${lab}</span><div class="bar"></div><em>—</em></div>`;
      const tight = days <= 3 ? ' tight' : '';
      const side = lab === '主' ? ' h' : ' a';
      return `<div class="line"><span>${lab}</span><div class="bar${side}${tight}"><b style="width:${pctWidth(days, 10)}%"></b></div><em>${esc(days)}天</em></div>`;
    };
    return `<div class="pc-rest">${line('主', v.home)}${line('客', v.away)}</div>`;
  }
  if (v.kind === 'bars' || v.kind === 'tempo') {
    const rows = (v.rows || []).map(r => barRow(r.lab, r.h, r.a, r.max)).join('');
    const tag = v.kind === 'tempo' && v.tag ? `<p class="pc-attr">${esc(v.tag)}${v.low === 'h' ? ' · 主队一侧' : v.low === 'a' ? ' · 客队一侧' : ''}</p>` : '';
    const mark = v.kind === 'bars' ? `<p class="pc-attr">${v.mark === 'h' ? '主队控球多，但没打进去' : '客队控球多，但没打进去'}</p>` : tag;
    return rows + mark;
  }
  if (v.kind === 'lanes') {
    const pill = (lab, lane, on) => `<div class="pc-pill${on ? ' on' : ''}"><em>${esc(lab)}</em><b>${esc(lane || '—')}</b></div>`;
    return `<div class="pc-lanes">${pill('主攻', v.homeAtk, v.homeOn)}${pill('客队这边松', v.awayThin, v.homeOn)}${pill('客攻', v.awayAtk, v.awayOn)}${pill('主队这边松', v.homeThin, v.awayOn)}</div>`;
  }
  if (v.kind === 'segs') {
    if (v.fallback) {
      return `<div class="pc-fallback"><span>上半领先</span><b>主 ${esc(v.homeLead)}%</b><b>客 ${esc(v.awayLead)}%</b><em>分钟不够，改看上半场</em></div>`;
    }
    return goalDist(v.home, v.away, v.homeN, v.awayN);
  }
  if (v.kind === 'ratios') {
    const row = (lab, rate, on) => {
      const side = lab === '主' ? ' h' : lab === '客' ? ' a' : '';
      if (!rate) return `<div class="line"><span>${lab}</span><div class="bar${side}"></div><em>—</em></div>`;
      return `<div class="line${on ? ' on' : ''}"><span>${lab}</span><div class="bar${side}"><b style="width:${pctWidth(rate.pct, 100)}%"></b></div><em>${esc(rate.pct)}%</em></div>`;
    };
    const oneSide = !!(v.home && !v.away) || !!(v.away && !v.home);
    const peer = oneSide ? '<div class="line peer"><span>常见</span><div class="bar"><b style="width:50%"></b></div><em>一半</em></div>' : '';
    const via = (v.home && v.home.via === 'half') || (v.away && v.away.via === 'half')
      ? '<p class="pc-attr">分钟不够，用上半场落后来比</p>' : '';
    return `<div class="pc-rest">${row('主', v.home, v.focus === 'h')}${row('客', v.away, v.focus === 'a')}${peer}</div>${via}`;
  }
  if (v.kind === 'cores') {
    const people = namedPeople(c).slice(0, 2).map(p => {
      const who = personZh(p.who);
      const shot = require('./logo-proxy').headshotSources(p.image, p.nameEn || p.who);
      const face = shot.src
        ? `<span class="pc-av"><img src="${esc(shot.src)}" alt="" loading="lazy"${shot.alt ? ` data-alt="${esc(shot.alt)}"` : ''} onerror="if(!this.dataset.tried&&this.dataset.alt){this.dataset.tried=1;this.src=this.dataset.alt;return;}this.remove()" /></span>`
        : '';
      const edge = p.matched && shot.src ? ' is-out' : '';
      const note = p.why || `${p.lane || '这一路'} · ${p.matched ? '和常走的路对得上' : '位置对不上这条路'}`;
      return `<div class="pc-lane${edge}">${face}<div><b>${esc(who)}</b><em>${esc(note)}</em></div></div>`;
    }).join('');
    return people || '<p class="pc-plain">没有对得上的缺阵球员。</p>';
  }
  if (v.kind === 'yr') {
    const box = (lab, y, r) => `<div class="box"><em>${esc(lab)}</em><span class="y">黄 ${esc(fmtNum(y))}</span><span class="r">红 ${esc(fmtNum(r))}</span></div>`;
    return `<div class="pc-yr">${box('主', v.hy, v.hr)}${box('客', v.ay, v.ar)}</div>`;
  }
  if (v.kind === 'saves') {
    return `<div class="pc-saves"><b>${esc(fmtNum(v.home))}</b><span>主扑救</span><b>${esc(fmtNum(v.away))}</b><span>客扑救</span></div>`;
  }
  return `<p class="pc-plain">${esc(c.effect || '')}</p>`;
}

function renderOne(c) {
  const weak = c.id === 'keeper' ? ' is-weak' : '';
  const gold = c.id === 'corridor' ? ' is-gold' : '';
  const markets = (c.markets || []).filter(Boolean).join('、') || '—';
  const title = SHORT[c.id] || c.name;
  const sub = c.sub || SUB[c.id] || '';
  const say = applyPersonZh(c.say || halfSentence(c), namedPeople(c));
  return `<article class="pc-card${weak}${gold}" data-id="${esc(c.id)}">
    <header class="pc-hd"><div class="ttl"><b>${esc(title)}</b>${sub ? `<small class="pc-sub">${esc(sub)}</small>` : ''}</div></header>
    <div class="pc-vis">${visual(c)}</div>
    <p class="pc-foot"><span>影响：${esc(markets)}</span> ${esc(say)}</p>
  </article>`;
}

function bundleOf(list, deferred) {
  const byId = {};
  for (const c of list || []) if (c && c.id) byId[c.id] = c;
  const showCard = (c) => c && c.fired && !HIDDEN_WAVE.has(c.id) && !(c.id === 'lanecore' && !namedPeople(c).length);
  const take = (ids) => ids.map(id => byId[id]).filter(showCard).map(renderOne).join('');
  const idle = (list || []).filter(c => c && !c.omitIdle && !HIDDEN_WAVE.has(c.id) && !showCard(c)).map(c => SHORT[c.id] || c.name);
  const later = (deferred || []).map(d => d && d.name).filter(Boolean);
  const idleLine = idle.length ? `<p class="pc-idle">样本不够，先不画：${idle.map(esc).join('、')}</p>` : '';
  const deferLine = later.length ? `<p class="pc-idle">先不看：${later.map(esc).join('、')}（没有稳定样本）</p>` : '';
  return {
    head: take(GROUP.head),
    corridor: take(GROUP.corridor),
    grid: take(GROUP.grid),
    later: take(GROUP.later),
    foot: idleLine + deferLine,
  };
}

function stack(html) {
  return html ? `<div class="pc-stack">${html}</div>` : '';
}

function renderBundle(components, opts) {
  const pack = opts && opts.pack;
  const deferred = (opts && opts.deferred) || (pack && pack.deferred) || [];
  return bundleOf(components || [], deferred);
}

function renderCards(components, opts) {
  const skin = opts && opts.skin === 'sm' ? 'sm' : 'dqd';
  const pack = opts && opts.pack;
  const parts = renderBundle(components, opts);
  const grid = parts.grid ? `<div class="pc-grid">${parts.grid}</div>` : '';
  const body = `${stack(parts.head)}${stack(parts.corridor)}${grid}${stack(parts.later)}${parts.foot}`;
  if (!components || !components.length) {
    if (skin === 'sm') return '<section class="sm-kit sm-logic"><h3>推导组件</h3><p class="sm-empty">和预测页同一套。预测简报出来后会出现在这里。</p></section>';
    return '<section class="pr-sec pr-components"><h3>推导组件</h3><div class="pr-empty-note">这场还没有推导组件。刷新报告后会补上。</div></section>';
  }
  const sum = `<p class="pc-sum">${esc(summaryLine(pack))}</p>`;
  if (skin === 'sm') {
    return `<section class="sm-kit sm-logic"><div class="sm-kit-hd"><h3>推导组件</h3><small>与预测页同一套</small></div>${sum}${body}</section>`;
  }
  return `<section class="pr-sec pr-components"><h3>推导组件</h3>${sum}${body}</section>`;
}

module.exports = {
  buildPack,
  finish,
  attachDivergence,
  nudgeOddsEdge,
  renderCards,
  renderBundle,
  summaryLine,
  PICK,
};
