// 竞彩预测 v1.9.29 用户端 (web/PWA + Android WebView). Match info & odds-based predictions.
// 禁止下注/出票/购彩代下；资讯会员 mock 订阅已接入（非购彩支付）。「保存方案」仅为个人记录。
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CFG = window.APP_CONFIG || { apiBase: '', platform: 'web', version: '' };
const API = String(CFG.apiBase || '').replace(/\/+$/, ''); // fixed at build time; '' = same origin
const IS_APP = CFG.platform === 'android' || location.hostname === 'appassets.androidplatform.net';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { localStorage.removeItem(k); },
};
const DISCLAIMER = '仅供参考，理性购彩 · 本站不提供投注服务';

// ======================= icons =======================
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path class="fill" d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect class="fill" x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect class="fill" x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m7 15 3.5-4 3 2.5L17.5 8"/></svg>',
  cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="fill" d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20.5h7M9.5 17h5v3.5h-5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle class="fill" cx="12" cy="8.5" r="4"/><path class="fill" d="M4.5 20.5c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  arr: '<svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/></svg>',
  starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h8l4 4v14H6z"/><path d="M9 12h6M9 16h6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  nick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect class="fill" x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect class="fill" x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M7.5 16.5v-4M12 16.5v-8M16.5 16.5v-5.5"/></svg>',
  vip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="fill" d="M5 17h14l-1.2-8.5L14 12l-2-5-2 5-3.8-3.5z"/><path d="M5 17h14v2.5H5z"/></svg>',
  wechat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 4C5.9 4 3 6.5 3 9.6c0 1.8 1 3.3 2.6 4.3l-.6 2.2 2.4-1.3c.7.2 1.4.3 2.1.3.2 0 .4 0 .6-.1-.1-.4-.2-.8-.2-1.2 0-3.1 2.8-5.6 6.2-5.6.2 0 .5 0 .7.1C16.2 5.7 13.1 4 9.5 4zm-2.3 3.2a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm4.4 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zM15.2 10c-2.9 0-5.2 2-5.2 4.5s2.3 4.5 5.2 4.5c.5 0 1-.1 1.5-.2l1.8 1-.5-1.7c1.2-.8 2-2.1 2-3.6 0-2.5-2.3-4.5-5.2-4.5zm-1.7 2.7a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4zm3.4 0a.7.7 0 1 1 0 1.4.7.7 0 0 1 0-1.4z"/></svg>',
  alipay: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.2 7.2H12v2.1h5.4c-.3 1.4-1.3 3.2-2.8 4.8-1.1-1-1.9-2.1-2.4-3.1H9.5c.7 1.7 1.9 3.4 3.5 4.9-1.5 1.4-3.2 2.5-5.1 3.3l.8 1.8c2.2-.9 4.1-2.2 5.8-3.8 1.9 1.7 4.2 3.1 6.9 4l1-.8c-2.5-1-4.6-2.4-6.3-4 1.9-2.1 3.2-4.5 3.6-6.6H21.2zM3.5 5.5A1.5 1.5 0 0 0 2 7v10a1.5 1.5 0 0 0 1.5 1.5h7.2c-.2-.5-.3-1-.4-1.5H4.5V7.5h8.3V5.5H3.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
};
const EMPTY_SVG = '<svg viewBox="0 0 120 96" fill="none"><ellipse cx="60" cy="86" rx="40" ry="6" fill="#e3e8f2"/><rect x="26" y="18" width="68" height="58" rx="10" fill="#fff" stroke="#cdd7ea" stroke-width="2"/><path d="M38 36h44M38 48h30M38 60h36" stroke="#dbe3f1" stroke-width="5" stroke-linecap="round"/><circle cx="88" cy="22" r="12" fill="#e9f0ff" stroke="#1a62f0" stroke-width="2"/><path d="m84 22 3 3 5-6" stroke="#1a62f0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// preset avatars (a1..a8)
const AV = {
  a1: ['#3b86ff', '#1149c4', '<circle cx="32" cy="32" r="15" fill="#fff"/><polygon points="32,24 39.6,29.5 36.7,38.5 27.3,38.5 24.4,29.5" fill="#1a3a7a"/><path d="M32 24v-7M39.6 29.5l6.6-2.2M36.7 38.5l4.1 5.6M27.3 38.5l-4.1 5.6M24.4 29.5l-6.6-2.2" stroke="#1a3a7a" stroke-width="2"/>'],
  a2: ['#ffcf4d', '#f08c00', '<path d="M22 16h20v10a10 10 0 0 1-20 0z" fill="#fff"/><path d="M22 19h-5v3a6 6 0 0 0 6 6M42 19h5v3a6 6 0 0 1-6 6" stroke="#fff" stroke-width="3" fill="none"/><path d="M29 36h6v6h-6zM24 44h16v4H24z" fill="#fff"/>'],
  a3: ['#ff7a59', '#e02f2f', '<path d="m32 14 5.3 11 12.1 1.6-8.9 8.3 2.2 11.9L32 41l-10.7 5.8 2.2-11.9-8.9-8.3 12.1-1.6z" fill="#fff"/>'],
  a4: ['#34d399', '#059669', '<path d="M24 15h16l9 7-5 7-4-3v22H24V26l-4 3-5-7z" fill="#fff"/><text x="32" y="40" text-anchor="middle" font-size="12" font-weight="800" fill="#059669" font-family="Arial">10</text>'],
  a5: ['#a78bfa', '#6d28d9', '<path d="M35 12 20 36h11l-3 16 16-25H33z" fill="#fff"/>'],
  a6: ['#22d3ee', '#0e7490', '<path d="M16 42 13 20l10 9 9-14 9 14 10-9-3 22z" fill="#fff"/><path d="M16 46h32v4H16z" fill="#fff"/>'],
  a7: ['#f472b6', '#be185d', '<circle cx="28" cy="36" r="11" fill="#fff"/><path d="M30 25h20v8H36z" fill="#fff"/><circle cx="28" cy="36" r="4" fill="#be185d"/>'],
  a8: ['#94a3b8', '#334155', '<path d="M14 20h36v26H14z" fill="none" stroke="#fff" stroke-width="3"/><path d="M20 20v26M26 20v26M32 20v26M38 20v26M44 20v26M14 27h36M14 33h36M14 39h36" stroke="#fff" stroke-width="1.2" opacity=".7"/><circle cx="40" cy="42" r="6" fill="#fff"/>'],
};
const avatarSvg = id => { const [a, b, g] = AV[id] || AV.a1; return `<svg viewBox="0 0 64 64"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g${id})"/>${g}</svg>`; };

// ======================= prediction model (odds baseline + multi-factor briefing) =======================
const LBL = { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } };
const PICK = { had: { h: '主胜', d: '平局', a: '客胜' }, hhad: { h: '让胜', d: '让平', a: '让负' } };
function implied(o) {
  if (!o || !o.h || !o.d || !o.a) return null;
  const inv = { h: 1 / o.h, d: 1 / o.d, a: 1 / o.a }; const s = inv.h + inv.d + inv.a;
  return { h: inv.h / s, d: inv.d / s, a: inv.a / s, payout: 1 / s };
}
const order = p => ['h', 'd', 'a'].sort((x, y) => p[y] - p[x]);
const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
function predict(m) {
  const p = implied(m.had), q = implied(m.hhad);
  if (!p && !q) return null;
  const base = p || q, pool = p ? 'had' : 'hhad'; const k = order(base);
  const conf = base[k[0]];
  const lvl = conf >= 0.6 ? ['l1', '稳胆'] : conf >= 0.45 ? ['l2', '倾向'] : ['l3', '谨慎'];
  return { pool, top: k[0], second: k[1], conf, text: PICK[pool][k[0]], lvl, p: base, q };
}
function reasoningOddsFallback(m) {
  const pr = predict(m); if (!pr) return ['<p>该场暂未开售胜平负/让球玩法，且综合情报暂不可用。请待官方开售后刷新查看。</p>'];
  const out = []; const p = implied(m.had), q = implied(m.hhad);
  const H = esc(m.home), A = esc(m.away);
  out.push(`<p><b>说明</b>：完整「赛前情报简报」加载中或暂不可用；以下为赔率参考层（仅市场定价，非唯一依据）。</p>`);
  if (p) {
    out.push(`<p><b>胜平负盘口</b>：主胜 <b>${m.had.h.toFixed(2)}</b> / 平 <b>${m.had.d.toFixed(2)}</b> / 客胜 <b>${m.had.a.toFixed(2)}</b>，返还约 ${pct(p.payout, 1)}。去水隐含：主 <b>${pct(p.h, 1)}</b>、平 <b>${pct(p.d, 1)}</b>、客 <b>${pct(p.a, 1)}</b>。</p>`);
    const k = order(p), gap = (p[k[0]] - p[k[1]]) * 100;
    const who = { h: `主队 ${H}`, d: '平局', a: `客队 ${A}` }[k[0]];
    if (p[k[0]] >= 0.6) out.push(`<p><b>赔率参考</b>：市场热捧 <b>${who}</b>，领先约 ${gap.toFixed(0)} 个百分点。</p>`);
    else if (p[k[0]] >= 0.45) out.push(`<p><b>赔率参考</b>：市场倾向 <b>${who}</b>，仅领先约 ${gap.toFixed(0)} 个百分点。</p>`);
    else out.push(`<p><b>赔率参考</b>：三项接近（最高 ${pct(p[k[0]])}），市场分歧大。</p>`);
  }
  if (q && m.hhad && m.hhad.goalLine) {
    const gl = Number(m.hhad.goalLine); const n = Math.abs(gl);
    const desc = gl < 0 ? `主队让 ${n} 球` : `主队受让 ${n} 球`;
    const qk = order(q)[0];
    out.push(`<p><b>让球盘（${desc}）</b>：倾向 ${LBL.hhad[qk]}（${pct(q[qk], 1)}）。</p>`);
  }
  out.push(`<p class="concl"><b>赔率层结论</b>：${pr.text} · 信心 ${pct(pr.conf)}（${pr.lvl[1]}）。请以服务端综合简报为准。</p>`);
  out.push(`<p class="note">${DISCLAIMER}</p>`);
  return out;
}
function reasoning(m) {
  const rep = S.predictCache && S.predictCache[String(m.id)];
  if (rep && rep.ok && rep.html) return [rep.html];
  return reasoningOddsFallback(m);
}

// ======================= helpers =======================
const bjDate = (off = 0) => new Date(Date.now() + 8 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
const wd = d => WEEK[new Date(d + 'T12:00:00Z').getUTCDay()];
function dayName(d) { return d === bjDate(0) ? '今天' : d === bjDate(1) ? '明天' : d === bjDate(-1) ? '昨天' : wd(d); }
// 竞彩期次日：official businessDate, else the sales day encoded in 周几NNN (not the kickoff weekday).
const ISSUE_WEEK = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
function issueDate(m) {
  if (m.businessDate) return m.businessDate;
  const hit = String(m.num || '').match(/周([日一二三四五六])/);
  if (hit && m.date) {
    const want = ISSUE_WEEK[hit[1]];
    const d = new Date(m.date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - want + 7) % 7));
    return d.toISOString().slice(0, 10);
  }
  return m.date;
}
function issueWeek(m) {
  const hit = String(m.num || '').match(/周[日一二三四五六]/);
  if (hit) return hit[0];
  if (m.weekday) return m.weekday;
  return wd(issueDate(m));
}
const kickoff = m => new Date(`${m.date}T${m.time || '00:00'}:00+08:00`).getTime();
const BADGE_COLORS = ['#e5484d', '#1a62f0', '#12a150', '#ff8a1f', '#7b4ce0', '#0aa5b8', '#c2185b', '#546e7a', '#d97706', '#0f766e'];
function badge(name, cls = '', logo) {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const c1 = BADGE_COLORS[h % BADGE_COLORS.length];
  const letter = esc([...String(name)][0] || '?');
  const bg = `linear-gradient(145deg,${c1}cc,${c1})`;
  if (!logo) return `<span class="badge ${cls}" style="background:${bg}">${letter}</span>`;
  const src = esc(API + '/api/logo?url=' + encodeURIComponent(logo));
  // Intrinsic 108≈3× of 36 CSS px standings/match crests; sources TSDB 512 / ESPN 500.
  // Broken or missing crest (404) falls back to the letter badge. Do not invent a logo.
  return `<span class="badge crest ${cls}" data-letter="${letter}"><img alt="" width="108" height="108" decoding="async" src="${src}" onerror="var p=this.parentNode;if(!p||p.dataset.fell)return;p.dataset.fell=1;p.className='badge letter ${cls}';p.style.background='${bg}';p.textContent=p.dataset.letter||'';this.remove()"></span>`;
}
const shortRk = s => (String(s || '').length <= 5 ? esc(s) : ''); // long group ranks like [亚运男足1] only shown on the detail page
const lgTag = m => `<span class="tag" style="background:${esc(m.leagueColor || '#4a6fd8')}">${esc(m.league)}</span>`;
function toast(t, ms = 1800) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms); }
function confirmDlg(title, body, okText = '确定', danger = false) {
  return new Promise(res => {
    const d = $('#dialog'); d.classList.remove('hidden');
    d.innerHTML = `<div class="dialog"><div class="dt">${esc(title)}</div><div class="db">${body}</div><div class="da"><button data-r="0">取消</button><button data-r="1" class="ok ${danger ? 'danger' : ''}">${esc(okText)}</button></div></div>`;
    d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b && e.target !== d) return; e.stopPropagation(); d.classList.add('hidden'); d.onclick = null; res(b ? b.dataset.r === '1' : false); };
  });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ======================= API =======================
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function api(path, { method = 'GET', body, timeout = 12000 } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = {}; if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let r;
  try { r = await fetch(API + '/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store' }); }
  catch (e) { throw new ApiError(e.name === 'AbortError' ? '网络超时，请稍后重试' : '网络连接失败，请检查网络', 0); }
  finally { clearTimeout(t); }
  let j = null; try { j = await r.json(); } catch { }
  if (!r.ok) {
    if (r.status === 401 && S.token && !path.startsWith('/auth/')) sessionExpired();
    throw new ApiError((j && j.error) || '请求失败（HTTP ' + r.status + '）', r.status);
  }
  return j;
}

// ======================= state =======================
const S = {
  token: LS.get('jc_token', null), user: LS.get('jc_user', null), guest: LS.get('jc_guest', false),
  matches: null, schedule: null, results: null, msrc: null, ssrc: null, rsrc: null,
  plans: [], favs: [],
  sel: {}, types: [], mult: 1, navDepth: 0,
  schDate: null, schLeague: '全部', schChannel: initSchChannel(),
  schHideFinished: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_sch_hide_fin') === '1'),
  schStatus: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_sch_status')) || '全部',
  liveScores: null, liveScoresAt: 0, liveScorePoll: null, liveScoresLoading: false,
  rsDate: null, rsLeague: '全部', prFilter: '全部', dataLeague: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_data_lg')) || 'epl', dataKind: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_data_kind')) || 'standings', bannerIdx: 0, pendingAv: null,
  detailTab: {}, voteCache: {}, statsCache: {}, statsUi: {}, liveStatsCache: {}, livePoll: null, predictCache: {}, reviewCache: {}, reviewListCache: null, usefulness: null,
  chatCache: {}, chatPoll: null, chatEs: null, pitchAnimSeen: {},
  membership: null, orders: null, payUi: { planId: 'quarter', channel: 'wechat', agree: false, phase: 'form', orderId: null, err: '' },
};
const loggedIn = () => !!S.token;
function loadLocalLists() {
  if (loggedIn()) { const c = LS.get('jc_acct_cache', {}); S.plans = c.plans || []; S.favs = c.favs || []; }
  else { S.plans = LS.get('jc_plans_local', []); S.favs = LS.get('jc_favs_local', []); }
}
function persistLists() {
  if (loggedIn()) LS.set('jc_acct_cache', { plans: S.plans, favs: S.favs });
  else { LS.set('jc_plans_local', S.plans); LS.set('jc_favs_local', S.favs); }
}
function setSession(token, user) {
  S.token = token; S.user = user; LS.set('jc_token', token); LS.set('jc_user', user); LS.set('jc_guest', false); S.guest = false;
}
function clearSession() {
  S.token = null; S.user = null; S.membership = null; S.orders = null; LS.del('jc_token'); LS.del('jc_user'); LS.del('jc_acct_cache'); loadLocalLists();
}
function sessionExpired() { if (!S.token) return; clearSession(); toast('登录已过期，请重新登录'); go('#/login'); }

// ---------- match data ----------
async function loadData(kind, force) {
  let j;
  try {
    j = await api('/' + kind + (force ? '?t=' + Date.now() : ''), { timeout: 10000 });
    if (!j || !Array.isArray(j.data)) throw new Error('格式错误');
    if (j.source === 'live') LS.set('jc_cache_' + kind, j);
  } catch (e) {
    const c = LS.get('jc_cache_' + kind, null);
    if (c) j = { ...c, offline: true, note: '网络不可用，显示上次缓存的数据' };
    else { const SM = window.SAMPLE; j = { source: 'sample', local: true, note: '无法连接服务器，当前展示内置示例数据（非真实赛事/赔率）', fetchedAt: new Date().toISOString(), data: kind === 'results' ? SM.results() : SM.matches() }; }
  }
  if (kind === 'matches') { S.matches = j.data; S.msrc = j; }
  else if (kind === 'schedule') { S.schedule = j.data; S.ssrc = j; }
  else { S.results = j.data; S.rsrc = j; }
}
async function loadBaseline() {
  try {
    const j = await api('/baseline', { timeout: 8000 });
    if (j && j.test) S.baseline = j;
  } catch { /* optional enrichment */ }
}
async function loadUsefulness() {
  try {
    const j = await api('/usefulness', { timeout: 8000 });
    if (j && j.ok !== false) S.usefulness = j;
  } catch { /* optional */ }
}
const reloadData = force => Promise.all([loadData('matches', force), loadData('schedule', force), loadData('results', force), loadBaseline(), loadUsefulness()]);
const isSample = () => S.msrc?.source === 'sample';
function shanghaiHHMM(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const h = parts.find(x => x.type === 'hour').value;
  const m = parts.find(x => x.type === 'minute').value;
  return h + ':' + m;
}
function srcPill() {
  const s = S.msrc; if (!s) return '<span class="ph"></span>';
  if (s.source === 'sample') return '<span class="src-pill sample" data-clock="0"><i></i><b class="clab">示例数据</b></span>';
  const label = s.offline ? '离线缓存' : '实时';
  return `<span class="src-pill ${s.offline ? 'sample' : ''}" data-clock="1"><i></i><b class="clab">${label}</b> · <b class="clk">${shanghaiHHMM()}</b></span>`;
}
// Live Shanghai clock. Updates the existing pill every minute without a reload or login,
// and also when match data is refreshed (label + time).
function tickClock() {
  const src = S.msrc;
  const t = shanghaiHHMM();
  document.querySelectorAll('.src-pill[data-clock="1"]').forEach(el => {
    if (!src || src.source === 'sample') return;
    const label = src.offline ? '离线缓存' : '实时';
    el.classList.toggle('sample', !!src.offline);
    const lab = el.querySelector('.clab'); if (lab && lab.textContent !== label) lab.textContent = label;
    const clk = el.querySelector('.clk'); if (clk && clk.textContent !== t) clk.textContent = t;
  });
}
function warnBar() {
  const s = S.msrc; if (!s) return '';
  if (s.source === 'sample') return `<div class="warn-bar">⚠️ <b>示例数据</b>：${esc(s.note || '官方接口暂不可达')}。以下赛事与赔率仅作演示，<b>非真实数据</b>。</div>`;
  if (s.offline) return `<div class="warn-bar">📶 ${esc(s.note)}（${new Date(s.fetchedAt).toLocaleString('zh-CN', { hour12: false })}）</div>`;
  return '';
}

// ---------- account lists (plans / favorites) ----------
async function refreshAccount() {
  if (!loggedIn()) return;
  try {
    const [me, pl, fv, ms] = await Promise.all([api('/me'), api('/plans'), api('/favorites'), api('/membership/status')]);
    S.user = me.user; LS.set('jc_user', me.user); S.plans = pl.plans; S.favs = fv.favorites; S.membership = ms; persistLists();
  } catch (e) { if (e.status !== 401) console.warn('account refresh failed', e.message); }
}
async function loadMembershipCatalog() {
  try {
    const cat = await api('/membership/plans');
    S.memberCatalog = cat;
    return cat;
  } catch (e) { console.warn('plans load', e.message); return null; }
}
function isMember() {
  if (S.membership && S.membership.active) return true;
  return !!(S.user && S.user.memberActive);
}
function fmtMemberUntil(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }); } catch { return ''; }
}
function yuan(fenOrYuan) {
  const n = Number(fenOrYuan);
  if (!Number.isFinite(n)) return '—';
  // if looks like fen (>=100 and int and no decimal in source) callers pass yuan string usually
  return n.toFixed ? (Math.abs(n) >= 100 && Number.isInteger(n) ? (n / 100).toFixed(2) : n.toFixed(2)) : String(fenOrYuan);
}
function planAmountYuan(p) {
  if (!p) return '0.00';
  if (p.amountYuan != null) return String(p.amountYuan);
  return (Number(p.amountFen || 0) / 100).toFixed(2);
}
const isFav = id => S.favs.some(f => f.matchId === String(id));
async function toggleFav(id) {
  const m = findMatch(id) || (S.results || []).find(x => x.id === String(id)); if (!m) return;
  const on = isFav(id);
  const snap = { matchId: String(m.id), num: m.num, league: m.league, leagueColor: m.leagueColor, home: m.home, away: m.away, homeLogo: m.homeLogo || '', awayLogo: m.awayLogo || '', date: m.date, time: m.time || '', sample: !!m.sample, savedAt: Date.now() };
  if (loggedIn()) {
    try { if (on) await api('/favorites/' + encodeURIComponent(m.id), { method: 'DELETE' }); else await api('/favorites/' + encodeURIComponent(m.id), { method: 'PUT', body: snap }); }
    catch (e) { return toast(e.message); }
  }
  S.favs = on ? S.favs.filter(f => f.matchId !== String(m.id)) : [snap, ...S.favs];
  persistLists(); toast(on ? '已取消关注' : loggedIn() ? '已关注，已同步到账号' : '已关注（本机保存，登录后可同步）'); render();
}
async function savePlan() {
  const c = calc(); const sm = selMatches(); if (!sm.length) return;
  const plan = { id: uid(), createdAt: Date.now(), sample: isSample(), types: S.types.map(typeName), mult: S.mult, bets: c.bets, cost: c.cost, min: +c.min.toFixed(2), max: +c.max.toFixed(2),
    picks: sm.map(x => ({ matchId: x.m.id, num: x.m.num, league: x.m.league, home: x.m.home, away: x.m.away, date: x.m.date, time: x.m.time,
      items: x.keys.map((k, i) => ({ key: k, label: LBL[k.slice(0, -1)][k.slice(-1)] + (k.startsWith('hhad') ? `(${x.m.hhad.goalLine})` : ''), odds: x.odds[i] })) })) };
  if (loggedIn()) { try { await api('/plans', { method: 'POST', body: plan }); } catch (e) { return toast(e.message); } }
  S.plans = [plan, ...S.plans].slice(0, 200); persistLists();
  S.sel = {}; S.types = []; S.mult = 1; closeSheet();
  toast(loggedIn() ? '方案已保存并同步（仅个人记录，未投注）' : '方案已保存到本机（仅个人记录，未投注）', 2200); render();
}
async function deletePlan(id) {
  if (!(await confirmDlg('删除方案', '确定删除该方案记录吗？', '删除', true))) return;
  if (loggedIn()) { try { await api('/plans/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) { return toast(e.message); } }
  S.plans = S.plans.filter(p => p.id !== id); persistLists(); toast('已删除'); render();
}

// ---------- selection → 方案 calculator (personal record only) ----------
const findMatch = id => (S.matches || []).find(m => m.id === String(id)) || (S.schedule || []).find(m => m.id === String(id)) || null;
function selMatches() {
  return Object.entries(S.sel).map(([id, ks]) => {
    const m = findMatch(id); if (!m) return null; const keys = Object.keys(ks);
    return { m, keys, odds: keys.map(k => m[k.slice(0, -1)][k.slice(-1)]) };
  }).filter(x => x && x.keys.length);
}
function combos(arr, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); } return out; }
const typeName = t => (t === 1 ? '单关' : `${t}串1`);
function calc() {
  const sm = selMatches(); const n = sm.length;
  const avail = n === 1 ? [1] : Array.from({ length: Math.max(0, Math.min(n, 8) - 1) }, (_, i) => i + 2);
  S.types = S.types.filter(t => avail.includes(t)); if (!S.types.length && n) S.types = [n === 1 ? 1 : Math.min(n, 8)];
  let bets = 0, maxB = 0, minB = 0;
  for (const t of S.types) for (const c of combos(sm, t)) { bets += c.reduce((a, x) => a * x.odds.length, 1); maxB += c.reduce((a, x) => a * Math.max(...x.odds), 1); }
  if (S.types.length) { const t = Math.min(...S.types); minB = sm.map(x => Math.min(...x.odds)).sort((a, b) => a - b).slice(0, t).reduce((a, b) => a * b, 1); }
  const k = 2 * S.mult; return { n, avail, bets, cost: bets * k, max: maxB * k, min: minB * k };
}
function toggleSel(mid, key) {
  const s = (S.sel[mid] ||= {}); s[key] ? delete s[key] : (s[key] = 1); if (!Object.keys(s).length) delete S.sel[mid];
  document.querySelectorAll(`.cell[data-mid="${CSS.escape(mid)}"][data-key="${key}"]`).forEach(el => el.classList.toggle('sel', !!S.sel[mid]?.[key]));
  renderPlanBar();
}
function renderPlanBar() {
  const bar = $('#planbar'); const n = selMatches().length; const r = route();
  const show = n > 0 && ['schedule', 'match', 'home'].includes(r.name);
  bar.classList.toggle('hidden', !show); $('#view').classList.toggle('has-bar', show);
  if (!show) return;
  bar.classList.toggle('sub', !TABS.includes(r.name));
  bar.innerHTML = `<span class="sp">已选 <b>${n}</b> 场比赛</span><button class="clr" data-act="clearSel">清空</button><button class="btn pri sm" data-act="openPlan">生成方案</button>`;
}
function openPlanSheet() {
  const sm = selMatches(); if (!sm.length) return closeSheet();
  const c = calc(); const sh = $('#sheet'); sh.classList.remove('hidden');
  sh.innerHTML = `<div class="sheet"><h3><span>方案预览</span><button class="x" data-act="closeSheet">✕</button></h3>
    ${sm.map(x => `<div class="pk"><div class="n">${esc(x.m.num)} ${esc(x.m.home)} vs ${esc(x.m.away)}</div><div class="s">${esc(x.m.league)} · ${esc(x.m.date.slice(5))} ${esc(x.m.time)}</div>
      <div class="items">${x.keys.map((k, i) => `<span>${LBL[k.slice(0, -1)][k.slice(-1)]}${k.startsWith('hhad') ? '(' + esc(x.m.hhad.goalLine) + ')' : ''} @${x.odds[i].toFixed(2)}</span>`).join('')}</div></div>`).join('')}
    <div class="types">${c.avail.map(t => `<button data-type="${t}" class="${S.types.includes(t) ? 'on' : ''}">${typeName(t)}</button>`).join('')}</div>
    <div class="calc-row"><span>倍数</span><div class="stepper"><button data-mult="-1">−</button><input id="mult" type="number" min="1" max="99" value="${S.mult}"><button data-mult="1">＋</button></div></div>
    <div class="calc-row"><span>组合数</span><span class="num">${c.bets} 注（按每注2元计 ${c.cost} 元）</span></div>
    <div class="calc-row"><span>理论奖金</span><span class="num"><b>${c.min.toFixed(2)}</b> ~ <b>${c.max.toFixed(2)}</b> 元</span></div>
    <p class="note">理论奖金 = 2元 × 赔率乘积 × 倍数，未计税与官方封顶。方案只作为个人记录保存${loggedIn() ? '并同步到你的账号' : '在本机'}，<b>不会提交、不会出票，本应用不提供投注服务</b>。</p>
    <button class="btn pri block" data-act="savePlan">保存方案</button></div>`;
}
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheet').innerHTML = ''; }

// ======================= router =======================
const TABS = ['home', 'schedule', 'predict', 'data', 'me'];
const PROTECTED = ['profile', 'password', 'delete', 'pay', 'orders'];
function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const qIdx = raw.indexOf('?');
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : '';
  const [name, ...rest] = path.split('/');
  const query = {};
  if (qs) try { new URLSearchParams(qs).forEach((v, k) => { query[k] = v; }); } catch { }
  return { name: name || 'home', arg: decodeURIComponent(rest.join('/') || ''), query };
}
function go(h, replace) { if (replace) { history.replaceState(null, '', h); if (typeof NAV !== 'undefined') { if (NAV.length) NAV[NAV.length - 1] = h; else NAV.push(h); } render(); window.scrollTo(0, 0); } else if (location.hash !== h) location.hash = h; else render(); }
// 1.9.3: explicit in-app nav stack (navDepth counter drifted: hashchange fired for both forward & back)
const NAV = [];
function navNote(h) {
  if (NAV.length >= 2 && NAV[NAV.length - 2] === h) NAV.pop();
  else if (NAV[NAV.length - 1] !== h) { NAV.push(h); if (NAV.length > 50) NAV.shift(); }
}
function back() {
  if (NAV.length >= 2) {
    NAV.pop(); const prev = NAV.pop();
    history.replaceState(null, '', prev); navNote(prev); render(); window.scrollTo(0, 0);
  } else { NAV.length = 0; go('#/home', true); navNote('#/home'); }
}
window.addEventListener('hashchange', () => { navNote(location.hash || '#/home'); closeSheet(); if (route().name !== 'match' || detailTabOf(route().arg) !== 'data') stopLivePoll(); if (route().name !== 'match' || detailTabOf(route().arg) !== 'chat') stopChatPoll(); if (route().name !== 'match' || detailTabOf(route().arg) !== 'odds') stopOddsLivePoll(); if (route().name !== 'match') stopMatchStatusPoll(); render(); window.scrollTo(0, 0); });
// Android back button hook (MainActivity calls this): returns 1 if handled in-page, 0 to exit the app
window.__appBack = () => {
  if (!$('#dialog').classList.contains('hidden')) { $('#dialog').querySelector('[data-r="0"]').click(); return 1; }
  if (!$('#sheet').classList.contains('hidden')) { closeSheet(); return 1; }
  const r = route();
  if (r.name === 'login' && !S.guest && !loggedIn()) return 0;
  if (r.name === 'home') return 0;
  back(); return 1;
};

// ======================= shared UI =======================
const hdr = (title, { back: b = true, right = '' } = {}) =>
  `<header class="hdr center">${b ? `<button class="ic-btn" data-act="back" aria-label="返回">${I.back}</button>` : '<span class="ph"></span>'}<h1>${esc(title)}</h1>${right || '<span class="ph"></span>'}</header>`;
const foot = () => `<div class="foot">数据来源：中国体育彩票 sporttery.cn 公开数据<br>预测为综合情报简报（含赔率参考）· 禁止下注/出票/购彩代下<br>会员费仅用于资讯与高级数据（当前为模拟支付）<br><b>${DISCLAIMER}</b></div>`;
const empty = (text, btn = '', title = '') => `<div class="empty">${EMPTY_SVG}${title ? `<div class="empty-t">${title}</div>` : ''}<div class="empty-d">${text}</div>${btn}</div>`;
const skeleton = (n = 4) => '<div class="grid">' + Array.from({ length: n }, () => `<div class="card sk-card"><div style="display:flex;gap:8px"><div class="sk sk-line" style="width:48px;margin:0"></div><div class="sk sk-line" style="width:90px;margin:0"></div></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin:14px 0"><div style="display:flex;gap:8px;align-items:center"><div class="sk" style="width:36px;height:36px;border-radius:50%"></div><div class="sk sk-line" style="width:70px"></div></div><div class="sk sk-line" style="width:30px"></div><div style="display:flex;gap:8px;align-items:center"><div class="sk sk-line" style="width:70px"></div><div class="sk" style="width:36px;height:36px;border-radius:50%"></div></div></div>
  <div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:6px"><div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div><div class="sk" style="height:38px"></div></div></div>`).join('') + '</div>';

function oddsRow(m, pool) {
  const o = m[pool]; const pr = implied(o); const gl = pool === 'had' ? '0' : (o?.goalLine || '-');
  const top = pr ? order(pr)[0] : null;
  return `<div class="odds3"><div class="gl ${pool === 'had' ? '' : String(gl).startsWith('-') ? 'neg' : 'pos'}">${esc(gl)}</div>${['h', 'd', 'a'].map(k => {
    const v = o && o[k];
    return `<button class="cell ${v ? '' : 'dis'} ${S.sel[m.id]?.[pool + k] ? 'sel' : ''} ${pr && k === top && pr[k] >= 0.45 ? 'top' : ''}" data-mid="${esc(m.id)}" data-key="${pool + k}">${LBL.had[k]}<b class="num">${v ? v.toFixed(2) : '未开售'}</b></button>`;
  }).join('')}</div>`;
}
function matchCard(m, { odds = true } = {}) {
  const pr = effectivePredict(m); const started = Date.now() > kickoff(m);
  return `<div class="card mc" data-go="#/match/${encodeURIComponent(m.id)}">
    <div class="mc-top">${lgTag(m)}<span>${esc(m.num)}</span><span class="sp">${esc(m.date.slice(5))} ${esc(m.time)}${started ? ' · 已开赛' : ''}</span>${m.sample ? '<span class="sample-tag">示例</span>' : ''}${isFav(m.id) ? `<span class="fav-on" style="width:16px;height:16px">${I.star}</span>` : ''}</div>
    <div class="mc-teams"><div class="t h"><span class="rk">${shortRk(m.homeRank)}</span><span class="n">${esc(m.home)}</span>${badge(m.home, '', m.homeLogo)}</div><div class="mc-mid"><div class="vs">VS</div><small>${started ? '待开奖' : '未开赛'}</small></div><div class="t">${badge(m.away, '', m.awayLogo)}<span class="n">${esc(m.away)}</span><span class="rk">${shortRk(m.awayRank)}</span></div></div>
    ${odds ? oddsRow(m, 'had') + oddsRow(m, 'hhad') : ''}
    ${pr ? `<div class="mc-pred"><span class="sp">预测 <b>${pr.text}</b> · 信心 ${pct(pr.conf)}</span><span class="lvl ${pr.lvl[0]}">${pr.lvl[1]}</span></div>` : ''}</div>`;
}
function resultInfo(r) {
  const [hg, ag] = String(r.full).split(/[:：]/).map(Number); const ok = !isNaN(hg) && !isNaN(ag);
  const res = ok ? (hg > ag ? 'h' : hg === ag ? 'd' : 'a') : '';
  const gl = Number(r.goalLine); let hres = '';
  if (ok && r.goalLine !== '' && !isNaN(gl)) { const x = hg + gl - ag; hres = x > 0 ? '让胜' : x === 0 ? '让平' : '让负'; }
  const ip = implied(r.had); return { res, hres, sp: r.had && res ? r.had[res] : null, fav: ip ? order(ip)[0] : null };
}
function resultTags(r) {
  const { res, hres, sp, fav } = resultInfo(r);
  return `<div class="rs-tags">${res ? `<span class="w">胜平负：${LBL.had[res]}${sp ? ' @' + sp.toFixed(2) : ''}</span>` : ''}${hres ? `<span class="w">让球(${esc(r.goalLine)})：${hres}</span>` : ''}${fav && res ? `<span class="${fav === res ? 'hit' : 'miss'}">赔率热门 ${PICK.had[fav]} ${fav === res ? '✓ 命中' : '✗ 未中'}</span>` : ''}</div>`;
}
function resultCard(r) {
  return `<div class="card mc" data-go="#/match/${encodeURIComponent(r.id)}">
    <div class="mc-top">${lgTag(r)}<span>${esc(r.num)}</span><span class="sp">${esc(issueDate(r).slice(5))} · ${esc(r.status || '完场')}</span>${r.sample ? '<span class="sample-tag">示例</span>' : ''}${isFav(r.id) ? `<span class="fav-on" style="width:16px;height:16px">${I.star}</span>` : ''}</div>
    <div class="mc-teams"><div class="t h"><span class="n">${esc(r.home)}</span>${badge(r.home, '', r.homeLogo)}</div><div class="mc-mid"><div class="score num">${esc(r.full || '-')}</div><small>半场 ${esc(r.half || '-')}</small></div><div class="t">${badge(r.away, '', r.awayLogo)}<span class="n">${esc(r.away)}</span></div></div>
    ${resultTags(r)}</div>`;
}

