// Personal KB prediction: keyword/heuristic attributions + capped delta synthesis (no external RAG).
const { getPlatformBase } = require('./platform-base');

const INTERVENTION = {
  explain: { cap: 0, label: '仅解释' },
  light: { cap: 0.02, label: '轻度' },
  medium: { cap: 0.05, label: '中度' },
  strong: { cap: 0.08, label: '强度' },
};
const ABSOLUTE_CAP = 0.08;

const HOME_SIG = /主胜|主场优势|主队|让胜|主赢|主场|主队不败|主不败|home\s*win|主\s*\+/i;
const AWAY_SIG = /客胜|客场|客队|让负|客赢|客场虫|away\s*win|客\s*\+/i;
const DRAW_SIG = /平局|打平|平手|走盘|和局|双方平局|draw/i;

function tokenize(text) {
  const raw = String(text || '').toLowerCase();
  const latin = raw.match(/[a-z0-9]{2,}/g) || [];
  const cjk = raw.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...latin, ...cjk];
}

function overlapScore(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.sqrt(ta.size * tb.size);
}

function leanVotes(text) {
  const t = String(text || '');
  let h = 0; let d = 0; let a = 0;
  if (HOME_SIG.test(t)) h += 2;
  if (AWAY_SIG.test(t)) a += 2;
  if (DRAW_SIG.test(t)) d += 2;
  if (/看好.*主|支持.*主|倾向.*主/.test(t)) h += 1;
  if (/看好.*客|支持.*客|倾向.*客/.test(t)) a += 1;
  if (/看好.*平|倾向.*平/.test(t)) d += 1;
  const max = Math.max(h, d, a);
  if (max === 0) return null;
  if (h === max && h > d && h > a) return 'h';
  if (a === max && a > d && a > h) return 'a';
  if (d === max && d >= h && d >= a) return 'd';
  return null;
}

function snippet(text, n = 72) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

function analyzeItem(item, match, ctxText) {
  const combined = `${item.title}\n${item.body}`;
  const rel = Math.min(1, 0.35 + overlapScore(combined, ctxText) * 1.4);
  const lean = leanVotes(combined);
  let side = lean;
  if (!side) {
    const oh = overlapScore(item.body, match.home || '');
    const oa = overlapScore(item.body, match.away || '');
    if (oh > oa + 0.08) side = 'h';
    else if (oa > oh + 0.08) side = 'a';
  }
  return { lean: side, relevance: rel, combined };
}

function applyDeltas(base, deltas) {
  const out = {
    h: Math.max(0.001, base.h + (deltas.h || 0)),
    d: Math.max(0.001, base.d + (deltas.d || 0)),
    a: Math.max(0.001, base.a + (deltas.a || 0)),
  };
  const s = out.h + out.d + out.a;
  return { h: out.h / s, d: out.d / s, a: out.a / s };
}

function pickLabel(pool, k) {
  if (pool === 'hhad') return { h: '让胜', d: '让平', a: '让负' }[k] || k;
  return { h: '主胜', d: '平局', a: '客胜' }[k] || k;
}

function topOutcome(p) {
  const order = ['h', 'd', 'a'].sort((x, y) => p[y] - p[x]);
  return order[0];
}

/**
 * @param {object} match
 * @param {object[]} items with packName, title, body
 * @param {string} intervention
 */
function synthesizePersonal(match, items, intervention) {
  const iv = INTERVENTION[intervention] || INTERVENTION.medium;
  const plat = getPlatformBase(match);
  if (!plat) {
    return { ok: false, error: '该场暂无可用赔率基线，无法生成个人预测' };
  }
  const base = plat.base;
  const ctxText = `${match.home || ''} ${match.away || ''} ${match.league || ''} ${match.num || ''}`;
  const cap = Math.min(iv.cap, ABSOLUTE_CAP);
  const attributions = [];
  const agg = { h: 0, d: 0, a: 0 };

  for (const item of items) {
    const { lean, relevance, combined } = analyzeItem(item, match, ctxText);
    const rawMag = cap * relevance;
    const effect = { h: 0, d: 0, a: 0 };
    let note = '未识别明确赛果倾向，仅作上下文参考';
    if (lean) {
      effect[lean] += rawMag;
      note = `倾向「${pickLabel(plat.pool, lean)}」`;
      const opp = lean === 'h' ? 'a' : lean === 'a' ? 'h' : null;
      if (opp && rawMag > 0.004) effect[opp] -= rawMag * 0.35;
    } else if (relevance > 0.45) {
      effect.h += rawMag * 0.15;
      note = '与对阵相关，轻微均衡调整';
    }
    for (const k of ['h', 'd', 'a']) {
      agg[k] += effect[k];
      effect[k] = +effect[k].toFixed(4);
    }
    attributions.push({
      packName: item.packName,
      itemId: item.id,
      title: item.title,
      snippet: snippet(item.body),
      relevance: +relevance.toFixed(3),
      lean,
      effect,
      note,
    });
  }

  // Global cap per outcome
  for (const k of ['h', 'd', 'a']) {
    if (agg[k] > ABSOLUTE_CAP) agg[k] = ABSOLUTE_CAP;
    if (agg[k] < -ABSOLUTE_CAP) agg[k] = -ABSOLUTE_CAP;
  }

  const adjusted = intervention === 'explain'
    ? { ...base }
    : applyDeltas(base, agg);

  return {
    ok: true,
    matchId: String(match.id),
    home: match.home,
    away: match.away,
    pool: plat.pool,
    source: plat.source,
    intervention,
    interventionLabel: iv.label,
    absoluteCap: ABSOLUTE_CAP,
    base,
    adjusted,
    basePick: pickLabel(plat.pool, topOutcome(base)),
    adjustedPick: pickLabel(plat.pool, topOutcome(adjusted)),
    attributions,
    selection: { itemIds: items.map(i => i.id), count: items.length },
    disclaimerZh: '个人知识库内容为用户自行录入，未经核实，仅供参考，非购彩建议。',
  };
}

module.exports = {
  INTERVENTION,
  ABSOLUTE_CAP,
  synthesizePersonal,
  analyzeItem,
  applyDeltas,
};
