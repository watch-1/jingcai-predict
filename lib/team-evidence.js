/**
 * Team hard-test evidence memory (1.9.59 → 1.9.60)
 * Persist「硬仗检验 / 赛程水分」episodes after FT review; surface in next predict.
 * Local rules only for moisture math — no extra DeepSeek calls.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const STORE_FILE = () => path.join(DATA_DIR, 'team-evidence.json');
const MAX_EPISODES_PER_TEAM = 24;

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
/** Same soft thresholds as post-match-review (noticeable delta). */
const DELTA_THRESH = {
  possession: 6,
  shots: 2.5,
  shotsOnTarget: 1.2,
  passesPct: 4,
  corners: 1.5,
  expectedGoals: 0.3,
};

/** Offensive-ish keys that matter most for「被碾压 / 仍能产机会」. */
const CORE_ATTACK = ['shots', 'shotsOnTarget', 'expectedGoals', 'corners'];

const MOISTURE = {
  high: { tag: '高', labelZh: '水分大', mechanismZh: '软赛程灌水·硬仗崩盘' },
  mid: { tag: '中', labelZh: '水分中等', mechanismZh: '硬仗过程回落' },
  low: { tag: '低', labelZh: '硬仗仍能产机会', mechanismZh: '硬仗过程站住' },
  na: { tag: '—', labelZh: '非硬仗样本', mechanismZh: '对手强度一般' },
};


/** Extra EN→ZH for clubs that often appear in hard-test samples but miss TEAM_ZH. */
const FALLBACK_TEAM_ZH = {
  Maritimo: '马里迪莫', 'C.S. Marítimo': '马里迪莫', 'CS Maritimo': '马里迪莫',
  'Casa Pia': '卡萨皮亚', 'Academico Viseu': '维塞乌学院', 'Académico de Viseu': '维塞乌学院',
  Moreirense: '莫雷伦斯', 'Club Brugge': '布鲁日', 'Club Brugge KV': '布鲁日',
  'FC Barcelona': '巴塞罗那', Barça: '巴萨', Barca: '巴萨',
  'Sporting CP': '里斯本竞技', Sporting: '里斯本竞技', Benfica: '本菲卡',
  'Bayer Leverkusen': '勒沃库森', 'Red Bull Salzburg': '萨尔茨堡红牛', Salzburg: '萨尔茨堡',
  'Shakhtar Donetsk': '顿涅茨克矿工', Shakhtar: '顿涅茨克矿工',
  'Dinamo Zagreb': '萨格勒布迪纳摩', 'FK Crvena Zvezda': '贝尔格莱德红星',
  'Red Star Belgrade': '贝尔格莱德红星', 'Young Boys': '年轻人',
  'Fenerbahce': '费内巴切', 'Fenerbahçe': '费内巴切', 'Olympiacos': '奥林匹亚科斯',
  'Ajax': '阿贾克斯', PSV: 'PSV埃因霍温', 'PSV Eindhoven': 'PSV埃因霍温',
  Celtic: '凯尔特人', Rangers: '流浪者', 'Atalanta BC': '亚特兰大',

  Auckland: '奥克兰', 'Daejeon Citizen': '大田市民', Excelsior: '精英队',
  'FC Seoul': '首尔FC', 'Fortuna Sittard': '锡塔德幸运', 'Gangwon FC': '江原FC',
  'Gwangju FC': '光州FC', 'HNK Hajduk Split': '哈伊杜克', 'Hull City': '赫尔城',
  'Jeonbuk Motors': '全北现代', 'Kashiwa Reysol': '柏太阳神', 'Le Mans': '勒芒',
  'Melbourne Victory': '墨尔本胜利', Millwall: '米尔沃尔', 'NEC Nijmegen': 'NEC奈梅亨',
  Sydney: '悉尼FC', 'Sydney FC': '悉尼FC', 'Vissel Kobe': '神户胜利船', 'Willem II': '威廉二世',
  'Machida Zelvia': '町田泽维', 'Avispa Fukuoka': '福冈黄蜂',
  'Yokohama F. Marinos': '横滨水手', 'Yokohama F Marinos': '横滨水手',
  'Urawa Red Diamonds': '浦和红钻', 'Nagoya Grampus': '名古屋鲸',
  'Kawasaki Frontale': '川崎前锋', 'Sanfrecce Hiroshima': '广岛三箭',
  'Shimizu S-Pulse': '清水鼓动', 'Fagiano Okayama': '冈山绿雉',
  'Mito Hollyhock': '水户蜀葵', 'Kashima Antlers': '鹿岛鹿角',
  'Tampines Rovers': '坦皮尼斯流浪', 'Svay Rieng': '柴桢',
  'Preah Khan Reach Svay Rieng': '柴桢', 'Lion City Sailors': '狮城水手',
  'Buriram United': '武里南联',
  'JEF United Ichihara-Chiba': '千叶市原', 'JEF United Chiba': '千叶市原', 'JEF United': '千叶市原',
  // DE (1.9.106 form / next / hard-test)
  'SV Elversberg': '埃沃斯堡', Elversberg: '埃沃斯堡',
  'Rot-Weiß Essen': '红白埃森', 'Rot-Weiss Essen': '红白埃森', 'Rot Weiss Essen': '红白埃森',
  'FC Schalke 04': '沙尔克04', 'Schalke 04': '沙尔克04', Schalke: '沙尔克04',
  'Hamburg SV': '汉堡', 'Hamburger SV': '汉堡', Hamburg: '汉堡', HSV: '汉堡',
};

function looksChinese(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ''));
}

/**
 * Resolve club display name to Chinese for user-facing hard-test copy.
 * Prefer existing TEAM_ZH / crests zh; never invent SI jargon.
 */
function toTeamZh(name, teamId) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (looksChinese(raw)) return raw;
  // crests.json zh by sporttery id
  if (teamId) {
    try {
      const crestsFile = readJson(path.join(DATA_DIR, 'crests.json'), {});
      const crests = (crestsFile && crestsFile.teams) || {};
      const row = crests[String(teamId)] || crests[Number(teamId)];
      const zh = row && (row.zh || row.nameZh);
      if (zh && looksChinese(zh)) return zh;
    } catch (_) {}
  }
  try {
    const zh = require('./league-tables').teamZh(raw);
    if (zh && looksChinese(zh)) return zh;
  } catch (_) {}
  if (FALLBACK_TEAM_ZH[raw]) return FALLBACK_TEAM_ZH[raw];
  const low = raw.toLowerCase().replace(/[.'']/g, '');
  for (const [en, zh] of Object.entries(FALLBACK_TEAM_ZH)) {
    if (raw.toLowerCase() === en.toLowerCase()) return zh;
    const enKey = en.toLowerCase().replace(/[.'']/g, '');
    if (low === enKey || low.includes(enKey) || enKey.includes(low)) return zh;
  }
  return raw; // last resort: keep as-is (report as missing)
}