// ======================= tab pages =======================
const BANNERS = [
  { img: 'banners/banner-hot.jpg', go: '#/schedule', alt: '今日热门赛事' },
  { img: 'banners/banner-predict.jpg', go: '#/predict', alt: '赔率概率预测' },
  { img: 'banners/banner-results.jpg', go: '#/results', alt: '开奖结果速查' },
];
const LEAGUE_PRIO = ['英超', '西甲', '意甲', '德甲', '法甲', '欧冠', '欧罗巴', '欧协联', '世界杯', '欧洲杯', '国际赛', '亚运', '亚冠', '中超', '日职', '韩职', '荷甲', '葡超', '英冠'];
const prio = l => { const i = LEAGUE_PRIO.findIndex(x => String(l).includes(x)); return i < 0 ? 99 : i; };

function pageHome() {
  const ms = S.matches;
  let h = `<header class="hdr"><span class="logo"></span><h1>竞彩预测</h1>${srcPill()}</header>`;
  h += `<div class="banner"><div class="track" id="bnTrack">${BANNERS.map(b => `<a href="${b.go}"><img src="${b.img}" alt="${b.alt}"></a>`).join('')}</div><div class="dots">${BANNERS.map((_, i) => `<i class="${i === S.bannerIdx ? 'on' : ''}"></i>`).join('')}</div></div>`;
  h += `<div class="quick">${[['#/schedule', '赛程', I.cal, 'linear-gradient(135deg,#4c8dff,#1a62f0)'], ['#/predict', '预测', I.chart, 'linear-gradient(135deg,#ff8a5c,#f04438)'], ['#/data', '数据', I.data, 'linear-gradient(135deg,#34d399,#059669)'], ['#/results', '开奖', I.cup, 'linear-gradient(135deg,#ffcf4d,#f08c00)']]
    .map(([g, t, ic, bg]) => `<button data-go="${g}"><span class="qi" style="background:${bg}">${ic}</span>${t}</button>`).join('')}</div>`;
  h += warnBar();
  h += `<div class="home-strip"><div class="hs-ic">${I.chart}</div><div class="hs-b"><b>综合情报预测</b> · 战绩/过程数据/交锋/积分/伤停（若有）+ 赔率参考，生成赛前简报。禁止下注/出票/购彩代下；会员仅为资讯与数据权益。<br><span style="color:var(--t3)">${DISCLAIMER}</span></div></div>`;
  h += `<div class="sec-h"><h2>今日高信心预测</h2><button class="more" data-go="#/predict">全部预测 ${I.arr}</button></div>`;
  if (!ms) h += `<div class="hc">${[1, 2].map(() => '<div class="hc-item"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:90%;height:18px"></div><div class="sk sk-line" style="width:40%"></div></div>').join('')}</div>`;
  else {
    const top = ms.map(m => ({ m, pr: effectivePredict(m) })).filter(x => x.pr && Date.now() < kickoff(x.m))
      .sort((a, b) => {
        const as = isSpeakPr(a.pr) ? 2 : (isPendingPr(a.pr) ? 0 : 1);
        const bs = isSpeakPr(b.pr) ? 2 : (isPendingPr(b.pr) ? 0 : 1);
        if (bs !== as) return bs - as;
        return b.pr.conf - a.pr.conf;
      }).slice(0, 5);
    h += top.length ? `<div class="hc">${top.map(({ m, pr }) => {
      const pending = isPendingPr(pr);
      const watch = !pending && !isSpeakPr(pr);
      const lab = pending ? (pr.speakLabel || '情报加载中…') : (watch ? (pr.speakLabel || pr.text) : (pr.pickText || pr.text));
      const left = pending ? '状态' : (watch ? '表态' : '推荐');
      return `<button class="hc-item" data-go="#/match/${encodeURIComponent(m.id)}">
      <div class="hc-top">${lgTag(m)}<span>${esc(m.num)} · ${esc(m.date.slice(5))} ${esc(m.time)}</span></div>
      <div class="hc-teams">${badge(m.home, 'sm', m.homeLogo)}<span class="nm">${esc(m.home)}</span><span class="vs">vs</span><span class="nm">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div>
      <div class="hc-bot"><div class="hc-pick">${left}<b>${esc(lab)}</b> <span class="lvl ${pr.lvl[0]}">${esc(pr.lvl[1])}</span></div><div class="hc-conf"><span class="num">${Math.round(pr.conf * 100)}</span>%<small>${pending ? '参考' : (watch ? '观望' : '信心')}指数</small></div></div>
      <div class="hc-blurb">${esc(shortReason(m, pr))}</div></button>`;
    }).join('')}</div>`
      : empty('今日暂无可展示的未开赛预测场次，开售后将按信心指数排序出现在这里。', '<button class="btn ghost sm" data-go="#/results">查看最新开奖</button>', '暂无高信心场次');
  }
  h += `<div class="sec-h"><h2>热门赛事</h2><button class="more" data-go="#/schedule">全部赛程 ${I.arr}</button></div>`;
  if (!ms) h += skeleton(2);
  else {
    const hot = ms.filter(m => Date.now() < kickoff(m) + 2 * 3600e3).sort((a, b) => prio(a.league) - prio(b.league) || kickoff(a) - kickoff(b)).slice(0, 6);
    h += hot.length ? `<div class="grid">${hot.map(m => matchCard(m)).join('')}</div>` : empty('当前没有在售或临近开赛的热门联赛场次。', '<button class="btn ghost sm" data-go="#/results">查看开奖</button>', '暂无热门赛事');
  }
  h += `<div class="sec-h"><h2>体坛资讯</h2><button class="more" data-go="#/news">更多资讯 ${I.arr}</button></div>`;
  h += `<div id="home-news" class="news-home">${skeletonNews(2)}</div>`;
  setTimeout(() => fillHomeNews(), 0);
  return h + foot();
}

function dateStrip(dates, cur, key) {
  return `<div class="dstrip" id="dstrip">${dates.map(d => `<button class="${d === cur ? 'on' : ''}" data-${key}="${d}">${dayName(d)}<small>${d.slice(5)}</small></button>`).join('')}</div>`;
}
/** 热门 = 竞彩常见优先联赛（LEAGUE_PRIO 白名单），不含瑞超/挪超/巴甲等长尾。 */
function isHotLeague(l) { return prio(l) < 99; }
function isFinishedRow(x) { return x._t === 'r' || !!x.full || (x.status && /完场|已结束|Payout/i.test(String(x.status))); }
// Default 全部 so sales-day matches are not silently dropped by 热门 whitelist.
// v2 (1.8.2): migrate 热门→全部 once. v3 (1.8.9): migrate again — old APKs / leftover
// jc_sch_ch=热门 after v2 flag was set still hid 长尾/early-kickoff days without an obvious cue.
function initSchChannel() {
  try {
    if (typeof localStorage === 'undefined') return '全部';
    if (!localStorage.getItem('jc_sch_ch_v3')) {
      localStorage.setItem('jc_sch_ch_v3', '1');
      localStorage.setItem('jc_sch_ch_v2', '1');
      localStorage.setItem('jc_sch_ch', '全部');
      return '全部';
    }
    const c = localStorage.getItem('jc_sch_ch');
    return ['热门', '关注', '全部'].includes(c) ? c : '全部';
  } catch (_) { return '全部'; }
}
function schChannelOf() {
  const c = S.schChannel || '全部';
  return ['热门', '关注', '全部'].includes(c) ? c : '全部';
}
function setSchChannel(c) {
  S.schChannel = c;
  try { localStorage.setItem('jc_sch_ch', c); } catch (_) {}
}
function setSchHideFinished(on) {
  S.schHideFinished = !!on;
  try { localStorage.setItem('jc_sch_hide_fin', on ? '1' : '0'); } catch (_) {}
}
function schStatusOf() {
  const c = S.schStatus || '全部';
  return ['全部', '进行中', '未开始', '已结束'].includes(c) ? c : '全部';
}
function setSchStatus(c) {
  S.schStatus = c;
  try { localStorage.setItem('jc_sch_status', c); } catch (_) {}
}
function channelStrip(cur) {
  const items = [['热门', '优先联赛（五大/欧战/亚冠等）'], ['关注', '我的收藏'], ['全部', '当日全部竞彩场次']];
  return `<div class="sch-channels">${items.map(([k, tip]) =>
    `<button type="button" class="${cur === k ? 'on' : ''}" data-act="schChannel" data-ch="${k}" title="${tip}">${k}</button>`
  ).join('')}</div>`;
}
function statusStrip(cur, counts) {
  const items = [
    ['全部', counts.all],
    ['进行中', counts.live],
    ['未开始', counts.ns],
    ['已结束', counts.ft],
  ];
  return `<div class="ls-status">${items.map(([k, n]) =>
    `<button type="button" class="${cur === k ? 'on' : ''}" data-act="schStatus" data-st="${k}">${k}${n != null ? `<small>${n}</small>` : ''}</button>`
  ).join('')}</div>`;
}
function leagueChips(list, cur, key, { strong = false } = {}) {
  const cnt = {}; list.forEach(x => (cnt[x.league] = (cnt[x.league] || 0) + 1));
  const ls = Object.keys(cnt).sort((a, b) => prio(a) - prio(b) || cnt[b] - cnt[a]);
  const top = ls.filter(l => isHotLeague(l));
  const rest = ls.filter(l => !isHotLeague(l));
  const btn = (l, n) => `<button type="button" class="${l === cur ? 'on' : ''}${isHotLeague(l) ? ' lg-hot' : ''}" data-${key}="${esc(l)}">${esc(l)}<small>${n}</small></button>`;
  let h = `<div class="chips league-chips${strong ? ' strong' : ''}"><button type="button" class="${cur === '全部' ? 'on' : ''}" data-${key}="全部">全部<small>${list.length}</small></button>`;
  if (strong && top.length) {
    h += top.map(l => btn(l, cnt[l])).join('');
    if (rest.length) h += `<span class="chip-sep" aria-hidden="true"></span>` + rest.map(l => btn(l, cnt[l])).join('');
  } else {
    h += ls.map(l => btn(l, cnt[l])).join('');
  }
  return h + `</div>`;
}

/** Merge schedule/result row with /api/live-scores entry → { kind: live|ns|ft, ... } */
function classifyScoreRow(x) {
  const live = (S.liveScores && S.liveScores[String(x.id)]) || null;
  const ko = kickoff(x);
  const now = Date.now();
  const fromResult = x._t === 'r' || !!x.full;
  let homeScore = null, awayScore = null, half = '', full = '';
  if (live && live.homeScore != null) {
    homeScore = live.homeScore; awayScore = live.awayScore;
    full = live.full || `${live.homeScore}:${live.awayScore}`;
    half = live.half || '';
  } else if (fromResult && x.full) {
    const parts = String(x.full).split(/[:：]/);
    homeScore = Number(parts[0]); awayScore = Number(parts[1]);
    if (Number.isNaN(homeScore)) homeScore = null;
    if (Number.isNaN(awayScore)) awayScore = null;
    full = x.full; half = x.half || '';
  }
  let kind = 'ns', phaseZh = '未开赛', minute = null, minuteExtra = null, liveFlag = false;
  if (live && live.finished && homeScore != null) {
    kind = 'ft'; phaseZh = live.phaseZh || '完场';
  } else if (fromResult && homeScore != null) {
    kind = 'ft'; phaseZh = x.status || '完场';
  } else if (live && live.live) {
    kind = 'live'; phaseZh = live.phaseZh || '进行中';
    minute = live.minute; minuteExtra = live.minuteExtra; liveFlag = true;
  } else if (homeScore != null && now >= ko) {
    // Score appeared after kickoff but not marked finished — treat as live
    kind = 'live'; phaseZh = (live && live.phaseZh) || '进行中';
    minute = live && live.minute; minuteExtra = live && live.minuteExtra; liveFlag = true;
  } else if (now >= ko + 2 * 3600e3 && homeScore == null) {
    // Long past kickoff, no score yet — still show as upcoming/pending rather than invent FT
    kind = 'ns'; phaseZh = '待开奖';
  } else if (now >= ko) {
    kind = 'ns'; phaseZh = '即将开始';
  } else {
    kind = 'ns'; phaseZh = '未开赛';
  }
  return {
    ...x,
    _kind: kind,
    _phaseZh: phaseZh,
    _minute: minute,
    _minuteExtra: minuteExtra,
    _live: liveFlag,
    _homeScore: homeScore,
    _awayScore: awayScore,
    _half: half,
    _full: full,
    _cards: live && live.cards ? live.cards : null,
  };
}

function scoreMinuteLab(row) {
  if (row._kind === 'ft') return '完场';
  if (row._kind === 'live') {
    if (row._phaseZh === '中场') return '中场';
    if (row._minute != null) {
      const ex = row._minuteExtra != null && row._minuteExtra > 0 ? '+' + row._minuteExtra : '';
      return row._minute + "'" + ex;
    }
    return row._phaseZh || '进行中';
  }
  // upcoming: show kickoff clock
  return esc(row.time || '--:--');
}

function scoreCard(row) {
  const kind = row._kind;
  const mid = kind === 'live'
    ? `<div class="ls-score live num"><b>${row._homeScore ?? '-'}</b><span>:</span><b>${row._awayScore ?? '-'}</b></div>`
    : kind === 'ft'
      ? `<div class="ls-score ft num"><b>${row._homeScore ?? '-'}</b><span>:</span><b>${row._awayScore ?? '-'}</b></div>`
      : `<div class="ls-score ns"><span class="vs">VS</span></div>`;
  const statusCls = kind === 'live' ? 'live' : kind === 'ft' ? 'ft' : 'ns';
  const statusInner = kind === 'live'
    ? `<span class="ls-dot"></span><span>${esc(scoreMinuteLab(row))}</span>`
    : `<span>${scoreMinuteLab(row)}</span>`;
  let sub = '';
  if (kind === 'ft' && row._half) sub = `<div class="ls-sub">半场 ${esc(row._half)}</div>`;
  else if (kind === 'live' && row._half) sub = `<div class="ls-sub">半场 ${esc(row._half)}</div>`;
  else if (kind === 'ns') sub = `<div class="ls-sub">${esc(row.date ? row.date.slice(5) : '')} 开球</div>`;
  // cards: only when real data present
  let cards = '';
  if (row._cards && (row._cards.yellow || row._cards.red)) {
    const y = row._cards.yellow || {}, r = row._cards.red || {};
    const bits = [];
    if ((y.home || 0) + (y.away || 0) > 0) bits.push(`<span class="ls-yc" title="黄牌">🟨${(y.home || 0) + (y.away || 0)}</span>`);
    if ((r.home || 0) + (r.away || 0) > 0) bits.push(`<span class="ls-rc" title="红牌">🟥${(r.home || 0) + (r.away || 0)}</span>`);
    if (bits.length) cards = `<div class="ls-cards">${bits.join('')}</div>`;
  }
  return `<button type="button" class="ls-row ${statusCls}" data-go="#/match/${encodeURIComponent(row.id)}">
    <div class="ls-top">${lgTag(row)}<span class="ls-num">${esc(row.num)}</span><span class="ls-st ${statusCls}">${statusInner}</span>${isFav(row.id) ? `<span class="fav-on" style="width:14px;height:14px">${I.star}</span>` : ''}${row.sample ? '<span class="sample-tag">示例</span>' : ''}</div>
    <div class="ls-body">
      <div class="ls-side home">${badge(row.home, 'sm', row.homeLogo)}<span class="nm">${esc(row.home)}</span></div>
      <div class="ls-mid">${mid}${sub}</div>
      <div class="ls-side away"><span class="nm">${esc(row.away)}</span>${badge(row.away, 'sm', row.awayLogo)}</div>
    </div>
    ${cards}
  </button>`;
}

function stopLiveScorePoll() {
  if (S.liveScorePoll) { clearInterval(S.liveScorePoll); S.liveScorePoll = null; }
}
async function loadLiveScores(ids, { force } = {}) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!list.length) { S.liveScores = S.liveScores || {}; return S.liveScores; }
  if (!force && S.liveScoresAt && Date.now() - S.liveScoresAt < 35000 && S.liveScores) return S.liveScores;
  if (S.liveScoresLoading) return S.liveScores;
  S.liveScoresLoading = true;
  try {
    const j = await api('/live-scores?ids=' + encodeURIComponent(list.join(',')), { timeout: 15000 });
    if (j && j.data && typeof j.data === 'object') {
      S.liveScores = { ...(S.liveScores || {}), ...j.data };
      S.liveScoresAt = Date.now();
      S.liveScoresMeta = { fetchedAt: j.fetchedAt, ttlSec: j.ttlSec, afUsed: j.afUsed, quota: j.quota, cached: j.cached };
    }
  } catch (e) {
    console.warn('live-scores', e.message);
  } finally {
    S.liveScoresLoading = false;
  }
  return S.liveScores;
}
function ensureLiveScorePoll(ids, hasLive) {
  stopLiveScorePoll();
  if (!hasLive) return;
  S.liveScorePoll = setInterval(async () => {
    if (document.hidden) return;
    const r = route();
    if (r.name !== 'schedule') { stopLiveScorePoll(); return; }
    await loadLiveScores(ids, { force: true });
    // soft re-render only schedule list body if possible
    if (route().name === 'schedule') render();
  }, 50000);
}

function pageSchedule() {
  let h = hdr('比分', { back: false, right: srcPill() });
  const ms = (S.schedule && S.schedule.length) ? S.schedule : S.matches, rs = S.results;
  if (!ms) return h + `<div class="dstrip" style="height:50px"></div>` + skeleton(4);
  // Group by 竞彩 issue date (businessDate), not kickoff calendar date.
  const dates = [...new Set([...(rs || []).map(issueDate), ...ms.map(issueDate)])].sort();
  const today = bjDate(0);
  if (!S.schDate || !dates.includes(S.schDate)) S.schDate = dates.find(d => d >= today && ms.some(m => issueDate(m) === d)) || dates.find(d => d >= today) || dates[dates.length - 1];
  const ch = schChannelOf();
  h += dateStrip(dates, S.schDate, 'sdate');
  h += channelStrip(ch);
  const dayRes = (rs || []).filter(r => issueDate(r) === S.schDate);
  const dayAll = [...ms.filter(m => issueDate(m) === S.schDate && !dayRes.some(r => r.id === m.id)).map(m => ({ ...m, _t: 'm' })), ...dayRes.map(r => ({ ...r, _t: 'r' }))];
  let dayRows = dayAll;
  if (ch === '热门') dayRows = dayAll.filter(x => isHotLeague(x.league));
  else if (ch === '关注') dayRows = dayAll.filter(x => isFav(x.id));
  const hiddenN = (ch === '热门' || ch === '关注') ? Math.max(0, dayAll.length - dayRows.length) : 0;
  if (S.schLeague !== '全部' && !dayRows.some(x => x.league === S.schLeague)) S.schLeague = '全部';
  h += leagueChips(dayRows, S.schLeague, 'slg', { strong: true });
  if (hiddenN > 0) {
    const why = ch === '热门' ? '非优先联赛' : '未关注';
    h += `<div class="sch-filter-banner" role="status">
      <span>已隐藏 <b>${hiddenN}</b> 场（${why}）· 源数据当日 ${dayAll.length} 场</span>
      <button type="button" class="btn ghost sm" data-act="schChannel" data-ch="全部">查看全部</button>
    </div>`;
  }
  const gapInfo = S.ssrc && S.ssrc.meta && S.ssrc.meta.gaps && S.ssrc.meta.gaps[S.schDate];
  if (gapInfo && gapInfo.missing && gapInfo.missing.length) {
    h += `<div class="sch-filter-banner warn" role="status">
      <span>编号缺口：当日缺 ${gapInfo.missing.map(n => '「' + n + '」').join('、')}（已显示 ${gapInfo.have}/${gapInfo.max}）。下拉刷新或稍后再试。</span>
    </div>`;
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[schedule]', S.schDate, 'src=', dayAll.length, 'ch=', ch, 'shown=', dayRows.length, 'hidden=', hiddenN, 'gaps=', gapInfo || null);
  }

  // Kick off live-score fetch for the day's ids (async → re-render)
  const dayIds = dayRows.map(x => String(x.id));
  const needFetch = !S.liveScoresAt || Date.now() - S.liveScoresAt > 35000;
  if (needFetch && dayIds.length) {
    setTimeout(async () => {
      await loadLiveScores(dayIds);
      if (route().name === 'schedule') render();
    }, 0);
  }

  let classified = dayRows.map(classifyScoreRow);
  const counts = {
    all: classified.length,
    live: classified.filter(x => x._kind === 'live').length,
    ns: classified.filter(x => x._kind === 'ns').length,
    ft: classified.filter(x => x._kind === 'ft').length,
  };
  const st = schStatusOf();
  h += statusStrip(st, counts);
  h += `<div class="sch-toolbar">
    <span class="sch-ch-hint">${counts.live ? `<span class="ls-live-hint"><i class="ls-dot"></i>进行中 ${counts.live} 场 · 约 50 秒自动刷新</span>` : (ch === '热门' ? (hiddenN ? `优先联赛 ${dayRows.length}/${dayAll.length} 场` : '优先联赛 · 比分列表') : ch === '关注' ? (S.favs.length ? `已关注 ${S.favs.length} 场` : '点进详情可关注比赛') : `当日全部 ${dayAll.length} 场`)}</span>
    <button type="button" class="btn ghost sm" data-act="schRefresh">${S.liveScoresLoading ? '刷新中…' : '刷新'}</button>
  </div>`;
  h += warnBar();

  let rows = classified.filter(x => S.schLeague === '全部' || x.league === S.schLeague);
  if (st === '进行中') rows = rows.filter(x => x._kind === 'live');
  else if (st === '未开始') rows = rows.filter(x => x._kind === 'ns');
  else if (st === '已结束') rows = rows.filter(x => x._kind === 'ft');
  // Sort: live first (by minute desc), then NS by kickoff, then FT by kickoff desc
  rows.sort((a, b) => {
    const rank = k => (k === 'live' ? 0 : k === 'ns' ? 1 : 2);
    const d = rank(a._kind) - rank(b._kind);
    if (d) return d;
    if (a._kind === 'live') return (b._minute || 0) - (a._minute || 0) || kickoff(a) - kickoff(b);
    if (a._kind === 'ns') return kickoff(a) - kickoff(b);
    return kickoff(b) - kickoff(a);
  });

  ensureLiveScorePoll(dayIds, counts.live > 0);

  const nLive = rows.filter(x => x._kind === 'live').length;
  const nNs = rows.filter(x => x._kind === 'ns').length;
  const nFt = rows.filter(x => x._kind === 'ft').length;
  h += `<div class="list-meta"><span>${esc(S.schDate)} ${rows[0] ? issueWeek(rows[0]) : wd(S.schDate)} · ${esc(ch)} · ${esc(st)}</span><span>${[
    nLive ? `进行中 ${nLive}` : '',
    nNs ? `未开赛 ${nNs}` : '',
    nFt ? `完场 ${nFt}` : '',
    !rows.length ? '0 场' : '',
  ].filter(Boolean).join(' · ')}</span></div>`;

  if (!rows.length) {
    const tip = ch === '关注'
      ? empty('在赛事详情点击「关注」后，已关注场次会出现在这里。', '<button class="btn ghost sm" data-act="schChannel" data-ch="全部">查看全部</button>', '暂无关注')
      : ch === '热门'
        ? empty('当日优先联赛暂无场次，可切换到「全部」查看全部竞彩场次。', '<button class="btn ghost sm" data-act="schChannel" data-ch="全部">查看全部</button>', '暂无热门')
        : st !== '全部'
          ? empty(`当前筛选「${st}」暂无场次，可切换其他状态。`, '<button class="btn ghost sm" data-act="schStatus" data-st="全部">查看全部</button>', '暂无场次')
          : empty('该日期暂无竞彩足球赛事安排。', '', '暂无赛事');
    h += tip;
  } else if (S.schLeague === '全部') {
    // Group by status blocks for scan UX (live / ns / ft), then by league inside
    const order = st === '全部' ? ['live', 'ns', 'ft'] : [rows[0]._kind];
    const lab = { live: '进行中', ns: '未开始', ft: '已结束' };
    for (const k of order) {
      const block = rows.filter(x => x._kind === k);
      if (!block.length) continue;
      if (st === '全部') h += `<div class="ls-sec"><div class="ls-sec-h"><span class="ls-sec-lab ${k}">${lab[k]}</span><span>${block.length} 场</span></div>`;
      // subgroup by league
      const groups = [];
      const map = new Map();
      block.forEach(x => {
        const lg = x.league || '其他';
        if (!map.has(lg)) { map.set(lg, []); groups.push(lg); }
        map.get(lg).push(x);
      });
      h += groups.map(lg => {
        const list = map.get(lg);
        return `<div class="lg-group ls-group"><div class="lg-head"><span class="tag" style="background:${esc(list[0].leagueColor || '#4a6fd8')}">${esc(lg)}</span><span class="lg-n">${list.length} 场</span></div>
          <div class="ls-list">${list.map(scoreCard).join('')}</div></div>`;
      }).join('');
      if (st === '全部') h += `</div>`;
    }
  } else {
    h += `<div class="ls-list">${rows.map(scoreCard).join('')}</div>`;
  }
  return h + foot();
}


function highConfTwoFold(ms) {
  const MIN = 0.65;
  const list = (ms || [])
    .map(m => ({ m, pr: predict(m) }))
    .filter(x => x.pr && x.pr.pool === 'had' && x.pr.conf >= MIN && x.m.status === 'Selling' && Date.now() < kickoff(x.m))
    .sort((a, b) => b.pr.conf - a.pr.conf);
  if (list.length < 2) return null;
  const a = list[0], b = list[1];
  const oddA = a.m.had[a.pr.top];
  const oddB = b.m.had[b.pr.top];
  return {
    minConf: MIN,
    a, b,
    comboOdds: oddA * oddB,
    // Historical backtest on test set: same-day top-2 with conf>=0.65
    hist: { days: 21, hitRate: 66.7, note: '测试集中「信心≥65% 且当日取最高两场」的 2串1' },
  };
}
function twoFoldCard(ms) {
  const c = highConfTwoFold(ms);
  if (!c) {
    return `<div class="doc" style="margin:8px 12px"><h4 style="margin:0 0 6px">今日高信心 2串1 参考</h4>
      <p style="margin:0">暂无两场信心 ≥65% 的在售胜平负场次。门槛可随数据更新调整。</p>
      <p class="note" style="margin:8px 0 0">历史回测：测试集中同规则约 66.7% 命中（21 个有样本的交易日）。仅供参考，不构成投注建议。</p></div>`;
  }
  const row = (x) => `<button class="tf-row" data-go="#/match/${encodeURIComponent(x.m.id)}">
      <div class="tf-l">${lgTag(x.m)}<span>${esc(x.m.num)}</span></div>
      <div class="tf-m">${esc(x.m.home)} vs ${esc(x.m.away)}</div>
      <div class="tf-r"><b>${x.pr.text}</b><span>${pct(x.pr.conf)} · @${Number(x.m.had[x.pr.top]).toFixed(2)}</span></div>
    </button>`;
  return `<div class="doc tf-card" style="margin:8px 12px"><h4 style="margin:0 0 6px">今日高信心 2串1 参考</h4>
    <p class="note" style="margin:0 0 8px">规则：在售胜平负中取隐含概率 ≥65% 且最高的两场。理论参考赔率约 <b>${c.comboOdds.toFixed(2)}</b>（两场开售赔乘积，未计税/限额）。</p>
    ${row(c.a)}${row(c.b)}
    <p class="note" style="margin:8px 0 0">${esc(c.hist.note)} 命中约 <b>${c.hist.hitRate}%</b>（${c.hist.days} 日）。命中率≠盈利；${DISCLAIMER}</p></div>`;
}

function ring(v, opts) {
  const muted = !!(opts && opts.muted);
  const c = 2 * Math.PI * 23;
  const stroke = muted ? '#98a1b3' : (v >= .6 ? '#e03e36' : v >= .45 ? '#1565e0' : '#98a1b3');
  const cls = muted ? 'ring ring-muted' : 'ring';
  return `<div class="${cls}"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="23" stroke="#e9f0ff" stroke-width="5" fill="none"/><circle cx="27" cy="27" r="23" stroke="${stroke}" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="num">${Math.round(v * 100)}</span></div>`;
}

