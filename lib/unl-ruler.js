/**
 * 54-team UEFA Nations League midrank ruler (0–100).
 * Local draft only. Prefer official team xG when present; otherwise the
 * caller may label a number as 球员xG合计. Completed fixtures use pre-match
 * aggregates (this match excluded) when the draft/sample or per-game packs
 * allow it.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UNL_DIMS = [
  ['进攻终结', false, [['goals_pg', false, '进球/场'], ['sot_pg', false, '射正/场']]],
  ['机会创造', false, [['assists_pg', false, '助攻/场'], ['kp_pg', false, '关键传球/场'], ['bcc_pg', false, '创造良机/场']]],
  ['控球推进', false, [['passes_pg', false, '传球/场'], ['da_pg', false, '危险进攻/场'], ['pass_pct', false, '传球成功率 %']]],
  ['抢断拦截次数', true, [['tackles_pg', false, '抢断/场'], ['int_pg', false, '拦截/场']]],
  ['身体对抗', false, [['duel_win', false, '对抗成功率 %']]],
  ['防守贡献', false, [['blk_pg', false, '封堵射门/场'], ['save_pct', false, '扑救率 %']]],
];

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function draftPaths() {
  return [
    process.env.UNL_RULER_JSON,
    path.join(dataDir(), 'radar', 'unl-ruler-draft.json'),
    path.join(dataDir(), 'radar', 'unl-ruler-draft-2026-11-14.json'),
    '/tmp/unl-ruler-draft-2026-11-14.json',
  ].filter(Boolean);
}

let _draft = null;
let _draftPath = null;
function loadDraft() {
  if (_draft) return _draft;
  for (const fp of draftPaths()) {
    try {
      const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (j && j.full_team_axis_scores) {
        _draft = j;
        _draftPath = fp;
        return j;
      }
    } catch { /* try next */ }
  }
  return null;
}

function clearDraftMem() { _draft = null; _draftPath = null; }

/**
 * Midrank mapped to 0–100.
 * Among N values, midrank = average of 1-based positions of tied values
 * when sorted ascending (higher better). score = 100 * (midrank - 1) / (N - 1).
 */
function midrankMap(values) {
  const present = (values || []).filter((x) => x && x.v != null && Number.isFinite(Number(x.v)));
  const n = present.length;
  const scores = new Map();
  if (!n) return scores;
  const sorted = present.slice().sort((a, b) => Number(a.v) - Number(b.v));
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && Number(sorted[j + 1].v) === Number(sorted[i].v)) j += 1;
    const mid = ((i + 1) + (j + 1)) / 2;
    const s = n === 1 ? 50 : 100 * (mid - 1) / (n - 1);
    for (let k = i; k <= j; k++) scores.set(sorted[k].id, +s.toFixed(1));
    i = j + 1;
  }
  return scores;
}

function scoreRawAgainstPool(raw, poolRaws, dims) {
  const axes = dims || UNL_DIMS;
  const details = [];
  const axisScores = [];
  for (const [name, isStyle, parts] of axes) {
    const partRows = [];
    const partScores = [];
    for (const [key, inv, lab] of parts) {
      const vals = poolRaws.map((r, i) => ({
        id: r.id != null ? r.id : i,
        v: inv ? (r.raw[key] != null ? -Number(r.raw[key]) : null) : r.raw[key],
      }));
      const map = midrankMap(vals);
      const me = raw[key];
      const myV = me == null || !Number.isFinite(Number(me)) ? null : (inv ? -Number(me) : Number(me));
      // find my id in pool or compute as an extra point
      let sc = null;
      const mine = vals.find((x) => x.v != null && myV != null && Number(x.v) === Number(myV) && String(x.id) === String(raw.id));
      if (mine) sc = map.get(mine.id);
      else if (myV != null) {
        const extra = vals.concat([{ id: '__me__', v: myV }]);
        sc = midrankMap(extra).get('__me__');
      }
      partRows.push({ key, label: lab, raw: me == null ? null : Number(me), score: sc });
      if (sc != null) partScores.push(sc);
    }
    const axis = partScores.length ? +(partScores.reduce((a, b) => a + b, 0) / partScores.length).toFixed(1) : null;
    axisScores.push(axis);
    details.push({ name, style_volume: !!isStyle, score: axis, parts: partRows });
  }
  return { details, axisScores, complete: axisScores.every((s) => s != null) };
}

