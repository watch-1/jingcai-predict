/**
 * Consumer predict-tab surface: short stance, strength line, handicap edge, heat.
 * No comparison bullet lists, trigger chips, coverage tags, or pipeline chips.
 */
'use strict';

const heatPitch = require('./heat-pitch');

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

function fmt1(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toFixed(1);
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

function rqHtml(oddsEdge) {
  const rq = oddsEdge && oddsEdge.rq;
  if (!rq || !rq.rows || !rq.rows.length) return '';
  const rows = rq.rows.map(r => {
    const d = Number(r.deltaPp);
    const sign = d > 0 ? '+' : '';
    const cls = d >= 5 ? 'up' : d <= -5 ? 'down' : '';
    return `<div class="pr-rq-row">
      <span>${esc(r.lab)}</span>
      <b>模型 ${esc(pct(r.model))}</b>
      <span>盘口 ${esc(pct(r.fair))}</span>
      <em class="${cls}">${esc(sign + Math.round(d))}</em>
    </div>`;
  }).join('');
  return `<div class="pr-rq"><div class="pr-rq-hd">让球 · ${esc(lineDesc(rq.line))}</div>${rows}</div>`;
}

function hadEdgeHtml(value) {
  const items = value && value.items;
  if (!items || !items.length) return '';
  const lean = items.find(x => x && x.isLean && x.our != null && x.fair != null);
  if (!lean) return '';
  const d = ((lean.edge != null ? lean.edge : lean.our - lean.fair) * 100);
  const sign = d > 0 ? '+' : '';
  const lab = PICK[lean.side] || '';
  return `<p class="pr-had-edge">胜平负「${esc(lab)}」：模型 ${esc(pct(lean.our))}，盘口隐含 ${esc(pct(lean.fair))}，差 ${esc(sign + Math.round(d))} 个百分点。</p>`;
}

function o25Html(oddsEdge) {
  if (!oddsEdge || oddsEdge.over25 == null || !oddsEdge.exp) return '';
  const tot = Number(oddsEdge.exp.expH) + Number(oddsEdge.exp.expA);
  if (!Number.isFinite(tot)) return '';
  const p = Math.round(Number(oddsEdge.over25) * 100);
  return `<p class="pr-o25">大小球：按校正后的进球算，两边合计大约 ${tot.toFixed(1)} 个，超过两个球大约 ${p}%。</p>`;
}

function impliedLine(market) {
  const p = market && (market.p || (market.facts && market.facts.impliedHad));
  if (!p || p.h == null) return '';
  return `<p class="pr-mkt">盘口隐含（发生概率）：主胜 ${esc(pct(p.h))} · 平局 ${esc(pct(p.d))} · 客胜 ${esc(pct(p.a))}。这和上面的信心不是同一件事。</p>`;
}

function stanceHtml(concl, market) {
  const mode = (concl && concl.speakMode) || 'abstain';
  const pick = (concl && (concl.pickText || PICK[concl.lean])) || '—';
  const conf = concl && concl.conf != null ? pct(concl.conf) : '—';
  const lvl = (concl && concl.lvl && concl.lvl[1]) || '';
  if (mode === 'align') {
    const mkt = concl.marketLean ? PICK[concl.marketLean] : '';
    return `<h4>观望说明</h4>
      <div class="pr-stance">
        <div class="pr-stance-pick">与盘口一致，不额外表态</div>
        <p class="pr-stance-note">${mkt ? `盘口更偏向「${esc(mkt)}」。` : ''}模型这条有多稳：信心 ${esc(conf)}，这次不单独加码。</p>
        ${impliedLine(market)}
      </div>`;
  }
  if (mode === 'abstain') {
    return `<h4>观望说明</h4>
      <div class="pr-stance">
        <div class="pr-stance-pick">信息不足，不额外表态</div>
        <p class="pr-stance-note">现有完场和盘口还撑不起一条单独判断。信心 ${esc(conf)} 只说明模型有多不确定。</p>
        ${impliedLine(market)}
      </div>`;
  }
  return `<h4>额外表态</h4>
    <div class="pr-stance">
      <div class="pr-stance-pick">首选 <b>${esc(pick)}</b></div>
      <div class="pr-stance-conf">信心 ${esc(conf)}${lvl ? ` · ${esc(lvl)}` : ''}</div>
      <p class="pr-stance-note">信心是这条判断有多稳，不是「${esc(pick)}」会发生的概率。</p>
      ${impliedLine(market)}
    </div>`;
}

function renderPredictSurface({ home, away, concl, calib, heat, oddsEdge, market } = {}) {
  const homeName = home || '主队';
  const awayName = away || '客队';
  const lines = calibLines(calib, homeName, awayName);
  const arrow = lines.arrow ? `<p class="pr-calib-line">${esc(lines.arrow)}</p>` : '';
  const note = lines.note ? `<p class="pr-vernacular">${esc(lines.note)}</p>` : '';
  const heatBlock = heatPitch.renderFullPitchSvg(heat, { home: homeName, away: awayName });
  const showHeat = heat && (heat.available || heat.checked);
  return `<div class="pr-brief pr-surface">
    <div class="pr-brief-hd"><b>赛前预测</b><span>综合分析</span></div>
    <section class="pr-sec pr-concl">
      ${stanceHtml(concl || {}, market)}
      ${arrow}
      ${note}
      ${hadEdgeHtml(concl && concl.value)}
      ${rqHtml(oddsEdge)}
      ${o25Html(oddsEdge)}
    </section>
    ${showHeat ? `<section class="pr-sec pr-heat">
      <div class="pr-heat-hd"><b>两队怎么打，哪儿不好打</b>
        <span class="pr-heat-caps"><i class="a"></i>${esc(homeName)}<i class="b"></i>${esc(awayName)}</span>
      </div>
      ${heatBlock}
    </section>` : ''}
    <p class="pr-disclaimer">不编造伤停与未发生新闻。以上帮助看懂这场比赛，不是购彩建议。</p>
  </div>`;
}

module.exports = {
  renderPredictSurface,
  calibLines,
  PICK,
  HHAD,
};