function shortReason(m, pr) {
  const rep = S.predictCache && S.predictCache[String(m.id)];
  if (rep && rep.ok && (rep.summary || (rep.predict && rep.predict.summary))) {
    return rep.summary || rep.predict.summary;
  }
  if (!pr) return '暂无赔率，无法生成分析。打开详情可生成综合情报简报。';
  if (pr._pending || pr.speakMode === 'pending') {
    return '情报简报加载中：加载完成后将显示「额外表态」或「与盘口一致 / 信息不足」。';
  }
  if (pr.multiFactor && pr.summary) return pr.summary;
  const p = pr.pool === 'had' ? implied(m.had) : implied(m.hhad);
  if (!p) return '暂无有效赔率。打开详情可查看战绩/交锋等综合简报。';
  const k = order(p); const gap = (p[k[0]] - p[k[1]]) * 100;
  return `综合简报待展开：市场参考「${pr.pickText || pr.text}」${pct(pr.conf)}（领先约 ${gap.toFixed(0)}pt）。详情页将汇总战绩/交锋/积分/伤停与赔率。`;
}
function predOddsMini(m, pr) {
  const o = m.had; const ip = implied(o);
  if (!o || !ip) return '';
  const top = pr && pr.pool === 'had' ? pr.top : order(ip)[0];
  return `<div class="pr-odds">${[['h', '主胜'], ['d', '平局'], ['a', '客胜']].map(([k, lab]) =>
    `<div class="oc ${k === top ? 'on' : ''}">${lab}<b class="num">${o[k] ? o[k].toFixed(2) : '-'}</b></div>`
  ).join('')}</div>`;
}
function predCardHtml(m, pr, i) {
  const confPct = Math.round(pr.conf * 100);
  const mode = pr.speakMode || 'amplify';
  const isPending = mode === 'pending' || !!pr._pending;
  const isWatch = !isPending && (mode === 'align' || mode === 'abstain' || (pr.lvl && pr.lvl[0] === 'l0'));
  const barColor = isPending
    ? 'linear-gradient(90deg,#d7dde8,#b8c0ce)'
    : isWatch
    ? 'linear-gradient(90deg,#c5ccd8,#98a1b3)'
    : pr.conf >= 0.6 ? 'linear-gradient(90deg,#ff6a3d,#e03e36)' : pr.conf >= 0.45 ? 'var(--pri-g)' : 'linear-gradient(90deg,#b0b8c8,#98a1b3)';
  const pickLab = isPending
    ? (pr.speakLabel || '情报加载中…')
    : isWatch ? (pr.speakLabel || pr.text || '观望') : (pr.pickText || pr.text);
  const leftLab = isPending ? '状态' : (isWatch ? '表态' : '推荐');
  const rightLab = isPending
    ? '简报加载中'
    : isWatch
    ? (mode === 'align' ? '与盘口一致' : '信息不足')
    : ((pr.multiFactor ? '情报简报' : (pr.pool === 'had' ? '胜平负' : '让球')) + ' · 信心 ' + confPct + '%');
  const mf = isPending
    ? '<span class="mf-tag" style="background:#eef1f6;color:#687485">加载中</span>'
    : isWatch
    ? '<span class="mf-tag watch">观望</span>'
    : (pr.multiFactor ? '<span class="mf-tag">表态</span>' : '<span class="mf-tag" style="background:#f0f2f5;color:#687485">赔率参考</span>');
  const cardCls = isPending ? ' pr-pending' : (isWatch ? ' pr-watch' : ' pr-speak');
  return `<div class="card pr-card${cardCls}" data-go="#/match/${encodeURIComponent(m.id)}">
    <div class="pr-hd"><span class="rank ${i < 3 && !isWatch && !isPending ? 'r' + (i + 1) : ''} num">${i + 1}</span>
      <div class="pr-hd-body">
        <div class="pr-meta">${lgTag(m)}<span>${esc(m.num)} · ${esc(m.date.slice(5))} ${esc(m.time)}</span>${m.sample ? '<span class="sample-tag">示例</span>' : ''}</div>
        <div class="pr-teams">${badge(m.home, 'sm', m.homeLogo)}<span class="nm">${esc(m.home)}</span><span class="vs">vs</span><span class="nm">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div>
      </div>${ring(pr.conf, (isWatch || isPending) ? { muted: true } : null)}</div>
    <div class="pr-pick"><div class="pk-l">${leftLab} <b>${esc(pickLab)}</b> <span class="lvl ${pr.lvl[0]}">${esc(pr.lvl[1])}</span>${mf}</div>
      <div class="pk-r">${esc(rightLab)}</div></div>
    ${predOddsMini(m, pr)}
    <div class="pr-cbar"><div class="lab"><span>${isPending ? '参考指数' : (isWatch ? '观望指数' : '信心指数')}</span><span class="num">${confPct}%</span></div>
      <div class="track"><i style="width:${confPct}%;background:${barColor}"></i></div></div>
    <p class="pr-blurb">${esc(shortReason(m, pr))}</p></div>`;
}
function isSpeakPr(pr) {
  if (!pr) return false;
  const mode = pr.speakMode;
  if (mode === 'pending' || pr._pending) return false;
  if (mode === 'amplify') return true;
  if (mode === 'align' || mode === 'abstain') return false;
  return !(pr.lvl && pr.lvl[0] === 'l0');
}
function isPendingPr(pr) {
  return !!(pr && (pr.speakMode === 'pending' || pr._pending));
}
function usefulnessStripHtml() {
  const u = S.usefulness;
  const bits = [];
  if (u && u.highConfHitRate && u.highConfHitRate.n) {
    bits.push(`<span><b>${u.highConfHitRate.rate}%</b>高信心命中<small>n=${u.highConfHitRate.n}</small></span>`);
  } else if (u && u.baselineHighConf && u.baselineHighConf.n) {
    bits.push(`<span><b>${u.baselineHighConf.hitRate}%</b>赔率基线命中<small>n=${u.baselineHighConf.n}</small></span>`);
  }
  if (u && u.alignRate != null && u.sampleN) {
    bits.push(`<span><b>${u.alignRate}%</b>与盘口一致<small>占比</small></span>`);
  }
  if (u && u.conflictHitRate && u.conflictHitRate.n) {
    bits.push(`<span><b>${u.conflictHitRate.rate}%</b>分歧场命中<small>n=${u.conflictHitRate.n}</small></span>`);
  } else if (u && u.amplifyHitRate && u.amplifyHitRate.n) {
    bits.push(`<span><b>${u.amplifyHitRate.rate}%</b>表态命中<small>n=${u.amplifyHitRate.n}</small></span>`);
  }
  if (!bits.length) {
    return `<div class="use-strip"><span class="use-note">可用性指标：样本积累中（完场复盘后写入）</span></div>`;
  }
  const note = (u && u.noteZh) ? `<span class="use-note">${esc(u.noteZh)}</span>` : '';
  return `<div class="use-strip">${bits.join('')}${note}</div>`;
}
function pagePredict() {
  const ms = S.matches;
  let h = hdr('预测', { back: false, right: srcPill() });
  if (!ms) return h + `<div class="hdr-ext" style="height:72px"></div>` + skeleton(4);
  const all = ms.map(m => ({ m, pr: effectivePredict(m) })).filter(x => x.pr)
    .sort((a, b) => {
      const as = isSpeakPr(a.pr) ? 1 : 0, bs = isSpeakPr(b.pr) ? 1 : 0;
      if (bs !== as) return bs - as;
      return b.pr.conf - a.pr.conf;
    });
  const nSpeak = all.filter(x => isSpeakPr(x.pr)).length;
  const nPending = all.filter(x => isPendingPr(x.pr)).length;
  const nWatch = all.length - nSpeak - nPending;
  const nStable = all.filter(x => isSpeakPr(x.pr) && x.pr.lvl && x.pr.lvl[1] === '稳胆').length;
  h += `<div class="hdr-ext"><div class="psum"><div><b class="num">${nSpeak}</b>额外表态</div><div><b class="num">${nWatch}</b>观望</div><div><b class="num">${nPending ? nPending : nStable}</b>${nPending ? '加载中' : '其中稳胆'}</div></div></div>`;
  h += usefulnessStripHtml();
  h += twoFoldCard(ms);
  const filters = [
    ['全部', all.length],
    ['表态', nSpeak],
    ['观望', nWatch],
  ];
  h += `<div class="chips">${filters.map(([k, c]) => `<button class="${S.prFilter === k ? 'on' : ''}" data-pf="${k}">${k}${k === '全部' ? '' : `<small>${c}</small>`}</button>`).join('')}</div>`;
  h += warnBar();
  const list = all.filter(x => {
    if (S.prFilter === '全部') return true;
    if (S.prFilter === '表态') return isSpeakPr(x.pr);
    if (S.prFilter === '观望') return !isSpeakPr(x.pr) && !isPendingPr(x.pr);
    // legacy chips
    return x.pr.lvl && x.pr.lvl[1] === S.prFilter;
  });
  h += `<div class="list-meta"><span>少而准：多数与盘口一致不表态 · 点击看简报</span><span>${list.length} 场</span></div>`;
  if (!list.length) {
    h += empty('该筛选暂无场次，可切换「全部」或等待情报简报加载。', '<button class="btn ghost sm" data-pf="全部">查看全部</button>', '暂无场次');
  } else {
    h += `<div class="grid">${list.map(({ m, pr }, i) => predCardHtml(m, pr, i)).join('')}</div>`;
  }
  if (nPending) h += `<p class="note" style="margin:10px 14px 4px">正在加载 ${nPending} 场情报简报…加载完成前不预判「与盘口一致」，请稍候自动刷新。</p>`;
  h += `<p class="note" style="margin:10px 14px 4px">仅当过程/近况/伤停/赛程与盘口冲突或出现冲击信号时「额外表态」；其余显示「与盘口一致 / 信息不足，不额外表态」。完场后写入表态反馈，供可用性条参考。</p>`;
  return h + foot();
}


// ----- data center (积分榜 / 射手榜 / 助攻榜) -----