function poolFromDraft(draft) {
  const full = (draft && draft.full_team_axis_scores) || {};
  return Object.entries(full).map(([id, row]) => ({
    id: Number(id),
    zh: row.zh,
    en: row.en,
    tier: row.tier,
    games: row.games,
    raw: row.raw || {},
    scores: row.scores || [],
  }));
}

function findSample(draft, fixtureId) {
  const id = Number(fixtureId);
  return ((draft && draft.samples) || []).find((s) => Number(s.fixture_id) === id) || null;
}

/**
 * Team chart for a UNL fixture. Prefer pre-match sample when the fixture
 * is already in the draft (completed matches exclude that game). Otherwise
 * use the 54-team full scores and label whether this match could be excluded.
 */
function scoreMatchTeams(homeSm, awaySm, opts) {
  const draft = (opts && Object.prototype.hasOwnProperty.call(opts, 'draft')) ? opts.draft : loadDraft();
  if (!draft) {
    return { ok: false, reason: 'no_ruler', noteZh: '欧国联 54 队尺子尚未就绪，暂无国家队六围' };
  }
  const pool = poolFromDraft(draft);
  const fixtureId = opts && opts.fixtureId;
  const sample = fixtureId != null ? findSample(draft, fixtureId) : null;
  const finished = !!(opts && opts.finished);

  function sideFrom(preOrFull, sm, nameZh) {
    if (preOrFull && preOrFull.axes && preOrFull.axis_scores) {
      return {
        ok: true,
        teamSm: Number(sm),
        nameZh: preOrFull.name_zh || nameZh || '',
        name: preOrFull.name || '',
        games: preOrFull.games,
        raw: preOrFull.raw,
        dims: preOrFull.axes,
        scores: preOrFull.axis_scores,
        preMatch: true,
      };
    }
    const row = pool.find((p) => Number(p.id) === Number(sm));
    if (!row) return { ok: false, teamSm: Number(sm), nameZh: nameZh || '', reason: 'unmapped_team', noteZh: '该队不在欧国联 54 队尺子中' };
    const scored = scoreRawAgainstPool(Object.assign({ id: row.id }, row.raw), pool);
    return {
      ok: !!scored.complete,
      teamSm: row.id,
      nameZh: row.zh || nameZh || '',
      name: row.en || '',
      games: row.games,
      raw: row.raw,
      dims: scored.details,
      scores: scored.axisScores,
      preMatch: false,
      noteZh: finished
        ? '本场已完赛，但缺少可排除本场的分场统计，暂用含本场的窗口；有赛前样本时会改用赛前尺子'
        : '',
    };
  }

  const home = sample && sample.pre
    ? sideFrom(sample.pre.home, homeSm, opts && opts.homeName)
    : sideFrom(null, homeSm, opts && opts.homeName);
  const away = sample && sample.pre
    ? sideFrom(sample.pre.away, awaySm, opts && opts.awayName)
    : sideFrom(null, awaySm, opts && opts.awayName);

  const ok = !!(home.ok && away.ok);
  return {
    ok,
    kind: 'unl-midrank',
    reason: ok ? 'ok' : 'thin_or_unmapped',
    noteZh: ok
      ? `欧国联 54 队同一把尺子（midrank 0–100）。${finished && sample && sample.pre ? '已完赛场次用赛前窗口，不含本场。' : (finished ? (home.noteZh || away.noteZh || '') : '未开赛，用已完赛场次窗口。')}短期窗口，不是俱乐部稳定水平。`
      : (home.noteZh || away.noteZh || '欧国联六围暂无'),
    poolLabel: '欧国联 54 队 midrank',
    poolN: pool.length,
    scale: 'unl-midrank-54',
    dims: UNL_DIMS.map((d) => ({ name: d[0], style_volume: !!d[1] })),
    home,
    away,
    sourcePath: _draftPath,
  };
}

function isUnlCompetition(name) {
  return /欧国联|Nations League/i.test(String(name || ''));
}

module.exports = {
  UNL_DIMS,
  loadDraft,
  clearDraftMem,
  midrankMap,
  scoreRawAgainstPool,
  scoreMatchTeams,
  isUnlCompetition,
  draftPaths,
  poolFromDraft,
};
