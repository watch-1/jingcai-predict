/**
 * DeepSeek AI 赛前解读 (1.9.70)
 * Local rules + selective speaking remain source of truth; model polishes mid-length Chinese.
 * Compact evidence pack → one low-token call → cache per matchId.
 * 1.9.61: feed compressed player recent-form slice (not full warehouse).
 * 1.9.67–1.9.68: narrative focus = process/SoS/players/硬仗/伤停；盘口最多一句。
 * 1.9.70: consumer-facing copy — scrub internal/meta wording on display + prompts;
 *         old cached narratives cleaned without mass DeepSeek regen (AI_PREMATCH_REV stays 3).
 * Never invent odds; never log DEEPSEEK_API_KEY.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const MODEL = 'deepseek-chat';
const MAX_TOKENS = 680;
const TEMPERATURE = 0.2;
const API_URL = 'https://api.deepseek.com/chat/completions';
const AI_PREMATCH_REV = 3;
const MIN_NARR_CHARS = 160;
const MIN_NARR_LINES = 6;
const RETRY_MS = 6 * 60 * 60 * 1000;
const LEAN_ZH = { h: '主胜', d: '平局', a: '客胜' };
const SPEAK_ZH = { amplify: '额外表态', align: '与盘口一致', abstain: '观望', pending: '加载中' };

function apiKeyPresent() {
  return (process.env.DEEPSEEK_API_KEY || '').length > 10;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function leanZh(v) {
  if (v == null || v === '') return null;
  return LEAN_ZH[v] || String(v);
}

function pct(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v) * 100);
}

function countLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4).length;
}

function narrativeHasEnglishLeak(text) {
  const t = String(text || '');
  if (/\b(processLean|formLean|marketLean|rankLean|speakMode|shockSignals)\b/.test(t)) return true;
  if (/\b(Lean|amplify|abstain)\b/.test(t) && /[A-Za-z]{4,}/.test(t)) return true;
  if (/\b(home|away)\s+(win|draw)\b/i.test(t)) return true;
  return false;
}

function scrubNarrativeZh(text) {
  let t = String(text || '');
  t = t.replace(/\bprocessLean\b/g, '过程倾向')
    .replace(/\bformLean\b/g, '状态倾向')
    .replace(/\bmarketLean\b/g, '盘口倾向')
    .replace(/\brankLean\b/g, '排名倾向')
    .replace(/\bspeakMode\b/g, '表态方式')
    .replace(/\bamplified?\b/gi, '额外表态')
    .replace(/\babstain\b/gi, '观望')
    .replace(/\balign\b/gi, '与盘口一致');

  // 1.9.70: strip internal / developer / meta voice so copy reads as a consumer sports app
  t = t
    .replace(/本程序硬仗记忆\s*[·•]?\s*非千篇一律\s*API/g, '')
    .replace(/非千篇一律\s*API/g, '')
    .replace(/本程序硬仗记忆/g, '')
    .replace(/硬仗记忆上/g, '硬仗表现上')
    .replace(/硬仗记忆/g, '硬仗表现')
    .replace(/已引用自有球员近场表[^。\n；;]*/g, '')
    .replace(/自有球员近场表显示/g, '近几场球员表现显示')
    .replace(/自有球员近场表/g, '近几场球员表现')
    .replace(/球员近场表/g, '近几场球员表现')
    .replace(/全文仅[此次]一句[^。\n；;]*/g, '')
    .replace(/仅此一句[^。\n；;]*/g, '')
    .replace(/本地规则为真相源[^。\n；;]*/g, '')
    .replace(/本地规则[^。\n；;]{0,24}真相源[^。\n；;]*/g, '')
    .replace(/真相源[^。\n；;]*/g, '')
    .replace(/本地规则[^。\n；;]*/g, '')
    .replace(/AI\s*仅作中文解说[^。\n；;]*/g, '')
    .replace(/AI\s*仅作[^。\n；;]*/g, '')
    .replace(/分析参考非购彩建议[。.]?/g, '')
    .replace(/不含投注建议[。.]?/g, '')
    .replace(/非购彩建议[。.]?/g, '');

  // tidy leftover punctuation / blank lines after removals
  t = t
    .replace(/[，,]\s*[。.]/g, '。')
    .replace(/[，,]\s*$/gm, '')
    .replace(/[ \t]*[；;]+[ \t]*/g, '；')
    .replace(/[；;]{2,}/g, '；')
    .replace(/^[；;。.\s]+/gm, '')
    .replace(/[；;]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return t;
}

