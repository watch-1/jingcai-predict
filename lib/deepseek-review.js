/**
 * DeepSeek AI attribution for post-match review (赛后主因解读).
 * Compact evidence pack → one low-token chat call → validated structured JSON.
 * On any failure: leave rule-based main explanations untouched.
 * Never log DEEPSEEK_API_KEY.
 */
'use strict';

const MECHANISM_KEYS = [
  'away_low_poss_efficiency',
  'home_poss_waste',
  'home_low_poss_efficiency',
  'away_poss_invalid',
  'away_shots_down_still_win',
  'home_shots_down_still_win',
  'home_dominate_lose',
  'away_dominate_lose',
  'xg_result_mismatch',
  'xg_ignore_clinical',
  'xg_aligned',
  'both_xg_down',
  'fundamentals_beat_market',
  'market_mislead',
  'home_control_win',
  'limited_contrast',
];

const SIGNAL_BLOCKS = ['process', 'form', 'market', 'injury'];
const VERDICTS = ['support', 'mislead', 'neutral'];
const CONF_LEVELS = ['low', 'mid', 'high'];

/** User-facing Chinese for mechanism keys (also used to scrub AI narrative). */
const MECHANISM_ZH = {
  away_low_poss_efficiency: '效率/反击',
  home_poss_waste: '转化不足',
  home_low_poss_efficiency: '效率取胜',
  away_poss_invalid: '控球无效',
  away_shots_down_still_win: '低产出高效率',
  home_shots_down_still_win: '低产出高效率',
  home_dominate_lose: '场面与赛果背离',
  away_dominate_lose: '场面与赛果背离',
  xg_result_mismatch: '偶然/效率',
  xg_ignore_clinical: '把握机会',
  xg_aligned: '过程吻合',
  both_xg_down: '节奏偏慢',
  fundamentals_beat_market: '基本面对照',
  market_mislead: '盘口误导',
  home_control_win: '主场控制',
  limited_contrast: '数据有限',
};

/** Lean / signal field names → Chinese (forbid echoing camelCase in narrativeZh). */
const LEAN_FIELD_ZH = {
  processLean: '过程倾向',
  formLean: '状态倾向',
  marketLean: '盘口倾向',
  rankLean: '排名倾向',
  lean: '综合倾向',
  speakMode: '表态方式',
  leanHit: '倾向命中',
  marketHit: '盘口命中',
  shockSignals: '异动信号',
  selfConfidence: '自评信心',
};

const SIGNAL_BLOCK_ZH = {
  process: '过程',
  form: '状态',
  market: '盘口',
  injury: '伤停',
  rank: '排名',
};

const LEAN_VAL_ZH = { h: '主', a: '客', d: '平/接近' };
const VERDICT_ZH = { support: '兑现', mislead: '误导', neutral: '中性' };
const SPEAK_ZH = { amplify: '额外表态', align: '与盘口一致', abstain: '观望' };


const MODEL = 'deepseek-chat';
const MAX_TOKENS = 520;
const AI_NARR_REV = 3; // 1.9.56+ Chinese-only narrative (no English Lean/codes)
const MIN_NARR_CHARS = 140;
const MIN_NARR_SEGS = 4;
const TEMPERATURE = 0.15;
const API_URL = 'https://api.deepseek.com/chat/completions';
const RETRY_MS = 6 * 60 * 60 * 1000; // re-try hard AI failures after 6h
const PLAYERS_PENDING_RETRY_MS = 8 * 60 * 1000; // soft: re-check player disk cache soon
const PLAYERS_PENDING_GIVE_UP_MS = 45 * 60 * 1000; // then call AI without players

function apiKeyPresent() {
  try { if (!require('./feature-flags').isEnabled('ai_review')) return false; } catch (_) {}
  const k = process.env.DEEPSEEK_API_KEY || '';
  return !!(k && k.length > 10);
}

function apiKeyLen() {
  return (process.env.DEEPSEEK_API_KEY || '').length;
}

