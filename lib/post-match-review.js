/**
 * Post-match review (赛后复盘) — compare pre-match rolling process averages
 * vs actual AF fixture statistics; multi-angle Chinese narrative (analysis, not fact).
 * Persist under data/post-match-reviews/ + SQLite intel snippets for future predictions.
 *
 * Graceful when AF stats / prediction / rolling averages missing — never invent numbers.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR, db } = require('./db');

const REVIEW_DIR = () => path.join(DATA_DIR, 'post-match-reviews');
const PAIR_DIR = () => path.join(REVIEW_DIR(), 'by-pair');
const INDEX_FILE = () => path.join(REVIEW_DIR(), 'index.json');

const METRIC_KEYS = [
  'possession', 'shots', 'shotsOnTarget', 'passesPct', 'corners', 'expectedGoals',
];
const METRIC_ZH = {
  possession: '控球率',
  shots: '射门',
  shotsOnTarget: '射正',
  passesPct: '传球成功率',
  corners: '角球',
  expectedGoals: '预期进球 xG',
};
/** Soft thresholds for "noticeable" delta (analysis labels only). */
const DELTA_THRESH = {
  possession: 6,
  shots: 2.5,
  shotsOnTarget: 1.2,
  passesPct: 4,
  corners: 1.5,
  expectedGoals: 0.3,
};

const PICK = { h: '主胜', d: '平局', a: '客胜' };

try {
  db.exec(`
CREATE TABLE IF NOT EXISTS post_match_intel (
  match_id TEXT PRIMARY KEY,
  home_team_id TEXT,
  away_team_id TEXT,
  pair_key TEXT NOT NULL,
  date TEXT,
  league TEXT,
  home TEXT,
  away TEXT,
  ft TEXT,
  snippets TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pmi_pair ON post_match_intel(pair_key, date DESC);
CREATE INDEX IF NOT EXISTS idx_pmi_home ON post_match_intel(home_team_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_pmi_away ON post_match_intel(away_team_id, date DESC);
`);
} catch (e) {
  console.warn('post-match-intel schema', e.message);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 0));
  fs.renameSync(tmp, file);
}

function pairKey(homeTeamId, awayTeamId) {
  const a = String(homeTeamId || '');
  const b = String(awayTeamId || '');
  return [a, b].sort().join('|');
}

function reviewPath(matchId) {
  return path.join(REVIEW_DIR(), String(matchId) + '.json');
}