/** Plain Chinese opponent strength — no SI numbers for users. */
function opponentStrengthPlainZh(si) {
  if (si == null || !Number.isFinite(Number(si))) return '对手强度不明';
  const n = Number(si);
  if (n >= 1.08) return '对手偏强';
  if (n >= 0.95) return '对手中等';
  return '对手偏弱';
}

function moistureTagClass(ep) {
  const tag = (ep && ep.moistureTag) || '';
  const label = (ep && ep.moistureLabelZh) || '';
  if (tag === '高' || /水分大/.test(label)) return 'ht-high';
  if (tag === '低' || /硬仗仍能产机会|硬仗站住/.test(label)) return 'ht-low';
  if (tag === '中' || /水分中等|过程回落|中性偏弱/.test(label)) return 'ht-mid';
  if (tag === '—' || /非硬仗/.test(label)) return 'ht-na';
  return 'ht-na';
}


/**
 * Focus-team outcome from episode side + FT scoreline (home:away).
 * result field on reviews is match lean h/a/d — convert via side when present.
 * @returns {{ ft: string, outcome: 'W'|'D'|'L'|'', outcomeZh: string, scoreLineZh: string }}
 */
function focusResultFromEpisode(ep) {
  const empty = { ft: '', outcome: '', outcomeZh: '', scoreLineZh: '' };
  if (!ep) return empty;
  let ft = String(ep.ft || '').trim();
  if (!ft || !/^\d+\s*[:：\-]\s*\d+$/.test(ft)) {
    // try enrich from match_outcomes / review disk
    const enriched = lookupFtForEpisode(ep);
    if (enriched) ft = enriched;
  }
  ft = String(ft || '').replace(/：/g, ':').replace(/\s*-\s*/g, ':').replace(/\s+/g, '');
  let outcome = '';
  const side = String(ep.side || '').toLowerCase();
  const m = ft.match(/^(\d+):(\d+)$/);
  if (m && (side === 'home' || side === 'away')) {
    const gh = Number(m[1]);
    const ga = Number(m[2]);
    if (gh === ga) outcome = 'D';
    else if (side === 'home') outcome = gh > ga ? 'W' : 'L';
    else outcome = ga > gh ? 'W' : 'L';
  } else {
    // Fallback: review result h/a/d or H/A/D (match winner) + side
    const r = String(ep.result || '').trim().toLowerCase();
    if (r === 'd' || r === 'draw') outcome = 'D';
    else if ((r === 'h' || r === 'home') && side === 'home') outcome = 'W';
    else if ((r === 'h' || r === 'home') && side === 'away') outcome = 'L';
    else if ((r === 'a' || r === 'away') && side === 'away') outcome = 'W';
    else if ((r === 'a' || r === 'away') && side === 'home') outcome = 'L';
    else if (r === 'w' || r === 'win') outcome = 'W';
    else if (r === 'l' || r === 'loss' || r === 'lose') outcome = 'L';
  }
  const outcomeZh = outcome === 'W' ? '胜' : outcome === 'D' ? '平' : outcome === 'L' ? '负' : '';
  const scoreLineZh = ft ? (outcomeZh ? `${ft} · ${outcomeZh}` : ft) : (outcomeZh || '');
  return { ft, outcome, outcomeZh, scoreLineZh };
}

/** Pull FT from match_outcomes / post-match review when episode omitted score. */
function lookupFtForEpisode(ep) {
  const mid = String((ep && ep.matchId) || '');
  if (!mid) return '';
  try {
    const pmdb = require('./player-match-db');
    if (pmdb.getMatchOutcome) {
      const o = pmdb.getMatchOutcome(mid);
      if (o && o.ft) return String(o.ft);
    }
  } catch (_) {}
  try {
    const disk = readJson(path.join(DATA_DIR, 'post-match-reviews', mid + '.json'), null);
    const ft = disk && (disk.ft || (disk.payload && disk.payload.ft));
    if (ft) return String(ft);
  } catch (_) {}
  // AF-prefixed ids sometimes stored without prefix in outcomes
  if (mid.startsWith('af:')) {
    try {
      const pmdb = require('./player-match-db');
      if (pmdb.getMatchOutcome) {
        const o = pmdb.getMatchOutcome(mid.slice(3));
        if (o && o.ft) return String(o.ft);
      }
    } catch (_) {}
  }
  return '';
}