/** League qualification / promotion / relegation bands by rank (sensible 2025–27 defaults). */
const STANDINGS_ZONES = {
  epl: [
    { to: 4, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 5, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 6, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 18, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  laliga: [
    { to: 4, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 5, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 6, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 18, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  bundesliga: [
    { to: 4, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 5, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 6, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 16, to: 16, key: 'playoff', label: '降级附加赛', cls: 'zone-playoff' },
    { from: 17, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  seriea: [
    { to: 4, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 5, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 6, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 18, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  ligue1: [
    { to: 3, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 4, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 5, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 16, to: 16, key: 'playoff', label: '降级附加赛', cls: 'zone-playoff' },
    { from: 17, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  csl: [
    { to: 2, key: 'acl', label: '亚冠区', cls: 'zone-cl' },
    { to: 3, key: 'acl2', label: '亚冠二级', cls: 'zone-el' },
    { from: 15, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  championship: [
    { to: 2, key: 'promo', label: '升级区', cls: 'zone-promo' },
    { from: 3, to: 6, key: 'playoff', label: '升级附加赛', cls: 'zone-playoff' },
    { from: 22, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  eredivisie: [
    { to: 2, key: 'cl', label: '欧冠区', cls: 'zone-cl' },
    { to: 3, key: 'el', label: '欧联区', cls: 'zone-el' },
    { to: 4, key: 'uecl', label: '欧协联区', cls: 'zone-uecl' },
    { from: 16, to: 16, key: 'playoff', label: '降级附加赛', cls: 'zone-playoff' },
    { from: 17, key: 'rel', label: '降级区', cls: 'zone-rel' },
  ],
  // UEFA Champions League — League Phase (36-team single table, not old group stage)
  ucl: [
    { to: 8, key: 'r16', label: '直接晋级16强', cls: 'zone-cl' },
    { from: 9, to: 16, key: 'po-seed', label: '附加赛（种子）', cls: 'zone-el' },
    { from: 17, to: 24, key: 'po-unseed', label: '附加赛（非种子）', cls: 'zone-uecl' },
    { from: 25, key: 'out', label: '淘汰区', cls: 'zone-rel' },
  ],
};

function zoneRulesOf(lgKey) {
  return STANDINGS_ZONES[lgKey] || STANDINGS_ZONES.epl;
}
function zoneForRank(lgKey, rank) {
  const r = Number(rank);
  if (!Number.isFinite(r) || r <= 0) return null;
  for (const z of zoneRulesOf(lgKey)) {
    const from = z.from != null ? z.from : 1;
    const to = z.to != null ? z.to : 999;
    if (r >= from && r <= to) return z;
  }
  return null;
}
function zoneLegendHtml(lgKey) {
  const rules = zoneRulesOf(lgKey);
  if (!rules.length) return '';
  const seen = new Set();
  const items = [];
  for (const z of rules) {
    if (seen.has(z.key)) continue;
    seen.add(z.key);
    items.push(`<span class="dc-leg-i ${esc(z.cls)}"><i></i>${esc(z.label)}</span>`);
  }
  return `<div class="dc-legend" aria-label="分区说明">${items.join('')}<span class="dc-leg-note">按近年名额惯例标注，实际席位以联盟/欧足联为准</span></div>`;
}
function standingGapHint(rows, r, lgKey, { compact } = {}) {
  if (!rows || !rows.length || r == null) return '';
  const pts = Number(r.points);
  const rank = Number(r.rank);
  if (!Number.isFinite(pts) || !Number.isFinite(rank)) return '';
  const leaderPts = Number(rows[0] && rows[0].points);
  const rel = rows.find(x => { const z = zoneForRank(lgKey, x.rank); return z && (z.key === 'rel' || z.key === 'out'); });
  const nearRel = rel && rank >= Number(rel.rank) - 3 && rank < Number(rel.rank);
  const tipBits = [];
  if (rank > 1 && Number.isFinite(leaderPts) && leaderPts >= pts) tipBits.push('榜首差' + (leaderPts - pts));
  if (nearRel && Number.isFinite(Number(rel.points)) && pts >= Number(rel.points)) {
    tipBits.push((lgKey === 'ucl' ? '距淘汰' : '距降级') + (pts - Number(rel.points)));
  }
  if (!compact) return tipBits.join(' · ');
  if (rank >= 2 && rank <= 4 && Number.isFinite(leaderPts) && leaderPts > pts) return '-' + (leaderPts - pts);
  if (nearRel && Number.isFinite(Number(rel.points))) return (lgKey === 'ucl' ? '出线+' : '保级+') + (pts - Number(rel.points));
  return '';
}



function formatUpdatedAt(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return '刚刚更新';
  if (sec < 3600) return Math.floor(sec / 60) + '分钟前更新';
  if (sec < 86400) return Math.floor(sec / 3600) + '小时前更新';
  try {
    return new Date(t).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' 更新';
  } catch { return ''; }
}

const DATA_LEAGUES_FALLBACK = [
  { key: 'epl', nameZh: '英超' }, { key: 'laliga', nameZh: '西甲' }, { key: 'bundesliga', nameZh: '德甲' },
  { key: 'seriea', nameZh: '意甲' }, { key: 'ligue1', nameZh: '法甲' }, { key: 'ucl', nameZh: '欧冠' },
  { key: 'csl', nameZh: '中超' }, { key: 'championship', nameZh: '英冠' }, { key: 'eredivisie', nameZh: '荷甲' },
];
const DATA_KINDS = [['standings', '积分榜'], ['topscorers', '射手榜'], ['topassists', '助攻榜']];

function dataLeagueOf() {
  const k = S.dataLeague || 'epl';
  return k;
}
function setDataLeague(k) {
  S.dataLeague = k;
  try { localStorage.setItem('jc_data_lg', k); } catch { }
}
function dataKindOf() {
  const k = S.dataKind || 'standings';
  return DATA_KINDS.some(([x]) => x === k) ? k : 'standings';
}
function setDataKind(k) {
  S.dataKind = k;
  try { localStorage.setItem('jc_data_kind', k); } catch { }
}

function formDots(form) {
  const s = String(form || '').slice(-5);
  if (!s) return '';
  return `<span class="dc-form">${[...s].map(c => {
    const cls = c === 'W' ? 'w' : c === 'D' ? 'd' : c === 'L' ? 'l' : '';
    const lab = c === 'W' ? '胜' : c === 'D' ? '平' : c === 'L' ? '负' : c;
    return `<i class="${cls}" title="${lab}">${lab}</i>`;
  }).join('')}</span>`;
}

function renderStandingsTable(payload) {
  const tables = payload.tables || [];
  if (!tables.length || !tables.some(t => (t.rows || []).length)) {
    return empty('该联赛暂无积分榜数据，请稍后重试或切换其他联赛。', '', '暂无积分榜');
  }
  const lg = payload.leagueKey || dataLeagueOf();
  let h = '';
  for (const tb of tables) {
    if (tb.group) h += `<div class="dc-group">${esc(tb.group)}</div>`;
    const rows = tb.rows || [];
    h += `<div class="dc-table-wrap"><table class="dc-table">
      <thead><tr><th class="rk">#</th><th class="tm">球队</th><th>赛</th><th>胜</th><th>平</th><th>负</th><th>进/失</th><th class="pts">积分</th></tr></thead><tbody>`;
    for (const r of rows) {
      const logoUrl = r.logo || (r.teamId ? ('https://a.espncdn.com/i/teamlogos/soccer/500/' + r.teamId + '.png') : '');
      const logo = logoUrl ? badge(r.teamZh || r.team, '', logoUrl) : badge(r.teamZh || r.team);
      const z = zoneForRank(lg, r.rank);
      const zoneCls = z ? z.cls : '';
      const href = r.teamId ? `#/team/${encodeURIComponent(r.teamId)}?league=${encodeURIComponent(lg)}` : '';
      const rowCls = (zoneCls + (href ? ' dc-row-link' : '')).trim();
      const goAttr = href ? ` data-go="${esc(href)}" role="link" tabindex="0"` : '';
      const tipGap = standingGapHint(rows, r, lg);
      const tip = ['第' + (r.rank ?? '?'), z ? z.label : '', r.descriptionZh || r.description || '', tipGap].filter(Boolean).join(' · ');
      const shortGap = standingGapHint(rows, r, lg, { compact: true });
      const gapHtml = shortGap ? `<small class="dc-gap">${esc(shortGap)}</small>` : '';
      h += `<tr class="${rowCls}"${goAttr} title="${esc(tip)}">
        <td class="rk num"><span class="rk-pip"></span>${r.rank ?? ''}</td>
        <td class="tm"><div class="tm-in">${logo}<span class="tn">${esc(r.teamZh || r.team)}</span>${formDots(r.form)}</div></td>
        <td class="num">${r.played ?? '-'}</td>
        <td class="num">${r.win ?? '-'}</td>
        <td class="num">${r.draw ?? '-'}</td>
        <td class="num">${r.lose ?? '-'}</td>
        <td class="num gfga">${r.gf ?? '-'}/${r.ga ?? '-'}</td>
        <td class="pts num"><b>${r.points ?? '-'}</b>${gapHtml}</td>
      </tr>`;
    }
    h += `</tbody></table></div>`;
  }
  h += zoneLegendHtml(lg);
  return h;
}

function renderScorersList(payload, kind) {
  const rows = payload.rows || [];
  if (!rows.length) {
    return empty(kind === 'topassists' ? '该联赛暂无助攻榜数据。' : '该联赛暂无射手榜数据。', '', '暂无榜单');
  }
  const isAst = kind === 'topassists';
  const lg = payload.leagueKey || dataLeagueOf();
  let h = `<div class="dc-scorers">`;
  rows.forEach((r, i) => {
    const initial = esc([...(r.playerZh || r.player || '?')][0] || '?');
    const altPhoto = r.photoAlt || '';
    const photo = r.photo
      ? `<span class="dc-avatar" data-letter="${initial}" data-alt="${esc(altPhoto)}"><img alt="" width="88" height="88" decoding="async" src="${esc(API + '/api/logo?url=' + encodeURIComponent(r.photo))}" onerror="var p=this.parentNode;if(!p)return;if(p.dataset.alt&&!p.dataset.retried){p.dataset.retried=1;this.src='${esc(API)}/api/logo?url='+encodeURIComponent(p.dataset.alt);return;}if(p.dataset.fell)return;p.dataset.fell=1;p.classList.add('letter');p.textContent=p.dataset.letter||'?';"></span>`
      : `<span class="dc-avatar letter">${initial}</span>`;
    const teamLogo = r.teamLogo ? badge(r.teamZh || r.team, 'sm', r.teamLogo) : badge(r.teamZh || r.team, 'sm');
    const primary = isAst ? (r.assists ?? 0) : (r.goals ?? 0);
    const secondary = isAst
      ? `进球 ${r.goals ?? 0}`
      : (r.assists != null ? `助攻 ${r.assists}` : '');
    const href = r.playerId ? `#/aplayer/${encodeURIComponent(r.playerId)}?league=${encodeURIComponent(lg)}` : '';
    const teamHref = r.teamId ? `#/team/${encodeURIComponent(r.teamId)}?league=${encodeURIComponent(lg)}` : '';
    h += `<div class="dc-scorer${href ? ' dc-row-link' : ''}"${href ? ` data-go="${esc(href)}" role="link" tabindex="0"` : ''}>
      <span class="dc-rank num">${r.rank || (i + 1)}</span>
      ${photo}
      <div class="dc-sc-info">
        <div class="nm">${esc(r.playerZh || r.player)}${yiMark(r.playerZhAuto)}</div>
        <div class="sub"${teamHref ? ` data-go="${esc(teamHref)}"` : ''}>${teamLogo}<span>${esc(r.teamZh || r.team || '')}</span></div>
      </div>
      <div class="dc-sc-stat"><b class="num">${primary}</b><small>${isAst ? '助攻' : '进球'}</small>${secondary ? `<span class="sec">${esc(secondary)}</span>` : ''}</div>
    </div>`;
  });
  h += `</div>`;
  return h;
}

function pageData() {
  const lg = dataLeagueOf();
  const kind = dataKindOf();
  const leagues = (S.dataLeagues && S.dataLeagues.length) ? S.dataLeagues : DATA_LEAGUES_FALLBACK;
  let h = hdr('数据中心', { back: false, right: `<button class="ic-btn" data-act="dataRefresh" aria-label="刷新">${I.refresh}</button>` });
  h += `<div class="dc-sub"><button class="linkish" data-go="#/results">${I.cup}<span>开奖结果</span>${I.arr}</button>
    <span class="dc-tip">积分 / 射手 · 无下注</span></div>`;
  h += `<div class="chips dc-leagues" id="dcLeagues">${leagues.map(l =>
    `<button type="button" class="${lg === l.key ? 'on' : ''}" data-act="dataLeague" data-lg="${esc(l.key)}">${esc(l.nameZh)}</button>`
  ).join('')}</div>`;
  h += `<div class="dtabs dc-kinds">${DATA_KINDS.map(([k, lab]) =>
    `<button type="button" class="${kind === k ? 'on' : ''}" data-act="dataKind" data-kind="${k}">${lab}</button>`
  ).join('')}</div>`;

  const cacheKey = lg + ':' + kind;
  const cached = S.dataCache && S.dataCache[cacheKey];
  if (!cached) {
    h += `<div class="dc-body" id="dcBody">${skeleton(3)}</div>`;
    h += foot();
    setTimeout(() => loadDataCenter(lg, kind), 0);
    return h;
  }
  if (cached.ok === false) {
    const tip = cached.noteZh ? `<p class="note dc-note">${esc(cached.noteZh)}</p>` : '';
    h += `<div class="dc-body" id="dcBody">${empty(cached.error || '加载失败，请稍后重试。', '<button class="btn ghost sm" data-act="dataRefresh">重新加载</button>', '暂时不可用')}${tip}</div>` + foot();
    return h;
  }
  const srcLab = cached.source === 'espn' ? 'ESPN · 日更/赛后刷新' : (cached.source === 'api-football' ? (cached.pastSeason ? '历史赛季' : '第三方') : '');
  const upd = formatUpdatedAt(cached.updatedAt || cached.fetchedAt);
  const right = [upd || (cached.refreshing ? '后台更新中' : (cached.stale ? '缓存' : (cached.cached ? '已缓存' : '刚更新'))), cached.rows ? cached.rows.length + ' 人' : (cached.tables && cached.tables[0] ? cached.tables[0].rows.length + ' 队' : '')].filter(Boolean).join(' · ');
  const meta = `<div class="list-meta dc-meta"><span>${esc(cached.leagueZh || '')} · ${esc(cached.seasonLabel || '')} 赛季${srcLab ? ' · ' + esc(srcLab) : ''}</span><span>${esc(right)}</span></div>`;
  const pastWarn = cached.pastSeason ? `<div class="warn-bar">⚠️ 正在查看历史赛季 ${esc(cached.seasonLabel || '')}，俱乐部归属以该赛季为准，非当前效力球队。</div>` : '';
  let body = meta + (pastWarn || "");
  if (kind === 'standings') body += renderStandingsTable(cached);
  else body += renderScorersList(cached, kind);
  if (cached.noteZh) body += `<p class="note dc-note">${esc(cached.noteZh)}</p>`;
  h += `<div class="dc-body" id="dcBody">${body}</div>`;
  return h + foot();
}

async function loadDataCenter(lg, kind, { soft } = {}) {
  const key = lg + ':' + kind;
  S.dataCache = S.dataCache || {};
  // api() already prefixes '/api' — do NOT pass '/api/standings' or it becomes /api/api/...
  const path = kind === 'standings' ? '/standings'
    : kind === 'topassists' ? '/topassists' : '/topscorers';
  try {
    if (!S.dataLeagues) {
      try {
        const lj = await api('/leagues');
        if (lj && lj.leagues) {
          S.dataLeagues = lj.leagues;
          S.dataSeasonNote = lj.noteZh || '';
        }
      } catch { /* ignore */ }
    }
    const j = await api(path + '?league=' + encodeURIComponent(lg), { timeout: 20000 });
    if (!j || j.ok === false) {
      S.dataCache[key] = { ok: false, error: (j && (j.error || j.detail || j.reason)) || '加载失败' };
    } else {
      j._fresh = true;
      S.dataCache[key] = j;
    }
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : '';
    const isNet = !msg || /网络|超时|Failed to fetch|NetworkError|abort/i.test(msg);
    const errText = isNet
      ? (msg && !/^请求失败/.test(msg) ? msg : '网络异常，请检查连接后重试')
      : msg;
    if (!S.dataCache[key] || S.dataCache[key].ok === false) {
      S.dataCache[key] = { ok: false, error: errText || '网络异常，请检查连接后重试' };
    }
  }
  if (route().name === 'data' && dataLeagueOf() === lg && dataKindOf() === kind) render();
}

function dash(v) { return (v == null || v === '') ? '暂无' : esc(String(v)); }

function pageTeam(id) {
  const lg = (route().query && route().query.league) || dataLeagueOf() || 'epl';
  let h = hdr('球队详情');
  h += `<div id="team-box" class="det-box">${skeleton(2)}</div>`;
  setTimeout(() => fillTeam(id, lg), 0);
  return h;
}
async function fillTeam(id, lg, { squad } = {}) {
  const box = document.getElementById('team-box');
  if (!box) return;
  try {
    let q = '/team?id=' + encodeURIComponent(id) + '&league=' + encodeURIComponent(lg || '');
    if (squad) q += '&squad=1';
    const t = await api(q, { timeout: 20000 });
    if (!t || t.ok === false) {
      box.innerHTML = empty(esc((t && t.error) || '未找到球队'), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>', '暂无资料');
      return;
    }
    const logo = t.logo ? badge(t.teamZh || t.team, 'lg', t.logo) : badge(t.teamZh || t.team, 'lg');
    let stats = '';
    if (t.rank != null || t.points != null) {
      stats = `<div class="det-stats">
        <div><b class="num">${dash(t.rank)}</b><small>排名</small></div>
        <div><b class="num">${dash(t.points)}</b><small>积分</small></div>
        <div><b class="num">${dash(t.played)}</b><small>赛</small></div>
        <div><b class="num">${t.win ?? '-'}<span class="sep">/</span>${t.draw ?? '-'}<span class="sep">/</span>${t.lose ?? '-'}</b><small>胜/平/负</small></div>
        <div><b class="num">${t.gf ?? '-'}/${t.ga ?? '-'}</b><small>进/失</small></div>
      </div>`;
    } else {
      stats = `<p class="note">本季积分排名摘要暂无。</p>`;
    }
    let formBlock = '';
    if (t.formDots || t.form) {
      formBlock = `<div class="dsec"><h3>近期战绩</h3><div class="det-form-lg">${formDots(t.formDots || t.form) || '<span class="note">暂无</span>'}</div>
        <p class="note">近场胜/平/负（W/D/L 转译），来自积分榜缓存。</p></div>`;
    }
    let recent = '';
    if (t.recent && t.recent.length) {
      recent = `<div class="dsec"><h3>最近比赛</h3><div class="det-recent">` + t.recent.map(fx => {
        const score = (fx.goalsHome != null && fx.goalsAway != null)
          ? `<b class="num">${fx.goalsHome}-${fx.goalsAway}</b>` : '<span class="note">暂无比分</span>';
        const d = fx.date ? String(fx.date).slice(0, 10) : '';
        return `<div class="det-fx">
          <div class="fx-meta"><span>${esc(d)}</span><span>${esc(fx.leagueZh || fx.league || '')}</span></div>
          <div class="fx-teams">${badge(fx.homeZh || fx.home, 'sm', fx.homeLogo)}<span>${esc(fx.homeZh || fx.home)}</span>
            ${score}
            <span>${esc(fx.awayZh || fx.away)}</span>${badge(fx.awayZh || fx.away, 'sm', fx.awayLogo)}</div>
        </div>`;
      }).join('') + `</div></div>`;
    } else if (!formBlock) {
      recent = `<div class="dsec"><h3>近期战绩</h3><p class="note">暂无近期比赛数据。</p></div>`;
    }
    let squadHtml = '';
    if (t.squad && t.squad.length) {
      const byPos = {};
      t.squad.forEach(p => {
        const k = p.positionZh || p.position || '其他';
        (byPos[k] = byPos[k] || []).push(p);
      });
      squadHtml = `<div class="dsec"><h3>阵容 <small class="note">${t.squad.length} 人</small></h3>`;
      for (const [pos, list] of Object.entries(byPos)) {
        squadHtml += `<div class="det-pos">${esc(pos)}</div><div class="det-squad">`;
        list.forEach(p => {
          const ph = p.photo
            ? `<img class="sq-ph" alt="" src="${esc(logoProxy(p.photo))}" onerror="this.outerHTML='<span class=sq-ph letter>${esc([...(p.playerZh || p.player || '?')][0] || '?')}</span>'"/>`
            : `<span class="sq-ph letter">${esc([...(p.playerZh || p.player || '?')][0] || '?')}</span>`;
          const go = p.playerId ? ` data-go="#/aplayer/${encodeURIComponent(p.playerId)}?league=${encodeURIComponent(lg)}"` : '';
          squadHtml += `<button type="button" class="sq-card"${go}>${ph}<div><div class="nm">${esc(p.playerZh || p.player)}${yiMark(p.playerZhAuto)}</div>
            <div class="sub">${p.number ? '#' + esc(p.number) + ' · ' : ''}${esc(p.positionZh || p.position || '')}</div></div></button>`;
        });
        squadHtml += `</div>`;
      }
      squadHtml += `</div>`;
    } else {
      squadHtml = `<div class="dsec"><h3>阵容</h3>
        <p class="note">阵容需额外请求数据源，点击下方加载（有日配额，结果会缓存）。</p>
        <button type="button" class="btn ghost sm" data-act="teamSquad" data-id="${esc(String(id))}" data-lg="${esc(lg)}">加载阵容</button>
      </div>`;
    }
    const z = zoneForRank(lg, t.rank);
    let zoneBanner = '';
    if (t.rank != null) {
      const bits = [`目前第${t.rank}`];
      if (z) bits.push(z.label);
      if (t.points != null) bits.push(`${t.points}分`);
      // gap vs leader / relegation from cached standings (best-effort)
      try {
        const st = await api('/standings?league=' + encodeURIComponent(lg || ''), { timeout: 8000 });
        const rows = ((st && st.tables && st.tables[0] && st.tables[0].rows) || []);
        const tip = standingGapHint(rows, { rank: t.rank, points: t.points }, lg);
        if (tip) bits.push(tip);
      } catch { /* optional */ }
      zoneBanner = `<div class="det-zone ${z ? esc(z.cls) : ''}">${esc(bits.join(' · '))}</div>`;
    }
    box.innerHTML = `<div class="det-hero">${logo}<div>
        <h2>${esc(t.teamZh || t.team)}</h2>
        ${t.teamZh && t.team && t.teamZh !== t.team ? `<div class="note">原文 ${esc(t.team)}</div>` : ''}
        <div class="player-tags">
          <span>${esc(t.leagueZh || '')}</span>
          ${t.seasonLabel ? `<span>${esc(t.seasonLabel)} 赛季</span>` : ''}
          ${t.country ? `<span>${esc(t.country)}</span>` : ''}
        </div>
      </div></div>
      ${zoneBanner}
      ${stats}
      <dl class="kv">
        <dt>联赛</dt><dd>${dash(t.leagueZh)}</dd>
        <dt>成立</dt><dd>${dash(t.founded)}</dd>
        <dt>主场</dt><dd>${t.venue ? esc(t.venue) + (t.venueCity ? ' · ' + esc(t.venueCity) : '') : '暂无'}</dd>
      </dl>
      ${formBlock}${recent}${squadHtml}
      <p class="note">${esc(t.noteZh || '')}</p>
      <div style="padding:8px 0 16px"><button class="btn ghost sm" data-go="#/data">返回数据中心</button></div>`;
  } catch (e) {
    box.innerHTML = empty('加载失败：' + esc(e.message || ''), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>');
  }
}

function pageAfPlayer(id) {
  const lg = (route().query && route().query.league) || dataLeagueOf() || 'epl';
  let h = hdr('球员详情');
  h += `<div id="aplayer-box" class="det-box">${skeleton(2)}</div>`;
  setTimeout(() => fillAfPlayer(id, lg), 0);
  return h;
}
async function fillAfPlayer(id, lg) {
  const box = document.getElementById('aplayer-box');
  if (!box) return;
  try {
    const p = await api('/af-player?id=' + encodeURIComponent(id) + '&league=' + encodeURIComponent(lg || ''), { timeout: 20000 });
    if (!p || p.ok === false) {
      box.innerHTML = empty(esc((p && p.error) || '未找到球员'), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>', '暂无资料');
      return;
    }
    const initial = esc([...(p.playerZh || p.player || '?')][0] || '?');
    const img = p.photo
      ? `<img class="player-hero-ph" src="${esc(logoProxy(p.photo))}" alt="" onerror="this.outerHTML='<div class=\\'player-hero-ph fallback\\'>${initial}</div>'"/>`
      : `<div class="player-hero-ph fallback">${initial}</div>`;
    const teamGo = p.teamId ? ` data-go="#/team/${encodeURIComponent(p.teamId)}?league=${encodeURIComponent(lg)}"` : '';
    box.innerHTML = `<div class="player-hero">${img}<div>
        <h2>${esc(p.playerZh || p.player)}${yiMark(p.playerZhAuto)}</h2>
        ${p.playerZh && p.player && p.playerZh !== p.player ? `<div class="note">原文 ${esc(p.player)}${p.playerZhAuto ? '（中文为程序自动音译，仅供参考）' : ''}</div>` : ''}
        <div class="player-tags">
          ${p.positionZh || p.position ? `<span>${esc(p.positionZh || p.position)}</span>` : ''}
          ${p.number ? `<span>号码 ${esc(p.number)}</span>` : ''}
          ${p.nationalityZh || p.nationality ? `<span>${esc(p.nationalityZh || p.nationality)}</span>` : ''}
          ${p.leagueZh ? `<span>${esc(p.leagueZh)}</span>` : ''}
        </div>
      </div></div>
      <div class="det-stats">
        <div><b class="num">${p.goals != null ? p.goals : '暂无'}</b><small>本季进球</small></div>
        <div><b class="num">${p.assists != null ? p.assists : '暂无'}</b><small>本季助攻</small></div>
        <div><b class="num">${p.appearances != null ? p.appearances : '暂无'}</b><small>出场</small></div>
        <div><b class="num">${p.minutes != null ? p.minutes : '暂无'}</b><small>分钟</small></div>
      </div>
      <dl class="kv">
        <dt>俱乐部</dt><dd${teamGo} class="${p.teamId ? 'linkish-dd' : ''}">${p.teamLogo ? badge(p.teamZh || p.team, 'sm', p.teamLogo) : ''} ${dash(p.teamZh || p.team)}</dd>
        <dt>位置</dt><dd>${dash(p.positionZh || p.position)}</dd>
        <dt>国籍</dt><dd>${dash(p.nationalityZh || p.nationality)}</dd>
        <dt>年龄</dt><dd>${dash(p.age)}</dd>
        <dt>身高</dt><dd>${dash(p.height)}</dd>
        <dt>出生日期</dt><dd>${dash(p.born)}</dd>
        <dt>赛季</dt><dd>${dash(p.seasonLabel)}</dd>
        <dt>评分</dt><dd>${dash(p.rating)}</dd>
      </dl>
      <p class="note">${esc(p.noteZh || '')}</p>
      <div style="padding:8px 0 16px"><button class="btn ghost sm" data-go="#/data">返回数据中心</button></div>`;
  } catch (e) {
    box.innerHTML = empty('加载失败：' + esc(e.message || ''), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>');
  }
}

function pageResults() {
  let h = hdr('开奖', { right: srcPill() }); const rs = S.results;
  if (!rs) return h + `<div class="dstrip" style="height:50px"></div>` + skeleton(4);
  const sched = (S.schedule && S.schedule.length) ? S.schedule : [];
  const today = bjDate(0);
  // Issue dates: settled/live results, plus today's and earlier issues still on the schedule (未开赛 / 待开奖).
  const dates = [...new Set([...rs.map(issueDate), ...sched.filter(m => issueDate(m) <= today).map(issueDate)])].sort();
  if (!dates.length) return h + empty('官方开奖数据暂未同步，请稍后下拉刷新。', '', '暂无开奖') + foot();
  if (!S.rsDate || !dates.includes(S.rsDate)) {
    const withScores = dates.filter(d => rs.some(r => issueDate(r) === d && d <= today));
    S.rsDate = withScores[withScores.length - 1] || [...dates].reverse().find(d => d <= today) || dates[dates.length - 1];
  }
  h += dateStrip(dates, S.rsDate, 'rdate');
  const dayRes = rs.filter(r => issueDate(r) === S.rsDate);
  const dayFix = sched.filter(m => issueDate(m) === S.rsDate && !dayRes.some(r => r.id === m.id));
  const day = [...dayRes, ...dayFix];
  if (S.rsLeague !== '全部' && !day.some(x => x.league === S.rsLeague)) S.rsLeague = '全部';
  h += leagueChips(day, S.rsLeague, 'rlg');
  if (S.rsrc?.source === 'sample') h += `<div class="warn-bar">⚠️ <b>示例数据</b>：${esc(S.rsrc.note || '官方接口暂不可达')}，<b>非真实赛果</b>。</div>`;
  const list = day.filter(r => S.rsLeague === '全部' || r.league === S.rsLeague).sort((a, b) => String(a.num).localeCompare(String(b.num), 'zh'));
  let hit = 0, tot = 0;
  list.forEach(r => { if (!r.full) return; const { res, fav } = resultInfo(r); if (res && fav) { tot++; if (res === fav) hit++; } });
  if (tot) h += `<div class="daysum"><b class="num">${hit}/${tot}</b><div>赔率热门（胜平负隐含概率最高项）命中 ${hit} 场，命中率 ${pct(hit / tot)}</div></div>`;
  const wk = list[0] ? issueWeek(list[0]) : wd(S.rsDate);
  h += `<div class="list-meta"><span>${esc(S.rsDate)} ${wk} 开奖</span><span>${list.length} 场</span></div>`;
  h += list.length ? `<div class="grid">${list.map(x => x.full ? resultCard(x) : matchCard(x)).join('')}</div>` : empty('该日期或联赛筛选下暂无场次。', '', '暂无场次');
  return h + foot();
}

// ======================= detail =======================
function oddsSection(title, m, pool, ip, selectable) {
  const o = m[pool];
  if (!o) return `<div class="dsec"><h3>${title}</h3><div class="note">该玩法暂未开售</div></div>`;
  const top = ip ? order(ip)[0] : null; const tg = selectable ? 'button' : 'div';
  return `<div class="dsec"><h3><span>${title}</span><small>返还率 ${ip ? pct(ip.payout, 1) : '-'}</small></h3>
    <div class="otable">${['h', 'd', 'a'].map(k => `<${tg} class="cell ${S.sel[m.id]?.[pool + k] ? 'sel' : ''} ${k === top ? 'top' : ''}" ${selectable ? `data-mid="${esc(m.id)}" data-key="${pool + k}"` : ''}>${LBL[pool][k]}<b class="num">${o[k] ? o[k].toFixed(2) : '-'}</b><em>概率 ${ip ? pct(ip[k], 1) : '-'}</em></${tg}>`).join('')}</div>
    ${ip ? `<div style="margin-top:12px"><div class="pbar"><i class="h" style="width:${ip.h * 100}%"></i><i class="d" style="width:${ip.d * 100}%"></i><i class="a" style="width:${ip.a * 100}%"></i></div>
    <div class="plbl"><span class="h">${LBL[pool].h} ${pct(ip.h, 1)}</span><span>${LBL[pool].d} ${pct(ip.d, 1)}</span><span class="a">${LBL[pool].a} ${pct(ip.a, 1)}</span></div></div>` : ''}</div>`;
}

function logoProxy(url) {
  if (!url) return '';
  return API + '/api/logo?url=' + encodeURIComponent(url);
}
async function loadSquadSide(teamId, name) {
  if (!teamId && !name) return { ok: false, players: [], error: '无球队 ID' };
  try {
    const q = [];
    if (teamId) q.push('teamId=' + encodeURIComponent(teamId));
    if (name) q.push('name=' + encodeURIComponent(name));
    return await api('/squad?' + q.join('&'), { timeout: 15000 });
  } catch (e) { return { ok: false, players: [], error: e.message || '加载失败' }; }
}
function playerCard(pl) {
  const disp = pl.nameZh || pl.name || '?';
  const initial = esc([...disp][0] || '?');
  const img = pl.photo
    ? '<img class="pl-ph" src="' + logoProxy(pl.photo) + '" alt="" loading="lazy" onerror="this.outerHTML=\'<div class=pl-ph>' + initial + '</div>\'"/>'
    : '<div class="pl-ph">' + initial + '</div>';
  const pos = pl.positionZh || pl.position || '未知位置';
  const nat = pl.nationalityZh || pl.nationality || '';
  const enSub = (pl.nameZh && pl.name && pl.nameZh !== pl.name)
    ? '<div class="pl-meta dim">' + esc(pl.name) + '</div>'
    : '';
  return '<button type="button" class="pl-card" data-go="#/player/' + encodeURIComponent(pl.id) + '">' + img +
    '<div class="pl-body"><div class="pl-name">' +
    (pl.number ? '<span class="pl-no">' + esc(pl.number) + '</span>' : '') + esc(disp) + yiMark(pl.nameZhSrc === 'auto') + '</div>' +
    enSub +
    '<div class="pl-meta">' + esc(pos) + (nat ? ' · ' + esc(nat) : '') + '</div>' +
    ((pl.height || pl.born) ? '<div class="pl-meta dim">' + [pl.height, pl.born ? ('出生 ' + pl.born) : ''].filter(Boolean).map(esc).join(' · ') + '</div>' : '') +
    '</div><span class="pl-go">›</span></button>';
}
function squadPanel(label, data) {
  if (!data) return '<div class="squad-pane"><div class="spinner"></div></div>';
  if (!data.ok && !(data.players && data.players.length)) {
    return '<div class="squad-pane">' + empty(esc(data.error || '暂无阵容数据'), '<span class="note">球员库未覆盖该队或资料不全</span>') + '</div>';
  }
  const n = data.players.length;
  const ph = data.withPhoto != null ? data.withPhoto : data.players.filter(x => x.photo).length;
  return '<div class="squad-pane"><div class="list-meta"><span>' + esc(label) + (data.nameEn ? ' · ' + esc(data.nameEn) : '') +
    '</span><span>' + n + ' 人 · ' + ph + ' 有照片</span></div><div class="pl-grid">' + data.players.map(playerCard).join('') +
    '</div><p class="note" style="margin:8px 0 0">' + esc(data.noteZh || '阵容来自公开资料，可能不完整。进球助攻等赛季数据需更高级数据源。') + '</p></div>';
}
// 1.9.5: 阵容 tab = ONLY this match lineup (pitch view + bench); full roster removed
const yiMark = auto => auto ? '<sup class="yi" title="程序自动音译，仅供参考">译</sup>' : '';
function luLine(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'G' || p === 'GK') return 0;
  if (/^(CD|SW|LB|RB|LWB|RWB|D|CB)/.test(p)) return 1;
  if (/^DM/.test(p)) return 2;
  if (/^(CM|LM|RM|M)/.test(p)) return 3;
  if (/^AM/.test(p)) return 4;
  return 5; // F, CF, LW, RW, ST
}
function luLat(pos) {
  const p = String(pos || '').toUpperCase();
  if (/-L$/.test(p)) return -1; if (/-R$/.test(p)) return 1;
  if (/^L/.test(p)) return -2; if (/^R/.test(p)) return 2;
  return 0;
}
function luAvatar(p, cls) {
  const disp = p.nameZh || p.name || '?';
  const ini = esc([...disp][0] || '?');
  return p.photo
    ? `<span class="${cls}"><img src="${logoProxy(p.photo)}" alt="" onerror="this.parentNode.textContent='${ini}'"/></span>`
    : `<span class="${cls}">${ini}</span>`;
}
function luShort(p) {
  if (p.nameZh) {
    const z = p.nameZh.split(/[·・•]/).filter(Boolean);
    return z[z.length - 1] || p.nameZh; // surname incl. hyphenated (亚历山大-阿诺德), CSS ellipsis handles width
  }
  const parts = String(p.name || '').split(' '); return parts[parts.length - 1] || p.name || '';
}
function pitchHtml(side) {
  const lines = {};
  side.starters.forEach((p, i) => { const l = luLine(p.pos); (lines[l] = lines[l] || []).push({ p, i }); });
  const order = Object.keys(lines).map(Number).sort((x, y) => y - x); // attack at top
  return `<div class="pitch">${order.map(l => `<div class="pitch-row">${lines[l].sort((x, y) => luLat(x.p.pos) - luLat(y.p.pos) || x.i - y.i).map(({ p }) =>
    `<div class="pp">${luAvatar(p, 'pp-ph')}<span class="pp-no">${esc(p.number || '')}</span><span class="pp-nm">${esc(luShort(p))}${yiMark(p.nameZhSrc === 'auto')}${p.subbedOut ? '<i class="lu-out">↓</i>' : ''}</span></div>`).join('')}</div>`).join('')}</div>`;
}
function lineupSide(label, side, opts = {}) {
  if (!side) return `<div class="lu-side"><div class="lu-hd"><b>${esc(label)}</b></div><p class="note">${esc(opts.emptyText || '暂无可用首发数据')}</p></div>`;
  const used = side.bench.filter(p => p.subbedIn);
  const unused = side.bench.filter(p => !p.subbedIn);
  const brow = p => `<li>${luAvatar(p, 'lu-ph')}<span class="lu-no">${esc(p.number || '')}</span><span class="lu-nm">${esc(p.nameZh || p.name)}${yiMark(p.nameZhSrc === 'auto')}${p.nameZh && p.name ? ` <small class="muted">${esc(p.name)}</small>` : ''}</span>${p.subbedIn ? `<em class="lu-in">↑${p.subFor ? ' 换下 ' + esc(p.subFor) : ''}</em>` : ''}</li>`;
  const benchHtml = opts.hideBench || !side.bench.length ? '' : `<div class="lu-sub-h">替补${used.length ? `（登场 ${used.length}）` : ''}</div><ul class="lu-list">${[...used, ...unused].map(brow).join('')}</ul>`;
  const from = side.fromEvent ? `<div class="note">上一场：${esc(side.fromEvent.date)} ${esc(side.fromEvent.home)} ${esc(side.fromEvent.score)} ${esc(side.fromEvent.away)}${side.fromEvent.league ? ' · ' + esc(side.fromEvent.league) : ''}</div>` : '';
  const ph = side.photoCount != null ? ` · 照片 ${side.photoCount}/${side.playerCount}` : '';
  return `<div class="lu-side"><div class="lu-hd"><b>${esc(label)}</b><span class="note">${side.formation ? esc(side.formation) : ''}${ph}</span></div>${from}${pitchHtml(side)}${benchHtml}</div>`;
}
function lineupHtml(x, L) {
  if (!L) return '<div class="spinner"></div>';
  if (!L.ok) return empty(esc(L.error || '阵容数据暂时不可用'));
  const sideK = (S.squadTab && S.squadTab[x.id]) || 'home';
  const real = L.home || L.away;
  const stateLab = { final: '本场实际阵容 · 完场', live: '本场首发 · 进行中', announced: '本场首发 · 已公布' }[L.state] || '';
  const chips = `<div class="chips squad-chips"><button class="${sideK === 'home' ? 'on' : ''}" data-act="squadTab" data-id="${esc(x.id)}" data-side="home">${esc(x.home)}</button><button class="${sideK === 'away' ? 'on' : ''}" data-act="squadTab" data-id="${esc(x.id)}" data-side="away">${esc(x.away)}</button></div>`;
  const lab = sideK === 'home' ? x.home : x.away;
  let h = '';
  if (real) {
    h += `<div class="list-meta"><span>${esc(stateLab)}</span><span>来源 ESPN</span></div>${chips}${lineupSide(lab, sideK === 'home' ? L.home : L.away)}`;
  } else {
    const pend = L.state === 'pending' ? '首发未公布（通常赛前约1小时）' : L.state === 'no-event' ? 'ESPN 未收录本场，无法获取本场首发' : '暂无本场阵容数据';
    h += `<div class="warn-bar">${esc(pend)}</div>`;
    if (L.prevHome || L.prevAway) {
      h += `<div class="list-meta"><span>参考：上一场实际首发（非本场）</span><span>来源 ESPN</span></div>${chips}${lineupSide(lab, sideK === 'home' ? L.prevHome : L.prevAway, { hideBench: true, emptyText: '未获取到上一场首发' })}`;
    }
  }
  if (L.noteZh) h += `<p class="note" style="margin:8px 0 0">${esc(L.noteZh)} 照片来自 ESPN / TheSportsDB 名单匹配，无照片显示首字。</p>`;
  return h;
}
function squadSectionHtml(x) {
  const L = S.lineupCache && S.lineupCache[x.id];
  return '<div class="dsec lineup-sec"><h3>本场阵容 <small>首发 · 阵型 · 替补</small></h3><div id="lineup-box-' + esc(x.id) + '">' + lineupHtml(x, L) + '</div></div>';
}
async function ensureLineup(x) {
  S.lineupCache = S.lineupCache || {};
  const c = S.lineupCache[x.id];
  if (c && c._at && Date.now() - c._at < (c.state === 'final' ? 3600e3 : 120e3)) return;
  const q = ['matchId=' + encodeURIComponent(x.id), 'date=' + encodeURIComponent(x.date || ''), 'time=' + encodeURIComponent(x.time || ''),
    'homeTeamId=' + encodeURIComponent(x.homeTeamId || ''), 'awayTeamId=' + encodeURIComponent(x.awayTeamId || ''),
    'home=' + encodeURIComponent(x.home || ''), 'away=' + encodeURIComponent(x.away || '')];
  let L;
  try { L = await api('/lineup?' + q.join('&'), { timeout: 45000 }); } catch (e) { L = { ok: false, error: e.message || '加载失败' }; }
  L._at = Date.now();
  S.lineupCache[x.id] = L;
  const box = document.getElementById('lineup-box-' + x.id);
  if (box) box.innerHTML = lineupHtml(x, L);
}
async function ensureSquad(x) {
  if (!x) return;
  ensureLineup(x);
}
async function enrichSquadZh(x, key, teamId, teamName) {
  try {
    const q = [];
    if (teamId) q.push('teamId=' + encodeURIComponent(teamId));
    if (teamName) q.push('name=' + encodeURIComponent(teamName));
    const j = await api('/squad-zh?' + q.join('&'), { timeout: 60000 });
    if (!j || !j.names || !S.squadCache[key] || !S.squadCache[key].players) return;
    let changed = false;
    for (const pl of S.squadCache[key].players) {
      if (j.names[pl.id]) { pl.nameZh = j.names[pl.id]; changed = true; }
    }
    if (!changed) return;
    const side = (S.squadTab && S.squadTab[x.id]) || 'home';
    if (((side === 'home' ? x.homeTeamId : x.awayTeamId) || '') !== (teamId || '')) return;
    const box = document.getElementById('squad-box-' + x.id);
    if (box) box.innerHTML = squadPanel(side === 'home' ? x.home : x.away, S.squadCache[key]);
  } catch (_) {}
}

function pagePlayer(id) {
  let h = hdr('球员详情');
  h += '<div id="player-box" class="dsec"><div class="spinner"></div></div>';
  setTimeout(() => fillPlayer(id), 0);
  return h + foot();
}
async function fillPlayer(id) {
  const box = document.getElementById('player-box');
  if (!box) return;
  try {
    const p = await api('/player?id=' + encodeURIComponent(id), { timeout: 15000 });
    if (!p || !p.ok) {
      box.innerHTML = empty(esc((p && p.error) || '未找到球员'));
      return;
    }
    const photo = p.cutout || p.photo || p.thumb || p.render || '';
    const img = photo
      ? '<img class="player-hero-ph" src="' + logoProxy(photo) + '" alt="" onerror="this.style.display=\'none\'"/>'
      : '<div class="player-hero-ph fallback">' + esc((p.name || '?').slice(0, 1)) + '</div>';
    box.innerHTML = '<div class="player-hero">' + img + '<div><h2>' + esc(p.nameZh || p.name) + yiMark(p.nameZhSrc === 'auto') + '</h2>' +
      (p.nameZh ? '<div class="note">原文 ' + esc(p.name) + (p.nameZhSrc === 'auto' ? '（中文为程序自动音译，仅供参考）' : '') + '</div>' : (p.nameAlt ? '<div class="note">' + esc(p.nameAlt) + '</div>' : '')) +
      '<div class="player-tags"><span>' + esc(p.positionZh || p.position || '') + '</span>' +
      (p.number ? '<span>号码 ' + esc(p.number) + '</span>' : '') +
      (p.nationalityZh || p.nationality ? '<span>' + esc(p.nationalityZh || p.nationality) + '</span>' : '') +
      '</div></div></div>' +
      '<dl class="kv">' +
      '<dt>俱乐部</dt><dd>' + esc(p.team || '-') + '</dd>' +
      '<dt>位置</dt><dd>' + esc(p.positionZh || p.position || '-') + '</dd>' +
      '<dt>国籍</dt><dd>' + esc(p.nationalityZh || p.nationality || '-') + '</dd>' +
      '<dt>身高</dt><dd>' + esc(p.height || p.heightRaw || '-') + '</dd>' +
      '<dt>出生日期</dt><dd>' + esc(p.born || '-') + '</dd>' +
      '<dt>出生地</dt><dd>' + esc(p.birthLocation || '-') + '</dd>' +
      '<dt>状态</dt><dd>' + esc(p.statusZh || p.status || '-') + '</dd>' +
      '</dl>' +
      (p.description ? ('<div class="player-bio"><h3>简介</h3><p>' + esc(p.description).replace(/\n/g, '<br>') + '</p>' +
        (p.descriptionLang === 'en' ? '<p class="note">暂无中文简介，以上为英文原文。</p>' : '') + '</div>') : '<p class="note">暂无简介。</p>') +
      '<p class="note">' + esc(p.noteZh || '') + '</p>';
  } catch (e) {
    box.innerHTML = empty('加载失败：' + esc(e.message || ''));
  }
}

// ----- match detail tabs: 情报 / 数据 / 阵容 / 预测 -----
const DETAIL_TABS_BASE = [['intel', '情报'], ['odds', '赔率'], ['data', '数据'], ['chat', '聊球'], ['squad', '阵容'], ['pred', '预测']];
function isMatchFinished(x) {
  if (!x) return false;
  if (x._t === 'r' || x.full) return true;
  if (x.status && /完场|已结束|Payout|Finished/i.test(String(x.status))) return true;
  const id = String(x.id || '');
  const live = S.liveStatsCache && S.liveStatsCache[id];
  if (live && live.ok) {
    const short = String((live.status && live.status.short) || '');
    if (/^(FT|AET|PEN)$/.test(short)) return true;
    if (live.finished) return true;
    // Score present and no longer live → treat as FT (AF sometimes omits short briefly)
    if (!live.live && live.score && live.score.home != null && live.score.away != null
      && short && !/^(1H|2H|HT|ET|BT|P|LIVE|NS|TBD|PST|CANC)$/.test(short)) {
      return true;
    }
  }
  const ls = S.liveScores && S.liveScores[id];
  if (ls && ls.finished) return true;
  return false;
}
function detailTabsFor(x) {
  const tabs = DETAIL_TABS_BASE.slice();
  if (isMatchFinished(x)) {
    // Insert 赛后复盘 before 预测
    const i = tabs.findIndex(t => t[0] === 'pred');
    const row = ['review', '赛后复盘'];
    if (i >= 0) tabs.splice(i, 0, row);
    else tabs.push(row);
  }
  return tabs;
}
function detailTabOf(id) {
  S.detailTab = S.detailTab || {};
  return S.detailTab[id] || 'intel';
}
function intelBullets(m, stats) {
  const bullets = [];
  const p = implied(m.had);
  const H = esc(m.home), A = esc(m.away);
  if (p) {
    const k = order(p);
    const gap = (p[k[0]] - p[k[1]]) * 100;
    if (k[0] === 'h') bullets.push(`市场赔率看好主队 <b>${H}</b>，隐含胜率 ${pct(p.h, 1)}，领先第二选项约 ${gap.toFixed(0)} 个百分点。`);
    else if (k[0] === 'a') bullets.push(`市场赔率看好客队 <b>${A}</b>，隐含胜率 ${pct(p.a, 1)}，领先第二选项约 ${gap.toFixed(0)} 个百分点。`);
    else bullets.push(`平局隐含概率最高（${pct(p.d, 1)}），市场认为双方实力接近，打平可能性不小。`);
    if (p.h - p.a >= 0.12) bullets.push(`主队赔率优势明显（主胜 ${pct(p.h, 1)} vs 客胜 ${pct(p.a, 1)}），主场因素可能被市场计入。`);
    else if (p.a - p.h >= 0.12) bullets.push(`客队赔率优势明显（客胜 ${pct(p.a, 1)} vs 主胜 ${pct(p.h, 1)}），市场更看好客队取分。`);
    else bullets.push(`主客隐含概率接近（${pct(p.h, 1)} / ${pct(p.a, 1)}），强弱并不分明。`);
    if (p.d >= 0.28) bullets.push(`平赔偏低（${m.had.d.toFixed(2)}），平局概率 ${pct(p.d, 1)}，需防闷平。`);
  } else {
    bullets.push('该场暂未开售胜平负玩法，暂无法从赔率推导情报。');
  }
  if (m.hhad && m.hhad.goalLine != null && implied(m.hhad)) {
    const gl = Number(m.hhad.goalLine);
    const q = implied(m.hhad);
    const qk = order(q)[0];
    const desc = gl < 0 ? `主队让 ${Math.abs(gl)} 球` : `主队受让 ${Math.abs(gl)} 球`;
    bullets.push(`让球盘（${desc}）倾向 <b>${LBL.hhad[qk]}</b>（${pct(q[qk], 1)}）。`);
  }
  if (stats && stats.homeForm && stats.homeForm.matches && stats.homeForm.matches.length) {
    const hs = stats.homeForm.summary, as = stats.awayForm.summary;
    const hf = stats.homeForm.matches.map(x => x.outcome).join('');
    const af = stats.awayForm.matches.map(x => x.outcome).join('');
    bullets.push(`近期战绩（历史库）：${H} ${hs.w}胜${hs.d}平${hs.l}负（${esc(hf)}）；${A} ${as.w}胜${as.d}平${as.l}负（${esc(af)}）。`);
  }
  if (stats && stats.h2h && stats.h2h.matches && stats.h2h.matches.length) {
    const s0 = stats.h2h.summary;
    bullets.push(`双方近期交锋 ${stats.h2h.matches.length} 场：主队视角 ${s0.homeWins}胜${s0.draws}平${s0.awayWins}负。`);
  }
  bullets.push(`<span class="note">以上情报由官方即时赔率与本地历史赛果自动推导，不含伤停/主力出战等内部消息，${DISCLAIMER}</span>`);
  return bullets;
}
function statsUiOf(matchId) {
  S.statsUi = S.statsUi || {};
  const cur = S.statsUi[matchId] || {};
  return {
    formN: cur.formN === 10 ? 10 : 5,
    formVenue: ['all', 'home', 'away'].includes(cur.formVenue) ? cur.formVenue : 'all',
    h2hN: cur.h2hN === 10 ? 10 : 5,
  };
}
function setStatsUi(matchId, patch) {
  S.statsUi = S.statsUi || {};
  S.statsUi[matchId] = { ...statsUiOf(matchId), ...patch };
}
function summarizeOutcomes(list) {
  const s = { w: 0, d: 0, l: 0 };
  for (const m of list) {
    if (m.outcome === 'W' || m.forCurrentHome === 'W') s.w++;
    else if (m.outcome === 'D' || m.forCurrentHome === 'D') s.d++;
    else s.l++;
  }
  return s;
}
function filterFormMatches(form, teamId, venue, n) {
  let list = (form && form.matches) ? form.matches.slice() : [];
  const tid = String(teamId || '');
  if (venue === 'home') list = list.filter(m => String(m.homeTeamId) === tid);
  else if (venue === 'away') list = list.filter(m => String(m.awayTeamId) === tid);
  list = list.slice(0, n);
  return { matches: list, summary: summarizeOutcomes(list.map(m => ({ outcome: m.outcome }))) };
}
function formSourceLab(form, statsSide) {
  const src = (form && form.source) || statsSide || 'history';
  return formSrcZh(src);
}
function formSrcZh(src) {
  const t = String(src || 'history').split('+');
  if (t.length === 1 && t[0] === 'history') return '竞彩历史';
  const lab = { history: '竞彩', espn: 'ESPN赛程', 'api-football': '全赛程' };
  return t.map(x => lab[x] || x).join('+');
}
function formStrip(form, label, { teamId, venue = 'all', n = 5, compact = false, sourceHint = '' } = {}) {
  const filtered = teamId ? filterFormMatches(form, teamId, venue, n) : {
    matches: ((form && form.matches) || []).slice(0, n),
    summary: form && form.summary ? form.summary : { w: 0, d: 0, l: 0 },
  };
  if (!filtered.matches.length) {
    return `<div class="form-block"><div class="form-h">${esc(label)}</div><p class="note">暂无近期赛果${venue !== 'all' ? '（该筛选）' : ''}</p></div>`;
  }
  const s = filtered.summary;
  const chips = filtered.matches.map(m => {
    const cls = m.outcome === 'W' ? 'w' : m.outcome === 'D' ? 'd' : 'l';
    const lg = m.league ? ` · ${m.league}` : '';
    const tip = esc(m.date + ' ' + m.home + ' ' + (m.ft || '') + ' ' + m.away + lg);
    return `<span class="fchip ${cls}" title="${tip}">${m.outcome || '?'}</span>`;
  }).join('');
  const venueLab = venue === 'home' ? '主场' : venue === 'away' ? '客场' : '全部';
  const srcLab = formSourceLab(form, sourceHint);
  return `<div class="form-block"><div class="form-h">${esc(label)} <small>近${filtered.matches.length} · ${venueLab} · ${s.w}胜${s.d}平${s.l}负 · ${esc(srcLab)}</small></div><div class="form-row">${chips}</div>
    ${compact ? '' : `<ul class="form-list">${filtered.matches.map(m => `<li><span>${esc(m.date)}</span><span>${esc(m.home)} ${esc(m.ft || '-')} ${esc(m.away)}${m.league ? ` <small class="muted">${esc(m.league)}</small>` : ''}</span><b class="${m.outcome === 'W' ? 'w' : m.outcome === 'D' ? 'd' : 'l'}">${m.outcome || '-'}</b></li>`).join('')}</ul>`}</div>`;
}
function h2hBlock(h2h, home, away, { n = 5, matchId = '', h2hSource = '' } = {}) {
  const all = (h2h && h2h.matches) ? h2h.matches : [];
  const list = all.slice(0, n);
  if (!list.length) {
    return `<div class="ana-card"><div class="ana-hd"><h3>历史交锋</h3></div><p class="note">本地历史库与第三方均暂无双方完场交锋记录</p></div>`;
  }
  const s = summarizeOutcomes(list.map(m => ({ forCurrentHome: m.forCurrentHome })));
  const total = s.w + s.d + s.l || 1;
  const srcLab = h2hSource === 'api-football' ? 'API-Football' : '本地历史库';
  const filters = matchId ? `<div class="ana-filters">
    ${[5, 10].map(k => `<button type="button" class="ana-chip ${n === k ? 'on' : ''}" data-act="statsUi" data-id="${esc(matchId)}" data-k="h2hN" data-v="${k}">近${k}</button>`).join('')}
  </div>` : '';
  return `<div class="ana-card"><div class="ana-hd"><h3>历史交锋</h3><small>主队视角 · ${list.length} 场 · ${esc(srcLab)}</small></div>${filters}
    <div class="cmp-bars">
      <div class="cmp-row"><span>${esc(home)}</span><div class="cmp-track"><i class="h" style="width:${(s.w / total) * 100}%"></i></div><b>${s.w}</b></div>
      <div class="cmp-row"><span>平局</span><div class="cmp-track"><i class="d" style="width:${(s.d / total) * 100}%"></i></div><b>${s.d}</b></div>
      <div class="cmp-row"><span>${esc(away)}</span><div class="cmp-track"><i class="a" style="width:${(s.l / total) * 100}%"></i></div><b>${s.l}</b></div>
    </div>
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr><th>日期</th><th>对阵</th><th>比分</th><th>主队</th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${esc(m.date)}</td><td>${esc(m.home)} vs ${esc(m.away)}</td><td class="num">${esc(m.ft || '-')}</td>
      <td><b class="${m.forCurrentHome === 'W' ? 'w' : m.forCurrentHome === 'D' ? 'd' : 'l'}">${m.forCurrentHome === 'W' ? '胜' : m.forCurrentHome === 'D' ? '平' : '负'}</b></td></tr>`).join('')}</tbody></table></div>
  </div>`;
}
function processMetricFmt(key, v) {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  if (key === 'possession' || key === 'passesPct') return (Math.round(n * 10) / 10) + '%';
  if (key === 'expectedGoals') return (Math.round(n * 100) / 100).toFixed(2);
  return (Math.round(n * 10) / 10).toString();
}
function processSideMissReason(side) {
  if (!side) return '暂无数据';
  if (side.ok) return '';
  const r = side.reason || '';
  if (r === 'no_af_team') return '球队未映射到数据源';
  if (r === 'no_fixtures') return '暂无完场场次';
  if (r === 'no_stats') return '暂无技术统计（近期场次无数据或队名映射异常）';
  if (r === 'quota') return '配额紧张';
  if (r === 'suspended') return '数据源暂停';
  if (r === 'no_key') return '未配置密钥';
  const n = String(side.noteZh || '');
  if (n) return n.length > 28 ? n.slice(0, 28) + '…' : n;
  return '暂无数据';
}
function processStatsCard(x, stats) {
  const proc = stats && stats.process;
  const metrics = (proc && proc.metrics && proc.metrics.length)
    ? proc.metrics
    : [
      { key: 'possession', labelZh: '控球率' },
      { key: 'shots', labelZh: '射门' },
      { key: 'shotsOnTarget', labelZh: '射正' },
      { key: 'passesPct', labelZh: '传球成功率' },
      { key: 'corners', labelZh: '角球' },
      { key: 'attacks', labelZh: '进攻' },
      { key: 'dangerousAttacks', labelZh: '危险进攻' },
      { key: 'expectedGoals', labelZh: '预期进球 xG' },
    ];
  const hOk = !!(proc && proc.home && proc.home.ok && proc.home.averages);
  const aOk = !!(proc && proc.away && proc.away.ok && proc.away.averages);
  const ha = hOk ? proc.home.averages : null;
  const aa = aOk ? proc.away.averages : null;
  const hn = hOk ? proc.home.n : 0;
  const an = aOk ? proc.away.n : 0;
  const available = !!(proc && proc.available && (hOk || aOk));
  const reason = (proc && proc.reason) || '';
  let small = available
    ? `近${Math.max(hn, an) || (proc && proc.n) || 5}场场均`
    : (reason === 'suspended' ? '密钥暂停' : reason === 'no_key' ? '未配置密钥' : reason === 'quota' ? '配额紧张' : '暂无数据');

  const homeCap = hn ? `近${hn}场` : (proc && proc.home && !proc.home.ok ? '暂无' : '—');
  const awayCap = an ? `近${an}场` : (proc && proc.away && !proc.away.ok ? '暂无' : '—');

  let body = '';
  if (!proc) {
    body = `<div class="proc-empty proc-skel">
      <div class="proc-skel-head"><span></span><span></span></div>
      ${[0,1,2,3].map(() => `<div class="proc-skel-row"><i></i><i></i><i></i></div>`).join('')}
      <p class="note">正在加载近期过程数据…</p>
    </div>`;
  } else if (!available) {
    body = `<div class="proc-empty">
      <div class="proc-empty-ico" aria-hidden="true">📊</div>
      <p><b>近期过程数据暂不可用</b></p>
      <p class="note">${esc((proc && proc.noteZh) || '配置有效 API-Football 密钥后将展示控球、射门、传球等场均对比。')}</p>
      <div class="proc-shell-preview" aria-hidden="true">
        ${metrics.slice(0, 3).map(m => `
          <div class="proc-row dim">
            <div class="proc-metric-lab">${esc(m.labelZh)}</div>
            <div class="proc-compare">
              <span class="proc-val h">-</span>
              <div class="proc-track empty"><span class="proc-ghost"></span></div>
              <span class="proc-val a">-</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  } else {
    const missNotes = [];
    if (!hOk) missNotes.push(`主队「${esc(x.home)}」：${esc(processSideMissReason(proc.home))}`);
    if (!aOk) missNotes.push(`客队「${esc(x.away)}」：${esc(processSideMissReason(proc.away))}`);

    const rows = metrics.map(m => {
      const hv = ha ? ha[m.key] : null;
      const av = aa ? aa[m.key] : null;
      if (hv == null && av == null) return '';
      const both = hv != null && av != null;
      const hNum = hv != null ? Number(hv) : null;
      const aNum = av != null ? Number(av) : null;
      const pctCeil = (m.key === 'possession' || m.key === 'passesPct') ? 100 : null;
      let hLead = false, aLead = false;
      let hBar = '', aBar = '', trackCls = 'proc-track';
      if (both) {
        const max = Math.max(hNum, aNum, pctCeil || 0.01, 0.01);
        const hw = Math.max(2, (hNum / max) * 100);
        const aw = Math.max(2, (aNum / max) * 100);
        const eps = m.key === 'possession' || m.key === 'passesPct' ? 3 : (m.key === 'expectedGoals' ? 0.15 : 0.15);
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
        aBar = `<span class="proc-miss" title="客队暂无该指标"></span>`;
      } else {
        const max = Math.max(aNum, pctCeil || aNum, 0.01);
        const aw = Math.max(6, Math.min(100, (aNum / max) * 100));
        trackCls += ' solo-a';
        hBar = `<span class="proc-miss" title="主队暂无该指标"></span>`;
        aBar = `<i class="a solo" style="width:${aw.toFixed(1)}%"></i>`;
      }
      return `<div class="proc-row ${both ? '' : 'one-side'}">
        <div class="proc-metric-lab">${esc(m.labelZh)}</div>
        <div class="proc-compare">
          <span class="proc-val h ${hLead ? 'lead' : ''} ${hv == null ? 'na' : ''}">${processMetricFmt(m.key, hv)}</span>
          <div class="${trackCls}">${hBar}${aBar}</div>
          <span class="proc-val a ${aLead ? 'lead' : ''} ${av == null ? 'na' : ''}">${processMetricFmt(m.key, av)}</span>
        </div>
      </div>`;
    }).filter(Boolean).join('');

    body = `<div class="proc-teams">
      <div class="proc-team home">
        ${badge(x.home, 'sm', x.homeLogo)}
        <div class="proc-team-meta">
          <b>${esc(x.home)}</b>
          <small>${esc(homeCap)}</small>
        </div>
      </div>
      <div class="proc-vs"><span>VS</span><small>场均对比</small></div>
      <div class="proc-team away">
        <div class="proc-team-meta">
          <b>${esc(x.away)}</b>
          <small>${esc(awayCap)}</small>
        </div>
        ${badge(x.away, 'sm', x.awayLogo)}
      </div>
    </div>
    ${missNotes.length ? `<div class="proc-miss-banner">${missNotes.map(n => `<p>${n}</p>`).join('')}</div>` : ''}
    <div class="proc-bars">${rows || '<p class="note">暂无可用指标</p>'}</div>
    <p class="proc-foot note">${esc((proc && proc.noteZh) || '过程指标为完场场均，反映风格倾向，需结合战绩与盘面。')}</p>`;
  }

  return `<div class="ana-card proc-card"><div class="ana-hd"><h3>近期过程数据</h3><small>${esc(small)}</small></div>${body}</div>`;
}
function formAnalysisCard(x, stats, ui) {
  const mid = String(x.id || '');
  const filters = `<div class="ana-filters">
    ${[5, 10].map(k => `<button type="button" class="ana-chip ${ui.formN === k ? 'on' : ''}" data-act="statsUi" data-id="${esc(mid)}" data-k="formN" data-v="${k}">近${k}</button>`).join('')}
    <span class="chip-sep"></span>
    ${[['all', '全部'], ['home', '主场'], ['away', '客场']].map(([k, lab]) =>
      `<button type="button" class="ana-chip ${ui.formVenue === k ? 'on' : ''}" data-act="statsUi" data-id="${esc(mid)}" data-k="formVenue" data-v="${k}">${lab}</button>`
    ).join('')}
  </div>`;
  const fs = (stats && stats.formSource) || 'history';
  const hdLab = formSrcZh(fs) + ' · 可筛选';
  return `<div class="ana-card"><div class="ana-hd"><h3>近期战绩</h3><small>${esc(hdLab)}</small></div>${filters}
    ${formStrip(stats && stats.homeForm, x.home, { teamId: x.homeTeamId, venue: ui.formVenue, n: ui.formN, sourceHint: stats && stats.homeFormSource })}
    ${formStrip(stats && stats.awayForm, x.away, { teamId: x.awayTeamId, venue: ui.formVenue, n: ui.formN, sourceHint: stats && stats.awayFormSource })}
    <p class="note" style="margin:8px 0 0">${esc((stats && stats.noteZh) || '以上为历史赛果推导。')}${ui.formVenue !== 'all' ? ' 主/客场按该队在该场次的主客身份筛选。' : ''}</p>
  </div>`;
}
function nextFixturesFor(teamId, excludeId, limit = 3) {
  const tid = String(teamId || '');
  if (!tid) return [];
  const pool = [];
  const seen = new Set();
  for (const m of [...(S.schedule || []), ...(S.matches || [])]) {
    const id = String(m.id);
    if (id === String(excludeId) || seen.has(id)) continue;
    if (String(m.homeTeamId) !== tid && String(m.awayTeamId) !== tid) continue;
    if (m.full) continue;
    seen.add(id);
    pool.push(m);
  }
  return pool.sort((a, b) => kickoff(a) - kickoff(b)).slice(0, limit);
}
function nextFixturesCard(x) {
  const homeNext = nextFixturesFor(x.homeTeamId, x.id, 3);
  const awayNext = nextFixturesFor(x.awayTeamId, x.id, 3);
  if (!homeNext.length && !awayNext.length) {
    return `<div class="ana-card"><div class="ana-hd"><h3>后续赛程</h3></div><p class="note">当前在售/赛程列表中暂无两队后续场次</p></div>`;
  }
  const row = (m, tid) => {
    const isHome = String(m.homeTeamId) === String(tid);
    const vs = isHome ? m.away : m.home;
    const side = isHome ? '主' : '客';
    return `<li><span>${esc(issueDate(m).slice(5))} ${esc(m.time || '')}</span><span><i class="side">${side}</i> vs ${esc(vs)}</span><span class="tag" style="background:${esc(m.leagueColor || '#4a6fd8')}">${esc(m.league)}</span>
      <button type="button" class="linkish" data-go="#/match/${encodeURIComponent(m.id)}">详情</button></li>`;
  };
  return `<div class="ana-card"><div class="ana-hd"><h3>后续赛程</h3><small>来自当前在售/赛程</small></div>
    <div class="next-fix"><div class="form-h">${esc(x.home)}</div>
      ${homeNext.length ? `<ul class="next-list">${homeNext.map(m => row(m, x.homeTeamId)).join('')}</ul>` : '<p class="note">暂无后续场次</p>'}
    </div>
    <div class="next-fix"><div class="form-h">${esc(x.away)}</div>
      ${awayNext.length ? `<ul class="next-list">${awayNext.map(m => row(m, x.awayTeamId)).join('')}</ul>` : '<p class="note">暂无后续场次</p>'}
    </div>
  </div>`;
}
function oddsCompareBlock(m) {
  const p = implied(m.had);
  if (!p) return `<div class="dsec"><h3>赔率对比</h3><p class="note">暂无胜平负赔率</p></div>`;
  return `<div class="dsec"><h3>赔率隐含概率对比</h3>
    <div class="cmp-bars">
      <div class="cmp-row"><span>主胜 ${esc(m.home)}</span><div class="cmp-track"><i class="h" style="width:${p.h * 100}%"></i></div><b>${pct(p.h, 1)}</b></div>
      <div class="cmp-row"><span>平局</span><div class="cmp-track"><i class="d" style="width:${p.d * 100}%"></i></div><b>${pct(p.d, 1)}</b></div>
      <div class="cmp-row"><span>客胜 ${esc(m.away)}</span><div class="cmp-track"><i class="a" style="width:${p.a * 100}%"></i></div><b>${pct(p.a, 1)}</b></div>
    </div>
  </div>`;
}
function votePanelHtml(matchId) {
  const v = (S.voteCache && S.voteCache[matchId]) || null;
  if (!v) return `<div class="dsec vote-sec" id="vote-box-${esc(matchId)}"><h3>大众态度</h3><div class="spinner"></div></div>`;
  const total = v.total || 0;
  const pctOf = k => total ? ((v.counts[k] / total) * 100) : 0;
  const labels = { h: '胜', d: '平', a: '负' };
  const mine = v.myVote;
  return `<div class="dsec vote-sec" id="vote-box-${esc(matchId)}"><h3>大众态度 <small>${total ? total + ' 人已投票' : '来当第一个投票的人'}</small></h3>
    <div class="vote-bars">${['h', 'd', 'a'].map(k => {
      const p = pctOf(k);
      return `<div class="vote-row ${mine === k ? 'mine' : ''}"><div class="vote-lab">${labels[k]}</div>
        <div class="vote-track"><i class="${k}" style="width:${Math.max(p, total ? 2 : 0)}%"></i></div>
        <div class="vote-pct num">${p.toFixed(0)}%</div></div>`;
    }).join('')}</div>
    <div class="vote-btns">${['h', 'd', 'a'].map(k =>
      `<button type="button" class="vote-btn ${mine === k ? 'on' : ''}" data-act="vote" data-id="${esc(matchId)}" data-choice="${k}">${labels[k]}</button>`
    ).join('')}</div>
    <p class="note" style="margin:10px 0 0">${loggedIn()
      ? (mine ? '你已投票，可点其他选项修改（每场每人一票）。' : '登录用户每场可投一票，结果实时汇总。')
      : '登录后可投票表达态度。<a href="#/login">去登录</a> · 投票仅供参考，不构成投注建议。'}</p>
  </div>`;
}
function renderVoteBox(matchId) {
  const box = document.getElementById('vote-box-' + matchId);
  if (box) box.outerHTML = votePanelHtml(matchId);
}
async function loadVote(matchId) {
  try {
    const j = await api('/match-vote?matchId=' + encodeURIComponent(matchId), { timeout: 8000 });
    S.voteCache = S.voteCache || {};
    S.voteCache[matchId] = j;
    renderVoteBox(matchId);
  } catch (_) {
    S.voteCache = S.voteCache || {};
    S.voteCache[matchId] = { matchId, counts: { h: 0, d: 0, a: 0 }, total: 0, myVote: null };
    renderVoteBox(matchId);
  }
}
async function loadMatchStats(x) {
  if (!x) return null;
  const key = String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '');
  S.statsCache = S.statsCache || {};
  if (S.statsCache[key]) return S.statsCache[key];
  try {
    const q = [];
    if (x.homeTeamId) q.push('homeTeamId=' + encodeURIComponent(x.homeTeamId));
    if (x.awayTeamId) q.push('awayTeamId=' + encodeURIComponent(x.awayTeamId));
    if (x.home) q.push('home=' + encodeURIComponent(x.home));
    if (x.away) q.push('away=' + encodeURIComponent(x.away));
    q.push('limit=20');
    const j = await api('/match-stats?' + q.join('&'), { timeout: 18000 });
    S.statsCache[key] = j;
    return j;
  } catch {
    return { ok: false, homeForm: { matches: [], summary: { w: 0, d: 0, l: 0 } }, awayForm: { matches: [], summary: { w: 0, d: 0, l: 0 } }, h2h: { matches: [], summary: { homeWins: 0, draws: 0, awayWins: 0 } } };
  }
}
async function loadPredictReport(m, { force } = {}) {
  if (!m || !m.id) return null;
  const id = String(m.id);
  S.predictCache = S.predictCache || {};
  if (!force && S.predictCache[id] && S.predictCache[id].ok) return S.predictCache[id];
  try {
    const q = '/predict-report?matchId=' + encodeURIComponent(id) + (force ? '&refresh=1' : '');
    const j = await api(q, { timeout: 20000 });
    if (j && j.ok) S.predictCache[id] = j;
    return j;
  } catch (e) {
    const fail = { ok: false, error: (e && e.message) || '加载失败' };
    // keep previous good cache if any
    if (!(S.predictCache[id] && S.predictCache[id].ok)) S.predictCache[id] = fail;
    return S.predictCache[id];
  }
}
function effectivePredict(m) {
  const rep = S.predictCache && S.predictCache[String(m.id)];
  if (rep && rep.ok && rep.predict) {
    const pr = rep.predict;
    const speakMode = pr.speakMode || (pr.lvl && pr.lvl[0] === 'l0' ? 'align' : 'amplify');
    return {
      pool: pr.pool || 'had',
      top: pr.top,
      second: pr.top === 'h' ? 'd' : 'h',
      conf: pr.conf,
      text: pr.text,
      lvl: pr.lvl,
      summary: pr.summary || rep.summary || '',
      multiFactor: true,
      speakMode,
      speakLabel: pr.speakLabel || '',
      pickText: pr.pickText || pr.text,
      marketLean: pr.marketLean || null,
      conflict: !!pr.conflict,
      p: implied(m.had),
      q: implied(m.hhad),
    };
  }
  const base = predict(m);
  if (!base) return null;
  // Odds-only fallback: pending — do NOT claim「与盘口一致」until multi-factor report loads (1.9.29)
  return {
    ...base,
    speakMode: 'pending',
    speakLabel: '情报加载中…',
    text: '情报加载中…',
    pickText: base.text,
    lvl: ['l0', '加载中'],
    marketLean: base.top,
    _pending: true,
  };
}

/** Prefetch in-sale predict reports so list speakMode is real (not odds-only pending). */
async function prefetchPredictReports(ms, { concurrency = 3 } = {}) {
  const list = (ms || []).filter(m => m && m.id && Date.now() < kickoff(m) + 2 * 3600e3);
  if (!list.length) return;
  S.predictCache = S.predictCache || {};
  S._predPrefetch = S._predPrefetch || { running: false, gen: 0 };
  const gen = ++S._predPrefetch.gen;
  S._predPrefetch.running = true;
  let i = 0;
  let changed = 0;
  const worker = async () => {
    while (i < list.length && S._predPrefetch.gen === gen) {
      const m = list[i++];
      const id = String(m.id);
      if (S.predictCache[id] && S.predictCache[id].ok) continue;
      const before = S.predictCache[id] && S.predictCache[id].ok;
      await loadPredictReport(m);
      if (S.predictCache[id] && S.predictCache[id].ok && !before) {
        changed++;
        if (changed === 1 || changed % 2 === 0) {
          const r = route();
          if (S._predPrefetch.gen === gen && (r.name === 'predict' || r.name === 'home')) render();
        }
      }
    }
  };
  const n = Math.max(1, Math.min(concurrency, list.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  if (S._predPrefetch.gen === gen) {
    S._predPrefetch.running = false;
    const r = route();
    if (r.name === 'predict' || r.name === 'home') render();
  }
  return changed;
}
async function loadPostMatchReview(x, { force } = {}) {
  const id = String(x && x.id || '');
  if (!id) return null;
  S.reviewCache = S.reviewCache || {};
  if (!force && S.reviewCache[id] && S.reviewCache[id].ok && !S.reviewCache[id]._loading
    && Date.now() - (S.reviewCache[id]._at || 0) < 120e3) {
    return S.reviewCache[id];
  }
  if (!(S.reviewCache[id] && S.reviewCache[id].ok)) {
    S.reviewCache[id] = { _loading: true, _at: Date.now() };
  }
  try {
    let q = '/post-match-review?matchId=' + encodeURIComponent(id);
    if (force) q += '&refresh=1';
    const j = await api(q, { timeout: 25000 });
    if (j) {
      j._at = Date.now();
      delete j._loading;
      S.reviewCache[id] = j;
    } else if (S.reviewCache[id] && S.reviewCache[id]._loading) {
      S.reviewCache[id] = { ok: false, error: '复盘暂无返回', _at: Date.now() };
    }
    return S.reviewCache[id];
  } catch (e) {
    const fail = { ok: false, error: (e && e.message) || '加载失败', _at: Date.now() };
    if (!(S.reviewCache[id] && S.reviewCache[id].ok && !S.reviewCache[id]._loading)) S.reviewCache[id] = fail;
    return S.reviewCache[id];
  }
}
async function loadRecentReviews({ force } = {}) {
  S.reviewListCache = S.reviewListCache || null;
  if (!force && S.reviewListCache && Date.now() - (S.reviewListCache._at || 0) < 180e3) return S.reviewListCache;
  try {
    const j = await api('/post-match-reviews?limit=12', { timeout: 12000 });
    S.reviewListCache = Object.assign({ _at: Date.now() }, j || {});
    return S.reviewListCache;
  } catch (e) {
    return { ok: false, items: [], error: e.message, _at: Date.now() };
  }
}
function reviewTabHtml(x) {
  const id = String(x && x.id || '');
  const rep = S.reviewCache && S.reviewCache[id];
  const list = S.reviewListCache;
  let h = '';
  if (!rep || rep._loading) {
    h += `<div class="dsec pmr-loading"><h3>赛后复盘</h3><div class="spinner"></div><p class="note">正在对照赛前过程均值与本场技术统计…</p></div>`;
  } else if (rep.ok && rep.html) {
    h += `<div class="dsec pr-report pmr-report">${rep.html}</div>`;
    h += `<div class="pr-src-bar"><span>${rep.hasActualStats ? '含本场技术统计' : '本场统计暂缺'} · 基线 ${esc(rep.baselineSource || '—')}</span>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">刷新复盘</button></div>`;
  } else if (rep.ok && !rep.html) {
    h += `<div class="dsec pmr-loading"><h3>赛后复盘</h3><p class="note">复盘已生成，正在渲染…</p>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">刷新复盘</button></div>`;
  } else {
    h += `<div class="dsec"><h3>赛后复盘</h3><p class="note">${esc(rep.error || rep.noteZh || rep.reason || '复盘暂不可用（生成中或数据暂缺）')}</p>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">重试</button></div>`;
  }
  // Recent reviews list
  h += `<div class="ana-card pmr-recent"><div class="ana-hd"><h3>近期复盘</h3><small>知识库</small></div>`;
  if (!list) {
    h += `<p class="note">加载近期复盘列表…</p>`;
  } else if (list.items && list.items.length) {
    h += `<ul class="pmr-recent-list">${list.items.slice(0, 10).map(it => {
      const lab = `${esc(it.home || '')} ${esc(it.ft || '-')} ${esc(it.away || '')}`;
      const sn = it.snippet ? `<small>${esc(it.snippet)}</small>` : '';
      const cur = String(it.matchId) === id ? ' class="on"' : '';
      return `<li${cur}><button type="button" data-go="#/match/${encodeURIComponent(it.matchId)}"><b>${lab}</b>${it.date ? `<span>${esc(it.date)}</span>` : ''}${sn}</button></li>`;
    }).join('')}</ul>`;
  } else {
    h += `<p class="note">暂无已生成的赛后复盘。完场且有技术统计的比赛打开本页将自动写入知识库。</p>`;
  }
  h += `</div>`;
  h += `<p class="note" style="margin:10px 12px">${DISCLAIMER}</p>`;
  return h;
}
function predTabHtml(m) {
  if (!m || m.full) {
    return `<div class="dsec reason"><h3>预测分析</h3><p class="note">比赛已完场，预测分析仅适用于未开赛场次。</p></div>`;
  }
  const rep = S.predictCache && S.predictCache[String(m.id)];
  const pr = effectivePredict(m);
  let h = '';
  if (!rep) {
    h += `<div class="dsec reason"><h3>赛前情报简报</h3><div class="spinner"></div><p class="note">正在汇总战绩、过程数据、交锋、积分、伤停（若有）与赔率参考…</p></div>`;
  } else if (rep.ok && rep.html) {
    h += `<div class="dsec reason pr-report">${rep.html}</div>`;
    h += `<div class="pr-src-bar"><span>来源：${esc((rep.sources || []).join(' · '))}</span><span>${esc(rep.generatedAtLocal || '')}</span>
      <button type="button" class="btn ghost sm" data-act="refreshPredict" data-id="${esc(m.id)}">刷新报告</button></div>`;
  } else {
    h += `<div class="dsec reason"><h3>赛前情报简报</h3><p class="note">综合报告暂不可用（${esc(rep.error || rep.reason || '未知')}），先展示赔率参考层。</p>${reasoningOddsFallback(m).join('')}</div>`;
  }
  if (pr) {
    const mode = pr.speakMode || 'amplify';
    h += `<div class="dsec"><h3>表态说明</h3>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#333d4f">默认少说话：多数场次「与盘口一致 / 信息不足，不额外表态」。仅当过程、近况、伤停或赛程与盘口冲突，或出现明显冲击信号时才给出稳胆/倾向级表态。当前本场：<b>${mode === 'amplify' ? '额外表态' : mode === 'align' ? '与盘口一致' : '信息不足·观望'}</b>。</p>`;
    h += `<p class="note" style="margin:8px 0 0">${DISCLAIMER}</p></div>`;
  }
  const tf = highConfTwoFold(S.matches);
  if (tf && (tf.a.m.id === m.id || tf.b.m.id === m.id)) {
    const other = tf.a.m.id === m.id ? tf.b : tf.a;
    h += `<div class="dsec"><h3>高信心 2串1 关联</h3>
      <p style="margin:0;font-size:14px;line-height:1.7">本场与 <button data-go="#/match/${encodeURIComponent(other.m.id)}" style="color:var(--pri);background:none;border:0;padding:0;font:inherit">${esc(other.m.home)} vs ${esc(other.m.away)}</button>（${other.pr.text} ${pct(other.pr.conf)}）组成今日参考 2串1，理论参考赔约 <b>${tf.comboOdds.toFixed(2)}</b>。</p>
      <p class="note" style="margin:8px 0 0">${esc(tf.hist.note)} 约 ${tf.hist.hitRate}%（${tf.hist.days} 日）。仅供参考。</p></div>`;
  }
  return h;
}
function intelTabHtml(x, m, stats) {
  const ui = statsUiOf(x.id);
  const bullets = m ? intelBullets(m, stats) : ['完场比赛无即时赔率情报，请查看下方交锋与战绩。'];
  let h = `<div class="ana-card intel-sec"><div class="ana-hd"><h3>情报摘要</h3><small>赔率 + 历史推导</small></div><ul class="intel-list">${bullets.map(b => `<li>${b}</li>`).join('')}</ul></div>`;
  h += h2hBlock(stats && stats.h2h, x.home, x.away, { n: ui.h2hN, matchId: x.id, h2hSource: stats && stats.h2hSource });
  h += formAnalysisCard(x, stats, ui);
  h += processStatsCard(x, stats);
  h += nextFixturesCard(x);
  if (m) h += oddsCompareBlock(m);
  const qHome = encodeURIComponent(x.home || '');
  const qAway = encodeURIComponent(x.away || '');
  h += `<div class="ana-card"><div class="ana-hd"><h3>相关资讯</h3></div>
    <div class="news-match-links">
      <button type="button" class="btn ghost sm" data-go="#/news?q=${qHome}">${esc(x.home)} 资讯</button>
      <button type="button" class="btn ghost sm" data-go="#/news?q=${qAway}">${esc(x.away)} 资讯</button>
      <button type="button" class="btn ghost sm" data-go="#/news">全部资讯</button>
    </div>
    <p class="note" style="margin:8px 0 0">根据队名在公开 RSS 中筛选，英文源对中文队名会自动映射常见别名。</p>
  </div>`;
  h += votePanelHtml(x.id);
  if (m) {
    h += oddsSection('胜平负', m, 'had', implied(m.had), true);
    h += oddsSection(`让球胜平负 <small>主队 ${esc(m.hhad?.goalLine || '-')}</small>`, m, 'hhad', implied(m.hhad), true);
  }
  return h;
}

function liveStatusZh(short, elapsed) {
  const map = { NS: '未开赛', TBD: '待定', '1H': '上半场', HT: '中场', '2H': '下半场', ET: '加时', BT: '加时休息', P: '点球', LIVE: '进行中', INT: '中断', SUSP: '暂停', FT: '完场', AET: '加时完场', PEN: '点球结束', PST: '延期', CANC: '取消', ABD: '腰斩', AWD: '判负', WO: '弃权' };
  const lab = map[short] || short || '';
  if (elapsed != null && ['1H', '2H', 'ET', 'LIVE'].includes(short)) return lab + ' ' + elapsed + "'";
  return lab;
}
function donutPair(home, away, label, colorH, colorA) {
  if (home == null && away == null) return '';
  const h = Number(home) || 0, a = Number(away) || 0;
  const sum = h + a;
  const hp = sum ? h / sum : 0.5;
  const r = 34, c = 2 * Math.PI * r;
  const dashH = (c * hp).toFixed(1), dashA = (c * (1 - hp)).toFixed(1);
  return `<div class="pitch-donut"><svg viewBox="0 0 84 84" aria-hidden="true">
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="8"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${colorA}" stroke-width="8" stroke-dasharray="${dashA} ${c}" stroke-dashoffset="0" transform="rotate(-90 42 42)"/>
    <circle cx="42" cy="42" r="${r}" fill="none" stroke="${colorH}" stroke-width="8" stroke-dasharray="${dashH} ${c}" stroke-dashoffset="${(-c * (1 - hp)).toFixed(1)}" transform="rotate(-90 42 42)"/>
    <text x="42" y="40" text-anchor="middle" class="donut-val">${sum ? Math.round(hp * 100) : '-'}%</text>
    <text x="42" y="54" text-anchor="middle" class="donut-lab">${esc(label)}</text>
  </svg>
  <div class="donut-sides"><span>${h}</span><span>${a}</span></div></div>`;
}
function shotBar(shots, onTarget) {
  const sh = shots ? shots.home : null, sa = shots ? shots.away : null;
  const oh = onTarget ? onTarget.home : null, oa = onTarget ? onTarget.away : null;
  if (sh == null && sa == null && oh == null && oa == null) return '';
  const max = Math.max(sh || 0, sa || 0, 1);
  return `<div class="pitch-shots"><div class="shot-row"><span class="num">${sh ?? '-'}</span><div class="shot-track"><i class="h" style="width:${((sh || 0) / max) * 100}%"></i></div><b>射门</b><div class="shot-track"><i class="a" style="width:${((sa || 0) / max) * 100}%"></i></div><span class="num">${sa ?? '-'}</span></div>
    <div class="shot-row"><span class="num">${oh ?? '-'}</span><div class="shot-track on"><i class="h" style="width:${((oh || 0) / Math.max(oh || 0, oa || 0, 1)) * 100}%"></i></div><b>射正</b><div class="shot-track on"><i class="a" style="width:${((oa || 0) / Math.max(oh || 0, oa || 0, 1)) * 100}%"></i></div><span class="num">${oa ?? '-'}</span></div></div>`;
}
function pitchIcons(corners, yellow, red) {
  const cell = (icon, h, a, tip) => `<div class="pitch-ico" title="${esc(tip)}"><span>${icon}</span><b class="num">${h ?? '-'}</b><i></i><b class="num">${a ?? '-'}</b></div>`;
  return `<div class="pitch-icos">${cell('角', corners && corners.home, corners && corners.away, '角球')}${cell('黄', yellow && yellow.home, yellow && yellow.away, '黄牌')}${cell('红', red && red.home, red && red.away, '红牌')}</div>`;
}
function pitchAnimLayer(x, live, compact) {
  const events = (live && live.events) || [];
  const key = String(x.id || '');
  S.pitchAnimSeen = S.pitchAnimSeen || {};
  const seen = S.pitchAnimSeen[key] || new Set();
  // first paint: mark all existing as seen (no replay storm); only animate newly arrived
  const isInit = !S.pitchAnimSeen[key];
  if (isInit) {
    S.pitchAnimSeen[key] = new Set(events.map(e => e.id));
    return '<div class="pitch-fx" aria-hidden="true"></div>';
  }
  const fresh = events.filter(e => e.id && !seen.has(e.id));
  for (const e of events) if (e.id) seen.add(e.id);
  S.pitchAnimSeen[key] = seen;
  let fx = '';
  for (const e of fresh.slice(-4)) {
    if (e.kind === 'goal') {
      const side = e.side === 'away' ? 'away' : 'home';
      fx += `<div class="fx-goal ${side}"><i class="fx-ball"></i><span>GOAL!</span></div>`;
    } else if (e.kind === 'yellow' || e.kind === 'red') {
      const side = e.side === 'away' ? 'away' : 'home';
      fx += `<div class="fx-card ${e.kind} ${side}"><b></b></div>`;
    }
  }
  return `<div class="pitch-fx${compact ? ' compact' : ''}" aria-hidden="true">${fx}</div>`;
}
function livePitchHtml(x, live, opts) {
  const compact = !!(opts && opts.compact);
  const wrapId = compact ? 'live-pitch-chat-' + esc(x.id) : 'live-pitch-' + esc(x.id);
  if (!live) {
    return `<div class="dsec pitch-wrap${compact ? ' compact' : ''}" id="${wrapId}"><div class="spinner"></div><p class="note" style="text-align:center">加载绿茵屏…</p></div>`;
  }
  if (!live.ok) {
    const why = live.reason === 'no_fixture' ? '暂未匹配到该场的实时数据源（可能尚未收录或队名映射失败）'
      : live.reason === 'no_key' ? '服务端未配置实时数据密钥'
      : (live.error || live.detail || '暂时不可用');
    return `<div class="dsec pitch-wrap${compact ? ' compact' : ''}" id="${wrapId}"><h3>绿茵屏</h3><p class="note">${esc(why)}</p></div>`;
  }
  const st = live.stats || {};
  const statusLab = liveStatusZh(live.status && live.status.short, live.status && live.status.elapsed);
  const scoreH = live.score && live.score.home != null ? live.score.home : '-';
  const scoreA = live.score && live.score.away != null ? live.score.away : '-';
  const venue = live.venue && (live.venue.name || live.venue.city)
    ? esc([live.venue.name, live.venue.city].filter(Boolean).join(' · '))
    : '';
  const liveTag = live.live ? '<span class="live-dot">直播</span>' : '';
  const fx = pitchAnimLayer(x, live, compact);
  let rings = '';
  if (!compact) {
    if (st.attacks) rings += donutPair(st.attacks.home, st.attacks.away, '进攻', '#7CFC00', '#FFD54F');
    if (st.dangerousAttacks) rings += donutPair(st.dangerousAttacks.home, st.dangerousAttacks.away, '危险进攻', '#69F0AE', '#FFAB40');
    if (st.possession) rings += donutPair(st.possession.home, st.possession.away, '控球', '#B2FF59', '#40C4FF');
    if (!rings) rings = '<p class="pitch-na">进攻/控球数据暂无</p>';
  }
  const recentEv = ((live.events || []).slice(-6)).reverse();
  const evLine = recentEv.length
    ? `<div class="pitch-evs">${recentEv.map(e => {
        const min = e.elapsed != null ? (e.elapsed + (e.extra ? '+' + e.extra : '') + "'") : '';
        const lab = e.kind === 'goal' ? '⚽' : e.kind === 'yellow' ? '🟨' : e.kind === 'red' ? '🟥' : e.kind === 'subst' ? '🔄' : '•';
        // 1.9.20: Chinese names on live event chips (namezh / auto「译」), same pipeline as lineups
        const nm = e.playerZh || e.player || e.detail || e.type || '';
        return `<span class="pev ${esc(e.kind || '')} ${esc(e.side || '')}">${lab} ${esc(min)} ${esc(nm)}${yiMark(!!e.playerZhAuto)}</span>`;
      }).join('')}</div>`
    : '';

  return `<div class="dsec pitch-wrap${compact ? ' compact' : ''}" id="${wrapId}">
    <div class="pitch${compact ? ' pitch-sm' : ''}">
      ${fx}
      <div class="pitch-top"><span class="tm">${esc(x.home)}</span><div class="pitch-score"><b class="num">${scoreH}</b><span>:</span><b class="num">${scoreA}</b></div><span class="tm">${esc(x.away)}</span></div>
      <div class="pitch-status">${liveTag}<span>${esc(statusLab)}</span>${venue && !compact ? '<span class="venue">' + venue + '</span>' : ''}</div>
      ${compact ? '' : `<div class="pitch-rings">${rings}</div>`}
      ${compact ? '' : shotBar(st.shots, st.shotsOnTarget)}
      ${compact ? '' : pitchIcons(st.corners, st.yellowCards, st.redCards)}
      ${evLine}
    </div>
    <p class="note" style="margin:8px 0 0">${esc(live.noteZh || '绿茵屏数据来自第三方，可能有延迟；事件动画为示意，非真实球轨迹。仅供参考。')}${live.live ? ' · 比赛进行中将自动刷新' : ''}</p>
  </div>`;
}
function stopLivePoll() {
  if (S.livePoll) { clearInterval(S.livePoll); S.livePoll = null; }
}
async function loadLiveStats(x, { force } = {}) {
  if (!x) return null;
  const key = String(x.id || '') || (String(x.homeTeamId || '') + '|' + String(x.awayTeamId || ''));
  S.liveStatsCache = S.liveStatsCache || {};
  const prev = S.liveStatsCache[key];
  if (!force && prev && prev._at && Date.now() - prev._at < 20000) return prev;
  try {
    const q = [];
    if (x.id) q.push('matchId=' + encodeURIComponent(x.id));
    if (x.homeTeamId) q.push('homeTeamId=' + encodeURIComponent(x.homeTeamId));
    if (x.awayTeamId) q.push('awayTeamId=' + encodeURIComponent(x.awayTeamId));
    if (x.home) q.push('home=' + encodeURIComponent(x.home));
    if (x.away) q.push('away=' + encodeURIComponent(x.away));
    if (x.date) q.push('date=' + encodeURIComponent(x.date));
    if (x.time) q.push('time=' + encodeURIComponent(x.time));
    const j = await api('/live-stats?' + q.join('&'), { timeout: 20000 });
    j._at = Date.now();
    S.liveStatsCache[key] = j;
    return j;
  } catch (e) {
    const fail = { ok: false, reason: 'error', error: e.message || '加载失败', _at: Date.now() };
    S.liveStatsCache[key] = fail;
    return fail;
  }
}
function renderLivePitch(x) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  const tab = detailTabOf(x.id);
  const compact = tab === 'chat';
  const box = document.getElementById((compact ? 'live-pitch-chat-' : 'live-pitch-') + x.id);
  if (!box) return;
  box.outerHTML = livePitchHtml(x, live || { ok: false, reason: 'error', error: '暂无数据' }, { compact });
}
function ensureLivePoll(x) {
  stopLivePoll();
  const key = String(x.id || '');
  const live = S.liveStatsCache && S.liveStatsCache[key];
  if (!live || !live.ok || !live.live) return;
  S.livePoll = setInterval(async () => {
    if (document.hidden) return;
    if (route().name !== 'match' || String(route().arg) !== String(x.id)) return stopLivePoll();
    const tabNow = detailTabOf(x.id);
    if (tabNow !== 'data' && tabNow !== 'chat') return stopLivePoll();
    const hadReview = detailTabsFor(x).some(t => t[0] === 'review');
    await loadLiveStats(x, { force: true });
    if (route().name === 'match' && String(route().arg) === String(x.id) && (detailTabOf(x.id) === 'data' || detailTabOf(x.id) === 'chat')) {
      renderLivePitch(x);
      if (!hadReview && detailTabsFor(x).some(t => t[0] === 'review')) refreshDetailTabs(x);
      const again = S.liveStatsCache[key];
      if (!again || !again.ok || !again.live) stopLivePoll();
    }
  }, 45000);
}


function stopChatPoll() {
  if (S.chatPoll) { clearInterval(S.chatPoll); S.chatPoll = null; }
  if (S.chatEs) { try { S.chatEs.close(); } catch {} S.chatEs = null; }
}
function chatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}
function chatMsgHtml(m, mine) {
  return `<div class="chat-msg ${mine ? 'mine' : ''}" data-mid="${m.id}">
    <div class="chat-av">${avatarSvg(m.avatar || 'a1')}</div>
    <div class="chat-bubble"><div class="chat-meta"><b>${esc(m.nickname || '球迷')}</b><span>${esc(chatTime(m.createdAt))}</span></div><div class="chat-body">${esc(m.body)}</div></div>
  </div>`;
}
function chatPanelHtml(x) {
  const id = String(x.id);
  const pack = (S.chatCache && S.chatCache[id]) || null;
  const msgs = (pack && pack.messages) || [];
  const list = msgs.length
    ? msgs.map(m => chatMsgHtml(m, loggedIn() && S.user && Number(m.userId) === Number(S.user.id))).join('')
    : '<div class="chat-empty">还没有人说话，来句「加油」破冰吧</div>';
  const input = loggedIn()
    ? `<form class="chat-compose" id="chat-form-${esc(id)}" data-match="${esc(id)}">
        <input name="body" maxlength="120" autocomplete="off" placeholder="说点什么（最多120字）" />
        <button type="submit" class="btn pri sm">发送</button>
      </form>`
    : `<div class="chat-login"><a href="#/login">登录</a> 后可发言 · 游客可围观</div>`;
  return `<div class="chat-room" id="chat-room-${esc(id)}">
    <div class="chat-hd"><h3>聊球房</h3><small>文字交流 · 无语音</small></div>
    <div class="chat-list" id="chat-list-${esc(id)}">${list}</div>
    ${input}
    <p class="note chat-note">仅供球迷交流参考，不构成投注建议 · 本站不提供投注服务</p>
  </div>`;
}
function renderChatList(matchId) {
  const box = document.getElementById('chat-list-' + matchId);
  if (!box) return;
  const pack = (S.chatCache && S.chatCache[matchId]) || { messages: [] };
  const msgs = pack.messages || [];
  box.innerHTML = msgs.length
    ? msgs.map(m => chatMsgHtml(m, loggedIn() && S.user && Number(m.userId) === Number(S.user.id))).join('')
    : '<div class="chat-empty">还没有人说话，来句「加油」破冰吧</div>';
  box.scrollTop = box.scrollHeight;
}
async function loadChat(matchId, { afterId } = {}) {
  S.chatCache = S.chatCache || {};
  const prev = S.chatCache[matchId];
  const q = ['matchId=' + encodeURIComponent(matchId)];
  if (afterId) q.push('afterId=' + encodeURIComponent(afterId));
  try {
    const j = await api('/match-chat?' + q.join('&'), { timeout: 10000 });
    const incoming = j.messages || [];
    if (afterId && prev && Array.isArray(prev.messages)) {
      const have = new Set(prev.messages.map(m => m.id));
      const merged = prev.messages.slice();
      for (const m of incoming) if (!have.has(m.id)) merged.push(m);
      while (merged.length > 120) merged.shift();
      S.chatCache[matchId] = { ...j, messages: merged, _at: Date.now() };
    } else {
      S.chatCache[matchId] = { ...j, messages: incoming, _at: Date.now() };
    }
    return S.chatCache[matchId];
  } catch (e) {
    if (!prev) S.chatCache[matchId] = { messages: [], error: e.message, _at: Date.now() };
    return S.chatCache[matchId];
  }
}
function ensureChatPoll(x) {
  stopChatPoll();
  const id = String(x.id);
  const tick = async () => {
    if (document.hidden) return;
    if (route().name !== 'match' || String(route().arg) !== id || detailTabOf(id) !== 'chat') return stopChatPoll();
    const prev = S.chatCache && S.chatCache[id];
    const last = prev && prev.messages && prev.messages.length ? prev.messages[prev.messages.length - 1].id : 0;
    await loadChat(id, { afterId: last || undefined });
    if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'chat') renderChatList(id);
  };
  // Prefer SSE when same-origin or API supports it; always keep short-poll as backbone
  try {
    const esUrl = API + '/api/match-chat/stream?matchId=' + encodeURIComponent(id)
      + ((S.chatCache[id] && S.chatCache[id].messages && S.chatCache[id].messages.length)
        ? '&afterId=' + S.chatCache[id].messages[S.chatCache[id].messages.length - 1].id : '');
    if (typeof EventSource !== 'undefined') {
      const es = new EventSource(esUrl);
      S.chatEs = es;
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data && data.type === 'message' && data.message) {
            S.chatCache = S.chatCache || {};
            const pack = S.chatCache[id] || { messages: [] };
            if (!pack.messages.some(m => m.id === data.message.id)) {
              pack.messages.push(data.message);
              while (pack.messages.length > 120) pack.messages.shift();
              S.chatCache[id] = pack;
              if (detailTabOf(id) === 'chat') renderChatList(id);
            }
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { /* fall back to poll */ };
    }
  } catch { /* ignore */ }
  S.chatPoll = setInterval(tick, 4000);
}
async function sendChat(matchId, body) {
  const j = await api('/match-chat', { method: 'POST', body: { matchId, body } });
  S.chatCache = S.chatCache || {};
  const pack = S.chatCache[matchId] || { messages: [] };
  if (j.message && !pack.messages.some(m => m.id === j.message.id)) pack.messages.push(j.message);
  S.chatCache[matchId] = pack;
  renderChatList(matchId);
  return j;
}
function chatTabHtml(x, m) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  let h = livePitchHtml(x, live, { compact: true });
  h += chatPanelHtml(x);
  return h;
}


// ----- 1.9.22 本场球员（完场 AF /fixtures/players，永久缓存） -----
async function loadFixturePlayers(x, { force } = {}) {
  const id = String(x && x.id || '');
  if (!id) return null;
  S.fixturePlayersCache = S.fixturePlayersCache || {};
  if (!force && S.fixturePlayersCache[id] && Date.now() - (S.fixturePlayersCache[id]._at || 0) < 180e3) {
    return S.fixturePlayersCache[id];
  }
  try {
    let q = '/fixture-players?matchId=' + encodeURIComponent(id);
    if (force) q += '&refresh=1';
    const j = await api(q, { timeout: 28000 });
    if (j) {
      j._at = Date.now();
      S.fixturePlayersCache[id] = j;
    }
    return j;
  } catch (e) {
    const fail = { ok: false, error: (e && e.message) || '加载失败', _at: Date.now() };
    if (!(S.fixturePlayersCache[id] && S.fixturePlayersCache[id].ok)) S.fixturePlayersCache[id] = fail;
    return S.fixturePlayersCache[id];
  }
}
function fpSideOf(matchId) {
  S.fpSide = S.fpSide || {};
  return S.fpSide[matchId] === 'away' ? 'away' : 'home';
}
function fpStatChip(lab, val, cls) {
  if (val == null || val === '' || val === 0) return '';
  return `<span class="fp-chip ${cls || ''}"><i>${esc(lab)}</i><b>${esc(String(val))}</b></span>`;
}
function fpPlayerRow(p, { motmId } = {}) {
  const disp = p.nameZh || p.name || '?';
  const initial = esc([...disp][0] || '?');
  const img = p.photo
    ? `<img class="fp-ph" src="${logoProxy(p.photo)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=fp-ph letter>${initial}</span>'"/>`
    : `<span class="fp-ph letter">${initial}</span>`;
  const rating = p.rating != null ? Number(p.rating).toFixed(1) : null;
  let rateCls = 'fp-rate';
  if (rating != null) {
    const r = Number(rating);
    if (r >= 8) rateCls += ' hot';
    else if (r >= 7) rateCls += ' good';
    else if (r < 6) rateCls += ' low';
  }
  const isMotm = motmId && String(p.id) === String(motmId);
  const chips = [
    fpStatChip('进球', p.goals || null, 'g'),
    fpStatChip('助攻', p.assists || null, 'a'),
    fpStatChip('射门', p.shots, ''),
    fpStatChip('关键传', p.keyPasses, ''),
  ].filter(Boolean).join('');
  return `<div class="fp-row${isMotm ? ' motm' : ''}">
    ${img}
    <div class="fp-main">
      <div class="fp-name">${p.number != null ? `<span class="fp-no">${esc(p.number)}</span>` : ''}${esc(disp)}${yiMark(!!p.nameZhAuto || p.nameZhSrc === 'auto')}${isMotm ? '<em class="fp-motm-tag">本场最佳</em>' : ''}${p.captain ? '<em class="fp-cap">C</em>' : ''}${p.substitute ? '<em class="fp-sub">替</em>' : ''}</div>
      <div class="fp-subline">${esc(p.positionZh || p.position || '')}${p.minutes != null ? ` · ${esc(p.minutes)}′` : ''}</div>
      ${chips ? `<div class="fp-chips">${chips}</div>` : ''}
    </div>
    <div class="${rateCls}">${rating != null ? esc(rating) : '—'}</div>
  </div>`;
}
function fixturePlayersHtml(x) {
  const id = String(x && x.id || '');
  const pack = S.fixturePlayersCache && S.fixturePlayersCache[id];
  const finished = isMatchFinished(x);
  let h = `<div class="dsec fp-sec" id="fp-box-${esc(id)}">`;
  h += `<div class="fp-hd"><div><h3>本场球员</h3><small>评分 · 出场 · 攻防贡献</small></div>`;
  if (pack && pack.ok) {
    h += `<button type="button" class="btn ghost sm" data-act="refreshPlayers" data-id="${esc(id)}">刷新</button>`;
  }
  h += `</div>`;

  if (!finished && !(pack && pack.ok)) {
    h += `<div class="fp-empty">
      <div class="fp-empty-ico" aria-hidden="true">⚽</div>
      <p><b>完场后展示本场球员数据</b></p>
      <p class="note">比赛结束后将拉取双方出场球员的评分、出场时间、进球/助攻等，并永久缓存（每场约 1–2 次请求）。</p>
    </div></div>`;
    return h;
  }
  if (!pack) {
    h += `<div class="fp-loading"><div class="spinner"></div><p class="note">正在加载本场球员…</p></div></div>`;
    return h;
  }
  if (!pack.ok) {
    h += `<div class="fp-empty">
      <div class="fp-empty-ico" aria-hidden="true">📋</div>
      <p><b>${esc(pack.error || '本场球员暂不可用')}</b></p>
      <p class="note">${esc(pack.noteZh || pack.detail || (pack.reason === 'quota' ? '数据源配额紧张，稍后再试。' : '可稍后重试；已有缓存会直接展示。'))}</p>
      <button type="button" class="btn ghost sm" data-act="refreshPlayers" data-id="${esc(id)}">重试</button>
    </div></div>`;
    return h;
  }

  const side = fpSideOf(id);
  const home = pack.home || { players: [], nameZh: x.home };
  const away = pack.away || { players: [], nameZh: x.away };
  const cur = side === 'away' ? away : home;
  const players = (cur.players || []).filter(p => p.minutes != null && p.minutes > 0);
  const bench = (cur.players || []).filter(p => !(p.minutes != null && p.minutes > 0));
  const motm = pack.motm;

  if (motm) {
    const lab = motm.nameZh || motm.name || '?';
    const initial = esc([...lab][0] || '?');
    const img = motm.photo
      ? `<img class="fp-motm-ph" src="${logoProxy(motm.photo)}" alt="" onerror="this.outerHTML='<span class=fp-motm-ph letter>${initial}</span>'"/>`
      : `<span class="fp-motm-ph letter">${initial}</span>`;
    const teamLab = motm.side === 'away' ? (away.nameZh || x.away) : (home.nameZh || x.home);
    h += `<div class="fp-motm">
      ${img}
      <div class="fp-motm-body">
        <div class="fp-motm-kicker">本场最佳球员</div>
        <div class="fp-motm-name">${esc(lab)}${yiMark(!!motm.nameZhAuto)}</div>
        <div class="fp-motm-meta">${esc(teamLab)}${motm.positionZh ? ' · ' + esc(motm.positionZh) : ''}${motm.minutes != null ? ' · ' + esc(motm.minutes) + '′' : ''}${(motm.goals || motm.assists) ? ` · ${motm.goals || 0}球${motm.assists ? motm.assists + '助' : ''}` : ''}</div>
      </div>
      <div class="fp-motm-rate">${motm.rating != null ? esc(Number(motm.rating).toFixed(1)) : '—'}</div>
    </div>`;
  }

  h += `<div class="fp-tabs" data-mid="${esc(id)}">
    <button type="button" class="${side === 'home' ? 'on' : ''}" data-act="fpSide" data-id="${esc(id)}" data-side="home">${esc(home.nameZh || x.home)} <small>${(home.players || []).filter(p => p.minutes > 0).length || ''}</small></button>
    <button type="button" class="${side === 'away' ? 'on' : ''}" data-act="fpSide" data-id="${esc(id)}" data-side="away">${esc(away.nameZh || x.away)} <small>${(away.players || []).filter(p => p.minutes > 0).length || ''}</small></button>
  </div>`;

  if (!players.length && !bench.length) {
    h += `<p class="note" style="margin:10px 12px">该队暂无出场球员数据。</p>`;
  } else {
    h += `<div class="fp-list">${players.map(p => fpPlayerRow(p, { motmId: motm && motm.id })).join('')}</div>`;
    if (bench.length) {
      h += `<details class="fp-bench"><summary>未计出场 / 未上场（${bench.length}）</summary>
        <div class="fp-list dim">${bench.map(p => fpPlayerRow(p, {})).join('')}</div></details>`;
    }
  }
  h += `<p class="note" style="margin:10px 12px 0">${esc(pack.noteZh || '评分来自第三方，仅供参考。')}${pack.cached ? ' · 已缓存' : ''}${pack.playerCount ? ' · 共 ' + pack.playerCount + ' 人' : ''}</p>`;
  h += `</div>`;
  return h;
}

function dataTabHtml(x, m, stats) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  const ui = statsUiOf(x.id);
  let h = livePitchHtml(x, live);
  h += fixturePlayersHtml(x);
  if (m) h += oddsCompareBlock(m);
  h += `<div class="ana-card"><div class="ana-hd"><h3>近期战绩</h3><small>摘要 · 完整筛选见「情报」</small></div>
    ${formStrip(stats && stats.homeForm, x.home, { teamId: x.homeTeamId, venue: 'all', n: 5, compact: true })}
    ${formStrip(stats && stats.awayForm, x.away, { teamId: x.awayTeamId, venue: 'all', n: 5, compact: true })}
    <p class="note" style="margin:8px 0 0">${esc((stats && stats.noteZh) || '以上为历史赛果推导。')} 可到「情报」切换近10场或主/客场。</p></div>`;
  h += processStatsCard(x, stats);
  h += h2hBlock(stats && stats.h2h, x.home, x.away, { n: ui.h2hN, matchId: x.id, h2hSource: stats && stats.h2hSource });
  h += nextFixturesCard(x);
  return h;
}
function matchHero(x, m, r) {
  const started = !!(m && Date.now() > kickoff(m)) || !!(x && Date.now() > kickoff(x));
  const id = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[id]) || null;
  const ls = (S.liveScores && S.liveScores[id]) || null;
  const finished = isMatchFinished(x);
  let hg = null, ag = null, half = '', statusLab = '';
  if (r && r.full) {
    const parts = String(r.full).split(/[:：]/);
    hg = parts[0]; ag = parts[1];
    half = r.half || '';
    statusLab = r.status || '完场';
  } else if (finished || (live && live.ok && live.score && live.score.home != null)
    || (ls && ls.homeScore != null)) {
    if (live && live.ok && live.score && live.score.home != null) {
      hg = live.score.home; ag = live.score.away;
      statusLab = finished
        ? (liveStatusZh((live.status && live.status.short) || 'FT') || '完场')
        : liveStatusZh(live.status && live.status.short, live.status && live.status.elapsed);
    } else if (ls && ls.homeScore != null) {
      hg = ls.homeScore; ag = ls.awayScore;
      half = ls.half || '';
      statusLab = finished ? (ls.phaseZh || '完场') : (ls.phaseZh || (started ? '进行中' : '未开赛'));
    }
    if (finished && !statusLab) statusLab = '完场';
  }
  const mid = (hg != null && ag != null)
    ? `<div class="score num">${esc(hg)} : ${esc(ag)}</div><small>${half ? '半场 ' + esc(half) + ' · ' : ''}${esc(statusLab || (finished ? '完场' : '进行中'))}</small>`
    : `<div class="vs">VS</div><small>${started ? (finished ? '完场' : '已开赛 · 待开奖') : esc(x.time) + ' 开赛'}</small>`;
  let h = `<div class="hero" id="match-hero-${esc(id)}"><div class="meta">${lgTag(x)}<span>${esc(x.num)}</span><span>${esc(issueDate(x))} ${issueWeek(x)}${x.time ? ' · 开赛 ' + esc(x.date) + ' ' + esc(x.time) : ''}</span>${x.sample ? '<span class="sample-tag">示例数据</span>' : ''}</div>
    <div class="teams"><div class="tm">${badge(x.home, 'lg', x.homeLogo)}<span>${esc(x.home)}</span><small>主队 ${esc(x.homeRank || '')}</small></div>
    <div class="mid">${mid}</div>
    <div class="tm">${badge(x.away, 'lg', x.awayLogo)}<span>${esc(x.away)}</span><small>客队 ${esc(x.awayRank || '')}</small></div></div></div>`;
  if (r) {
    h += `<div class="dsec"><h3>赛果</h3><dl class="kv"><dt>全场</dt><dd>${esc(r.full || '-')}</dd><dt>半场</dt><dd>${esc(r.half || '-')}</dd><dt>让球</dt><dd>${esc(r.goalLine || '-')}</dd></dl>${resultTags(r)}</div>`;
  }
  return h;
}

// ----- 1.9.12 开赛赔率快照（只读展示，无投注） -----
function oddsSnapCache() { return (S.oddsSnap = S.oddsSnap || {}); }
function matchKickoffMs(x) {
  try { return Date.parse(`${x.date}T${String(x.time || '00:00').slice(0, 5)}:00+08:00`); } catch { return NaN; }
}
function formatOddsAge(iso) {
  if (!iso) return '';
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(sec)) return '';
  if (sec < 60) return '刚刚更新';
  if (sec < 3600) return Math.round(sec / 60) + '分钟前更新';
  if (sec < 86400) return Math.round(sec / 3600) + '小时前更新';
  return (iso.replace('T', ' ').slice(0, 16));
}
/** Prefer live full sheet before kickoff; after KO use frozen snapshot. */
async function loadOddsSnapshot(matchId, date, x) {
  const id = String(matchId || '');
  if (!id) return null;
  const key = id + '|' + (date || '');
  const cache = oddsSnapCache();
  const ko = x ? matchKickoffMs(x) : NaN;
  const started = Number.isFinite(ko) && Date.now() >= ko;
  if (cache[key] && Date.now() - (cache[key]._at || 0) < (started ? 120e3 : 45e3)) return cache[key];
  try {
    if (!started) {
      const live = await api('/odds-live?matchId=' + encodeURIComponent(id), { timeout: 12000 });
      if (live && live.ok && live.pools) {
        cache[key] = Object.assign({ _at: Date.now(), _mode: 'live' }, live);
        return cache[key];
      }
    }
    let q = '/odds-snapshot?matchId=' + encodeURIComponent(id);
    if (date) q += '&date=' + encodeURIComponent(date);
    const j = await api(q, { timeout: 12000 });
    cache[key] = Object.assign({ _at: Date.now(), _mode: 'snap' }, j || {});
    return cache[key];
  } catch (e) {
    return { ok: false, reason: 'error', error: e.message || '加载失败', _at: Date.now() };
  }
}
function fmtOdd(v) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return '-';
  const n = Number(v);
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, (m) => m.startsWith('.') ? m : '');
}
function oddsCell(lab, val) {
  return `<div class="os-cell"><span class="os-lab">${esc(lab)}</span><b class="num">${esc(fmtOdd(val))}</b></div>`;
}
function renderOddsSnapshot(snap, x) {
  const started = Number.isFinite(matchKickoffMs(x)) && Date.now() >= matchKickoffMs(x);
  if (!snap || snap.ok === false || !snap.pools) {
    const msg = started
      ? (snap && snap.error) || '本场暂无开赛赔率快照（可能未及时抓取，历史场次无法补造）'
      : (snap && snap.error) || '赛前全玩法赔率加载中或暂未开售，请稍后下拉刷新';
    return `<div class="dsec os-wrap"><h3>赔率</h3><p class="note">${esc(msg)}</p>
      <p class="note">数据来源中国体育彩票公开接口 · 仅供查阅 · 不提供投注/出票服务</p></div>`;
  }
  const p = snap.pools;
  const isLive = snap.live === true || snap._mode === 'live' || snap.kind === 'live';
  const kindLab = isLive ? '赛前实时（服务器分层刷新）'
    : snap.kind === 'pre-kick' ? '临近开赛快照'
    : snap.kind === 'backfill' ? '赛后补存'
    : '开赛快照';
  let h = `<div class="dsec os-wrap"><h3>${isLive ? '赛前赔率' : '开赛赔率'} <small class="note">${esc(kindLab)}</small></h3>`;
  const ageIso = snap.updatedAt || snap.fetchedAt || snap.snappedAt || '';
  const ageLab = formatOddsAge(ageIso);
  const tierLab = snap.tier ? ` · ${snap.tier}` : '';
  h += `<p class="note">${esc(ageLab || ((ageIso || '').replace('T', ' ').slice(0, 19)))}${esc(tierLab)} · 只读展示</p>`;

  // HAD + HHAD
  h += `<div class="os-sec"><div class="os-hd">胜平负 / 让球</div><div class="os-grid os-3">`;
  if (p.had) {
    h += oddsCell('胜', p.had.h) + oddsCell('平', p.had.d) + oddsCell('负', p.had.a);
  } else h += `<p class="note" style="grid-column:1/-1">胜平负暂无</p>`;
  h += `</div>`;
  if (p.hhad) {
    h += `<div class="os-sub">让球 ${esc(p.hhad.goalLine || '-')}</div><div class="os-grid os-3">`;
    h += oddsCell('让胜', p.hhad.h) + oddsCell('让平', p.hhad.d) + oddsCell('让负', p.hhad.a);
    h += `</div>`;
  }
  h += `</div>`;

  // CRS score grid
  if (p.crs) {
    const homeScores = [0, 1, 2, 3, 4, 5];
    const awayScores = [0, 1, 2, 3, 4, 5];
    h += `<div class="os-sec"><div class="os-hd">比分</div>`;
    h += `<div class="os-crs-wrap"><table class="os-crs"><thead><tr><th></th>${awayScores.map(a => `<th>${a}</th>`).join('')}</tr></thead><tbody>`;
    for (const hg of homeScores) {
      h += `<tr><th>${hg}</th>`;
      for (const ag of awayScores) {
        // sporttery keys: s0Hs0A e.g. s01s02 — but only certain cells exist (home win / draw / away patterns)
        const key = 's' + String(hg).padStart(2, '0') + 's' + String(ag).padStart(2, '0');
        const v = p.crs[key];
        h += `<td class="num">${v != null ? esc(fmtOdd(v)) : '<span class="os-na">·</span>'}</td>`;
      }
      h += `</tr>`;
    }
    h += `</tbody></table></div>`;
    h += `<div class="os-grid os-3" style="margin-top:8px">${oddsCell('胜其它', p.crs.s1sh)}${oddsCell('平其它', p.crs.s1sd)}${oddsCell('负其它', p.crs.s1sa)}</div>`;
    h += `</div>`;
  }

  // TTG
  if (p.ttg) {
    h += `<div class="os-sec"><div class="os-hd">总进球</div><div class="os-grid os-4">`;
    for (let i = 0; i <= 7; i++) h += oddsCell(i === 7 ? '7+' : String(i), p.ttg['s' + i]);
    h += `</div></div>`;
  }

  // HAFU
  if (p.hafu) {
    const labs = [['hh', '胜胜'], ['hd', '胜平'], ['ha', '胜负'], ['dh', '平胜'], ['dd', '平平'], ['da', '平负'], ['ah', '负胜'], ['ad', '负平'], ['aa', '负负']];
    h += `<div class="os-sec"><div class="os-hd">半全场</div><div class="os-grid os-3">`;
    for (const [k, lab] of labs) h += oddsCell(lab, p.hafu[k]);
    h += `</div></div>`;
  }

  h += `<p class="note">${esc(snap.noteZh || '仅供参考，无投注服务。')}</p></div>`;
  return h;
}
function oddsTabHtml(x, snap) {
  let h = `<div id="odds-snap-box">${skeleton(2)}</div>`;
  if (snap) h = renderOddsSnapshot(snap, x);
  return h;
}
function stopOddsLivePoll() {
  if (S.oddsLivePoll) { clearInterval(S.oddsLivePoll); S.oddsLivePoll = null; }
}
/** Stale-while-revalidate while 赔率 tab open and match still pre-kickoff (~60s). */
function ensureOddsLivePoll(x) {
  stopOddsLivePoll();
  if (!x) return;
  const ko = matchKickoffMs(x);
  if (!Number.isFinite(ko) || Date.now() >= ko) return;
  S.oddsLivePoll = setInterval(async () => {
    if (document.hidden) return;
    if (route().name !== 'match' || String(route().arg) !== String(x.id) || detailTabOf(x.id) !== 'odds') {
      return stopOddsLivePoll();
    }
    if (Date.now() >= matchKickoffMs(x)) return stopOddsLivePoll();
    const cache = oddsSnapCache();
    const key = String(x.id) + '|' + (x.date || '');
    if (cache[key]) cache[key]._at = 0;
    const snap = await loadOddsSnapshot(x.id, x.date, x);
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === 'odds') {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) pane.innerHTML = oddsTabHtml(x, snap);
    }
  }, 60e3);
}

function pageMatch(id) {
  const m = findMatch(id); const r = !m && (S.results || []).find(x => x.id === String(id));
  const x = m || r;
  const favBtn = x ? `<button class="fav-btn ${isFav(x.id) ? 'on' : ''}" data-act="fav" data-id="${esc(x.id)}">${isFav(x.id) ? I.star + '已关注' : I.starO + '关注'}</button>` : '<span class="ph"></span>';
  let h = hdr('赛事详情', { right: favBtn });
  if (!S.matches) return h + '<div class="spinner"></div>';
  if (!x) return h + empty('该场比赛已结束或已下架', '<button class="btn ghost sm" data-go="#/results">查看开奖</button>') + foot();
  let tab = detailTabOf(x.id);
  const tabs = detailTabsFor(x);
  if (!tabs.some(tt => tt[0] === tab)) {
    tab = 'intel';
    S.detailTab = S.detailTab || {};
    S.detailTab[x.id] = tab;
  }
  h += matchHero(x, m, r);
  h += `<div class="dtabs" data-mid="${esc(x.id)}">${tabs.map(([k, lab]) =>
    `<button type="button" class="${tab === k ? 'on' : ''}" data-act="detailTab" data-id="${esc(x.id)}" data-tab="${k}">${lab}</button>`
  ).join('')}</div>`;
  h += `<div id="detail-pane-${esc(x.id)}" class="detail-pane">`;
  const stats = (S.statsCache && S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')]) || null;
  if (tab === 'intel') h += intelTabHtml(x, m, stats);
  else if (tab === 'odds') h += oddsTabHtml(x, oddsSnapCache()[String(x.id) + '|' + (x.date || '')]);
  else if (tab === 'data') h += dataTabHtml(x, m, stats);
  else if (tab === 'chat') h += chatTabHtml(x, m);
  else if (tab === 'squad') h += squadSectionHtml(x);
  else if (tab === 'review') h += reviewTabHtml(x);
  else h += predTabHtml(m || null);
  h += `</div>`;
  if (m && tab === 'intel') {
    h += `<div class="dsec"><h3>比赛信息</h3><dl class="kv"><dt>赛事编号</dt><dd>${esc(m.num)}</dd><dt>联赛</dt><dd>${esc(m.league)}</dd><dt>开赛时间</dt><dd>${esc(m.date)} ${esc(m.time)}（北京时间）</dd><dt>数据状态</dt><dd>${m.sample ? '示例数据（非真实）' : '官方在售赔率 · 赛程分层缓存；全玩法见「赔率」Tab'}</dd></dl>
      <p class="note" style="margin:10px 0 0">点击赔率可选择并生成个人方案记录（不投注、不出票）。</p></div>`;
  }
  return h + foot();
}
/** Refresh only the detail tab bar when FT becomes known (avoid full-page flash when possible). */
function refreshDetailTabs(x) {
  if (!x || route().name !== 'match' || String(route().arg) !== String(x.id)) return;
  const bar = document.querySelector('.dtabs[data-mid="' + CSS.escape(String(x.id)) + '"]')
    || document.querySelector('.dtabs');
  if (!bar) { render(); return; }
  const tab = detailTabOf(x.id);
  const tabs = detailTabsFor(x);
  if (!tabs.some(tt => tt[0] === tab)) {
    S.detailTab = S.detailTab || {};
    S.detailTab[x.id] = 'intel';
  }
  const cur = detailTabOf(x.id);
  bar.innerHTML = tabs.map(([k, lab]) =>
    `<button type="button" class="${cur === k ? 'on' : ''}" data-act="detailTab" data-id="${esc(x.id)}" data-tab="${k}">${lab}</button>`
  ).join('');
  // Also refresh hero score/status
  const hero = document.getElementById('match-hero-' + x.id);
  if (hero) {
    const m = findMatch(x.id);
    const r = !m && (S.results || []).find(z => z.id === String(x.id));
    const wrap = document.createElement('div');
    wrap.innerHTML = matchHero(x, m, r);
    const next = wrap.firstElementChild;
    if (next) hero.replaceWith(next);
  }
}

function stopMatchStatusPoll() {
  if (S.matchStatusPoll) { clearInterval(S.matchStatusPoll); S.matchStatusPoll = null; }
}

/** After kickoff / until FT: poll live-stats so 赛后复盘 tab appears without tab thrashing. */
function ensureMatchStatusPoll(x) {
  stopMatchStatusPoll();
  if (!x) return;
  if (isMatchFinished(x)) return;
  const ko = matchKickoffMs(x);
  if (!Number.isFinite(ko) || Date.now() < ko - 60e3) return;
  S.matchStatusPoll = setInterval(async () => {
    if (document.hidden) return;
    if (route().name !== 'match' || String(route().arg) !== String(x.id)) return stopMatchStatusPoll();
    const wasFin = isMatchFinished(x);
    const hadReview = detailTabsFor(x).some(t => t[0] === 'review');
    try { await loadLiveStats(x, { force: true }); } catch (_) {}
    // Soft-refresh schedule live-scores map for this id when list poll is idle
    try {
      if (!S.liveScoresAt || Date.now() - S.liveScoresAt > 60e3) {
        await loadLiveScores([x.id], { force: false });
      }
    } catch (_) {}
    const nowFin = isMatchFinished(x);
    const hasReview = detailTabsFor(x).some(t => t[0] === 'review');
    if ((!wasFin && nowFin) || (!hadReview && hasReview)) {
      refreshDetailTabs(x);
      if (nowFin) stopMatchStatusPoll();
      return;
    }
    // Keep hero clock/score fresh while in-play
    refreshDetailTabs(x);
    if (nowFin) stopMatchStatusPoll();
  }, 45e3);
}

async function enrichMatchDetail(x) {
  if (!x) return;
  const tab = detailTabOf(x.id);
  if (tab !== 'data') stopLivePoll();
  if (tab !== 'chat') stopChatPoll();
  if (route().name !== 'match') stopMatchStatusPoll();

  // Bug 2: after kickoff, always warm live-stats so FT → 赛后复盘 tab without switching tabs
  const ko = matchKickoffMs(x);
  const kickedOff = Number.isFinite(ko) && Date.now() >= ko;
  const wasFin = isMatchFinished(x);
  const hadReviewTab = detailTabsFor(x).some(t => t[0] === 'review');
  if (kickedOff || wasFin) {
    try { await loadLiveStats(x); } catch (_) {}
    const nowFin = isMatchFinished(x);
    const hasReviewTab = detailTabsFor(x).some(t => t[0] === 'review');
    if ((!wasFin && nowFin) || (!hadReviewTab && hasReviewTab)) {
      refreshDetailTabs(x);
    } else if (kickedOff) {
      refreshDetailTabs(x); // hero score even if not FT yet
    }
    ensureMatchStatusPoll(x);
  } else {
    stopMatchStatusPoll();
  }

  if (tab === 'squad') await ensureSquad(x);
  if (tab === 'odds') {
    stopOddsLivePoll();
    const snap = await loadOddsSnapshot(x.id, x.date, x);
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === 'odds') {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) pane.innerHTML = oddsTabHtml(x, snap);
    }
    ensureOddsLivePoll(x);
  } else {
    stopOddsLivePoll();
  }
  if (tab === 'pred') {
    const m = findMatch(x.id) || x;
    await loadPredictReport(m);
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === 'pred') {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) pane.innerHTML = predTabHtml(m);
    }
  }
  if (tab === 'review') {
    // Paint loading shell immediately, then fill
    const pane0 = document.getElementById('detail-pane-' + x.id);
    if (pane0 && !(S.reviewCache && S.reviewCache[String(x.id)] && S.reviewCache[String(x.id)].ok)) {
      pane0.innerHTML = reviewTabHtml(x);
    }
    await Promise.all([loadPostMatchReview(x), loadRecentReviews()]);
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === 'review') {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) pane.innerHTML = reviewTabHtml(x);
    }
  }
  if (tab === 'intel' || tab === 'data' || tab === 'chat') {
    const tasks = [];
    if (tab === 'intel' || tab === 'data') tasks.push(loadMatchStats(x));
    // live-stats already warmed above when kickedOff; still refresh on data/chat
    if (tab === 'data' || tab === 'chat') tasks.push(loadLiveStats(x));
    if (tab === 'chat') tasks.push(loadChat(String(x.id)));
    if (tab === 'data' && isMatchFinished(x)) tasks.push(loadFixturePlayers(x));
    await Promise.all(tasks);
    // FT may arrive from the data-tab fetch — surface 赛后复盘 immediately
    if (!hadReviewTab && detailTabsFor(x).some(t => t[0] === 'review')) refreshDetailTabs(x);
    // re-render pane if still on same tab/match
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === tab) {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) {
        const stats = S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')];
        const m = findMatch(x.id);
        if (tab === 'intel') { pane.innerHTML = intelTabHtml(x, m, stats); loadVote(x.id); }
        else if (tab === 'data') { pane.innerHTML = dataTabHtml(x, m, stats); ensureLivePoll(x); }
        else if (tab === 'chat') { pane.innerHTML = chatTabHtml(x, m); ensureChatPoll(x); ensureLivePoll(x); }
      }
    }
  }
  if (tab === 'review' && isMatchFinished(x)) {
    // Warm player cache while on 赛后复盘 (quota-safe: disk first)
    loadFixturePlayers(x).catch(() => {});
  }
  if (tab === 'intel') loadVote(x.id);
}