/** Product footer shown under AI block (never engineering voice). */
const AI_PRODUCT_FOOTER_ZH = '以上为数据分析，仅供参考';

/**
 * Rewrite AI section HTML + narrative for consumer display.
 * Safe on old cached HTML that still embeds banned footers / slice notes.
 */
function productizeAiPrematchDisplay(ai, html) {
  const nextAi = ai && typeof ai === 'object' ? { ...ai } : ai;
  if (nextAi && nextAi.narrativeZh) {
    nextAi.narrativeZh = scrubNarrativeZh(nextAi.narrativeZh);
  }
  if (nextAi && nextAi.unitForm) {
    nextAi.unitForm = scrubNarrativeZh(nextAi.unitForm).slice(0, 40);
  }
  let outHtml = html == null ? null : String(html);
  if (outHtml) {
    // Scrub narrative text nodes inside the AI block
    outHtml = outHtml.replace(
      /(<p class="pr-ai-narr">)([\s\S]*?)(<\/p>)/g,
      (_, a, body, c) => a + scrubNarrativeZh(body.replace(/<br\s*\/?>/gi, '\n')).replace(/\n/g, '<br>') + c
    );
    // Drop engineering slice note
    outHtml = outHtml.replace(/<p class="note pr-ai-slice-note">[\s\S]*?<\/p>/g, '');
    // Replace any legacy AI footer notes with product line (once)
    outHtml = outHtml.replace(
      /<p class="note">(?:本地规则|真相源|AI\s*仅作|不含投注建议|分析参考非购彩)[\s\S]*?<\/p>/g,
      `<p class="note">${AI_PRODUCT_FOOTER_ZH}</p>`
    );
    // Soften internal subtitle
    outHtml = outHtml.replace(
      /<h4>AI赛前解读\s*<small>[^<]*<\/small><\/h4>/g,
      '<h4>AI赛前解读 <small>数据分析</small></h4>'
    );
    // Brief header leftover
    outHtml = outHtml.replace(/综合分析\s*[·•]\s*非购彩建议/g, '综合分析 · 仅供参考');
    outHtml = outHtml.replace(/仅供赛前理解，非购彩建议/g, '仅供赛前理解，仅供参考');
  }
  // Prefer re-render from scrubbed ai when possible (keeps footer/slice consistent)
  if (nextAi && nextAi.ok && nextAi.narrativeZh && outHtml && /pr-ai-prematch/.test(outHtml)) {
    outHtml = injectAiHtml(outHtml, renderAiPrematchHtml(nextAi));
  } else if (nextAi && nextAi.ok && nextAi.narrativeZh && outHtml && !/pr-ai-prematch/.test(outHtml)) {
    outHtml = injectAiHtml(outHtml, renderAiPrematchHtml(nextAi));
  }
  return { ai: nextAi, html: outHtml };
}

/**
 * Skip AI when evidence is too thin (save tokens).
 */
function evidenceThickness(report) {
  if (!report || !report.ok) return 0;
  const sec = report.sections || {};
  let n = 0;
  if (sec.form && sec.form.hasData) n += 2;
  if (sec.process && sec.process.hasData) n += 3;
  if (sec.h2h && sec.h2h.hasData) n += 1;
  if (sec.market && sec.market.available) n += 1;
  if (sec.teamEvidence && sec.teamEvidence.hasData) n += 2;
  if (sec.injuries && sec.injuries.hasData) n += 1;
  if (sec.postMatchIntel && sec.postMatchIntel.hasData) n += 1;
  if (sec.playerSlice && sec.playerSlice.hasData) n += 2;
  const concl = sec.conclusion || {};
  if (concl.lean && concl.conf != null) n += 2;
  return n;
}

function isEvidenceThickEnough(report) {
  return evidenceThickness(report) >= 5;
}

