/**
 * Corridor (L/C/R possession) matchup from heat-pitch aggregates.
 * Heuristic only — not player-tracked territory.
 */
'use strict';

const LANES = ['left', 'central', 'right'];

function laneZh(key) {
  return ({ left: '左路', central: '中路', right: '右路' })[key] || '';
}

function lcrVec(side) {
  if (!side || !side.available) return null;
  const lcr = side.lcr;
  if (!lcr) return null;
  const a = Number(lcr.left);
  const b = Number(lcr.central);
  const c = Number(lcr.right);
  if (![a, b, c].every(Number.isFinite)) return null;
  return { left: a, central: b, right: c };
}

function dot(a, b) {
  let s = 0;
  for (const k of LANES) s += (a[k] || 0) * (b[k] || 0);
  return s;
}

function argmaxLane(vec) {
  let best = 'central';
  let v = -1;
  for (const k of LANES) {
    const x = vec[k] || 0;
    if (x > v) { v = x; best = k; }
  }
  return { lane: best, share: v };
}

function productRank(atk, def) {
  return LANES.map(k => ({ lane: k, score: (atk[k] || 0) * (def[k] || 0) }))
    .sort((a, b) => b.score - a.score || LANES.indexOf(a.lane) - LANES.indexOf(b.lane));
}

function argminLane(vec) {
  let worst = 'central';
  let v = 2;
  for (const k of LANES) {
    const x = vec[k] || 0;
    if (x < v) { v = x; worst = k; }
  }
  return { lane: worst, share: v };
}

/**
 * @param {object} heat — buildMatchHeat() output (with homeAttack, awayAttack, homeDefend, awayDefend)
 * @param {object} [squad] — ensureSquad pack (sidelined, cores optional)
 */