function pickPlayerActions(p) {
  const actions = [];
  if ((p.goals || 0) > 0) actions.push(`进球${p.goals}`);
  if ((p.assists || 0) > 0) actions.push(`助攻${p.assists}`);
  if (p.saves != null && p.saves > 0) actions.push(`扑救${p.saves}`);
  if (p.keyPasses != null && p.keyPasses > 0) actions.push(`关键传球${p.keyPasses}`);
  if (p.shots != null && p.shots > 0) {
    actions.push(p.shotsOn != null ? `射门${p.shots}(正${p.shotsOn})` : `射门${p.shots}`);
  }
  if (p.xg != null && Number.isFinite(Number(p.xg))) actions.push(`xG${Number(p.xg).toFixed(2)}`);
  if (p.rating != null) actions.push(`评分${p.rating}`);
  return actions.slice(0, 4);
}

function topPlayersByPos(players, side, perPos = 2) {
  const by = { G: [], D: [], M: [], F: [] };
  const mapPos = (p) => {
    const raw = String(p.position || '').toUpperCase();
    if (raw === 'G' || /GOAL/.test(raw)) return 'G';
    if (raw === 'D' || /DEF/.test(raw)) return 'D';
    if (raw === 'M' || /MID/.test(raw)) return 'M';
    if (raw === 'F' || /ATT|FOR/.test(raw)) return 'F';
    const zh = p.positionZh || '';
    if (/门将/.test(zh)) return 'G';
    if (/后卫/.test(zh)) return 'D';
    if (/中场/.test(zh)) return 'M';
    if (/前锋/.test(zh)) return 'F';
    return 'M';
  };
  for (const p of players || []) {
    if (!p || !(p.minutes > 0)) continue;
    const bucket = mapPos(p);
    by[bucket].push(p);
  }
  const score = (p) => {
    const r = p.rating != null ? Number(p.rating) : 0;
    const g = (p.goals || 0) * 2.5 + (p.assists || 0) * 1.8;
    const saves = (p.saves || 0) * 0.8;
    const kp = (p.keyPasses || 0) * 0.4;
    const sh = (p.shotsOn || 0) * 0.3;
    return r * 1.2 + g + saves + kp + sh;
  };
  const out = [];
  for (const pos of ['G', 'D', 'M', 'F']) {
    const ranked = by[pos].slice().sort((a, b) => score(b) - score(a)).slice(0, perPos);
    for (const p of ranked) {
      out.push({
        side,
        pos,
        name: p.nameZh || p.name || '',
        nameEn: p.name || '',
        min: p.minutes,
        actions: pickPlayerActions(p),
      });
    }
  }
  return out;
}

function compactDeltas(deltas) {
  if (!deltas) return null;
  const o = {};
  for (const [k, d] of Object.entries(deltas)) {
    if (!d || d.missing || d.delta == null) continue;
    o[k] = { a: d.actual, b: d.baseline, d: d.delta };
  }
  return Object.keys(o).length ? o : null;
}


function leanValZh(v) {
  if (v == null || v === '') return null;
  return LEAN_VAL_ZH[v] || String(v);
}

function mechZh(key) {
  if (!key) return null;
  return MECHANISM_ZH[key] || key;
}

/**
 * Build compact evidence pack for the model (local only — no secrets).
 */