function fmtMetric(key, v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (key === 'possession' || key === 'passesPct') return (Math.round(n * 10) / 10) + '%';
  if (key === 'expectedGoals') return (Math.round(n * 100) / 100).toFixed(2);
  return String(Math.round(n * 10) / 10);
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function resultFromScore(ft) {
  const m = String(ft || '').match(/^(\d+)\s*[:：]\s*(\d+)$/);
  if (!m) return null;
  const hg = Number(m[1]), ag = Number(m[2]);
  if (hg > ag) return 'h';
  if (hg < ag) return 'a';
  return 'd';
}

function loadPreMatchReport(matchId) {
  const file = path.join(DATA_DIR, 'predict-reports', String(matchId) + '.json');
  const disk = readJson(file, null);
  if (!disk || !disk.payload) return null;
  return disk.payload;
}

function extractPreProcess(report) {
  if (!report || !report.sections || !report.sections.process) return null;
  const p = report.sections.process;
  if (!p.hasData || !p.facts) return null;
  return {
    home: p.facts.home || null,
    away: p.facts.away || null,
    noteZh: p.facts.noteZh || p.text || '',
  };
}

function extractPrediction(report) {
  if (!report) return null;
  const concl = report.sections && report.sections.conclusion;
  const pred = report.predict || null;
  const lean = (concl && concl.lean) || (pred && pred.top) || null;
  const conf = (concl && concl.conf) != null ? concl.conf : (pred && pred.conf);
  const pickText = (concl && concl.pickText) || (pred && pred.pickText) || (pred && pred.text) || (lean ? PICK[lean] : null);
  const marketLean = (concl && concl.marketLean)
    || (pred && pred.marketLean)
    || (report.sections && report.sections.market && report.sections.market.pick && report.sections.market.pick.top)
    || null;
  if (!lean && !marketLean) return null;
  return {
    lean,
    conf,
    pickText,
    marketLean,
    summary: report.summary || (pred && pred.summary) || '',
    speakMode: (concl && concl.speakMode) || (pred && pred.speakMode) || null,
    speakLabel: (concl && concl.speakLabel) || (pred && pred.speakLabel) || '',
    conflict: !!(concl && concl.conflict) || !!(pred && pred.conflict),
    shockSignals: (concl && concl.shockSignals) || (pred && pred.shockSignals) || [],
    processLean: (concl && concl.processLean) || null,
    formLean: (concl && concl.formLean) || null,
    rankLean: (concl && concl.rankLean) || null,
    lvl: (concl && concl.lvl) || (pred && pred.lvl) || null,
  };
}

const FEEDBACK_FILE = () => path.join(DATA_DIR, 'history', 'lean-feedback.json');

const BLOCK_ZH = {
  process: '过程数据',
  form: '近期战绩',
  rank: '联赛排名',
  market: '竞彩盘口',
};

/** Structure whether pre-match lean / blocks were right; store for weight hints. */
function buildLeanFeedback(prediction, result) {
  if (!result) return null;
  if (!prediction || (!prediction.lean && !prediction.marketLean)) {
    return {
      available: false,
      text: '无赛前预测缓存，跳过表态对照与情报块反馈。',
      leanHit: null,
      marketHit: null,
      speakMode: null,
      misledBlocks: [],
      supportedBlocks: [],
      tags: ['no_prematch'],
    };
  }
  const speakMode = prediction.speakMode || 'amplify';
  const leanHit = prediction.lean ? prediction.lean === result : null;
  const marketHit = prediction.marketLean ? prediction.marketLean === result : null;
  const blockLeans = {
    process: prediction.processLean,
    form: prediction.formLean,
    rank: prediction.rankLean,
    market: prediction.marketLean,
  };
  const misled = [];
  const supported = [];
  for (const [block, bl] of Object.entries(blockLeans)) {
    if (!bl || bl === 'd') continue;
    if (bl === result) supported.push(block);
    else misled.push(block);
  }
  const tags = [speakMode];
  if (leanHit === true) tags.push('lean_hit');
  if (leanHit === false) tags.push('lean_miss');
  if (prediction.conflict) tags.push('conflict');
  if (speakMode === 'amplify' && leanHit === true) tags.push('amplify_hit');
  if (speakMode === 'amplify' && leanHit === false) tags.push('amplify_miss');
  if (prediction.conf != null && Number(prediction.conf) >= 0.6) tags.push('high_conf');
  if (prediction.conf != null && Number(prediction.conf) >= 0.6 && leanHit === true) tags.push('high_conf_hit');
  if (prediction.conf != null && Number(prediction.conf) >= 0.6 && leanHit === false) tags.push('high_conf_miss');

  const modeZh = speakMode === 'amplify' ? '额外表态'
    : speakMode === 'align' ? '与盘口一致'
      : '信息不足/观望';
  let text;
  if (speakMode === 'align') {
    text = marketHit == null
      ? `赛前选择「与盘口一致，不额外表态」${prediction.marketLean ? `（盘口偏「${PICK[prediction.marketLean]}」）` : ''}。`
      : (marketHit
        ? `赛前「与盘口一致」；盘口参考「${PICK[prediction.marketLean]}」与赛果一致（对照，非投注）。`
        : `赛前「与盘口一致」；盘口参考「${PICK[prediction.marketLean]}」，赛果为「${PICK[result]}」（盘口亦会错，属正常）。`);
  } else if (speakMode === 'abstain') {
    text = `赛前「信息不足，不额外表态」；赛果「${PICK[result]}」。观望场不计入表态命中。`;
  } else {
    const confPct = prediction.conf != null ? Math.round(Number(prediction.conf) * 100) + '%' : null;
    text = leanHit
      ? `赛前额外表态「${prediction.pickText || PICK[prediction.lean]}」${confPct ? `（信心 ${confPct}）` : ''}命中。`
      : `赛前额外表态「${prediction.pickText || PICK[prediction.lean]}」${confPct ? `（信心 ${confPct}）` : ''}未命中，赛果「${PICK[result]}」。`;
  }
  if (misled.length) {
    text += ` 可能误导情报块：${misled.map(b => BLOCK_ZH[b] || b).join('、')}。`;
  }
  if (supported.length) {
    text += ` 方向正确情报块：${supported.map(b => BLOCK_ZH[b] || b).join('、')}。`;
  }
  text += ` 赛前模式：${modeZh}。`;

  return {
    available: true,
    text,
    leanHit,
    marketHit,
    speakMode,
    amplified: speakMode === 'amplify',
    amplifyHit: speakMode === 'amplify' ? leanHit : null,
    conflict: !!prediction.conflict,
    highConf: prediction.conf != null && Number(prediction.conf) >= 0.6,
    conf: prediction.conf != null ? Number(prediction.conf) : null,
    lean: prediction.lean || null,
    marketLean: prediction.marketLean || null,
    result,
    misledBlocks: misled,
    supportedBlocks: supported,
    tags,
  };
}

function emptyFeedbackAgg() {
  return {
    updatedAt: null,
    n: 0,
    leanHit: 0,
    leanN: 0,
    marketHit: 0,
    marketN: 0,
    amplify: { n: 0, hit: 0 },
    align: { n: 0 },
    abstain: { n: 0 },
    highConf: { n: 0, hit: 0 },
    conflict: { n: 0, hit: 0 },
    blocks: {
      process: { n: 0, hit: 0 },
      form: { n: 0, hit: 0 },
      rank: { n: 0, hit: 0 },
      market: { n: 0, hit: 0 },
    },
    byMatch: {},
  };
}

function recordLeanFeedback(matchId, feedback) {
  if (!feedback || !feedback.available || !matchId) return null;
  const file = FEEDBACK_FILE();
  const agg = readJson(file, emptyFeedbackAgg()) || emptyFeedbackAgg();
  if (!agg.blocks) agg.blocks = emptyFeedbackAgg().blocks;
  if (!agg.byMatch) agg.byMatch = {};
  const id = String(matchId);
  const prev = agg.byMatch[id];
  // Undo previous contribution if rebuilding the same match
  if (prev) {
    agg.n = Math.max(0, (agg.n || 0) - 1);
    if (prev.leanHit != null) {
      agg.leanN = Math.max(0, (agg.leanN || 0) - 1);
      if (prev.leanHit) agg.leanHit = Math.max(0, (agg.leanHit || 0) - 1);
    }
    if (prev.marketHit != null) {
      agg.marketN = Math.max(0, (agg.marketN || 0) - 1);
      if (prev.marketHit) agg.marketHit = Math.max(0, (agg.marketHit || 0) - 1);
    }
    const sm = prev.speakMode || 'amplify';
    if (sm === 'amplify') {
      agg.amplify.n = Math.max(0, (agg.amplify.n || 0) - 1);
      if (prev.leanHit) agg.amplify.hit = Math.max(0, (agg.amplify.hit || 0) - 1);
    } else if (sm === 'align') agg.align.n = Math.max(0, (agg.align.n || 0) - 1);
    else agg.abstain.n = Math.max(0, (agg.abstain.n || 0) - 1);
    if (prev.highConf) {
      agg.highConf.n = Math.max(0, (agg.highConf.n || 0) - 1);
      if (prev.leanHit) agg.highConf.hit = Math.max(0, (agg.highConf.hit || 0) - 1);
    }
    if (prev.conflict) {
      agg.conflict.n = Math.max(0, (agg.conflict.n || 0) - 1);
      if (prev.leanHit) agg.conflict.hit = Math.max(0, (agg.conflict.hit || 0) - 1);
    }
    for (const b of (prev.supportedBlocks || [])) {
      if (agg.blocks[b]) {
        agg.blocks[b].n = Math.max(0, agg.blocks[b].n - 1);
        agg.blocks[b].hit = Math.max(0, agg.blocks[b].hit - 1);
      }
    }
    for (const b of (prev.misledBlocks || [])) {
      if (agg.blocks[b]) agg.blocks[b].n = Math.max(0, agg.blocks[b].n - 1);
    }
  }

  const snap = {
    speakMode: feedback.speakMode,
    leanHit: feedback.leanHit,
    marketHit: feedback.marketHit,
    highConf: !!feedback.highConf,
    conflict: !!feedback.conflict,
    supportedBlocks: feedback.supportedBlocks || [],
    misledBlocks: feedback.misledBlocks || [],
    at: new Date().toISOString(),
  };
  agg.byMatch[id] = snap;
  agg.n = (agg.n || 0) + 1;
  if (feedback.leanHit != null) {
    agg.leanN = (agg.leanN || 0) + 1;
    if (feedback.leanHit) agg.leanHit = (agg.leanHit || 0) + 1;
  }
  if (feedback.marketHit != null) {
    agg.marketN = (agg.marketN || 0) + 1;
    if (feedback.marketHit) agg.marketHit = (agg.marketHit || 0) + 1;
  }
  if (feedback.speakMode === 'amplify') {
    agg.amplify.n = (agg.amplify.n || 0) + 1;
    if (feedback.leanHit) agg.amplify.hit = (agg.amplify.hit || 0) + 1;
  } else if (feedback.speakMode === 'align') {
    agg.align.n = (agg.align.n || 0) + 1;
  } else {
    agg.abstain.n = (agg.abstain.n || 0) + 1;
  }
  if (feedback.highConf) {
    agg.highConf.n = (agg.highConf.n || 0) + 1;
    if (feedback.leanHit) agg.highConf.hit = (agg.highConf.hit || 0) + 1;
  }
  if (feedback.conflict) {
    agg.conflict.n = (agg.conflict.n || 0) + 1;
    if (feedback.leanHit) agg.conflict.hit = (agg.conflict.hit || 0) + 1;
  }
  for (const b of (feedback.supportedBlocks || [])) {
    if (!agg.blocks[b]) agg.blocks[b] = { n: 0, hit: 0 };
    agg.blocks[b].n += 1;
    agg.blocks[b].hit += 1;
  }
  for (const b of (feedback.misledBlocks || [])) {
    if (!agg.blocks[b]) agg.blocks[b] = { n: 0, hit: 0 };
    agg.blocks[b].n += 1;
  }
  // Cap byMatch map size
  const ids = Object.keys(agg.byMatch);
  if (ids.length > 400) {
    ids.sort((a, b) => String(agg.byMatch[a].at || '').localeCompare(String(agg.byMatch[b].at || '')));
    for (const drop of ids.slice(0, ids.length - 400)) delete agg.byMatch[drop];
  }
  agg.updatedAt = new Date().toISOString();
  try { writeJson(file, agg); } catch (e) { console.warn('lean-feedback write', e.message); }
  return agg;
}

function pctRate(hit, n) {
  if (!n) return null;
  return Math.round((hit / n) * 1000) / 10;
}

/** Light usefulness metrics for predict UI strip — never invent samples. */
function getUsefulnessStats() {
  const agg = readJson(FEEDBACK_FILE(), null);
  const baseline = readJson(path.join(DATA_DIR, 'history', 'baseline-report.json'), null);
  const out = {
    ok: true,
    source: 'lean-feedback',
    sampleN: agg ? (agg.n || 0) : 0,
    updatedAt: agg && agg.updatedAt || null,
    alignRate: null,
    abstainRate: null,
    amplifyHitRate: null,
    highConfHitRate: null,
    conflictHitRate: null,
    leanHitRate: null,
    marketHitRate: null,
    blocks: {},
    baselineHighConf: null,
    noteZh: '',
  };
  if (agg && agg.n > 0) {
    const n = agg.n;
    out.alignRate = pctRate(agg.align && agg.align.n || 0, n);
    out.abstainRate = pctRate(agg.abstain && agg.abstain.n || 0, n);
    if (agg.amplify && agg.amplify.n) out.amplifyHitRate = { rate: pctRate(agg.amplify.hit, agg.amplify.n), n: agg.amplify.n, hit: agg.amplify.hit };
    if (agg.highConf && agg.highConf.n) out.highConfHitRate = { rate: pctRate(agg.highConf.hit, agg.highConf.n), n: agg.highConf.n, hit: agg.highConf.hit };
    if (agg.conflict && agg.conflict.n) out.conflictHitRate = { rate: pctRate(agg.conflict.hit, agg.conflict.n), n: agg.conflict.n, hit: agg.conflict.hit };
    if (agg.leanN) out.leanHitRate = { rate: pctRate(agg.leanHit, agg.leanN), n: agg.leanN, hit: agg.leanHit };
    if (agg.marketN) out.marketHitRate = { rate: pctRate(agg.marketHit, agg.marketN), n: agg.marketN, hit: agg.marketHit };
    for (const [k, v] of Object.entries(agg.blocks || {})) {
      if (v && v.n) out.blocks[k] = { rate: pctRate(v.hit, v.n), n: v.n, hit: v.hit, label: BLOCK_ZH[k] || k };
    }
  }
  // Odds-baseline high-conf bucket from history report (real backtest, not invented)
  if (baseline && baseline.test) {
    const t = baseline.test;
    out.baselineHighConf = {
      n: t.n,
      hitRate: t.hitRate,
      noteZh: '赔率隐含概率最高项 · 历史测试集（非综合表态）',
    };
  }
  if (!out.sampleN) {
    out.noteZh = '赛后表态反馈样本积累中；高信心参考暂用赔率基线测试集。';
  } else {
    out.noteZh = `基于 ${out.sampleN} 场完场复盘对照（有赛前缓存的场次）；观望场不计入表态命中。`;
  }
  return out;
}

/**
 * Actual side stats from AF fixture-stats cache or fresh fetch.
 * Returns { home, away, fixtureId, source, missingReason? }
 */
async function loadActualStats(m, { allowFetch = true } = {}) {
  const live = require('./live-stats');
  const ps = require('./process-stats');
  let fixtureId = null;
  try {
    const map = live.loadMap && live.loadMap();
    const hit = map && map['m:' + String(m.id)];
    if (hit && hit.fixtureId) fixtureId = hit.fixtureId;
  } catch (_) {}
  if (!fixtureId) {
    try {
      const resolved = await live.resolveFixture({
        matchId: m.id,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        home: m.home,
        away: m.away,
        date: m.date,
        time: m.time,
      });
      if (resolved && resolved.fixtureId) fixtureId = resolved.fixtureId;
    } catch (e) {
      return { ok: false, reason: 'resolve_error', detail: e.message, home: null, away: null, fixtureId: null };
    }
  }
  if (!fixtureId) {
    return { ok: false, reason: 'no_fixture', home: null, away: null, fixtureId: null };
  }

  let pack = null;
  try {
    if (typeof ps.getFixtureStatisticsCached === 'function') {
      pack = await ps.getFixtureStatisticsCached(fixtureId, { allowFetch });
    } else {
      pack = ps.loadFixtureStats ? ps.loadFixtureStats(fixtureId) : null;
      if (!pack && allowFetch && live.apiKeyPresent && live.apiKeyPresent()) {
        const list = await live.afFetch('/fixtures/statistics?fixture=' + encodeURIComponent(fixtureId));
        pack = ps.normalizeFixtureStatistics(list);
        if (pack && Object.keys(pack.byTeam || {}).length) {
          try {
            const file = path.join(DATA_DIR, 'live-stats', 'fixture-stats', String(fixtureId) + '.json');
            writeJson(file, { fixtureId: Number(fixtureId), ...pack });
          } catch (_) {}
        }
      }
    }
  } catch (e) {
    return { ok: false, reason: 'stats_error', detail: e.message, home: null, away: null, fixtureId };
  }

  if (!pack || !pack.byTeam || !Object.keys(pack.byTeam).length) {
    return { ok: false, reason: 'no_stats', home: null, away: null, fixtureId };
  }

  // Map AF team ids → home/away
  let homeAf = null, awayAf = null;
  try {
    const psMod = require('./process-stats');
    const hEn = psMod.resolveNameEn(m.homeTeamId, '', m.home);
    const aEn = psMod.resolveNameEn(m.awayTeamId, '', m.away);
    const hEnt = await live.resolveAfTeamId({
      sportteryTeamId: m.homeTeamId, nameEn: hEn, nameZh: m.home, allowFetch: false,
    });
    const aEnt = await live.resolveAfTeamId({
      sportteryTeamId: m.awayTeamId, nameEn: aEn, nameZh: m.away, allowFetch: false,
    });
    homeAf = hEnt && hEnt.afTeamId;
    awayAf = aEnt && aEnt.afTeamId;
    if ((!homeAf || !awayAf) && allowFetch) {
      if (!homeAf) {
        const h2 = await live.resolveAfTeamId({
          sportteryTeamId: m.homeTeamId, nameEn: hEn, nameZh: m.home, allowFetch: true,
        });
        homeAf = h2 && h2.afTeamId;
      }
      if (!awayAf) {
        const a2 = await live.resolveAfTeamId({
          sportteryTeamId: m.awayTeamId, nameEn: aEn, nameZh: m.away, allowFetch: true,
        });
        awayAf = a2 && a2.afTeamId;
      }
    }
  } catch (_) {}

  let homeStats = homeAf != null ? pack.byTeam[String(homeAf)] : null;
  let awayStats = awayAf != null ? pack.byTeam[String(awayAf)] : null;

  // Fallback: if only two teams in byTeam, assign by order when ids unknown
  const ids = Object.keys(pack.byTeam);
  if ((!homeStats || !awayStats) && ids.length === 2) {
    if (!homeStats && !awayStats) {
      homeStats = pack.byTeam[ids[0]];
      awayStats = pack.byTeam[ids[1]];
      homeAf = homeAf || ids[0];
      awayAf = awayAf || ids[1];
    } else if (!homeStats) {
      homeAf = ids.find(id => id !== String(awayAf)) || ids[0];
      homeStats = pack.byTeam[homeAf];
    } else if (!awayStats) {
      awayAf = ids.find(id => id !== String(homeAf)) || ids[1];
      awayStats = pack.byTeam[awayAf];
    }
  }

  if (!homeStats && !awayStats) {
    return { ok: false, reason: 'no_side_stats', home: null, away: null, fixtureId };
  }

  return {
    ok: true,
    fixtureId,
    homeAfId: homeAf,
    awayAfId: awayAf,
    home: homeStats || null,
    away: awayStats || null,
    source: 'api-football',
  };
}

/**
 * Apply one side of rolling process averages onto baselines out-object.
 * Excludes current fixture from the sample set when possible.
 */
function applyRollingSide(out, side, rollSide, excludeFixtureId, ps) {
  if (!rollSide || !rollSide.ok || !rollSide.averages) return false;
  let av = rollSide.averages;
  let n = rollSide.n;
  if (excludeFixtureId && Array.isArray(rollSide.samples)) {
    const filtered = rollSide.samples.filter(s => String(s.fixtureId) !== String(excludeFixtureId));
    if (filtered.length && filtered.length !== rollSide.samples.length) {
      av = ps.computeAverages(filtered);
      n = filtered.length;
    }
  }
  if (!av) return false;
  out[side] = { n, averages: av, from: 'rolling', afTeamId: rollSide.afTeamId || null };
  return true;
}

function finalizeBaselineSource(out) {
  const froms = [out.home && out.home.from, out.away && out.away.from].filter(Boolean);
  if (!froms.length) {
    out.source = 'none';
  } else if (froms.every(f => f === 'pre-match-report')) {
    out.source = 'pre-match-report';
  } else if (froms.every(f => f === 'rolling')) {
    out.source = 'rolling';
  } else {
    out.source = 'mixed';
  }
  out.missingSides = [];
  if (!out.home) out.missingSides.push('home');
  if (!out.away) out.missingSides.push('away');
  return out;
}

/**
 * Rolling baselines: prefer pre-match report process facts; fill any missing side
 * from current rolling averages (excluding this fixture). Never early-return when
 * only one side is present — that caused silent 「—」 for the other team after AF
 * remaps (e.g. Roma 132→497).
 */
async function loadBaselines(m, preProcess, excludeFixtureId) {
  const out = { home: null, away: null, source: 'none', missingSides: [] };
  if (preProcess) {
    if (preProcess.home && preProcess.home.averages) {
      out.home = { n: preProcess.home.n, averages: preProcess.home.averages, from: 'pre-match-report' };
    }
    if (preProcess.away && preProcess.away.averages) {
      out.away = { n: preProcess.away.n, averages: preProcess.away.averages, from: 'pre-match-report' };
    }
    // Both sides from report — done. One side only — fall through to rolling rematch.
    if (out.home && out.away) return finalizeBaselineSource(out);
  }
  try {
    const ps = require('./process-stats');
    if (!out.home || !out.away) {
      const roll = await ps.getRollingProcessStats({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        home: m.home,
        away: m.away,
        limit: 10,
      });
      if (!out.home) applyRollingSide(out, 'home', roll && roll.home, excludeFixtureId, ps);
      if (!out.away) applyRollingSide(out, 'away', roll && roll.away, excludeFixtureId, ps);
    }
    // Per-side rematch when still missing (stale wrong AF id / quota / partial dual fetch)
    for (const side of ['home', 'away']) {
      if (out[side]) continue;
      const teamId = side === 'home' ? m.homeTeamId : m.awayTeamId;
      const nameZh = side === 'home' ? m.home : m.away;
      if (!teamId && !nameZh) continue;
      try {
        const one = await ps.getTeamRolling({
          sportteryTeamId: teamId,
          nameZh,
          nameEn: ps.resolveNameEn(teamId, '', nameZh),
          limit: 10,
          fetchBudget: { left: 8 },
        });
        applyRollingSide(out, side, one, excludeFixtureId, ps);
      } catch (e) {
        out.error = (out.error ? out.error + '; ' : '') + side + ':' + (e.message || e);
      }
    }
  } catch (e) {
    out.error = e.message;
  }
  return finalizeBaselineSource(out);
}

/**
 * True when a cached review has actual stats for a side but no near/Δ baseline —
 * typically built while AF team mapping was wrong. Caller should force rebuild.
 */
function needsBaselineBackfill(review) {
  if (!review || !review.ok) return false;
  const sideNeeds = (actual, baseline, deltas) => {
    if (!actual) return false;
    const hasAct = METRIC_KEYS.some(k => actual[k] != null && Number.isFinite(Number(actual[k])));
    if (!hasAct) return false;
    if (baseline && baseline.averages) {
      const hasBase = METRIC_KEYS.some(k => baseline.averages[k] != null && Number.isFinite(Number(baseline.averages[k])));
      if (hasBase) return false;
    }
    if (deltas) {
      const anyBase = METRIC_KEYS.some(k => deltas[k] && deltas[k].baseline != null);
      if (anyBase) return false;
    }
    return true;
  };
  const actual = review.actual || {};
  const bases = review.baselines || {};
  const deltas = review.deltas || {};
  return sideNeeds(actual.home, bases.home, deltas.home)
    || sideNeeds(actual.away, bases.away, deltas.away);
}

function computeSideDeltas(actual, baselineAvgs) {
  const deltas = {};
  for (const k of METRIC_KEYS) {
    const act = actual && actual[k] != null && Number.isFinite(Number(actual[k])) ? Number(actual[k]) : null;
    const base = baselineAvgs && baselineAvgs[k] != null && Number.isFinite(Number(baselineAvgs[k]))
      ? Number(baselineAvgs[k]) : null;
    if (act == null && base == null) {
      deltas[k] = { actual: null, baseline: null, delta: null, missing: true };
      continue;
    }
    if (act == null || base == null) {
      deltas[k] = { actual: act, baseline: base, delta: null, missing: true };
      continue;
    }
    deltas[k] = {
      actual: round1(act),
      baseline: round1(base),
      delta: round1(act - base),
      missing: false,
    };
  }
  return deltas;
}

function describeDeltaBetter(key, d, sideName) {
  if (!d || d.missing || d.delta == null) return null;
  const th = DELTA_THRESH[key] || 2;
  const abs = Math.abs(d.delta);
  const lab = METRIC_ZH[key] || key;
  const actS = fmtMetric(key, d.actual);
  const baseS = fmtMetric(key, d.baseline);
  if (actS == null || baseS == null) return null;
  if (abs < th * 0.45) {
    return `${sideName}${lab}接近基线（本场 ${actS} / 近况 ${baseS}）`;
  }
  const dir = d.delta > 0 ? '高于' : '低于';
  const mag = abs >= th * 1.6 ? '明显' : abs >= th ? '' : '略';
  const sign = d.delta > 0 ? '+' : '';
  const dlt = (key === 'possession' || key === 'passesPct')
    ? `${sign}${round1(d.delta)}个百分点`
    : `${sign}${key === 'expectedGoals' ? Number(d.delta).toFixed(2) : round1(d.delta)}`;
  return `${sideName}${lab}${mag}${dir}近况均值（本场 ${actS} vs 近况 ${baseS}，${dlt}）`;
}

function buildHypotheses({ homeName, awayName, homeDeltas, awayDeltas, result, homeActual, awayActual }) {
  const hyps = [];
  const push = (text, tag) => {
    if (text) hyps.push({ text, tag: tag || '分析假说', labeled: true });
  };

  const hPoss = homeDeltas && homeDeltas.possession;
  const aPoss = awayDeltas && awayDeltas.possession;
  const hShots = homeDeltas && homeDeltas.shots;
  const aShots = awayDeltas && awayDeltas.shots;
  const hSot = homeDeltas && homeDeltas.shotsOnTarget;
  const aSot = awayDeltas && awayDeltas.shotsOnTarget;

  // Suppression / off-day / home factor — only when we have real deltas
  if (hPoss && !hPoss.missing && hPoss.delta != null && hPoss.delta <= -DELTA_THRESH.possession) {
    if (result === 'h') {
      push(`主队控球低于近况却取胜：或为效率取胜/对手控球无效（分析假说，非事实）。`, '克制/效率');
    } else if (result === 'a') {
      push(`主队控球明显低于近况且失利：或被客队压制、或主队状态下滑（分析假说）。`, '压制/状态');
    } else {
      push(`主队控球低于近况以平收场：场面或被限制，平局可能反映胶着（分析假说）。`, '胶着');
    }
  }
  if (aPoss && !aPoss.missing && aPoss.delta != null && aPoss.delta <= -DELTA_THRESH.possession) {
    if (result === 'a') {
      push(`客队控球低于近况却取胜：或高效反击/主队控球转化不足（分析假说）。`, '克制/效率');
    } else if (result === 'h') {
      push(`客队控球低于近况且未取胜：客场适应或被主队限制的一种解读（分析假说）。`, '客场/克制');
    }
  }

  if (hShots && !hShots.missing && hShots.delta != null && hShots.delta <= -DELTA_THRESH.shots) {
    push(`${homeName}射门低于近况：进攻创造或受对手防线限制（分析假说）。`, '克制');
  }
  if (aShots && !aShots.missing && aShots.delta != null && aShots.delta <= -DELTA_THRESH.shots) {
    push(`${awayName}射门低于近况：客队进攻输出受限的一种解读（分析假说）。`, '克制');
  }

  if (hSot && !hSot.missing && hSot.delta != null && hSot.delta >= DELTA_THRESH.shotsOnTarget && result === 'h') {
    push(`${homeName}射正高于近况并取胜：临场把握机会质量或更好（分析假说）。`, '状态');
  }
  if (aSot && !aSot.missing && aSot.delta != null && aSot.delta >= DELTA_THRESH.shotsOnTarget && result === 'a') {
    push(`${awayName}射正高于近况并取胜：客队终结效率或阶段性走高（分析假说）。`, '状态');
  }

  // Home advantage narrative
  if (result === 'h' && hPoss && !hPoss.missing && hPoss.delta != null && hPoss.delta >= 0) {
    push(`主队取胜且控球不低于近况：主场熟悉度或助力场面控制（分析假说）。`, '主场');
  }
  if (result === 'a' && homeActual && awayActual
    && homeActual.possession != null && awayActual.possession != null
    && awayActual.possession > homeActual.possession + 5) {
    push(`客队控球与赛果双优：客队或在技战术上压制主队（分析假说）。`, '克制');
  }

  // xG vs result
  const hx = homeActual && homeActual.expectedGoals;
  const ax = awayActual && awayActual.expectedGoals;
  if (hx != null && ax != null && result) {
    const xgLean = hx > ax + 0.3 ? 'h' : ax > hx + 0.3 ? 'a' : 'd';
    if (xgLean !== result && xgLean !== 'd') {
      push(`xG 倾向与赛果不完全一致（主 ${Number(hx).toFixed(2)} / 客 ${Number(ax).toFixed(2)}）：或存在偶然终结/门将发挥等因素（分析假说）。`, '偶然/效率');
    }
  }

  if (!hyps.length) {
    push('本场过程指标与近况差异有限或数据不全，暂不强化单一因果解读（分析说明）。', '数据不足');
  }
  return hyps.slice(0, 5);
}

function buildAngles({
  m, ft, result, homeDeltas, awayDeltas, baselines, actual, prediction,
}) {
  const homeName = m.home || '主队';
  const awayName = m.away || '客队';
  const angles = [];

  // 1. Process vs baseline
  const baseLines = [];
  for (const k of METRIC_KEYS) {
    const hd = describeDeltaBetter(k, homeDeltas && homeDeltas[k], homeName);
    const ad = describeDeltaBetter(k, awayDeltas && awayDeltas[k], awayName);
    if (hd && homeDeltas[k] && !homeDeltas[k].missing
      && Math.abs(homeDeltas[k].delta) >= (DELTA_THRESH[k] || 2) * 0.45) baseLines.push(hd);
    if (ad && awayDeltas[k] && !awayDeltas[k].missing
      && Math.abs(awayDeltas[k].delta) >= (DELTA_THRESH[k] || 2) * 0.45) baseLines.push(ad);
  }
  if (!baseLines.length) {
    const anyBase = !!(baselines.home || baselines.away);
    const anyAct = !!(actual.home || actual.away);
    if (!anyAct) {
      angles.push({
        key: 'process_vs_baseline',
        title: '过程 vs 近况基线',
        text: '本场暂无 API-Football 完场技术统计，无法对比近况过程均值。',
        hasData: false,
      });
    } else if (!anyBase) {
      angles.push({
        key: 'process_vs_baseline',
        title: '过程 vs 近况基线',
        text: '已有本场技术统计，但近况过程基线暂缺（赛前报告或滚动均值不可用），不作臆造对比。',
        hasData: false,
      });
    } else {
      angles.push({
        key: 'process_vs_baseline',
        title: '过程 vs 近况基线',
        text: '双方主要过程指标接近近况均值，未见显著偏离。',
        hasData: true,
        lines: [],
      });
    }
  } else {
    angles.push({
      key: 'process_vs_baseline',
      title: '过程 vs 近况基线',
      text: baseLines.slice(0, 8).join('；') + '。',
      hasData: true,
      lines: baseLines.slice(0, 8),
    });
  }

  // 2. vs opponent (actual head-to-head on pitch)
  const vsLines = [];
  if (actual.home && actual.away) {
    for (const k of METRIC_KEYS) {
      const hv = actual.home[k], av = actual.away[k];
      if (hv == null || av == null || !Number.isFinite(Number(hv)) || !Number.isFinite(Number(av))) continue;
      const th = (DELTA_THRESH[k] || 2) * 0.6;
      if (Math.abs(Number(hv) - Number(av)) < th) continue;
      const lab = METRIC_ZH[k];
      const winner = Number(hv) > Number(av) ? homeName : awayName;
      vsLines.push(`本场${lab} ${winner}占优（${fmtMetric(k, hv)} vs ${fmtMetric(k, av)}）`);
    }
  }
  angles.push({
    key: 'vs_opponent',
    title: '本场对位',
    text: vsLines.length
      ? vsLines.slice(0, 6).join('；') + '。'
      : (actual.home || actual.away)
        ? '本场双方过程指标接近，场面未呈现单项碾压。'
        : '暂无本场对位技术统计。',
    hasData: vsLines.length > 0,
    lines: vsLines.slice(0, 6),
  });

  // 3. Prediction hit/miss + selective-speaking feedback
  const leanFb = buildLeanFeedback(prediction, result);
  if (prediction && prediction.lean && result) {
    const hit = prediction.lean === result;
    const confPct = prediction.conf != null ? Math.round(Number(prediction.conf) * 100) + '%' : null;
    const mode = prediction.speakMode || 'amplify';
    const modeZh = mode === 'amplify' ? '额外表态' : mode === 'align' ? '与盘口一致' : '观望';
    angles.push({
      key: 'prediction',
      title: '赛前预测对照',
      text: mode === 'amplify'
        ? (hit
          ? `赛前额外表态「${prediction.pickText || PICK[prediction.lean]}」${confPct ? `（信心 ${confPct}）` : ''}，与赛果一致。`
          : `赛前额外表态「${prediction.pickText || PICK[prediction.lean]}」${confPct ? `（信心 ${confPct}）` : ''}，赛果为「${PICK[result]}」，预测未命中。`)
        : (leanFb && leanFb.text) || `赛前模式「${modeZh}」，赛果「${PICK[result]}」。`,
      hasData: true,
      hit: mode === 'amplify' ? hit : null,
      predicted: prediction.lean,
      actual: result,
      speakMode: mode,
    });
  } else {
    angles.push({
      key: 'prediction',
      title: '赛前预测对照',
      text: !result
        ? '赛果比分暂缺，无法对照预测。'
        : '本场无可用赛前预测缓存，跳过命中对照。',
      hasData: false,
    });
  }
  if (leanFb) {
    angles.push({
      key: 'lean_feedback',
      title: '赛前表态反馈',
      text: leanFb.text,
      hasData: !!leanFb.available,
      feedback: leanFb,
    });
  }

  // 4. Odds lean vs result
  if (prediction && prediction.marketLean && result) {
    const hit = prediction.marketLean === result;
    angles.push({
      key: 'odds',
      title: '赔率倾向 vs 赛果',
      text: hit
        ? `赛前市场隐含倾向「${PICK[prediction.marketLean]}」，与赛果一致（赔率仅反映定价偏好，非因果）。`
        : `赛前市场隐含倾向「${PICK[prediction.marketLean]}」，赛果为「${PICK[result]}」，市场倾向与赛果不一致（常见，仅作对照）。`,
      hasData: true,
      hit,
      marketLean: prediction.marketLean,
      actual: result,
    });
  } else {
    // Try live odds from match object
    let marketLean = null;
    try {
      const had = m.had;
      if (had && had.h && had.d && had.a) {
        const ih = 1 / Number(had.h), id = 1 / Number(had.d), ia = 1 / Number(had.a);
        const s = ih + id + ia;
        const ph = ih / s, pd = id / s, pa = ia / s;
        marketLean = ph >= pd && ph >= pa ? 'h' : pa >= pd && pa >= ph ? 'a' : 'd';
      }
    } catch (_) {}
    if (marketLean && result) {
      const hit = marketLean === result;
      angles.push({
        key: 'odds',
        title: '赔率倾向 vs 赛果',
        text: hit
          ? `开售/赛前胜平负隐含倾向「${PICK[marketLean]}」，与赛果一致（仅对照，非投注建议）。`
          : `开售/赛前胜平负隐含倾向「${PICK[marketLean]}」，赛果为「${PICK[result]}」（仅对照，非投注建议）。`,
        hasData: true,
        hit,
        marketLean,
        actual: result,
      });
    } else {
      angles.push({
        key: 'odds',
        title: '赔率倾向 vs 赛果',
        text: '暂无可用胜平负赔率或赛果，跳过赔率对照。',
        hasData: false,
      });
    }
  }

  // 5. Hypotheses
  const hyps = buildHypotheses({
    homeName, awayName, homeDeltas, awayDeltas, result,
    homeActual: actual.home, awayActual: actual.away,
  });
  angles.push({
    key: 'hypotheses',
    title: '叙述假说（标注为分析）',
    text: hyps.map(h => `【${h.tag}】${h.text}`).join(' '),
    hasData: hyps.length > 0,
    items: hyps,
  });

  return angles;
}

function buildIntelSnippets(review) {
  const snippets = [];
  if (!review || !review.angles) return snippets;
  const home = review.home || '主队';
  const away = review.away || '客队';
  const ft = review.ft || '';

  const pred = review.angles.find(a => a.key === 'prediction');
  if (pred && pred.hasData) {
    snippets.push(`${home} vs ${away}${ft ? `（${ft}）` : ''}：${pred.text.replace(/。$/, '')}`);
  } else if (ft) {
    const resLab = review.result === 'h' ? '主胜' : review.result === 'a' ? '客胜' : review.result === 'd' ? '平局' : '';
    if (resLab) snippets.push(`${home} vs ${away}（${ft}）：赛果${resLab}`);
  }
  const proc = review.angles.find(a => a.key === 'process_vs_baseline');
  if (proc && proc.hasData && proc.lines && proc.lines.length) {
    snippets.push(`过程回顾：${proc.lines.slice(0, 2).join('；')}`);
  }
  const vs = review.angles.find(a => a.key === 'vs_opponent');
  if (vs && vs.hasData && vs.lines && vs.lines.length && snippets.length < 3) {
    snippets.push(`本场对位：${vs.lines.slice(0, 2).join('；')}`);
  }
  const odds = review.angles.find(a => a.key === 'odds');
  if (odds && odds.hasData && snippets.length < 3) {
    snippets.push(String(odds.text || '').replace(/。$/, ''));
  }
  const hyp = review.angles.find(a => a.key === 'hypotheses');
  if (hyp && hyp.items && hyp.items.length && snippets.length < 3) {
    const top = hyp.items.find(x => x.tag && x.tag !== '数据不足' && !/暂不强化|数据不全/.test(x.text || ''));
    if (top) {
      const cleaned = String(top.text || '')
        .replace(/（分析假说[^）]*）/g, '')
        .replace(/（分析说明[^）]*）/g, '')
        .replace(/。$/, '')
        .trim();
      if (cleaned) snippets.push(`复盘假说：${cleaned}（历史复盘，非事实）`);
    }
  }
  return snippets.slice(0, 3);
}

function renderReviewHtml(review) {
  if (!review || !review.ok) {
    const msg = (review && (review.noteZh || review.error)) || '赛后复盘暂不可用';
    return `<div class="pmr-wrap"><div class="pmr-hd"><b>赛后复盘</b><span>分析 · 非事实断言</span></div><p class="note">${esc(msg)}</p></div>`;
  }
  let h = `<div class="pmr-wrap">`;
  h += `<div class="pmr-hd"><b>赛后复盘</b><span>多角度分析 · 非投注建议</span></div>`;
  h += `<p class="pmr-meta">${esc(review.home)} ${esc(review.ft || '-')} ${esc(review.away)}`;
  if (review.league) h += ` · ${esc(review.league)}`;
  if (review.generatedAtLocal) h += ` · ${esc(review.generatedAtLocal)}`;
  h += `</p>`;
  if (review.noteZh) h += `<p class="note">${esc(review.noteZh)}</p>`;

  // Delta table
  if (review.deltas && (review.deltas.home || review.deltas.away)) {
    h += `<div class="pmr-sec"><h4>指标对照</h4>`;
    h += `<div class="pmr-table-wrap"><table class="pmr-table"><thead><tr><th>指标</th><th>${esc(review.home)} 本场</th><th>近况</th><th>Δ</th><th>${esc(review.away)} 本场</th><th>近况</th><th>Δ</th></tr></thead><tbody>`;
    for (const k of METRIC_KEYS) {
      const hd = review.deltas.home && review.deltas.home[k];
      const ad = review.deltas.away && review.deltas.away[k];
      if ((!hd || hd.missing) && (!ad || ad.missing)
        && !(hd && hd.actual != null) && !(ad && ad.actual != null)) continue;
      const cell = (d) => {
        if (!d) return '<td class="num">-</td><td class="num">-</td><td class="num">-</td>';
        const act = d.actual != null ? esc(fmtMetric(k, d.actual)) : '-';
        const base = d.baseline != null ? esc(fmtMetric(k, d.baseline)) : '-';
        let dlt = '-';
        let cls = '';
        if (d.delta != null) {
          const sign = d.delta > 0 ? '+' : '';
          dlt = (k === 'possession' || k === 'passesPct')
            ? `${sign}${round1(d.delta)}`
            : `${sign}${k === 'expectedGoals' ? Number(d.delta).toFixed(2) : round1(d.delta)}`;
          cls = Math.abs(d.delta) >= (DELTA_THRESH[k] || 2) ? (d.delta > 0 ? 'up' : 'down') : '';
        }
        return `<td class="num">${act}</td><td class="num muted">${base}</td><td class="num ${cls}">${esc(dlt)}</td>`;
      };
      h += `<tr><td>${esc(METRIC_ZH[k])}</td>${cell(hd)}${cell(ad)}</tr>`;
    }
    h += `</tbody></table></div></div>`;
  }

  for (const a of review.angles || []) {
    h += `<div class="pmr-sec${a.key === 'lean_feedback' ? ' pmr-feedback' : ''}"><h4>${esc(a.title)}</h4>`;
    if (a.key === 'hypotheses' && a.items) {
      h += `<ul class="pmr-hyps">${a.items.map(it =>
        `<li><span class="pmr-tag">${esc(it.tag)}</span>${esc(it.text)}</li>`
      ).join('')}</ul>`;
    } else if (a.key === 'lean_feedback' && a.feedback && a.feedback.available) {
      const fb = a.feedback;
      h += `<p>${esc(a.text)}</p>`;
      const chips = [];
      if (fb.speakMode) chips.push(`<span class="pmr-tag">${esc(fb.speakMode === 'amplify' ? '额外表态' : fb.speakMode === 'align' ? '与盘口一致' : '观望')}</span>`);
      if (fb.amplifyHit === true) chips.push('<span class="pmr-tag ok">表态命中</span>');
      if (fb.amplifyHit === false) chips.push('<span class="pmr-tag bad">表态未中</span>');
      if (fb.misledBlocks && fb.misledBlocks.length) {
        chips.push(`<span class="pmr-tag">误导：${esc(fb.misledBlocks.map(b => BLOCK_ZH[b] || b).join('、'))}</span>`);
      }
      if (fb.supportedBlocks && fb.supportedBlocks.length) {
        chips.push(`<span class="pmr-tag ok">支撑：${esc(fb.supportedBlocks.map(b => BLOCK_ZH[b] || b).join('、'))}</span>`);
      }
      if (chips.length) h += `<div class="pmr-fb-chips">${chips.join('')}</div>`;
    } else {
      h += `<p>${esc(a.text)}</p>`;
    }
    h += `</div>`;
  }
  h += `<p class="note">免责声明：复盘为结构化数据分析与假说标注，非内幕、非事实断言；不含投注建议。缺数据已标明。</p>`;
  h += `</div>`;
  return h;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateIndex(summary) {
  const idx = readJson(INDEX_FILE(), { items: [] });
  const items = Array.isArray(idx.items) ? idx.items.filter(x => String(x.matchId) !== String(summary.matchId)) : [];
  items.unshift(summary);
  while (items.length > 80) items.pop();
  writeJson(INDEX_FILE(), { updatedAt: new Date().toISOString(), items });
}

function savePairSnippet(review) {
  const pk = review.pairKey;
  if (!pk) return;
  const file = path.join(PAIR_DIR(), pk.replace(/\|/g, '-') + '.json');
  const disk = readJson(file, { pairKey: pk, items: [] });
  const items = (disk.items || []).filter(x => String(x.matchId) !== String(review.matchId));
  items.unshift({
    matchId: review.matchId,
    date: review.date,
    home: review.home,
    away: review.away,
    ft: review.ft,
    snippets: review.intelSnippets || [],
    at: review.generatedAt,
  });
  while (items.length > 20) items.pop();
  writeJson(file, { pairKey: pk, homeTeamId: review.homeTeamId, awayTeamId: review.awayTeamId, items });
}

function saveSqlite(review) {
  try {
    db.prepare(`
INSERT INTO post_match_intel (match_id, home_team_id, away_team_id, pair_key, date, league, home, away, ft, snippets, created_at)
VALUES (@match_id, @home_team_id, @away_team_id, @pair_key, @date, @league, @home, @away, @ft, @snippets, @created_at)
ON CONFLICT(match_id) DO UPDATE SET
  snippets=excluded.snippets, ft=excluded.ft, date=excluded.date, created_at=excluded.created_at
`).run({
      match_id: String(review.matchId),
      home_team_id: String(review.homeTeamId || ''),
      away_team_id: String(review.awayTeamId || ''),
      pair_key: review.pairKey,
      date: review.date || '',
      league: review.league || '',
      home: review.home || '',
      away: review.away || '',
      ft: review.ft || '',
      snippets: JSON.stringify(review.intelSnippets || []),
      created_at: Date.now(),
    });
  } catch (e) {
    console.warn('post-match-intel save', e.message);
  }
}

/**
 * Build (or return cached) post-match review for a finished match.
 * @param {object} m match-like { id, home, away, homeTeamId, awayTeamId, date, time, league, full?, had? }
 * @param {{ force?: boolean, allowFetch?: boolean }} opts
 */
async function buildReview(m, opts = {}) {
  if (!m || !m.id) return { ok: false, reason: 'bad_match', error: '缺少比赛' };

  const cacheFile = reviewPath(m.id);
  if (!opts.force) {
    const disk = readJson(cacheFile, null);
    if (disk && disk.payload && disk.payload.ok) {
      if (!needsBaselineBackfill(disk.payload)) {
        return { ...disk.payload, cached: true, cacheAgeSec: Math.round((Date.now() - (disk.at || 0)) / 1000) };
      }
      // Incomplete one-sided baseline (e.g. Roma after AF remap) — rebuild below
    }
  }

  const ft = m.full || m.ft || (m.score && m.score.home != null && m.score.away != null
    ? `${m.score.home}:${m.score.away}` : '');
  const result = resultFromScore(ft);
  if (!ft || !result) {
    // Still allow building if we only lack score but have stats — mark incomplete
  }

  const preReport = loadPreMatchReport(m.id);
  const preProcess = extractPreProcess(preReport);
  const prediction = extractPrediction(preReport);

  const actualPack = await loadActualStats(m, { allowFetch: opts.allowFetch !== false });
  const baselines = await loadBaselines(m, preProcess, actualPack.fixtureId);

  const homeDeltas = actualPack.home
    ? computeSideDeltas(actualPack.home, baselines.home && baselines.home.averages)
    : null;
  const awayDeltas = actualPack.away
    ? computeSideDeltas(actualPack.away, baselines.away && baselines.away.averages)
    : null;

  const angles = buildAngles({
    m, ft, result,
    homeDeltas, awayDeltas, baselines,
    actual: { home: actualPack.home, away: actualPack.away },
    prediction,
  });
  const leanFeedback = buildLeanFeedback(prediction, result);
  if (leanFeedback && leanFeedback.available && result) {
    try { recordLeanFeedback(m.id, leanFeedback); } catch (e) { console.warn('recordLeanFeedback', e.message); }
  }

  const notes = [];
  if (!actualPack.ok) {
    notes.push(
      actualPack.reason === 'no_key' ? '未配置 API-Football 密钥，本场技术统计不可用。'
        : actualPack.reason === 'no_fixture' ? '未能映射到第三方完场赛事，暂无本场技术统计。'
          : actualPack.reason === 'no_stats' ? '第三方暂无本场完场技术统计。'
            : ('技术统计不可用：' + (actualPack.detail || actualPack.reason || ''))
    );
  }
  if (baselines.source === 'none') notes.push('近况过程基线暂缺。');
  else if (baselines.source === 'pre-match-report') notes.push('基线取自赛前简报过程数据。');
  else if (baselines.source === 'mixed') notes.push('基线取自赛前简报与近期滚动过程均值。');
  else notes.push('基线取自近期滚动过程均值。');
  if (baselines.missingSides && baselines.missingSides.length) {
    const labs = baselines.missingSides.map(s => (s === 'home' ? (m.home || '主队') : (m.away || '客队')));
    notes.push(labs.join('、') + '近况基线暂缺（已尝试重新映射拉取，不作臆造）。');
  }
  if (!preReport) notes.push('无赛前预测缓存。');

  const generatedAt = new Date().toISOString();
  const generatedAtLocal = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' CST';

  const review = {
    ok: true,
    matchId: String(m.id),
    home: m.home,
    away: m.away,
    homeTeamId: String(m.homeTeamId || ''),
    awayTeamId: String(m.awayTeamId || ''),
    pairKey: pairKey(m.homeTeamId, m.awayTeamId),
    league: m.league || '',
    date: m.date || '',
    time: m.time || '',
    ft: ft || null,
    result,
    fixtureId: actualPack.fixtureId || null,
    hasActualStats: !!actualPack.ok,
    baselineSource: baselines.source,
    prediction: prediction || null,
    leanFeedback: leanFeedback || null,
    deltas: { home: homeDeltas, away: awayDeltas },
    actual: {
      home: actualPack.home || null,
      away: actualPack.away || null,
    },
    baselines: {
      home: baselines.home,
      away: baselines.away,
      source: baselines.source,
    },
    angles,
    generatedAt,
    generatedAtLocal,
    noteZh: notes.join(' '),
    version: '1.9.27',
  };

  review.intelSnippets = buildIntelSnippets(review);
  review.html = renderReviewHtml(review);

  // Persist even when stats missing (partial review still useful for prediction hit)
  try {
    writeJson(cacheFile, { at: Date.now(), payload: review });
    updateIndex({
      matchId: review.matchId,
      home: review.home,
      away: review.away,
      homeTeamId: review.homeTeamId,
      awayTeamId: review.awayTeamId,
      pairKey: review.pairKey,
      date: review.date,
      league: review.league,
      ft: review.ft,
      result: review.result,
      hasActualStats: review.hasActualStats,
      snippet: (review.intelSnippets && review.intelSnippets[0]) || '',
      at: generatedAt,
    });
    savePairSnippet(review);
    saveSqlite(review);
  } catch (e) {
    console.warn('post-match-review persist', e.message);
  }

  return { ...review, cached: false, cacheAgeSec: 0 };
}

function loadReview(matchId) {
  const disk = readJson(reviewPath(matchId), null);
  if (!disk || !disk.payload) return null;
  return {
    ...disk.payload,
    cached: true,
    cacheAgeSec: Math.round((Date.now() - (disk.at || 0)) / 1000),
  };
}

function listRecentReviews({ limit = 20 } = {}) {
  const lim = Math.max(1, Math.min(50, Number(limit) || 20));
  const idx = readJson(INDEX_FILE(), { items: [] });
  return {
    ok: true,
    items: (idx.items || []).slice(0, lim),
    updatedAt: idx.updatedAt || null,
  };
}

/**
 * Fetch 1–3 intel bullets for next prediction briefing.
 * Prefers same team-pair H2H reviews; falls back to either team's recent reviews.
 */
function getIntelForPrediction(m, { limit = 3 } = {}) {
  const lim = Math.max(1, Math.min(5, Number(limit) || 3));
  const bullets = [];
  const seen = new Set();
  const pushSnips = (snips, prefix) => {
    for (const s of snips || []) {
      const t = String(s || '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      bullets.push(prefix ? `${prefix}${t}` : t);
      if (bullets.length >= lim) return true;
    }
    return false;
  };

  const pk = pairKey(m.homeTeamId, m.awayTeamId);
  // Pair file
  try {
    const file = path.join(PAIR_DIR(), pk.replace(/\|/g, '-') + '.json');
    const disk = readJson(file, null);
    if (disk && Array.isArray(disk.items)) {
      for (const it of disk.items) {
        if (String(it.matchId) === String(m.id)) continue;
        if (pushSnips(it.snippets, '历史交锋复盘：')) return bullets.slice(0, lim);
      }
    }
  } catch (_) {}

  // SQLite
  try {
    const rows = db.prepare(`
SELECT match_id, home, away, ft, snippets, date FROM post_match_intel
WHERE pair_key = ? AND match_id != ?
ORDER BY date DESC, created_at DESC LIMIT 5
`).all(pk, String(m.id || ''));
    for (const row of rows) {
      let snips = [];
      try { snips = JSON.parse(row.snippets); } catch { snips = []; }
      if (pushSnips(snips, '历史交锋复盘：')) return bullets.slice(0, lim);
    }
  } catch (_) {}

  // Same teams either side
  try {
    const hid = String(m.homeTeamId || '');
    const aid = String(m.awayTeamId || '');
    if (hid || aid) {
      const rows = db.prepare(`
SELECT match_id, home, away, ft, snippets, date FROM post_match_intel
WHERE (home_team_id = ? OR away_team_id = ? OR home_team_id = ? OR away_team_id = ?)
  AND match_id != ?
ORDER BY date DESC, created_at DESC LIMIT 8
`).all(hid, hid, aid, aid, String(m.id || ''));
      for (const row of rows) {
        let snips = [];
        try { snips = JSON.parse(row.snippets); } catch { snips = []; }
        if (pushSnips(snips, '相关球队复盘：')) return bullets.slice(0, lim);
      }
    }
  } catch (_) {}

  return bullets.slice(0, lim);
}

module.exports = {
  buildReview,
  loadReview,
  listRecentReviews,
  getIntelForPrediction,
  getUsefulnessStats,
  renderReviewHtml,
  pairKey,
  needsBaselineBackfill,
  METRIC_KEYS,
  METRIC_ZH,
  // test helpers
  computeSideDeltas,
  resultFromScore,
  buildHypotheses,
  buildIntelSnippets,
  extractPrediction,
  buildLeanFeedback,
  recordLeanFeedback,
  describeDeltaBetter,
  loadBaselines,
};