function buildCorridorMatchup(heat, squad) {
  const ha = heat && heat.homeAttack;
  const aa = heat && heat.awayAttack;
  const hd = heat && heat.homeDefend;
  const ad = heat && heat.awayDefend;
  const vHa = lcrVec(ha);
  const vAa = lcrVec(aa);
  const vHd = lcrVec(hd);
  const vAd = lcrVec(ad);
  const out = {
    available: false,
    home_attack_lane: ha && ha.dominant || null,
    home_attack_lane_zh: ha && ha.dominant_zh || '',
    away_attack_lane: aa && aa.dominant || null,
    away_attack_lane_zh: aa && aa.dominant_zh || '',
    overlap_home_atk_vs_away_def: null,
    overlap_away_atk_vs_home_def: null,
    away_defend_thin_lane: null,
    away_defend_thin_lane_zh: '',
    home_defend_thin_lane: null,
    home_defend_thin_lane_zh: '',
    mismatch_home_favors: null,
    mismatch_away_favors: null,
    heuristic: {
      home_core_sidelined: false,
      away_core_sidelined: false,
      home_lane_threat_weight: 1,
      away_lane_threat_weight: 1,
      home_lane_threat_note: '',
      away_lane_threat_note: '',
      label: 'heuristic',
    },
    focus_lanes: [],
    zh_lines: [],
  };
  if (!vHa || !vAd) return out;
  out.available = true;
  out.overlap_home_atk_vs_away_def = +dot(vHa, vAd).toFixed(3);
  if (vAa && vHd) {
    out.overlap_away_atk_vs_home_def = +dot(vAa, vHd).toFixed(3);
  }
  const atkH = argmaxLane(vHa);
  const defA = argminLane(vAd);
  out.away_defend_thin_lane = defA.lane;
  out.away_defend_thin_lane_zh = laneZh(defA.lane);
  out.mismatch_home_favors = atkH.lane === defA.lane
    ? { lane: atkH.lane, lane_zh: laneZh(atkH.lane), kind: 'thin_def', score: +(atkH.share - defA.share).toFixed(3) }
    : null;
  if (vAa && vHd) {
    const atkA = argmaxLane(vAa);
    const defH = argminLane(vHd);
    out.home_defend_thin_lane = defH.lane;
    out.home_defend_thin_lane_zh = laneZh(defH.lane);
    out.mismatch_away_favors = atkA.lane === defH.lane
      ? { lane: atkA.lane, lane_zh: laneZh(atkA.lane), kind: 'thin_def', score: +(atkA.share - defH.share).toFixed(3) }
      : null;
  }

  const side = squad || {};
  const sidelined = side.sidelined || [];
  const homeCoreOut = sidelined.some(s => s && s.side === 'home' && s.core);
  const awayCoreOut = sidelined.some(s => s && s.side === 'away' && s.core);
  out.heuristic.home_core_sidelined = homeCoreOut;
  out.heuristic.away_core_sidelined = awayCoreOut;
  if (homeCoreOut && out.home_attack_lane_zh) {
    out.heuristic.home_lane_threat_weight = 0.7;
    out.heuristic.home_lane_threat_note = `主队有核心缺阵，${out.home_attack_lane_zh}进攻先看低一档。`;
  }
  if (awayCoreOut && out.away_attack_lane_zh) {
    out.heuristic.away_lane_threat_weight = 0.7;
    out.heuristic.away_lane_threat_note = `客队有核心缺阵，${out.away_attack_lane_zh}进攻先看低一档。`;
  }

  const focus = [];
  if (out.mismatch_home_favors) {
    focus.push({
      lane: out.mismatch_home_favors.lane,
      lane_zh: out.mismatch_home_favors.lane_zh,
      side: 'home_attack',
      kind: 'thin_def',
      badge: '更好打',
    });
  } else if (vHa && vAd) {
    const ranked = productRank(vHa, vAd);
    const best = ranked[0];
    const next = ranked[1];
    if (best && best.score > 0 && (!next || best.score - next.score >= 0.015)) {
      focus.push({
        lane: best.lane,
        lane_zh: laneZh(best.lane),
        side: 'home_attack',
        kind: 'overlap',
        badge: '对位',
      });
    }
  }
  if (out.mismatch_away_favors) {
    focus.push({
      lane: out.mismatch_away_favors.lane,
      lane_zh: out.mismatch_away_favors.lane_zh,
      side: 'away_attack',
      kind: 'thin_def',
      badge: '更好打',
    });
  }
  out.focus_lanes = focus;

  const bits = [];
  bits.push(`主队近期进攻侧重${out.home_attack_lane_zh || '—'}。和客队防守端重合约 ${(out.overlap_home_atk_vs_away_def * 100).toFixed(0)}%，越高越容易在同一条路上碰在一起。`);
  const homeFocus = focus.find(f => f.side === 'home_attack');
  if (homeFocus && homeFocus.kind === 'overlap') {
    bits.push(`对位焦点在${homeFocus.lane_zh}，图上这一路有描边。`);
  }
  if (out.mismatch_home_favors) {
    bits.push(`主队常从${laneZh(out.mismatch_home_favors.lane)}进攻，客队这一侧压力更大，看起来更好打。`);
  }
  if (vAa && vHd && out.overlap_away_atk_vs_home_def != null) {
    bits.push(`客队近期进攻侧重${out.away_attack_lane_zh || '—'}。和主队防守端重合约 ${(out.overlap_away_atk_vs_home_def * 100).toFixed(0)}%。`);
  }
  if (out.mismatch_away_favors) {
    bits.push(`客队常从${laneZh(out.mismatch_away_favors.lane)}进攻，主队这一侧压力更大。`);
  }
  if (out.heuristic.home_lane_threat_note) bits.push(out.heuristic.home_lane_threat_note);
  if (out.heuristic.away_lane_threat_note) bits.push(out.heuristic.away_lane_threat_note);
  out.zh_lines = bits;
  return out;
}

/** One short line for OU / 让球备注区（弱信号） */
function corridorSoftNote(corridor, { homeName, awayName } = {}) {
  if (!corridor || !corridor.available) return '';
  const h = homeName || '主队';
  const a = awayName || '客队';
  const parts = [];
  if (corridor.mismatch_home_favors) {
    parts.push(`${h}近期常从${laneZh(corridor.mismatch_home_favors.lane)}进攻，${a}这一侧更容易被打穿`);
  }
  if (corridor.mismatch_away_favors) {
    parts.push(`${a}近期常从${laneZh(corridor.mismatch_away_favors.lane)}进攻，${h}这一侧更容易被打穿`);
  }
  if (!parts.length) return '';
  return `对位提示：${parts.join('；')}。`;
}

module.exports = {
  buildCorridorMatchup,
  corridorSoftNote,
  laneZh,
  LANES,
};
