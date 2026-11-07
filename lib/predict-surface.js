/**
 * Match-detail predict tab, aligned with the kit's prediction modules:
 * model 1X2 cards, odds table, handicap table, O2.5, paired heat, calib line.
 * Still omits evidence bullet farms, trigger chips, coverage tags, and pipeline chips.
 */
'use strict';

const heatPitch = require('./heat-pitch');
const { corridorSoftNote } = require('./corridor-matchup');
const { wdlProbs } = require('./strength-calib');
const predictComponents = require('./predict-components');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(v, d = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return (n * 100).toFixed(d) + '%';
}

const PICK = { h: '主胜', d: '平局', a: '客胜' };
const HHAD = { h: '让胜', d: '让平', a: '让负' };
const EDGE_PP = 5;

function fmt1(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toFixed(1);
}

function fmtOdd(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 1) return '—';
  return n.toFixed(2);
}

function fmtEdge(pp) {
  const n = Number(pp);
  if (!Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + 'pp';
}

function calibLines(calib, homeName, awayName) {
  if (!calib || !calib.ok) return { arrow: '', note: '' };
  const bits = [];
  const one = (name, side) => {
    if (!side || side.rawGf == null || side.adjGf == null) return;
    if (Math.abs(side.rawGf - side.adjGf) < 0.05) return;
    bits.push(`${name}场均 ${fmt1(side.rawGf)} → 校准 ${fmt1(side.adjGf)}`);
  };
  one(homeName || '主队', calib.home);
  one(awayName || '客队', calib.away);
  return { arrow: bits.join('；'), note: calib.note || '' };
}

function lineDesc(line) {
  const n = Number(line);
  if (!Number.isFinite(n)) return '让球';
  const abs = Math.abs(n);
  const shown = Number.isInteger(abs) ? String(abs) : String(Math.round(abs * 100) / 100);
  return n < 0 ? `主队让 ${shown} 球` : n > 0 ? `主队受让 ${shown} 球` : '让球为平手';
}

function modelProbs(oddsEdge) {
  if (oddsEdge && oddsEdge.wdl && oddsEdge.wdl.h != null) return oddsEdge.wdl;
  const exp = oddsEdge && oddsEdge.exp;
  if (!exp || exp.expH == null || exp.expA == null) return null;
  return wdlProbs(exp.expH, exp.expA);
}

function argmax(p) {
  if (!p) return null;
  return ['h', 'd', 'a'].reduce((best, k) => (p[k] > p[best] ? k : best), 'h');
}

function hadOdds(market) {
  if (!market) return null;
  return market.had || (market.facts && market.facts.had) || null;
}

function hhadOdds(market) {
  if (!market) return null;
  return market.hhad || (market.facts && market.facts.hhad) || null;
}

function sampleCount(side) {
  if (!side) return null;
  const n = side.n != null ? side.n : side.nOpp;
  return Number.isFinite(Number(n)) ? Number(n) : null;
}

function overroundPp(odds) {
  if (!odds) return null;
  const bits = ['h', 'd', 'a'].map(k => Number(odds[k])).filter(n => n > 1);
  if (bits.length < 3) return null;
  const sum = bits.reduce((s, n) => s + 1 / n, 0);
  return (sum - 1) * 100;
}

function fairOdds(p) {
  if (!p) return null;
  const one = (v) => (v > 0.02 ? (1 / v).toFixed(2) : '—');
  return `${one(p.h)} / ${one(p.d)} / ${one(p.a)}`;
}

function edgeClass(pp) {
  const n = Number(pp);
  if (!Number.isFinite(n)) return '';
  if (n >= EDGE_PP) return ' value-yes';
  if (n <= -EDGE_PP) return ' value-no';
  return '';
}

function tableHtml(title, rows) {
  const body = rows.map(r => {
    const flag = Number(r.deltaPp) >= EDGE_PP ? '<i class="val-tag">有利</i>' : '';
    return `<div class="vr${edgeClass(r.deltaPp)}">
      <span>${esc(r.lab)}${flag}</span>
      <span>${esc(r.odd)}</span>
      <span>${esc(r.model)}</span>
      <span>${esc(r.fair)}</span>
      <span>${esc(r.edge)}</span>
    </div>`;
  }).join('');
  return `<div class="pr-market-block">
    <div class="pr-market-h">${esc(title)}</div>
    <div class="pr-value-table">
      <div class="vh"><span>方向</span><span>赔率</span><span>模型%</span><span>隐含%</span><span>相差</span></div>
      ${body}
    </div>
  </div>`;
}

function wdlTable(model, market) {
  const odds = hadOdds(market);
  const fair = market && market.p;
  if (!model && !(odds && odds.h) && !(fair && fair.h != null)) {
    return '<div class="pr-empty-note">本场没有胜平负赔率，对照表先空着。</div>';
  }
  const rows = ['h', 'd', 'a'].map(k => {
    const m = model && model[k];
    const f = fair && fair[k];
    const delta = (m != null && f != null) ? (m - f) * 100 : null;
    return {
      lab: PICK[k],
      odd: fmtOdd(odds && odds[k]),
      model: m != null ? pct(m) : '—',
      fair: f != null ? pct(f) : '—',
      deltaPp: delta,
      edge: fmtEdge(delta),
    };
  });
  const juice = overroundPp(odds);
  const tipBits = [];
  if (juice != null) tipBits.push(`本场水位差大约 ${juice.toFixed(1)}pp`);
  if (model) tipBits.push(`模型公允水位 主/平/客 ${fairOdds(model)}`);
  tipBits.push(`模型比去水隐含高 ${EDGE_PP} 个百分点以上，这一行标「有利」`);
  return tableHtml('胜平负', rows) + `<p class="pr-tip">${esc(tipBits.join(' · '))}</p>`;
}

function rqTable(oddsEdge, market, softNote) {
  const rq = oddsEdge && oddsEdge.rq;
  const odds = hhadOdds(market);
  if (!rq || !rq.rows || !rq.rows.length) {
    return '<div class="pr-empty-note">本场没有让球胜平负，对照表先空着。</div>';
  }
  const rows = rq.rows.map(r => {
    const key = r.k;
    const odd = r.odd != null ? r.odd : (odds && key ? odds[key] : null);
    return {
      lab: r.lab || HHAD[key] || '',
      odd: fmtOdd(odd),
      model: r.model != null ? pct(r.model) : '—',
      fair: r.fair != null ? pct(r.fair) : '—',
      deltaPp: r.deltaPp,
      edge: fmtEdge(r.deltaPp),
    };
  });
  const soft = softNote ? `<p class="pr-tip pr-soft">${esc(softNote)}</p>` : '';
  return tableHtml(`让球胜平负 · ${lineDesc(rq.line)}`, rows)
    + '<p class="pr-tip">让胜、让平、让负用校准后的进球估算，再和让球盘的去水隐含比。</p>' + soft;
}

function probCards(model) {
  if (!model) {
    return '<div class="pr-empty-note">近期进球不够，算不出胜平负模型概率。</div>';
  }
  const pick = argmax(model);
  return `<div class="pr-1x2">
    <div class="cell${pick === 'h' ? ' win' : ''}"><div class="lab">主胜 · 模型概率</div><div class="pct">${esc(pct(model.h))}</div></div>
    <div class="cell${pick === 'd' ? ' win' : ''}"><div class="lab">平局 · 模型概率</div><div class="pct">${esc(pct(model.d))}</div></div>
    <div class="cell${pick === 'a' ? ' win' : ''}"><div class="lab">客胜 · 模型概率</div><div class="pct">${esc(pct(model.a))}</div></div>
  </div>`;
}

function confRing(concl, model, calib) {
  const conf = concl && concl.conf != null ? Math.round(Number(concl.conf) * 100) : null;
  const pick = argmax(model);
  const pickZh = pick ? PICK[pick] : ((concl && concl.pickText) || '—');
  const stancePick = (concl && concl.pickText) || pickZh;
  const hs = sampleCount(calib && calib.home);
  const as = sampleCount(calib && calib.away);
  const sample = (hs != null || as != null) ? `近况样本主${hs == null ? '—' : hs}/客${as == null ? '—' : as}场` : '';
  const shown = conf == null || !Number.isFinite(conf) ? '—' : `${conf}%`;
  return `<div class="pr-conf">
    <div class="pr-conf-ring" style="--p:${Number.isFinite(conf) ? conf : 0}"><span>${esc(shown)}</span></div>
    <div class="txt"><b>倾向：${esc(pickZh)}</b><br/>
      <span class="pr-conf-lab">信心 / 样本强度</span> ${esc(shown)}（不是第二种胜率）${sample ? ' · ' + esc(sample) : ''}
    </div>
  </div>
  <p class="pr-tip">圆环「信心」不是胜率。三格才是模型胜平负概率。信心是这条判断有多稳，不是「${esc(stancePick)}」会发生的概率。</p>`;
}

function stanceLine(concl) {
  const mode = (concl && concl.speakMode) || '';
  const pick = (concl && (concl.pickText || PICK[concl.lean])) || '';
  const conf = concl && concl.conf != null ? pct(concl.conf) : '';
  if (mode === 'align') return '<p class="pr-stance-line">额外表态：与盘口一致，不单独加码。</p>';
  if (mode === 'abstain') return '<p class="pr-stance-line">额外表态：信息不足，不单独加码。</p>';
  if (!pick) return '';
  return `<p class="pr-stance-line">额外表态：首选 ${esc(pick)}${conf ? ` · 信心 ${esc(conf)}` : ''}</p>`;
}

function ouBlock(oddsEdge, extraNote) {
  const exp = oddsEdge && oddsEdge.exp;
  const over = oddsEdge && oddsEdge.over25;
  if (!exp || over == null || !Number.isFinite(Number(over))) {
    return '<div class="pr-empty-note">近期进球不够，大小球先空着。</div>';
  }
  const tot = Number(exp.expH) + Number(exp.expA);
  const p = Math.round(Number(over) * 100);
  const pick = p >= 50 ? '大球' : '小球';
  const soft = extraNote ? `<p class="pr-tip pr-soft">${esc(extraNote)}</p>` : '';
  return `<div class="pr-ou">
    <div class="pr-ou-ring" style="--p:${p}"><div class="inner"><div class="v">${esc(pick)}</div><div class="s">O2.5</div></div></div>
    <div class="pr-ou-meta">
      <div class="row"><span>大球概率</span><b>${p}%</b></div>
      <div class="row"><span>期望进球 主/客</span><b>${esc(fmt1(exp.expH))} / ${esc(fmt1(exp.expA))}</b></div>
      <div class="row"><span>期望总球</span><b>${esc(Number.isFinite(tot) ? tot.toFixed(1) : '—')}</b></div>
      <div class="row"><span>超过两个球</span><b>${p}%</b></div>
    </div>
  </div>
  <p class="pr-tip">大小球用校准后的进球估计。超过两个球的比例来自两边进球相加，不是盘口原话。</p>${soft}`;
}

function lanePossessionLine(heatSide) {
  const lcr = heatSide && heatSide.lcr;
  if (!lcr) return '';
  const pctN = v => Math.round((Number(v) || 0) * 100);
  return `左路 ${pctN(lcr.left)}% · 中路 ${pctN(lcr.central)}% · 右路 ${pctN(lcr.right)}%`;
}

function initial(name) {
  const t = String(name || '').trim();
  if (!t) return '';
  const ch = [...t][0];
  return ch ? ch.toUpperCase() : '';
}

function avatarSrc(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  const host = u.hostname.toLowerCase();
  if (host !== 'cdn.sportmonks.com' && host !== 'media.sportmonks.com') return '';
  if (!u.pathname.startsWith('/images/') || !/\.(png|jpe?g|webp)$/i.test(u.pathname)) return '';
  return '/api/logo?url=' + encodeURIComponent(u.toString());
}

function personImg(src, name) {
  const letter = esc(initial(name));
  const proxied = avatarSrc(src);
  const img = proxied
    ? `<img src="${esc(proxied)}" alt="" loading="lazy" onerror="this.remove()" />`
    : '';
  return `<span class="av">${img}<i class="ph">${letter}</i></span>`;
}

function htftGrid(model, half) {
  if (!model || model.h == null || model.d == null || model.a == null) return null;
  const home = half && half.home;
  const away = half && half.away;
  if (!home || !away || home.n < 2 || away.n < 2) return null;
  const htRaw = {
    H: home.lead / home.n,
    A: away.lead / away.n,
  };
  htRaw.D = Math.max(0, 1 - htRaw.H - htRaw.A);
  const htSum = htRaw.H + htRaw.D + htRaw.A;
  if (!(htSum > 0)) return null;
  const htP = { H: htRaw.H / htSum, D: htRaw.D / htSum, A: htRaw.A / htSum };
  const ftP = { H: Number(model.h), D: Number(model.d), A: Number(model.a) };
  if (![ftP.H, ftP.D, ftP.A].every(n => Number.isFinite(n) && n >= 0)) return null;
  const cells = {};
  let sum = 0;
  for (const ht of ['H', 'D', 'A']) {
    for (const ft of ['H', 'D', 'A']) {
      let p = htP[ht] * ftP[ft];
      if (ht === ft) p *= 1.25;
      if ((ht === 'H' && ft === 'A') || (ht === 'A' && ft === 'H')) p *= 0.7;
      cells[ht + ft] = p;
      sum += p;
    }
  }
  if (!(sum > 0)) return null;
  let pick = 'DD';
  let best = -1;
  for (const k of Object.keys(cells)) {
    cells[k] /= sum;
    if (cells[k] > best) { best = cells[k]; pick = k; }
  }
  return { cells, pick };
}

const HTFT_LAB = { H: '主', D: '平', A: '客' };

function htftHtml(model, squad) {
  const grid = htftGrid(model, squad && squad.half);
  if (!grid) {
    const why = !model
      ? '还没有胜平负模型，半全场先空着。'
      : '近况半场比分不够，先不排九宫。';
    return `<section class="pr-sec pr-htft-sec"><h3>半全场</h3><div class="pr-empty-note">${esc(why)}</div></section>`;
  }
  const top = grid.cells[grid.pick] || 0;
  let html = '<div class="pr-htft"><div></div><div class="hd">主</div><div class="hd">平</div><div class="hd">客</div>';
  for (const hr of ['H', 'D', 'A']) {
    html += `<div class="lab">${HTFT_LAB[hr]}</div>`;
    for (const fr of ['H', 'D', 'A']) {
      const key = hr + fr;
      const v = grid.cells[key] || 0;
      const mark = key === grid.pick ? ' pick' : '';
      const intensity = top > 0 ? v / top : 0;
      const bg = `rgba(22,163,74,${(0.05 + intensity * 0.22).toFixed(2)})`;
      html += `<div class="ht${mark}" style="background:${bg}"><div class="k">${HTFT_LAB[hr]}/${HTFT_LAB[fr]}</div><div class="p">${Math.round(v * 100)}%</div></div>`;
    }
  }
  html += '</div>';
  const pickLab = `${HTFT_LAB[grid.pick[0]]}/${HTFT_LAB[grid.pick[1]]}`;
  return `<section class="pr-sec pr-htft-sec"><h3>半全场</h3><p class="sub">行是半场，列是全场。首选 ${esc(pickLab)}。只在有近况半场比分和全场模型时才排。</p>${html}</section>`;
}

function showPerson(name) {
  const raw = String(name || '').trim();
  try {
    const zh = require('./league-tables').playerZh(raw);
    if (zh) return zh;
  } catch { /* keep source */ }
  return raw || '球员';
}

function showTeam(name, fallback) {
  const raw = String(name || '').trim();
  if (!raw) return fallback;
  try {
    const zh = require('./league-tables').teamZh(raw);
    if (zh) return zh;
  } catch { /* keep source */ }
  return raw;
}

function showReason(s) {
  const raw = String((s && (s.reason || s.type)) || '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  try {
    const zh = require('./squad-source').reasonZh(raw);
    if (zh) return zh;
  } catch { /* keep source */ }
  return raw;
}

function sideChips(list, empty) {
  if (!list || !list.length) return `<div class="pr-empty-note">${esc(empty)}</div>`;
  return `<div class="pr-side-chips">${list.map(s => {
    const nm = showPerson(s.name);
    return `<span class="pr-side${s.core ? ' core' : ''}">${personImg(s.image, nm)}<b>${esc(nm)}</b><span class="tag">${esc(showReason(s))}</span></span>`;
  }).join('')}</div>`;
}

function coreCards(list) {
  if (!list || !list.length) return '<div class="pr-empty-note">近况核心样本不足。</div>';
  return `<div class="pr-cores">${list.slice(0, 4).map(c => {
    const rating = c.avg_rating == null ? '—' : c.avg_rating;
    const nm = showPerson(c.name);
    return `<div class="pr-core-card"><div class="who">${personImg(c.image, nm)}<span>${esc(nm)}</span></div><div class="stats">评分 ${esc(rating)} · 进${esc(c.goals || 0)} 助${esc(c.assists || 0)}<br/>射${esc(c.shots || 0)} 传${esc(c.passes || 0)} 抢${esc(c.tackles || 0)} · 样${esc(c.apps || 0)}场</div></div>`;
  }).join('')}</div>`;
}

function squadHtml(squad) {
  const s = squad || {};
  const side = s.sidelined || [];
  const home = side.filter(x => x.side === 'home');
  const away = side.filter(x => x.side === 'away');
  const cores = s.cores || {};
  const homeCores = cores.home || [];
  const awayCores = cores.away || [];
  const nothing = !home.length && !away.length && !homeCores.length && !awayCores.length;
  return `<section class="pr-sec pr-squad">
    <h3>伤停 / 核心</h3>
    <p class="sub">红边 = 近况核心，并且这场上不了。核心来自最近几场上场数据。</p>
    ${nothing
      ? `<div class="pr-empty-note">${esc(s.note || '伤停和近况核心暂时没有。')}</div>`
      : `<h4>主队伤停</h4>${sideChips(home, '主队这边暂无伤停。')}
         <h4>客队伤停</h4>${sideChips(away, '客队这边暂无伤停。')}
         <h4>主队近况核心</h4>${coreCards(homeCores)}
         <h4>客队近况核心</h4>${coreCards(awayCores)}`}
  </section>`;
}

function pitchAvatars(squad) {
  const s = squad || {};
  const cores = s.cores || {};
  let pick = null;
  try { pick = require('./squad-source').pickRoleCores; } catch { pick = null; }
  if (!pick) return { home: [], away: [] };
  const map = (rows, which) => pick(rows, s.sidelined || [], which).map(a => ({
    ...a,
    name: showPerson(a.name),
    side: which,
  }));
  return {
    home: map(cores.home || [], 'home'),
    away: map(cores.away || [], 'away'),
  };
}

function heatLegend() {
  return `<ul class="pr-heat-legend">
    <li><i class="atk"></i>粗线＝常走的进攻</li>
    <li><i class="band"></i>色带＝常被压</li>
    <li><i class="focus"></i>描边＝对位焦点</li>
  </ul>`;
}

function heatRead(heat, homeName, awayName) {
  if (!heat || !heat.checked) return '';
  const bits = [];
  const push4 = (side, label) => {
    if (side && side.available && lanePossessionLine(side)) bits.push(`${label} ${lanePossessionLine(side)}`);
  };
  push4(heat.homeAttack, `${homeName}进攻侧重`);
  push4(heat.awayDefend, `${awayName}防守压力`);
  push4(heat.awayAttack, `${awayName}进攻侧重`);
  push4(heat.homeDefend, `${homeName}防守压力`);
  if (!bits.length) return '';
  return `<p class="pr-heat-read">${esc(bits.join(' · '))}</p><p class="pr-tip">按近况球权分布</p>`;
}

function corridorWidget(corridor) {
  if (!corridor || !corridor.available) {
    return '<div class="pr-corridor-widget pr-empty-note">近况样本还不够，对位提示先空着。</div>';
  }
  const lines = (corridor.zh_lines || []).map(l => `<p class="pr-corridor-line">${esc(l)}</p>`).join('');
  return `<div class="pr-corridor-widget card-white">
    <p class="pr-corridor-hd">对位提示</p>
    <p class="pr-tip">进攻侧重 vs 防守空隙</p>
    ${lines}
  </div>`;
}

function goalClockSection(goalClock, homeName, awayName) {
  const h = goalClock && goalClock.home;
  const a = goalClock && goalClock.away;
  if (!h && !a) return '';
  if (!(h && h.n_fixtures) && !(a && a.n_fixtures)) return '';
  const order = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const segLine = (side) => {
    const n = side && Number(side.n_fixtures);
    if (!(n >= 4)) {
      return '<div class="pr-empty-note">这边进球分钟不够，不和对方放在一起比。</div>';
    }
    const s = side.segments || {};
    const bits = order.map(k => `${k}′ ${((Number(s[k]) || 0) / n).toFixed(1)}`).join(' · ');
    const cf = side.concede_first_index != null && Number.isFinite(side.concede_first_index)
      ? `近况里先丢球的场次约占 ${Math.round(side.concede_first_index * 100)}%`
      : '';
    return `<p class="pr-goal-seg">近 ${n} 场，数字是场均。${esc(bits)}</p>${cf ? `<p class="pr-tip">${esc(cf)}</p>` : ''}`;
  };
  return `<section class="pr-sec pr-goal-clock">
    <h3>近况进球时段</h3>
    <p class="sub">近况场均：该段进球数 ÷ 场次。不是本场会进几个。</p>
    <h4>${esc(homeName)}</h4>${segLine(h)}
    <h4>${esc(awayName)}</h4>${segLine(a)}
  </section>`;
}

function renderPredictSurface({ home, away, concl, calib, heat, oddsEdge, market, squad, corridor, goalClock, components } = {}) {
  const homeName = showTeam(home, '主队');
  const awayName = showTeam(away, '客队');
  const lines = calibLines(calib, homeName, awayName);
  const model = modelProbs(oddsEdge);
  const arrow = lines.arrow ? `<p class="pr-calib-line">${esc(lines.arrow)}</p>` : '';
  const note = lines.note ? `<p class="pr-vernacular">${esc(lines.note)}</p>` : '';
  let corridorView = corridor || null;
  if (heat && heat.available) {
    try { corridorView = require('./corridor-matchup').buildCorridorMatchup(heat, squad); } catch { /* keep stored */ }
  }
  const avatars = pitchAvatars(squad);
  const heatBlock = heatPitch.renderFullPitchSvg(heat, {
    home: homeName,
    away: awayName,
    corridor: corridorView,
    avatars,
  });
  const showAvatars = !!(heat && heat.available && ((avatars.home && avatars.home.length) || (avatars.away && avatars.away.length)));
  const soft = corridorSoftNote(corridorView, { homeName, awayName });
  const pack = components || (concl && concl.components) || null;
  const notes = (pack && pack.notes) || {};
  const ouNote = notes.ou || soft;
  const hcapNote = notes.hcap || soft;
  const wdlNote = notes.wdl ? `<p class="pr-tip pr-soft">${esc(notes.wdl)}</p>` : '';
  const parts = pack && pack.components && pack.components.length
    ? predictComponents.renderBundle(pack.components, { pack, deferred: pack.deferred })
    : null;
  const sum = pack ? `<p class="pc-sum">${esc(predictComponents.summaryLine(pack))}</p>` : '';
  const head = parts && parts.head ? `<div class="pc-stack">${parts.head}</div>` : '';
  const grid = parts && parts.grid ? `<div class="pc-grid">${parts.grid}</div>` : '';
  const later = parts && parts.later ? `<div class="pc-stack">${parts.later}</div>` : '';
  const foot = parts ? parts.foot : '';
  const tip = parts && parts.corridor
    ? parts.corridor
    : corridorWidget(corridorView);
  const clockFallback = parts ? '' : goalClockSection(goalClock, homeName, awayName);
  return `<div class="pr-brief pr-surface">
    <section class="pr-sec pr-conclusion">
      <h3>结论</h3>
      ${stanceLine(concl || {})}
      ${confRing(concl || {}, model, calib)}
      ${wdlNote}
      ${arrow}
      ${note}
      ${sum}
    </section>
    ${head}
    <section class="pr-sec pr-heat">
      <h3>近况攻防习惯</h3>
      <p class="sub">两边最近常从哪一路进攻，对方哪一路更容易被打穿。近况参考，非本场实时，也不是进球落点。</p>
      <div class="pr-heat-hd">
        <span class="pr-heat-caps"><i class="a"></i>${esc(homeName)}<i class="b"></i>${esc(awayName)}</span>
      </div>
      ${heat && heat.available ? heatLegend() : ''}
      ${heatBlock}
      ${showAvatars ? '<p class="pr-heat-foot">近况核心示意 · 非本场实时站位</p>' : ''}
      ${heatRead(heat, homeName, awayName)}
      ${tip}
    </section>
    ${grid}
    ${later}
    ${foot}
    <section class="pr-sec pr-wdw">
      <h3>胜平负 · 模型概率</h3>
      <p class="sub">用校准后的场均进球估算胜、平、负，再和盘口对照。</p>
      ${probCards(model)}
      ${wdlTable(model, market)}
      ${rqTable(oddsEdge, market, hcapNote)}
    </section>
    <section class="pr-sec pr-ou-sec">
      <h3>大小球（O2.5）</h3>
      <p class="sub">校准后的期望进球，看两边合计会不会超过两个球。上面的对照只做轻微校准。</p>
      ${ouBlock(oddsEdge, ouNote || '')}
    </section>
    ${htftHtml(model, squad)}
    ${squadHtml(squad)}
    ${clockFallback}
    <p class="pr-disclaimer">伤停和核心来自近期公开名单，临场以官方为准。没拉到的人不写成健康。以上帮助看懂这场比赛，不是购彩建议。</p>
  </div>`;
}

module.exports = {
  renderPredictSurface,
  calibLines,
  modelProbs,
  htftGrid,
  avatarSrc,
  PICK,
  HHAD,
};