// ======================= 资讯 =======================
function newsTabOf() {
  const t = LS.get('jc_news_tab', 'cn');
  return (t === 'en' || t === 'foreign' || t === '外网') ? 'en' : 'cn';
}
function setNewsTab(tab) {
  const v = (tab === 'en' || tab === 'foreign' || tab === '外网') ? 'en' : 'cn';
  LS.set('jc_news_tab', v);
  S.newsTab = v;
  return v;
}
function skeletonNews(n = 3) {
  return Array.from({ length: n }, () => '<div class="card news-card sk-news"><div class="sk sk-line" style="width:30%;height:12px"></div><div class="sk sk-line" style="width:90%;height:16px;margin-top:8px"></div><div class="sk sk-line" style="width:70%;height:12px;margin-top:8px"></div></div>').join('');
}
function newsImgSrc(url, mode) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  // Always proxy list/detail images through /api/news-image (CDN allowlist + disk cache + retries)
  let u = raw;
  // Unwrap if somehow already a proxy URL
  const m = u.match(/\/api\/news-image\?url=([^&]+)/i);
  if (m) {
    try { u = decodeURIComponent(m[1]); } catch { /* keep */ }
  }
  if (mode === 'full') {
    u = u.replace(/\/\d+x-?\d*\/(?:crop\/)?-\/(?:-\/)?/, '/');
  }
  return API + '/api/news-image?url=' + encodeURIComponent(u);
}
/** onerror: retry once via proxy (cache-bust); then placeholder / remove. */
function newsImgOnError(el, fallback) {
  if (!el || el.dataset.retried === '1') {
    if (fallback === 'remove') { el.remove(); return; }
    el.classList.add('ph');
    el.removeAttribute('src');
    return;
  }
  el.dataset.retried = '1';
  const cur = el.getAttribute('src') || '';
  const m = cur.match(/^(.*\/api\/news-image\?url=[^&]+)(.*)$/i);
  if (m) {
    el.src = m[1] + (m[2].includes('_r=') ? m[2] : (m[2] ? m[2] + '&' : '?') + '_r=1');
    return;
  }
  // Direct URL failed (should be rare) — route through proxy once
  if (/^https?:\/\//i.test(cur) || cur.startsWith('//')) {
    el.src = API + '/api/news-image?url=' + encodeURIComponent(cur.startsWith('//') ? ('https:' + cur) : cur) + '&_r=1';
    return;
  }
  if (fallback === 'remove') el.remove();
  else { el.classList.add('ph'); el.removeAttribute('src'); }
}window.newsImgOnError = newsImgOnError;