function parseEpisodeDate(d) {
  const s = String(d || '').trim();
  if (!s) return null;
  // YYYY-MM-DD or MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})-(\d{2})$/);
  if (m) {
    const y = new Date().getFullYear();
    return Date.UTC(y, +m[1] - 1, +m[2]);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Nearest → farthest relative to the match date being viewed. */
function sortEpisodesByRecencyToMatch(list, matchDate) {
  const anchor = parseEpisodeDate(matchDate);
  const arr = (list || []).slice();
  arr.sort((a, b) => {
    const ta = parseEpisodeDate(a && a.date);
    const tb = parseEpisodeDate(b && b.date);
    if (anchor != null && ta != null && tb != null) {
      const da = Math.abs(ta - anchor);
      const db = Math.abs(tb - anchor);
      if (da !== db) return da - db;
      return tb - ta; // same distance → newer first
    }
    if (ta != null && tb != null) return tb - ta; // no match date → newest first
    if (ta != null) return -1;
    if (tb != null) return 1;
    return 0;
  });
  return arr;
}

/**
 * Rebuild user-facing summary from structured fields (fixes legacy EN + SI copy).
 */
function buildPlainSummaryZh({
  teamName, teamId, opponentName, opponentId, opponentSi, moistureKey, softBand, softLabelZh, softAvgSi,
}) {
  const name = toTeamZh(teamName, teamId) || '该队';
  const opp = toTeamZh(opponentName, opponentId) || '对手';
  const strength = opponentStrengthPlainZh(opponentSi);
  const softBit = softBand === 'soft' ? '近况赛程偏软，'
    : softBand === 'hard' ? '近况赛程偏硬，'
      : softBand === 'unknown' ? ''
        : '';
  if (moistureKey === 'na' || !moistureKey) {
    const weakHint = (opponentSi != null && Number(opponentSi) < 0.95) ? '对手偏弱'
      : (opponentSi != null && Number(opponentSi) < 1.08) ? '对手中等'
        : strength;
    return `${name}本场对阵${opp}（${weakHint}），不算硬仗样本；近况场均仍可参考。`;
  }
  if (moistureKey === 'high') {
    return `${name}${softBit}对阵${opp}（${strength}）时多项过程比近场均值明显下滑，近况数据水分大，不宜直接套用到硬仗。`;
  }
  if (moistureKey === 'mid') {
    return `${name}硬仗对阵${opp}（${strength}）时过程比近场均值回落，水分中等；引用近况场均时需打折。`;
  }
  // low
  return `${name}硬仗对阵${opp}（${strength}）时仍能制造进攻机会，近况过程水分较低，可参考近况场均。`;
}

/** Enrich episode for UI: Chinese names, plain summary, tag class, vs title. */
function formatEpisodeForUi(ep, sideLabelZh) {
  if (!ep) return null;
  const teamZh = (sideLabelZh && looksChinese(sideLabelZh))
    ? sideLabelZh
    : (toTeamZh(ep.teamName, ep.teamId) || sideLabelZh || ep.teamName || '该队');
  const oppZh = toTeamZh(ep.opponent, ep.opponentId) || ep.opponent || '对手';
  let moistureKey = 'na';
  if (ep.moistureTag === '高') moistureKey = 'high';
  else if (ep.moistureTag === '中') moistureKey = 'mid';
  else if (ep.moistureTag === '低') moistureKey = 'low';
  else if (ep.isHardTest) {
    if (/水分大/.test(ep.moistureLabelZh || '')) moistureKey = 'high';
    else if (/水分中等|回落/.test(ep.moistureLabelZh || '')) moistureKey = 'mid';
    else if (/仍能产机会|站住/.test(ep.moistureLabelZh || '')) moistureKey = 'low';
    else moistureKey = 'mid';
  }
  const briefSummaryZh = buildPlainSummaryZh({
    teamName: teamZh,
    teamId: ep.teamId,
    opponentName: oppZh,
    opponentId: ep.opponentId,
    opponentSi: ep.opponentStrength != null ? ep.opponentStrength : ep.opponentSi,
    moistureKey,
    softBand: ep.scheduleBand || null,
    softLabelZh: ep.scheduleLabelZh || null,
    softAvgSi: ep.scheduleSoftnessBefore,
  });
  const tag = ep.moistureLabelZh || (MOISTURE[moistureKey] && MOISTURE[moistureKey].labelZh) || '—';
  // Filter mechanism lines that only repeat the tag
  const mech = (ep.mechanismTags || []).filter((t) => {
    const s = String(t || '').trim();
    if (!s) return false;
    if (s === tag || s === ep.moistureLabelZh) return false;
    if (s === '硬仗仍能产机会' && /硬仗仍能产机会/.test(tag)) return false;
    if (s === '硬仗过程回落' && /水分中等|回落/.test(tag)) return false;
    if (s === '对手强度一般' && /非硬仗/.test(tag)) return false;
    return true;
  }).slice(0, 2);
  const focus = focusResultFromEpisode(ep);
  return {
    ...ep,
    teamNameZh: teamZh,
    opponentZh: oppZh,
    vsTitleZh: `${teamZh} · 对阵 ${oppZh}`,
    briefSummaryZh,
    moistureLabelZh: tag,
    mechanismTags: mech,
    tagClass: moistureTagClass({ moistureTag: ep.moistureTag, moistureLabelZh: tag }),
    opponentStrengthPlainZh: opponentStrengthPlainZh(
      ep.opponentStrength != null ? ep.opponentStrength : ep.opponentSi
    ),
    ft: focus.ft || ep.ft || '',
    focusOutcome: focus.outcome,
    focusOutcomeZh: focus.outcomeZh,
    scoreLineZh: focus.scoreLineZh,
  };
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


/**
 * Recover sporttery team ids when review/match lost them (common on results path).
 * Prefer schedule-seen → odds-snapshots → crests name match.
 */
function lookupTeamIdsByMatchId(matchId) {
  const id = String(matchId || '');
  if (!id) return { homeTeamId: '', awayTeamId: '' };
  try {
    const seen = readJson(path.join(DATA_DIR, 'schedule-seen.json'), null);
    const row = seen && seen.byId && seen.byId[id];
    if (row && (row.homeTeamId || row.awayTeamId)) {
      return { homeTeamId: String(row.homeTeamId || ''), awayTeamId: String(row.awayTeamId || '') };
    }
  } catch (_) {}
  try {
    const root = path.join(DATA_DIR, 'odds-snapshots');
    if (fs.existsSync(root)) {
      const days = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
      for (const d of days.slice(0, 14)) {
        const j = readJson(path.join(root, d, id + '.json'), null);
        if (j && (j.homeTeamId || j.awayTeamId)) {
          return { homeTeamId: String(j.homeTeamId || ''), awayTeamId: String(j.awayTeamId || '') };
        }
      }
    }
  } catch (_) {}
  try {
    const pre = readJson(path.join(DATA_DIR, 'predict-reports', id + '.json'), null);
    const p = pre && pre.payload;
    if (p && (p.homeTeamId || p.awayTeamId)) {
      return { homeTeamId: String(p.homeTeamId || ''), awayTeamId: String(p.awayTeamId || '') };
    }
  } catch (_) {}
  return { homeTeamId: '', awayTeamId: '' };
}

function teamIdByCrestName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  try {
    const crestsFile = readJson(path.join(DATA_DIR, 'crests.json'), {});
    const crests = (crestsFile && crestsFile.teams) || {};
    for (const [id, row] of Object.entries(crests)) {
      if (!row || typeof row !== 'object') continue;
      if (row.zh === n || row.nameZh === n || row.en === n || row.name === n) return String(id);
    }
  } catch (_) {}
  return '';
}

/** Fill empty homeTeamId/awayTeamId on a review or match-like object (mutates). */
function ensureTeamIds(obj) {
  if (!obj) return obj;
  let hid = String(obj.homeTeamId || '');
  let aid = String(obj.awayTeamId || '');
  if (!hid || !aid) {
    const looked = lookupTeamIdsByMatchId(obj.matchId || obj.id);
    if (!hid) hid = looked.homeTeamId;
    if (!aid) aid = looked.awayTeamId;
  }
  if (!hid) hid = teamIdByCrestName(obj.home);
  if (!aid) aid = teamIdByCrestName(obj.away);
  obj.homeTeamId = hid;
  obj.awayTeamId = aid;
  return obj;
}

function sideHasUsableDeltas(deltas) {
  if (!deltas || typeof deltas !== 'object') return false;
  for (const k of METRIC_KEYS) {
    const d = deltas[k];
    if (!d) continue;
    if (d.actual != null || d.baseline != null) return true;
  }
  return false;
}

function emptyStore() {
  return { version: '1.9.60', updatedAt: null, teams: {} };
}

function loadStore() {
  const disk = readJson(STORE_FILE(), null);
  if (!disk || typeof disk !== 'object') return emptyStore();
  if (!disk.teams || typeof disk.teams !== 'object') disk.teams = {};
  return disk;
}

function saveStore(store) {
  store.updatedAt = new Date().toISOString();
  store.version = '1.9.60';
  writeJson(STORE_FILE(), store);
  return store;
}

/**
 * Classify recent schedule softness from SoS avgSi.
 * @returns {{ band: 'soft'|'neutral'|'hard', labelZh: string, avgSi: number|null }}
 */
function classifyScheduleSoftness(avgSi) {
  if (avgSi == null || !Number.isFinite(Number(avgSi))) {
    return { band: 'unknown', labelZh: '赛程强度不明', avgSi: null };
  }
  const si = Number(avgSi);
  if (si < 0.95) return { band: 'soft', labelZh: '赛程偏软', avgSi: si };
  if (si >= 1.08) return { band: 'hard', labelZh: '赛程偏硬', avgSi: si };
  return { band: 'neutral', labelZh: '赛程中等', avgSi: si };
}

/**
 * Opponent strength for THIS match (local standings / cup SI).
 * @returns {{ si: number, band: string, labelZh: string, source: string } | null}
 */
function estimateMatchOpponentStrength({ opponentName, league, opponentTeamId }) {
  try {
    const ps = require('./process-stats');
    let est = ps.estimateOpponentStrength({
      opponent: opponentName,
      league: league || '',
    });
    if (est && est.si != null) return est;
    // Fallback: English name from crests.json (sporttery id)
    if (opponentTeamId) {
      try {
        const crestsFile = readJson(path.join(DATA_DIR, 'crests.json'), {});
        const crests = (crestsFile && crestsFile.teams) || crestsFile || {};
        const row = crests[String(opponentTeamId)] || crests[Number(opponentTeamId)];
        const en = row && (row.en || row.nameEn || row.name);
        if (en) {
          est = ps.estimateOpponentStrength({ opponent: en, league: league || '' });
          if (est && est.si != null) return est;
        }
      } catch (_) {}
    }
    return est || null;
  } catch {
    return null;
  }
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function pctDelta(actual, baseline) {
  if (actual == null || baseline == null || !Number.isFinite(Number(baseline)) || Number(baseline) === 0) {
    return null;
  }
  return Math.round(((Number(actual) - Number(baseline)) / Math.abs(Number(baseline))) * 1000) / 10;
}

/**
 * Build per-metric thisMatch vs recentAvg snapshot from review deltas.
 */
function metricDeltasFromSide(deltas) {
  const out = {};
  if (!deltas) return out;
  for (const k of METRIC_KEYS) {
    const d = deltas[k];
    if (!d || d.missing) {
      out[k] = { actual: d && d.actual != null ? d.actual : null, recentAvg: d && d.baseline != null ? d.baseline : null, delta: null, pct: null, missing: true };
      continue;
    }
    out[k] = {
      actual: d.actual,
      recentAvg: d.baseline,
      delta: d.delta,
      pct: pctDelta(d.actual, d.baseline),
      missing: false,
      collapsed: d.delta != null && d.delta <= -(DELTA_THRESH[k] || 2),
      lifted: d.delta != null && d.delta >= (DELTA_THRESH[k] || 2),
    };
  }
  return out;
}

/**
 * Local moisture / hard-test verdict (no AI).
 *
 * Rules:
 * - Hard test when opponent SI ≥ 1.08, OR (soft recent schedule avgSi < 0.95 AND opponent SI ≥ 1.02).
 * - Collapse: core attack metrics down by ≥ threshold; multi-metric (≥3 core, or xG+shots both) → 高.
 * - Held / produced chances against hard opp → 低「硬仗仍能产机会」.
 */
function assessMoisture({
  deltas,
  opponentSi,
  scheduleSoftnessBefore,
  teamName,
  opponentName,
}) {
  const metrics = metricDeltasFromSide(deltas);
  const soft = classifyScheduleSoftness(scheduleSoftnessBefore);
  const si = opponentSi != null && Number.isFinite(Number(opponentSi)) ? Number(opponentSi) : null;

  const isHardOpp = si != null && si >= 1.08;
  const softThenStrong = soft.band === 'soft' && si != null && si >= 1.0;
  const isHardTest = !!(isHardOpp || softThenStrong);

  let collapseN = 0;
  let liftN = 0;
  let coreCollapse = 0;
  let xgDown = false;
  let shotsDown = false;
  const collapseKeys = [];
  const liftKeys = [];
  for (const k of METRIC_KEYS) {
    const m = metrics[k];
    if (!m || m.missing || m.delta == null) continue;
    const th = DELTA_THRESH[k] || 2;
    if (m.delta <= -th) {
      collapseN += 1;
      collapseKeys.push(METRIC_ZH[k] || k);
      if (CORE_ATTACK.includes(k)) coreCollapse += 1;
      if (k === 'expectedGoals') xgDown = true;
      if (k === 'shots') shotsDown = true;
    } else if (m.delta >= th) {
      liftN += 1;
      liftKeys.push(METRIC_ZH[k] || k);
    }
  }

  const comprehensivelyCrushed = coreCollapse >= 3 || (xgDown && shotsDown && coreCollapse >= 2);
  const partialCollapse = coreCollapse >= 2 || (collapseN >= 3 && coreCollapse >= 1);
  const producedChances = liftN >= 2 || (metrics.expectedGoals && metrics.expectedGoals.lifted)
    || (metrics.shots && metrics.shots.lifted && metrics.shotsOnTarget && metrics.shotsOnTarget.lifted);

  let moistureKey = 'na';
  const mechanismTags = [];
  if (!isHardTest) {
    moistureKey = 'na';
    if (soft.band === 'soft') mechanismTags.push('近期赛程偏软');
    if (si != null && si < 0.95) mechanismTags.push('本场对手偏弱');
  } else if (comprehensivelyCrushed) {
    moistureKey = 'high';
    mechanismTags.push('硬仗多项过程崩盘');
    if (soft.band === 'soft') mechanismTags.push('软赛程过程水分暴露');
    if (collapseKeys.length) mechanismTags.push('回落：' + collapseKeys.slice(0, 4).join('、'));
  } else if (partialCollapse && !producedChances) {
    moistureKey = 'mid';
    mechanismTags.push('硬仗过程明显回落');
    if (soft.band === 'soft') mechanismTags.push('软赛程需打折');
  } else if (producedChances || liftN >= collapseN) {
    moistureKey = 'low';
    mechanismTags.push('硬仗仍能产机会');
    if (liftKeys.length) mechanismTags.push('撑住：' + liftKeys.slice(0, 3).join('、'));
  } else {
    moistureKey = 'mid';
    mechanismTags.push('硬仗过程中性偏弱');
  }

  const row = MOISTURE[moistureKey] || MOISTURE.na;
  const summaryZh = buildPlainSummaryZh({
    teamName,
    opponentName,
    opponentSi: si,
    moistureKey: isHardTest ? moistureKey : 'na',
    softBand: soft.band,
    softLabelZh: soft.labelZh,
    softAvgSi: soft.avgSi,
  });

  return {
    isHardTest,
    opponentSi: si,
    scheduleSoftnessBefore: soft,
    collapseN,
    coreCollapse,
    liftN,
    collapseKeys,
    liftKeys,
    comprehensivelyCrushed: !!comprehensivelyCrushed,
    moistureTag: row.tag,
    moistureLabelZh: row.labelZh,
    mechanismTags: mechanismTags.length ? mechanismTags : [row.mechanismZh],
    summaryZh,
    metrics,
  };
}

/**
 * Build one episode for a side of a finished review.
 */
function buildEpisodeForSide({
  review, side, /* 'home'|'away' */
}) {
  if (!review || !review.hasActualStats) return null;
  ensureTeamIds(review);
  const isHome = side === 'home';
  let teamId = String(isHome ? review.homeTeamId : review.awayTeamId || '');
  const teamName = isHome ? review.home : review.away;
  let opponentId = String(isHome ? review.awayTeamId : review.homeTeamId || '');
  const opponentName = isHome ? review.away : review.home;

  const deltas = review.deltas && review.deltas[side];
  // 1.9.60: deltas alone are enough for hard-test display; teamId only needed for memory upsert
  if (!deltas || !sideHasUsableDeltas(deltas)) return null;
  if (!teamId) {
    teamId = teamIdByCrestName(teamName) || ('name:' + String(teamName || side));
    if (isHome) review.homeTeamId = teamId.startsWith('name:') ? review.homeTeamId : teamId;
    else review.awayTeamId = teamId.startsWith('name:') ? review.awayTeamId : teamId;
  }
  if (!opponentId) {
    opponentId = teamIdByCrestName(opponentName) || ('name:' + String(opponentName || (isHome ? 'away' : 'home')));
  }

  // Opponent SI for THIS match
  const oppEst = estimateMatchOpponentStrength({
    opponentName,
    league: review.league,
    opponentTeamId: opponentId,
  });
  const opponentSi = oppEst && oppEst.si != null ? oppEst.si : null;

  // Schedule softness BEFORE this match: from pre-match baselines/sos if present
  let scheduleSi = null;
  const baseSide = review.baselines && review.baselines[side];
  if (baseSide && baseSide.sos && baseSide.sos.avgSi != null) {
    scheduleSi = Number(baseSide.sos.avgSi);
  } else if (review.prediction && review.prediction._processSos) {
    const s = review.prediction._processSos[side];
    if (s && s.avgSi != null) scheduleSi = Number(s.avgSi);
  }
  // Also try pre-match report on disk
  if (scheduleSi == null) {
    try {
      const pre = readJson(path.join(DATA_DIR, 'predict-reports', String(review.matchId) + '.json'), null);
      const facts = pre && pre.payload && pre.payload.sections && pre.payload.sections.process
        && pre.payload.sections.process.facts;
      const sideF = facts && facts[side];
      if (sideF && sideF.sos && sideF.sos.avgSi != null) scheduleSi = Number(sideF.sos.avgSi);
    } catch (_) {}
  }

  const assessed = assessMoisture({
    deltas,
    opponentSi,
    scheduleSoftnessBefore: scheduleSi,
    teamName,
    opponentName,
  });

  const createdAt = new Date().toISOString();
  const teamNameZh = toTeamZh(teamName, teamId) || teamName || '';
  const opponentZh = toTeamZh(opponentName, opponentId) || opponentName || '';
  // Rebuild summary with Chinese names (assessMoisture may have received EN names)
  const briefSummaryZh = buildPlainSummaryZh({
    teamName: teamNameZh,
    teamId,
    opponentName: opponentZh,
    opponentId,
    opponentSi,
    moistureKey: assessed.isHardTest
      ? (assessed.moistureTag === '高' ? 'high' : assessed.moistureTag === '中' ? 'mid' : assessed.moistureTag === '低' ? 'low' : 'na')
      : 'na',
    softBand: assessed.scheduleSoftnessBefore.band,
    softLabelZh: assessed.scheduleSoftnessBefore.labelZh,
    softAvgSi: assessed.scheduleSoftnessBefore.avgSi,
  });
  return {
    matchId: String(review.matchId),
    date: review.date || '',
    side,
    teamId,
    teamName: teamNameZh || teamName || '',
    teamNameZh,
    opponentId,
    opponent: opponentZh || opponentName || '',
    opponentZh,
    opponentStrength: opponentSi,
    opponentStrengthLabelZh: opponentStrengthPlainZh(opponentSi),
    opponentBand: (oppEst && oppEst.band) || null,
    scheduleSoftnessBefore: scheduleSi,
    scheduleBand: assessed.scheduleSoftnessBefore.band,
    scheduleLabelZh: assessed.scheduleSoftnessBefore.labelZh,
    thisMatchVsRecent: assessed.metrics,
    collapseN: assessed.collapseN,
    coreCollapse: assessed.coreCollapse,
    isHardTest: assessed.isHardTest,
    moistureTag: assessed.moistureTag,
    moistureLabelZh: assessed.moistureLabelZh,
    mechanismTags: assessed.mechanismTags,
    briefSummaryZh,
    ft: review.ft || null,
    result: review.result || null,
    league: review.league || '',
    createdAt,
  };
}

/**
 * Upsert episodes for both sides into data/team-evidence.json.
 * Only when FT + actual stats exist.
 */
function recordFromReview(review) {
  if (!review || !review.ok || !review.hasActualStats || !review.matchId) {
    return { ok: false, reason: 'incomplete' };
  }
  const homeEp = buildEpisodeForSide({ review, side: 'home' });
  const awayEp = buildEpisodeForSide({ review, side: 'away' });
  const store = loadStore();
  const written = [];

  const upsert = (ep) => {
    if (!ep || !ep.teamId) return;
    // Synthetic name: keys are display-only — do not pollute evidence memory
    if (String(ep.teamId).startsWith('name:')) return;
    const key = String(ep.teamId);
    if (!store.teams[key]) {
      store.teams[key] = { teamId: key, teamName: ep.teamName, episodes: [] };
    }
    const t = store.teams[key];
    t.teamName = ep.teamName || t.teamName;
    t.episodes = (t.episodes || []).filter(x => String(x.matchId) !== String(ep.matchId));
    t.episodes.unshift(ep);
    while (t.episodes.length > MAX_EPISODES_PER_TEAM) t.episodes.pop();
    written.push({ teamId: key, moistureTag: ep.moistureTag, isHardTest: ep.isHardTest });
  };
  upsert(homeEp);
  upsert(awayEp);
  saveStore(store);
  // 1.9.65: also persist structured hard-test + compare into player-match.sqlite
  try {
    const pmdb = require('./player-match-db');
    if (review.deltas) pmdb.upsertProcessCompareFromReview(review);
    // Ensure hardTest sides exist for SQLite upsert
    if (!review.hardTest || (!review.hardTest.home && !review.hardTest.away)) {
      review.hardTest = {
        available: !!(homeEp || awayEp),
        home: homeEp,
        away: awayEp,
        noteZh: '',
      };
    } else {
      if (homeEp) review.hardTest.home = review.hardTest.home || homeEp;
      if (awayEp) review.hardTest.away = review.hardTest.away || awayEp;
    }
    pmdb.upsertHardTestFromReview(review);
  } catch (e) {
    console.warn('team-evidence sqlite', e.message);
  }
  return {
    ok: true,
    written,
    home: homeEp,
    away: awayEp,
    source: 'json+sqlite',
  };
}

/** Sporttery teamId → AF team id (for hard-test samples stored under AF keys). */
function afTeamIdAlias(sportteryTeamId) {
  const sid = String(sportteryTeamId || '');
  if (!sid) return '';
  try {
    const ms = require('./match-stats');
    if (ms.AF_TEAM_SEED && ms.AF_TEAM_SEED[sid]) return String(ms.AF_TEAM_SEED[sid]);
  } catch (_) {}
  try {
    const j = readJson(path.join(DATA_DIR, 'crests.json'), {});
    const row = j.teams && j.teams[sid];
    if (row && row.afTeamId) return String(row.afTeamId);
  } catch (_) {}
  return '';
}

function normOppKey(s) {
  try {
    const zh = toTeamZh(s);
    if (zh && /[\u4e00-\u9fff]/.test(zh)) return zh;
  } catch (_) {}
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function mergeEpisodeLists(primary, secondary, lim) {
  const out = [];
  const seenMid = new Set();
  const isDup = (e) => {
    const mid = String(e.matchId || '');
    if (mid && seenMid.has(mid)) return true;
    const day = String(e.date || '').slice(0, 10);
    const oppKey = normOppKey(e.opponentZh || e.opponent || '');
    const t = Date.parse(day + 'T12:00:00Z');
    for (const prev of out) {
      const pOpp = normOppKey(prev.opponentZh || prev.opponent || '');
      if (!oppKey || !pOpp || oppKey !== pOpp) continue;
      const pt = Date.parse(String(prev.date || '').slice(0, 10) + 'T12:00:00Z');
      if (Number.isFinite(t) && Number.isFinite(pt) && Math.abs(t - pt) <= 2 * 864e5) return true;
      if (!Number.isFinite(t) || !Number.isFinite(pt)) {
        if (String(prev.date || '').slice(0, 10) === day) return true;
      }
    }
    return false;
  };
  const push = (e) => {
    if (!e || isDup(e)) return;
    const mid = String(e.matchId || '');
    if (mid) seenMid.add(mid);
    out.push(e);
  };
  for (const e of primary || []) push(e);
  for (const e of secondary || []) {
    if (out.length >= lim) break;
    push(e);
  }
  return out.slice(0, lim);
}

function getTeamEpisodes(teamId, { limit = 3, hardOnly = false } = {}) {
  const key = String(teamId || '');
  if (!key) return [];
  const lim = Math.max(1, Math.min(10, Number(limit) || 3));
  const collect = (tid) => {
    if (!tid) return [];
    try {
      const pmdb = require('./player-match-db');
      const fromDb = pmdb.getHardTestEpisodesForTeam(tid, { limit: Math.max(lim, 8), hardOnly });
      if (fromDb && fromDb.length) return fromDb;
    } catch (_) {}
    const store = loadStore();
    const t = store.teams[tid];
    if (!t || !Array.isArray(t.episodes)) return [];
    let list = t.episodes.slice();
    if (hardOnly) list = list.filter(e => e.isHardTest || e.moistureTag === '高' || e.moistureTag === '中');
    return list;
  };
  const primary = collect(key);
  const afAlias = afTeamIdAlias(key);
  const secondary = (afAlias && afAlias !== key) ? collect(afAlias) : [];
  return mergeEpisodeLists(primary, secondary, lim);
}

/**
 * Recent evidence cards for a match (home + away), for predict UI.
 */
function getEvidenceForMatch(m, { limit = 3 } = {}) {
  const homeId = String((m && m.homeTeamId) || '');
  const awayId = String((m && m.awayTeamId) || '');
  const lim = Math.max(1, Math.min(10, Number(limit) || 3));
  // Fetch a wider window, then sort nearest→farthest vs the fixture date (not moisture-rank).
  const fetchN = Math.max(lim * 4, 12);
  const matchDate = (m && (m.date || m.matchDate || m.kickoffDate || m.matchTime || m.time)) || '';
  const homeRaw = getTeamEpisodes(homeId, { limit: fetchN, hardOnly: false })
    .filter(e => String(e.matchId) !== String(m && m.id));
  const awayRaw = getTeamEpisodes(awayId, { limit: fetchN, hardOnly: false })
    .filter(e => String(e.matchId) !== String(m && m.id));
  const homeEps = sortEpisodesByRecencyToMatch(homeRaw, matchDate).slice(0, lim);
  const awayEps = sortEpisodesByRecencyToMatch(awayRaw, matchDate).slice(0, lim);
  return {
    home: homeEps,
    away: awayEps,
    homeTeamId: homeId,
    awayTeamId: awayId,
    hasData: homeEps.length + awayEps.length > 0,
    sortRule: 'nearest-to-farthest vs match date',
  };
}

/**
 * Soft schedule band + warning when soft team faces strong opponent (predict pre-label).
 */
function scheduleQualityForSide(sos, { opponentName, league, teamName, opponentTeamId } = {}) {
  const avgSi = sos && sos.avgSi != null ? Number(sos.avgSi) : null;
  const soft = classifyScheduleSoftness(avgSi);
  const opp = estimateMatchOpponentStrength({ opponentName, league, opponentTeamId });
  const oppSi = opp && opp.si != null ? Number(opp.si) : null;
  let warningZh = '';
  if (soft.band === 'soft' && oppSi != null && oppSi >= 1.05) {
    warningZh = `${toTeamZh(teamName) || teamName || '该队'}近况赛程偏软，本场${opponentStrengthPlainZh(oppSi)}，原始场均易高估，请优先看强度修正与自有硬仗检验。`;
  } else if (soft.band === 'soft') {
    warningZh = `${teamName || '该队'}近况赛程偏软，过程场均可能含水分。`;
  } else if (soft.band === 'hard') {
    warningZh = `${teamName || '该队'}近况赛程偏硬，过程场均更具参考价值。`;
  }
  return {
    ...soft,
    opponentSi: oppSi,
    opponentLabelZh: (opp && opp.labelZh) || null,
    warningZh,
  };
}

/**
 * When processLean favors a soft-schedule side, downgrade/flag if memory says recent hard tests crushed them.
 * @returns {{ processLean: string|null, flags: string[], reasons: string[], moistureMislead: boolean, adjusted: boolean }}
 */
function applyEvidenceToProcessLean({
  processLean,
  homeSos,
  awaySos,
  homeEvidence,
  awayEvidence,
  homeName,
  awayName,
}) {
  const flags = [];
  const reasons = [];
  let lean = processLean || null;
  let moistureMislead = false;
  let adjusted = false;

  const recentHigh = (eps) => (eps || []).filter(e => e.moistureTag === '高' || (e.isHardTest && e.coreCollapse >= 3)).slice(0, 2);
  const hHigh = recentHigh(homeEvidence);
  const aHigh = recentHigh(awayEvidence);
  const hSoft = homeSos && homeSos.avgSi != null && Number(homeSos.avgSi) < 0.95;
  const aSoft = awaySos && awaySos.avgSi != null && Number(awaySos.avgSi) < 0.95;

  // processLean 'h' favoring home — if home moisture high, flag/downgrade
  if (lean === 'h' && hHigh.length) {
    moistureMislead = true;
    adjusted = true;
    flags.push('自有检验·主队水分大');
    reasons.push(
      `自有硬仗检验：${homeName || '主队'}近场硬仗被碾压（${hHigh[0].moistureLabelZh}，对阵${hHigh[0].opponent}），` +
      `近况原始过程偏向主胜易误导，已降权/改标为接近`
    );
    lean = 'd';
  } else if (lean === 'a' && aHigh.length) {
    moistureMislead = true;
    adjusted = true;
    flags.push('自有检验·客队水分大');
    reasons.push(
      `自有硬仗检验：${awayName || '客队'}近场硬仗被碾压（${aHigh[0].moistureLabelZh}，对阵${aHigh[0].opponent}），` +
      `近况原始过程偏向客胜易误导，已降权/改标为接近`
    );
    lean = 'd';
  } else if (lean === 'h' && hSoft && hHigh.length === 0 && (homeEvidence || []).some(e => e.moistureTag === '中')) {
    flags.push('自有检验·主队赛程偏软');
    reasons.push(`自有检验提示：${homeName || '主队'}近况赛程偏软且有硬仗回落记录，过程主胜信号需打折`);
  } else if (lean === 'a' && aSoft && aHigh.length === 0 && (awayEvidence || []).some(e => e.moistureTag === '中')) {
    flags.push('自有检验·客队赛程偏软');
    reasons.push(`自有检验提示：${awayName || '客队'}近况赛程偏软且有硬仗回落记录，过程客胜信号需打折`);
  }

  // Positive: low moisture hard tests supporting lean
  if (lean === 'h' && (homeEvidence || []).some(e => e.moistureTag === '低' && e.isHardTest)) {
    flags.push('自有检验·主队硬仗站住');
    reasons.push(`自有检验：${homeName || '主队'}近期硬仗仍能产机会，过程倾向与记忆一致`);
  }
  if (lean === 'a' && (awayEvidence || []).some(e => e.moistureTag === '低' && e.isHardTest)) {
    flags.push('自有检验·客队硬仗站住');
    reasons.push(`自有检验：${awayName || '客队'}近期硬仗仍能产机会，过程倾向与记忆一致`);
  }

  return { processLean: lean, flags, reasons, moistureMislead, adjusted };
}

/**
 * Compact UI cards for predict report.
 */
function renderEvidenceHtml(m, pack) {
  if (!pack || !pack.hasData) return '';
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const card = (ep, sideLabel) => {
    const ui = formatEpisodeForUi(ep, sideLabel) || ep;
    const tagCls = ui.tagClass || moistureTagClass(ui);
    const tag = ui.moistureLabelZh || ui.moistureTag || '—';
    const when = ui.date ? esc(String(ui.date).slice(5)) : '';
    const title = ui.vsTitleZh || `${toTeamZh(sideLabel) || sideLabel} · 对阵 ${ui.opponentZh || '对手'}`;
    const mech = (ui.mechanismTags || []).slice(0, 2).map(esc).join(' · ');
    const score = ui.scoreLineZh || '';
    const oc = String(ui.focusOutcome || '').toUpperCase();
    const scoreCls = oc === 'W' ? 'ev-w' : oc === 'D' ? 'ev-d' : oc === 'L' ? 'ev-l' : '';
    return `<div class="pr-ev-card">
      <div class="pr-ev-hd">
        <span class="pr-ev-side">${esc(title)}</span>
        ${score ? `<span class="pr-ev-score ${scoreCls}">${esc(score)}</span>` : ''}
        <span class="pmr-tag ${tagCls}">${esc(tag)}</span>
        ${when ? `<span class="pr-ev-date">${when}</span>` : ''}
      </div>
      <p class="pr-ev-sum">${esc(ui.briefSummaryZh || '')}</p>
      ${mech ? `<p class="note pr-ev-mech">${mech}</p>` : ''}
    </div>`;
  };
  // 1.9.69: no promo / marketing corner text next to 自有检验
  let h = `<div class="pr-evidence"><div class="pr-evidence-hd"><b>自有检验</b></div>`;
  const homeName = toTeamZh((m && m.home) || '', m && m.homeTeamId) || (m && m.home) || '主队';
  const awayName = toTeamZh((m && m.away) || '', m && m.awayTeamId) || (m && m.away) || '客队';
  if (pack.home && pack.home.length) {
    h += `<div class="pr-ev-col"><div class="pr-ev-lab">${esc(homeName)}</div>${pack.home.map(e => card(e, homeName)).join('')}</div>`;
  }
  if (pack.away && pack.away.length) {
    h += `<div class="pr-ev-col"><div class="pr-ev-lab">${esc(awayName)}</div>${pack.away.map(e => card(e, awayName)).join('')}</div>`;
  }
  h += `<p class="note">优先采信「硬仗检验 + 强度修正」；软赛程场次的原始场均单独标示，避免弱队过程数据误导强对话。</p></div>`;
  return h;
}

/**
 * Build hardTest block for post-match review payload + HTML fragment helpers.
 */
function buildHardTestBlock(review) {
  if (!review || !review.hasActualStats) {
    return {
      available: false,
      noteZh: '本场暂无完场技术统计，无法做硬仗检验。',
      home: null,
      away: null,
    };
  }
  ensureTeamIds(review);
  const homeEp = buildEpisodeForSide({ review, side: 'home' });
  const awayEp = buildEpisodeForSide({ review, side: 'away' });
  const anyDeltas = sideHasUsableDeltas(review.deltas && review.deltas.home)
    || sideHasUsableDeltas(review.deltas && review.deltas.away);
  return {
    available: !!(homeEp || awayEp || anyDeltas),
    home: homeEp,
    away: awayEp,
    noteZh: '硬仗检验：本场过程对比近场均值；对手强度与赛程软硬度为分析参考，非事实断言。',
  };
}

/** Cached hardTest has available:true but null sides while deltas exist → needs repair. */
function needsHardTestRepair(review) {
  if (!review || !review.ok || !review.hasActualStats) return false;
  const ht = review.hardTest;
  if (!ht) return true;
  const hasD = sideHasUsableDeltas(review.deltas && review.deltas.home)
    || sideHasUsableDeltas(review.deltas && review.deltas.away);
  if (!hasD) return false;
  if (!ht.available) return true;
  if (!ht.home && !ht.away) return true;
  // Missing moisture labels despite episodes — rare
  if ((ht.home && !ht.home.moistureLabelZh) || (ht.away && !ht.away.moistureLabelZh)) return true;
  return false;
}

function repairHardTest(review) {
  if (!review) return review;
  ensureTeamIds(review);
  review.hardTest = buildHardTestBlock(review);
  return review;
}

function renderHardTestHtml(hardTest, review) {
  if (!hardTest || !hardTest.available) {
    return hardTest && hardTest.noteZh
      ? `<div class="pmr-sec pmr-hard"><h4>硬仗检验</h4><p class="note">${escHtml(hardTest.noteZh)}</p></div>`
      : '';
  }
  const sideHtml = (ep, name, sideKey) => {
    if (!ep && review) {
      try { ep = buildEpisodeForSide({ review, side: sideKey }); } catch (_) { ep = null; }
    }
    if (!ep) {
      const d = review && review.deltas && review.deltas[sideKey];
      if (sideHasUsableDeltas(d)) {
        // Last-resort: show moisture NA summary from deltas without SI
        const assessed = assessMoisture({
          deltas: d,
          opponentSi: null,
          scheduleSoftnessBefore: null,
          teamName: name,
          opponentName: sideKey === 'home' ? ((review && review.away) || '客队') : ((review && review.home) || '主队'),
        });
        ep = {
          opponent: sideKey === 'home' ? ((review && review.away) || '') : ((review && review.home) || ''),
          moistureTag: assessed.moistureTag,
          moistureLabelZh: assessed.moistureLabelZh,
          isHardTest: assessed.isHardTest,
          scheduleLabelZh: assessed.scheduleSoftnessBefore && assessed.scheduleSoftnessBefore.labelZh,
          opponentStrength: assessed.opponentSi,
          mechanismTags: assessed.mechanismTags,
          briefSummaryZh: assessed.summaryZh,
          thisMatchVsRecent: assessed.metrics,
        };
      }
    }
    if (!ep) return `<div class="pmr-hard-side"><b>${escHtml(name)}</b><p class="note">本侧过程对照暂缺</p></div>`;
    const ui = formatEpisodeForUi(ep, name) || ep;
    const tagCls = ui.tagClass || moistureTagClass(ui);
    ep = { ...ep, ...ui, opponent: ui.opponentZh || ep.opponent };
    let rows = '';
    for (const k of METRIC_KEYS) {
      const m = ep.thisMatchVsRecent && ep.thisMatchVsRecent[k];
      if (!m || (m.actual == null && m.recentAvg == null)) continue;
      const act = m.actual != null ? fmt(k, m.actual) : '—';
      const base = m.recentAvg != null ? fmt(k, m.recentAvg) : '—';
      let dlt = '—';
      let cls = '';
      if (m.delta != null) {
        const sign = m.delta > 0 ? '+' : '';
        dlt = (k === 'expectedGoals')
          ? `${sign}${Number(m.delta).toFixed(2)}`
          : `${sign}${round1(m.delta)}`;
        if (m.pct != null) dlt += `（${m.pct > 0 ? '+' : ''}${m.pct}%）`;
        cls = m.collapsed ? 'down' : (m.lifted ? 'up' : '');
      }
      rows += `<tr><td>${escHtml(METRIC_ZH[k])}</td><td class="num">${escHtml(act)}</td><td class="num muted">${escHtml(base)}</td><td class="num ${cls}">${escHtml(dlt)}</td></tr>`;
    }
    const chips = [];
    chips.push(`<span class="pmr-tag ${tagCls}">${escHtml(ep.moistureLabelZh)}</span>`);
    if (ep.isHardTest) chips.push('<span class="pmr-tag">硬仗</span>');
    if (ep.scheduleLabelZh) chips.push(`<span class="pmr-tag">${escHtml(ep.scheduleLabelZh)}</span>`);
    if (ep.opponentStrength != null || ep.opponentStrengthPlainZh) {
      chips.push(`<span class="pmr-tag ht-na">${escHtml(ep.opponentStrengthPlainZh || opponentStrengthPlainZh(ep.opponentStrength))}</span>`);
    }
    for (const t of (ep.mechanismTags || []).slice(0, 3)) {
      chips.push(`<span class="pmr-tag">${escHtml(t)}</span>`);
    }
    return `<div class="pmr-hard-side">
      <div class="pmr-hard-hd"><b>${escHtml(name)}</b><span>vs ${escHtml(ep.opponent)}</span></div>
      <div class="pmr-fb-chips">${chips.join('')}</div>
      <p>${escHtml(ep.briefSummaryZh || '')}</p>
      <div class="pmr-table-wrap"><table class="pmr-table pmr-hard-table"><thead><tr><th>指标</th><th>本场</th><th>近场均值</th><th>Δ</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>`;
  };
  let h = `<div class="pmr-sec pmr-hard"><h4>硬仗检验</h4>`;
  h += `<p class="note">${escHtml(hardTest.noteZh || '')}</p>`;
  h += `<div class="pmr-hard-grid">`;
  h += sideHtml(hardTest.home, (review && review.home) || '主队', 'home');
  h += sideHtml(hardTest.away, (review && review.away) || '客队', 'away');
  h += `</div></div>`;
  return h;
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(key, v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (key === 'possession' || key === 'passesPct') return (Math.round(n * 10) / 10) + '%';
  if (key === 'expectedGoals') return (Math.round(n * 100) / 100).toFixed(2);
  return String(Math.round(n * 10) / 10);
}

module.exports = {
  STORE_FILE,
  MOISTURE,
  METRIC_KEYS,
  METRIC_ZH,
  DELTA_THRESH,
  FALLBACK_TEAM_ZH,
  classifyScheduleSoftness,
  estimateMatchOpponentStrength,
  assessMoisture,
  buildEpisodeForSide,
  recordFromReview,
  getTeamEpisodes,
  getEvidenceForMatch,
  scheduleQualityForSide,
  applyEvidenceToProcessLean,
  renderEvidenceHtml,
  buildHardTestBlock,
  renderHardTestHtml,
  needsHardTestRepair,
  repairHardTest,
  ensureTeamIds,
  lookupTeamIdsByMatchId,
  sideHasUsableDeltas,
  loadStore,
  metricDeltasFromSide,
  toTeamZh,
  opponentStrengthPlainZh,
  moistureTagClass,
  sortEpisodesByRecencyToMatch,
  formatEpisodeForUi,
  buildPlainSummaryZh,
  focusResultFromEpisode,
  lookupFtForEpisode,
  afTeamIdAlias,
};