function buildEvidencePack(report, m) {
  const sec = (report && report.sections) || {};
  const concl = sec.conclusion || {};
  const pred = report.predict || {};
  const processFacts = (sec.process && sec.process.facts) || {};
  const formFacts = (sec.form && sec.form.facts) || {};
  const h2hFacts = (sec.h2h && sec.h2h.facts) || {};
  const teHome = ((sec.teamEvidence && sec.teamEvidence.home) || []).slice(0, 2).map((e) => ({
    对手: e.opponent,
    水分: e.moistureLabelZh || e.moistureTag,
    摘要: (e.briefSummaryZh || '').slice(0, 80),
    硬仗: !!e.isHardTest,
  }));
  const teAway = ((sec.teamEvidence && sec.teamEvidence.away) || []).slice(0, 2).map((e) => ({
    对手: e.opponent,
    水分: e.moistureLabelZh || e.moistureTag,
    摘要: (e.briefSummaryZh || '').slice(0, 80),
    硬仗: !!e.isHardTest,
  }));

  const sideProc = (side) => {
    const f = processFacts[side];
    if (!f || !f.averages) return null;
    const a = f.averages;
    const out = {
      样本: f.n || null,
      控球: a.possession,
      射门: a.shots,
      射正: a.shotsOnTarget,
      角球: a.corners,
      xG: a.expectedGoals,
    };
    if (f.sos && f.sos.avgSi != null) {
      out.赛程强度SI = f.sos.avgSi;
      out.赛程软硬 = f.sos.band || f.scheduleBand || null;
    }
    if (f.sosAdjusted && f.sosAdjusted.averages) {
      out.强度修正射门 = f.sosAdjusted.averages.shots;
      out.强度修正xG = f.sosAdjusted.averages.expectedGoals;
    }
    return out;
  };

  return {
    rev: AI_PREMATCH_REV,
    match: {
      id: String((m && m.id) || report.matchId || ''),
      home: (m && m.home) || report.home,
      away: (m && m.away) || report.away,
      league: (m && m.league) || report.league,
      date: (m && m.date) || report.date,
      time: (m && m.time) || report.time,
    },
    local: {
      综合倾向: leanZh(concl.lean || pred.top),
      信心百分: pct(concl.conf != null ? concl.conf : pred.conf),
      表态方式: SPEAK_ZH[concl.speakMode || pred.speakMode] || (concl.speakMode || pred.speakMode),
      表态说明: concl.speakLabel || pred.speakLabel || '',
      盘口倾向: leanZh(concl.marketLean || pred.marketLean),
      过程倾向: leanZh(concl.processLean),
      状态倾向: leanZh(concl.formLean),
      排名倾向: leanZh(concl.rankLean),
      冲突: !!concl.conflict,
      水分误导: !!concl.moistureMislead,
      理由: (concl.reasons || []).slice(0, 6),
      风险: (concl.risks || []).slice(0, 4),
      异动: (concl.shockSignals || pred.shockSignals || []).slice(0, 6),
    },
    市场: {
      文案: (sec.market && sec.market.text || '').slice(0, 80),
      可选: !!(sec.market && sec.market.available),
    },
    近况: {
      文案: (sec.form && sec.form.text || '').slice(0, 180),
      有数据: !!(sec.form && sec.form.hasData),
    },
    过程: {
      有数据: !!(sec.process && sec.process.hasData),
      倾向: leanZh(sec.process && sec.process.lean),
      主队: sideProc('home'),
      客队: sideProc('away'),
    },
    交锋: {
      有数据: !!(sec.h2h && sec.h2h.hasData),
      文案: (sec.h2h && sec.h2h.text || '').slice(0, 140),
    },
    伤停: {
      有数据: !!(sec.injuries && sec.injuries.hasData),
      文案: (sec.injuries && sec.injuries.text || '').slice(0, 120),
    },
    自有硬仗: {
      有数据: !!(sec.teamEvidence && sec.teamEvidence.hasData),
      主队: teHome,
      客队: teAway,
    },
    近几场球员表现: (function () {
      try {
        if (sec.playerSlice && sec.playerSlice.evidence) return sec.playerSlice.evidence;
        const pmdb = require('./player-match-db');
        const injuryItems = (sec.injuries && sec.injuries.items) || [];
        const slice = pmdb.buildPlayerSliceForMatch(m || report, { injuryItems });
        return pmdb.sliceToEvidencePack(slice);
      } catch (_) {
        return { 有数据: false };
      }
    })(),
    规则: {
      选择性表态: '信心≥62%可同向表态；逆盘口必须表态；综合倾向以本地结论为准',
      勿编造赔率: true,
      勿给投注建议: true,
      勿编造表外球员: true,
      盘口篇幅: '盘口/市场最多一句短评，禁止多段复述市场概率；禁止写「全文仅此一句」等元说明',
      叙事重心: '整体近期数据+球员近况+对手对比为主；盘口最多一句',
      球员表用法: '有「近几场球员表现」时，用其讨论线位/关键球员/伤停冲击；禁止编造表中未出现的球员姓名或数据；行文用「近几场球员表现显示…」，禁止写「自有球员近场表」',
      禁止元话语: '禁止「全文仅此一句/真相源/本地规则/已引用…表/AI仅作/非购彩建议」等内部或程序口吻',
    },
  };
}