function absApiHtml(html) {
  const s = String(html || '');
  if (!API) return s;
  return s.replace(/(src|href)="(\/api\/[^"]+)"/g, (_, a, p) => a + '="' + API + p + '"');
}
function newsTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso); if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  if (diff < 3 * 86400e3) return Math.floor(diff / 86400e3) + ' 天前';
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
  } catch { return iso.slice(0, 16).replace('T', ' '); }
}
function newsCard(it) {
  const src = newsImgSrc(it.thumb || '');
  const thumb = src
    ? `<img class="news-thumb" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="newsImgOnError(this)"/>`
    : `<div class="news-thumb ph">${I.news}</div>`;
  return `<button type="button" class="card news-card" data-go="#/news/${encodeURIComponent(it.id)}">
    ${thumb}
    <div class="news-body">
      <div class="news-meta"><span class="news-src">${esc(it.sourceZh || it.source || '')}</span><span>${esc(newsTime(it.publishedAt))}</span></div>
      <div class="news-title">${esc(it.title)}</div>
      ${it.summary ? `<div class="news-sum">${esc(it.summary)}</div>` : ''}
    </div>
  </button>`;
}
async function fillHomeNews() {
  const box = document.getElementById('home-news');
  if (!box) return;
  try {
    const j = await api('/news?limit=4', { timeout: 15000 });
    const items = (j && j.items) || [];
    box.innerHTML = items.length
      ? items.map(newsCard).join('') + `<p class="note" style="margin:4px 16px 0">${esc(j.noteZh || '来自公开 RSS，注明出处。')}</p>`
      : empty('暂无资讯', '<button class="btn ghost sm" data-go="#/news">刷新看看</button>');
  } catch (e) {
    box.innerHTML = empty('资讯加载失败', '<span class="note">' + esc(e.message || '') + '</span>');
  }
}
function pageNews(arg) {
  const r = route();
  // detail when arg is an id (no query-only list)
  if (arg && !('q' in (r.query || {}))) {
    return pageNewsDetail(arg);
  }
  // URL is source of truth — do not fall back to S.newsQ (that broke「清除筛选」)
  const q = String((r.query && r.query.q) || '').trim();
  S.newsQ = q;
  const tab = newsTabOf();
  S.newsTab = tab;
  let h = hdr(q ? ('体坛资讯 · ' + q) : '体坛资讯', { right: srcPill() });
  h += `<div class="dtabs news-tabs">
    <button type="button" class="${tab === 'cn' ? 'on' : ''}" data-act="newsTab" data-tab="cn">国内</button>
    <button type="button" class="${tab === 'en' ? 'on' : ''}" data-act="newsTab" data-tab="en">外网</button>
  </div>`;
  h += `<form class="news-search" id="fNewsSearch" action="#" autocomplete="off">
    <input name="q" type="search" enterkeyhint="search" maxlength="40" placeholder="搜索球队（中文或英文）" value="${esc(q)}" aria-label="搜索球队">
    <button type="submit" class="btn pri sm">搜索</button>
  </form>`;
  if (q) h += `<div class="chips news-filter-chip"><button type="button" class="on" data-act="newsClear">清除筛选 · ${esc(q)}</button></div>`;
  if (tab === 'en') h += `<div class="warn-bar" style="background:var(--pri-l);border-color:#cfdcf7;color:var(--pri-d)">外网足球资讯 · 仅供参考，不构成购彩建议</div>`;
  h += `<div id="news-list" class="news-list">${skeletonNews(4)}</div>`;
  setTimeout(() => fillNewsList(q, tab), 0);
  return h + foot();
}
function newsLoadMoreBar(state) {
  if (!state || !state.hasMore) {
    return state && state.items && state.items.length
      ? `<p class="note news-end" style="margin:8px 16px;text-align:center">已显示全部存档</p>`
      : '';
  }
  return `<div class="news-more-wrap">
    <button type="button" class="btn ghost block news-more-btn" data-act="newsMore">加载更早</button>
  </div>`;
}

