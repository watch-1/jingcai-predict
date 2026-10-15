/**
 * Comprehensive pre-match intelligence briefing + conclusion.
 * Facts-only template assembly (no LLM). Odds are ONE input among many.
 *
 * Quota (API-Football free ~100 req/day):
 * - Reports cached on disk per matchId (default TTL 4h; 90min when kickoff < 6h).
 * - Prefer local history (form/H2H) and sporttery ranks — zero AF cost.
 * - H2H: local JSONL first; if empty, API-Football /fixtures/headtohead (no `last` param),
 *   disk-cached ≥24h under data/live-stats/h2h/; team ids cached forever.
 * - Standings: reuse league-tables disk/mem cache (6h).
 * - Injuries: at most 1 AF call per uncached report when fixture is already mapped
 *   (or newly resolved) AND remaining quota > RESERVE; injuries cached 6h by fixtureId.
 * - Never invent injuries/scores/news; missing data → explicit「暂无可靠来源」+ lower confidence.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');
const matchStats = require('./match-stats');
const leagueTables = require('./league-tables');

const REPORT_DIR = () => path.join(DATA_DIR, 'predict-reports');
const INJ_DIR = () => path.join(DATA_DIR, 'predict-reports', 'injuries');
const TTL_DEFAULT_MS = 4 * 60 * 60 * 1000;
const TTL_NEAR_MS = 90 * 60 * 1000;
const INJ_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTA_RESERVE = 20; // keep headroom for live-stats / standings

const LEAGUE_AF = [
  { keys: ['英超'], id: 39, key: 'epl' },
  { keys: ['西甲'], id: 140, key: 'laliga' },
  { keys: ['德甲'], id: 78, key: 'bundesliga' },
  { keys: ['意甲'], id: 135, key: 'seriea' },
  { keys: ['法甲'], id: 61, key: 'ligue1' },
  { keys: ['中超'], id: 169, key: 'csl' },
  { keys: ['英冠'], id: 40, key: 'championship' },
  { keys: ['荷甲'], id: 88, key: 'eredivisie' },
];

const PICK = { h: '主胜', d: '平局', a: '客胜' };
const HHAD = { h: '让胜', d: '让平', a: '让负' };
/** Bump when chip labels / explain UX changes so cached HTML is re-patched. */
const CHIPS_UI_REV = 4; // 1.9.27 selective speaking chips

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function implied(o) {
  if (!o || !(o.h > 1) || !(o.d > 1) || !(o.a > 1)) return null;
  const inv = { h: 1 / o.h, d: 1 / o.d, a: 1 / o.a };
  const s = inv.h + inv.d + inv.a;
  return { h: inv.h / s, d: inv.d / s, a: inv.a / s, payout: 1 / s };
}
function order(p) { return ['h', 'd', 'a'].sort((x, y) => p[y] - p[x]); }
function pct(v, d = 0) { return (Number(v) * 100).toFixed(d) + '%'; }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mapLeague(name) {
  const s = String(name || '');
  return LEAGUE_AF.find(l => l.keys.some(k => s.includes(k))) || null;
}

function parseRank(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/(\d+)\s*\]?\s*$/) || s.match(/(\d+)/);
  if (!m) return { label: s.replace(/^\[|\]$/g, ''), n: null };
  return { label: s.replace(/^\[|\]$/g, ''), n: Number(m[1]) };
}

function parseFt(ft) {
  const m = String(ft || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
  if (!m) return null;
  return { h: Number(m[1]), a: Number(m[2]) };
}

function formGoals(form, teamId) {
  const tid = String(teamId || '');
  let gf = 0, ga = 0, n = 0;
  for (const row of (form && form.matches) || []) {
    const sc = parseFt(row.ft);
    if (!sc) continue;
    const isHome = String(row.homeTeamId) === tid;
    const isAway = String(row.awayTeamId) === tid;
    if (!isHome && !isAway) continue;
    n++;
    if (isHome) { gf += sc.h; ga += sc.a; }
    else { gf += sc.a; ga += sc.h; }
  }
  return { gf, ga, n, avgGf: n ? gf / n : null, avgGa: n ? ga / n : null };
}

function formStrip(form) {
  return ((form && form.matches) || []).map(m => m.outcome || '?').join('');
}

function findStandingRow(standingsPayload, teamZh, teamEnHints) {
  if (!standingsPayload || !standingsPayload.tables) return null;
  const hints = [teamZh, ...(teamEnHints || [])].map(s => String(s || '').trim()).filter(Boolean);
  for (const table of standingsPayload.tables) {
    for (const row of table.rows || []) {
      for (const h of hints) {
        if (!h) continue;
        if (row.teamZh === h || row.team === h) return row;
        if (row.teamZh && (row.teamZh.includes(h) || h.includes(row.teamZh))) return row;
        if (row.team && (row.team.toLowerCase().includes(h.toLowerCase()) || h.toLowerCase().includes(row.team.toLowerCase()))) return row;
      }
    }
  }
  return null;
}

function crestsEn(teamId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const row = j.teams && j.teams[String(teamId)];
    return (row && row.en) || '';
  } catch { return ''; }
}

function reportPath(matchId) {
  return path.join(REPORT_DIR(), String(matchId) + '.json');
}
function injPath(fixtureId) {
  return path.join(INJ_DIR(), String(fixtureId) + '.json');
}

function kickoffMs(m) {
  if (!m || !m.date) return NaN;
  return new Date(`${m.date}T${String(m.time || '12:00').slice(0, 5)}:00+08:00`).getTime();
}

function ttlFor(m) {
  const ko = kickoffMs(m);
  if (!Number.isFinite(ko)) return TTL_DEFAULT_MS;
  const left = ko - Date.now();
  if (left > 0 && left < 6 * 3600e3) return TTL_NEAR_MS;
  return TTL_DEFAULT_MS;
}

function loadCachedReport(matchId, m) {
  const j = readJson(reportPath(matchId), null);
  if (!j || !j.payload || !j.at) return null;
  if (Date.now() - j.at > ttlFor(m)) return null;
  const patched = patchCachedChips({ ...j.payload, cached: true, cacheAgeSec: Math.round((Date.now() - j.at) / 1000) });
  return patched;
}

function saveReport(matchId, payload) {
  try { writeJson(reportPath(matchId), { at: Date.now(), payload }); }
  catch (e) { console.warn('predict-report cache write failed', e.message); }
}

function quotaOk() {
  const q = leagueTables.getQuota && leagueTables.getQuota();
  const liveQ = (() => { try { return require('./live-stats').getQuota(); } catch { return null; } })();
  const rem = (liveQ && liveQ.remaining != null) ? liveQ.remaining
    : (q && q.remaining != null) ? q.remaining : null;
  if (rem == null) return true; // unknown — allow cautious use
  return rem > QUOTA_RESERVE;
}

async function tryResolveFixture(m) {
  try {
    const live = require('./live-stats');
    if (!live.resolveFixture) return null;
    if (!quotaOk() && !hasMappedFixture(m)) return null;
    return await live.resolveFixture({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      home: m.home,
      away: m.away,
      date: m.date,
      time: m.time,
    });
  } catch (e) {
    console.warn('predict-report resolveFixture', e.message);
    return null;
  }
}

function hasMappedFixture(m) {
  try {
    const live = require('./live-stats');
    const map = live.loadMap ? live.loadMap() : {};
    const key = m.id ? 'm:' + String(m.id) : '';
    return !!(key && map[key] && map[key].fixtureId);
  } catch { return false; }
}

async function fetchInjuriesCached(fixtureId) {
  const file = injPath(fixtureId);
  const disk = readJson(file, null);
  if (disk && disk.at && Date.now() - disk.at < INJ_TTL_MS) {
    return { ...disk.payload, cached: true };
  }
  if (!quotaOk()) {
    if (disk && disk.payload) return { ...disk.payload, cached: true, stale: true };
    return { ok: false, reason: 'quota', items: [], noteZh: '数据源配额紧张，暂未拉取伤停。' };
  }
  try {
    const live = require('./live-stats');
    const list = await live.afFetch('/injuries?fixture=' + encodeURIComponent(fixtureId));
    const rawItems = (list || []).map(row => ({
      player: (row.player && row.player.name) || '',
      playerZh: leagueTables.playerZh ? leagueTables.playerZh((row.player && row.player.name) || '') : ((row.player && row.player.name) || ''),
      type: (row.player && row.player.type) || '',
      reason: (row.player && row.player.reason) || '',
      team: (row.team && row.team.name) || '',
      teamId: row.team && row.team.id,
      teamZh: leagueTables.teamZh ? leagueTables.teamZh((row.team && row.team.name) || '') : ((row.team && row.team.name) || ''),
    }));
    const items = dedupeInjuries(rawItems);
    const payload = {
      ok: true,
      fixtureId,
      items,
      fetchedAt: new Date().toISOString(),
      noteZh: items.length ? '伤停来自第三方公开数据，可能不全或滞后。' : '第三方暂无该场伤停记录（≠确认全员健康）。',
    };
    writeJson(file, { at: Date.now(), payload });
    return payload;
  } catch (e) {
    if (disk && disk.payload) return { ...disk.payload, cached: true, stale: true, staleError: e.message };
    return { ok: false, reason: 'upstream', items: [], noteZh: '暂无可靠伤停来源：' + e.message, error: e.message };
  }
}

function nextFixturesFromPool(pool, teamId, excludeId, limit) {
  const tid = String(teamId || '');
  if (!tid || !Array.isArray(pool)) return [];
  const out = [];
  const seen = new Set();
  for (const m of pool) {
    const id = String(m.id);
    if (id === String(excludeId) || seen.has(id)) continue;
    if (String(m.homeTeamId) !== tid && String(m.awayTeamId) !== tid) continue;
    if (m.full) continue;
    seen.add(id);
    out.push(m);
  }
  return out.sort((a, b) => kickoffMs(a) - kickoffMs(b)).slice(0, limit);
}