function buildEvidencePack(review, playersPayload) {
  const pred = review.prediction || {};
  const leanFb = review.leanFeedback || {};
  const main = (review.angles || []).find(a => a.key === 'main_explanations');
  const ruleChosen = (main && main.items || []).find(i => i.role === 'chosen') || null;
  const ruleAlt = (main && main.items || []).find(i => i.role === 'competing') || null;

  const homePlayers = (playersPayload && playersPayload.home && playersPayload.home.players) || [];
  const awayPlayers = (playersPayload && playersPayload.away && playersPayload.away.players) || [];

  const pack = {
    match: {
      id: String(review.matchId || ''),
      home: review.home || '',
      away: review.away || '',
      ft: review.ft || '',
      result: review.result || null,
      league: review.league || '',
    },
    actual: {
      home: review.actual && review.actual.home ? {
        poss: review.actual.home.possession,
        shots: review.actual.home.shots,
        sot: review.actual.home.shotsOnTarget,
        xg: review.actual.home.expectedGoals,
        corners: review.actual.home.corners,
      } : null,
      away: review.actual && review.actual.away ? {
        poss: review.actual.away.possession,
        shots: review.actual.away.shots,
        sot: review.actual.away.shotsOnTarget,
        xg: review.actual.away.expectedGoals,
        corners: review.actual.away.corners,
      } : null,
    },
    vsBaseline: {
      home: compactDeltas(review.deltas && review.deltas.home),
      away: compactDeltas(review.deltas && review.deltas.away),
    },
    pre: {
      // 1.9.56: Chinese labels only — model must not echo English field names
      综合倾向: leanValZh(pred.lean),
      盘口倾向: leanValZh(pred.marketLean),
      过程倾向: leanValZh(pred.processLean),
      状态倾向: leanValZh(pred.formLean),
      排名倾向: leanValZh(pred.rankLean),
      表态方式: SPEAK_ZH[pred.speakMode] || pred.speakMode || null,
      异动信号: (pred.shockSignals || []).slice(0, 6).map(s => SIGNAL_BLOCK_ZH[s] || LEAN_FIELD_ZH[s] || s),
      倾向命中: leanFb.available ? leanFb.leanHit : null,
      盘口命中: leanFb.available ? leanFb.marketHit : null,
      支撑块: (leanFb.supportedBlocks || []).map(b => SIGNAL_BLOCK_ZH[b] || b),
      误导块: (leanFb.misledBlocks || []).map(b => SIGNAL_BLOCK_ZH[b] || b),
    },
    ruleHint: {
      主因机制: mechZh((ruleChosen && ruleChosen.key) || (main && main.chosenKey) || null),
      备选机制: mechZh((ruleAlt && ruleAlt.key) || null),
      // structured keys kept for validate enums only — narrative must use 中文名
      mechanismKey: (ruleChosen && ruleChosen.key) || (main && main.chosenKey) || null,
      altKey: (ruleAlt && ruleAlt.key) || null,
    },
    players: {
      home: topPlayersByPos(homePlayers, 'home', 1),
      away: topPlayersByPos(awayPlayers, 'away', 1),
      motm: playersPayload && playersPayload.motm
        ? {
          name: playersPayload.motm.nameZh || playersPayload.motm.name,
          side: playersPayload.motm.side,
          rating: playersPayload.motm.rating,
          goals: playersPayload.motm.goals,
          assists: playersPayload.motm.assists,
        }
        : null,
    },
  };
  return pack;
}

function systemPrompt() {
  const mechLegend = MECHANISM_KEYS.map(k => `${k}=${MECHANISM_ZH[k] || k}`).join('；');
  return [
    '你是竞足赛后复盘分析助手。只依据用户给的 evidence JSON，勿编造未出现的数字或球员名。',
    '输出严格 JSON（无 markdown）：',
    '{',
    '  "mechanism": "<enum>",',
    '  "alt": "<enum>",',
    '  "signals": {"process":"support|mislead|neutral","form":"...","market":"...","injury":"..."},',
    '  "unitForm": "<一句短评，≤28字，纯中文>",',
    '  "narrativeZh": "<≥6行纯中文主因叙事，用\\n分行>",',
    '  "selfConfidence": "low|mid|high"',
    '}',
    `mechanism/alt 必须来自: ${MECHANISM_KEYS.join(',')}`,
    `机制中文名对照（narrativeZh 只能写中文名，禁止写英文 key）：${mechLegend}`,
    'signals 四键齐全；与赛前倾向对照时 support=该块方向兑现，mislead=未兑现。',
    'narrativeZh 硬性要求：',
    '1) 全程只用中文（可保留常见缩写 xG、以及 evidence 中的球员中文名/数字）；',
    '2) 禁止出现任何英文标识符：camelCase（如 processLean/formLean/marketLean/rankLean）、snake_case 机制码（如 xg_aligned/both_xg_down）、以及 process/form/market 等英文块名；',
    '3) 赛前信号请用「过程倾向/状态倾向/盘口倾向/排名倾向」；机制请用「过程吻合/节奏偏慢/效率反击」等中文；',
    '4) 至少6行（用\\n分行），先点主因再提备选，口语化；',
    '若 evidence.players / motm 有 Top 球员，必须点名其过程行为（进球/助攻/扑救/关键传/射门等 actions），勿编造未出现球员；',
    '勿写投注建议；勿捏造数值。',
  ].join('\n');
}