async function fillNewsList(q, tab) {
  const box = document.getElementById('news-list');
  if (!box) return;
  const lang = tab || newsTabOf();
  try {
    const path = '/news?limit=40' + (lang === 'en' ? '&lang=en' : '') + (q ? '&q=' + encodeURIComponent(q) : '');
    const j = await api(path, { timeout: 20000 });
    const items = (j && j.items) || [];
    S.newsList = {
      q: q || '',
      lang,
      items: items.slice(),
      hasMore: !!j.hasMore,
      nextBefore: j.nextBefore || (items.length ? items[items.length - 1].publishedAt || items[items.length - 1].id : ''),
      nextOffset: j.nextOffset != null ? j.nextOffset : items.length,
      total: j.total != null ? j.total : items.length,
      noteZh: j.noteZh || '',
      source: j.source,
    };
    S.newsCache = j;
    let top = '';
    if (j.source === 'cache') top += `<div class="warn-bar">显示缓存资讯（部分源暂时不可达）</div>`;
    if (q) top += `<div class="list-meta"><span>与「${esc(q)}」相关</span><span>${items.length}${j.hasMore ? '+' : ''} 条</span></div>`;
    else top += `<div class="list-meta"><span>${lang === 'en' ? '外网足球资讯' : '国内体坛资讯'}</span><span>${items.length}${j.hasMore ? '+' : ''} / ${esc(String(S.newsList.total))} 条</span></div>`;
    box.innerHTML = top + (items.length
      ? `<div id="news-cards">${items.map(newsCard).join('')}</div>` + newsLoadMoreBar(S.newsList) + `<p class="note" style="margin:8px 16px">${esc(j.noteZh || '')}</p>`
      : empty(q ? '没有找到与该球队相关的资讯' : (lang === 'en' ? '外网资讯暂时不可用（部分源在国内可能不可达）' : '暂无资讯'), q ? '<button class="btn ghost sm" data-act="newsClear">查看全部资讯</button>' : ''));
  } catch (e) {
    box.innerHTML = empty('加载失败：' + esc(e.message || ''));
  }
}

async function loadOlderNews() {
  const st = S.newsList;
  const box = document.getElementById('news-list');
  const cards = document.getElementById('news-cards');
  const btn = document.querySelector('[data-act="newsMore"]');
  if (!st || !box) return;
  if (!st.hasMore) { toast('没有更早的资讯了'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '加载中…'; }
  try {
    const lang = st.lang || newsTabOf();
    const q = st.q || '';
    let path = '/news?limit=40' + (lang === 'en' ? '&lang=en' : '') + (q ? '&q=' + encodeURIComponent(q) : '');
    if (st.nextBefore) path += '&before=' + encodeURIComponent(st.nextBefore);
    else path += '&offset=' + encodeURIComponent(String(st.nextOffset || st.items.length));
    const j = await api(path, { timeout: 20000 });
    const fresh = (j && j.items) || [];
    const seen = new Set(st.items.map((x) => x.id));
    const added = fresh.filter((x) => x && x.id && !seen.has(x.id));
    st.items = st.items.concat(added);
    st.hasMore = !!j.hasMore && added.length > 0;
    if (j.nextBefore) st.nextBefore = j.nextBefore;
    else if (added.length) {
      const last = added[added.length - 1];
      st.nextBefore = last.publishedAt || last.id;
    }
    st.nextOffset = j.nextOffset != null ? j.nextOffset : st.items.length;
    if (j.total != null) st.total = j.total;
    if (cards && added.length) {
      cards.insertAdjacentHTML('beforeend', added.map(newsCard).join(''));
    }
    // refresh meta + button
    const meta = box.querySelector('.list-meta');
    if (meta) {
      const label = q ? `与「${q}」相关` : (lang === 'en' ? '外网足球资讯' : '国内体坛资讯');
      meta.innerHTML = `<span>${esc(label)}</span><span>${st.items.length}${st.hasMore ? '+' : ''} / ${esc(String(st.total))} 条</span>`;
    }
    const wrap = box.querySelector('.news-more-wrap, .news-end');
    const bar = newsLoadMoreBar(st);
    if (wrap) wrap.outerHTML = bar;
    else if (cards) cards.insertAdjacentHTML('afterend', bar);
    if (!added.length) toast('没有更早的资讯了');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '加载更早'; }
    toast(e.message || '加载失败');
  }
}
function pageNewsDetail(id) {
  let h = hdr('资讯详情');
  h += `<div id="news-detail" class="dsec"><div class="spinner"></div></div>`;
  setTimeout(() => fillNewsDetail(id), 0);
  return h + foot();
}
async function fillNewsDetail(id) {
  const box = document.getElementById('news-detail');
  if (!box) return;
  try {
    const lang = newsTabOf();
    const j = await api('/news/' + encodeURIComponent(id) + (lang === 'en' ? '?lang=en' : ''), { timeout: 25000 });
    const item = j && j.item;
    if (!item) {
      box.innerHTML = empty('未找到该资讯', '<button class="btn ghost sm" data-go="#/news">返回资讯列表</button>');
      return;
    }
    const art = (j && j.article) || {};
    const coverUrl = newsImgSrc(art.cover || item.thumbFull || item.thumb || '', 'full');
    const cover = coverUrl
      ? `<img class="news-detail-thumb" src="${esc(coverUrl)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="newsImgOnError(this,'remove')"/>`
      : '';
    let bodyInner = '';
    let bodyIsHtml = true;
    const foreignEmbed = art.embedUrl && /(?:skysports\.com|espn\.com|bbc\.(?:co\.uk|com)|theguardian\.com|espncdn\.com)/i.test(art.embedUrl);
    if (art.mode === 'html' && art.html) {
      bodyInner = absApiHtml(art.html);
    } else if (art.mode === 'summary' && art.html) {
      bodyInner = absApiHtml(art.html);
    } else if (art.mode === 'embed' && art.embedUrl && !foreignEmbed) {
      bodyIsHtml = false;
      bodyInner = null;
    } else {
      if (art.html) bodyInner = absApiHtml(art.html);
      else {
        bodyIsHtml = false;
        bodyInner = esc(item.summary || '暂无摘要。请点击下方打开原文（需可访问外网）。');
      }
    }
    let body;
    if (bodyInner === null) {
      body = `<div class="news-embed-wrap">
        <p class="note">${esc(art.attribution || '嵌出来源页面阅读')}</p>
        <iframe class="news-embed" title="来源原文" src="${esc(art.embedUrl)}" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
      </div>`;
    } else if (bodyIsHtml) {
      body = `<div class="news-article" id="news-article-body">${bodyInner}</div>`;
    } else {
      body = `<div class="news-detail-sum" id="news-article-body">${bodyInner}</div>`;
    }
    const attr = art.attribution || (`来源：${item.sourceZh || item.source || ''} · 版权归原出处所有`);
    const isForeign = lang === 'en'
      || /(?:skysports\.com|espn\.com|bbc\.(?:co\.uk|com)|theguardian\.com)/i.test(item.link || '')
      || ['sky', 'espn', 'bbc', 'guardian'].includes(item.sourceId);
    S.newsOrig = S.newsOrig || {};
    S.newsOrig[item.id] = {
      title: item.title,
      bodyHtml: bodyIsHtml ? bodyInner : '',
      bodyText: bodyIsHtml ? '' : (item.summary || ''),
      hasArticle: bodyIsHtml,
    };
    const trState = (S.newsTrans && S.newsTrans[item.id]) || null;
    const view = trState ? (trState.view || 'zh') : 'orig';
    let translateBar = '';
    if (isForeign) {
      if (trState && trState.titleZh != null) {
        translateBar = `<div class="news-tr-bar">
          <div class="chips news-tr-chips">
            <button type="button" class="${view === 'orig' ? 'on' : ''}" data-act="newsTrView" data-id="${esc(item.id)}" data-view="orig">原文</button>
            <button type="button" class="${view === 'zh' ? 'on' : ''}" data-act="newsTrView" data-id="${esc(item.id)}" data-view="zh">中文</button>
          </div>
          <p class="news-tr-note">机器翻译仅供参考</p>
        </div>`;
      } else {
        translateBar = `<div class="news-tr-bar">
          <button type="button" class="btn pri sm" data-act="newsTranslate" data-id="${esc(item.id)}">一键译中文</button>
          <p class="news-tr-note">机器翻译仅供参考</p>
        </div>`;
      }
    }
    let showTitle = item.title;
    if (trState && view === 'zh' && trState.titleZh != null) showTitle = trState.titleZh;
    if (trState && view === 'zh' && trState.htmlZh != null && bodyInner !== null) {
      body = `<div class="news-article" id="news-article-body">${absApiHtml(trState.htmlZh)}</div>`;
    }
    box.innerHTML = `${cover}
      <div class="news-meta"><span class="news-src">${esc(item.sourceZh || item.source || '')}</span><span>${esc(newsTime(item.publishedAt))}</span></div>
      ${translateBar}
      <h2 class="news-detail-title" id="news-detail-title">${esc(showTitle)}</h2>
      ${body}
      <p class="note" style="margin-top:12px">${esc(attr)} · ${DISCLAIMER}</p>`;
  } catch (e) {
    box.innerHTML = empty('加载失败：' + esc(e.message || ''), '<button class="btn ghost sm" data-go="#/news">返回</button>');
  }
}

async function doNewsTranslate(id) {
  const sel = '[data-act="newsTranslate"][data-id="' + id.replace(/"/g, '') + '"]';
  const btn = document.querySelector(sel);
  if (btn) { btn.disabled = true; btn.textContent = '翻译中…'; }
  try {
    const j = await api('/news/' + encodeURIComponent(id) + '/translate?lang=en', { timeout: 90000 });
    if (!j || j.titleZh == null) throw new Error((j && j.error) || '翻译失败');
    S.newsTrans = S.newsTrans || {};
    S.newsTrans[id] = { titleZh: j.titleZh, htmlZh: j.htmlZh || '', view: 'zh', provider: j.provider };
    toast(j.cached ? '已显示缓存译文' : '翻译完成');
    return fillNewsDetail(id);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '一键译中文'; }
    const msg = e.message || '翻译失败';
    toast(msg.length > 60 ? msg.slice(0, 57) + '…' : msg);
  }
}

function applyNewsTrView(id, view) {
  const tr = S.newsTrans && S.newsTrans[id];
  if (!tr) return;
  tr.view = view === 'orig' ? 'orig' : 'zh';
  const titleEl = document.getElementById('news-detail-title');
  const bodyEl = document.getElementById('news-article-body');
  const orig = (S.newsOrig && S.newsOrig[id]) || {};
  if (titleEl) titleEl.textContent = tr.view === 'zh' ? tr.titleZh : (orig.title || '');
  if (bodyEl) {
    if (tr.view === 'zh') bodyEl.innerHTML = absApiHtml(tr.htmlZh || '');
    else if (orig.hasArticle) bodyEl.innerHTML = orig.bodyHtml || '';
    else bodyEl.textContent = orig.bodyText || '';
  }
  document.querySelectorAll('[data-act="newsTrView"][data-id="' + id.replace(/"/g, '') + '"]').forEach(b => {
    b.classList.toggle('on', b.dataset.view === tr.view);
  });
}


// ======================= 我的 =======================
function pageMe() {
  const u = S.user; const li = loggedIn();
  const mem = isMember();
  const until = (S.membership && S.membership.memberUntil) || (u && u.memberUntil);
  const daysLeft = (S.membership && S.membership.daysLeft) || (u && u.memberDaysLeft) || 0;
  let h = `<div class="me-hd"><div class="me-row" data-go="${li ? '#/profile' : '#/login'}"><div class="av">${avatarSvg(li ? u?.avatar : 'a8')}</div>
    <div><div class="nm">${li ? esc(u?.nickname || '球迷') : '登录 / 注册'}${mem ? '<span class="vip-chip">会员</span>' : ''}</div><div class="sub">${li ? esc(u?.phone || '') + (mem ? ' · 会员至 ' + esc(fmtMemberUntil(until)) : ' · 方案与关注已云端同步') : '游客浏览中 · 登录后同步方案与关注'}</div><span class="me-ver">v${esc(CFG.version || '1.9.22')} · 资讯预测</span></div><span class="go" style="width:20px;height:20px">${I.arr}</span></div></div>`;
  h += `<div class="me-stats"><button data-go="#/plans"><b class="num">${S.plans.length}</b>我的方案</button><button data-go="#/favs"><b class="num">${S.favs.length}</b>我的关注</button><button data-go="#/predict"><b class="num">${S.matches ? S.matches.filter(m => { const p = effectivePredict(m); return p && isSpeakPr(p) && p.lvl && p.lvl[1] === '稳胆'; }).length : '-'}</b>今日稳胆</button></div>`;
  // membership promo card
  h += `<div class="vip-card" data-go="#/membership"><div class="vip-card-bg"></div><div class="vip-card-ic">${I.vip}</div><div class="vip-card-body"><div class="vip-card-title">${mem ? '会员中心' : '开通资讯会员'}</div><div class="vip-card-sub">${mem ? `剩余约 ${esc(String(daysLeft))} 天 · 点此续费或查看权益` : '高级预测简报 · 数据中心完整 · 无广告浏览'}</div></div><span class="vip-card-cta">${mem ? '续费' : '开通'}</span></div>`;
  const mi = (g, ic, bg, title, val = '') => `<button data-go="${g}"><span class="mic" style="background:${bg}">${ic}</span><span class="sp">${title}</span><span class="val">${val}</span>${I.arr}</button>`;
  h += `<div class="menu">${mi('#/membership', I.vip, 'linear-gradient(135deg,#f5b942,#e08a1a)', '会员中心', mem ? '已开通' : '未开通')}${mi('#/orders', I.doc, '#1a62f0', '会员订单', '')}${mi('#/plans', I.doc, '#1565e0', '我的方案', S.plans.length + ' 个')}${mi('#/favs', I.star, '#f5a524', '我的关注', S.favs.length + ' 场')}${mi('#/news', I.news, '#6d28d9', '体坛资讯', newsTabOf() === 'en' ? '外网' : '国内')}</div>`;
  h += `<div class="menu">${li ? mi('#/profile', I.pen, '#12a150', '个人资料') + mi('#/password', I.lock, '#7b4ce0', '修改密码') : mi('#/login', I.nick, '#12a150', '登录 / 注册')}${mi('#/settings', I.gear, '#546e7a', '设置')}${mi('#/about', I.info, '#0aa5b8', '关于我们', 'v' + esc(CFG.version))}</div>`;
  return h + foot();
}

function memberBenefitsHtml(benefits) {
  const list = benefits || (S.memberCatalog && S.memberCatalog.benefits) || (S.membership && S.membership.benefits) || [];
  const icmap = { chart: I.chart, data: I.data, shield: I.shield, doc: I.doc, news: I.news };
  if (!list.length) return '<p class="note">权益说明加载中…</p>';
  return `<div class="vip-benefits">${list.map(b => `<div class="vip-ben"><span class="vip-ben-ic">${icmap[b.icon] || I.check}</span><div><div class="t">${esc(b.title)}</div><div class="d">${esc(b.desc)}</div></div></div>`).join('')}</div>`;
}