function systemPrompt() {
  return [
    '你是竞足赛前情报解说助手，面向普通球迷写自然中文分析。只依据用户给的 evidence JSON，勿编造未出现的赔率、伤停、比分或球员。',
    '本地「综合倾向/信心/表态方式」是结论依据：你解释与对齐，可一句点明与盘口是否同向，但不要另发明新方向数字。',
    '叙事重心（按优先级）：①双方整体近期数据（近况战绩 + 过程控球/射门/射正/角球/xG，含赛程强度SoS与强度修正若有）；②近几场球员表现（线位、关键球员、对位对比）；③对手对比与硬仗/赛程水分；④伤停映射到关键球员影响；⑤交锋仅作补充。',
    '盘口/市场概率：最多一句短评；禁止多段复述赔率或概率推演；禁止写「全文仅此一句」「仅此一句」等元说明。',
    '若 evidence 含「近几场球员表现」：必须用表中姓名/线位/射门助攻等讨论关键球员与伤停冲击；禁止编造表中未出现的球员；行文用「近几场球员表现显示…」，禁止「自有球员近场表」「已引用…表」。',
    '禁止程序/内部口吻：勿写「真相源」「本地规则」「AI仅作」「非购彩建议」「不含投注建议」「本程序」「数据库」「引用表」等。',
    '输出严格 JSON（无 markdown）：',
    '{',
    '  "directionZh": "主胜|平局|客胜|观望",',
    '  "confidencePct": <0-100整数，贴近本地信心百分>,',
    '  "alignWithLocal": true|false,',
    '  "unitForm": "<一句短评，≤28字，纯中文>",',
    '  "narrativeZh": "<6–10行纯中文赛前解读，用\\n分行>"',
    '}',
    'narrativeZh 硬性要求：',
    '1) 全程纯中文（可保留 xG 等常见缩写与队名）；禁止英文 Lean 码、camelCase、speakMode、home/away win 等；',
    '2) 主体写过程对比、球员近况、伤停冲击、硬仗表现；盘口/市场最多一句；有球员近况时至少点名1–2名关键球员或线位对比；伤停须尽量落到具体关键人；',
    '3) 至少6行；说少而准；结尾可用一句用户向免责「以上为数据分析，仅供参考」（勿写非购彩/投注建议字样）；',
    '4) directionZh 应与本地综合倾向一致；若本地为观望则写观望；confidencePct 贴近本地信心百分（±5 可）。',
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

function validateAiResponse(raw, pack) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'empty' };
  const localLean = pack && pack.local && pack.local.综合倾向;
  const localConf = pack && pack.local && pack.local.信心百分;
  let directionZh = String(raw.directionZh || raw.direction || '').trim();
  const allowed = new Set(['主胜', '平局', '客胜', '观望']);
  if (!allowed.has(directionZh)) {
    // map leftovers
    if (/主/.test(directionZh)) directionZh = '主胜';
    else if (/客/.test(directionZh)) directionZh = '客胜';
    else if (/平/.test(directionZh)) directionZh = '平局';
    else if (/观望|不表态/.test(directionZh)) directionZh = '观望';
    else directionZh = localLean || '观望';
  }
  // Align to local when possible
  if (localLean && directionZh !== '观望' && pack.local.表态方式 === '观望') {
    directionZh = '观望';
  } else if (localLean && directionZh !== localLean && pack.local.表态方式 === '额外表态') {
    // keep AI note but force display direction to local
    directionZh = localLean;
  }
  let confidencePct = Number(raw.confidencePct);
  if (!Number.isFinite(confidencePct)) confidencePct = localConf != null ? localConf : 50;
  confidencePct = Math.max(0, Math.min(100, Math.round(confidencePct)));
  if (localConf != null && Math.abs(confidencePct - localConf) > 12) {
    confidencePct = localConf;
  }
  let narrativeZh = scrubNarrativeZh(raw.narrativeZh || raw.narrative || '');
  if (narrativeHasEnglishLeak(narrativeZh)) {
    narrativeZh = scrubNarrativeZh(narrativeZh);
  }
  if (narrativeZh.length < MIN_NARR_CHARS || countLines(narrativeZh) < MIN_NARR_LINES) {
    return {
      ok: false,
      reason: 'weak_narrative',
      directionZh,
      confidencePct,
      narrativeZh,
    };
  }
  if (narrativeHasEnglishLeak(narrativeZh)) {
    return { ok: false, reason: 'english_leak', directionZh, confidencePct, narrativeZh };
  }
  const unitForm = scrubNarrativeZh(String(raw.unitForm || '').slice(0, 40));
  return {
    ok: true,
    directionZh,
    confidencePct,
    alignWithLocal: raw.alignWithLocal !== false,
    unitForm,
    narrativeZh,
  };
}