function buildOddsBlock(m) {
  const p = implied(m.had);
  const q = implied(m.hhad);
  if (!p && !q) {
    return {
      available: false,
      text: '该场暂未开售胜平负/让球玩法，市场赔率一项暂缺。',
      pick: null,
      conf: null,
      facts: {},
    };
  }
  const base = p || q;
  const pool = p ? 'had' : 'hhad';
  const k = order(base);
  const conf = base[k[0]];
  const gap = (base[k[0]] - base[k[1]]) * 100;
  const pickText = pool === 'had' ? PICK[k[0]] : HHAD[k[0]];
  let text = '';
  if (p) {
    text += `胜平负开售赔：主 ${m.had.h.toFixed(2)} / 平 ${m.had.d.toFixed(2)} / 客 ${m.had.a.toFixed(2)}（返还约 ${pct(p.payout, 1)}）。`;
    text += `去水隐含概率：主胜 ${pct(p.h, 1)}、平局 ${pct(p.d, 1)}、客胜 ${pct(p.a, 1)}。`;
    text += `市场当前最热项为「${PICK[k[0]]}」，领先次项约 ${gap.toFixed(0)} 个百分点。`;
    if (gap < 8) text += ' 三项接近，市场分歧较大，赔率参考价值有限。';
    else if (gap < 15) text += ' 优势不算悬殊，需结合基本面交叉验证。';
    else text += ' 市场定价强弱较分明，但仍可能被伤停/轮换打乱。';
  }
  if (q && m.hhad && m.hhad.goalLine != null && m.hhad.goalLine !== '') {
    const gl = Number(m.hhad.goalLine);
    const desc = gl < 0 ? `主队让 ${Math.abs(gl)} 球` : `主队受让 ${Math.abs(gl)} 球`;
    const qk = order(q)[0];
    text += ` 让球盘（${desc}）隐含：让胜 ${pct(q.h, 1)} / 让平 ${pct(q.d, 1)} / 让负 ${pct(q.a, 1)}，倾向「${HHAD[qk]}」。`;
  }
  text += ' 【说明】赔率仅反映市场定价与资金偏好，是综合参考中的一项，绝非唯一依据。';
  return {
    available: true,
    text,
    pick: { pool, top: k[0], text: pickText, conf },
    conf,
    gap,
    p, q,
    facts: { had: m.had || null, hhad: m.hhad || null, impliedHad: p, impliedHhad: q },
  };
}

function buildBackground(m, standHome, standAway) {
  const facts = { homeRank: m.homeRank || '', awayRank: m.awayRank || '', standHome, standAway };
  const hr = parseRank(m.homeRank);
  const ar = parseRank(m.awayRank);
  const parts = [];
  parts.push(`本场为${m.league || '竞彩'}赛事：${m.home}（主）对阵 ${m.away}（客），开球 ${m.date || ''} ${m.time || ''}（北京时间）。`);
  if (hr || ar) {
    parts.push(`竞彩展示排名：主队 ${hr ? hr.label : '暂无'}，客队 ${ar ? ar.label : '暂无'}。`);
  }
  if (standHome || standAway) {
    const fmt = (r, name) => r
      ? `${name} 积分榜第 ${r.rank}（${r.played} 场 ${r.win}胜${r.draw}平${r.lose}负，积分 ${r.points}，净胜 ${r.gd >= 0 ? '+' : ''}${r.gd}）`
      : `${name} 暂无匹配到积分榜行`;
    parts.push(`联赛积分（缓存赛季）：${fmt(standHome, m.home)}；${fmt(standAway, m.away)}。`);
    if (standHome && standAway && standHome.rank && standAway.rank) {
      const diff = Math.abs(standHome.rank - standAway.rank);
      if (diff >= 8) parts.push(`双方联赛排名相差 ${diff} 位，纸面实力落差偏大，但需防杯赛/欧战轮换与强烈求生欲。`);
      else if (diff <= 2) parts.push(`双方排名接近（相差 ${diff} 位），积分形势上难分伯仲。`);
    }
  } else if (!hr && !ar) {
    parts.push('积分榜/排名：暂无可靠来源（该联赛可能未覆盖缓存积分榜，或队名未能匹配）。');
  }
  return { text: parts.join(''), facts, hasData: !!(hr || ar || standHome || standAway) };
}

function formSrcLabel(form, sideSrc) {
  const src = (form && form.source) || sideSrc || 'history';
  return srcZh(src);
}
function srcZh(src) {
  const t = String(src || 'history').split('+');
  const lab = { history: '竞彩历史库', espn: 'ESPN 公开赛程', 'api-football': 'API-Football 全赛程' };
  return t.map(x => lab[x] || x).join('+');
}

function buildForm(m, stats) {
  const hf = stats && stats.homeForm;
  const af = stats && stats.awayForm;
  const hg = formGoals(hf, m.homeTeamId);
  const ag = formGoals(af, m.awayTeamId);
  const hs = (hf && hf.summary) || { w: 0, d: 0, l: 0 };
  const as = (af && af.summary) || { w: 0, d: 0, l: 0 };
  const hn = (hf && hf.matches && hf.matches.length) || 0;
  const an = (af && af.matches && af.matches.length) || 0;
  const hSrc = formSrcLabel(hf, stats && stats.homeFormSource);
  const aSrc = formSrcLabel(af, stats && stats.awayFormSource);
  const formSource = (stats && stats.formSource) || 'history';
  const parts = [];
  if (!hn && !an) {
    parts.push('近期战绩：本地竞彩历史与全赛程补全均暂无可靠赛果，无法评估近况与进失球趋势。');
    return { text: parts.join(''), facts: { home: null, away: null }, hasData: false, source: formSource };
  }
  // Warn when still on sparse 竞彩-only samples (e.g. Club Brugge UCL-only)
  const sparseWarn = [];
  try {
    const ms = require('./match-stats');
    if (ms.formIsSparse && hn && ms.formIsSparse(hf, hn) && hSrc.indexOf('竞彩') >= 0) {
      sparseWarn.push(`${m.home} 样本偏疏（竞彩历史可能缺联赛场次），近况权重宜下调`);
    }
    if (ms.formIsSparse && an && ms.formIsSparse(af, an) && aSrc.indexOf('竞彩') >= 0) {
      sparseWarn.push(`${m.away} 样本偏疏（竞彩历史可能缺联赛场次），近况权重宜下调`);
    }
  } catch (_) {}
  if (hn) {
    parts.push(`${m.home} 近 ${hn} 场 ${hs.w}胜${hs.d}平${hs.l}负（来源 ${hSrc}）`);
    if (hg.n) parts.push(`，进 ${hg.gf} 失 ${hg.ga}（场均进 ${(hg.avgGf).toFixed(2)} / 失 ${(hg.avgGa).toFixed(2)}）`);
    parts.push('。');
  } else parts.push(`${m.home} 近期战绩暂无可靠来源。`);
  if (an) {
    parts.push(`${m.away} 近 ${an} 场 ${as.w}胜${as.d}平${as.l}负（来源 ${aSrc}）`);
    if (ag.n) parts.push(`，进 ${ag.gf} 失 ${ag.ga}（场均进 ${(ag.avgGf).toFixed(2)} / 失 ${(ag.avgGa).toFixed(2)}）`);
    parts.push('。');
  } else parts.push(`${m.away} 近期战绩暂无可靠来源。`);
  if (sparseWarn.length) parts.push(sparseWarn.join('；') + '。');
  // trend hint — skip strong claims when either side still sparse 竞彩
  const skipTrend = sparseWarn.length > 0;
  if (!skipTrend && hn >= 3 && an >= 3) {
    const hPts = hs.w * 3 + hs.d;
    const aPts = as.w * 3 + as.d;
    if (hPts - aPts >= 4) parts.push(`近况分差：主队近况明显更好（近况积分 ${hPts} vs ${aPts}）。`);
    else if (aPts - hPts >= 4) parts.push(`近况分差：客队近况更优（近况积分 ${aPts} vs ${hPts}）。`);
    else parts.push(`近况分差不大（近况积分 ${hPts} vs ${aPts}）。`);
  } else if (skipTrend && hn >= 3 && an >= 3) {
    parts.push('因样本偏疏，不作近况积分强弱对比。');
  }
  return {
    text: parts.join(''),
    facts: {
      home: { summary: hs, strip: formStrip(hf), goals: hg, n: hn, source: hSrc },
      away: { summary: as, strip: formStrip(af), goals: ag, n: an, source: aSrc },
    },
    hasData: true,
    source: formSource,
    sparse: sparseWarn.length > 0,
  };
}

function buildH2h(m, stats) {
  const h2h = stats && stats.h2h;
  const n = (h2h && h2h.matches && h2h.matches.length) || 0;
  const src = (stats && stats.h2hSource) || 'history';
  if (!n) {
    return {
      text: '交锋历史：本地历史库与第三方均暂无双方完场交锋记录，不作臆测。',
      facts: null,
      hasData: false,
      source: src,
    };
  }
  const s = h2h.summary;
  const recent = h2h.matches.slice(0, 5).map(x => `${x.date} ${x.home} ${x.ft || '-'} ${x.away}`).join('；');
  const srcLabel = src === 'api-football'
    ? '来源 API-Football（本地竞彩历史窗口内无对阵）'
    : '来源本地竞彩历史库';
  const text = `近 ${n} 次交锋（主队视角，${srcLabel}）：${m.home} ${s.homeWins}胜 ${s.draws}平 ${s.awayWins}负。最近若干场：${recent}。`;
  return {
    text,
    facts: { n, summary: s, recent: h2h.matches.slice(0, 5), source: src },
    hasData: true,
    source: src,
  };
}


const INJURY_REASON_ZH = {
  'Muscle Injury': '肌肉伤', 'Thigh Injury': '大腿伤', 'Knee Injury': '膝盖伤',
  'Ankle Injury': '脚踝伤', 'Hamstring Injury': '腘绳肌伤', 'Calf Injury': '小腿伤',
  'Groin Injury': '腹股沟伤', 'Hip Injury': '髋部伤', 'Back Injury': '背部伤',
  'Shoulder Injury': '肩部伤', 'Foot Injury': '足部伤', 'Hand Injury': '手部伤',
  'Head Injury': '头部伤', 'Rib Injury': '肋骨伤', 'Broken Leg': '腿部骨折',
  'Broken Ankle': '脚踝骨折', 'ACL Knee Ligament Injury': 'ACL 膝关节韧带伤',
  'Knock': '碰伤', 'Illness': '伤病/感冒', 'Injury': '伤病', 'Suspended': '停赛',
  'Red Card': '红牌停赛', 'Yellow Cards': '黄牌累积停赛', 'Ineligible': '无参赛资格',
  'Hernia': '疝气', 'Achilles': '跟腱伤', 'Achilles tendon injury': '跟腱伤',
  'Cruciate Ligament Injury': '十字韧带伤', 'Broken Finger': '手指骨折',
  'Muscle Strain': '肌肉拉伤', 'Sprain': '扭伤', 'Fracture': '骨折',
  'Concussion': '脑震荡', 'Unknown': '原因不明',
};

