/**
 * Match-detail predict tab, aligned with the kit's prediction modules:
 * model 1X2 cards, odds table, handicap table, O2.5, paired heat, calib line.
 * Still omits evidence bullet farms, trigger chips, coverage tags, and pipeline chips.
 */
'use strict';

const heatPitch = require('./heat-pitch');
const { wdlProbs } = require('./strength-calib');

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

function rqTable(oddsEdge, market) {
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
  return tableHtml(`让球胜平负 · ${lineDesc(rq.line)}`, rows)
    + '<p class="pr-tip">让胜、让平、让负用校准后的进球估算，再和让球盘的去水隐含比。</p>';
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

function ouBlock(oddsEdge) {
  const exp = oddsEdge && oddsEdge.exp;
  const over = oddsEdge && oddsEdge.over25;
  if (!exp || over == null || !Number.isFinite(Number(over))) {
    return '<div class="pr-empty-note">近期进球不够，大小球先空着。</div>';
  }
  const tot = Number(exp.expH) + Number(exp.expA);
  const p = Math.round(Number(over) * 100);
  const pick = p >= 50 ? '大球' : '小球';
  return `<div class="pr-ou">
    <div class="pr-ou-ring" style="--p:${p}"><div class="inner"><div class="v">${esc(pick)}</div><div class="s">O2.5</div></div></div>
    <div class="pr-ou-meta">
      <div class="row"><span>大球概率</span><b>${p}%</b></div>
      <div class="row"><span>期望进球 主/客</span><b>${esc(fmt1(exp.expH))} / ${esc(fmt1(exp.expA))}</b></div>
      <div class="row"><span>期望总球</span><b>${esc(Number.isFinite(tot) ? tot.toFixed(1) : '—')}</b></div>
      <div class="row"><span>超过两个球</span><b>${p}%</b></div>
    </div>
  </div>
  <p class="pr-tip">大小球用校准后的进球估计。超过两个球的比例来自两边进球相加，不是盘口原话。</p>`;
}

function shareText(heatSide) {
  const lcr = heatSide && heatSide.lcr;
  if (!lcr) return '';
  const pctN = v => Math.round((Number(v) || 0) * 100);
  return `左${pctN(lcr.left)}% 中${pctN(lcr.central)}% 右${pctN(lcr.right)}%`;
}

function heatRead(heat, homeName, awayName) {
  if (!heat || !heat.available) return '';
  const bits = [];
  const ha = shareText(heat.homeAttack);
  const ad = shareText(heat.awayDefend);
  const aa = shareText(heat.awayAttack);
  const hd = shareText(heat.homeDefend);
  if (ha) bits.push(`${homeName}进攻 ${ha}`);
  if (ad) bits.push(`${awayName}失守 ${ad}`);
  if (aa) bits.push(`${awayName}进攻 ${aa}`);
  if (hd) bits.push(`${homeName}失守 ${hd}`);
  if (!bits.length) return '';
  return `<p class="pr-heat-read">${esc(bits.join(' · '))}</p>`;
}

function renderPredictSurface({ home, away, concl, calib, heat, oddsEdge, market } = {}) {
  const homeName = home || '主队';
  const awayName = away || '客队';
  const lines = calibLines(calib, homeName, awayName);
  const model = modelProbs(oddsEdge);
  const arrow = lines.arrow ? `<p class="pr-calib-line">${esc(lines.arrow)}</p>` : '';
  const note = lines.note ? `<p class="pr-vernacular">${esc(lines.note)}</p>` : '';
  const heatBlock = heatPitch.renderFullPitchSvg(heat, { home: homeName, away: awayName });
  const showHeat = !heat || heat.checked || heat.available || heat.note;
  return `<div class="pr-brief pr-surface">
    <div class="pr-brief-hd"><b>赛前预测</b><span>胜平负 · 让球 · 大小球</span></div>
    <section class="pr-sec pr-wdw">
      <h3>① 胜平负 · 模型概率</h3>
      <p class="sub">用校准后的场均进球估算胜、平、负，再和盘口对照。</p>
      ${probCards(model)}
      ${confRing(concl || {}, model, calib)}
      ${stanceLine(concl || {})}
      ${arrow}
      ${note}
      ${wdlTable(model, market)}
      ${rqTable(oddsEdge, market)}
    </section>
    <section class="pr-sec pr-ou-sec">
      <h3>② 大小球（O2.5）</h3>
      <p class="sub">校准后的期望进球，看两边合计会不会超过两个球。</p>
      ${ouBlock(oddsEdge)}
    </section>
    ${showHeat ? `<section class="pr-sec pr-heat">
      <h3>攻防热区</h3>
      <p class="sub">${esc(homeName)}进攻对${esc(awayName)}失守，${esc(awayName)}进攻对${esc(homeName)}失守。近况落点，不是本场实时。</p>
      <div class="pr-heat-hd">
        <span class="pr-heat-caps"><i class="a"></i>${esc(homeName)}<i class="b"></i>${esc(awayName)}</span>
      </div>
      ${heatBlock}
      ${heatRead(heat, homeName, awayName)}
    </section>` : ''}
    <p class="pr-disclaimer">不编造伤停与未发生新闻。以上帮助看懂这场比赛，不是购彩建议。</p>
  </div>`;
}

module.exports = {
  renderPredictSurface,
  calibLines,
  modelProbs,
  PICK,
  HHAD,
};