async function callDeepSeek(pack) {
  const key = process.env.DEEPSEEK_API_KEY || '';
  if (key.length < 10) return { ok: false, reason: 'no_key' };
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
  const t = setTimeout(() => ctrl.abort(), 28000);
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

function renderAiPrematchHtml(ai) {
  if (!ai) return '';
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (ai.pending) {
    return `<section class="pr-sec pr-ai-prematch pr-ai-pending"><h4>AI赛前解读 <small>生成中</small></h4>` +
      `<p class="note">正在汇总近期数据、球员表现与伤停等信息并生成解读…</p></section>`;
  }
  if (!ai.ok || !ai.narrativeZh) {
    if (ai.reason === 'thin_evidence' || ai.reason === 'skipped') return '';
    return '';
  }
  const narr = scrubNarrativeZh(ai.narrativeZh);
  const unit = ai.unitForm ? scrubNarrativeZh(ai.unitForm) : '';
  let h = `<section class="pr-sec pr-ai-prematch"><h4>AI赛前解读 <small>数据分析</small></h4>`;
  h += `<div class="pr-ai-pre-hd">`;
  h += `<span class="pmr-tag ok">${esc(ai.directionZh || '解读')}</span>`;
  if (ai.confidencePct != null) h += `<span class="pr-ai-conf">信心 ${esc(String(ai.confidencePct))}%</span>`;
  if (unit) h += `<span class="pr-ai-unit">${esc(unit)}</span>`;
  h += `</div>`;
  h += `<p class="pr-ai-narr">${esc(narr).replace(/\n/g, '<br>')}</p>`;
  h += `<p class="note">${AI_PRODUCT_FOOTER_ZH}</p></section>`;
  return h;
}

function injectAiHtml(reportHtml, aiHtml) {
  if (!reportHtml) return aiHtml || '';
  if (!aiHtml) return reportHtml;
  if (/pr-ai-prematch/.test(reportHtml)) {
    return reportHtml.replace(/<section class="pr-sec pr-ai-prematch[\s\S]*?<\/section>/, aiHtml);
  }
  // Insert after conclusion section
  const re = /(<section class="pr-sec pr-concl">[\s\S]*?<\/section>)/;
  if (re.test(reportHtml)) {
    return reportHtml.replace(re, `$1${aiHtml}`);
  }
  return reportHtml + aiHtml;
}

function needsAiEnrich(report) {
  if (!report || !report.ok) return false;
  if (!apiKeyPresent()) return false;
  if (!isEvidenceThickEnough(report)) return false;
  const ai = report.aiPrematch;
  if (ai && ai.ok && ai.narrativeZh && Number(ai.rev || 0) >= AI_PREMATCH_REV) {
    if (narrativeHasEnglishLeak(ai.narrativeZh)) return true;
    if (countLines(ai.narrativeZh) < MIN_NARR_LINES) return true;
    return false;
  }
  if (ai && ai.pending) return true; // still generating / interrupted
  if (ai && ai.ok === false && ai.at) {
    const age = Date.now() - Date.parse(ai.at);
    if (ai.reason === 'thin_evidence' || ai.reason === 'skipped') return false;
    if (ai.reason === 'generating') return true;
    if (Number.isFinite(age) && age < RETRY_MS) return false;
  }
  return true;
}

/**
 * Mutate report with aiPrematch + html. Never throws.
 */
async function enrichWithDeepSeek(report, m, opts = {}) {
  if (!report || !report.ok) return report;
  if (!opts.force && !needsAiEnrich(report)) return report;
  try {
    if (!require('./feature-flags').isEnabled('ai_prematch')) {
      report.aiPrematch = { ok: false, reason: 'disabled', at: new Date().toISOString(), rev: AI_PREMATCH_REV };
      return report;
    }
  } catch (_) { /* flags optional */ }
  if (!apiKeyPresent()) {
    report.aiPrematch = { ok: false, reason: 'no_key', at: new Date().toISOString(), rev: AI_PREMATCH_REV };
    return report;
  }
  if (!isEvidenceThickEnough(report)) {
    report.aiPrematch = { ok: false, reason: 'thin_evidence', at: new Date().toISOString(), rev: AI_PREMATCH_REV };
    return report;
  }
  try {
    // clear pending flag so concurrent polls do not pile up forever
    if (report.aiPrematch && report.aiPrematch.pending) {
      report.aiPrematch = { ...report.aiPrematch, pending: false, reason: 'calling' };
    }
    let playerSliceUsed = false;
    try {
      const pmdb = require('./player-match-db');
      const injuryItems = (report.sections && report.sections.injuries && report.sections.injuries.items) || [];
      const slice = pmdb.buildPlayerSliceForMatch(m || report, { injuryItems });
      if (!report.sections) report.sections = {};
      report.sections.playerSlice = {
        hasData: !!slice.hasData,
        noteZh: slice.noteZh,
        caps: slice.caps,
        evidence: pmdb.sliceToEvidencePack(slice),
        keyPlayers: (slice.keyPlayers || []).slice(0, 6),
      };
      playerSliceUsed = !!slice.hasData;
    } catch (e) {
      console.warn('deepseek-prematch playerSlice', e.message);
    }
    const pack = buildEvidencePack(report, m || report);
    const called = await callDeepSeek(pack);
    if (!called.ok) {
      console.warn('deepseek-prematch call failed', called.reason);
      report.aiPrematch = {
        ok: false,
        reason: called.reason || 'call_failed',
        at: new Date().toISOString(),
        rev: AI_PREMATCH_REV,
        source: 'deepseek',
      };
      return report;
    }
    const validated = validateAiResponse(called.raw, pack);
    if (!validated.ok) {
      console.warn('deepseek-prematch validate', validated.reason);
      report.aiPrematch = {
        ok: false,
        reason: validated.reason || 'validate_fail',
        at: new Date().toISOString(),
        rev: AI_PREMATCH_REV,
        source: 'deepseek',
        model: called.model,
        usage: called.usage,
      };
      return report;
    }
    report.aiPrematch = {
      ok: true,
      source: 'deepseek',
      model: called.model || MODEL,
      at: new Date().toISOString(),
      rev: AI_PREMATCH_REV,
      directionZh: validated.directionZh,
      confidencePct: validated.confidencePct,
      alignWithLocal: validated.alignWithLocal,
      unitForm: validated.unitForm,
      narrativeZh: validated.narrativeZh,
      usage: called.usage,
      playerSliceUsed,
      reason: null,
    };
    const aiHtml = renderAiPrematchHtml(report.aiPrematch);
    report.html = injectAiHtml(report.html || '', aiHtml);
    if (!report.sections) report.sections = {};
    report.sections.aiPrematch = {
      hasData: true,
      directionZh: validated.directionZh,
      confidencePct: validated.confidencePct,
      unitForm: validated.unitForm,
      narrativeZh: validated.narrativeZh,
    };
    console.log('deepseek-prematch ok', report.matchId, 'tokens', called.usage && called.usage.total_tokens);
  } catch (e) {
    console.warn('deepseek-prematch error', e.message);
    report.aiPrematch = {
      ok: false,
      reason: String(e.message || 'error').slice(0, 120),
      at: new Date().toISOString(),
      rev: AI_PREMATCH_REV,
    };
  }
  return report;
}

function markPending(report) {
  if (!report) return report;
  report.aiPrematch = {
    ok: false,
    pending: true,
    reason: 'generating',
    at: new Date().toISOString(),
    rev: AI_PREMATCH_REV,
  };
  report.html = injectAiHtml(report.html || '', renderAiPrematchHtml(report.aiPrematch));
  return report;
}

module.exports = {
  MODEL,
  AI_PREMATCH_REV,
  apiKeyPresent,
  evidenceThickness,
  isEvidenceThickEnough,
  buildEvidencePack,
  validateAiResponse,
  callDeepSeek,
  needsAiEnrich,
  enrichWithDeepSeek,
  renderAiPrematchHtml,
  injectAiHtml,
  markPending,
  narrativeHasEnglishLeak,
  scrubNarrativeZh,
  productizeAiPrematchDisplay,
  AI_PRODUCT_FOOTER_ZH,
};