function reasonZh(reason) {
  const r = String(reason || '').trim();
  if (!r) return '';
  if (INJURY_REASON_ZH[r]) return INJURY_REASON_ZH[r];
  const low = r.toLowerCase();
  for (const [en, zh] of Object.entries(INJURY_REASON_ZH)) {
    if (en.toLowerCase() === low) return zh;
  }
  if (/red card|停赛|suspended/i.test(r)) return '停赛';
  if (/yellow/i.test(r)) return '黄牌停赛';
  if (/muscle/i.test(r)) return '肌肉伤';
  if (/thigh|hamstring/i.test(r)) return '大腿/腘绳肌伤';
  if (/knee|acl|cruciate/i.test(r)) return '膝盖伤';
  if (/ankle/i.test(r)) return '脚踝伤';
  if (/calf/i.test(r)) return '小腿伤';
  if (/groin|hernia/i.test(r)) return /hernia/i.test(r) ? '疝气' : '腹股沟伤';
  if (/hip/i.test(r)) return '髋部伤';
  if (/shoulder/i.test(r)) return '肩部伤';
  if (/back/i.test(r)) return '背部伤';
  if (/illness|virus|flu|covid/i.test(r)) return '伤病/感冒';
  return r; // keep original if unknown — never invent
}

function dedupeInjuries(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const key = [it.teamId || it.team || '', it.player || '', it.reason || it.type || '']
      .map(s => String(s).toLowerCase().trim()).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function injuryLabel(it) {
  const name = (it.playerZh && it.playerZh !== it.player) ? it.playerZh : (it.player || '?');
  const reason = reasonZh(it.reason || it.type);
  return reason ? `${name}（${reason}）` : name;
}

function buildInjuries(m, inj) {
  if (!inj || !inj.ok) {
    return {
      text: '阵容/伤停/停赛：暂无可靠来源（未匹配第三方赛事或配额受限），结论置信度已下调，请勿臆测伤停。',
      html: '',
      facts: { items: [] },
      hasData: false,
      available: false,
    };
  }
  const items = dedupeInjuries(inj.items || []).map(it => ({
    ...it,
    reasonZh: reasonZh(it.reason || it.type),
  }));
  if (!items.length) {
    return {
      text: '阵容/伤停/停赛：第三方暂无该场伤停条目（≠确认全员健康；临场名单以官方为准）。',
      html: '',
      facts: { items: [], homeEn: inj.homeEn || '', awayEn: inj.awayEn || '' },
      hasData: true,
      available: true,
      empty: true,
    };
  }
  const byTeam = new Map();
  for (const it of items) {
    const key = it.teamZh || it.team || '?';
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(it);
  }
  const parts = [`阵容/伤停/停赛明细（共 ${items.length} 人，第三方公开数据，可能不全/滞后；临场名单以官方为准）：`];
  let htmlParts = `<p class="pr-inj-lead">共 <b>${items.length}</b> 条伤停/停赛（已去重）。第三方公开数据，可能不全或滞后；临场名单以官方为准。</p>`;
  for (const [team, list] of byTeam) {
    const labs = list.map(injuryLabel);
    parts.push(`${team}（${list.length} 人）：${labs.join('、')}。`);
    htmlParts += `<div class="pr-inj-team"><b>${esc(team)}</b><span class="pr-inj-n">${list.length} 人</span><ul class="pr-inj-list">`;
    for (const it of list) {
      const name = (it.playerZh && it.playerZh !== it.player) ? it.playerZh : (it.player || '?');
      const rz = it.reasonZh || reasonZh(it.reason || it.type);
      htmlParts += `<li><span class="pr-inj-name">${esc(name)}</span>${rz ? `<span class="pr-inj-reason">${esc(rz)}</span>` : ''}</li>`;
    }
    htmlParts += `</ul></div>`;
  }
  if (inj.noteZh) parts.push(inj.noteZh);
  return {
    text: parts.join(''),
    html: htmlParts,
    facts: {
      items,
      homeEn: inj.homeEn || '',
      awayEn: inj.awayEn || '',
      homeZh: inj.homeZh || '',
      awayZh: inj.awayZh || '',
    },
    hasData: true,
    available: true,
  };
}

function buildSchedule(m, schedulePool) {
  const homeNext = nextFixturesFromPool(schedulePool, m.homeTeamId, m.id, 3);
  const awayNext = nextFixturesFromPool(schedulePool, m.awayTeamId, m.id, 3);
  const parts = [];
  const describe = (team, list, side) => {
    if (!list.length) return `${team} 后续赛程：当前列表暂无后续场次。`;
    const bits = list.map(x => {
      const isHome = String(x.homeTeamId) === String(side);
      return `${x.date || ''} ${x.time || ''} ${isHome ? '主' : '客'}场 vs ${isHome ? x.away : x.home}（${x.league || ''}）`;
    });
    return `${team} 后续：${bits.join('；')}。`;
  };
  parts.push(describe(m.home, homeNext, m.homeTeamId));
  parts.push(describe(m.away, awayNext, m.awayTeamId));
  // congestion: if next match within 4 days of this kickoff
  const ko = kickoffMs(m);
  const congest = [];
  for (const [team, list] of [[m.home, homeNext], [m.away, awayNext]]) {
    if (!list.length || !Number.isFinite(ko)) continue;
    const nxt = kickoffMs(list[0]);
    if (Number.isFinite(nxt) && Math.abs(nxt - ko) < 4 * 86400e3) {
      congest.push(`${team} 与下一场间隔不足 4 天，存在连续作战/轮换风险`);
    }
  }
  if (congest.length) parts.push(congest.join('；') + '。');
  else if (!homeNext.length && !awayNext.length) {
    return { text: '主客与日程：当前在售/赛程列表中暂无两队后续场次，连续作战情况不明。', facts: { homeNext, awayNext }, hasData: false };
  }
  return { text: parts.join(''), facts: { homeNext: homeNext.map(x => ({ id: x.id, date: x.date, time: x.time, home: x.home, away: x.away, league: x.league })), awayNext: awayNext.map(x => ({ id: x.id, date: x.date, time: x.time, home: x.home, away: x.away, league: x.league })) }, hasData: true };
}

function buildProcess(m, process) {
  if (!process || !process.available) {
    const note = (process && process.noteZh) || '近期过程数据（控球/射门/传球/角球/xG 等）暂无可靠来源。';
    return {
      text: '近期过程数据暂不可用：' + note,
      hasData: false,
      facts: process || null,
      reason: (process && process.reason) || 'unavailable',
      lean: null,
      scored: null,
      metrics: null,
    };
  }
  try {
    const ps = require('./process-stats');
    const blurb = ps.formatProcessBlurb(process, m.home, m.away);
    const scored = ps.scoreProcessLean(process);
    const facts = {
      home: process.home && process.home.ok ? {
        n: process.home.n,
        averages: process.home.averages,
      } : null,
      away: process.away && process.away.ok ? {
        n: process.away.n,
        averages: process.away.averages,
      } : null,
      noteZh: process.noteZh || '',
      metrics: (process.metrics && process.metrics.length)
        ? process.metrics
        : ps.BRIEF_METRIC_KEYS.map(k => ({ key: k, labelZh: ps.METRIC_ZH[k] })),
    };
    return {
      text: blurb || (process.noteZh || '已加载过程数据。'),
      hasData: true,
      facts,
      lean: scored.lean,
      scored,
      metrics: facts.metrics,
    };
  } catch (e) {
    return {
      text: '近期过程数据解析失败：' + e.message,
      hasData: false,
      facts: null,
      reason: 'error',
      lean: null,
      scored: null,
      metrics: null,
    };
  }
}

function synthesize(m, blocks) {
  const reasons = [];
  const risks = [];
  let score = 0; // soft score toward home(+)/away(-)/draw near 0; then map with odds
  let dataPoints = 0;

  const { background, form, h2h, injuries, schedule, market, process, postMatchIntel } = blocks;

  if (background.hasData) {
    dataPoints++;
    const hr = parseRank(m.homeRank);
    const ar = parseRank(m.awayRank);
    if (hr && ar && hr.n != null && ar.n != null) {
      if (hr.n + 3 <= ar.n) { score += 1; reasons.push(`联赛排名主队更靠前（${hr.label} vs ${ar.label}）`); }
      else if (ar.n + 3 <= hr.n) { score -= 1; reasons.push(`联赛排名客队更靠前（${ar.label} vs ${hr.label}）`); }
    }
    if (background.facts.standHome && background.facts.standAway) {
      const sh = background.facts.standHome, sa = background.facts.standAway;
      if (sh.points != null && sa.points != null && sh.points - sa.points >= 8) {
        score += 1; reasons.push(`积分形势主队更优（${sh.points} 分 vs ${sa.points} 分）`);
      } else if (sa.points != null && sh.points != null && sa.points - sh.points >= 8) {
        score -= 1; reasons.push(`积分形势客队更优（${sa.points} 分 vs ${sh.points} 分）`);
      }
    }
  } else {
    risks.push('积分/排名信息不足');
  }

  if (form.hasData) {
    dataPoints++;
    const hs = form.facts.home && form.facts.home.summary;
    const as = form.facts.away && form.facts.away.summary;
    if (form.sparse) {
      risks.push('近况样本偏疏（竞彩历史可能缺联赛），已降低近况权重');
      if (hs && as) {
        const hp = hs.w * 3 + hs.d, ap = as.w * 3 + as.d;
        reasons.push(`近况仅供参考（偏疏样本，积分 ${hp}:${ap}）`);
      }
    } else if (hs && as) {
      const hp = hs.w * 3 + hs.d, ap = as.w * 3 + as.d;
      if (hp - ap >= 4) { score += 1.2; reasons.push(`主队近况更佳（近况积分 ${hp}:${ap}）`); }
      else if (ap - hp >= 4) { score -= 1.2; reasons.push(`客队近况更佳（近况积分 ${ap}:${hp}）`); }
      else reasons.push(`双方近况接近（近况积分 ${hp}:${ap}）`);
      const hg = form.facts.home && form.facts.home.goals;
      const ag = form.facts.away && form.facts.away.goals;
      if (hg && ag && hg.n && ag.n) {
        if (hg.avgGf - ag.avgGa >= 0.6) reasons.push(`主队攻击相对客队防守占优（场均进 ${hg.avgGf.toFixed(2)} vs 客场均失 ${ag.avgGa.toFixed(2)}）`);
        if (ag.avgGf - hg.avgGa >= 0.6) reasons.push(`客队攻击相对主队防守占优（场均进 ${ag.avgGf.toFixed(2)} vs 主场均失 ${hg.avgGa.toFixed(2)}）`);
      }
    }
  } else {
    risks.push('近期战绩暂无可靠来源');
  }

  let processLean = null;
  if (process && process.hasData && process.facts) {
    dataPoints += 0.75;
    let scored = process.scored;
    if (!scored) {
      try {
        const ps = require('./process-stats');
        scored = ps.scoreProcessLean({
          available: true,
          home: process.facts.home ? { ok: true, averages: process.facts.home.averages, n: process.facts.home.n } : { ok: false },
          away: process.facts.away ? { ok: true, averages: process.facts.away.averages, n: process.facts.away.n } : { ok: false },
        });
      } catch { scored = null; }
    }
    if (scored && scored.lean) {
      processLean = scored.lean;
      let procW = 1;
      try {
        const fb = readJson(path.join(DATA_DIR, 'history', 'lean-feedback.json'), null);
        const blk = fb && fb.blocks && fb.blocks.process;
        if (blk && blk.n >= 12 && blk.hit != null) {
          const rate = blk.hit / Math.max(1, blk.n);
          if (rate < 0.42) procW = 0.85; // light: underperforming process → slight damp
          else if (rate > 0.58) procW = 1.08;
        }
      } catch (_) {}
      if (scored.lean === 'h') score += Math.min(0.9, 0.35 + Math.abs(scored.score) * 0.25) * procW;
      else if (scored.lean === 'a') score -= Math.min(0.9, 0.35 + Math.abs(scored.score) * 0.25) * procW;
      for (const e of (scored.edges || []).slice(0, 4)) {
        reasons.push(`过程数据：${e}`);
      }
      if (scored.missing && scored.missing.length) {
        risks.push('过程缺项：' + scored.missing.slice(0, 3).join('；'));
      }
    } else if (!(process.facts && process.facts.home && process.facts.away)) {
      // one-side: detailed note added in crosstalk below
    } else {
      reasons.push('过程指标差异不明显，权重已降低');
    }
  } else if (process && !process.hasData) {
    risks.push('过程数据（控球/射门/传球/角球/xG）暂无');
  }

  // 1.9.21: prior post-match review intel (H2H / team), soft reference only
  if (postMatchIntel && Array.isArray(postMatchIntel.bullets) && postMatchIntel.bullets.length) {
    dataPoints += 0.35;
    for (const b of postMatchIntel.bullets.slice(0, 3)) {
      if (b) reasons.push('历史复盘：' + String(b).replace(/^历史交锋复盘：|^相关球队复盘：/, ''));
    }
  }

  // 1.9.22: key player bullets from prior FT caches (light, no AF cost)
  const playerIntel = blocks.playerIntel;
  if (playerIntel && Array.isArray(playerIntel.bullets) && playerIntel.bullets.length) {
    dataPoints += 0.25;
    for (const b of playerIntel.bullets.slice(0, 3)) {
      if (b) reasons.push(String(b));
    }
  }

  if (h2h.hasData) {
    dataPoints++;
    const s = h2h.facts.summary;
    if (s.homeWins >= s.awayWins + 2) { score += 0.6; reasons.push(`交锋史主队占优（${s.homeWins}胜${s.draws}平${s.awayWins}负）`); }
    else if (s.awayWins >= s.homeWins + 2) { score -= 0.6; reasons.push(`交锋史客队占优（主队视角 ${s.homeWins}胜${s.draws}平${s.awayWins}负）`); }
    else reasons.push(`交锋史胶着（主队视角 ${s.homeWins}胜${s.draws}平${s.awayWins}负）`);
  }

  if (!injuries.hasData || injuries.available === false) {
    risks.push('伤停/停赛不明');
    dataPoints -= 0.3;
  } else if (injuries.facts && injuries.facts.items && injuries.facts.items.length) {
    dataPoints += 0.5;
    const homeHints = [m.home, crestsEn(m.homeTeamId), injuries.facts.homeEn, injuries.facts.homeZh].filter(Boolean);
    const awayHints = [m.away, crestsEn(m.awayTeamId), injuries.facts.awayEn, injuries.facts.awayZh].filter(Boolean);
    const sideOf = (it) => {
      const names = [it.teamZh, it.team].filter(Boolean).map(s => String(s).toLowerCase());
      const hit = (hints) => hints.some(h => {
        const x = String(h).toLowerCase();
        return names.some(n => n === x || n.includes(x) || x.includes(n));
      });
      if (hit(homeHints) && !hit(awayHints)) return 'home';
      if (hit(awayHints) && !hit(homeHints)) return 'away';
      if (hit(homeHints) && hit(awayHints)) {
        // prefer longer token overlap
        return 'home';
      }
      return null;
    };
    const homeItems = [], awayItems = [], unkItems = [];
    for (const it of injuries.facts.items) {
      const s = sideOf(it);
      if (s === 'home') homeItems.push(it);
      else if (s === 'away') awayItems.push(it);
      else unkItems.push(it);
    }
    const hN = homeItems.length, aN = awayItems.length, uN = unkItems.length;
    const nameSample = (list, n = 8) => {
      const labs = list.slice(0, n).map(injuryLabel);
      return labs.join('、') + (list.length > n ? ` 等共 ${list.length} 人` : '');
    };
    if (hN >= aN + 2) {
      score -= 0.5;
      risks.push(`主队伤停偏多（${hN} 人）：${nameSample(homeItems)}`);
    } else if (aN >= hN + 2) {
      score += 0.5;
      risks.push(`客队伤停偏多（${aN} 人）：${nameSample(awayItems)}`);
    } else {
      const bits = [];
      if (hN) bits.push(`主 ${hN}：${nameSample(homeItems, 5)}`);
      if (aN) bits.push(`客 ${aN}：${nameSample(awayItems, 5)}`);
      if (uN) bits.push(`未归属 ${uN}：${nameSample(unkItems, 4)}`);
      risks.push(`伤停共 ${injuries.facts.items.length} 人（${bits.join('；')}），临场名单待确认`);
    }
  }

  if (schedule.hasData) {
    dataPoints += 0.3;
    if (/连续作战/.test(schedule.text)) risks.push('存在连续作战/轮换风险');
  }

  // Market as one weighted factor — not the only one
  let marketLean = null;
  if (market.available && market.p) {
    dataPoints += 0.8;
    const k = order(market.p)[0];
    marketLean = k;
    if (k === 'h') score += 0.9;
    else if (k === 'a') score -= 0.9;
    else score += 0.1;
    reasons.push(`市场赔率倾向「${PICK[k]}」（隐含 ${pct(market.p[k], 1)}），仅作参考项`);
    if (market.gap != null && market.gap < 8) risks.push('市场三项接近，分歧大');
  } else {
    risks.push('缺少有效胜平负赔率');
  }

  // Cup / midweek heuristic
  const lg = String(m.league || '');
  if (/欧冠|欧罗巴|欧协|杯|亚冠/.test(lg)) {
    risks.push('杯赛/欧战可能轮换，联赛近况参考权重下降');
    dataPoints -= 0.2;
  }

  // Map score → pick
  let lean = 'd';
  if (score >= 1.2) lean = 'h';
  else if (score <= -1.2) lean = 'a';
  else if (score >= 0.45) lean = 'h';
  else if (score <= -0.45) lean = 'a';
  else lean = 'd';

  // If fundamentals strongly conflict with market, prefer fundamentals but lower conf
  let conflict = false;
  if (marketLean && lean !== 'd' && marketLean !== 'd' && lean !== marketLean) {
    conflict = true;
    risks.push(`基本面倾向「${PICK[lean]}」与市场参考「${PICK[marketLean]}」存在分歧，已降低置信度`);
  }

  // Process vs form / ranking / market — explicit support or conflict (not odds-follow)
  const formLean = (() => {
    if (!(form && form.hasData && form.facts && form.facts.home && form.facts.away)) return null;
    const hs = form.facts.home.summary, as = form.facts.away.summary;
    if (!hs || !as) return null;
    const hp = hs.w * 3 + hs.d, ap = as.w * 3 + as.d;
    if (hp - ap >= 4) return 'h';
    if (ap - hp >= 4) return 'a';
    return 'd';
  })();
  const rankLean = (() => {
    const hr = parseRank(m.homeRank);
    const ar = parseRank(m.awayRank);
    if (hr && ar && hr.n != null && ar.n != null) {
      if (hr.n + 3 <= ar.n) return 'h';
      if (ar.n + 3 <= hr.n) return 'a';
    }
    return null;
  })();

  if (processLean && processLean !== 'd') {
    const plab = PICK[processLean];
    if (formLean && formLean !== 'd') {
      if (formLean === processLean) reasons.push(`近期过程更看好「${plab}」与近况方向一致，相互支撑`);
      else reasons.push(`近期过程更看好「${plab}」与近况「${PICK[formLean]}」方向不一致，需警惕进球转化效率`);
    }
    if (rankLean && rankLean !== 'd') {
      if (rankLean === processLean) reasons.push(`近期过程与联赛排名优势同向（均偏「${plab}」）`);
      else reasons.push(`近期过程偏「${plab}」，但排名优势在「${PICK[rankLean]}」一侧，排名与过程不完全同向`);
    }
    if (marketLean && marketLean !== 'd') {
      if (marketLean === processLean) reasons.push(`近期过程与竞彩隐含概率同向偏「${plab}」，盘面与过程未明显背离`);
      else {
        conflict = true;
        reasons.push(`近期过程偏「${plab}」，竞彩市场参考「${PICK[marketLean]}」，过程与盘面存在分歧（非单纯跟盘）`);
        risks.push('过程数据与竞彩赔率方向不一致');
      }
    }
  } else if (process && process.hasData) {
    const oneSide = !(process.facts && process.facts.home && process.facts.away);
    if (oneSide) {
      reasons.push('过程数据仅一侧可用，已展示有数据一侧场均，综合倾向更倚重近况/排名与赔率参考');
    } else {
      reasons.push('过程指标双方接近或差异不显著，综合倾向更倚重近况/排名与赔率参考');
    }
  }

  // Confidence: blend data coverage + agreement with market + absolute score
  let conf = 0.38 + Math.min(0.22, Math.max(0, dataPoints) * 0.04) + Math.min(0.18, Math.abs(score) * 0.06);
  if (conflict) conf -= 0.08;
  if (!form.hasData) conf -= 0.05;
  if (!injuries.hasData) conf -= 0.04;
  if (process && process.hasData) {
    conf += 0.03;
    // One-sided process (e.g. mapping miss / AF coverage gap): do not treat as full dual comparison.
    const oneSide = !(process.facts && process.facts.home && process.facts.away);
    if (oneSide) conf -= 0.04;
  } else conf -= 0.02;
  if (market.available && market.conf) {
    // pull slightly toward market strength but never let it dominate
    conf = conf * 0.72 + Math.min(0.62, market.conf) * 0.28;
  }
  conf = Math.max(0.28, Math.min(0.78, conf));

  const pickText = PICK[lean];

  // Ensure we always have some reasons
  if (!reasons.length) reasons.push('可用事实有限，综合倾向主要反映有限样本与市场参考');

  // Deduplicate reasons while preserving order
  const seenR = new Set();
  const uniqReasons = [];
  for (const r of reasons) {
    if (seenR.has(r)) continue;
    seenR.add(r);
    uniqReasons.push(r);
  }
  reasons.length = 0;
  reasons.push(...uniqReasons);

  const processPresent = !!(process && process.hasData);
  const processPartial = !!(process && process.hasData && process.scored && (
    (process.scored.missing || []).some(x => /主队过程|客队过程/.test(x))
    || (!process.facts || !process.facts.home || !process.facts.away)
  ));

  // Provisional conf-based lvl; selective speaking may override to 观望
  let lvl = conf >= 0.6 ? ['l1', '稳胆'] : conf >= 0.45 ? ['l2', '倾向'] : ['l3', '谨慎'];

  const draft = {
    lean,
    pickText,
    conf,
    lvl,
    score,
    reasons,
    risks,
    conflict,
    dataPoints,
    marketLean,
    processLean,
    processPresent,
    processPartial,
    formLean,
    rankLean,
  };
  applySpeakStance(draft);
  lvl = draft.lvl;

  let concl;
  if (draft.speakMode === 'align') {
    concl = `与盘口一致，不额外表态。竞彩隐含参考「${PICK[marketLean] || '—'}」`;
    if (processLean) concl += `，近期过程「${PICK[processLean]}」`;
    if (formLean && formLean !== 'd') concl += `，近况「${PICK[formLean]}」`;
    concl += `；模型内部软倾向「${pickText}」信心 ${pct(conf)}，但过程/伤停/日程未与盘口形成明确冲突，故不作稳胆或倾向加码。`;
    if (risks.length) concl += ` 风险点：${risks.slice(0, 4).join('；')}。`;
    concl += ' 仅供赛事理解参考，不构成购彩建议。';
  } else if (draft.speakMode === 'abstain') {
    concl = `信息不足，不额外表态。可用数据点偏少或缺少有效盘口对照`;
    if (pickText) concl += `（内部软倾向「${pickText}」信心 ${pct(conf)}）`;
    concl += '，暂不给出稳胆/倾向级结论。';
    if (risks.length) concl += ` 风险点：${risks.slice(0, 4).join('；')}。`;
    concl += ' 仅供赛事理解参考，不构成购彩建议。';
  } else {
    const shockZh = {
      injuries: '伤停冲击',
      schedule: '赛程负荷',
      process_market: '过程与盘口分歧',
      form_market: '近况与盘口分歧',
      conflict: '基本面与盘口分歧',
    };
    const why = (draft.shockSignals || []).map(s => shockZh[s] || s).join('、') || '信号冲突';
    concl = `额外表态：「${pickText}」，模型信心 ${pct(conf)}（档位：${lvl[1]}）。触发：${why}。`;
    if (processLean) concl += ` 近期过程参考「${PICK[processLean]}」；`;
    if (marketLean) concl += ` 竞彩隐含参考「${PICK[marketLean]}」；`;
    concl += ` 依据条目：${reasons.slice(0, 7).map((r, i) => `（${i + 1}）${r}`).join('')}。`;
    if (risks.length) concl += ` 风险点：${risks.join('；')}。`;
    if (conf < 0.45) concl += ' 因信息不足或盘面胶着，更宜作观察参考，不宜视为强结论。';
    if (!processPresent) {
      concl += ' 本次未纳入过程数据层，结论主要基于：'
        + [
          background && background.hasData ? '排名/积分' : null,
          form && form.hasData ? '近期战绩' : null,
          h2h && h2h.hasData ? '交锋' : null,
          injuries && injuries.hasData ? '伤停' : null,
          schedule && schedule.hasData ? '日程' : null,
          market && market.available ? '竞彩赔率参考' : null,
        ].filter(Boolean).join('、')
        + '。';
    }
    concl += ' 本分析由结构化事实模板生成，仅供赛事理解参考，不构成购彩建议，禁止当作内幕或收益承诺。';
  }

  draft.text = concl;
  return draft;
}

function fmtProcVal(key, v) {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  if (key === 'possession' || key === 'passesPct') return (Math.round(n * 10) / 10) + '%';
  if (key === 'expectedGoals') return (Math.round(n * 100) / 100).toFixed(2);
  return String(Math.round(n * 10) / 10);
}

function renderProcessSectionHtml(m, process) {
  if (!process || !process.hasData) {
    let body = `<div class="pr-proc-miss">`;
    body += `<div class="pr-proc-miss-ico" aria-hidden="true">📊</div>`;
    body += `<p><b>近期过程数据暂不可用</b></p>`;
    body += `<p class="note">${esc((process && process.text) || '控球/射门/射正/传球成功率/角球/xG 等场均暂无可靠来源。')}</p>`;
    body += `<p class="note pr-proc-used"><b>本次简报已用：</b>${esc((process && process.usedList) || '排名/积分、近期战绩、交锋、伤停（若有）、日程、竞彩赔率参考（以各节为准）')}</p>`;
    body += `</div>`;
    return body;
  }
  const ha = process.facts && process.facts.home && process.facts.home.averages;
  const aa = process.facts && process.facts.away && process.facts.away.averages;
  const hn = process.facts && process.facts.home && process.facts.home.n;
  const an = process.facts && process.facts.away && process.facts.away.n;
  let keys;
  try {
    keys = require('./process-stats').BRIEF_METRIC_KEYS;
  } catch {
    keys = ['possession', 'shots', 'shotsOnTarget', 'passesPct', 'corners', 'expectedGoals'];
  }
  const labels = {
    possession: '控球率', shots: '射门', shotsOnTarget: '射正',
    passesPct: '传球成功率', corners: '角球', expectedGoals: '预期进球 xG',
  };
  const miss = [];
  if (!ha) miss.push(`主队「${m.home}」过程数据暂无`);
  if (!aa) miss.push(`客队「${m.away}」过程数据暂无`);

  let rows = '';
  for (const k of keys) {
    const hv = ha ? ha[k] : null;
    const av = aa ? aa[k] : null;
    if (hv == null && av == null) continue;
    const both = hv != null && av != null;
    const hNum = hv != null ? Number(hv) : null;
    const aNum = av != null ? Number(av) : null;
    const pctCeil = (k === 'possession' || k === 'passesPct') ? 100 : null;
    let hLead = false, aLead = false;
    let hBar = '', aBar = '', trackCls = 'pr-proc-track';
    if (both) {
      const max = Math.max(hNum, aNum, pctCeil || 0.01, 0.01);
      const hw = Math.max(2, (hNum / max) * 100);
      const aw = Math.max(2, (aNum / max) * 100);
      const eps = k === 'possession' || k === 'passesPct' ? 3 : (k === 'expectedGoals' ? 0.15 : 0.15);
      hLead = hNum > aNum + eps;
      aLead = aNum > hNum + eps;
      trackCls += ' dual';
      hBar = `<i class="h ${hLead ? 'lead' : ''}" style="width:${hw.toFixed(1)}%"></i>`;
      aBar = `<i class="a ${aLead ? 'lead' : ''}" style="width:${aw.toFixed(1)}%"></i>`;
    } else if (hNum != null) {
      const max = Math.max(hNum, pctCeil || hNum, 0.01);
      const hw = Math.max(6, Math.min(100, (hNum / max) * 100));
      trackCls += ' solo-h';
      hBar = `<i class="h solo" style="width:${hw.toFixed(1)}%"></i>`;
      aBar = `<span class="pr-proc-gap"></span>`;
    } else {
      const max = Math.max(aNum, pctCeil || aNum, 0.01);
      const aw = Math.max(6, Math.min(100, (aNum / max) * 100));
      trackCls += ' solo-a';
      hBar = `<span class="pr-proc-gap"></span>`;
      aBar = `<i class="a solo" style="width:${aw.toFixed(1)}%"></i>`;
    }
    rows += `<div class="pr-proc-row">
      <div class="pr-proc-lab">${esc(labels[k] || k)}</div>
      <div class="pr-proc-cmp">
        <span class="pr-proc-val h ${hLead ? 'lead' : ''} ${hv == null ? 'na' : ''}">${fmtProcVal(k, hv)}</span>
        <div class="${trackCls}">${hBar}${aBar}</div>
        <span class="pr-proc-val a ${aLead ? 'lead' : ''} ${av == null ? 'na' : ''}">${fmtProcVal(k, av)}</span>
      </div>
    </div>`;
  }

  let body = `<div class="pr-proc">`;
  body += `<div class="pr-proc-teams">
    <div class="pr-proc-team home"><b>${esc(m.home)}</b><small>${hn ? `近${hn}场` : '—'}</small></div>
    <div class="pr-proc-vs"><span>场均</span></div>
    <div class="pr-proc-team away"><b>${esc(m.away)}</b><small>${an ? `近${an}场` : '—'}</small></div>
  </div>`;
  if (miss.length) body += `<div class="pr-proc-miss-banner">${miss.map(x => `<p>${esc(x)}</p>`).join('')}</div>`;
  body += `<div class="pr-proc-bars">${rows || '<p class="note">暂无可用指标</p>'}</div>`;
  body += `<p class="pr-proc-blurb">${esc(process.text || '')}</p>`;
  body += `</div>`;
  return body;
}

/**
 * Selective speaking (1.9.27): only amplify when intel conflicts with market
 * or clear shock signals; otherwise「与盘口一致 / 信息不足，不额外表态」.
 */
function detectShockSignals(concl) {
  const risks = concl.risks || [];
  const shocks = [];
  if (risks.some(r => /伤停偏多/.test(r))) shocks.push('injuries');
  if (risks.some(r => /连续作战/.test(r))) shocks.push('schedule');
  const proc = concl.processLean, mkt = concl.marketLean, form = concl.formLean;
  if (proc && mkt && proc !== 'd' && mkt !== 'd' && proc !== mkt) shocks.push('process_market');
  if (form && mkt && form !== 'd' && mkt !== 'd' && form !== mkt) shocks.push('form_market');
  if (concl.conflict) shocks.push('conflict');
  return [...new Set(shocks)];
}

function resolveSpeakStance(concl) {
  if (!concl) {
    return { speakMode: 'abstain', speakLabel: '信息不足，不额外表态', shockSignals: [], stanceLvl: ['l0', '观望'] };
  }
  if (concl.speakMode && concl.speakLabel != null && concl._speakResolved) {
    return {
      speakMode: concl.speakMode,
      speakLabel: concl.speakLabel,
      shockSignals: concl.shockSignals || [],
      stanceLvl: concl.lvl || ['l0', '观望'],
    };
  }
  const shocks = detectShockSignals(concl);
  const dataPoints = concl.dataPoints != null ? Number(concl.dataPoints) : 2;
  let speakMode, speakLabel;
  if (shocks.length > 0) {
    speakMode = 'amplify';
    speakLabel = '';
  } else if (concl.marketLean) {
    speakMode = 'align';
    speakLabel = '与盘口一致，不额外表态';
  } else if (dataPoints < 1.5) {
    speakMode = 'abstain';
    speakLabel = '信息不足，不额外表态';
  } else {
    speakMode = 'abstain';
    speakLabel = '信息不足，不额外表态';
  }
  let stanceLvl;
  if (speakMode === 'amplify') {
    const conf = Number(concl.conf) || 0.4;
    stanceLvl = conf >= 0.6 ? ['l1', '稳胆'] : conf >= 0.45 ? ['l2', '倾向'] : ['l3', '谨慎'];
  } else {
    stanceLvl = ['l0', '观望'];
  }
  return { speakMode, speakLabel, shockSignals: shocks, stanceLvl };
}

function applySpeakStance(concl) {
  const st = resolveSpeakStance(concl);
  concl.speakMode = st.speakMode;
  concl.speakLabel = st.speakLabel;
  concl.shockSignals = st.shockSignals;
  concl.lvl = st.stanceLvl;
  concl._speakResolved = true;
  if (st.speakMode === 'amplify') {
    concl.displayText = concl.pickText || leanLab(concl.lean) || '—';
    concl.listText = concl.displayText;
  } else {
    concl.displayText = st.speakLabel;
    concl.listText = st.speakLabel;
  }
  return concl;
}

function leanLab(k) {
  return PICK[k] || '';
}

/** Short plain-Chinese line when signals diverge (under chip row). */
function buildChipExplain(concl) {
  if (!concl) return '';
  const lean = concl.lean;
  const pick = concl.pickText || leanLab(lean) || '—';
  const proc = concl.processLean;
  const form = concl.formLean;
  const rank = concl.rankLean;
  const mkt = concl.marketLean;

  const diverge =
    !!concl.conflict
    || (proc && proc !== 'd' && lean && lean !== 'd' && proc !== lean)
    || (form && form !== 'd' && lean && lean !== 'd' && form !== lean)
    || (mkt && mkt !== 'd' && lean && lean !== 'd' && mkt !== lean)
    || (rank && lean && lean !== 'd' && rank !== lean);
  if (!diverge) return '';

  const buckets = { h: [], a: [], d: [] };
  const add = (lab, k) => {
    if (!k || !buckets[k]) return;
    buckets[k].push(lab);
  };
  add('近况', form && form !== 'd' ? form : null);
  add('排名', rank || null);
  add('竞彩', mkt && mkt !== 'd' ? mkt : null);
  add('近期过程(xG等)', proc && proc !== 'd' ? proc : null);

  const phrases = [];
  for (const side of ['h', 'a', 'd']) {
    if (!buckets[side].length) continue;
    phrases.push(buckets[side].join('/') + '偏' + leanLab(side));
  }
  if (!phrases.length && concl.conflict) {
    return `各方信号不完全一致；综合仍「${pick}」，已下调信心，请对照下方分项。`;
  }
  if (!phrases.length) return '';

  const agree = [];
  const disagree = [];
  for (const side of ['h', 'a', 'd']) {
    if (!buckets[side].length) continue;
    const ph = buckets[side].join('/') + '偏' + leanLab(side);
    if (side === lean) agree.push(ph);
    else disagree.push(ph);
  }

  let why = '';
  if (disagree.length && lean && lean !== 'd') {
    const procAgainst = proc && proc !== 'd' && proc !== lean;
    const fundAgree = (form && form === lean) || (rank && rank === lean) || (mkt && mkt === lean);
    if (concl.conflict && procAgainst && fundAgree) {
      why = `综合仍「${pick}」，因近况/排名/竞彩参考权重合计更高，近期过程为辅。`;
    } else if (concl.conflict && procAgainst) {
      why = `综合仍「${pick}」，已兼顾过程与其他项并下调信心。`;
    } else if (concl.conflict) {
      why = `综合仍「${pick}」，已下调信心，请对照下方分项。`;
    } else {
      why = `综合仍「${pick}」，个别信号不完全同向，请对照下方分项。`;
    }
  } else if (disagree.length) {
    why = `综合「${pick}」，各方不完全同向，宜作观察参考。`;
  } else {
    return '';
  }

  const head = [...agree, ...disagree].join('，');
  return `${head}；${why}`;
}

function alignChipValue(concl) {
  const lean = concl.lean;
  const proc = concl.processLean;
  const mkt = concl.marketLean;
  const form = concl.formLean;
  let align = '多方综合参考';
  let alignCls = 'neutral';

  if (concl.conflict) {
    if (proc && mkt && proc !== 'd' && mkt !== 'd' && proc !== mkt) {
      align = '过程与盘口不一致';
    } else if (mkt && lean && lean !== 'd' && mkt !== 'd' && mkt !== lean) {
      align = '基本面与盘口不一致';
    } else {
      align = '各方不完全一致';
    }
    alignCls = 'warn';
  } else if (
    lean && lean !== 'd'
    && proc && proc === lean
    && mkt && mkt === lean
    && (!form || form === 'd' || form === lean)
    && (!concl.rankLean || concl.rankLean === lean)
  ) {
    align = '一致看好' + leanLab(lean);
    alignCls = 'ok';
  } else if (proc && mkt && proc === mkt && proc !== 'd') {
    align = '过程与盘口一致';
    alignCls = 'ok';
  } else if (proc && lean && proc === lean && proc !== 'd') {
    align = '过程支持综合结论';
    alignCls = 'ok';
  } else if (concl.processPartial) {
    align = '过程数据不全';
    alignCls = 'warn';
  } else if (concl.processPresent && !proc) {
    align = '过程双方接近';
    alignCls = 'neutral';
  } else if (!proc && !concl.processPresent) {
    align = '暂无过程对照';
    alignCls = 'muted';
  }
  return { align, alignCls };
}

function renderConclChips(concl) {
  applySpeakStance(concl);
  const chip = (lab, val, cls) =>
    `<span class="pr-chip ${cls || ''}"><i>${esc(lab)}</i><b>${esc(val)}</b></span>`;
  const bits = [];
  const mode = concl.speakMode || 'amplify';
  if (mode === 'amplify') {
    bits.push(chip('额外表态', concl.pickText || leanLab(concl.lean) || '—', 'primary'));
    bits.push(chip('信心', pct(concl.conf) + ' · ' + ((concl.lvl && concl.lvl[1]) || ''), 'conf'));
  } else if (mode === 'align') {
    bits.push(chip('表态', '与盘口一致，不额外表态', 'ok'));
    bits.push(chip('档位', '观望', 'muted'));
    if (concl.marketLean) bits.push(chip('盘口参考', leanLab(concl.marketLean), 'ok'));
  } else {
    bits.push(chip('表态', '信息不足，不额外表态', 'muted'));
    bits.push(chip('档位', '观望', 'muted'));
  }
  if (concl.processLean) {
    bits.push(chip('近期过程更看好', leanLab(concl.processLean) || '接近',
      concl.processLean === concl.lean ? 'ok' : 'warn'));
  } else if (concl.processPartial) {
    bits.push(chip('近期过程更看好', '仅一侧有数据', 'warn'));
  } else if (concl.processPresent) {
    bits.push(chip('近期过程更看好', '双方接近', 'neutral'));
  } else {
    bits.push(chip('近期过程更看好', '暂无', 'muted'));
  }
  if (concl.formLean && concl.formLean !== 'd') {
    bits.push(chip('近期战绩更看好', leanLab(concl.formLean),
      concl.formLean === concl.lean ? 'ok' : 'warn'));
  }
  if (concl.rankLean) {
    bits.push(chip('排名更看好', leanLab(concl.rankLean),
      concl.rankLean === concl.lean ? 'ok' : 'warn'));
  }
  if (concl.marketLean && mode === 'amplify') {
    bits.push(chip('竞彩盘口偏', leanLab(concl.marketLean),
      concl.marketLean === concl.lean ? 'ok' : 'warn'));
  }
  const { align, alignCls } = alignChipValue(concl);
  bits.push(chip('各方是否一致', align, alignCls));

  let h = `<div class="pr-chips">${bits.join('')}</div>`;
  if (mode === 'amplify') {
    const explain = buildChipExplain(concl);
    if (explain) {
      h += `<p class="pr-chip-explain${concl.conflict ? ' diverge' : ''}">${esc(explain)}</p>`;
    }
  } else {
    h += `<p class="pr-chip-explain">${esc(concl.speakLabel || '')}：多数场次不作加码，仅在过程/近况/伤停/赛程与盘口冲突或出现冲击信号时额外表态。</p>`;
  }
  return h;
}

/** Re-patch chip row in cached report HTML when CHIPS_UI_REV bumps (no AF re-fetch). */
function patchCachedChips(payload) {
  if (!payload || !payload.html || !payload.sections || !payload.sections.conclusion) return payload;
  if (payload.chipsUiRev === CHIPS_UI_REV && payload.predict && payload.predict.speakMode) return payload;
  const concl = payload.sections.conclusion;
  if (!concl.pickText && concl.lean) concl.pickText = leanLab(concl.lean);
  // Carry risks into concl for shock detection on legacy caches
  if (!concl.risks && payload.sections && payload.sections.conclusion) {
    /* already on concl */
  }
  applySpeakStance(concl);
  // Patch conclusion heading for selective speaking
  let html = payload.html;
  const heading = concl.speakMode === 'amplify' ? '额外表态' : '观望说明';
  html = html.replace(/<section class="pr-sec pr-concl"><h4>[^<]*<\/h4>/, `<section class="pr-sec pr-concl"><h4>${heading}</h4>`);
  const chipsHtml = renderConclChips(concl);
  const re = /<div class="pr-chips">[\s\S]*?<\/div>(?:\s*<p class="pr-chip-explain[^"]*">[\s\S]*?<\/p>)?/;
  if (re.test(html)) html = html.replace(re, chipsHtml);
  else html = html.replace(/(<section class="pr-sec pr-concl"><h4>[^<]*<\/h4>)/, `$1${chipsHtml}`);
  const summary = summaryLineFromConcl(concl, payload.sections);
  const out = { ...payload, html, chipsUiRev: CHIPS_UI_REV };
  out.sections = { ...payload.sections, conclusion: { ...concl } };
  if (summary) out.summary = summary;
  const predBase = out.predict || {};
  out.predict = {
    ...predBase,
    pool: predBase.pool || 'had',
    top: concl.lean,
    conf: concl.conf,
    text: concl.listText || concl.displayText || concl.pickText,
    lvl: concl.lvl,
    summary: summary || predBase.summary,
    multiFactor: true,
    speakMode: concl.speakMode,
    speakLabel: concl.speakLabel || '',
    pickText: concl.pickText,
    marketLean: concl.marketLean || null,
    conflict: !!concl.conflict,
  };
  return out;
}

function summaryLineFromConcl(concl, sections) {
  if (!concl) return '';
  applySpeakStance(concl);
  const bits = [];
  if (concl.speakMode === 'amplify') {
    bits.push(`表态「${concl.pickText || leanLab(concl.lean) || '—'}」信心 ${pct(concl.conf)}`);
  } else if (concl.speakMode === 'align') {
    bits.push('与盘口一致，不额外表态');
    if (concl.marketLean) bits.push(`盘口偏${leanLab(concl.marketLean)}`);
  } else {
    bits.push('信息不足，不额外表态');
  }
  const formSec = sections && sections.form;
  if (formSec && formSec.hasData && formSec.facts && formSec.facts.home && formSec.facts.away) {
    const hs = formSec.facts.home.summary, as = formSec.facts.away.summary;
    if (hs && as) bits.push(`近况 ${hs.w}${hs.d}${hs.l}/${as.w}${as.d}${as.l}`);
  }
  const procSec = sections && sections.process;
  if (procSec && procSec.hasData) {
    if (concl.processLean) bits.push(`近期过程偏${leanLab(concl.processLean)}`);
    else if (concl.processPartial) bits.push('过程仅一侧');
    else bits.push('过程接近');
  } else {
    bits.push('过程暂无');
  }
  if (concl.marketLean && concl.speakMode === 'amplify') bits.push(`竞彩偏${leanLab(concl.marketLean)}`);
  const inj = sections && sections.injuries;
  if (inj && !inj.hasData) bits.push('伤停暂无');
  if (concl.conflict) bits.push('各方不完全一致');
  return bits.join(' · ');
}

function renderHtml(m, blocks, concl, meta) {
  const sec = (title, body, small) =>
    `<section class="pr-sec"><h4>${esc(title)}${small ? ` <small>${esc(small)}</small>` : ''}</h4>${body}</section>`;
  const p = (t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`;
  const usedList = (meta.sources || []).join('、') || '见各节';
  if (blocks.process && !blocks.process.hasData) {
    blocks.process.usedList = usedList;
  }
  let h = `<div class="pr-brief">`;
  h += `<div class="pr-brief-hd"><b>赛前情报简报</b><span>综合分析 · 非购彩建议</span></div>`;
  h += `<p class="pr-brief-meta">数据来源：${esc(usedList)} · 生成于 ${esc(meta.generatedAtLocal || meta.generatedAt || '')}`;
  if (meta.cached) h += ` · 缓存 ${meta.cacheAgeSec || 0}s`;
  h += `</p>`;
  // Conclusion first with chips + dual process glance
  applySpeakStance(concl);
  const conclTitle = concl.speakMode === 'amplify' ? '额外表态' : '观望说明';
  h += `<section class="pr-sec pr-concl"><h4>${conclTitle}</h4>`;
  h += renderConclChips(concl);
  h += `<p class="concl">${esc(concl.text).replace(/\n/g, '<br>')}</p>`;
  h += `<ul class="pr-reasons">${concl.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
  if (concl.risks.length) h += `<ul class="pr-risks">${concl.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
  h += `<p class="note">免责声明：不含下注/支付/出票；不编造伤停与未发生新闻；缺数据已标明。仅供赛事理解参考 · 本站不提供投注服务。</p></section>`;
  h += sec('一、赛况背景', p(blocks.background.text), blocks.background.hasData ? '排名/积分' : '暂无');
  h += sec('二、近期战绩与进失球', p(blocks.form.text), blocks.form.hasData
    ? (blocks.form.source && blocks.form.source !== 'history' ? srcZh(blocks.form.source)
      : (blocks.form.sparse ? '竞彩历史（偏疏）' : '竞彩历史库'))
    : '暂无');
  h += sec('三、近期过程数据', renderProcessSectionHtml(m, blocks.process),
    blocks.process && blocks.process.hasData ? 'API-Football 场均对比' : '暂不可用');
  h += sec('四、交锋历史', p(blocks.h2h.text), blocks.h2h.hasData ? (blocks.h2h.source === 'api-football' ? 'API-Football' : '历史库') : '暂无');
  const injBody = (blocks.injuries.html)
    ? `<div class="pr-inj">${blocks.injuries.html}</div>`
    : p(blocks.injuries.text);
  h += sec('五、阵容 / 伤停 / 停赛', injBody, blocks.injuries.hasData ? '第三方明细' : '暂无可靠来源');
  h += sec('六、主客与日程', p(blocks.schedule.text), blocks.schedule.hasData ? '赛程列表' : '暂无');
  let secN = 7;
  if (blocks.postMatchIntel && blocks.postMatchIntel.hasData && blocks.postMatchIntel.bullets && blocks.postMatchIntel.bullets.length) {
    const lis = blocks.postMatchIntel.bullets.map(b => `<li>${esc(b)}</li>`).join('');
    h += sec(secN + '、历史赛后复盘（参考）',
      `<ul class="pr-reasons">${lis}</ul><p class="note">来自过往完场复盘知识库，标注为分析参考，非事实断言。</p>`,
      '知识库');
    secN++;
  }
  if (blocks.playerIntel && blocks.playerIntel.hasData && blocks.playerIntel.bullets && blocks.playerIntel.bullets.length) {
    const lis = blocks.playerIntel.bullets.map(b => `<li>${esc(b)}</li>`).join('');
    h += sec(secN + '、近期关键球员（参考）',
      `<ul class="pr-reasons">${lis}</ul><p class="note">来自过往完场球员统计缓存的核心子集，仅供赛前理解，非购彩建议。</p>`,
      '球员缓存');
    secN++;
  }
  h += sec(secN + '、市场赔率（参考项）', p(blocks.market.text), 'sporttery 即时赔');
  h += `</div>`;
  return h;
}

function summaryLine(m, concl, blocks) {
  applySpeakStance(concl);
  const bits = [];
  if (concl.speakMode === 'amplify') bits.push(`表态「${concl.pickText}」信心 ${pct(concl.conf)}`);
  else if (concl.speakMode === 'align') bits.push('与盘口一致，不额外表态');
  else bits.push('信息不足，不额外表态');
  if (blocks.form.hasData && blocks.form.facts.home && blocks.form.facts.away) {
    const hs = blocks.form.facts.home.summary, as = blocks.form.facts.away.summary;
    bits.push(`近况 ${hs.w}${hs.d}${hs.l}/${as.w}${as.d}${as.l}`);
  }
  if (blocks.process && blocks.process.hasData) {
    if (concl.processLean) bits.push(`近期过程偏${PICK[concl.processLean]}`);
    else if (concl.processPartial) bits.push('过程仅一侧');
    else bits.push('过程接近');
  } else {
    bits.push('过程暂无');
  }
  if (blocks.market.available && blocks.market.p) {
    const k = order(blocks.market.p)[0];
    bits.push(`竞彩偏${PICK[k]}`);
  }
  if (!blocks.injuries.hasData) bits.push('伤停暂无');
  if (concl.conflict) bits.push('各方不完全一致');
  return bits.join(' · ');
}

async function gatherStandings(m) {
  const mapped = mapLeague(m.league);
  if (!mapped) return { home: null, away: null, source: null };
  try {
    const payload = await leagueTables.getStandings({ league: mapped.key });
    if (!payload || !payload.ok) return { home: null, away: null, source: null };
    const homeEn = crestsEn(m.homeTeamId);
    const awayEn = crestsEn(m.awayTeamId);
    const home = findStandingRow(payload, m.home, [homeEn, leagueTables.teamZh(homeEn)]);
    const away = findStandingRow(payload, m.away, [awayEn, leagueTables.teamZh(awayEn)]);
    return {
      home, away,
      source: `积分榜缓存 ${payload.leagueZh || mapped.key} ${payload.seasonLabel || ''}`.trim(),
      stale: !!payload.stale,
    };
  } catch (e) {
    console.warn('predict-report standings', e.message);
    return { home: null, away: null, source: null };
  }
}

/**
 * @param {object} m match from sporttery normalize
 * @param {{ schedulePool?: object[], force?: boolean }} opts
 */
async function buildReport(m, opts = {}) {
  if (!m || !m.id) {
    return { ok: false, reason: 'bad_match', error: '缺少比赛' };
  }
  if (!opts.force) {
    const cached = loadCachedReport(m.id, m);
    if (cached) return cached;
  }

  const sources = ['竞彩官方赔率/赛程'];
  const stats = await matchStats.getMatchStats({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    home: m.home,
    away: m.away,
    limit: 10,
  });
  if (stats && stats.ok) {
    const fs = stats.formSource || 'history';
    sources.push(fs === 'history' ? '本地竞彩历史赛果库' : srcZh(fs) + ' 近况');
  }
  if (stats && stats.h2hSource === 'api-football') sources.push('API-Football 交锋');

  const stand = await gatherStandings(m);
  if (stand.source) sources.push(stand.source);

  let injPayload = null;
  let fixtureMeta = null;
  // Only attempt AF injuries when we can map fixture; avoid burning quota on unmapped long-tail
  const mappedAlready = hasMappedFixture(m);
  const major = !!mapLeague(m.league) || /欧冠|欧罗巴|欧协|亚冠/.test(String(m.league || ''));
  if (mappedAlready || (major && quotaOk())) {
    fixtureMeta = await tryResolveFixture(m);
    if (fixtureMeta && fixtureMeta.fixtureId) {
      injPayload = await fetchInjuriesCached(fixtureMeta.fixtureId);
      if (injPayload && (injPayload.ok || (injPayload.items && injPayload.items.length))) sources.push('API-Football 伤停');
      else sources.push('伤停查询已尝试');
    }
  }

  const schedulePool = opts.schedulePool || [];
  const background = buildBackground(m, stand.home, stand.away);
  const form = buildForm(m, stats);
  const h2h = buildH2h(m, stats);
  if (injPayload && fixtureMeta) {
    injPayload.homeEn = fixtureMeta.meta && fixtureMeta.meta.homeEn || fixtureMeta.homeEn || '';
    injPayload.awayEn = fixtureMeta.meta && fixtureMeta.meta.awayEn || fixtureMeta.awayEn || '';
    // resolveFixture returns { fixtureId, fromCache, meta }
    if (fixtureMeta.meta) {
      injPayload.homeEn = injPayload.homeEn || fixtureMeta.meta.homeEn || '';
      injPayload.awayEn = injPayload.awayEn || fixtureMeta.meta.awayEn || '';
    }
  }
  const injuries = buildInjuries(m, injPayload);
  const schedule = buildSchedule(m, schedulePool);
  const market = buildOddsBlock(m);
  const process = buildProcess(m, stats && stats.process);
  if (process.hasData) sources.push('API-Football 近期过程数据');
  let postMatchIntel = { bullets: [], hasData: false };
  try {
    const pmr = require('./post-match-review');
    const bullets = pmr.getIntelForPrediction(m, { limit: 3 });
    if (bullets && bullets.length) {
      postMatchIntel = { bullets, hasData: true };
      sources.push('历史赛后复盘');
    }
  } catch (e) {
    console.warn('predict-report post-match intel', e.message);
  }
  let playerIntel = { bullets: [], hasData: false };
  try {
    const fp = require('./fixture-players');
    const bullets = fp.getKeyPlayersForPrediction(m, { limit: 3 });
    if (bullets && bullets.length) {
      playerIntel = { bullets, hasData: true };
      sources.push('历史关键球员');
    }
  } catch (e) {
    console.warn('predict-report player intel', e.message);
  }
  const blocks = { background, form, h2h, injuries, schedule, market, process, postMatchIntel, playerIntel };
  const concl = synthesize(m, blocks);

  const generatedAt = new Date().toISOString();
  // Asia/Shanghai label
  const generatedAtLocal = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' CST';

  const meta = {
    sources,
    generatedAt,
    generatedAtLocal,
    fixtureId: fixtureMeta && fixtureMeta.fixtureId || null,
    quota: (() => {
      try { return require('./live-stats').getQuota(); } catch { return leagueTables.getQuota(); }
    })(),
  };

  const html = renderHtml(m, blocks, concl, meta);
  const summary = summaryLine(m, concl, blocks);

  const payload = {
    ok: true,
    matchId: String(m.id),
    home: m.home,
    away: m.away,
    league: m.league,
    date: m.date,
    time: m.time,
    generatedAt,
    generatedAtLocal,
    sources,
    sections: {
      background: { text: background.text, hasData: background.hasData },
      form: { text: form.text, hasData: form.hasData, facts: form.facts, source: form.source || 'history', sparse: !!form.sparse },
      process: {
        text: process.text,
        hasData: process.hasData,
        facts: process.facts,
        reason: process.reason || null,
        lean: process.lean || null,
        scored: process.scored || null,
      },
      h2h: { text: h2h.text, hasData: h2h.hasData, facts: h2h.facts, source: h2h.source || (stats && stats.h2hSource) || 'history' },
      injuries: {
        text: injuries.text,
        hasData: injuries.hasData,
        available: injuries.available,
        items: (injuries.facts && injuries.facts.items) ? injuries.facts.items.map(it => ({
          player: it.player,
          playerZh: it.playerZh || '',
          reason: it.reason || it.type || '',
          reasonZh: it.reasonZh || reasonZh(it.reason || it.type),
          team: it.team || '',
          teamZh: it.teamZh || '',
          teamId: it.teamId || null,
        })) : [],
      },
      schedule: { text: schedule.text, hasData: schedule.hasData },
      postMatchIntel: {
        hasData: !!(postMatchIntel && postMatchIntel.hasData),
        bullets: (postMatchIntel && postMatchIntel.bullets) || [],
      },
      playerIntel: {
        hasData: !!(playerIntel && playerIntel.hasData),
        bullets: (playerIntel && playerIntel.bullets) || [],
      },
      market: { text: market.text, available: market.available, pick: market.pick },
      conclusion: {
        lean: concl.lean,
        pickText: concl.pickText,
        conf: concl.conf,
        lvl: concl.lvl,
        reasons: concl.reasons,
        risks: concl.risks,
        conflict: concl.conflict,
        text: concl.text,
        dataPoints: concl.dataPoints,
        speakMode: concl.speakMode,
        speakLabel: concl.speakLabel || '',
        shockSignals: concl.shockSignals || [],
        displayText: concl.displayText || concl.pickText,
        listText: concl.listText || concl.pickText,
        processLean: concl.processLean || null,
        processPresent: !!concl.processPresent,
        processPartial: !!concl.processPartial,
        formLean: concl.formLean || null,
        rankLean: concl.rankLean || null,
        marketLean: concl.marketLean || null,
      },
    },
    // Compatible with old client predict() shape for list cards
    predict: {
      pool: 'had',
      top: concl.lean,
      conf: concl.conf,
      text: concl.listText || concl.displayText || concl.pickText,
      lvl: concl.lvl,
      summary,
      multiFactor: true,
      speakMode: concl.speakMode,
      speakLabel: concl.speakLabel || '',
      pickText: concl.pickText,
      marketLean: concl.marketLean || null,
      conflict: !!concl.conflict,
      shockSignals: concl.shockSignals || [],
    },
    html,
    summary,
    chipsUiRev: CHIPS_UI_REV,
    noteZh: '赛前情报简报由战绩/过程数据/交锋/积分/伤停（若有）/历史复盘（若有）与赔率综合生成；赔率仅为参考项之一。不提供投注服务。',
    cached: false,
    cacheAgeSec: 0,
    fixtureId: meta.fixtureId,
    quota: meta.quota,
  };

  saveReport(m.id, payload);
  return payload;
}

function getQuotaPolicy() {
  return {
    plan: 'API-Football Free ~100 req/day',
    reportCacheTtlHours: TTL_DEFAULT_MS / 3600e3,
    reportCacheNearKickoffMinutes: TTL_NEAR_MS / 60e3,
    injuriesCacheHours: INJ_TTL_MS / 3600e3,
    h2hCacheHours: 24,
    reserveRequests: QUOTA_RESERVE,
    strategyZh: [
      '场次报告磁盘缓存，避免重复生成打爆配额',
      '战绩优先 ESPN / 本地 history JSONL，零/低配额',
      '过程数据：完场 /fixtures/statistics 永久磁盘缓存；球队滚动均值缓存≥12h；单次最多拉取有限场次统计',
      '交锋：本地有则用；本地空则拉 API-Football headtohead（禁用 last 参数），磁盘缓存≥24h；球队 ID 永久缓存',
      '积分榜复用 league-tables 6 小时缓存',
      '伤停仅在已映射或可解析 fixture 且剩余配额>预留时请求，并按 fixture 缓存 6 小时',
      '长尾联赛无映射时不强行解析；AF 密钥缺失/暂停时过程数据优雅降级并提示',
    ],
  };
}

module.exports = {
  buildReport,
  loadCachedReport,
  getQuotaPolicy,
  mapLeague,
  implied,
  // test helpers
  _synthesize: synthesize,
  _buildForm: buildForm,
  _buildOddsBlock: buildOddsBlock,
  _buildProcess: buildProcess,
  _renderHtml: renderHtml,
  _renderConclChips: renderConclChips,
  _buildChipExplain: buildChipExplain,
  _patchCachedChips: patchCachedChips,
  _resolveSpeakStance: resolveSpeakStance,
  _applySpeakStance: applySpeakStance,
  CHIPS_UI_REV,
};