function extractJson(text) {
  if (!text) return null;
  const s = String(text).trim();
  try { return JSON.parse(s); } catch (_) {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  return null;
}

function collectAllowedNames(pack) {
  const names = new Set();
  const add = (n) => {
    if (!n) return;
    names.add(String(n));
    // also short forms
    const parts = String(n).split(/[\s·.]+/).filter(Boolean);
    for (const p of parts) if (p.length >= 2) names.add(p);
  };
  if (pack.match) {
    add(pack.match.home);
    add(pack.match.away);
  }
  for (const side of ['home', 'away']) {
    for (const p of (pack.players && pack.players[side]) || []) {
      add(p.name);
      add(p.nameEn);
    }
  }
  if (pack.players && pack.players.motm) add(pack.players.motm.name);
  return names;
}

function collectAllowedNumbers(pack) {
  const nums = new Set();
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'number' && Number.isFinite(v)) {
      nums.add(String(v));
      nums.add(String(Math.round(v * 10) / 10));
      nums.add(String(Math.round(v * 100) / 100));
      // common display forms (rating 7.50 → 7.5 already; also int minutes)
      nums.add(String(Math.round(v)));
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(pack.actual);
  walk(pack.vsBaseline);
  // 1.9.55: player minutes/rating/actions must be allowed (product names process behaviors)
  walk(pack.players);
  if (pack.match && pack.match.ft) {
    const m = String(pack.match.ft).match(/(\d+)\s*[:：]\s*(\d+)/);
    if (m) { nums.add(m[1]); nums.add(m[2]); }
  }
  return nums;
}


/**
 * Detect English camelCase / snake_case mechanism or Lean tokens in user-facing text.
 */
function narrativeHasEnglishLeak(text) {
  const t = String(text || '');
  if (!t) return false;
  if (/\b(?:process|form|market|rank)Lean\b/.test(t)) return true;
  if (/\b[a-z]+_[a-z0-9_]+\b/.test(t)) {
    // mechanism-like snake_case (xg_aligned, both_xg_down, home_poss_waste, …)
    if (MECHANISM_KEYS.some(k => t.includes(k))) return true;
    if (/\b(?:xg|both|home|away|market|fundamentals|limited)_[a-z0-9_]+\b/.test(t)) return true;
  }
  if (/\b[a-z]+[A-Z][a-zA-Z]*\b/.test(t)) {
    // camelCase identifiers (processLean already covered; also speakMode etc.)
    if (Object.keys(LEAN_FIELD_ZH).some(k => t.includes(k))) return true;
  }
  return false;
}

/**
 * Replace known English codes with Chinese, then strip residual camelCase / snake_case tokens.
 */
function scrubNarrativeZh(text) {
  let s = String(text || '');
  if (!s) return s;

  // Longest-first replacements from maps
  const pairs = [];
  for (const [en, zh] of Object.entries(LEAN_FIELD_ZH)) pairs.push([en, zh]);
  for (const [en, zh] of Object.entries(MECHANISM_ZH)) pairs.push([en, zh]);
  for (const [en, zh] of Object.entries(SIGNAL_BLOCK_ZH)) {
    // only replace as whole English tokens in prose contexts like "process和rank"
    pairs.push([en, zh]);
  }
  for (const [en, zh] of Object.entries(VERDICT_ZH)) pairs.push([en, zh]);
  pairs.sort((a, b) => b[0].length - a[0].length);

  for (const [en, zh] of pairs) {
    if (!en || !zh) continue;
    // word-ish boundary: not mid-Chinese; allow punctuation around
    const re = new RegExp(`(?<![A-Za-z0-9_])${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
    s = s.replace(re, zh);
  }

  // Residual camelCase identifiers (keep all-caps acronyms like UEFA if any; drop Lean-style)
  s = s.replace(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g, (tok) => {
    if (LEAN_FIELD_ZH[tok]) return LEAN_FIELD_ZH[tok];
    if (/^(xG|XG|AF|API|MOTM|FT|UCL|UEL)$/i.test(tok)) return tok;
    return '';
  });

  // Residual snake_case mechanism-like codes
  s = s.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (tok) => {
    if (MECHANISM_ZH[tok]) return MECHANISM_ZH[tok];
    if (/^(expected_goals)$/i.test(tok)) return '预期进球';
    return '';
  });

  // Cleanup punctuation / empty slots left by stripping
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n');
  s = s.replace(/[，、]{2,}/g, '、');
  s = s.replace(/([是为]|还是|所以|属于|即)[，、\s]+/g, '$1');
  s = s.replace(/[，、]\s*[，、]/g, '、');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/[ \t]+([，。；：、！？])/g, '$1');
  s = s.replace(/（\s*）/g, '');
  s = s.replace(/「\s*」/g, '');
  return s.trim();
}

/**
 * Validate AI JSON against enums + pack; drop invalid fields → null means use rule fallback.
 */
function validateAiResponse(raw, pack, ruleLesson) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'bad_json' };
  }

  let mechanism = MECHANISM_KEYS.includes(raw.mechanism) ? raw.mechanism : null;
  let alt = MECHANISM_KEYS.includes(raw.alt) ? raw.alt : null;
  if (alt && mechanism && alt === mechanism) alt = null;

  const signals = {};
  const rawSig = raw.signals && typeof raw.signals === 'object' ? raw.signals : {};
  for (const b of SIGNAL_BLOCKS) {
    const v = rawSig[b];
    if (VERDICTS.includes(v)) signals[b] = v;
    else {
      // rule fallback for this block
      const fromRule = (ruleLesson && ruleLesson.signals || []).find(s => s.block === b);
      signals[b] = (fromRule && fromRule.verdict) || 'neutral';
    }
  }

  let selfConfidence = CONF_LEVELS.includes(raw.selfConfidence) ? raw.selfConfidence : 'mid';

  let unitForm = typeof raw.unitForm === 'string' ? raw.unitForm.trim().slice(0, 28) : '';
  let narrativeZh = typeof raw.narrativeZh === 'string' ? raw.narrativeZh.trim() : '';
  // strip markdown fences / excessive length
  narrativeZh = narrativeZh.replace(/^```[\s\S]*?```/g, '').trim();
  if (narrativeZh.length > 900) narrativeZh = narrativeZh.slice(0, 900);
  narrativeZh = scrubNarrativeZh(narrativeZh);
  if (unitForm) unitForm = scrubNarrativeZh(unitForm).slice(0, 28);

  // Soft numeric/name check: if narrative invents a 2+ digit number not in pack, trim to safe
  if (narrativeZh) {
    const allowedNums = collectAllowedNumbers(pack);
    const suspicious = narrativeZh.match(/\d+\.?\d*/g) || [];
    const bad = suspicious.filter((n) => {
      if (n.length <= 1) return false; // allow 0/1 style
      if (allowedNums.has(n)) return false;
      // allow percentages like 56 if 56 in pack
      const asInt = String(parseInt(n, 10));
      if (allowedNums.has(asInt)) return false;
      return true;
    });
    if (bad.length >= 3) {
      // too many invented numbers — drop narrative, keep structure
      narrativeZh = '';
    }
  }

  if (!mechanism && ruleLesson && ruleLesson.mechanism && ruleLesson.mechanism.key) {
    mechanism = ruleLesson.mechanism.key;
  }
  if (!mechanism) mechanism = 'limited_contrast';

  if (!narrativeZh || narrativeZh.length < 12) {
    return {
      ok: false,
      reason: 'weak_narrative',
      mechanism,
      alt,
      signals,
      selfConfidence,
    };
  }

  return {
    ok: true,
    mechanism,
    alt,
    signals,
    unitForm,
    narrativeZh,
    selfConfidence,
  };
}

async function callDeepSeek(pack) {
  const key = process.env.DEEPSEEK_API_KEY || '';
  if (key.length < 10) {
    return { ok: false, reason: 'no_key' };
  }
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: JSON.stringify(pack) },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    response_format: { type: 'json_object' },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { ok: false, reason: 'http_' + r.status + '_non_json' };
    }
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ('http_' + r.status);
      return { ok: false, reason: String(msg).slice(0, 120) };
    }
    const content = data.choices && data.choices[0] && data.choices[0].message
      && data.choices[0].message.content;
    const parsed = extractJson(content);
    if (!parsed) return { ok: false, reason: 'parse_fail' };
    const usage = data.usage || null;
    return {
      ok: true,
      raw: parsed,
      model: data.model || MODEL,
      usage: usage ? {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      } : null,
    };
  } catch (e) {
    const reason = e.name === 'AbortError' ? 'timeout' : (e.message || 'fetch_error');
    return { ok: false, reason: String(reason).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

function applyValidatedToReview(review, validated, meta = {}) {
  if (!review || !validated) return review;
  const at = new Date().toISOString();
  const aiAttribution = {
    ok: !!validated.ok,
    source: 'deepseek',
    model: meta.model || MODEL,
    at,
    narrRev: validated.ok ? AI_NARR_REV : null,
    selfConfidence: validated.selfConfidence || null,
    mechanism: validated.mechanism || null,
    alt: validated.alt || null,
    signals: validated.signals || null,
    unitForm: validated.unitForm || '',
    narrativeZh: validated.ok ? (validated.narrativeZh || '') : '',
    usage: meta.usage || null,
    reason: validated.ok ? null : (validated.reason || meta.reason || 'failed'),
  };
  review.aiAttribution = aiAttribution;

  if (!validated.ok) return review;

  // Update lessonTags structure (confidence blend uses these tags; narrative display-only)
  if (review.lessonTags) {
    const prev = review.lessonTags.mechanism || {};
    review.lessonTags.mechanism = {
      key: validated.mechanism,
      labelZh: MECHANISM_ZH[validated.mechanism] || prev.labelZh || '解读',
      strength: prev.strength || 'moderate',
      direction: prev.direction || review.result || null,
      text: scrubNarrativeZh(validated.narrativeZh || prev.text || ''),
      source: 'deepseek',
    };
    if (validated.signals) {
      const next = [];
      for (const b of SIGNAL_BLOCKS) {
        const prevSig = (review.lessonTags.signals || []).find(s => s.block === b) || {};
        next.push({
          block: b,
          verdict: validated.signals[b] || prevSig.verdict || 'neutral',
          strength: prevSig.strength || 'weak',
          lean: prevSig.lean != null ? prevSig.lean : undefined,
          source: 'deepseek',
        });
      }
      review.lessonTags.signals = next;
    }
    review.lessonTags.ai = {
      selfConfidence: validated.selfConfidence,
      alt: validated.alt,
      unitForm: validated.unitForm,
    };
  }

  // Patch main_explanations angle for UI
  const angles = review.angles || [];
  const main = angles.find(a => a.key === 'main_explanations');
  if (main) {
    main.aiNarrativeZh = validated.narrativeZh;
    main.aiUnitForm = validated.unitForm || '';
    main.aiSelfConfidence = validated.selfConfidence;
    main.aiMechanism = validated.mechanism;
    main.aiAlt = validated.alt;
    // Prefer AI narrative as display text; keep items for tags
    main.text = validated.narrativeZh;
    if (validated.mechanism && main.items) {
      const chosen = main.items.find(i => i.role === 'chosen');
      if (chosen) {
        chosen.key = validated.mechanism;
        chosen.ai = true;
      }
      if (validated.alt) {
        let competing = main.items.find(i => i.role === 'competing');
        if (competing) {
          competing.key = validated.alt;
          competing.ai = true;
        }
      }
    }
    main.chosenKey = validated.mechanism;
  }

  return review;
}

function countNarrSegs(text) {
  return String(text || '')
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4).length;
}

function isShortNarrative(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < MIN_NARR_CHARS) return true;
  if (countNarrSegs(t) < MIN_NARR_SEGS) return true;
  return false;
}

function playersOnDisk(review) {
  if (!review || !review.fixtureId) return false;
  try {
    const fp = require('./fixture-players');
    const cached = fp.loadCached(review.fixtureId);
    return !!(cached && (cached.home || cached.away));
  } catch (_) {
    return false;
  }
}

function needsAiEnrich(review) {
  if (!review || !review.ok) return false;
  if (!apiKeyPresent()) return false;
  if (!review.hasActualStats) return false;
  if (!review.ft || !review.result) return false;
  const ai = review.aiAttribution;
  if (ai && ai.ok && ai.narrativeZh) {
    const rev = Number(ai.narrRev || 0);
    // 1.9.56: English Lean/mechanism codes leaked into user-facing narrative → re-enrich
    if (narrativeHasEnglishLeak(ai.narrativeZh)) return true;
    // Old short cache or pre-1.9.56 rev → refresh
    if (rev >= AI_NARR_REV && !isShortNarrative(ai.narrativeZh)) return false;
  }
  if (ai && ai.ok === false && ai.at) {
    const age = Date.now() - Date.parse(ai.at);
    const reason = String(ai.reason || '');
    // Soft gate: players_pending should re-try as soon as disk cache appears,
    // not wait the hard 6h backoff (race: review built before players landed).
    if (reason === 'players_pending') {
      if (playersOnDisk(review)) return true;
      if (Number.isFinite(age) && age < PLAYERS_PENDING_RETRY_MS) return false;
      // After soft wait, still try (enrich may allowWithoutPlayers)
      return true;
    }
    if (Number.isFinite(age) && age < RETRY_MS) return false;
  }
  return true;
}

/**
 * Load players from disk cache only (no AF fetch) for evidence pack.
 */
function loadPlayersForReview(review) {
  try {
    const fp = require('./fixture-players');
    if (review.fixtureId) {
      const cached = fp.loadCached(review.fixtureId);
      if (cached && (cached.home || cached.away)) return cached;
    }
    // try via matchId index
    if (review.matchId && typeof fp.getFixturePlayers === 'function') {
      // loadCached path only — avoid network in enrich
    }
  } catch (_) {}
  return null;
}

/**
 * One DeepSeek call; mutate+return review with aiAttribution. Never throws.
 */
async function enrichWithDeepSeek(review, opts = {}) {
  if (!review || !review.ok) return review;
  if (!opts.force && !needsAiEnrich(review)) return review;
  if (!apiKeyPresent()) {
    if (!review.aiAttribution) {
      review.aiAttribution = { ok: false, reason: 'no_key', at: new Date().toISOString() };
    }
    return review;
  }

  let players = opts.players || null;
  if (!players) players = loadPlayersForReview(review);

  // Product: call when FT stats+players ready. Prefer waiting briefly for players;
  // if still missing after PLAYERS_PENDING_GIVE_UP_MS (or allowWithoutPlayers), call with empty pack.
  if (!players && review.fixtureId && !opts.allowWithoutPlayers) {
    const prev = review.aiAttribution;
    const prevPending = prev && prev.ok === false && prev.reason === 'players_pending' && prev.at;
    const pendingAge = prevPending ? (Date.now() - Date.parse(prev.at)) : 0;
    const giveUp = Number.isFinite(pendingAge) && pendingAge >= PLAYERS_PENDING_GIVE_UP_MS;
    if (!giveUp) {
      review.aiAttribution = {
        ok: false,
        reason: 'players_pending',
        at: (prevPending && prev.at) || new Date().toISOString(),
      };
      return review;
    }
    // fall through: allowWithoutPlayers after wait
  }

  try {
    const pack = buildEvidencePack(review, players);
    const called = await callDeepSeek(pack);
    if (!called.ok) {
      console.warn('deepseek-review call failed', called.reason);
      review.aiAttribution = {
        ok: false,
        reason: called.reason || 'call_failed',
        at: new Date().toISOString(),
        source: 'deepseek',
      };
      return review;
    }
    const validated = validateAiResponse(called.raw, pack, review.lessonTags);
    if (!validated.ok) {
      console.warn('deepseek-review validate', validated.reason);
      review.aiAttribution = {
        ok: false,
        reason: validated.reason || 'validate_fail',
        at: new Date().toISOString(),
        source: 'deepseek',
        model: called.model,
        usage: called.usage,
        mechanism: validated.mechanism || null,
      };
      return review;
    }
    applyValidatedToReview(review, validated, { model: called.model, usage: called.usage });
    console.log('deepseek-review ok', review.matchId, 'tokens', called.usage && called.usage.total_tokens);
  } catch (e) {
    console.warn('deepseek-review error', e.message);
    review.aiAttribution = {
      ok: false,
      reason: String(e.message || 'error').slice(0, 120),
      at: new Date().toISOString(),
    };
  }
  return review;
}

module.exports = {
  MECHANISM_KEYS,
  MECHANISM_ZH,
  LEAN_FIELD_ZH,
  SIGNAL_BLOCKS,
  SIGNAL_BLOCK_ZH,
  VERDICTS,
  MODEL,
  MAX_TOKENS,
  AI_NARR_REV,
  MIN_NARR_CHARS,
  apiKeyPresent,
  apiKeyLen,
  buildEvidencePack,
  validateAiResponse,
  callDeepSeek,
  applyValidatedToReview,
  needsAiEnrich,
  playersOnDisk,
  isShortNarrative,
  narrativeHasEnglishLeak,
  scrubNarrativeZh,
  enrichWithDeepSeek,
  loadPlayersForReview,
  topPlayersByPos,
};