function pageMembership() {
  if (!loggedIn()) {
    return hdr('会员中心') + `<div class="pad-card"><p class="note" style="margin:0 0 12px">开通资讯会员需先登录账号。</p><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  }
  const mem = isMember();
  const until = (S.membership && S.membership.memberUntil) || (S.user && S.user.memberUntil);
  const cat = S.memberCatalog;
  const plans = (cat && cat.plans) || (S.membership && S.membership.plans) || [];
  const sel = S.payUi.planId || 'quarter';
  let h = hdr('会员中心');
  h += `<div class="vip-status ${mem ? 'on' : ''}"><div class="vs-l"><div class="vs-title">${mem ? '会员有效' : '尚未开通会员'}</div><div class="vs-sub">${mem ? `到期日 ${esc(fmtMemberUntil(until))} · 可续费叠加时长` : '会员仅用于资讯与高级数据，禁止购彩代下/出票'}</div></div><div class="vs-badge">${I.vip}</div></div>`;
  h += `<div class="sec-label">会员权益</div>` + memberBenefitsHtml(cat && cat.benefits);
  h += `<div class="sec-label">选择套餐</div><div class="vip-plans">`;
  if (!plans.length) {
    h += `<div class="pad-card"><p class="note">套餐加载中…</p><button class="btn ghost sm" data-act="reloadMembership">重新加载</button></div>`;
  } else {
    for (const pl of plans) {
      const on = pl.id === sel;
      h += `<button type="button" class="vip-plan ${on ? 'on' : ''} ${pl.highlight ? 'hot' : ''}" data-act="pickPlan" data-plan="${esc(pl.id)}">
        ${pl.tag ? `<span class="vip-tag">${esc(pl.tag)}</span>` : ''}
        <div class="vp-name">${esc(pl.name)}</div>
        <div class="vp-price"><span class="sym">¥</span><span class="num">${esc(planAmountYuan(pl))}</span></div>
        <div class="vp-meta">${esc(String(pl.days))} 天${pl.perDayYuan ? ` · 约 ¥${esc(pl.perDayYuan)}/天` : ''}</div>
        <div class="vp-desc">${esc(pl.desc || '')}</div>
      </button>`;
    }
  }
  h += `</div>`;
  h += `<div class="vip-note">当前为<strong>模拟支付</strong>：选择微信/支付宝后将模拟扣款成功，不会真实扣款。正式支付需商户号与类目审核。<a href="#/member-terms">《会员服务协议》</a></div>`;
  h += `<div class="vip-bar"><button class="btn pri block" data-act="goPay" ${plans.length ? '' : 'disabled'}>${mem ? '续费会员' : '立即开通'} · ${esc(planAmountYuan(plans.find(x => x.id === sel) || plans[0] || { amountYuan: '0.00' }))} 元</button></div>`;
  h += `<div class="menu" style="margin-top:12px"><button data-go="#/orders"><span class="mic" style="background:#1a62f0">${I.doc}</span><span class="sp">订单记录</span>${I.arr}</button></div>`;
  return h + foot();
}

function pagePay() {
  if (!loggedIn()) return hdr('确认支付') + `<div class="pad-card"><p class="note">请先登录</p><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  const phase = S.payUi.phase || 'form';
  const cat = S.memberCatalog;
  const plans = (cat && cat.plans) || [];
  const plan = plans.find(p => p.id === S.payUi.planId) || plans[0];
  const channels = (cat && cat.channels) || [{ id: 'wechat', name: '微信支付' }, { id: 'alipay', name: '支付宝' }];
  let h = hdr('确认支付');

  if (phase === 'paying') {
    h += `<div class="pay-result"><div class="pay-spin"></div><div class="pay-rt">支付处理中</div><div class="pay-rs">正在模拟${S.payUi.channel === 'alipay' ? '支付宝' : '微信'}支付…</div></div>`;
    return h;
  }
  if (phase === 'success') {
    const until = (S.membership && S.membership.memberUntil) || (S.user && S.user.memberUntil);
    h += `<div class="pay-result ok"><div class="pay-ok-ic">${I.check}</div><div class="pay-rt">支付成功</div><div class="pay-rs">模拟支付已到账，会员权益已生效${until ? `<br>有效期至 <b>${esc(fmtMemberUntil(until))}</b>` : ''}<br><span class="note">未发生真实扣款</span></div>
      <button class="btn pri block" data-go="#/membership" style="margin-top:18px">查看会员中心</button>
      <button class="btn ghost block" data-go="#/orders" style="margin-top:10px">查看订单</button></div>`;
    return h + foot();
  }
  if (phase === 'fail') {
    h += `<div class="pay-result fail"><div class="pay-rt">支付未完成</div><div class="pay-rs">${esc(S.payUi.err || '请重试')}</div>
      <button class="btn pri block" data-act="retryPay" style="margin-top:18px">重新支付</button>
      <button class="btn ghost block" data-go="#/membership" style="margin-top:10px">返回会员中心</button></div>`;
    return h + foot();
  }

  if (!plan) {
    h += `<div class="pad-card"><p class="note">套餐信息缺失</p><button class="btn ghost sm" data-go="#/membership">返回重选</button></div>`;
    return h + foot();
  }

  h += `<div class="pay-summary"><div class="ps-label">套餐</div><div class="ps-name">${esc(plan.name)}</div>
    <div class="ps-row"><span>时长</span><b>${esc(String(plan.days))} 天</b></div>
    <div class="ps-row"><span>应付金额</span><b class="price">¥${esc(planAmountYuan(plan))}</b></div>
    <div class="ps-tip">资讯会员 / 高级数据服务 · 非购彩充值</div></div>`;

  h += `<div class="sec-label">支付方式</div><div class="pay-channels">`;
  for (const ch of channels) {
    const on = S.payUi.channel === ch.id;
    const ic = ch.id === 'alipay' ? I.alipay : I.wechat;
    const bg = ch.id === 'alipay' ? '#1677ff' : '#09bb07';
    h += `<button type="button" class="pay-ch ${on ? 'on' : ''}" data-act="pickChannel" data-ch="${esc(ch.id)}"><span class="pay-ch-ic" style="background:${bg}">${ic}</span><span class="sp">${esc(ch.name)}</span><span class="pay-ch-mock">模拟</span>${on ? `<span class="pay-ch-ck">${I.check}</span>` : ''}</button>`;
  }
  h += `</div>`;
  h += `<label class="agree pay-agree"><input type="checkbox" data-act="payAgree" ${S.payUi.agree ? 'checked' : ''}><span>我已阅读并同意 <a href="#/member-terms">《会员服务协议》</a>，知悉当前为模拟支付、不会真实扣款，且会员费仅用于资讯与数据服务，不涉及购彩代下或出票。</span></label>`;
  if (S.payUi.err) h += `<div class="form-err" style="margin:8px 12px">${esc(S.payUi.err)}</div>`;
  h += `<div class="vip-bar"><button class="btn pri block" data-act="confirmPay">确认支付 ¥${esc(planAmountYuan(plan))}</button><p class="note" style="text-align:center;margin:8px 0 0">点选后将模拟支付成功，正式微信/支付宝扣款尚未接入</p></div>`;
  return h + foot();
}

function pageOrders() {
  if (!loggedIn()) return hdr('会员订单') + `<div class="pad-card"><p class="note">请先登录后查看订单</p><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  let h = hdr('会员订单');
  const orders = S.orders;
  if (!orders) {
    h += `<div class="pad-card"><p class="note">加载中…</p></div>`;
    setTimeout(() => { loadOrders().then(() => { if (route().name === 'orders') render(); }); }, 0);
    return h + foot();
  }
  if (!orders.length) {
    return h + empty('开通或续费会员后，订单将显示在这里。', '<button class="btn pri sm" data-go="#/membership">去会员中心</button>', '暂无订单') + foot();
  }
  const stMap = { pending: '待支付', paid: '已支付', failed: '失败', cancelled: '已取消', refunded: '已退款' };
  h += `<div class="order-list">${orders.map(o => {
    const st = stMap[o.status] || o.status;
    const t = o.paidAt || o.createdAt;
    return `<div class="order-card"><div class="oc-top"><span class="oc-name">${esc(o.planName)}</span><span class="oc-st st-${esc(o.status)}">${esc(st)}</span></div>
      <div class="oc-row"><span>金额</span><b>¥${esc(o.amountYuan)}</b></div>
      <div class="oc-row"><span>方式</span><span>${esc(o.channel === 'alipay' ? '支付宝' : '微信')}${o.mock ? '（模拟）' : ''}</span></div>
      <div class="oc-row"><span>订单号</span><span class="mono">${esc(o.id)}</span></div>
      <div class="oc-row"><span>时间</span><span>${esc(new Date(t).toLocaleString('zh-CN', { hour12: false }))}</span></div>
      ${o.status === 'pending' ? `<button class="btn pri sm" style="margin-top:10px" data-act="resumePay" data-oid="${esc(o.id)}">继续支付</button>` : ''}
    </div>`;
  }).join('')}</div>`;
  h += `<p class="note" style="margin:12px">会员订单仅对应资讯/数据订阅，与购彩无关。</p>`;
  return h + foot();
}

function pageMemberTerms() {
  return hdr('会员服务协议') + `<div class="doc">${TPL}<h2>竞彩预测会员服务协议（模板）</h2>
  <p>更新日期：2026年10月14日　运营方：【运营主体名称】</p>
  <h4>一、服务性质</h4><p>会员服务指向注册用户提供的<strong>资讯内容与高级数据访问</strong>权益（如高级预测简报、数据中心完整浏览、无广告纯净浏览等）。本服务<strong>不包含</strong>彩票销售、投注、代购、合买、发单/跟单、出票或任何购彩代下。</p>
  <h4>二、费用与支付</h4><p>1. 会员套餐价格以应用内展示为准。<br>2. <strong>当前版本为模拟支付（sandbox/mock）</strong>：选择微信/支付宝仅演示流程，不会真实扣款。<br>3. 正式接入微信/支付宝前，须完成商户入驻、经营类目审核与证书配置；正式扣款上线前会另行告知。</p>
  <h4>三、权益与期限</h4><p>会员自支付成功（含模拟确认）起按套餐天数生效；续费在剩余有效期基础上叠加。权益以当时产品实际功能为准，不承诺购彩相关能力。</p>
  <h4>四、退款</h4><p>模拟支付无真实资金流转，不适用退款。正式支付上线后的退款规则由运营方依法公示。</p>
  <h4>五、禁止用途</h4><p>不得利用本应用从事违法违规活动；不得将会员服务理解为购彩通道或收益承诺。</p>
  <h4>六、其他</h4><p>本协议为占位模板，正式对外使用前须由运营主体修订并经审核。未尽事宜适用《用户协议》与《隐私政策》。</p></div>` + foot();
}

async function loadOrders() {
  if (!loggedIn()) { S.orders = []; return; }
  try {
    const r = await api('/membership/orders');
    S.orders = r.orders || [];
  } catch (e) { S.orders = []; toast(e.message); }
}

async function ensureMembershipReady() {
  const tasks = [];
  if (!S.memberCatalog) tasks.push(loadMembershipCatalog());
  if (loggedIn() && !S.membership) tasks.push(api('/membership/status').then(ms => { S.membership = ms; }).catch(() => {}));
  if (tasks.length) await Promise.all(tasks);
}
const infoBar = t => `<div class="warn-bar" style="background:var(--pri-l);border-color:#cfdcf7;color:var(--pri-d)">${t}</div>`;
function pagePlans() {
  let h = hdr('我的方案');
  h += infoBar(`方案仅作为个人记录${loggedIn() ? '，已同步到你的账号' : '保存在本机，<a href="#/login">登录</a>后可同步到账号'}；不会提交或出票，本应用不提供投注服务。`);
  if (!S.plans.length) return h + empty('在赛程或赛事详情中点击赔率选项，即可生成个人方案记录（不会投注或出票）。', '<button class="btn pri sm" data-go="#/schedule">去看赛程</button>', '还没有方案') + foot();
  h += '<div style="height:10px"></div><div class="grid">' + S.plans.map(p => `<div class="card plan"><div class="ph"><span class="sp">${esc((p.types || []).join('、'))} · ${esc(p.mult)}倍</span>${p.sample ? '<span class="sample-tag">示例数据</span>' : ''}<button class="del" data-act="delPlan" data-id="${esc(p.id)}">删除</button></div>
    ${(p.picks || []).map(x => `<div class="pk" style="padding:8px 0"><div class="n" style="font-size:13px">${esc(x.num)} ${esc(x.home)} vs ${esc(x.away)}</div><div class="items">${(x.items || []).map(it => `<span>${esc(it.label)} @${Number(it.odds).toFixed(2)}</span>`).join('')}</div></div>`).join('')}
    <div class="foot2"><span>${esc(new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false }))}</span><span>${esc(p.bets)}注 · 理论奖金 <b>${Number(p.min).toFixed(2)}~${Number(p.max).toFixed(2)}</b></span></div></div>`).join('') + '</div>';
  return h + foot();
}
function pageFavs() {
  let h = hdr('我的关注');
  if (!S.favs.length) return h + empty('在赛事详情页点击「关注」，即可把场次收藏到这里，方便跟踪。', '<button class="btn pri sm" data-go="#/schedule">去看赛程</button>', '还没有关注') + foot();
  if (!loggedIn()) h += infoBar('当前为游客，关注仅保存在本机。<a href="#/login">登录</a> 后自动同步到账号。');
  h += '<div style="height:10px"></div><div class="grid">' + S.favs.map(f => {
    const m = findMatch(f.matchId); if (m) return matchCard(m, { odds: false });
    const r = (S.results || []).find(x => x.id === f.matchId); if (r) return resultCard(r);
    return `<div class="card mc"><div class="mc-top">${lgTag(f)}<span>${esc(f.num)}</span><span class="sp">${esc(f.date)} ${esc(f.time)}</span><button style="color:var(--t3);font-size:12px" data-act="unfav" data-id="${esc(f.matchId)}">取消关注</button></div>
      <div class="mc-teams"><div class="t h"><span class="n">${esc(f.home)}</span>${badge(f.home, '', f.homeLogo)}</div><div class="mc-mid"><div class="vs">VS</div><small>已结束/下架</small></div><div class="t">${badge(f.away, '', f.awayLogo)}<span class="n">${esc(f.away)}</span></div></div></div>`;
  }).join('') + '</div>';
  return h + foot();
}

// ======================= auth & account pages =======================
function pageLogin() {
  return `<div class="auth"><div class="auth-hd">${S.guest || loggedIn() ? `<button class="back" data-act="back">${I.back}</button>` : ''}<div class="lg"></div><h1>欢迎来到竞彩预测</h1><p>赛事资讯 · 赔率概率 · 智能预测</p></div>
  <form class="auth-card" id="fLogin" autocomplete="on" novalidate>
    <div class="fld">${I.phone}<span class="pfx">+86</span><input name="phone" type="tel" inputmode="numeric" maxlength="11" placeholder="请输入手机号" autocomplete="tel" value="${esc(LS.get('jc_last_phone', ''))}"></div>
    <div class="fld">${I.lock}<input name="password" type="password" maxlength="32" placeholder="请输入密码" autocomplete="current-password"><button type="button" class="eye" data-act="eye">显示</button></div>
    <div class="form-err" id="err"></div>
    <button class="btn pri block" type="submit">登录</button>
    <div class="auth-links"><button type="button" data-go="#/register">注册新账号</button><button type="button" data-act="forgot" style="color:var(--t3)">忘记密码？</button></div>
  </form>
  <button class="guest" data-act="guest">游客浏览，先逛逛 →</button>
  <div class="feat"><div><i>${I.cal}</i>实时赛程赔率</div><div><i>${I.chart}</i>概率智能预测</div><div><i>${I.doc}</i>方案云端同步</div></div>
  <p class="auth-note">手机号 + 密码登录（暂未接入短信验证码）<br>登录即表示同意 <a href="#/terms" data-doc="terms">《用户协议》</a> 和 <a href="#/privacy" data-doc="privacy">《隐私政策》</a><br>${DISCLAIMER}</p></div>`;
}
function pageRegister() {
  return `<div class="auth"><div class="auth-hd"><button class="back" data-act="back">${I.back}</button><div class="lg"></div><h1>注册账号</h1><p>注册后方案与关注可多设备同步</p></div>
  <form class="auth-card" id="fReg" novalidate>
    <div class="fld">${I.phone}<span class="pfx">+86</span><input name="phone" type="tel" inputmode="numeric" maxlength="11" placeholder="手机号（11位）" autocomplete="tel"></div>
    <div class="fld">${I.lock}<input name="password" type="password" maxlength="32" placeholder="设置密码（8-32位，含字母和数字）" autocomplete="new-password"><button type="button" class="eye" data-act="eye">显示</button></div>
    <div class="fld">${I.lock}<input name="password2" type="password" maxlength="32" placeholder="再次输入密码" autocomplete="new-password"></div>
    <div class="fld">${I.nick}<input name="nickname" maxlength="16" placeholder="昵称（选填，1-16字）"></div>
    <label class="agree"><input type="checkbox" name="agree"><span>我已年满18周岁，已阅读并同意 <a href="#/terms" data-doc="terms">《用户协议》</a> 和 <a href="#/privacy" data-doc="privacy">《隐私政策》</a>，知悉本应用仅提供资讯与预测参考，不提供投注服务。</span></label>
    <div class="form-err" id="err"></div>
    <button class="btn pri block" type="submit">注册并登录</button>
    <div class="auth-links"><span></span><button type="button" data-go="#/login">已有账号？去登录</button></div>
  </form>
  <p class="auth-note">暂未接入短信验证码，请牢记密码。<br>${DISCLAIMER}</p></div>`;
}
function pageProfile() {
  const u = S.user || {};
  return hdr('个人资料') + `<form class="form" id="fProfile" novalidate><label class="lb">选择头像</label>
    <div class="avatars">${Object.keys(AV).map(k => `<button type="button" class="${k === (S.pendingAv || u.avatar) ? 'on' : ''}" data-av="${k}" aria-label="头像${k.slice(1)}">${avatarSvg(k)}</button>`).join('')}</div>
    <label class="lb">昵称</label><div class="fld"><input name="nickname" maxlength="16" value="${esc(u.nickname || '')}" placeholder="1-16个字符"></div>
    <label class="lb">手机号</label><div class="fld"><input value="${esc(u.phone || '')}" disabled></div>
    <div class="form-err" id="err"></div><button class="btn pri block" type="submit">保存</button></form>
    <div class="menu"><button data-go="#/password"><span class="sp">修改密码</span>${I.arr}</button><button data-go="#/delete"><span class="sp" style="color:var(--red)">注销账号</span>${I.arr}</button></div>` + foot();
}
function pagePassword() {
  return hdr('修改密码') + `<form class="form" id="fPwd" novalidate>
    <label class="lb">原密码</label><div class="fld"><input name="old" type="password" maxlength="64" autocomplete="current-password" placeholder="请输入原密码"></div>
    <label class="lb">新密码</label><div class="fld"><input name="pw" type="password" maxlength="32" autocomplete="new-password" placeholder="8-32位，含字母和数字"></div>
    <label class="lb">确认新密码</label><div class="fld"><input name="pw2" type="password" maxlength="32" autocomplete="new-password" placeholder="再次输入新密码"></div>
    <div class="form-err" id="err"></div><button class="btn pri block" type="submit">确认修改</button>
    <p class="note">修改成功后，其他设备上的登录将失效。</p></form>` + foot();
}
function pageDelete() {
  return hdr('注销账号') + `<form class="form" id="fDel" novalidate>
    <div class="doc" style="margin:12px 0;box-shadow:none;padding:0"><h4 style="color:var(--red)">注销前请确认</h4><p>1. 注销后，账号 ${esc(S.user?.phone || '')} 的资料、全部「我的方案」和「我的关注」将从服务器<b>永久删除</b>，无法恢复。</p><p>2. 注销后该手机号可重新注册，但不会恢复任何历史数据。</p></div>
    <label class="lb">请输入登录密码确认</label><div class="fld"><input name="pw" type="password" maxlength="64" autocomplete="current-password" placeholder="登录密码"></div>
    <label class="agree"><input type="checkbox" name="ok"><span>我已了解注销后果，确认永久删除账号及数据</span></label>
    <div class="form-err" id="err"></div><button class="btn danger block" type="submit">永久注销账号</button></form>` + foot();
}
function pageSettings() {
  const li = loggedIn();
  return hdr('设置') + `<div class="menu">
    <button data-act="clearCache"><span class="mic" style="background:#ff8a1f">${I.refresh}</span><span class="sp">清除缓存</span><span class="val">赛事数据缓存</span>${I.arr}</button>
    <button data-go="#/about"><span class="mic" style="background:#0aa5b8">${I.info}</span><span class="sp">关于</span><span class="val">v${esc(CFG.version)}</span>${I.arr}</button>
    <button data-go="#/terms"><span class="mic" style="background:#1a62f0">${I.doc}</span><span class="sp">用户协议</span>${I.arr}</button>
    <button data-go="#/privacy"><span class="mic" style="background:#12a150">${I.shield}</span><span class="sp">隐私政策</span>${I.arr}</button></div>
    ${li ? `<div class="menu"><button data-go="#/delete"><span class="mic" style="background:#98a1b3">${I.trash}</span><span class="sp">注销账号</span>${I.arr}</button></div>
    <div class="menu"><button class="danger" data-act="logout">退出登录</button></div>` : `<div class="menu"><button class="danger" style="color:var(--pri)" data-go="#/login">登录 / 注册</button></div>`}` + foot();
}
function baselineDoc() {
  const b = S.baseline;
  if (!b || !b.test) return '<p class="note">历史命中率报告暂未就绪。</p>';
  const dr = b.dateRange || {};
  const t = b.test;
  const naiveH = (b.naiveOnTest || []).find(x => x.flag === 'H');
  return `<p>方法与上方一致（去水隐含概率最高项）。样本 <b>${b.total}</b> 场，区间 ${esc(dr.from || '')} 至 ${esc(dr.to || '')}。</p>
  <p>留出测试集 <b>${t.n}</b> 场：命中率 <b>${t.hitRate}%</b>，按公布赔率平注 ROI <b>${t.roi}%</b>${naiveH ? `（同区间全选主胜约 ${naiveH.hitRate}%）` : ''}。</p>
  <p class="note">命中率高于乱猜或全选主胜，不等于长期盈利；未计税、限额与截期。仅作方法说明，不构成投注建议。</p>`;
}
function pageAbout() {
  return hdr('关于') + `<div class="doc" style="text-align:center"><div style="width:72px;height:72px;margin:10px auto;border-radius:18px;background:url(icons/icon-192.png) center/cover;box-shadow:var(--sh2)"></div><h2>竞彩预测</h2><p class="note">版本 ${esc(CFG.version)} · ${IS_APP ? 'Android 应用' : '网页版'}</p></div>
  <div class="doc"><h4>我们提供什么</h4><p>竞彩足球在售赛程、胜平负/让球赔率、基于赔率隐含概率的预测分析、联赛积分榜/射手榜数据中心，以及开奖结果查询。</p>
  <h4>预测如何计算</h4><p>详情「预测」页生成赛前情报简报：赛况背景、近期战绩与进失球、交锋史、伤停（有第三方数据才写，否则标明暂无）、主客日程，以及市场赔率（仅参考项）。由服务端按场次缓存，避免打爆数据源配额。不编造伤停/比分/未发生新闻。</p>
  <h4>历史实测（基线）</h4>${baselineDoc()}
  <h4>我们不提供什么</h4><p><b>本应用不提供投注、代购、购彩充值或出票服务</b>。「保存方案」仅为个人记录，不会被提交到任何彩票店或第三方。应用内「资讯会员」费用仅用于资讯与高级数据访问（当前为模拟支付），与购彩无关。</p>
  <h4>数据来源</h4><p>中国体育彩票官网 sporttery.cn 公开数据，服务器约每 3 分钟更新；官方接口不可达时会明确标注「示例数据」。</p>
  <p class="note">未满18周岁不得购买彩票。${DISCLAIMER}</p></div>` + foot();
}
const TPL = '<div class="tpl">【模板文本】以下内容为占位模板，请店主/运营方根据实际运营主体信息及适用法律法规修改、并经专业人士审核后再正式使用。</div>';
function pageTerms() {
  return hdr('用户协议') + `<div class="doc">${TPL}<h2>竞彩预测用户协议（模板）</h2><p>更新日期：【YYYY年MM月DD日】　运营方：【运营主体名称】</p>
  <h4>一、服务内容</h4><p>本应用向用户提供体育赛事资讯、赔率展示、基于赔率的概率分析与开奖结果查询服务。上述内容仅供参考，不构成任何投注建议或收益承诺。</p>
  <h4>二、不提供投注服务</h4><p>本应用不提供彩票销售、投注、代购、合买、发单/跟单、购彩充值或出票等任何服务。「保存方案」功能仅为用户个人记录，不会提交给任何彩票销售机构。资讯会员订阅（若开通）仅对应资讯与数据权益，当前版本为模拟支付。</p>
  <h4>三、账号注册与使用</h4><p>用户须年满18周岁，应使用本人手机号注册，妥善保管密码，并对账号下的行为负责。禁止利用本应用从事违法违规活动。</p>
  <h4>四、免责声明</h4><p>赛事数据来源于公开渠道，可能存在延迟或误差，请以官方公布为准。用户依据本应用内容作出的任何决定，风险由用户自行承担。</p>
  <h4>五、账号注销</h4><p>用户可在「我的 → 设置 → 注销账号」中自助注销，注销后账号数据将被永久删除。</p>
  <h4>六、协议修改与联系</h4><p>运营方可能适时修订本协议并在应用内公布。如有疑问请联系：【联系电话/邮箱】。</p></div>` + foot();
}
function pagePrivacy() {
  return hdr('隐私政策') + `<div class="doc">${TPL}<h2>竞彩预测隐私政策（模板）</h2><p>更新日期：【YYYY年MM月DD日】　运营方：【运营主体名称】</p>
  <h4>一、我们收集的信息</h4><p>1. 注册信息：手机号、密码（仅保存经 scrypt 加盐哈希后的结果，不保存明文）、昵称、所选预设头像。<br>2. 使用数据：你主动保存的「我的方案」和「我的关注」。<br>3. 登录会话：登录凭证（服务器仅保存其哈希）及设备 User-Agent，用于保持登录状态。<br>4. 会员订单：套餐、金额、支付方式与会员有效期（用于提供资讯会员服务；当前为模拟支付）。</p>
  <h4>二、我们如何使用信息</h4><p>仅用于提供账号登录、数据同步功能及保障账号安全（如登录频率限制）。我们不会出售你的个人信息，也不会将方案提交给任何第三方。</p>
  <h4>三、信息存储</h4><p>数据存储于运营方位于【地区】的服务器。游客模式下的方案与关注仅保存在你的设备本地。</p>
  <h4>四、你的权利</h4><p>你可以随时修改昵称、头像和密码，删除方案或关注，并可通过「注销账号」永久删除全部个人数据。</p>
  <h4>五、未成年人保护</h4><p>本应用面向年满18周岁的用户。</p>
  <h4>六、联系我们</h4><p>【联系电话/邮箱/地址】</p></div>` + foot();
}

// ======================= render =======================
const PAGES = { home: pageHome, schedule: pageSchedule, predict: pagePredict, data: pageData, results: pageResults, me: pageMe, match: pageMatch, player: pagePlayer, team: pageTeam, aplayer: pageAfPlayer, plans: pagePlans, favs: pageFavs,
  news: pageNews, login: pageLogin, register: pageRegister, profile: pageProfile, password: pagePassword, delete: pageDelete, settings: pageSettings, about: pageAbout, terms: pageTerms, privacy: pagePrivacy,
  membership: pageMembership, pay: pagePay, orders: pageOrders, 'member-terms': pageMemberTerms };
const TAB_DEF = [['home', '首页', I.home], ['schedule', '赛程', I.cal], ['predict', '预测', I.chart], ['data', '数据', I.data], ['me', '我的', I.user]];
const TITLES = { home: '首页', schedule: '比分', predict: '预测', data: '数据中心', results: '开奖', me: '我的', match: '赛事详情', player: '球员详情', team: '球队详情', aplayer: '球员详情', news: '体坛资讯', login: '登录', register: '注册', membership: '会员中心', pay: '确认支付', orders: '会员订单', 'member-terms': '会员服务协议' };
function render() {
  const r = route();
  if (!PAGES[r.name]) return go('#/home', true);
  if (PROTECTED.includes(r.name) && !loggedIn()) return go('#/login', true);
  if ((r.name === 'login' || r.name === 'register') && loggedIn()) return go('#/me', true);
  const isTab = TABS.includes(r.name); const v = $('#view');
  const same = render.last === location.hash; const y = window.scrollY;
  const ds = $('#dstrip'); const dsx = same && ds ? ds.scrollLeft : null;
  v.className = 'view' + (isTab ? '' : ' sub');
  v.innerHTML = PAGES[r.name](r.arg);
  render.last = location.hash;
  if (same) window.scrollTo(0, y);
  const nds = $('#dstrip');
  if (nds) { if (dsx !== null) nds.scrollLeft = dsx; else { const on = nds.querySelector('.on'); if (on) nds.scrollLeft = on.offsetLeft - nds.clientWidth / 2 + on.clientWidth / 2; } }
  const tb = $('#tabbar'); tb.classList.toggle('hidden', !isTab);
  tb.innerHTML = TAB_DEF.map(([k, t, ic]) => `<button class="${k === r.name ? 'on' : ''}" data-go="#/${k}">${ic}<span>${t}</span></button>`).join('');
  renderPlanBar();
  if (r.name === 'home') initBanner();
  if (r.name !== 'schedule') stopLiveScorePoll();
  document.title = (TITLES[r.name] ? TITLES[r.name] + ' · ' : '') + '竞彩预测';
  if (r.name === 'predict' || r.name === 'home') {
    const need = (S.matches || []).some(m => {
      const id = String(m.id);
      return Date.now() < kickoff(m) + 2 * 3600e3 && !(S.predictCache && S.predictCache[id] && S.predictCache[id].ok);
    });
    if (need && !(S._predPrefetch && S._predPrefetch.running)) {
      setTimeout(() => prefetchPredictReports(S.matches), 0);
    }
  }
  if (r.name === 'match') setTimeout(() => enrichMatchDetail(findMatch(r.arg) || (S.results || []).find(z => z.id === String(r.arg))), 0);
  if ((r.name === 'membership' || r.name === 'pay') && (!S.memberCatalog || (loggedIn() && !S.membership))) {
    const need = r.name;
    ensureMembershipReady().then(() => { if (route().name === need) render(); });
  }
  if (r.name === 'orders' && S.orders == null) {
    loadOrders().then(() => { if (route().name === 'orders') render(); });
  }
  if (r.name === 'me' && loggedIn() && !S.membership) {
    api('/membership/status').then(ms => { S.membership = ms; if (route().name === 'me') render(); }).catch(() => {});
  }
  tickClock();
}
function initBanner() {
  const t = $('#bnTrack'); if (!t) return;
  const dots = t.parentElement.querySelectorAll('.dots i');
  if (S.bannerIdx) t.scrollLeft = S.bannerIdx * t.clientWidth;
  t.onscroll = () => { const i = Math.round(t.scrollLeft / t.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); S.bannerIdx = i; };
  clearInterval(initBanner.iv);
  initBanner.iv = setInterval(() => { if (!document.body.contains(t) || document.hidden) return clearInterval(initBanner.iv); t.scrollTo({ left: ((S.bannerIdx + 1) % BANNERS.length) * t.clientWidth, behavior: 'smooth' }); }, 4500);
}

// ======================= events =======================
document.addEventListener('click', async e => {
  const doc = e.target.closest('a[data-doc]');
  if (doc) { // show 协议/隐私 in a sheet so the login/register form keeps its input
    e.preventDefault(); const sh = $('#sheet'); sh.classList.remove('hidden');
    const html = (doc.dataset.doc === 'terms' ? pageTerms : pagePrivacy)().replace(/^<header[\s\S]*?<\/header>/, '').replace(/<div class="foot">[\s\S]*$/, '');
    sh.innerHTML = `<div class="sheet"><h3><span>${doc.dataset.doc === 'terms' ? '用户协议' : '隐私政策'}</span><button class="x" data-act="closeSheet">✕</button></h3>${html.replace('class="doc"', 'class="doc" style="margin:0;box-shadow:none;padding:0"')}</div>`;
    return;
  }
  const el = e.target.closest('[data-act],[data-go],[data-key],[data-type],[data-mult],[data-sdate],[data-slg],[data-rdate],[data-rlg],[data-pf],[data-av]');
  if (!el) { if (e.target.id === 'sheet') closeSheet(); return; }
  const d = el.dataset;
  if (d.key) return toggleSel(d.mid, d.key);
  if (d.type) { const n = +d.type; S.types = S.types.includes(n) ? S.types.filter(x => x !== n) : [...S.types, n]; if (!S.types.length) S.types = [n]; return openPlanSheet(); }
  if (d.mult) { S.mult = Math.max(1, Math.min(99, S.mult + +d.mult)); return openPlanSheet(); }
  if (d.sdate) { S.schDate = d.sdate; return render(); }
  if (d.slg) { S.schLeague = d.slg; return render(); }
  if (d.rdate) { S.rsDate = d.rdate; return render(); }
  if (d.rlg) { S.rsLeague = d.rlg; return render(); }
  if (d.pf) { S.prFilter = d.pf; return render(); }
  if (d.av) { S.pendingAv = d.av; document.querySelectorAll('[data-av]').forEach(b => b.classList.toggle('on', b === el)); return; }
  if (d.go) { e.preventDefault(); return go(d.go); }
  switch (d.act) {
    case 'schChannel': {
      setSchChannel(el.dataset.ch || '全部');
      return render();
    }
    case 'schStatus': {
      setSchStatus(el.dataset.st || '全部');
      return render();
    }
    case 'schRefresh': {
      S.liveScoresAt = 0;
      const ms = (S.schedule && S.schedule.length) ? S.schedule : S.matches;
      const rs = S.results;
      const dayRes = (rs || []).filter(r => issueDate(r) === S.schDate);
      const dayRows = [...(ms || []).filter(m => issueDate(m) === S.schDate && !dayRes.some(r => r.id === m.id)), ...dayRes];
      toast('正在刷新比分…');
      Promise.all([reloadData(true), loadLiveScores(dayRows.map(x => String(x.id)), { force: true })]).then(() => {
        render();
        toast('比分已更新');
      }).catch(() => { render(); toast('刷新失败，请稍后再试'); });
      return;
    }
    case 'schHideFin': {
      const on = el.type === 'checkbox' ? el.checked : !S.schHideFinished;
      setSchHideFinished(on);
      return render();
    }
    case 'schHideFinOff': {
      setSchHideFinished(false);
      return render();
    }
    case 'statsUi': {
      const id = el.dataset.id;
      const k = el.dataset.k;
      let v = el.dataset.v;
      if (k === 'formN' || k === 'h2hN') v = Number(v);
      setStatsUi(id, { [k]: v });
      // re-render current match pane without full navigation reset
      render();
      const x = findMatch(id) || (S.results || []).find(z => z.id === String(id));
      if (x) enrichMatchDetail(x);
      return;
    }
    case 'dataLeague': {
      setDataLeague(el.dataset.lg || 'epl');
      return render();
    }
    case 'dataKind': {
      setDataKind(el.dataset.kind || 'standings');
      return render();
    }
    case 'dataRefresh': {
      const k = dataLeagueOf() + ':' + dataKindOf();
      if (S.dataCache) delete S.dataCache[k];
      return render();
    }
    case 'teamSquad': {
      const id = el.dataset.id;
      const lg = el.dataset.lg || dataLeagueOf();
      el.disabled = true;
      el.textContent = '加载中…';
      fillTeam(id, lg, { squad: true });
      return;
    }
    case 'back': return back();
    case 'newsTab': {
      setNewsTab(el.dataset.tab);
      return render();
    }
    case 'newsClear': {
      S.newsQ = '';
      document.title = '体坛资讯 · 竞彩预测';
      return go('#/news', true);
    }
    case 'newsMore':
      return loadOlderNews();
    case 'newsTranslate':
      return doNewsTranslate(el.dataset.id);
    case 'newsTrView':
      return applyNewsTrView(el.dataset.id, el.dataset.view);
    case 'fpSide': {
      const id = String(el.dataset.id || '');
      const side = el.dataset.side === 'away' ? 'away' : 'home';
      S.fpSide = S.fpSide || {};
      S.fpSide[id] = side;
      const x = findMatch(id) || (S.results || []).find(r => String(r.id) === id);
      if (!x) return;
      const pane = document.getElementById('detail-pane-' + id);
      if (pane && detailTabOf(id) === 'data') {
        const stats = S.statsCache && S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')];
        pane.innerHTML = dataTabHtml(x, findMatch(id), stats);
        ensureLivePoll(x);
      }
      return;
    }
    case 'refreshPlayers': {
      const id = String(el.dataset.id || '');
      const x = findMatch(id) || (S.results || []).find(r => String(r.id) === id);
      if (!x) { toast('未找到比赛'); return; }
      if (S.fixturePlayersCache) delete S.fixturePlayersCache[id];
      toast('正在刷新本场球员…');
      const pane = document.getElementById('detail-pane-' + id);
      if (pane && detailTabOf(id) === 'data') {
        const stats = S.statsCache && S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')];
        pane.innerHTML = dataTabHtml(x, findMatch(id), stats);
      }
      await loadFixturePlayers(x, { force: true });
      if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'data') {
        const p2 = document.getElementById('detail-pane-' + id);
        const stats = S.statsCache && S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')];
        if (p2) p2.innerHTML = dataTabHtml(x, findMatch(id), stats);
      }
      toast('球员数据已更新');
      return;
    }
    case 'refreshReview': {
      const id = String(el.dataset.id || '');
      const x = findMatch(id) || (S.results || []).find(r => String(r.id) === id);
      if (!x) { toast('未找到比赛'); return; }
      if (S.reviewCache) delete S.reviewCache[id];
      S.reviewListCache = null;
      toast('正在刷新赛后复盘…');
      const pane = document.getElementById('detail-pane-' + id);
      if (pane) pane.innerHTML = reviewTabHtml(x);
      await Promise.all([loadPostMatchReview(x, { force: true }), loadRecentReviews({ force: true })]);
      if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'review') {
        const p2 = document.getElementById('detail-pane-' + id);
        if (p2) p2.innerHTML = reviewTabHtml(x);
      }
      toast('复盘已更新');
      return;
    }
    case 'refreshPredict': {
      const id = String(el.dataset.id || '');
      const m = findMatch(id);
      if (!m) { toast('未找到比赛'); return; }
      toast('正在刷新综合简报…');
      await loadPredictReport(m, { force: true });
      if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'pred') {
        const pane = document.getElementById('detail-pane-' + id);
        if (pane) pane.innerHTML = predTabHtml(m);
      }
      toast('简报已更新');
      return;
    }
    case 'detailTab': {

      const id = el.dataset.id, tab = el.dataset.tab;
      S.detailTab = S.detailTab || {}; S.detailTab[id] = tab;
      render();
      enrichMatchDetail(findMatch(id) || (S.results || []).find(z => z.id === String(id)));
      return;
    }
    case 'squadTab': {
      const id = el.dataset.id, side = el.dataset.side;
      S.squadTab = S.squadTab || {}; S.squadTab[id] = side;
      const x = findMatch(id) || (S.results || []).find(z => z.id === String(id));
      render();
      ensureSquad(x);
      return;
    }
    case 'vote': {
      const id = el.dataset.id, choice = el.dataset.choice;
      if (!loggedIn()) { toast('请先登录后再投票'); return go('#/login'); }
      try {
        const j = await api('/match-vote', { method: 'POST', body: { matchId: id, choice } });
        S.voteCache = S.voteCache || {}; S.voteCache[id] = j;
        renderVoteBox(id);
        toast('已投票：' + ({ h: '胜', d: '平', a: '负' }[choice] || choice));
      } catch (er) { toast(er.message || '投票失败'); }
      return;
    }
    case 'fav': return toggleFav(d.id);
    case 'unfav': {
      if (loggedIn()) { try { await api('/favorites/' + encodeURIComponent(d.id), { method: 'DELETE' }); } catch (er) { return toast(er.message); } }
      S.favs = S.favs.filter(f => f.matchId !== d.id); persistLists(); toast('已取消关注'); return render();
    }
    case 'clearSel': S.sel = {}; S.types = []; S.mult = 1; return render();
    case 'openPlan': return openPlanSheet();
    case 'closeSheet': return closeSheet();
    case 'savePlan': return savePlan();
    case 'delPlan': return deletePlan(d.id);
    case 'eye': { const inp = el.parentElement.querySelector('input'); inp.type = inp.type === 'password' ? 'text' : 'password'; el.textContent = inp.type === 'password' ? '显示' : '隐藏'; return; }
    case 'reloadMembership': {
      S.memberCatalog = null; S.membership = null;
      ensureMembershipReady().then(() => render());
      return;
    }
    case 'pickPlan': {
      S.payUi.planId = el.dataset.plan || 'quarter';
      S.payUi.err = '';
      return render();
    }
    case 'goPay': {
      if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
      S.payUi.phase = 'form'; S.payUi.orderId = null; S.payUi.err = ''; S.payUi.agree = false;
      return go('#/pay');
    }
    case 'pickChannel': {
      S.payUi.channel = el.dataset.ch || 'wechat';
      S.payUi.err = '';
      return render();
    }
    case 'payAgree': {
      S.payUi.agree = !!el.checked;
      return;
    }
    case 'retryPay': {
      S.payUi.phase = 'form'; S.payUi.err = '';
      return render();
    }
    case 'resumePay': {
      S.payUi.phase = 'form'; S.payUi.orderId = el.dataset.oid || null; S.payUi.err = '';
      // keep channel; jump to pay and immediately confirm if order exists
      go('#/pay');
      return;
    }
    case 'confirmPay': {
      (async () => {
        if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
        if (!S.payUi.agree) { S.payUi.err = '请先勾选同意《会员服务协议》'; return render(); }
        const planId = S.payUi.planId || 'quarter';
        const channel = S.payUi.channel || 'wechat';
        S.payUi.phase = 'paying'; S.payUi.err = ''; render();
        try {
          let orderId = S.payUi.orderId;
          if (!orderId) {
            const created = await api('/membership/orders', { method: 'POST', body: { planId, channel } });
            orderId = created.order && created.order.id;
            S.payUi.orderId = orderId;
          }
          // brief UX delay for mature feel
          await new Promise(r => setTimeout(r, 900));
          const paid = await api('/membership/orders/' + encodeURIComponent(orderId) + '/pay', { method: 'POST', body: { channel } });
          S.membership = paid.membership || S.membership;
          if (paid.membership) {
            if (S.user) {
              S.user.memberActive = paid.membership.active;
              S.user.memberUntil = paid.membership.memberUntil;
              S.user.memberDaysLeft = paid.membership.daysLeft;
              LS.set('jc_user', S.user);
            }
          }
          S.orders = null;
          S.payUi.phase = 'success';
          toast(paid.message || '会员已生效');
          render();
        } catch (err) {
          S.payUi.phase = 'fail';
          S.payUi.err = err.message || '支付失败';
          render();
        }
      })();
      return;
    }
    case 'guest': S.guest = true; LS.set('jc_guest', true); return go('#/home', true);
    case 'forgot': return confirmDlg('忘记密码', '当前版本暂未接入短信验证码，无法自助找回密码。<br>如需重置，请联系运营方客服协助处理。', '知道了');
    case 'logout': {
      if (!(await confirmDlg('退出登录', '退出后本机将不再显示账号内的方案与关注（云端数据保留，重新登录即可恢复）。', '退出'))) return;
      try { await api('/auth/logout', { method: 'POST' }); } catch { }
      clearSession(); S.guest = false; LS.set('jc_guest', false); toast('已退出登录'); return go('#/login', true);
    }
    case 'clearCache': {
      if (!(await confirmDlg('清除缓存', '将清除本机缓存的赛事/开奖数据与离线资源（不会退出登录，也不会删除你的方案与关注）。', '清除'))) return;
      LS.del('jc_cache_matches'); LS.del('jc_cache_results'); LS.del('jc_cache_schedule');
      try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { }
      S.matches = S.schedule = S.results = null; S.liveScores = null; S.liveScoresAt = 0; await reloadData(true); render(); return toast('缓存已清除，数据已刷新');
    }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'mult') { S.mult = Math.max(1, Math.min(99, parseInt(e.target.value) || 1)); openPlanSheet(); }
  if (e.target.id === 'schHideFin') { setSchHideFinished(!!e.target.checked); render(); }
});

const PHONE_RE = /^1[3-9]\d{9}$/;
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 32 && /[A-Za-z]/.test(p) && /\d/.test(p) && !/\s/.test(p);
async function afterAuth(res, isNew) {
  setSession(res.token, res.user);
  // merge guest (local) plans/favorites into the account, then drop the local copies
  const lp = LS.get('jc_plans_local', []), lf = LS.get('jc_favs_local', []);
  try {
    const s = await api('/sync', { method: 'POST', body: { plans: lp, favorites: lf } });
    S.plans = s.plans; S.favs = s.favorites; LS.set('jc_plans_local', []); LS.set('jc_favs_local', []);
  } catch { S.plans = []; S.favs = []; }
  persistLists();
  try { S.membership = await api('/membership/status'); } catch { S.membership = null; }
  S.memberCatalog = null;
  toast(isNew ? '注册成功，欢迎你！' : `欢迎回来，${res.user.nickname}` + (lp.length || lf.length ? '（本机数据已同步）' : ''));
  go('#/me', true);
}
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  if (f.classList.contains('chat-compose')) {
    const matchId = f.dataset.match;
    const inp = f.querySelector('input[name="body"]');
    const body = (inp && inp.value || '').trim();
    if (!loggedIn()) { toast('请先登录后再发言'); return go('#/login'); }
    if (!body) return toast('请输入内容');
    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await sendChat(matchId, body);
      if (inp) inp.value = '';
    } catch (er) { toast(er.message || '发送失败'); }
    finally { if (btn) btn.disabled = false; if (inp) inp.focus(); }
    return;
  }

  if (f.id === 'fNewsSearch') {
    const q = String(new FormData(f).get('q') || '').trim();
    S.newsQ = q;
    document.title = (q ? ('体坛资讯 · ' + q) : '体坛资讯') + ' · 竞彩预测';
    return go(q ? '#/news?q=' + encodeURIComponent(q) : '#/news', true);
  }
  const v = Object.fromEntries(new FormData(f)); const err = f.querySelector('#err');
  const btn = f.querySelector('[type=submit]'); const fail = m => { err.textContent = m; btn.disabled = false; };
  err.textContent = ''; btn.disabled = true;
  try {
    if (f.id === 'fLogin') {
      if (!PHONE_RE.test(v.phone)) return fail('请输入正确的11位手机号');
      if (!v.password) return fail('请输入密码');
      const r = await api('/auth/login', { method: 'POST', body: { phone: v.phone, password: v.password } });
      LS.set('jc_last_phone', v.phone); return afterAuth(r, false);
    }
    if (f.id === 'fReg') {
      if (!PHONE_RE.test(v.phone)) return fail('请输入正确的11位手机号');
      if (!pwOk(v.password)) return fail('密码需8-32位，且同时包含字母和数字');
      if (v.password !== v.password2) return fail('两次输入的密码不一致');
      if (!v.agree) return fail('请先阅读并勾选同意《用户协议》和《隐私政策》');
      const r = await api('/auth/register', { method: 'POST', body: { phone: v.phone, password: v.password, nickname: v.nickname.trim() || undefined, agree: true } });
      LS.set('jc_last_phone', v.phone); return afterAuth(r, true);
    }
    if (f.id === 'fProfile') {
      const body = { nickname: v.nickname.trim() }; if (S.pendingAv) body.avatar = S.pendingAv;
      if (!body.nickname) return fail('昵称不能为空');
      const r = await api('/me', { method: 'PATCH', body }); S.user = r.user; LS.set('jc_user', r.user); S.pendingAv = null;
      toast('资料已保存'); return back();
    }
    if (f.id === 'fPwd') {
      if (!v.old) return fail('请输入原密码');
      if (!pwOk(v.pw)) return fail('新密码需8-32位，且同时包含字母和数字');
      if (v.pw !== v.pw2) return fail('两次输入的新密码不一致');
      await api('/me/password', { method: 'POST', body: { oldPassword: v.old, newPassword: v.pw } });
      toast('密码已修改'); return back();
    }
    if (f.id === 'fDel') {
      if (!v.pw) return fail('请输入登录密码');
      if (!v.ok) return fail('请勾选确认');
      if (!(await confirmDlg('最后确认', '账号及所有数据将被永久删除，确定注销吗？', '确认注销', true))) return fail('');
      await api('/me', { method: 'DELETE', body: { password: v.pw } });
      clearSession(); LS.set('jc_guest', false); S.guest = false; toast('账号已注销'); return go('#/login', true);
    }
  } catch (x) { fail(x.message); }
});

// ---------- pull to refresh (tab pages) ----------
(() => {
  const ptr = $('#ptr'); let y0 = null, dy = 0, busy = false;
  const txt = t => (ptr.querySelector('span').textContent = t);
  addEventListener('touchstart', e => { y0 = null; if (busy || window.scrollY > 0 || !TABS.includes(route().name) || !$('#sheet').classList.contains('hidden')) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0; if (dy <= 0) return;
    const d = Math.min(dy * 0.5, 90); ptr.style.transition = 'none'; ptr.style.transform = `translate(-50%, ${d - 50}px)`;
    ptr.querySelector('.ptr-spin').style.transform = `rotate(${dy * 2}deg)`; txt(d > 60 ? '释放立即刷新' : '下拉刷新');
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return; const d = Math.min(dy * 0.5, 90); y0 = null; ptr.style.transition = '';
    if (d <= 60) { ptr.style.transform = ''; return; }
    busy = true; ptr.classList.add('loading'); ptr.style.transform = 'translate(-50%, 14px)'; txt('正在刷新…');
    await Promise.all([reloadData(true), refreshAccount()]); render();
    txt('刷新完成'); setTimeout(() => { ptr.classList.remove('loading'); ptr.style.transform = ''; busy = false; }, 500);
  });
})();

// ======================= boot =======================
loadLocalLists();
if (!route().name || !location.hash || location.hash === '#') history.replaceState(null, '', (loggedIn() || S.guest) ? '#/home' : '#/login');
if (location.hash !== '#/home' && /^#\/(login|register)?$/.test(location.hash) === false) NAV.push('#/home');
NAV.push(location.hash || '#/home');
render();
reloadData().then(() => { render(); tickClock(); });
refreshAccount().then(() => { if (['me', 'plans', 'favs', 'profile', 'membership', 'orders', 'pay'].includes(route().name)) render(); });
loadMembershipCatalog();
setInterval(tickClock, 1000);
addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });
setInterval(() => {
  if (document.hidden) return;
  reloadData().then(() => {
    tickClock();
    if (!['login', 'register', 'profile', 'password', 'delete'].includes(route().name) && $('#sheet').classList.contains('hidden') && $('#dialog').classList.contains('hidden')) render();
  });
}, 3 * 60 * 1000);
if ('serviceWorker' in navigator && !IS_APP && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
