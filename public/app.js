
/** 1.9.108–1.9.129: 身价/赛程；1.9.129 开奖/详情软补丁防闪 + 深蓝包裹 */
function marketValueHtml(mv, { inline } = {}) {
  if (!mv) return '';
  const text = (mv.ok === false || !mv.text) ? (mv.text || '暂无身价') : mv.text;
  const empty = mv.ok === false || text === '暂无身价';
  if (inline) {
    return empty
      ? `<span class="mv-inline dim">身价 暂无</span>`
      : `<span class="mv-inline" title="${esc(mv.noteZh || '')}">身价 ${esc(text)}</span>`;
  }
  const asOf = mv.asOf ? ` · 截至约 ${esc(mv.asOf)}` : '';
  return `<div class="mv-row${empty ? ' dim' : ''}"><span class="mv-lab">身价</span><span class="mv-val">${esc(text)}</span><span class="mv-note">${empty ? '' : esc('参考市值' + (mv.asOf ? ' · ' + mv.asOf : ''))}</span></div>`;
}

// 竞彩预测 v1.9.87 用户端 (web/PWA + Android WebView). Match info & odds-based predictions.
// 资讯会员 mock 订阅已接入。「保存方案」仅为个人记录。
'use strict';
const $ = s => document.querySelector(s);
/** 1.9.80/1.9.81: neutralize vendor brands in UI strings (covers stale API caches).
 *  Never mutate crest/photo/logo URLs — CDN hostnames (espncdn/thesportsdb/sporttery) must stay intact. */
function scrubVendorLabelsClient(s) {
  if (s == null) return s;
  let t = String(s);
  // Whole-string or proxy URL — leave untouched (badge/logoProxy feed esc())
  if (/^https?:\/\//i.test(t) || /\/api\/logo\?/i.test(t) || /https?%3A%2F%2F/i.test(t)) return t;
  if (!/(?:API-Football|ESPN|DeepSeek|Opta|TheSportsDB|sporttery\.cn)/i.test(t)) return t;
  // Protect embedded URLs inside longer HTML/copy before brand replace
  const parked = [];
  const park = (m) => { parked.push(m); return '\0URL' + (parked.length - 1) + '\0'; };
  t = t.replace(/https?:\/\/[^\s"'<>\\]+/gi, park).replace(/\/api\/logo\?[^"'<\s\\]*/gi, park);
  t = t
    .replace(/API-Football/gi, '综合技术统计')
    .replace(/ESPN\s*公开赛程/g, '综合赛程')
    .replace(/ESPN赛程/g, '综合赛程')
    .replace(/来源 ESPN/g, '来源综合公开数据')
    .replace(/来自 ESPN/g, '来自公开资料')
    .replace(/ESPN/gi, '公开资料')
    .replace(/TheSportsDB/gi, '公开资料库')
    .replace(/DeepSeek/gi, 'AI')
    .replace(/Opta/gi, '技术统计')
    .replace(/sporttery\.cn/gi, '');
  t = t.replace(/\0URL(\d+)\0/g, (_, i) => parked[Number(i)] || '');
  return t;
}
const esc = s => String(scrubVendorLabelsClient(s) ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CFG = window.APP_CONFIG || { apiBase: '', platform: 'web', version: '' };
const API = String(CFG.apiBase || '').replace(/\/+$/, ''); // fixed at build time; '' = same origin
try { window.API = API; } catch (_) {}
const IS_PARTNER = String(CFG.channel || '') === 'partner-test';
const PARTNER_KEY = String(CFG.partnerKey || '');
function partnerHeaders() {
  if (!IS_PARTNER) return {};
  return {
    'X-App-Channel': 'partner-test',
    'X-Partner-Key': PARTNER_KEY,
    'X-App-Version': String(CFG.version || ''),
  };
}
function showPartnerGate(msg) {
  let el = document.getElementById('partnerGate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'partnerGate';
    el.className = 'partner-gate';
    document.body.appendChild(el);
  }
  const idHint = [CFG.version, CFG.buildId || '', (navigator.userAgent || '').slice(0, 40)].filter(Boolean).join(' · ');
  el.innerHTML = `<h1>测试已结束</h1><p>${esc(msg || '合作测试通道已关闭。如需继续试用请联系对接人。')}</p><div class="pg-id">${esc(idHint)}</div>`;
  el.style.display = 'flex';
  try { document.documentElement.style.overflow = 'hidden'; } catch (_) {}
}
function ensurePartnerWatermark() {
  if (!IS_PARTNER) return;
  let el = document.getElementById('partnerWm');
  if (!el) {
    el = document.createElement('div');
    el.id = 'partnerWm';
    el.className = 'partner-wm';
    document.body.appendChild(el);
  }
  el.textContent = '合作测试版 · ' + (CFG.buildId || CFG.version || '');
}
async function checkPartnerGate() {
  if (!IS_PARTNER) return true;
  try {
    const r = await fetch(API + '/api/client-gate', {
      headers: partnerHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.enabled === false) {
      window.__partnerKilled = true;
      showPartnerGate(j.messageZh || j.error || '测试已结束');
      return false;
    }
    return true;
  } catch (e) {
    // Soft-fail network: still show banner but allow offline cache briefly
    ensurePartnerWatermark();
    return true;
  }
}

const IS_APP = CFG.platform === 'android' || location.hostname === 'appassets.androidplatform.net';
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  del(k) { localStorage.removeItem(k); },
};
const DISCLAIMER = '';

function sanitizeBanCopy(text) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(/(?:[（(]?\s*(?:仍)?不出票[、,，]?\s*不代打\s*[）)]?|禁止投注(?:\/出票|出票)?|禁止下注(?:\/出票(?:\/购彩代下)?)?|购彩代下|本站不提供投注服务|不提供投注(?:\/出票)?服务?)/g, '');
  s = s.replace(/[（(]\s*[）)]/g, '').replace(/\s{2,}/g, ' ').trim();
  return s;
}


// ======================= home theme (luxury | pitch) =======================
const THEME_KEY = 'jc_home_theme';
const THEME_LABEL = { luxury: '轻奢数据感', pitch: '绿茵沉浸感' };
function homeTheme() {
  const t = LS.get(THEME_KEY, 'luxury');
  return t === 'pitch' ? 'pitch' : 'luxury';
}
function applyHomeTheme(t) {
  const theme = t === 'pitch' ? 'pitch' : 'luxury';
  try { document.documentElement.setAttribute('data-theme', theme); } catch (_) {}
  const app = document.getElementById('app');
  if (app) app.setAttribute('data-theme', theme);
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'pitch' ? '#0B1220' : '#1B2A4A');
  } catch (_) {}
}
function setHomeTheme(t) {
  const theme = t === 'pitch' ? 'pitch' : 'luxury';
  LS.set(THEME_KEY, theme);
  applyHomeTheme(theme);
}
applyHomeTheme(homeTheme());


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
  db: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>',
  lineChart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16M5 15l4.5-5 3.5 3L19 6"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12"/><circle cx="7.5" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
  column: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect class="fill" x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  ball: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle class="fill" cx="12" cy="12" r="8.2"/><path d="M12 3.8c1.6 1.8 2.5 4.3 2.5 8.2S13.6 18.4 12 20.2M12 3.8C10.4 5.6 9.5 8.1 9.5 12s.9 6.4 2.5 8.2M4.2 9.2h15.6M4.2 14.8h15.6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15.5 15.5 4.2 4.2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect class="fill" x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7.5 8 6 8-6"/></svg>',
  clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 7l10 10M17 7 7 17"/></svg>',
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
function avatarHtml(id, size = 'sm') {
  const k = AV[id] ? id : 'a1';
  const cls = size === 'lg' ? 'col-av lg' : size === 'md' ? 'col-av' : 'col-av sm';
  return `<span class="${cls}" aria-hidden="true">${avatarSvg(k)}</span>`;
}
try { window.avatarHtml = avatarHtml; } catch (_) {}

// ======================= prediction model (odds baseline + multi-factor briefing) =======================
const LBL = { had: { h: '胜', d: '平', a: '负' }, hhad: { h: '让胜', d: '让平', a: '让负' } };
/** 竞足试算倍数上限（对齐官方常见 99999，加减与手输均受此约束） */
const CALC_MULT_MAX = 99999;
function clampCalcMult(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(CALC_MULT_MAX, v);
}
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
  const lvl = conf >= 0.62 ? ['l1', '稳胆'] : conf >= 0.45 ? ['l2', '倾向'] : ['l3', '谨慎'];
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
  } else if (q) {
    out.push(`<p><b>胜平负</b>：未开售。</p>`);
  }
  if (q && m.hhad && (m.hhad.goalLine != null && m.hhad.goalLine !== '' || !p)) {
    const gl = Number(m.hhad.goalLine); const n = Math.abs(gl);
    const desc = Number.isFinite(gl) ? (gl < 0 ? `主队让 ${n} 球` : `主队受让 ${n} 球`) : '让球盘';
    const qk = order(q)[0];
    const gap = (q[qk] - q[order(q)[1]]) * 100;
    if (!p) {
      out.push(`<p><b>让球对照（${desc}）</b>：让胜 <b>${m.hhad.h.toFixed(2)}</b> / 让平 <b>${m.hhad.d.toFixed(2)}</b> / 让负 <b>${m.hhad.a.toFixed(2)}</b>。去水隐含：让胜 <b>${pct(q.h, 1)}</b>、让平 <b>${pct(q.d, 1)}</b>、让负 <b>${pct(q.a, 1)}</b>。市场倾向 <b>${LBL.hhad[qk]}</b>（领先约 ${gap.toFixed(0)} 个百分点）。</p>`);
    } else {
      out.push(`<p><b>让球盘（${desc}）</b>：倾向 ${LBL.hhad[qk]}（${pct(q[qk], 1)}）。</p>`);
    }
  }
  out.push(`<p class="concl"><b>赔率层结论</b>：${pr.text} · 信心 ${pct(pr.conf)}（${pr.lvl[1]}）。请以服务端综合简报为准。</p>`);
  out.push(``);
  return out;
}
function reasoning(m) {
  const rep = S.predictCache && S.predictCache[String(m.id)];
  if (predictReportFull(rep)) return [rep.html];
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
/** 1.9.213: compact score column (red status + spaced score + HT line). */
function formatScoreSpaced(full, homeScore, awayScore) {
  if (homeScore != null && awayScore != null && !Number.isNaN(Number(homeScore)) && !Number.isNaN(Number(awayScore))) {
    return `${homeScore} : ${awayScore}`;
  }
  if (!full) return '-';
  const parts = String(full).split(/[:：]/);
  if (parts.length >= 2) return `${String(parts[0]).trim()} : ${String(parts[1]).trim()}`;
  return String(full);
}
function matchCardMeta(m, { favSize = 14 } = {}) {
  const tail = [];
  if (m.sample) tail.push('<span class="sample-tag">示例</span>');
  if (isFav(m.id)) tail.push(`<span class="fav-on" style="width:${favSize}px;height:${favSize}px">${I.star}</span>`);
  return `<div class="match-meta"><span class="match-meta-l">${esc(m.league || '')} · ${esc(m.num || '')}</span><span class="match-meta-r">${esc(m.time || '--:--')}</span>${tail.join('')}</div>`;
}
function matchScoreColumn(row) {
  const kind = row._kind;
  let statusHtml = '';
  let scoreMain = '';
  let footHtml = '';
  if (kind === 'ft') {
    statusHtml = '<div class="match-st red">完场</div>';
    scoreMain = `<div class="score num">${esc(formatScoreSpaced(row._full, row._homeScore, row._awayScore))}</div>`;
    if (row._half) footHtml = `<div class="match-ht">上半场 ${esc(row._half)}</div>`;
  } else if (kind === 'live') {
    statusHtml = `<div class="match-st red">${scoreMinuteLab(row)}</div>`;
    scoreMain = row._homeScore != null
      ? `<div class="score num is-live">${esc(formatScoreSpaced(null, row._homeScore, row._awayScore))}</div>`
      : '<div class="vs">VS</div>';
    if (row._half) footHtml = `<div class="match-ht">上半场 ${esc(row._half)}</div>`;
  } else {
    scoreMain = '<div class="vs">VS</div>';
    const sub = row._phaseZh;
    if (sub && sub !== '未开赛' && sub !== 'Selling') footHtml = `<div class="match-ht">${esc(sub)}</div>`;
  }
  return `${statusHtml}${scoreMain}${footHtml}`;
}
function matchTeamsRow(m, row) {
  return `<div class="mc-teams"><div class="t h">${badge(m.home, 'sm', m.homeLogo)}<span class="n" title="${esc(m.home)}">${esc(m.home)}</span></div><div class="mc-mid">${matchScoreColumn(row)}</div><div class="t a"><span class="n" title="${esc(m.away)}">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div></div>`;
}
const kickoff = m => new Date(`${m.date}T${m.time || '00:00'}:00+08:00`).getTime();
const BADGE_COLORS = ['#e5484d', '#1a62f0', '#12a150', '#ff8a1f', '#7b4ce0', '#0aa5b8', '#c2185b', '#546e7a', '#d97706', '#0f766e'];
/* ── Tribe crest: APK-bundled assets + optional IndexedDB overlay · 1.9.202 ── */
const CREST_IDB_NAME = 'jc-crests-v1';
const CREST_IDB_STORE = 'blobs';
const BUNDLED_CREST_BASE = 'assets/crests/';
let _crestDbP = null;
const _crestMem = new Map();
const _crestInflight = new Map();
let _bundledCrestIds = null;
try {
  fetch(BUNDLED_CREST_BASE + 'manifest.json', { cache: 'force-cache' })
    .then((r) => (r && r.ok ? r.json() : null))
    .then((j) => {
      _bundledCrestIds = new Set(
        (j && Array.isArray(j.teamIds) ? j.teamIds : []).map((id) => String(id))
      );
      try {
        const rn = route().name;
        if (rn === 'data' || rn === 'tribe' || rn === 'tribe-club') render({ force: true });
      } catch (_) {}
    })
    .catch(() => { _bundledCrestIds = new Set(); });
} catch (_) { _bundledCrestIds = new Set(); }

/* ── Data-center player photos: APK-bundled assets (1.9.204+) ── */
const BUNDLED_PLAYER_BASE = 'assets/players/';
let _bundledPlayerIds = (CFG.bundledPlayerIds && Array.isArray(CFG.bundledPlayerIds))
  ? new Set(CFG.bundledPlayerIds.map((id) => String(id)))
  : null;
try {
  fetch(BUNDLED_PLAYER_BASE + 'manifest.json', { cache: 'force-cache' })
    .then((r) => (r && r.ok ? r.json() : null))
    .then((j) => {
      _bundledPlayerIds = new Set(
        (j && Array.isArray(j.playerIds) ? j.playerIds : []).map((id) => String(id))
      );
      try {
        const rn = route().name;
        if (rn === 'data') {
          if (!softPatchDataBody(dataLeagueOf(), dataKindOf())) render({ force: true });
        }
      } catch (_) {}
    })
    .catch(() => { if (_bundledPlayerIds === null) _bundledPlayerIds = new Set(); });
} catch (_) { if (_bundledPlayerIds === null) _bundledPlayerIds = new Set(); }

const VALUE_ESPN_BY_TM = (CFG.valueBoardEspnByTmId && typeof CFG.valueBoardEspnByTmId === 'object')
  ? CFG.valueBoardEspnByTmId
  : {
    '683840': '250465', '502670': '274745', '670681': '355061', '487469': '288897',
    '580195': '303821', '495666': '277385', '398073': '240233', '371998': '252107',
    '581678': '291281', '566723': '286831',
  };
function dcNormPlayerKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
let _dcLeaderEspnByClub = null;
let _dcLeaderEspnByName = null;
function rebuildDcLeaderEspnMaps() {
  const byClub = new Map();
  const byName = new Map();
  const sources = [];
  if (_bootPackSlices && typeof _bootPackSlices === 'object') sources.push(_bootPackSlices);
  try {
    if (S.dataCache && typeof S.dataCache === 'object') {
      for (const [k, v] of Object.entries(S.dataCache)) {
        if (v) sources.push({ [k]: v });
      }
    }
  } catch (_) {}
  for (const bag of sources) {
    for (const [key, slice] of Object.entries(bag)) {
      if (!slice || !slice.rows || !/:topscorers$|:topassists$|:playervalues$/.test(key)) continue;
      for (const r of slice.rows) {
        if (!r) continue;
        const pid = resolveDcPlayerEspnId(r, true);
        if (!pid) continue;
        const nn = dcNormPlayerKey(r.player);
        const tt = dcNormPlayerKey(r.team);
        if (nn && tt) byClub.set(nn + '|' + tt, pid);
        if (nn && !byName.has(nn)) byName.set(nn, pid);
      }
    }
  }
  _dcLeaderEspnByClub = byClub;
  _dcLeaderEspnByName = byName;
}
function resolveDcPlayerEspnId(row, skipLeaderLookup) {
  if (!row) return '';
  if (row.playerId != null && String(row.playerId) !== '') return String(row.playerId);
  const tm = row.tmId != null && String(row.tmId) !== '' ? String(row.tmId) : '';
  if (tm && VALUE_ESPN_BY_TM[tm]) return String(VALUE_ESPN_BY_TM[tm]);
  if (!skipLeaderLookup) {
    if (!_dcLeaderEspnByClub) rebuildDcLeaderEspnMaps();
    const nn = dcNormPlayerKey(row.player);
    const tt = dcNormPlayerKey(row.team);
    if (nn && tt && _dcLeaderEspnByClub.has(nn + '|' + tt)) return _dcLeaderEspnByClub.get(nn + '|' + tt);
    if (nn && _dcLeaderEspnByName && _dcLeaderEspnByName.has(nn)) return _dcLeaderEspnByName.get(nn);
  }
  const m = String(row.photo || row.photoAlt || '').match(/\/players\/(\d+)(?:\.|\/|$)/i);
  return m ? m[1] : '';
}
function playerIdForBundledPhoto(row) {
  return resolveDcPlayerEspnId(row);
}
function espnSoccerHeadshotUrl(espnId) {
  const id = espnId != null && String(espnId) !== '' ? String(espnId) : '';
  if (!id) return '';
  return 'https://a.espncdn.com/i/headshots/soccer/players/full/' + id + '.png';
}
function tmPortraitUrl(tmId) {
  const id = tmId != null && String(tmId) !== '' ? String(tmId) : '';
  if (!id) return '';
  return 'https://img.a.transfermarkt.technology/portrait/header/' + id + '.jpg';
}
/** API-Football CDN placeholder when URL uses ESPN athlete id (not AF player id). */
function isAfEspnIdPhotoUrl(url, espnPlayerId) {
  if (!url || espnPlayerId == null || String(espnPlayerId) === '') return false;
  const m = String(url).match(/media\.api-sports\.io\/football\/players\/(\d+)\./i);
  return m && m[1] === String(espnPlayerId);
}
function pickDcNetworkPhoto(row) {
  if (!row) return '';
  const pid = playerIdForBundledPhoto(row);
  const alt = row.photoAlt && !isAfEspnIdPhotoUrl(row.photoAlt, pid) ? row.photoAlt : '';
  const main = row.photo && !isAfEspnIdPhotoUrl(row.photo, pid) ? row.photo : '';
  return main || alt || '';
}
function bundledPlayerPath(playerId) {
  const pid = playerId != null && String(playerId) !== '' ? String(playerId) : '';
  if (!pid) return '';
  if (_bundledPlayerIds !== null) {
    return _bundledPlayerIds.has(pid) ? BUNDLED_PLAYER_BASE + pid + '.png' : '';
  }
  if (IS_APP) return BUNDLED_PLAYER_BASE + pid + '.png';
  return '';
}
function dcPlayerPhotoSrc(row) {
  const pid = playerIdForBundledPhoto(row);
  const bundled = bundledPlayerPath(pid);
  if (bundled) return bundled;
  const net = pickDcNetworkPhoto(row);
  if (net) {
    if (/^https?:\/\//i.test(net) && IS_APP && /media\.api-sports\.io\/football\/players\/\d+/i.test(net)) {
      return net;
    }
    return API + '/api/logo?url=' + encodeURIComponent(net);
  }
  const espn = pid ? espnSoccerHeadshotUrl(pid) : '';
  if (espn) return API + '/api/logo?url=' + encodeURIComponent(espn);
  const tm = row && row.tmId != null && String(row.tmId) !== '' ? tmPortraitUrl(row.tmId) : '';
  if (tm) return API + '/api/logo?url=' + encodeURIComponent(tm);
  return '';
}
function dcAvatarImgError(img) {
  try {
    const p = img && img.parentNode;
    if (!p || p.dataset.fell) return;
    const fb = p.dataset.alt;
    const pid = p.dataset.pid || '';
    const tmid = p.dataset.tmid || '';
    if (fb && !img.dataset.retriedAlt) {
      img.dataset.retriedAlt = '1';
      img.src = API + '/api/logo?url=' + encodeURIComponent(fb);
      return;
    }
    if (pid && !img.dataset.retriedEspn) {
      img.dataset.retriedEspn = '1';
      img.src = API + '/api/logo?url=' + encodeURIComponent(espnSoccerHeadshotUrl(pid));
      return;
    }
    if (tmid && !img.dataset.retriedTm) {
      img.dataset.retriedTm = '1';
      img.src = API + '/api/logo?url=' + encodeURIComponent(tmPortraitUrl(tmid));
      return;
    }
    p.dataset.fell = '1';
    p.classList.add('letter');
    p.textContent = p.dataset.letter || '?';
    img.remove();
  } catch (_) {}
}

function bundledCrestPath(teamId) {
  const tid = teamId != null && String(teamId) !== '' ? String(teamId) : '';
  if (!tid) return '';
  // 1.9.203: before manifest loads, do not guess bundled path (avoids 404 → blank/hung remote)
  if (_bundledCrestIds === null) return '';
  if (_bundledCrestIds.has(tid)) return BUNDLED_CREST_BASE + tid + '.png';
  return '';
}

function crestCacheKey(logo, teamId) {
  const tid = teamId != null && String(teamId) !== '' ? String(teamId) : '';
  if (tid) return 'tid:' + tid;
  return 'url:' + String(logo || '');
}

function openCrestDb() {
  if (_crestDbP) return _crestDbP;
  if (typeof indexedDB === 'undefined') {
    _crestDbP = Promise.resolve(null);
    return _crestDbP;
  }
  _crestDbP = new Promise((resolve) => {
    try {
      const req = indexedDB.open(CREST_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CREST_IDB_STORE)) db.createObjectStore(CREST_IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
  return _crestDbP;
}

function crestIdbGet(key) {
  return openCrestDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const tx = db.transaction(CREST_IDB_STORE, 'readonly');
      const r = tx.objectStore(CREST_IDB_STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  }));
}

function crestIdbPut(key, blob) {
  return openCrestDb().then((db) => new Promise((resolve) => {
    if (!db || !blob) return resolve(false);
    try {
      const tx = db.transaction(CREST_IDB_STORE, 'readwrite');
      tx.objectStore(CREST_IDB_STORE).put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_) { resolve(false); }
  }));
}

function crestIdbClear() {
  return openCrestDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction(CREST_IDB_STORE, 'readwrite');
      tx.objectStore(CREST_IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (_) { resolve(); }
  })).then(() => {
    for (const u of _crestMem.values()) {
      try { URL.revokeObjectURL(u); } catch (_) {}
    }
    _crestMem.clear();
  });
}

function crestRemember(key, blob) {
  if (!key || !blob) return '';
  const prev = _crestMem.get(key);
  if (prev) {
    try { URL.revokeObjectURL(prev); } catch (_) {}
  }
  const u = URL.createObjectURL(blob);
  _crestMem.set(key, u);
  return u;
}

async function crestCacheFromRemote(logo, teamId) {
  const key = crestCacheKey(logo, teamId);
  if (!logo || !key) return null;
  if (_crestMem.has(key)) return _crestMem.get(key);
  if (_crestInflight.has(key)) return _crestInflight.get(key);
  const job = (async () => {
    try {
      const hit = await crestIdbGet(key);
      if (hit instanceof Blob && hit.size > 0) return crestRemember(key, hit);
      const url = API + '/api/logo?url=' + encodeURIComponent(logo);
      const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
      if (!res || !res.ok) return null;
      const blob = await res.blob();
      if (!blob || !blob.size) return null;
      try { await crestIdbPut(key, blob); } catch (_) {}
      return crestRemember(key, blob);
    } catch (_) { return null; }
  })();
  _crestInflight.set(key, job);
  try { return await job; } finally { _crestInflight.delete(key); }
}

async function warmCrestCacheForTeams(teams) {
  try {
    if (!Array.isArray(teams) || !teams.length) return;
    const slice = teams.filter((t) => t && t.logo).slice(0, 120);
    await Promise.all(slice.map(async (t) => {
      const key = crestCacheKey(t.logo, t.teamId);
      if (!key || _crestMem.has(key)) return;
      try {
        const blob = await crestIdbGet(key);
        if (blob instanceof Blob && blob.size > 0) crestRemember(key, blob);
      } catch (_) {}
    }));
  } catch (_) {}
}

function hydrateTribeCrests(root) {
  // 1.9.202: never block paint — bundled src is already in DOM; IDB/remote overlay in background only
  try {
    const scope = root || document;
    const nodes = scope.querySelectorAll('.badge.crest[data-crest-key]');
    const jobs = [];
    nodes.forEach((wrap) => {
      const img = wrap.querySelector('img');
      if (!img) return;
      const key = wrap.getAttribute('data-crest-key') || '';
      const logo = wrap.getAttribute('data-crest-logo') || '';
      const tid = wrap.getAttribute('data-team-id') || '';
      if (!key || !logo) return;
      const bundled = bundledCrestPath(tid);
      const srcNow = img.getAttribute('src') || '';
      const onBundled = bundled && srcNow === bundled;
      if (onBundled && img.complete && img.naturalWidth > 0) return;
      if (onBundled && !img.dataset.triedFb && !(img.complete && img.naturalWidth === 0)) return;
      jobs.push((async () => {
        try {
          let local = _crestMem.get(key);
          if (!local) {
            const blob = await crestIdbGet(key);
            if (blob instanceof Blob && blob.size > 0) local = crestRemember(key, blob);
          }
          if (local && img.getAttribute('src') !== local) img.setAttribute('src', local);
          else if (!onBundled && !bundled) {
            const saved = await crestCacheFromRemote(logo, tid);
            if (saved && img.getAttribute('src') !== saved) img.setAttribute('src', saved);
          } else if (onBundled && img.dataset.triedFb) {
            const saved = await crestCacheFromRemote(logo, tid);
            if (saved && img.getAttribute('src') !== saved) img.setAttribute('src', saved);
          }
        } catch (_) {}
      })());
    });
    if (jobs.length) Promise.all(jobs).catch(() => {});
  } catch (_) {}
}

function badge(name, cls = '', logo, opts) {
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const c1 = BADGE_COLORS[h % BADGE_COLORS.length];
  const letter = esc([...String(name)][0] || '?');
  const bg = `linear-gradient(145deg,${c1}cc,${c1})`;
  if (!logo) return `<span class="badge ${cls}" style="background:${bg}">${letter}</span>`;
  const tid = opts && opts.teamId != null && opts.teamId !== '' ? String(opts.teamId) : '';
  const ckey = crestCacheKey(logo, tid);
  const apiUrl = API + '/api/logo?url=' + encodeURIComponent(logo);
  const bundled = bundledCrestPath(tid);
  // 1.9.202: APK-bundled crest first (zero network), then mem/IDB blob, then /api/logo
  let srcUrl = bundled || (_crestMem.has(ckey) ? _crestMem.get(ckey) : apiUrl);
  const src = esc(srcUrl);
  const fbAttr = bundled && srcUrl === bundled ? ` data-fb="${esc(apiUrl)}"` : '';
  // Intrinsic 160≈3–4× of 40–42 CSS px crests; sources TSDB 512 / ESPN 500 (1.9.91 sharper).
  // Broken or missing crest (404) falls back to the letter badge. Do not invent a logo.
  // 1.9.200: tribe hub uses eager — Capacitor first-paint + loading=lazy left empty crest discs.
  const lazyAttr = (opts && opts.eager) ? '' : ' loading="lazy"';
  const dataAttrs = ` data-crest-key="${esc(ckey)}" data-crest-logo="${esc(logo)}"${tid ? ` data-team-id="${esc(tid)}"` : ''}`;
  const onerr = "var img=this,p=img.parentNode;if(!p)return;var fb=img.getAttribute('data-fb');if(fb&&!img.dataset.triedFb){img.dataset.triedFb=1;img.src=fb;return;}if(p.dataset.fell)return;p.dataset.fell=1;p.className='badge letter " + cls + "';p.style.background='" + bg + "';p.textContent=p.dataset.letter||'';img.remove()";
  return `<span class="badge crest ${cls}" data-letter="${letter}"${dataAttrs}><img alt="" width="160" height="160" decoding="async"${lazyAttr}${fbAttr} src="${src}" onerror="${onerr}"></span>`;
}
const shortRk = s => (String(s || '').length <= 5 ? esc(s) : ''); // long group ranks like [亚运男足1] only shown on the detail page
const lgTag = m => homeTheme() === 'pitch'
  ? `<span class="tag tag-muted">${esc(m.league)}</span>`
  : `<span class="tag" style="background:${esc(m.leagueColor || '#2F6FED')}">${esc(m.league)}</span>`;
function toast(t, ms = 1800) { const el = $('#toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms); }
try { window.toast = toast; } catch (_) {}
function confirmDlg(title, body, okText = '确定', danger = false) {
  return new Promise(res => {
    const d = $('#dialog'); d.classList.remove('hidden');
    d.innerHTML = `<div class="dialog"><div class="dt">${esc(title)}</div><div class="db">${body}</div><div class="da"><button data-r="0">取消</button><button data-r="1" class="ok ${danger ? 'danger' : ''}">${esc(okText)}</button></div></div>`;
    d.onclick = e => { const b = e.target.closest('[data-r]'); if (!b && e.target !== d) return; e.stopPropagation(); d.classList.add('hidden'); d.onclick = null; res(b ? b.dataset.r === '1' : false); };
  });
}
try { window.confirmDlg = confirmDlg; } catch (_) {}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ======================= API =======================
class ApiError extends Error { constructor(msg, status, extra) { super(msg); this.status = status; if (extra && typeof extra === 'object') Object.assign(this, extra); } }
async function api(path, { method = 'GET', body, timeout = 12000, headers: extraHeaders, signal: outerSignal } = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
  if (outerSignal) {
    if (outerSignal.aborted) { clearTimeout(t); throw new ApiError('网络超时，请稍后重试', 0); }
    outerSignal.addEventListener('abort', () => { try { ctrl.abort(); } catch (_) {} }, { once: true });
  }
  const headers = Object.assign({}, partnerHeaders(), extraHeaders || {}); if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  if (S.playerDbKey && String(path || '').startsWith('/player-db')) headers['X-Player-Db-Key'] = S.playerDbKey;
  let r;
  try { r = await fetch(API + '/api' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store' }); }
  catch (e) { throw new ApiError(e.name === 'AbortError' ? '网络超时，请稍后重试' : '网络连接失败，请检查网络', 0); }
  finally { clearTimeout(t); }
  let j = null; try { j = await r.json(); } catch { }
  if (!r.ok) {
    if (r.status === 401 && S.token && !path.startsWith('/auth/')) sessionExpired();
    if (IS_PARTNER && r.status === 403 && j && (j.reason === 'partner_disabled' || j.reason === 'partner_key' || j.reason === 'bad_key' || j.enabled === false)) {
      window.__partnerKilled = true;
      showPartnerGate(j.messageZh || j.error || '测试已结束');
    }
    throw new ApiError((j && j.error) || '请求失败（HTTP ' + r.status + '）', r.status, j || {});
  }
  return j;
}

// ======================= state =======================
function initDataSectionEarly() {
  try {
    if (typeof localStorage === 'undefined') return 'team';
    const saved = localStorage.getItem('jc_data_section');
    if (saved === 'team' || saved === 'star') return saved;
    const kind = localStorage.getItem('jc_data_kind') || 'standings';
    if (kind === 'topscorers' || kind === 'topassists' || kind === 'topkeepers' || kind === 'playervalues') return 'star';
    return 'team';
  } catch { return 'team'; }
}
const S = {
  token: LS.get('jc_token', null), user: LS.get('jc_user', null), guest: LS.get('jc_guest', false),
  matches: null, schedule: null, results: null, msrc: null, ssrc: null, rsrc: null,
  plans: [], favs: [], tribeFollows: [], userFollows: [],
  tribeCat: null, tribeCatBusy: false, tribeSide: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_tribe_side')) || '__hot__',
  tribeSub: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_tribe_sub')) || 'enter',
  tribeSearchQ: '',
  sel: {}, types: [], mult: 1, navDepth: 0,
  schDate: null, schLeague: '全部', schMode: initSchMode(), schChannel: initSchChannel(),
  calcSel: {}, calcTypes: [], calcMult: 1,
  bonusOpt: { mode: 'avg', amount: 0, mults: [] },
  schHideFinished: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_sch_hide_fin') === '1'),
  liveScores: null, liveScoresAt: 0, liveScorePoll: null, liveScoresLoading: false,
  favGoalPoll: null, goalAlertSeen: {}, goalAlertWatching: {},
  rsDate: null, rsLeague: '全部', prFilter: '全部', prLane: 'hub', dataLeague: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_data_lg')) || 'epl', dataKind: (typeof localStorage !== 'undefined' && localStorage.getItem('jc_data_kind')) || 'standings', dataSection: initDataSectionEarly(), bannerIdx: 0, pendingAv: null,
  detailTab: {}, voteCache: {}, statsCache: {}, statsUi: {}, liveStatsCache: {}, livePoll: null, predictCache: {}, reviewCache: {}, reviewListCache: null, usefulness: null, leanByMatch: {},
  chatCache: {}, chatPoll: null, chatEs: null, aiChatCache: {}, pitchAnimSeen: {},
  membership: null, orders: null, payUi: { planId: 'quarter', channel: 'wechat', agree: false, phase: 'form', orderId: null, err: '' },
  playerDbKey: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('jc_player_db_key')) || null,
  playerDbCache: { overview: null, recent: null, outcomes: null, search: null, match: {}, player: {} },
  columnFeed: { attitude: null, interact: null }, columnAuthors: null, columnMe: null, columnTab: 'attitude', columnSearch: '',
  homeMidTab: 'attitude', homeHotLoaded: false, homeHotPosts: null, homeFocusIdx: 0, homeFocusRotateIv: null, homeLiveScorePoll: null,
  columnCompose: { kind: 'match', topic: '分析', matchId: '', matchLabel: '', title: '', body: '', pick: '' },
  columnAuthorCache: {}, columnPostCache: {},
  meBackToDrawer: false,
  searchQ: '', searchTab: 'all', searchCache: null,
  kb: { packs: null, picker: null, packItems: null, packId: null, selected: {}, intervention: 'medium', lastResult: null, loading: false, packsError: '', packItemsError: '' },
};
globalThis.S = S;
const loggedIn = () => !!S.token;
function loadLocalLists() {
  if (loggedIn()) {
    const c = LS.get('jc_acct_cache', {});
    S.plans = c.plans || []; S.favs = c.favs || []; S.tribeFollows = c.tribeFollows || [];
  } else {
    S.plans = LS.get('jc_plans_local', []); S.favs = LS.get('jc_favs_local', []);
    S.tribeFollows = LS.get('jc_tribe_follows_local', []);
  }
}
function persistLists() {
  if (loggedIn()) LS.set('jc_acct_cache', { plans: S.plans, favs: S.favs, tribeFollows: S.tribeFollows });
  else {
    LS.set('jc_plans_local', S.plans); LS.set('jc_favs_local', S.favs);
    LS.set('jc_tribe_follows_local', S.tribeFollows);
  }
}
function loadGoalAlertSeen() {
  const raw = LS.get('jc_goal_alert_seen', {});
  S.goalAlertSeen = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}
function persistGoalAlertSeen() {
  const seen = S.goalAlertSeen || {};
  const keys = Object.keys(seen);
  if (keys.length > 80) {
    keys.slice(0, keys.length - 80).forEach(k => { delete seen[k]; });
  }
  LS.set('jc_goal_alert_seen', seen);
}
function setSession(token, user) {
  S.token = token; S.user = user; LS.set('jc_token', token); LS.set('jc_user', user); LS.set('jc_guest', false); S.guest = false;
}
function clearSession() {
  S.token = null; S.user = null; S.membership = null; S.orders = null;
  S.userFollows = []; S.userFollowIds = null; S.friendsListCache = null;
  S.kb = { packs: null, picker: null, packItems: null, packId: null, selected: {}, intervention: 'medium', lastResult: null, loading: false, packsError: '', packItemsError: '' };
  LS.del('jc_token'); LS.del('jc_user'); LS.del('jc_acct_cache'); LS.del(KB_PACKS_CACHE_KEY); loadLocalLists();
}
function applyUserFollowList(users) {
  S.userFollows = Array.isArray(users) ? users : [];
  S.userFollowIds = new Set(S.userFollows.map(u => String(u.userId)));
}
const isUserFollow = uid => !!(uid && S.userFollowIds && S.userFollowIds.has(String(uid)));
function patchUserFollowButtons(uid) {
  const on = isUserFollow(uid);
  document.querySelectorAll('[data-act="userFollow"]').forEach((btn) => {
    if (String(btn.dataset.uid) !== String(uid)) return;
    if (btn.classList.contains('tf-post-follow') || btn.classList.contains('tf-follow')) {
      btn.classList.toggle('on', on);
      if (btn.classList.contains('tf-post-follow')) btn.textContent = on ? '已关注' : '+ 关注';
      else btn.textContent = on ? '已关注' : '关注';
    }
  });
}
async function toggleUserFollow(userId, opts = {}) {
  if (!loggedIn()) { toast('登录后可关注'); return go('#/login'); }
  const uid = String(userId || '');
  if (!uid || (S.user && String(S.user.id) === uid)) return;
  const on = isUserFollow(uid);
  if (!S.userFollowIds) S.userFollowIds = new Set();
  const prev = new Set(S.userFollowIds);
  if (on) S.userFollowIds.delete(uid);
  else S.userFollowIds.add(uid);
  patchUserFollowButtons(uid);
  try {
    if (on) await api('/user-follows/' + encodeURIComponent(uid), { method: 'DELETE' });
    else await api('/user-follows/' + encodeURIComponent(uid), { method: 'PUT' });
    if (!on) {
      const u = (S.friendsListCache && S.friendsListCache.following || []).find(x => String(x.userId) === uid);
      if (!u) {
        S.userFollows = [{ userId: +uid, nickname: '球迷', avatar: 'a1' }, ...S.userFollows];
      }
    } else {
      S.userFollows = S.userFollows.filter(x => String(x.userId) !== uid);
    }
    S.friendsListCache = null;
    toast(on ? '已取消关注' : '已关注');
    if (opts.refreshDetail && typeof JCTribeFeed !== 'undefined') JCTribeFeed.loadPostDetail(opts.refreshDetail);
    if (route().name === 'friends') loadFriendsList();
    if (meDrawerOpen()) syncMeDrawer();
  } catch (e) {
    S.userFollowIds = prev;
    patchUserFollowButtons(uid);
    toast(e.message || '操作失败');
  }
}
try { window.isUserFollow = isUserFollow; window.toggleUserFollow = toggleUserFollow; } catch (_) {}
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
    if (c) j = { ...c, fromCache: true };
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
    if (j && j.ok !== false) {
      S.usefulness = j;
      if (j.byMatch && typeof j.byMatch === 'object') {
        S.leanByMatch = Object.assign({}, S.leanByMatch || {}, j.byMatch);
      }
    }
  } catch { /* optional */ }
}
/** Merge one match's leanFeedback into S.leanByMatch (amplify only; never invent). */
function rememberLeanFeedback(matchId, fb) {
  if (!matchId || !fb || !fb.available) return;
  if (fb.speakMode !== 'amplify') return;
  if (!fb.lean && fb.amplifyHit == null && fb.leanHit == null) return;
  S.leanByMatch = S.leanByMatch || {};
  S.leanByMatch[String(matchId)] = {
    speakMode: 'amplify',
    lean: fb.lean || null,
    marketLean: fb.marketLean != null ? fb.marketLean : null,
    leanHit: fb.leanHit != null ? fb.leanHit : fb.amplifyHit,
    marketHit: fb.marketHit != null ? fb.marketHit : null,
    amplifyHit: fb.amplifyHit != null ? fb.amplifyHit : fb.leanHit,
    pickText: fb.pickText || null,
  };
}
const reloadData = force => Promise.all([loadData('matches', force), loadData('schedule', force), loadData('results', force), loadBaseline(), loadUsefulness()]);

/** 1.9.124: sync-hydrate matches/schedule/results (+ data center) from LS before first paint */
function hydrateFromCache() {
  try {
    for (const kind of ['matches', 'schedule', 'results']) {
      const c = LS.get('jc_cache_' + kind, null);
      if (!c || !Array.isArray(c.data) || !c.data.length) continue;
      if (kind === 'matches' && !S.matches) { S.matches = c.data; S.msrc = Object.assign({}, c, { fromCache: true }); }
      else if (kind === 'schedule' && !S.schedule) { S.schedule = c.data; S.ssrc = Object.assign({}, c, { fromCache: true }); }
      else if (kind === 'results' && !S.results) { S.results = c.data; S.rsrc = Object.assign({}, c, { fromCache: true }); }
    }
    const dc = LS.get('jc_data_cache_v1', null);
    if (dc && typeof dc === 'object') {
      S.dataCache = S.dataCache || {};
      for (const [k, v] of Object.entries(dc)) {
        if (v && v.ok !== false && !S.dataCache[k]) S.dataCache[k] = Object.assign({}, v, { fromCache: true });
      }
    }
    hydrateDataTabPrefsFromSnap();
  } catch (_) {}
}

/** 1.9.125: persist last complete home DOM + slim predict cache (survives process death; TAB_KEEP does not). */
const HOME_SNAP_KEY = 'jc_home_snap_v1';
const PRED_CACHE_KEY = 'jc_pred_cache_v1';
const DATA_TAB_SNAP_KEY = 'jc_data_snap_v1';
const HOME_ATT_CACHE_KEY = 'jc_home_att_v3';
const KB_PACKS_CACHE_KEY = 'jc_kb_packs_v1';
const KB_ITEM_BODY_CACHE_KEY = 'jc_kb_item_body_v1';
/** Must match lib/home-snap-guard.js HOME_SNAP_VER (invalidates legacy offline-bar snaps). */
const HOME_SNAP_VER = 2;
const HOME_SNAP_MAX_AGE = 12 * 3600e3;
const HOME_ATT_CACHE_MAX_AGE = 6 * 3600e3;
const KB_PACKS_CACHE_MAX_AGE = 30 * 24 * 3600e3;
const HOME_SNAP_MAX_LEN = 480000;
const DATA_TAB_SNAP_MAX_AGE = 7 * 24 * 3600e3;
const DATA_TAB_SNAP_MAX_LEN = 380000;

/** Full brief has html; slim LS hydrate only has predict for list speakMode (1.9.127). */
function predictReportFull(j) {
  return !!(j && j.ok && j.html);
}
function hydratePredictCache() {
  try {
    const c = LS.get(PRED_CACHE_KEY, null);
    if (!c || !c.data || typeof c.data !== 'object') return;
    if (Date.now() - (c.at || 0) > HOME_SNAP_MAX_AGE) return;
    S.predictCache = S.predictCache || {};
    for (const [id, j] of Object.entries(c.data)) {
      // Mark slim so loadPredictReport still fetches html for 预测 tab
      if (j && j.ok && j.predict && !S.predictCache[id]) {
        S.predictCache[id] = Object.assign({ _slim: true }, j);
      }
    }
  } catch (_) {}
}
function persistPredictCache() {
  try {
    const pc = S.predictCache || {};
    const out = {};
    let n = 0;
    for (const id of Object.keys(pc)) {
      const j = pc[id];
      if (!j || !j.ok || !j.predict) continue;
      out[id] = { ok: true, predict: j.predict, summary: j.summary || '', engineRev: j.engineRev || 0 };
      if (++n >= 48) break;
    }
    if (n) LS.set(PRED_CACHE_KEY, { at: Date.now(), data: out });
  } catch (_) {}
}
function homeSnapPersistBlocked(html) {
  if (!html || html.indexOf('home-hero') < 0) return true;
  if (html.indexOf('focus-card skel') >= 0 || html.indexOf('focus-bar skel') >= 0) return true;
  if (html.indexOf('sk-line') >= 0 && html.indexOf('hc-item') < 0) return true;
  if (html.indexOf('ha-skel') >= 0) return true;
  if (html.indexOf('网络不可用') >= 0) return true;
  const att = homeSnapAttitudeFeedChunk(html);
  if (att && att.indexOf('ha-card') >= 0 && !homeAttitudeFeedHtmlValid(att)) return true;
  return false;
}
function homeSnapAttitudeFeedChunk(html) {
  if (!html || html.indexOf('homeAttitudeFeed') < 0) return '';
  const feedIdx = html.indexOf('id="homeAttitudeFeed"');
  const openEnd = html.indexOf('>', feedIdx);
  const hotIdx = html.indexOf('id="homeHotWrap"', openEnd);
  if (openEnd < 0 || hotIdx < 0) return '';
  return html.slice(openEnd + 1, hotIdx);
}
function rejectHomeSnapRecord(s) {
  if (!s || !s.html || s.html.length < 200) return true;
  if ((s.ver || 0) < HOME_SNAP_VER) return true;
  if (s.html.indexOf('网络不可用') >= 0) return true;
  if (s.html.indexOf('ha-skel') >= 0) return true;
  const att = homeSnapAttitudeFeedChunk(s.html);
  if (att && att.indexOf('ha-card') >= 0 && !homeAttitudeFeedHtmlValid(att)) return true;
  return false;
}
function stripLegacyHomeSnapWarn(html) {
  if (!html || html.indexOf('网络不可用') < 0) return html;
  return html.replace(/<div class="warn-bar">[^<]*网络不可用[\s\S]*?<\/div>/gi, '');
}
function persistHomeSnap(viewEl) {
  try {
    if (!viewEl || route().name !== 'home') return;
    let html = viewEl.innerHTML;
    if (!html || html.length < 200 || html.length > HOME_SNAP_MAX_LEN) return;
    if (homeSnapPersistBlocked(html)) return;
    LS.set(HOME_SNAP_KEY, {
      html, y: window.scrollY || 0, sig: tabContentSig('home'),
      theme: homeTheme(), at: Date.now(), ver: HOME_SNAP_VER
    });
  } catch (_) {}
}
function readHomeSnap() {
  try {
    const s = LS.get(HOME_SNAP_KEY, null);
    if (rejectHomeSnapRecord(s)) return null;
    if (Date.now() - (s.at || 0) > HOME_SNAP_MAX_AGE) return null;
    if (s.theme && s.theme !== homeTheme()) return null;
    s.html = stripLegacyHomeSnapWarn(s.html);
    return s;
  } catch (_) { return null; }
}
/** Each persisted 平台简报 card must ship header + teaser (not just match-bar/footer). */
function homeAttitudeFeedHtmlValid(html) {
  if (!html || html.length < 40 || html.indexOf('ha-skel') >= 0) return false;
  const nCard = (html.match(/\bha-card\b/g) || []).length;
  if (!nCard) return false;
  const nHd = (html.match(/\bha-hd\b/g) || []).length;
  const nName = (html.match(/\bha-name\b/g) || []).length;
  const nTeaser = (html.match(/\bha-teaser\b/g) || []).length;
  return nHd >= nCard && nName >= nCard && nTeaser >= nCard;
}
function homeAttitudeFeedDomValid(feedEl) {
  if (!feedEl) return false;
  const cards = feedEl.querySelectorAll('.ha-card:not(.ha-skel)');
  if (!cards.length) return false;
  for (const card of cards) {
    const hd = card.querySelector('.ha-hd');
    const name = card.querySelector('.ha-name');
    const teaser = card.querySelector('.ha-teaser');
    if (!hd || !name || !teaser) return false;
    if (!(name.textContent || '').trim()) return false;
    if (!(teaser.textContent || '').trim()) return false;
  }
  return true;
}
/** Layout/paint suspect: header exists but has no measurable box (WebView layer drop). */
function homeAttitudeFeedPaintSuspect(feedEl) {
  if (!feedEl || !feedEl.isConnected) return false;
  try {
    const cards = feedEl.querySelectorAll('.ha-card:not(.ha-skel)');
    for (const card of cards) {
      const hd = card.querySelector('.ha-hd');
      const name = card.querySelector('.ha-name');
      if (!hd || !name) return true;
      const hr = hd.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      if (hr.height < 8 || nr.height < 4 || nr.width < 8) return true;
      const cs = window.getComputedStyle(name);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
    }
  } catch (_) { return false; }
  return false;
}
function discardHomeAttitudeCaches() {
  try { LS.del(HOME_ATT_CACHE_KEY); } catch (_) {}
  try {
    const s = LS.get(HOME_SNAP_KEY, null);
    if (s && s.html && String(s.html).indexOf('homeAttitudeFeed') >= 0) LS.del(HOME_SNAP_KEY);
  } catch (_) {}
}
function readHomeAttitudeCacheHtml() {
  try {
    const c = LS.get(HOME_ATT_CACHE_KEY, null);
    if (!c || !c.html || c.html.length < 40) return null;
    if (Date.now() - (c.at || 0) > HOME_ATT_CACHE_MAX_AGE) return null;
    if (!homeAttitudeFeedHtmlValid(c.html)) {
      try { LS.del(HOME_ATT_CACHE_KEY); } catch (_) {}
      return null;
    }
    return c.html;
  } catch (_) { return null; }
}
function persistHomeAttitudeCache(html) {
  try {
    if (!homeAttitudeFeedHtmlValid(html)) return;
    LS.set(HOME_ATT_CACHE_KEY, { html, at: Date.now() });
  } catch (_) {}
}
function kbCacheUserKey() {
  const u = S.user && S.user.id;
  return u != null ? String(u) : '';
}
function hydrateKbPacksCache() {
  if (!loggedIn()) return;
  const uid = kbCacheUserKey();
  if (!uid) return;
  try {
    const c = LS.get(KB_PACKS_CACHE_KEY, null);
    if (!c || String(c.userId) !== uid || !Array.isArray(c.packs)) return;
    if (Date.now() - (c.at || 0) > KB_PACKS_CACHE_MAX_AGE) return;
    S.kb = S.kb || {};
    if (S.kb.packs == null) S.kb.packs = c.packs;
  } catch (_) {}
}
function persistKbPacksCache(packs) {
  if (!loggedIn() || !Array.isArray(packs)) return;
  const uid = kbCacheUserKey();
  if (!uid) return;
  try { LS.set(KB_PACKS_CACHE_KEY, { userId: uid, packs, at: Date.now() }); } catch (_) {}
}
function readKbItemBodyCache(itemId, updatedAt) {
  const uid = kbCacheUserKey();
  if (!uid || itemId == null) return null;
  try {
    const all = LS.get(KB_ITEM_BODY_CACHE_KEY, {}) || {};
    const row = all[String(itemId)];
    if (!row || String(row.userId) !== uid) return null;
    if (updatedAt != null && row.updatedAt != null && row.updatedAt !== updatedAt) return null;
    return row.body != null ? String(row.body) : null;
  } catch (_) { return null; }
}
function persistKbItemBodyCache(itemId, body, updatedAt) {
  const uid = kbCacheUserKey();
  if (!uid || itemId == null || body == null) return;
  try {
    const all = LS.get(KB_ITEM_BODY_CACHE_KEY, {}) || {};
    all[String(itemId)] = { userId: uid, body: String(body), updatedAt: updatedAt || Date.now(), at: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > 120) keys.slice(0, keys.length - 120).forEach((k) => { delete all[k]; });
    LS.set(KB_ITEM_BODY_CACHE_KEY, all);
  } catch (_) {}
}
function kbInflightEnter() {
  S._kbInflight = (S._kbInflight || 0) + 1;
}
function kbInflightLeave() {
  S._kbInflight = Math.max(0, (S._kbInflight || 0) - 1);
  pumpDataCenterRefreshQueue();
}
function clearHomeSnap() {
  try {
    LS.del(HOME_SNAP_KEY); LS.del(PRED_CACHE_KEY); LS.del(DATA_TAB_SNAP_KEY); LS.del(HOME_ATT_CACHE_KEY);
  } catch (_) {}
}
function readDataTabSnap() {
  try {
    const s = LS.get(DATA_TAB_SNAP_KEY, null);
    if (!s || !s.dcHtml || s.dcHtml.length < 80) return null;
    if (Date.now() - (s.at || 0) > DATA_TAB_SNAP_MAX_AGE) return null;
    return s;
  } catch (_) { return null; }
}
function persistDataTabSnap(viewEl) {
  try {
    if (!viewEl || route().name !== 'data') return;
    const body = viewEl.querySelector('#dcBody');
    if (!body) return;
    const html = body.innerHTML;
    if (!html || html.length < 120 || html.length > DATA_TAB_SNAP_MAX_LEN) return;
    if (html.indexOf('sk-card') >= 0 && html.indexOf('dc-table') < 0 && html.indexOf('dc-scorer') < 0 && html.indexOf('dc-mv') < 0) return;
    LS.set(DATA_TAB_SNAP_KEY, {
      dcHtml: html,
      lg: dataLeagueOf(),
      kind: dataKindOf(),
      sec: dataSectionOf(),
      at: Date.now(),
      ver: 1,
    });
  } catch (_) {}
}
function hydrateDataTabPrefsFromSnap() {
  try {
    const s = readDataTabSnap();
    if (!s) return;
    if (s.lg) S.dataLeague = s.lg;
    if (s.sec === 'team' || s.sec === 'star') S.dataSection = s.sec;
    if (s.kind) S.dataKind = s.kind;
  } catch (_) {}
}
function dataTabSnapBodyHtml(lg, kind) {
  const snap = readDataTabSnap();
  if (!snap || snap.lg !== lg || snap.kind !== kind || snap.sec !== dataSectionOf()) return null;
  return snap.dcHtml;
}
function dcAbortInflightSlice(key) {
  try {
    const m = S._dcLoadMeta && S._dcLoadMeta[key];
    if (m && m.abort) m.abort.abort();
  } catch (_) {}
  if (S._dataLoadInflight) delete S._dataLoadInflight[key];
  if (S._dcRefreshQ) S._dcRefreshQ = S._dcRefreshQ.filter((j) => j.key !== key);
}
/** Escape infinite skeleton — prefer boot/local paint over empty timeout (1.9.205). */
function scheduleDcBodyWatchdog(lg, kind) {
  const token = Date.now();
  S._dcWatchToken = token;
  const bootKinds = new Set(['topscorers', 'topassists', 'topkeepers', 'playervalues', 'standings', 'clubvalues']);
  const delayMs = bootKinds.has(kind) ? 12000 : 22000;
  setTimeout(() => {
    (async () => {
      try {
        if (S._dcWatchToken !== token) return;
        if (route().name !== 'data' || dataLeagueOf() !== lg || dataKindOf() !== kind) return;
        const key = lg + ':' + kind;
        let cached = ensureDataCacheSlice(key);
        if (dataCacheRenderable(cached, kind)) {
          softPatchDataBody(lg, kind);
          return;
        }
        tryMergeBootPackSlice(lg, kind);
        cached = ensureDataCacheSlice(key);
        if (dataCacheRenderable(cached, kind)) {
          softPatchDataBody(lg, kind);
          return;
        }
        dcAbortInflightSlice(key);
        await loadDataCenterBootPack({ force: true });
        tryMergeBootPackSlice(lg, kind);
        if (dataCacheRenderable(ensureDataCacheSlice(key), kind)) {
          softPatchDataBody(lg, kind);
          return;
        }
        if (S._dataLoadInflight && S._dataLoadInflight[key]) return;
        const box = document.getElementById('dcBody');
        if (!box || !box.querySelector('.sk-card')) return;
        scheduleDataCenterRefresh(lg, kind, { urgent: true });
        box.innerHTML = empty('数据加载较慢或网络异常，请重试。', '<button class="btn ghost sm" data-act="dataRefresh">重新加载</button>', '加载超时');
      } catch (_) {}
    })();
  }, delayMs);
}
function bootShellEl() {
  return document.getElementById('boot-shell');
}
function bootShellHeld() {
  const el = bootShellEl();
  return !!(el && !el.classList.contains('gone') && !el.classList.contains('out'));
}
function waitAboveFoldReady(root, ms) {
  return new Promise(resolve => {
    const scope = root || document.getElementById('view');
    const imgs = scope
      ? Array.from(scope.querySelectorAll('.home-hero img.bn-bg, .home-hero img, .focus-row img, .focus-pitch-wrap img, .hc-item img.badge, .hc-teams img, .focus-card img, .badge.crest img')).slice(0, 16)
      : [];
    if (!imgs.length) { resolve('empty'); return; }
    let left = imgs.length;
    let done = false;
    const finish = (why) => { if (done) return; done = true; resolve(why); };
    const one = () => { if (--left <= 0) finish('imgs'); };
    imgs.forEach(img => {
      try {
        if (img.complete && img.naturalWidth > 0) one();
        else {
          img.addEventListener('load', one, { once: true });
          img.addEventListener('error', one, { once: true });
        }
      } catch (_) { one(); }
    });
    setTimeout(() => finish('timeout'), Math.max(120, ms || 480));
  });
}
function revealBootShell() {
  const el = bootShellEl();
  try {
    const v = document.getElementById('view');
    if (v) v.classList.remove('paint-hold');
  } catch (_) {}
  try { document.documentElement.removeAttribute('data-boot'); } catch (_) {}
  try { document.documentElement.setAttribute('data-ready', '1'); } catch (_) {}
  if (!el || el.classList.contains('gone')) return;
  el.classList.add('out');
  setTimeout(() => {
    try { el.classList.add('gone'); el.remove(); } catch (_) {}
  }, 200);
}
const DATA_DC_PREFETCH_LEAGUES = ['epl', 'laliga', 'bundesliga', 'seriea', 'ligue1', 'ucl'];
const DATA_CACHE_LS_MAX = 28;

function standingsSliceHasTeamIds(cached) {
  if (!cached || !cached.tables) return false;
  for (const tb of cached.tables) {
    for (const r of tb.rows || []) {
      if (r && r.teamId) return true;
    }
  }
  return false;
}
function standingsTeamIdCount(cached) {
  let n = 0;
  if (!cached || !cached.tables) return 0;
  for (const tb of cached.tables) {
    for (const r of tb.rows || []) {
      if (r && r.teamId) n++;
    }
  }
  return n;
}
/** Keep ESPN teamId on standings when a refresh returns name-only rows (tribe 法甲 empty). */
function mergeStandingsPreferTeamIds(prev, next) {
  if (!next || next.ok === false) return next;
  if (!prev || prev.ok === false || !prev.tables) return next;
  const pn = standingsTeamIdCount(prev);
  const nn = standingsTeamIdCount(next);
  if (pn <= 0 || nn >= pn) return next;
  const byTeam = new Map();
  for (const tb of prev.tables || []) {
    for (const r of tb.rows || []) {
      if (!r || !r.teamId) continue;
      const k = String(r.team || '').trim().toLowerCase();
      if (k) byTeam.set(k, String(r.teamId));
    }
  }
  const tables = (next.tables || []).map((tb) => ({
    ...tb,
    rows: (tb.rows || []).map((r) => {
      if (!r || r.teamId) return r;
      const tid = byTeam.get(String(r.team || '').trim().toLowerCase());
      return tid ? Object.assign({}, r, { teamId: tid }) : r;
    }),
  }));
  const merged = Object.assign({}, next, { tables });
  if (standingsTeamIdCount(merged) === 0 && pn > 0) {
    merged.tables = prev.tables;
  }
  return merged;
}
/** Standings usable for tribe catalog need at least one teamId (legacy LS rows often lack it). */
function dataCacheRenderable(cached, kind) {
  if (!cached || cached.ok === false) return false;
  if (kind === 'topkeepers') return !!(cached.preparing || (cached.rows && cached.rows.length));
  if (kind === 'standings') {
    if (!(cached.tables && cached.tables.some(t => (t.rows || []).length))) return false;
    return true;
  }
  if (kind === 'clubvalues') return !!(cached.rows && cached.rows.length);
  return !!(cached.rows && cached.rows.length);
}
function dataCacheTribeReady(cached) {
  return dataCacheRenderable(cached, 'standings') && standingsSliceHasTeamIds(cached);
}
/** 1.9.200: rebuild when cache has league standings the settled catalog still lacks (partial cold fill). */
function tribeCatalogNeedsRebuildFromCache() {
  const cat = S.tribeCat;
  const slices = tribeStandingsSlicesFromCache();
  let cacheLeagues = 0;
  let catLeagues = 0;
  for (const lg of TRIBE_LEAGUES) {
    const slice = slices[lg.key + ':standings'];
    if (!dataCacheTribeReady(slice)) continue;
    cacheLeagues++;
    const has = !!(cat && cat.teams && cat.teams.some((t) => t && t.leagueKey === lg.key && t.teamId));
    if (has) catLeagues++;
  }
  if (!cacheLeagues) return false;
  if (!cat || !cat.byId || !Object.keys(cat.byId).length) return true;
  if (catLeagues < cacheLeagues) return true;
  try {
    for (const t of cat.teams || []) {
      if (t && t.teamId && !t.logo) return true;
    }
  } catch (_) {}
  return false;
}
function purgeStandingsWithoutTeamIds() {
  try {
    S.dataCache = S.dataCache || {};
    for (const k of Object.keys(S.dataCache)) {
      if (!k.endsWith(':standings')) continue;
      if (!standingsSliceHasTeamIds(S.dataCache[k])) delete S.dataCache[k];
    }
    const all = LS.get('jc_data_cache_v1', null);
    if (all && typeof all === 'object') {
      let changed = false;
      for (const k of Object.keys(all)) {
        if (!k.endsWith(':standings')) continue;
        if (!standingsSliceHasTeamIds(all[k])) { delete all[k]; changed = true; }
      }
      if (changed) LS.set('jc_data_cache_v1', all);
    }
  } catch (_) {}
}
function readDataCacheSlice(key) {
  try {
    const all = LS.get('jc_data_cache_v1', null);
    if (!all || !all[key] || all[key].ok === false) return null;
    return Object.assign({}, all[key], { fromCache: true });
  } catch (_) { return null; }
}
/** Memory + localStorage hydrate for instant data-tab paint (1.9.155). */
function ensureDataCacheSlice(key) {
  S.dataCache = S.dataCache || {};
  const kind = String(key).split(':')[1] || 'standings';
  const mem = S.dataCache[key];
  if (mem && mem.ok !== false && dataCacheRenderable(mem, kind)) return mem;
  const ls = readDataCacheSlice(key);
  if (ls && dataCacheRenderable(ls, kind)) {
    S.dataCache[key] = ls;
    return ls;
  }
  return (mem && mem.ok !== false) ? mem : (ls || mem || null);
}
const DC_REFRESH_MAX_URGENT = 5;
const DC_REFRESH_MAX_SOFT = 2;
const DC_REFRESH_MAX_TOTAL = 6;
function dcVisibleSliceKey() {
  if (route().name !== 'data') return '';
  return dataLeagueOf() + ':' + dataKindOf();
}
function dcKbBlocksQueue() {
  return route().name === 'kb' || (S._kbInflight || 0) > 0;
}
function dcQueueJobRank(job, visibleKey) {
  const vis = visibleKey && job.key === visibleKey ? 1 : 0;
  return (vis * 4) + (job.urgent ? 2 : 0);
}
function pruneStaleDcSoftRefresh(visibleKey) {
  S._dcRefreshQ = (S._dcRefreshQ || []).filter((j) => j.urgent || !visibleKey || j.key === visibleKey);
  const meta = S._dcLoadMeta || {};
  for (const [key, m] of Object.entries(meta)) {
    if (!m || !m.soft) continue;
    if (visibleKey && key === visibleKey) continue;
    try { if (m.abort) m.abort.abort(); } catch (_) {}
  }
}
function syncDcRoutePriority(prevRouteName, nextRouteName) {
  if (prevRouteName === nextRouteName) return;
  if (nextRouteName === 'kb') pruneStaleDcSoftRefresh('');
  if (prevRouteName === 'kb' && nextRouteName !== 'kb') pumpDataCenterRefreshQueue();
  if (nextRouteName === 'data') pruneStaleDcSoftRefresh(dcVisibleSliceKey());
}
function scheduleDataCenterRefresh(lg, kind, { urgent } = {}) {
  const key = lg + ':' + kind;
  const cached = ensureDataCacheSlice(key);
  const needUrgent = urgent != null ? urgent : !dataCacheRenderable(cached, kind);
  if (!needUrgent && dcKbBlocksQueue()) return;
  S._dcRefreshQ = S._dcRefreshQ || [];
  S._dataLoadInflight = S._dataLoadInflight || {};
  if (S._dataLoadInflight[key]) return;
  if (S._dcRefreshQ.some((j) => j.key === key)) return;
  S._dcRefreshQ.push({ key, lg, kind, urgent: needUrgent, at: Date.now() });
  pumpDataCenterRefreshQueue();
}
function pumpDataCenterRefreshQueue() {
  if (dcKbBlocksQueue()) return;
  S._dcRefreshActive = S._dcRefreshActive || 0;
  S._dcRefreshQ = S._dcRefreshQ || [];
  const visibleKey = dcVisibleSliceKey();
  const countActive = (urgent) => {
    let n = 0;
    const meta = S._dcLoadMeta || {};
    for (const m of Object.values(meta)) { if (m && !!m.urgent === !!urgent) n++; }
    return n;
  };
  while (S._dcRefreshQ.length && S._dcRefreshActive < DC_REFRESH_MAX_TOTAL) {
    S._dcRefreshQ.sort((a, b) => {
      const ra = dcQueueJobRank(a, visibleKey);
      const rb = dcQueueJobRank(b, visibleKey);
      if (rb !== ra) return rb - ra;
      return a.at - b.at;
    });
    const activeUrgent = countActive(true);
    const activeSoft = countActive(false);
    const jobIdx = S._dcRefreshQ.findIndex((j) => {
      if (S._dataLoadInflight[j.key]) return false;
      if (j.urgent) return activeUrgent < DC_REFRESH_MAX_URGENT;
      return activeSoft < DC_REFRESH_MAX_SOFT;
    });
    if (jobIdx < 0) break;
    const job = S._dcRefreshQ.splice(jobIdx, 1)[0];
    if (!job) break;
    const abort = new AbortController();
    S._dataLoadInflight[job.key] = true;
    S._dcLoadMeta = S._dcLoadMeta || {};
    S._dcLoadMeta[job.key] = { soft: !job.urgent, urgent: !!job.urgent, abort, key: job.key };
    S._dcRefreshActive++;
    const soft = !job.urgent;
    loadDataCenter(job.lg, job.kind, { soft, signal: abort.signal }).finally(() => {
      delete S._dataLoadInflight[job.key];
      if (S._dcLoadMeta) delete S._dcLoadMeta[job.key];
      S._dcRefreshActive--;
      pumpDataCenterRefreshQueue();
    });
  }
}
function warmDataCenterPrefetch(lg, kind) {
  if (dcKbBlocksQueue()) return;
  scheduleDataCenterRefresh(lg, kind, { urgent: false });
  const fillSiblingKinds = () => {
    const kinds = dataKindsForSection(dataSectionOf()).map(([k]) => k).filter((k) => k !== kind);
    for (const k of kinds) {
      const key = lg + ':' + k;
      if (!dataCacheRenderable(ensureDataCacheSlice(key), k)) scheduleDataCenterRefresh(lg, k, { urgent: false });
    }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fillSiblingKinds, { timeout: 10000 });
  else setTimeout(fillSiblingKinds, 2000);
  if (kind === 'playervalues' || kind === 'clubvalues') return;
  const fillCrossLeague = () => {
    let n = 0;
    for (const l of DATA_DC_PREFETCH_LEAGUES) {
      if (l === lg) continue;
      if (n >= 1) break;
      const key = l + ':' + kind;
      if (!dataCacheRenderable(ensureDataCacheSlice(key), kind)) {
        scheduleDataCenterRefresh(l, kind, { urgent: false });
        n++;
      }
    }
  };
  setTimeout(fillCrossLeague, 8000);
}
/** 1.9.157: no cold-start DC storm — boot JSON + LS hydrate cover standings/scorers; 身价等按需拉取。 */
function bootWarmAllDataCenter() { /* intentionally empty */ }
let _bootPackInflight = null;
let _bootPackOk = false;
let _bootPackSlices = null;
/** 1.9.209: sync-parse boot slices shipped in APK (no fetch wait for 德甲/法甲射手). */
function seedBootPackFromInline() {
  try {
    const j = typeof window !== 'undefined' ? window.__JC_DC_BOOT__ : null;
    if (!j || !j.slices || typeof j.slices !== 'object') return false;
    if (_bootPackSlices === j.slices && _bootPackOk) return true;
    _bootPackSlices = j.slices;
    _bootPackOk = true;
    for (const [key, payload] of Object.entries(j.slices)) mergeBootPackSlice(key, payload);
    rebuildDcLeaderEspnMaps();
    return true;
  } catch (_) {
    return false;
  }
}
function tryMergeBootPackSlice(lg, kind) {
  const key = lg + ':' + kind;
  const payload = _bootPackSlices && _bootPackSlices[key];
  if (payload) mergeBootPackSlice(key, payload);
}
/** Sync merge boot slice before deciding skeleton (1.9.207). */
function primeDataSliceFromBoot(lg, kind) {
  seedBootPackFromInline();
  tryMergeBootPackSlice(lg, kind);
  if (!_bootPackOk && !_bootPackInflight) loadDataCenterBootPack();
  return ensureDataCacheSlice(lg + ':' + kind);
}
function mergeDcRowsPreferIdentity(prev, next) {
  if (!prev || !next || prev.ok === false || !Array.isArray(prev.rows) || !Array.isArray(next.rows)) return next;
  const byKey = new Map();
  for (const r of prev.rows) {
    if (!r) continue;
    const k = r.playerId != null && String(r.playerId) !== ''
      ? 'id:' + String(r.playerId)
      : 'n:' + String(r.player || '') + '|' + String(r.team || '');
    byKey.set(k, r);
  }
  next.rows = next.rows.map((r) => {
    if (!r) return r;
    const k = r.playerId != null && String(r.playerId) !== ''
      ? 'id:' + String(r.playerId)
      : 'n:' + String(r.player || '') + '|' + String(r.team || '');
    const p = byKey.get(k);
    if (!p) return r;
    const out = Object.assign({}, r);
    if (!out.playerId && p.playerId) out.playerId = p.playerId;
    if (!out.photo && p.photo) out.photo = p.photo;
    if (!out.photoAlt && p.photoAlt) out.photoAlt = p.photoAlt;
    return out;
  });
  return next;
}
function mergeBootPackSlice(key, payload) {
  if (!key || !payload || payload.ok === false) return;
  const kind = String(key).split(':')[1] || 'standings';
  const existing = ensureDataCacheSlice(key);
  if (kind === 'standings') {
    const exN = standingsTeamIdCount(existing);
    const payN = standingsTeamIdCount(payload);
    if (exN > 0 && payN > 0 && payN < exN) return;
    if (dataCacheTribeReady(existing) && dataCacheTribeReady(payload) && payN <= exN) return;
    if (dataCacheTribeReady(existing) && !dataCacheTribeReady(payload)) return;
    if (!dataCacheRenderable(payload, kind)) return;
    if (existing && existing.ok !== false && exN > payN) {
      payload = mergeStandingsPreferTeamIds(existing, payload);
    }
  } else {
    if (kind === 'topkeepers' && payload.preparing && !(payload.rows && payload.rows.length)) return;
    if (dataCacheRenderable(existing, kind)) return;
    if (!dataCacheRenderable(payload, kind)) return;
  }
  const row = Object.assign({}, payload, { fromCache: true, bootPack: true });
  S.dataCache = S.dataCache || {};
  S.dataCache[key] = row;
  persistDataCacheSlice(key, row);
  try { rebuildDcLeaderEspnMaps(); } catch (_) {}
}
function afterBootPackMerged() {
  try {
    if (route().name === 'data') {
      const lg = dataLeagueOf(), kind = dataKindOf();
      if (dataCacheRenderable(ensureDataCacheSlice(lg + ':' + kind), kind)) {
        if (!softPatchDataBody(lg, kind)) render({ force: true });
      }
    }
  } catch (_) {}
  try {
    if ((route().name === 'tribe' || route().name === 'tribe-club') && tribeCatalogNeedsRebuildFromCache()) {
      rebuildTribeCatalogFromCache({ renderIfTribe: true });
    } else if (route().name === 'tribe' && S.tribeCat && S.tribeCat._settled) {
      const side = tribeSideOf();
      if (TRIBE_LEAGUES.some((l) => l.key === side) && !tribeTeamsForSide(side).length) {
        rebuildTribeCatalogFromCache({ renderIfTribe: true });
      }
    }
  } catch (_) {}
}
function loadDataCenterBootPack(opts) {
  const force = !!(opts && opts.force);
  seedBootPackFromInline();
  if (_bootPackOk && !force) return Promise.resolve(true);
  if (_bootPackInflight && !force) return _bootPackInflight;
  _bootPackInflight = (async () => {
    try {
      if (!_bootPackOk || force) {
        const fast = await fetchTribeBootPackOnce({ timeoutMs: 2500, cache: 'force-cache' });
        if (fast) {
          _bootPackOk = true;
          afterBootPackMerged();
        }
      }
      if (!_bootPackOk || force) {
        let ok = await fetchTribeBootPackOnce({ timeoutMs: 8000, cache: 'no-store' });
        if (!ok) ok = await fetchTribeBootPackOnce({ timeoutMs: 6000, cache: 'default' });
        _bootPackOk = !!ok || _bootPackOk;
        if (ok) afterBootPackMerged();
      }
      return _bootPackOk;
    } catch (_) {
      return _bootPackOk;
    } finally {
      if (_bootPackOk) _bootPackInflight = null;
      else _bootPackInflight = null;
    }
  })();
  return _bootPackInflight;
}
const DC_IMG_PREFETCH_MAX = 10;
function prefetchDcImages(root) {
  try {
    const scope = root || document.getElementById('view') || document;
    const urls = Array.from(scope.querySelectorAll('.dc-avatar img, .dc-table .badge.crest img, .dc-scorers .badge.crest img'))
      .map((img) => img.currentSrc || img.src).filter(Boolean).slice(0, DC_IMG_PREFETCH_MAX);
    if (!urls.length) return;
    const run = () => {
      let i = 0;
      const step = () => {
        const batch = urls.slice(i, i + 3);
        i += 3;
        batch.forEach((u) => { try { const im = new Image(); im.decoding = 'async'; im.src = u; } catch (_) {} });
        if (i < urls.length) setTimeout(step, 120);
      };
      step();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 200);
  } catch (_) {}
}

function persistDataCacheSlice(key, payload) {
  try {
    if (!key || !payload || payload.ok === false) return;
    const all = LS.get('jc_data_cache_v1', {}) || {};
    all[key] = {
      ok: true,
      leagueKey: payload.leagueKey,
      leagueZh: payload.leagueZh,
      seasonLabel: payload.seasonLabel,
      source: payload.source,
      updatedAt: payload.updatedAt || payload.fetchedAt,
      fetchedAt: payload.fetchedAt,
      asOf: payload.asOf,
      tables: payload.tables,
      rows: payload.rows,
      noteZh: payload.noteZh,
      pastSeason: payload.pastSeason,
      refreshHint: payload.refreshHint,
      preparing: payload.preparing,
      bootPack: !!payload.bootPack,
    };
    const keys = Object.keys(all);
    if (keys.length > DATA_CACHE_LS_MAX) {
      const dropOrder = keys.filter((k) => !all[k] || !all[k].bootPack);
      while (Object.keys(all).length > DATA_CACHE_LS_MAX && dropOrder.length) {
        const k = dropOrder.shift();
        delete all[k];
      }
    }
    LS.set('jc_data_cache_v1', all);
  } catch (_) {}
}
const isSample = () => S.msrc?.source === 'sample';
function shanghaiHHMM(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const h = parts.find(x => x.type === 'hour').value;
  const m = parts.find(x => x.type === 'minute').value;
  return h + ':' + m;
}
function srcPill() {
  // 1.9.93: hide realtime/sample pills in headers so titles stay visually centered.
  // Sample/offline still surface via warnBar() below the header when needed.
  return '<span class="ph" aria-hidden="true"></span>';
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
  return '';
}

// ---------- account lists (plans / favorites) ----------
function kbLoadFailToastAllowed(routeName) {
  return routeName === 'kb';
}
function prefetchKbPacksOnBoot() {
  if (!loggedIn() || (S.kb && S.kb.packs)) return;
  const run = () => {
    if (!loggedIn() || (S.kb && S.kb.packs)) return;
    loadKbPacks(false).catch(() => {}).then(() => {
      if (route().name === 'kb') render({ force: true });
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 3000);
}
async function refreshAccount() {
  if (!loggedIn()) return;
  try {
    const [me, pl, fv, tf, uf, ms] = await Promise.all([api('/me'), api('/plans'), api('/favorites'), api('/tribe-follows'), api('/user-follows/following'), api('/membership/status')]);
    S.user = me.user; LS.set('jc_user', me.user); S.plans = pl.plans; S.favs = fv.favorites; S.tribeFollows = tf.tribeFollows || [];
    applyUserFollowList(uf.users); S.membership = ms; persistLists();
    hydrateKbPacksCache();
    prefetchKbPacksOnBoot();
    if (route().name === 'kb') ensureKbRouteData();
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
  persistLists(); toast(on ? '已取消关注' : loggedIn() ? '已关注，已同步到账号' : '已关注（本机保存，登录后可同步）');
  if (!on) requestFavGoalNotifyPermission();
  ensureFavGoalPoll();
  render();
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
function findMatchByNum(num) {
  const s = String(num || '');
  return (S.matches || []).find(m => String(m.num) === s) || (S.schedule || []).find(m => String(m.num) === s) || null;
}
function oddsForSelKey(m, key, stored) {
  if (typeof stored === 'number' && stored >= 1.01) return stored;
  if (key.startsWith('hhad')) return m.hhad && m.hhad[key.slice(4)];
  if (key.startsWith('had')) return m.had && m.had[key.slice(3)];
  return Number(stored) || 0;
}
function selMatchesFrom(sel) {
  return Object.entries(sel || {}).map(([id, ks]) => {
    const m = findMatch(id); if (!m) return null;
    const keys = Object.keys(ks);
    const odds = keys.map(k => oddsForSelKey(m, k, ks[k])).filter(v => v > 0);
    return { m, keys, odds };
  }).filter(x => x && x.keys.length && x.odds.length === x.keys.length);
}
function selMatches() { return selMatchesFrom(S.sel); }
function calcSelMatches() { return selMatchesFrom(S.calcSel); }
function combos(arr, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); } return out; }
const typeName = t => (t === 1 ? '单关' : `${t}串1`);
/** Jingcai parlay math: 2 yuan/note base, combinatorial expansion across matches/options. */
function calcFrom(sel, types, mult) {
  const { sm, avail, types: nextTypes } = calcResolvedTypes(sel, types);
  const n = sm.length;
  let bets = 0;
  for (const t of nextTypes) {
    for (const c of combos(sm, t)) {
      bets += c.reduce((a, x) => a * x.odds.length, 1);
    }
  }
  const m = mult || 1;
  const stake = 2 * m;
  const lines = expandCalcDanShiLines(sel, nextTypes);
  const range = slipPrizeRange(lines, lines.map(() => m), nextTypes);
  return { n, avail, types: nextTypes, bets, cost: bets * stake, min: range.min, max: range.max };
}
function calcResolvedTypes(sel, types) {
  const sm = selMatchesFrom(sel);
  const n = sm.length;
  const avail = n === 1 ? [1] : Array.from({ length: Math.max(0, Math.min(n, 8) - 1) }, (_, i) => i + 2);
  let nextTypes = (types || []).filter(t => avail.includes(t));
  if (!nextTypes.length && n) nextTypes = n === 1 ? [1] : avail.slice();
  return { sm, avail, types: nextTypes };
}
function calcTypeBarLabel(types) {
  const sorted = (types || []).filter(t => t >= 1).sort((a, b) => a - b);
  if (!sorted.length) return '过关';
  if (sorted.length === 1) return typeName(sorted[0]);
  return `${typeName(sorted[0])}等`;
}
function bumpCalcTypesOnMoreMatches(prevN) {
  const n = calcSelMatches().length;
  if (!n) {
    S.calcTypes = [];
    return;
  }
  const { avail, types } = calcResolvedTypes(S.calcSel, S.calcTypes);
  let next = types.length ? types.slice() : (n === 1 ? [1] : avail.slice());
  if (n > prevN && n > 1 && avail.includes(n) && !next.includes(n)) next.push(n);
  S.calcTypes = next.filter(t => avail.includes(t)).sort((a, b) => a - b);
  if (!S.calcTypes.length) S.calcTypes = n === 1 ? [1] : avail.slice();
}
function cartesianProd(arrays) {
  if (!arrays.length) return [[]];
  return arrays.reduce((acc, arr) => {
    const out = [];
    for (const a of acc) for (const b of arr) out.push(a.concat([b]));
    return out;
  }, [[]]);
}
function calcDanShiShortLabel(key) {
  if (key.startsWith('hhad')) return LBL.hhad[key.slice(4)];
  if (key.startsWith('had')) return LBL.had[key.slice(3)];
  return calcSelLabel(key).replace(/^比分 /, '').replace(/^总进球 /, '').replace(/^半全场 /, '');
}
/** Expand calculator slip into 单式 lines (same combinatorial basis as calcFrom bet count). */
function expandCalcDanShiLines(sel, types) {
  const { sm, types: nextTypes } = calcResolvedTypes(sel, types);
  const lines = [];
  for (const t of nextTypes) {
    for (const c of combos(sm, t)) {
      const pickArrays = c.map(x => x.keys.map((k, i) => ({
        num: x.m.num, key: k, odds: x.odds[i], short: calcDanShiShortLabel(k),
      })));
      for (const picks of cartesianProd(pickArrays)) {
        const oddsProd = picks.reduce((a, p) => a * p.odds, 1);
        lines.push({ picks, oddsProd, parlay: t });
      }
    }
  }
  return lines;
}
function defaultBonusOptAmount(costYuan) {
  const c = Math.max(2, Math.round(costYuan) || 2);
  if (c >= 100) return Math.ceil(c / 10) * 10;
  return Math.max(c, 200);
}
/** Integer unit counts summing to totalUnits, proportional to weights. */
function distributeIntegerUnits(weights, totalUnits) {
  const n = weights.length;
  if (!n) return [];
  const U = Math.max(0, Math.floor(totalUnits));
  if (!U) return weights.map(() => 0);
  const w = weights.map(x => Math.max(0, Number(x) || 0));
  const sumW = w.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    const base = Math.floor(U / n);
    const rem = U - base * n;
    return w.map((_, i) => base + (i < rem ? 1 : 0));
  }
  const ideal = w.map(x => (x / sumW) * U);
  const mults = ideal.map(x => Math.floor(x));
  let used = mults.reduce((a, b) => a + b, 0);
  const order = ideal.map((x, i) => ({ i, f: x - mults[i] })).sort((a, b) => b.f - a.f);
  for (let k = 0; used < U; k++, used++) mults[order[k % n].i]++;
  return mults;
}
function bonusOptUnitsFromAmount(yuan) { return Math.max(0, Math.floor((Number(yuan) || 0) / 2)); }
/** 博冷：非最高赔率单式先按优化金额回本倍数，余量全部给最高赔率单式；若全体回本超预算则几乎 all-in 冷门。 */
function coldBreakEvenUnits(line, amountYuan) {
  const one = lineEstPrize(line, 1);
  if (one <= 0) return 1;
  return Math.max(1, Math.min(9999, Math.ceil(amountYuan / one)));
}
function computeColdBonusOptMults(lines, units, amountYuan) {
  const n = lines.length;
  if (!n) return [];
  if (n === 1) return [Math.max(0, Math.min(9999, units))];
  const U = Math.max(0, Math.floor(units));
  if (!U) return lines.map(() => 0);
  const amount = Math.max(0, Number(amountYuan) || 0) || U * 2;
  let coldIdx = 0;
  for (let i = 1; i < n; i++) if (lines[i].oddsProd > lines[coldIdx].oddsProd) coldIdx = i;
  const mults = lines.map(() => 0);
  let tailSum = 0;
  for (let i = 0; i < n; i++) {
    if (i === coldIdx) continue;
    const u = coldBreakEvenUnits(lines[i], amount);
    mults[i] = u;
    tailSum += u;
  }
  if (tailSum >= U) {
    for (let i = 0; i < n; i++) mults[i] = 0;
    const tailCount = n - 1;
    if (U >= n) {
      for (let i = 0; i < n; i++) {
        if (i !== coldIdx) mults[i] = 1;
      }
      mults[coldIdx] = U - tailCount;
    } else {
      mults[coldIdx] = U;
    }
  } else {
    mults[coldIdx] = U - tailSum;
  }
  return mults.map(m => Math.max(0, Math.min(9999, m)));
}
function computeBonusOptMults(mode, lines, amountYuan, baseMult) {
  const n = lines.length;
  if (!n) return [];
  const units = bonusOptUnitsFromAmount(amountYuan);
  if (mode === 'none') {
    if (!units) return lines.map(() => 0);
    return distributeIntegerUnits(lines.map(() => 1), units).map(m => Math.max(0, Math.min(9999, m)));
  }
  if (!units) return lines.map(() => 0);
  if (mode === 'cold') return computeColdBonusOptMults(lines, units, amountYuan);
  const weights = lines.map(l => 1 / l.oddsProd);
  return distributeIntegerUnits(weights, units).map(m => Math.max(0, Math.min(9999, m)));
}
const CRS_MORE_WIN = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2]];
const CRS_MORE_DRAW = [[0, 0], [1, 1], [2, 2], [3, 3]];
const CRS_MORE_LOSE = [[0, 1], [1, 2], [2, 3], [0, 2], [1, 3], [2, 4], [0, 3], [1, 4], [2, 5], [0, 4], [1, 5], [0, 5]];
function crsScoreInList(hg, ag, list) {
  return list.some(([h, a]) => h === hg && a === ag);
}
function wdlSide(hg, ag) {
  if (hg > ag) return 'h';
  if (hg === ag) return 'd';
  return 'a';
}
function pickKeyTrueAtScore(key, hg, ag, goalLine, hthg, htag) {
  if (key.startsWith('had')) {
    const side = key.slice(3);
    if (side === 'h') return hg > ag;
    if (side === 'd') return hg === ag;
    if (side === 'a') return hg < ag;
  }
  if (key.startsWith('hhad')) {
    const side = key.slice(4);
    const gl = goalLine != null && goalLine !== '' ? Number(goalLine) : 0;
    const adj = hg + gl - ag;
    if (side === 'h') return adj > 0;
    if (side === 'd') return adj === 0;
    if (side === 'a') return adj < 0;
  }
  if (key.startsWith('crs_')) {
    if (key === 'crs_s1sh') return hg > ag && !crsScoreInList(hg, ag, CRS_MORE_WIN);
    if (key === 'crs_s1sd') return hg === ag && !crsScoreInList(hg, ag, CRS_MORE_DRAW);
    if (key === 'crs_s1sa') return hg < ag && !crsScoreInList(hg, ag, CRS_MORE_LOSE);
    const m = key.slice(4).match(/^s(\d+)s(\d+)$/);
    if (m) return hg === +m[1] && ag === +m[2];
    return false;
  }
  if (key.startsWith('ttg_')) {
    const total = hg + ag;
    if (key === 'ttg_s7') return total >= 7;
    const tm = key.slice(4).match(/^s(\d+)$/);
    if (tm) return total === +tm[1];
    return false;
  }
  if (key.startsWith('hafu_')) {
    const code = key.slice(5);
    if (code.length !== 2 || hthg == null || htag == null) return false;
    return code === wdlSide(hthg, htag) + wdlSide(hg, ag);
  }
  return false;
}
function pushAchievableSubset(subsets, seen, appeared, active) {
  if (!active.length) return;
  active.forEach(k => appeared.add(k));
  const sig = active.slice().sort().join('|');
  if (seen.has(sig)) return;
  seen.add(sig);
  subsets.push(active);
}
/** All subsets of selected keys on one match that can win together (e.g. 胜 + 让胜 + 比分3:0 + 半全场). */
function achievableKeySubsetsForMatch(keys, goalLine) {
  const unique = [...new Set(keys)];
  const seen = new Set();
  const subsets = [];
  const appeared = new Set();
  const needHt = unique.some(k => k.startsWith('hafu_'));
  if (needHt) {
    for (let hg = 0; hg <= 12; hg++) {
      for (let ag = 0; ag <= 12; ag++) {
        for (let hhg = 0; hhg <= hg; hhg++) {
          for (let hag = 0; hag <= ag; hag++) {
            const active = unique.filter(k => pickKeyTrueAtScore(k, hg, ag, goalLine, hhg, hag));
            pushAchievableSubset(subsets, seen, appeared, active);
          }
        }
      }
    }
  } else {
    for (let hg = 0; hg <= 12; hg++) {
      for (let ag = 0; ag <= 12; ag++) {
        const active = unique.filter(k => pickKeyTrueAtScore(k, hg, ag, goalLine));
        pushAchievableSubset(subsets, seen, appeared, active);
      }
    }
  }
  for (const k of unique) {
    if (!appeared.has(k)) {
      if (!seen.has(k)) {
        seen.add(k);
        subsets.push([k]);
      }
    }
  }
  if (!subsets.length && unique.length) subsets.push(unique.slice(0, 1));
  return subsets;
}
/** Min/max total prize when all jointly winnable 单式 hit under some full outcome (竞彩预测奖金语义). */
function simultaneousWinPrizeRange(lines, mults) {
  const active = [];
  for (let i = 0; i < lines.length; i++) {
    const prize = lineEstPrize(lines[i], mults[i] || 0);
    if (prize > 0) active.push({ line: lines[i], prize });
  }
  if (!active.length) return { min: 0, max: 0 };
  const perMatchKeys = {};
  for (const { line } of active) {
    for (const p of line.picks) {
      (perMatchKeys[p.num] ||= new Set()).add(p.key);
    }
  }
  const matchNums = Object.keys(perMatchKeys);
  const subsetLists = matchNums.map(num => {
    const m = findMatchByNum(num);
    const gl = m?.hhad?.goalLine;
    return achievableKeySubsetsForMatch([...perMatchKeys[num]], gl);
  });
  let max = 0;
  let min = Infinity;
  const walk = (idx, outcomeSets) => {
    if (idx >= matchNums.length) {
      let sum = 0;
      for (const { line, prize } of active) {
        let ok = true;
        for (const p of line.picks) {
          const set = outcomeSets[p.num];
          if (!set || !set.has(p.key)) { ok = false; break; }
        }
        if (ok) sum += prize;
      }
      if (sum > 0) min = Math.min(min, sum);
      if (sum > max) max = sum;
      return;
    }
    const num = matchNums[idx];
    for (const subset of subsetLists[idx]) {
      outcomeSets[num] = new Set(subset);
      walk(idx + 1, outcomeSets);
    }
  };
  walk(0, {});
  if (min === Infinity) min = 0;
  return { min, max };
}
/** 预测奖金区间：下限=最低单注预估奖金，上限=可同时命中的单式预估奖金之和。 */
function slipPrizeRange(lines, mults, parlayTypes) {
  let minPrize = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = mults[i] || 0;
    if (m <= 0) continue;
    const p = lineEstPrize(lines[i], m);
    if (p > 0 && (!minPrize || p < minPrize)) minPrize = p;
  }
  let maxParlay;
  if (parlayTypes && parlayTypes.length) {
    maxParlay = Math.min(...parlayTypes);
  } else {
    const parlays = [];
    for (let i = 0; i < lines.length; i++) {
      if ((mults[i] || 0) > 0 && lines[i].parlay != null) parlays.push(lines[i].parlay);
    }
    maxParlay = parlays.length ? Math.min(...parlays) : 1;
  }
  const maxLines = [];
  const maxMults = [];
  for (let i = 0; i < lines.length; i++) {
    if ((mults[i] || 0) > 0 && lines[i].parlay === maxParlay) {
      maxLines.push(lines[i]);
      maxMults.push(mults[i] || 0);
    }
  }
  const rangeMax = simultaneousWinPrizeRange(maxLines, maxMults);
  return { min: minPrize, max: rangeMax.max };
}
function bonusOptTotals(lines, mults) {
  let bets = 0, cost = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = mults[i] || 0;
    if (m > 0) {
      bets++;
      cost += m * 2;
    }
  }
  const range = slipPrizeRange(lines, mults);
  return { bets, cost, min: range.min, max: range.max };
}
function calcSubmitSheetOpen() {
  const sh = $('#sheet');
  return sh && !sh.classList.contains('hidden') && !!sh.querySelector('.calc-result-sheet');
}
function calcComboSheetOpen() {
  const sh = $('#sheet');
  return sh && !sh.classList.contains('hidden') && !!sh.querySelector('.calc-combo-sheet');
}
function jcRoundOddsProd(prod) { return Math.round(Number(prod) * 100) / 100; }
function lineEstPrize(line, mult) { return jcRoundOddsProd(line.oddsProd) * 2 * (mult || 0); }
function calc() {
  const c = calcFrom(S.sel, S.types, S.mult);
  S.types = c.types;
  return c;
}
function toggleSel(mid, key) {
  const s = (S.sel[mid] ||= {}); s[key] ? delete s[key] : (s[key] = 1); if (!Object.keys(s).length) delete S.sel[mid];
  document.querySelectorAll(`.cell[data-mid="${CSS.escape(mid)}"][data-key="${key}"]`).forEach(el => el.classList.toggle('sel', !!S.sel[mid]?.[key]));
  renderPlanBar();
}
function renderPlanBar() {
  const bar = $('#planbar'); const n = selMatches().length; const r = route();
  const show = n > 0 && ['schedule', 'match', 'home'].includes(r.name) && !(r.name === 'schedule' && schChannelOf() === 'calc');
  bar.classList.toggle('hidden', !show); $('#view').classList.toggle('has-bar', show);
  if (!show) return;
  bar.classList.toggle('sub', !TABS.includes(r.name));
  bar.innerHTML = `<span class="sp">已选 <b>${n}</b> 场比赛</span><button class="clr" data-act="clearSel">清空</button><button class="btn pri sm" data-act="openPlan">生成方案</button>`;
}
function openPlanSheet() {
  const sm = selMatches(); if (!sm.length) return closeSheet();
  S.mult = clampCalcMult(S.mult);
  const c = calc(); const sh = $('#sheet'); sh.classList.remove('hidden');
  sh.innerHTML = `<div class="sheet"><h3><span>方案预览</span><button class="x" data-act="closeSheet">✕</button></h3>
    ${sm.map(x => `<div class="pk"><div class="n">${esc(x.m.num)} ${esc(x.m.home)} vs ${esc(x.m.away)}</div><div class="s">${esc(x.m.league)} · ${esc(x.m.date.slice(5))} ${esc(x.m.time)}</div>
      <div class="items">${x.keys.map((k, i) => `<span>${LBL[k.slice(0, -1)][k.slice(-1)]}${k.startsWith('hhad') ? '(' + esc(x.m.hhad.goalLine) + ')' : ''} @${x.odds[i].toFixed(2)}</span>`).join('')}</div></div>`).join('')}
    <div class="calc-combo-block">
      <div class="calc-sheet-hd-inline"><span class="t">过关方式</span><span class="sub">${calcComboSheetSubtitle(c.n, S.types)}</span></div>
      ${calcComboBtnsHtml(c.avail, S.types, 'calcType')}
    </div>
    <div class="calc-row"><span>倍数</span><button type="button" class="calc-mult-trigger" data-act="openCalcMultSheet" data-mult-src="plan"><span class="v">${S.mult}</span> 倍</button></div>
    <div class="calc-row"><span>组合数</span><span class="num">${c.bets} 注（按每注2元计 ${c.cost} 元）</span></div>
    <div class="calc-row"><span>理论奖金</span><span class="num"><b>${c.min.toFixed(2)}</b> ~ <b>${c.max.toFixed(2)}</b> 元</span></div>
    <p class="note">理论奖金 = 2元 × 赔率乘积 × 倍数，未计税与官方封顶。方案只作为个人记录保存${loggedIn() ? '并同步到你的账号' : '在本机'}，不会提交到任何第三方。</p>
    <button class="btn pri block" data-act="savePlan">保存方案</button></div>`;
}
function syncSheetScrollLock() {
  const sh = $('#sheet');
  const on = sh && !sh.classList.contains('hidden');
  document.body.classList.toggle('sheet-on', !!on);
  const view = $('#view');
  if (view) view.classList.toggle('sheet-lock', !!on);
}
function closeSheet() {
  const sh = $('#sheet');
  sh.classList.add('hidden');
  sh.classList.remove('bonus-opt-mask');
  sh.innerHTML = '';
  syncSheetScrollLock();
}
globalThis.closeSheet = closeSheet;
function openSheetHtml(html) {
  const sh = $('#sheet');
  sh.classList.remove('hidden');
  sh.innerHTML = html;
  syncSheetScrollLock();
}

// ======================= router =======================
/** 1.9.146: top feed tabs (部落/头条/开奖) + bottom tabs (首页/赛程/预测/数据). */
const TOP_TABS = ['tribe', 'news', 'results'];
const TABS = ['home', 'schedule', 'predict', 'data'];
const SHELL_TABS = [...TOP_TABS, ...TABS];
function isShellTab(name) { return SHELL_TABS.includes(name); }
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
const ME_DRAWER_CHILD = new Set(['plans', 'favs', 'friends', 'membership', 'orders', 'kb', 'column', 'settings', 'about', 'profile', 'pay', 'password', 'delete', 'member-terms']);
function isMeDrawerChildRoute(name) {
  return ME_DRAWER_CHILD.has(name || '');
}
function routeFromHash(h) {
  const raw = String(h || '#/home').replace(/^#/, '').replace(/^\//, '');
  const qIdx = raw.indexOf('?');
  const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const [name, ...rest] = path.split('/');
  return { name: name || 'home', arg: decodeURIComponent(rest.join('/') || '') };
}
function go(h, replace) {
  closeMeDrawer();
  const dest = routeFromHash(h);
  if (!isMeDrawerChildRoute(dest.name)) S.meBackToDrawer = false;
  if (replace) { history.replaceState(null, '', h); if (typeof NAV !== 'undefined') { if (NAV.length) NAV[NAV.length - 1] = h; else NAV.push(h); } render(); window.scrollTo(0, 0); }
  else if (location.hash !== h) location.hash = h;
  else render();
}
// 1.9.3: explicit in-app nav stack (navDepth counter drifted: hashchange fired for both forward & back)
const NAV = [];
function navNote(h) {
  if (NAV.length >= 2 && NAV[NAV.length - 2] === h) NAV.pop();
  else if (NAV[NAV.length - 1] !== h) { NAV.push(h); if (NAV.length > 50) NAV.shift(); }
}
function back() {
  const reopenMe = S.meBackToDrawer && isMeDrawerChildRoute(route().name);
  if (NAV.length >= 2) {
    NAV.pop(); const prev = NAV.pop();
    history.replaceState(null, '', prev); navNote(prev); render(); window.scrollTo(0, 0);
    if (reopenMe && !isMeDrawerChildRoute(route().name)) {
      S.meBackToDrawer = false;
      openMeDrawer();
    }
  } else { NAV.length = 0; go('#/home', true); navNote('#/home'); }
}
window.addEventListener('hashchange', () => { navNote(location.hash || '#/home'); closeSheet(); closeMeDrawer(); if (route().name !== 'match' || (detailTabOf(route().arg) !== 'data' && detailTabOf(route().arg) !== 'events')) stopLivePoll(); if (route().name !== 'match' || detailTabOf(route().arg) !== 'events') stopChatPoll(); if (route().name !== 'match' || detailTabOf(route().arg) !== 'odds') stopOddsLivePoll(); if (route().name !== 'match') stopMatchStatusPoll(); if (route().name !== 'home') { stopHomeFocusRotate(); stopHomeLiveScorePoll(); } render(); window.scrollTo(0, 0); });
// Android back button hook (MainActivity calls this): returns 1 if handled in-page, 0 to exit the app
window.__appBack = () => {
  if (!$('#dialog').classList.contains('hidden')) { $('#dialog').querySelector('[data-r="0"]').click(); return 1; }
  if (!$('#sheet').classList.contains('hidden')) {
    if ($('#sheet').classList.contains('bonus-opt-mask')) { closeBonusOptSheet(); openCalcSubmitSheet(); return 1; }
    closeSheet(); return 1;
  }
  if (meDrawerOpen()) { closeMeDrawer(); return 1; }
  const r = route();
  if (r.name === 'login' && !S.guest && !loggedIn()) return 0;
  if (r.name === 'home') return 0;
  back(); return 1;
};

// ======================= shared UI =======================
const hdr = (title, { back: b = true, right = '' } = {}) =>
  `<header class="hdr center"><div class="hdr-side left">${b ? `<button class="ic-btn" data-act="back" aria-label="返回">${I.back}</button>` : '<span class="ph"></span>'}</div><h1 class="hdr-title">${esc(title)}</h1><div class="hdr-side right">${right || '<span class="ph"></span>'}</div></header>`;
const foot = () => ''; // 1.9.96: no data-source / disclaimer footer in end-user UI

const TOP_TAB_DEF = [['tribe', '论坛'], ['news', '头条'], ['results', '开奖']];
const TAB_DEF = [['home', '首页', I.home], ['schedule', '赛程', I.cal], ['predict', '预测', I.chart], ['data', '数据', I.data]];

/** Remember last 部落/头条/开奖 when user opens a top tab (not used for bottom-tool highlight). */
function noteFeedTop(rName) {
  if (!TOP_TABS.includes(rName)) return;
  S.feedTop = rName;
  try { localStorage.setItem('jc_feed_top', rName); } catch (_) {}
}
function activeTopTab(rName) {
  if (rName === 'tribe-club' || rName === 'tribe-post' || rName === 'tribe-compose') return 'tribe';
  return TOP_TABS.includes(rName) ? rName : '';
}

function matchFavBtn(x) {
  if (!x || x.afShell) return '<span class="ph"></span>';
  return `<button type="button" class="fav-btn ${isFav(x.id) ? 'on' : ''}" data-act="fav" data-id="${esc(x.id)}">${isFav(x.id) ? I.star + '已关注' : I.starO + '关注'}</button>`;
}

function matchEdgeNavBar(rightHtml) {
  return `<div class="hero-edge-nav" aria-label="赛事导航">
    <button type="button" class="ic-btn hero-ic md-back" data-act="back" aria-label="返回">${I.back}</button>
    <div class="hero-edge-r">${rightHtml || '<span class="ph"></span>'}</div>
  </div>`;
}

function meDrawerOpen() {
  const dr = $('#me-drawer');
  return !!(dr && dr.classList.contains('open'));
}
function closeMeDrawer() {
  const dr = $('#me-drawer'); const mask = $('#me-drawer-mask');
  if (dr) { dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true'); }
  if (mask) mask.classList.add('hidden');
  document.body.classList.remove('me-drawer-on');
}
function openMeDrawer() {
  syncMeDrawer();
  const dr = $('#me-drawer'); const mask = $('#me-drawer-mask');
  if (dr) { dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false'); }
  if (mask) mask.classList.remove('hidden');
  document.body.classList.add('me-drawer-on');
  if (loggedIn() && !S.membership) {
    api('/membership/status').then(ms => { S.membership = ms; if (meDrawerOpen()) syncMeDrawer(); }).catch(() => {});
  }
}
function meDrawerRow(g, ic, title, badge = '') {
  return `<button type="button" class="md-row" data-go="${g}"><span class="md-ic">${ic}</span><span class="md-lab">${esc(title)}</span>${badge ? `<span class="md-badge">${badge}</span>` : ''}<span class="md-arr">${I.arr}</span></button>`;
}
function meDrawerHtml() {
  const u = S.user; const li = loggedIn();
  const mem = isMember();
  const until = (S.membership && S.membership.memberUntil) || (u && u.memberUntil);
  const daysLeft = (S.membership && S.membership.daysLeft) || (u && u.memberDaysLeft) || 0;
  const nick = li ? esc(u?.nickname || '球迷') : '登录 / 注册';
  const sub = li
    ? (mem ? `会员至 ${esc(fmtMemberUntil(until))} · 剩余约 ${esc(String(daysLeft))} 天` : '方案与关注已云端同步')
    : '游客浏览中 · 登录后同步方案与关注';
  const plansN = (S.plans && S.plans.length) || 0;
  const favsN = (S.favs && S.favs.length) || 0;
  const friendsN = (S.userFollows && S.userFollows.length) || 0;
  let h = `<div class="md-hd">
    <button type="button" class="md-profile" data-go="${li ? '#/profile' : '#/login'}">
      <span class="md-av">${avatarSvg(li ? u?.avatar : 'a8')}</span>
      <span class="md-id"><b class="md-name">${nick}${mem ? '<span class="vip-chip">会员</span>' : ''}</b><span class="md-sub">${sub}</span></span>
    </button>
    <div class="md-stats">
      <button type="button" data-go="#/column/wallet"><b class="num">${(S.user && S.user.coinBalance != null) ? esc(String(S.user.coinBalance)) : '0'}</b><span>云朵</span></button>
      <button type="button" data-go="#/friends"><b class="num">${friendsN}</b><span>好友</span></button>
    </div>
  </div>`;
  h += `<div class="md-body">
    <div class="md-card">${meDrawerRow('#/plans', I.doc, '我的方案', plansN ? `${plansN} 个` : '')}${meDrawerRow('#/favs', I.star, '我的关注', favsN ? `${favsN} 场` : '')}${meDrawerRow('#/friends', I.mail, '好友', friendsN ? `${friendsN} 人` : '')}</div>
    <div class="md-card">${meDrawerRow('#/membership', I.vip, '会员中心', mem ? '已开通' : '未开通')}${meDrawerRow('#/orders', I.doc, '会员订单')}${meDrawerRow('#/kb', I.doc, '我的知识库', '个人预测')}</div>
    <div class="md-card">${meDrawerRow('#/column', I.column, '球迷专栏')}${meDrawerRow('#/column/wallet', I.vip, '云朵钱包')}${meDrawerRow('#/settings', I.gear, '设置 / 外观', THEME_LABEL[homeTheme()])}${meDrawerRow('#/about', I.info, '关于我们', 'v' + esc(CFG.version || ''))}</div>
  </div>`;
  if (!li) h += `<div class="md-foot"><button type="button" class="btn pri block" data-go="#/login">登录 / 注册</button></div>`;
  return h;
}
function syncMeDrawer() {
  const dr = $('#me-drawer');
  if (!dr) return;
  const html = meDrawerHtml();
  if (dr.innerHTML !== html) dr.innerHTML = html;
}
/** 顶栏中部 Tab 集：按底栏上下文切换（赛程=日期滚筒，其余=部落/头条/开奖）。 */
function shiftIssueDate(d, delta) {
  const t = new Date(String(d) + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + (delta | 0));
  return t.toISOString().slice(0, 10);
}
function schDateCenterLabel(d) {
  const tail = String(d).slice(5);
  const dn = dayName(d);
  if (dn === '今天' || dn === '明天' || dn === '昨天') return `${dn} ${tail}`;
  return `${dn} ${tail}`;
}
/** 1.9.184: 顶栏连续日期滚筒（横拖吸附 + 透视缩放，无灰框/蓝框）。 */
const SCH_SPINDLE_SLOT = 70;
const SCH_SPINDLE_RANGE = 40;
/** Max pointer travel (px) still treated as tap-to-open calendar on center. */
const SCH_SPINDLE_TAP_MOVE_PX = 8;
function schSpindlePointerXY(e, fallbackX, fallbackY) {
  if (e && e.clientX != null && e.clientY != null) return { x: e.clientX, y: e.clientY };
  return { x: fallbackX, y: fallbackY };
}
/** Center tap hit: overlay bounds when available, else spindle mid ± one slot width (WebView-safe). */
function schSpindleCenterTapHit(spindle, clientX, clientY) {
  if (clientX == null || clientY == null || !spindle) return false;
  const hi = spindle.querySelector('.tc-sch-date-spindle-center-hi');
  if (hi) {
    const hr = hi.getBoundingClientRect();
    if (clientX >= hr.left && clientX <= hr.right && clientY >= hr.top && clientY <= hr.bottom) return true;
  }
  const r = spindle.getBoundingClientRect();
  const midX = r.left + r.width / 2;
  const halfW = SCH_SPINDLE_SLOT / 2;
  return clientX >= midX - halfW && clientX <= midX + halfW && clientY >= r.top && clientY <= r.bottom;
}
function commitSchDate(next) {
  if (!next || next === S.schDate) return false;
  S.schDate = next;
  invalidateTabKeep('schedule');
  if (softPatchSchedule()) { syncTopChrome('schedule'); return true; }
  render({ force: true });
  return true;
}
function schDateSpindleShort(d) { return String(d).slice(5); }
function schDateSpindleHtml() {
  const cur = S.schDate || bjDate(0);
  const hi = schDateCenterLabel(cur);
  return `<div class="tc-sch-date-spindle-wrap" role="group" aria-label="赛程日期" data-sch-date="${esc(cur)}">
    <div class="tc-sch-date-spindle" aria-live="polite">
      <div class="tc-sch-date-spindle-track"></div>
      <div class="tc-sch-date-spindle-center-hi" role="button" data-act="schDateOpenCal" aria-label="打开日历">${esc(hi)}</div>
    </div>
  </div>`;
}
function updateSchDateSpindleCenterHi(spindle) {
  const hi = spindle && spindle.querySelector('.tc-sch-date-spindle-center-hi');
  if (!hi) return;
  const sel = S.schDate || bjDate(0);
  const lab = schDateCenterLabel(sel);
  hi.textContent = lab;
  hi.setAttribute('aria-label', '打开日历');
}
/** Gray-only track labels (blue center lives in overlay when settled). */
function paintSchDateSpindlePerspective(spindle, track) {
  if (!spindle || !track) return;
  const cx = spindle.clientWidth / 2;
  const rect = spindle.getBoundingClientRect();
  track.querySelectorAll('.tc-sch-date-spindle-slot').forEach(el => {
    const r = el.getBoundingClientRect();
    const mid = (r.left + r.right) / 2 - rect.left;
    const abs = Math.abs((mid - cx) / SCH_SPINDLE_SLOT);
    const scale = Math.max(0.68, 1.35 - 0.32 * abs);
    const opacity = Math.max(0.28, 1 - 0.28 * abs);
    const lab = el.querySelector('.tc-sch-date-spindle-label');
    if (!lab) return;
    lab.style.transform = 'scale(' + scale.toFixed(3) + ')';
    lab.style.opacity = opacity.toFixed(3);
    lab.style.fontWeight = abs < 0.35 ? '600' : '500';
    lab.style.fontSize = abs < 0.35 ? '14px' : '12px';
    lab.style.color = '#8E8E93';
    lab.textContent = schDateSpindleShort(el.dataset.date);
    el.removeAttribute('aria-current');
  });
  updateSchDateSpindleCenterHi(spindle);
}
let schCalViewMonth = null;
/** Ignore one mask click right after opening calendar (same-gesture safety). */
let schSheetDismissGuardUntil = 0;
function renderSchDateCalendarSheet() {
  const sh = $('#sheet');
  if (!sh || sh.classList.contains('hidden') || !schCalViewMonth) return;
  const sel = S.schDate || bjDate(0);
  const todayStr = bjDate(0);
  const y = schCalViewMonth.getUTCFullYear();
  const m = schCalViewMonth.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    let dayNum, cellDate, other = false;
    if (i < startPad) {
      dayNum = prevDays - startPad + i + 1;
      const pd = new Date(Date.UTC(y, m - 1, dayNum));
      cellDate = pd.toISOString().slice(0, 10);
      other = true;
    } else if (i >= startPad + daysInMonth) {
      dayNum = i - (startPad + daysInMonth) + 1;
      const nd = new Date(Date.UTC(y, m + 1, dayNum));
      cellDate = nd.toISOString().slice(0, 10);
      other = true;
    } else {
      dayNum = i - startPad + 1;
      cellDate = new Date(Date.UTC(y, m, dayNum)).toISOString().slice(0, 10);
    }
    const cls = ['sch-date-cal-day'];
    if (other) cls.push('other');
    if (cellDate === todayStr) cls.push('today');
    if (cellDate === sel) cls.push('selected');
    cells += `<button type="button" class="${cls.join(' ')}" data-act="schCalPick" data-date="${esc(cellDate)}">${dayNum}</button>`;
  }
  sh.innerHTML = `<div class="sch-date-cal-sheet" role="dialog" aria-label="选择日期">
    <div class="sch-date-cal-head">
      <div class="sch-date-cal-title">${y}年${m + 1}月</div>
      <div class="sch-date-cal-nav">
        <button type="button" data-act="schCalPrev" aria-label="上个月">‹</button>
        <button type="button" data-act="schCalNext" aria-label="下个月">›</button>
      </div>
    </div>
    <div class="sch-date-cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
    <div class="sch-date-cal-grid">${cells}</div>
    <div class="sch-date-cal-foot">
      <button type="button" data-act="schCalCancel">取消</button>
      <button type="button" data-act="schCalToday">今天</button>
    </div>
  </div>`;
}
function openSchDateCalendar() {
  const sel = S.schDate || bjDate(0);
  const p = sel.split('-').map(Number);
  schCalViewMonth = new Date(Date.UTC(p[0], p[1] - 1, 1));
  const sh = $('#sheet');
  schSheetDismissGuardUntil = Date.now() + 400;
  sh.classList.remove('hidden');
  renderSchDateCalendarSheet();
}
function rebuildSchDateSpindle(wrap, state) {
  const spindle = wrap.querySelector('.tc-sch-date-spindle');
  const track = wrap.querySelector('.tc-sch-date-spindle-track');
  if (!spindle || !track) return;
  const sel = S.schDate || bjDate(0);
  track.innerHTML = '';
  track.style.width = (SCH_SPINDLE_RANGE * 2 + 1) * SCH_SPINDLE_SLOT + 'px';
  for (let i = -SCH_SPINDLE_RANGE; i <= SCH_SPINDLE_RANGE; i++) {
    const d = shiftIssueDate(sel, i);
    const el = document.createElement('div');
    el.className = 'tc-sch-date-spindle-slot';
    el.style.width = SCH_SPINDLE_SLOT + 'px';
    el.dataset.date = d;
    const lab = document.createElement('span');
    lab.className = 'tc-sch-date-spindle-label';
    lab.textContent = schDateSpindleShort(d);
    el.appendChild(lab);
    track.appendChild(el);
  }
  state.offsetPx = 0;
  const base = spindle.clientWidth / 2 - (SCH_SPINDLE_RANGE * SCH_SPINDLE_SLOT + SCH_SPINDLE_SLOT / 2);
  track.style.transition = 'none';
  track.style.transform = 'translate3d(' + base + 'px,0,0)';
  paintSchDateSpindlePerspective(spindle, track);
}
function initSchDateSpindle() {
  const wrap = document.querySelector('#top-chrome .tc-sch-date-spindle-wrap');
  if (!wrap) return;
  const spindle = wrap.querySelector('.tc-sch-date-spindle');
  const track = wrap.querySelector('.tc-sch-date-spindle-track');
  if (!spindle || !track) return;
  let state = wrap._schSpindleState;
  if (!state) {
    state = { offsetPx: 0, pointerDown: false, dragging: false, moved: false, startX: 0, startY: 0, lastClientX: 0, lastClientY: 0, startOffset: 0, pressTimer: null };
    wrap._schSpindleState = state;
    if (wrap._schSpindleAbort) wrap._schSpindleAbort.abort();
    const ac = new AbortController();
    wrap._schSpindleAbort = ac;
    const sig = ac.signal;
    const centerTrack = () => spindle.clientWidth / 2 - (SCH_SPINDLE_RANGE * SCH_SPINDLE_SLOT + SCH_SPINDLE_SLOT / 2);
    const applyTransform = animate => {
      const base = centerTrack();
      track.style.transition = animate ? 'transform 200ms cubic-bezier(.2,.9,.2,1)' : 'none';
      track.style.transform = 'translate3d(' + (base + state.offsetPx) + 'px,0,0)';
    };
    const snap = () => {
      const dayShift = Math.round(-state.offsetPx / SCH_SPINDLE_SLOT);
      if (dayShift !== 0) {
        window.__schDateSuppressClick = true;
        commitSchDate(shiftIssueDate(S.schDate || bjDate(0), dayShift));
        setTimeout(() => { window.__schDateSuppressClick = false; }, 80);
        return;
      }
      state.offsetPx = 0;
      applyTransform(true);
      paintSchDateSpindlePerspective(spindle, track);
    };
    wrap.addEventListener('pointerdown', e => {
      if (!e.target.closest('.tc-sch-date-spindle')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pt = schSpindlePointerXY(e, 0, 0);
      state.pointerDown = true;
      state.moved = false;
      state.dragging = false;
      state.startX = pt.x;
      state.startY = pt.y;
      state.lastClientX = pt.x;
      state.lastClientY = pt.y;
      state.startOffset = state.offsetPx;
      track.style.transition = 'none';
      clearTimeout(state.pressTimer);
      state.pressTimer = setTimeout(() => {
        if (!state.pointerDown || state.moved) return;
        spindle.classList.add('is-pressing');
      }, 180);
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    }, { signal: sig });
    wrap.addEventListener('pointermove', e => {
      if (!state.pointerDown) return;
      const pt = schSpindlePointerXY(e, state.lastClientX, state.lastClientY);
      state.lastClientX = pt.x;
      state.lastClientY = pt.y;
      const dx = pt.x - state.startX;
      const dy = pt.y - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > SCH_SPINDLE_TAP_MOVE_PX) {
        state.moved = true;
        state.dragging = true;
        spindle.classList.add('is-dragging');
        spindle.classList.remove('is-pressing');
        clearTimeout(state.pressTimer);
      }
      if (!state.dragging) return;
      state.offsetPx = state.startOffset + dx;
      applyTransform(false);
      paintSchDateSpindlePerspective(spindle, track);
    }, { signal: sig });
    const up = e => {
      if (!state.pointerDown) return;
      const wasDragging = state.dragging;
      const wasMoved = state.moved;
      const pt = schSpindlePointerXY(e, state.lastClientX, state.lastClientY);
      state.lastClientX = pt.x;
      state.lastClientY = pt.y;
      state.pointerDown = false;
      clearTimeout(state.pressTimer);
      state.dragging = false;
      spindle.classList.remove('is-dragging', 'is-pressing');
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
      if (wasDragging) {
        window.__schDateSuppressClick = true;
        setTimeout(() => { window.__schDateSuppressClick = false; }, 120);
        snap();
        return;
      }
      if (wasMoved) {
        window.__schDateSuppressClick = true;
        setTimeout(() => { window.__schDateSuppressClick = false; }, 120);
      }
    };
    wrap.addEventListener('pointerup', up, { signal: sig });
    wrap.addEventListener('pointercancel', up, { signal: sig });
    if (!window.__schSpindleResizeBound) {
      window.__schSpindleResizeBound = true;
      window.addEventListener('resize', () => {
        const w = document.querySelector('#top-chrome .tc-sch-date-spindle-wrap');
        if (!w || !w._schSpindleState) return;
        const sp = w.querySelector('.tc-sch-date-spindle');
        const tr = w.querySelector('.tc-sch-date-spindle-track');
        if (!sp || !tr) return;
        const st = w._schSpindleState;
        const base = sp.clientWidth / 2 - (SCH_SPINDLE_RANGE * SCH_SPINDLE_SLOT + SCH_SPINDLE_SLOT / 2);
        tr.style.transition = 'none';
        tr.style.transform = 'translate3d(' + (base + st.offsetPx) + 'px,0,0)';
        paintSchDateSpindlePerspective(sp, tr);
      });
    }
  }
  rebuildSchDateSpindle(wrap, state);
}
function topChromeCenterHtml(rName) {
  if (rName === 'schedule') return schDateSpindleHtml();
  if (rName === 'data') {
    const sec = dataSectionOf();
    const tabs = [['team', '球队'], ['star', '球星']].map(([k, lab]) =>
      `<button type="button" class="tc-tab tc-tab--data${sec === k ? ' on' : ''}" data-act="dataSection" data-sec="${k}"${sec === k ? ' aria-current="true"' : ''}>${esc(lab)}</button>`
    ).join('');
    return `<nav class="tc-tabs tc-tabs--data" aria-label="数据分类">${tabs}</nav>`;
  }
  if (rName === 'tribe') {
    const q = esc(S.tribeSearchQ || '');
    return `<div class="tc-tribe-search" role="search" aria-label="搜索论坛">
      <span class="tc-tribe-search-ic" aria-hidden="true">${I.search}</span>
      <input type="search" id="tribe-hub-search" class="tc-tribe-search-inp" placeholder="搜索球队/圈子" value="${q}" autocomplete="off" enterkeyhint="search" maxlength="40">
    </div>`;
  }
  const activeTop = activeTopTab(rName);
  const tabs = TOP_TAB_DEF.map(([k, lab]) =>
    `<button type="button" class="tc-tab${k === activeTop ? ' on' : ''}" data-go="#/${k}"${k === activeTop ? ' aria-current="page"' : ''}>${esc(lab)}</button>`
  ).join('');
  return `<nav class="tc-tabs" aria-label="内容">${tabs}</nav>`;
}
function syncTopChrome(rName) {
  const el = $('#top-chrome');
  const app = $('#app');
  if (!el || !app) return;
  const show = isShellTab(rName);
  el.classList.toggle('hidden', !show);
  app.classList.toggle('has-top-chrome', show);
  el.classList.toggle('top-chrome--schedule', show && rName === 'schedule');
  el.classList.toggle('top-chrome--data', show && rName === 'data');
  el.classList.toggle('top-chrome--tribe', show && rName === 'tribe');
  if (!show) return;
  const activeTop = activeTopTab(rName);
  if (activeTop) noteFeedTop(activeTop);
  const li = loggedIn();
  const av = avatarSvg(li ? (S.user && S.user.avatar) || 'a1' : 'a8');
  const msgDot = (S.plans && S.plans.length) ? '<i class="tc-dot" aria-hidden="true"></i>' : '';
  const center = topChromeCenterHtml(rName);
  const want = `<div class="tc-slot tc-slot-l"><button type="button" class="tc-avatar" data-act="openMe" aria-label="我的">${av}</button></div>
    ${center}
    <div class="tc-slot tc-slot-r"><div class="tc-actions">
      <button type="button" class="tc-ic" data-go="#/search" aria-label="搜索">${I.search}</button>
      <button type="button" class="tc-ic" data-go="#/plans" aria-label="我的消息">${I.mail}${msgDot}</button>
    </div></div>`;
  if (el.innerHTML !== want) el.innerHTML = want;
  if (show && rName === 'schedule') initSchDateSpindle();
}
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
  const pr = effectivePredict(m);
  const row = classifyScoreRow(m);
  return `<div class="card mc" data-go="#/match/${encodeURIComponent(m.id)}">
    ${matchCardMeta(m)}
    ${matchTeamsRow(m, row)}
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
/** 开奖爆冷：赛果与胜平负赔率热门（隐含概率最高项）相反。 */
function isMarketUpset(r) {
  const { res, fav } = resultInfo(r);
  return !!(res && fav && fav !== res);
}
function resultCard(r) {
  const row = classifyScoreRow(r);
  if (!row._half && r.half) row._half = r.half;
  if (!row._full && r.full) row._full = r.full;
  const upset = isMarketUpset(r);
  return `<div class="card mc mc-result${upset ? ' is-upset' : ''}" data-go="#/match/${encodeURIComponent(r.id)}">
    ${upset ? '<span class="rs-upset-tag">爆冷</span>' : ''}
    ${matchCardMeta(r)}
    ${matchTeamsRow(r, row)}</div>`;
}

// ======================= tab pages =======================
/** 1.9.86: news slide uses article cover; banner/home-strip tip「仅供参考」removed */
const BANNER_N = 3;
const BN_HOT = 'banners/slide-hot-match.jpg';
const BN_NEWS = 'banners/slide-news.jpg';
const BN_CONTRA = 'banners/slide-contra.jpg';
const LEAGUE_PRIO = ['英超', '西甲', '意甲', '德甲', '法甲', '欧冠', '欧罗巴', '欧协联', '世界杯', '欧洲杯', '国际赛', '亚运', '亚冠', '中超', '日职', '韩职', '荷甲', '葡超', '英冠'];
const prio = l => { const i = LEAGUE_PRIO.findIndex(x => String(l).includes(x)); return i < 0 ? 99 : i; };

function bannerBgImg(src, alt) {
  return `<img class="bn-bg" src="${esc(src)}" alt="${esc(alt || '')}" decoding="async" loading="eager">`;
}
function pickHotBannerMatch() {
  const pool = focusMatchPool();
  if (!pool.length) return null;
  const live = pool.find(m => classifyScoreRow(m)._kind === 'live');
  if (live) return live;
  const up = pool.find(m => kickoff(m) > Date.now());
  return up || pool[0];
}
function pickContraBannerHit() {
  const by = S.leanByMatch || {};
  const rs = S.results || [];
  const hits = [];
  for (const r of rs) {
    const lf = by[String(r.id)];
    if (!lf || lf.speakMode !== 'amplify') continue;
    const leanHit = lf.amplifyHit != null ? !!lf.amplifyHit : !!lf.leanHit;
    const marketHit = lf.marketHit != null ? !!lf.marketHit : false;
    if (leanHit && !marketHit) hits.push({ r, lf });
  }
  hits.sort((a, b) => kickoff(b.r) - kickoff(a.r));
  return hits[0] || null;
}
function slideHotMatch(m, theme) {
  const bg = BN_HOT; // stadium night photo — replaces glass pillars/sphere
  if (!m) {
    return `<a class="hero-slide bn-slide bn-match" href="#/schedule" data-go="#/schedule">
      ${bannerBgImg(bg, '今日热门')}
      <div class="bn-shade"></div>
      <div class="bn-poster">
        <span class="bn-kicker">今日热门</span>
        <h2>查看赛程</h2>
        <p>五大联赛 · 官方即时赔率</p>
        <span class="hero-cta">进入赛程</span>
      </div>
    </a>`;
  }
  const row = classifyScoreRow(m);
  let when, midHtml;
  if (row._kind === 'ft') {
    when = '完场';
    midHtml = `<span class="bn-score num">${esc(row._full || m.full || '-')}</span><small>完场</small>`;
  } else if (row._kind === 'live') {
    const sc = row._homeScore != null ? `${row._homeScore}:${row._awayScore}` : (m.liveScore || '');
    when = sc ? `进行中 ${esc(sc)}` : '进行中';
    midHtml = sc
      ? `<span class="bn-score num">${esc(sc)}</span><small>LIVE</small>`
      : `<span class="bn-vs-lab">VS</span><small>LIVE</small>`;
  } else {
    when = `${esc(m.date || '').slice(5)} ${esc(m.time || '')}`;
    midHtml = `<span class="bn-vs-lab">VS</span><small>${esc(row._phaseZh || '未开赛')}</small>`;
  }
  const go = `#/match/${encodeURIComponent(m.id)}`;
  return `<a class="hero-slide bn-slide bn-match" href="${go}" data-go="${go}">
    ${bannerBgImg(bg, (m.home || '') + ' vs ' + (m.away || ''))}
    <div class="bn-shade"></div>
    <div class="bn-poster bn-match-poster">
      <span class="bn-kicker">${esc(m.league || '热门赛事')} · ${when}</span>
      <div class="bn-vs">
        <div class="bn-side">${badge(m.home, '', m.homeLogo)}<b>${esc(m.home)}</b></div>
        <div class="bn-mid">${midHtml}</div>
        <div class="bn-side r"><b>${esc(m.away)}</b>${badge(m.away, '', m.awayLogo)}</div>
      </div>
      <span class="hero-cta">${row._kind === 'ft' ? '查看复盘' : '赛前情报'}</span>
    </div>
  </a>`;
}
function slideNews(item) {
  const go = item ? `#/news/${encodeURIComponent(item.id)}` : '#/news';
  const title = item ? item.title : '体坛资讯';
  // 1.9.89: do not show article source on carousel — badge overlapped headline
  // Prefer the article's own cover (full-res via proxy); fall back to designed news BG
  const coverRaw = item && (item.thumbFull || item.thumb || item.cover || '');
  const cover = coverRaw ? newsImgSrc(coverRaw, 'full') : '';
  const bg = cover || BN_NEWS;
  const bgTag = cover
    ? `<img class="bn-bg" src="${esc(bg)}" alt="${esc(title)}" decoding="async" loading="eager" onerror="this.onerror=null;this.src='${esc(BN_NEWS)}'">`
    : bannerBgImg(BN_NEWS, title);
  return `<a class="hero-slide bn-slide bn-news" href="${go}" data-go="${go}">
    ${bgTag}
    <div class="bn-shade bn-shade-news"></div>
    <div class="bn-poster bn-news-poster">
      <h2 class="bn-news-title">${esc(title)}</h2>
      <span class="hero-cta">阅读全文</span>
    </div>
  </a>`;
}
function slideContra(hit) {
  if (!hit) {
    return `<a class="hero-slide bn-slide bn-contra" href="#/results" data-go="#/results">
      ${bannerBgImg(BN_CONTRA, '逆盘命中')}
      <div class="bn-shade bn-shade-contra"></div>
      <div class="bn-poster">
        <span class="bn-kicker">逆盘命中</span>
        <h2>近期表态对照</h2>
        <p>表态命中且与赔率热门相反</p>
        <span class="hero-cta">查看开奖</span>
      </div>
    </a>`;
  }
  const { r, lf } = hit;
  const leanLab = lf.pickText || (lf.lean && (PICK.had[lf.lean] || lf.lean)) || '表态';
  const mktLab = lf.marketLean && (PICK.had[lf.marketLean] || lf.marketLean);
  const go = `#/match/${encodeURIComponent(r.id)}`;
  return `<a class="hero-slide bn-slide bn-contra" href="${go}" data-go="${go}">
    ${bannerBgImg(BN_CONTRA, '逆盘命中')}
    <div class="bn-shade bn-shade-contra"></div>
    <div class="bn-poster bn-contra-poster">
      <span class="bn-kicker">逆盘命中 · ${esc(r.league || '')}</span>
      <div class="bn-vs">
        <div class="bn-side">${badge(r.home, 'sm', r.homeLogo)}<b>${esc(r.home)}</b></div>
        <div class="bn-mid"><span class="bn-score num">${esc(r.full || '-')}</span><small>完场</small></div>
        <div class="bn-side r"><b>${esc(r.away)}</b>${badge(r.away, 'sm', r.awayLogo)}</div>
      </div>
      <p class="bn-contra-tag">表态 ${esc(leanLab)} ✓${mktLab ? ' · 热门 ' + esc(mktLab) + ' ✗' : ''}</p>
      <span class="hero-cta">查看复盘</span>
    </div>
  </a>`;
}
function homeHeroSlides(theme, newsItem) {
  const hot = pickHotBannerMatch();
  const contra = pickContraBannerHit();
  return slideHotMatch(hot, theme) + slideNews(newsItem || null) + slideContra(contra);
}
/** 1.9.90: exclude Dongqiudi 战报bot / auto match-slice & highlight reels from homepage carousel */
function isMatchSliceNews(it) {
  if (!it) return true;
  if (it.matchSlice) return true;
  const author = String(it.authorName || '').trim();
  if (author === '战报bot') return true;
  const t = String(it.title || '');
  if (/半场战报|个人集锦|赛后数据|数据报告|比赛日/.test(t)) return true;
  // Auto scoreline card titles e.g. 「纽约城1-1洛杉矶，…」/「剑南春｜巴萨5-2…」
  if (/^(?:剑南春)?[｜丨]/.test(t) && /\d{1,2}\s*[-：:]\s*\d{1,2}/.test(t)) return true;
  if (/^.{1,28}\d{1,2}\s*[-：:]\s*\d{1,2}.{0,28}[，,]/.test(t)
    && !/逆转|绝杀|复盘|专访|采访|官宣|加盟|续约|伤停|停赛|手术|报平安|宣判|败诉|诉讼/.test(t)) return true;
  return false;
}
function isFootballBannerNews(it) {
  if (!it || !String(it.title || '').trim()) return false;
  const sid = String(it.sourceId || '');
  if (sid.startsWith('dq_')) return true;
  if (sid === 'chinanews' || sid === 'people') {
    const hay = String(it.title || '') + ' ' + String(it.summary || '');
    if (/网球|乒乓|羽毛球|攀岩|铁人三项|游泳|篮球|排球|田径|体操|围棋|中网|郑钦文|全运会|民族体育|徒手攀/.test(hay)) return false;
    return /足球|中超|英超|西甲|意甲|德甲|法甲|欧冠|国足|世界杯|亚冠|足协|梅西|C罗|内马尔/.test(hay);
  }
  return false;
}
function newsPublishedBjDate(it) {
  const ms = it && it.publishedAt ? Date.parse(it.publishedAt) : NaN;
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
}
/** Random among today's crawled football news; skip match-slice. Fallback: recent non-slice. */
function pickHomeBannerNews(items) {
  const list = (items || []).filter(it => it && !isMatchSliceNews(it) && isFootballBannerNews(it));
  const today = bjDate(0);
  const withThumb = (arr) => arr.filter(it => it.thumb || it.thumbFull);
  let pool = withThumb(list.filter(it => newsPublishedBjDate(it) === today));
  if (!pool.length) pool = list.filter(it => newsPublishedBjDate(it) === today);
  if (!pool.length) pool = withThumb(list);
  if (!pool.length) pool = list;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
async function fillHomeBanners() {
  const track = document.getElementById('bnTrack');
  if (!track) return;
  const theme = homeTheme();
  let newsItem = null;
  try {
    // Pull a wider pool so random pick among today's crawled 足坛资讯 (not first match-slice)
    const j = await api('/news?limit=50', { timeout: 12000 });
    const items = (j && j.items) || [];
    newsItem = pickHomeBannerNews(items);
    S.homeBannerNews = newsItem;
  } catch { /* keep fallback */ }
  const idx = S.bannerIdx || 0;
  track.innerHTML = homeHeroSlides(theme, newsItem);
  const wrap = track.parentElement;
  if (wrap) {
    const dots = wrap.querySelector('.dots');
    if (dots) dots.innerHTML = Array.from({ length: BANNER_N }, (_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
  }
  initBanner();
}
/** Home hero strip: live → recently kicked-off (within window) → upcoming not-started. */
const HOME_FOCUS_RECENT_MS = 3 * 3600e3;

/** Same fixture union as schedule/search — overnight live rows often live only in schedule. */
function homeFocusMatchRows() {
  const byId = new Map();
  for (const m of [...(S.schedule || []), ...(S.matches || [])]) {
    if (m && m.id) byId.set(String(m.id), m);
  }
  return [...byId.values()];
}

function homeFocusLiveScoreIds() {
  const now = Date.now();
  const ids = [];
  for (const m of homeFocusMatchRows()) {
    const ko = kickoff(m);
    if (!Number.isFinite(ko)) continue;
    if (ko >= now - HOME_FOCUS_RECENT_MS && ko <= now + 2 * 3600e3) ids.push(String(m.id));
  }
  return [...new Set(ids)].slice(0, 80);
}

function homeFocusBuckets() {
  const ms = homeFocusMatchRows();
  const now = Date.now();
  const ranked = ms.map(m => ({ m, row: classifyScoreRow(m) }));
  const sortLive = (a, b) => prio(a.m.league) - prio(b.m.league) || kickoff(a.m) - kickoff(b.m);
  const sortRecent = (a, b) => prio(a.m.league) - prio(b.m.league) || kickoff(b.m) - kickoff(a.m);
  const sortUp = (a, b) => prio(a.m.league) - prio(b.m.league) || kickoff(a.m) - kickoff(b.m);
  const live = ranked.filter(x => x.row._kind === 'live').sort(sortLive);
  const recent = ranked.filter(x => {
    if (x.row._kind === 'ft' || x.row._kind === 'live') return false;
    const ko = kickoff(x.m);
    return now >= ko && now < ko + HOME_FOCUS_RECENT_MS;
  }).sort(sortRecent);
  const up = ranked.filter(x => x.row._kind === 'ns' && kickoff(x.m) > now).sort(sortUp);
  const seen = new Set();
  const dedupe = (list) => {
    const out = [];
    for (const { m } of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  };
  const rotatePool = dedupe([...live, ...recent]);
  seen.clear();
  const fallback = dedupe(up).slice(0, 6);
  return { rotatePool, fallback };
}

function focusMatchPool() {
  const { rotatePool, fallback } = homeFocusBuckets();
  if (rotatePool.length) return rotatePool.slice(0, 6);
  return fallback;
}

function pickHomeFocusMatches() {
  const { rotatePool, fallback } = homeFocusBuckets();
  const pool = rotatePool.length ? rotatePool : fallback;
  if (!pool.length) return [];
  const idx = (S.homeFocusIdx || 0) % pool.length;
  if (homeTheme() === 'luxury') {
    if (pool.length === 1) return pool;
    return [pool[idx], pool[(idx + 1) % pool.length]];
  }
  return [pool[idx]];
}

function stopHomeFocusRotate() {
  if (S.homeFocusRotateIv) {
    clearInterval(S.homeFocusRotateIv);
    S.homeFocusRotateIv = null;
  }
}

function patchHomeFocusStrip() {
  const row = document.querySelector('.focus-row');
  const pitch = document.querySelector('.focus-pitch-wrap');
  const picks = pickHomeFocusMatches();
  if (row) {
    row.innerHTML = picks.length
      ? picks.map(focusCardCompact).join('')
      : '<div class="focus-empty note">暂无焦点赛事</div>';
    return true;
  }
  if (pitch) {
    pitch.innerHTML = picks[0]
      ? focusCardPitch(picks[0])
      : '<div class="focus-empty note">暂无焦点赛事</div>';
    return true;
  }
  return false;
}

function patchHomeHeroHotMatch() {
  const track = document.getElementById('bnTrack');
  if (!track || !track.firstElementChild) return false;
  const theme = homeTheme();
  const wrap = document.createElement('div');
  wrap.innerHTML = slideHotMatch(pickHotBannerMatch(), theme);
  const next = wrap.firstElementChild;
  if (!next) return false;
  track.firstElementChild.replaceWith(next);
  return true;
}

function stopHomeLiveScorePoll() {
  if (S.homeLiveScorePoll) { clearInterval(S.homeLiveScorePoll); S.homeLiveScorePoll = null; }
}

function ensureHomeLiveScorePoll() {
  stopHomeLiveScorePoll();
  const { rotatePool } = homeFocusBuckets();
  const liveN = rotatePool.filter(m => classifyScoreRow(m)._kind === 'live').length;
  if (!liveN) return;
  const ids = homeFocusLiveScoreIds();
  if (!ids.length) return;
  S.homeLiveScorePoll = setInterval(async () => {
    if (document.hidden || route().name !== 'home') { stopHomeLiveScorePoll(); return; }
    await loadLiveScores(ids, { force: true });
    patchHomeFocusStrip();
    patchHomeHeroHotMatch();
  }, 50000);
}

function startHomeFocusRotate() {
  stopHomeFocusRotate();
  const { rotatePool } = homeFocusBuckets();
  if (rotatePool.length < 2) return;
  S.homeFocusRotateIv = setInterval(() => {
    if (route().name !== 'home') {
      stopHomeFocusRotate();
      return;
    }
    const pool = homeFocusBuckets().rotatePool;
    if (pool.length < 2) {
      stopHomeFocusRotate();
      return;
    }
    S.homeFocusIdx = ((S.homeFocusIdx || 0) + 1) % pool.length;
    if (!patchHomeFocusStrip()) render();
  }, 60000);
}
function focusCardCompact(m) {
  const row = classifyScoreRow(m);
  let mid, meta;
  if (row._kind === 'ft') {
    mid = esc(row._full || m.full || '-'); meta = '完场';
  } else if (row._kind === 'live') {
    mid = row._homeScore != null ? esc(`${row._homeScore}:${row._awayScore}`) : (m.liveScore ? esc(m.liveScore) : 'VS');
    const lab = scoreMinuteLab(row);
    meta = typeof lab === 'string' && lab.indexOf('&') >= 0 ? lab : esc(lab || row._phaseZh || '进行中');
  } else {
    mid = esc(m.time || 'VS'); meta = esc(row._phaseZh || '未开赛');
  }
  return `<button type="button" class="focus-card" data-go="#/match/${encodeURIComponent(m.id)}">
    <div class="fc-teams">
      <div class="fc-side"><span class="fc-name">${esc(m.home)}</span>${badge(m.home, 'sm', m.homeLogo)}</div>
      <div class="fc-mid"><span class="fc-score num">${mid}</span><small>${meta}</small></div>
      <div class="fc-side r"><span class="fc-name">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div>
    </div>
  </button>`;
}
function focusCardPitch(m) {
  const row = classifyScoreRow(m);
  let center;
  if (row._kind === 'ft') {
    center = esc(row._full || m.full || '-') + ' · 完场';
  } else if (row._kind === 'live') {
    const sc = row._homeScore != null ? `${row._homeScore}:${row._awayScore}` : (m.liveScore || 'VS');
    const lab = scoreMinuteLab(row) || row._phaseZh || '进行中';
    center = esc(sc) + ' · ' + (typeof lab === 'string' && lab.indexOf('&') >= 0 ? lab : esc(lab));
  } else {
    center = esc((m.time || '') || '—');
  }
  return `<button type="button" class="focus-bar" data-go="#/match/${encodeURIComponent(m.id)}">
    ${badge(m.home, 'sm', m.homeLogo)}
    <span class="fb-name">${esc(m.home)}</span>
    <span class="fb-time num">${center}</span>
    <span class="fb-name r">${esc(m.away)}</span>
    ${badge(m.away, 'sm', m.awayLogo)}
  </button>`;
}
/** 1.9.139: home 「比赛态度」 — same column_posts as match 态度 tab (平台简报). */
function homeAttitudeWhen(m) {
  const t = (m.time || '').slice(0, 5);
  return `${dayName(m.date)} ${t}`;
}
function homeAttitudeRows(ms) {
  return ms.map(m => ({ m, pr: effectivePredict(m) }))
    .filter(x => x.pr && Date.now() < kickoff(x.m))
    .sort((a, b) => {
      const as = isSpeakPr(a.pr) ? 2 : (isPendingPr(a.pr) ? 0 : 1);
      const bs = isSpeakPr(b.pr) ? 2 : (isPendingPr(b.pr) ? 0 : 1);
      if (bs !== as) return bs - as;
      return b.pr.conf - a.pr.conf;
    })
    .slice(0, 12);
}
function homeAttitudeCardFromPost(p, m) {
  const pr = m ? effectivePredict(m) : null;
  const pending = pr && isPendingPr(pr);
  const watch = pr && !pending && !isSpeakPr(pr);
  const confPct = p && /信心\s*(\d+)\s*%/.test(p.title || '')
    ? parseInt((p.title || '').replace(/.*信心\s*(\d+)\s*%.*/, '$1'), 10)
    : (pr ? Math.round(pr.conf * 100) : 0);
  const confLab = pending ? '参考' : (watch ? '观望' : '信心指数');
  const pickLab = (p && p.pickLabel) || (pending ? (pr.speakLabel || '情报加载中…') : (watch ? (pr.speakLabel || pr.text) : (pr && (pr.pickText || pr.text)) || '—'));
  const leftLab = pending ? '状态' : (watch ? '表态' : '推荐');
  const locked = !!(p && p.locked);
  const bodyTeaser = locked
    ? (p.bodyPreview || '付费内容 · 解锁后查看完整分析')
    : sanitizeBanCopy((p && p.body) || (m && pr ? shortReason(m, pr) : '') || '');
  const teaserShort = bodyTeaser.length > 80 ? bodyTeaser.slice(0, 78) + '…' : bodyTeaser;
  const title = (p && p.title) || (m ? `【${m.league || '赛事'}】${m.home} VS ${m.away}` : '平台简报');
  const lvl = pr && pr.lvl ? pr.lvl : ['l0', '简报'];
  const speakTag = (!pending && !watch && pr && pr.multiFactor) ? '<span class="ha-tag">表态</span>' : '';
  const pickCls = pr && pr.top && (pr.top === 'h' || pr.top === 'd' || pr.top === 'a') ? ` pick-${pr.top}` : '';
  const st = (p && p.author && p.author.stats) || null;
  const price = Number(p && p.priceCoins) || 0;
  const bought = Number(p && p.purchaseCount) || 0;
  const mid = (p && p.matchId) || (m && m.id) || '';
  const matchBar = m
    ? `${esc(homeAttitudeWhen(m))} · 【${esc(m.league || '联赛')}】 ${esc(m.home)} VS ${esc(m.away)} · 单场`
    : (p && p.matchLabel ? esc(p.matchLabel) + ' · 单场' : '单场');
  const go = mid ? `#/match/${encodeURIComponent(mid)}` : (p && p.id ? `#/column/post/${p.id}` : '#/predict');
  return `<button type="button" class="ha-card" data-go="${go}">
    <div class="ha-hd">
      <div class="ha-brand">
        <span class="ha-av" aria-hidden="true">${I.chart}</span>
        <div class="ha-id">
          <span class="ha-name">平台简报</span>
          <span class="ha-badges"><span class="lvl ${lvl[0]}">${esc(lvl[1])}</span>${speakTag}${colStatsBadges(st)}</span>
        </div>
      </div>
      <div class="ha-conf">${colHitPct(st) || `<small>${esc(confLab)}</small><b class="num">${confPct}<span class="ha-pct">%</span></b>`}</div>
    </div>
    <p class="ha-teaser"><strong>${esc(title)}</strong> ${esc(teaserShort)}</p>
    <div class="ha-match-bar">${matchBar}</div>
    <div class="ha-ft">
      <span class="ha-pick">${esc(leftLab)} <b class="${pickCls.trim()}">${esc(pickLab)}</b></span>
      ${price > 0 ? `<span class="ha-meta"><span class="col-bought">${bought}人已购</span><span class="col-price-tag"><span class="col-single">单场</span>${COL_COIN_ICO}<b>${price}</b></span></span>` : ''}
    </div>
  </button>`;
}
function homeAttitudeCard({ m, pr }) {
  return homeAttitudeCardFromPost(null, m);
}
function homeMidTabOn(tab) {
  return (S.homeMidTab || 'attitude') === tab ? ' on' : '';
}
function homeAttitudeSection(ms) {
  const tab = S.homeMidTab || 'attitude';
  const showAtt = tab === 'attitude';
  let h = `<nav class="ha-sec-h ha-tabs" aria-label="首页信息流">
    <button type="button" class="ha-tab${homeMidTabOn('attitude')}" data-act="homeMidTab" data-tab="attitude">比赛态度</button>
    <button type="button" class="ha-tab${homeMidTabOn('hot')}" data-act="homeMidTab" data-tab="hot">圈子热议</button>
  </nav>`;
  const attCached = readHomeAttitudeCacheHtml();
  const sk = `<div class="ha-feed" id="homeAttitudeFeed">${attCached || [1, 2, 3].map(() =>
    '<div class="ha-card ha-skel"><div class="sk sk-line" style="width:50%"></div><div class="sk sk-line" style="height:36px;margin-top:10px"></div><div class="sk sk-line" style="width:90%;margin-top:8px"></div></div>').join('')}</div>`;
  h += `<div id="homeAttitudeWrap" class="home-attitude-wrap${showAtt ? '' : ' hidden'}">`;
  h += sk + '</div>';
  const hotSk = [1, 2, 3].map(() =>
    '<div class="ha-card ha-skel" style="border-radius:14px"><div class="sk sk-line" style="width:40%"></div><div class="sk sk-line" style="height:48px;margin-top:10px"></div></div>').join('');
  h += `<div id="homeHotWrap" class="home-hot-wrap${showAtt ? ' hidden' : ''}"><div id="homeHotFeed" class="tribe-feed-list ha-hot-feed">${showAtt ? '' : hotSk}</div></div>`;
  return h;
}
function syncHomeMidPanels() {
  const tab = S.homeMidTab || 'attitude';
  const att = document.getElementById('homeAttitudeWrap');
  const hot = document.getElementById('homeHotWrap');
  if (att) att.classList.toggle('hidden', tab !== 'attitude');
  if (hot) hot.classList.toggle('hidden', tab !== 'hot');
  document.querySelectorAll('[data-act="homeMidTab"]').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === tab);
  });
}
function homeHotPostCard(post) {
  const t = tribeById(post.tribeId);
  const label = (t && t.nameZh) || (post.tribeId || '').replace(/^[^-]+-/, '') || '部落';
  if (typeof JCTribeFeed !== 'undefined' && JCTribeFeed.postCard) {
    return JCTribeFeed.postCard(post, { tribeId: post.tribeId, tribeLabel: label, homeHot: true });
  }
  return '';
}
async function fillHomeTribeHot() {
  const feedEl = document.getElementById('homeHotFeed');
  if (!feedEl || route().name !== 'home') return;
  if ((S.homeMidTab || 'attitude') !== 'hot') return;
  try {
    await ensureTribeCatalog();
    const j = await api('/tribe/hot?limit=15', { timeout: 14000 });
    if (!feedEl.isConnected || (S.homeMidTab || 'attitude') !== 'hot') return;
    const posts = ((j && j.posts) || []).filter((p) => p.kind !== 'match_vote');
    if (!posts.length) {
      feedEl.innerHTML = empty('还没有圈子热议，去论坛发帖互动吧。',
        '<button type="button" class="btn ghost sm" data-go="#/tribe">逛论坛</button>', '暂无热议');
      S.homeHotLoaded = true;
      return;
    }
    S.homeHotPosts = posts;
    feedEl.innerHTML = posts.map(homeHotPostCard).join('');
    S.homeHotLoaded = true;
  } catch (e) {
    if (!feedEl.isConnected) return;
    if (feedEl.querySelector('.tf-card')) return;
    feedEl.innerHTML = empty('加载失败，请稍后重试',
      '<button type="button" class="btn ghost sm" data-act="homeMidTab" data-tab="hot">重试</button>', '暂无内容');
  }
}
function paintHomeAttitudeFeed(feedEl, ms, posts) {
  const matchPool = (ms && ms.length) ? ms : homeFocusMatchRows();
  if (!posts.length) {
    const rows = homeAttitudeRows(matchPool);
    if (!rows.length) {
      feedEl.innerHTML = empty('今日暂无可展示的未开赛预测场次，开售后将按信心指数排序出现在这里。',
        '<button type="button" class="btn ghost sm" data-go="#/results">查看最新开奖</button>', '暂无场次');
    } else {
      feedEl.innerHTML = rows.map(homeAttitudeCard).join('');
    }
    return true;
  }
  const byId = new Map(matchPool.map(m => [String(m.id), m]));
  feedEl.innerHTML = posts.map((p) => {
    const m = byId.get(String(p.matchId)) || null;
    return homeAttitudeCardFromPost(p, m);
  }).join('');
  return true;
}
function homeAttitudeFeedStillSkeleton(feedEl) {
  return !!(feedEl && feedEl.isConnected && feedEl.querySelector('.ha-skel'));
}
function refreshHomeMidFeed() {
  if ((S.homeMidTab || 'attitude') === 'hot') fillHomeTribeHot();
  else fillHomePlatformAttitude();
}
let _homeAttFillBusy = false;
let _homeAttRepairOnce = false;
let _homeAttFillQueued = false;
function scheduleHomeAttitudeFill(opts) {
  if (route().name !== 'home') return;
  if (_homeAttFillBusy) {
    _homeAttFillQueued = true;
    return;
  }
  fillHomePlatformAttitude(opts);
}
async function fillHomePlatformAttitude(opts) {
  const feedEl = document.getElementById('homeAttitudeFeed');
  if (!feedEl || route().name !== 'home') return;
  if (_homeAttFillBusy && !(opts && opts.forceRepair)) {
    _homeAttFillQueued = true;
    return;
  }
  _homeAttFillBusy = true;
  _homeAttFillQueued = false;
  const ms = (S.matches && S.matches.length) ? S.matches : homeFocusMatchRows();
  const cached = readHomeAttitudeCacheHtml();
  if (cached && !homeAttitudeFeedDomValid(feedEl)) feedEl.innerHTML = cached;
  const paintFallback = (reason) => {
    if (!feedEl.isConnected || route().name !== 'home') return;
    const rows = homeAttitudeRows(ms);
    if (rows.length) {
      feedEl.innerHTML = rows.map(homeAttitudeCard).join('');
    } else if (reason === '加载失败，请稍后重试') {
      feedEl.innerHTML = empty('加载失败，请稍后重试', '<button type="button" class="btn ghost sm" data-act="reload">重试</button>', '暂无场次');
    } else {
      feedEl.innerHTML = empty(reason || '今日暂无可展示的未开赛预测场次，开售后将按信心指数排序出现在这里。',
        '<button type="button" class="btn ghost sm" data-go="#/results">查看最新开奖</button>', '暂无场次');
    }
    syncHomeAttitudeScroll();
  };
  const afterPaintRepair = () => {
    try {
      if (!feedEl.isConnected || route().name !== 'home') return;
      if (!homeAttitudeFeedDomValid(feedEl) || homeAttitudeFeedPaintSuspect(feedEl)) {
        discardHomeAttitudeCaches();
        feedEl.querySelectorAll('.ha-card').forEach((c) => {
          try { c.style.removeProperty('--ha-card-glow'); } catch (_) {}
        });
        syncHomeAttitudeScroll();
        if (!_homeAttRepairOnce) {
          _homeAttRepairOnce = true;
          requestAnimationFrame(() => {
            if (!feedEl.isConnected || route().name !== 'home') return;
            if (homeAttitudeFeedDomValid(feedEl) && !homeAttitudeFeedPaintSuspect(feedEl)) return;
            fillHomePlatformAttitude({ forceRepair: true });
          });
        }
      }
    } catch (_) {}
  };
  const finishDisconnected = () => {
    _homeAttFillBusy = false;
    if (route().name === 'home') requestAnimationFrame(() => scheduleHomeAttitudeFill());
  };
  try {
    const j = await api('/column/feed?tab=attitude&author=platform&limit=12', { timeout: 14000 });
    if (!feedEl.isConnected) { finishDisconnected(); return; }
    const posts = (j && j.posts) || [];
    if (paintHomeAttitudeFeed(feedEl, ms, posts)) {
      if (homeAttitudeFeedDomValid(feedEl)) persistHomeAttitudeCache(feedEl.innerHTML);
      else discardHomeAttitudeCaches();
      syncHomeAttitudeScroll();
      requestAnimationFrame(() => requestAnimationFrame(afterPaintRepair));
    } else {
      paintFallback();
    }
  } catch (e) {
    if (!feedEl.isConnected) { finishDisconnected(); return; }
    if (homeAttitudeFeedDomValid(feedEl) && !homeAttitudeFeedPaintSuspect(feedEl)) return;
    if (cached && homeAttitudeFeedHtmlValid(cached)) {
      feedEl.innerHTML = cached;
      syncHomeAttitudeScroll();
      requestAnimationFrame(() => requestAnimationFrame(afterPaintRepair));
      return;
    }
    paintFallback('加载失败，请稍后重试');
  } finally {
    _homeAttFillBusy = false;
    if (_homeAttFillQueued) {
      _homeAttFillQueued = false;
      requestAnimationFrame(() => scheduleHomeAttitudeFill());
    } else if (homeAttitudeFeedStillSkeleton(feedEl) && route().name === 'home') {
      requestAnimationFrame(() => scheduleHomeAttitudeFill({ forceRepair: true }));
    }
  }
}
let homeAttitudeScrollHooked = false;
/** Scroll morph 图2→图3: g=0 淡金融合, g→1 银灰边+白底独立卡（非区块蓝闪）。 */
function homeAttitudeGlowEase(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
function homeAttitudeCardGlow(card, anchorY) {
  const rect = card.getBoundingClientRect();
  const range = Math.max(rect.height * 0.9, 108);
  const offset = rect.top - anchorY;
  let t;
  if (offset < 0) t = Math.max(0, 1 + offset / (range * 0.55));
  else t = Math.min(1, offset / range);
  return homeAttitudeGlowEase(t);
}
function syncHomeAttitudeScroll() {
  const wrap = document.getElementById('homeAttitudeWrap');
  const feed = document.getElementById('homeAttitudeFeed');
  if (!wrap || !feed || route().name !== 'home') return;
  const apply = () => {
    const el = document.getElementById('homeAttitudeWrap');
    const fd = document.getElementById('homeAttitudeFeed');
    if (!el || !fd || route().name !== 'home') return;
    if (el.classList.contains('hidden')) return;
    const anchorY = fd.getBoundingClientRect().top + 4;
    fd.querySelectorAll('.ha-card:not(.ha-skel)').forEach((card) => {
      const g = homeAttitudeCardGlow(card, anchorY);
      const next = g.toFixed(3);
      if (card.style.getPropertyValue('--ha-card-glow') !== next) {
        card.style.setProperty('--ha-card-glow', next);
      }
    });
  };
  apply();
  if (!homeAttitudeScrollHooked) {
    homeAttitudeScrollHooked = true;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; apply(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }
}

function pageHome() {
  const theme = homeTheme();
  const focusRows = homeFocusMatchRows();
  const focusReady = focusRows.length > 0;
  const focusPicks = focusReady ? pickHomeFocusMatches() : [];
  let h = `<div class="banner home-hero theme-${theme}"><div class="track" id="bnTrack">${homeHeroSlides(theme, S.homeBannerNews || null)}</div><div class="dots">${Array.from({ length: BANNER_N }, (_, i) => `<i class="${i === S.bannerIdx ? 'on' : ''}"></i>`).join('')}</div></div>`;
  if (theme === 'luxury') {
    h += `<div class="focus-row">${focusReady ? (focusPicks.map(focusCardCompact).join('') || '<div class="focus-empty note">暂无焦点赛事</div>') : '<div class="focus-card skel"></div><div class="focus-card skel"></div>'}</div>`;
  } else {
    h += `<div class="focus-pitch-wrap">${focusReady ? (focusPicks[0] ? focusCardPitch(focusPicks[0]) : '<div class="focus-empty note">暂无焦点赛事</div>') : '<div class="focus-bar skel"></div>'}</div>`;
  }
  h += warnBar();
  h += homeAttitudeSection((S.matches && S.matches.length) ? S.matches : focusRows);
  h += `<div class="sec-h"><h2>专栏作者</h2><button class="more" data-go="#/column">进入专栏 ${I.arr}</button></div>`;
  h += `<div id="home-column-authors" class="col-wall">${skeletonNews(1)}</div>`;
  setTimeout(() => {
    fillHomeBanners(); fillHomeColumnAuthors(); refreshHomeMidFeed();
    startHomeFocusRotate();
    // 1.9.123: warm live-scores without full home wipe (was blanking page under float-ball)
    const ids = homeFocusLiveScoreIds();
    if (ids.length) {
      loadLiveScores(ids).then(() => {
        if (route().name !== 'home') return;
        patchHomeFocusStrip();
        patchHomeHeroHotMatch();
        ensureHomeLiveScorePoll();
        if (!softPatchLiveScoreCards()) render();
      }).catch(() => {});
    } else {
      stopHomeLiveScorePoll();
    }
  }, 0);
  return h + foot();
}

/** 1.9.166: 部落圈子 — 联赛侧栏 + 球队部落格；关注同步账号。 */
const TRIBE_LEAGUES = [
  { key: 'epl', nameZh: '英超' }, { key: 'laliga', nameZh: '西甲' }, { key: 'seriea', nameZh: '意甲' },
  { key: 'bundesliga', nameZh: '德甲' }, { key: 'ligue1', nameZh: '法甲' }, { key: 'csl', nameZh: '中超' },
  { key: 'ucl', nameZh: '欧冠' },
];
const TRIBE_SIDE_META = [
  { key: '__followed__', nameZh: '我的关注' },
  { key: '__hot__', nameZh: '当前热门' },
  { key: '__rec__', nameZh: '推荐' },
  ...TRIBE_LEAGUES.map(l => ({ key: l.key, nameZh: l.nameZh })),
];
function tribeSubOf() {
  const s = S.tribeSub || 'enter';
  return (s === 'featured' || s === 'following') ? s : 'enter';
}
function setTribeSub(sub) {
  S.tribeSub = (sub === 'featured' || sub === 'following') ? sub : 'enter';
  try { localStorage.setItem('jc_tribe_sub', S.tribeSub); } catch (_) {}
  if (S.tribeSub === 'following') setTribeSide('__followed__');
  else if (S.tribeSub === 'featured') setTribeSide('__hot__');
}
function tribeSideOf() {
  const k = S.tribeSide || '__hot__';
  return TRIBE_SIDE_META.some(x => x.key === k) ? k : '__hot__';
}
function setTribeSide(k) {
  S.tribeSide = k;
  try { localStorage.setItem('jc_tribe_side', k); } catch (_) {}
}
function tribeLeagueName(key) {
  const m = TRIBE_LEAGUES.find(l => l.key === key);
  return m ? m.nameZh : key;
}
function buildTribeCatalogFromSlices(slices) {
  const teams = [];
  const byId = {};
  if (!slices || typeof slices !== 'object') return { teams, byId };
  for (const lg of TRIBE_LEAGUES) {
    const slice = slices[lg.key + ':standings'];
    if (!slice || slice.ok === false) continue;
    const leagueZh = slice.leagueZh || lg.nameZh;
    for (const tb of slice.tables || []) {
      for (const r of tb.rows || []) {
        if (!r.teamId) continue;
        const id = lg.key + '-' + String(r.teamId);
        if (byId[id]) continue;
        const rank = Number(r.rank) || 99;
        const pts = Number(r.points) || 0;
        const heat = Math.max(1, pts + Math.max(0, 22 - rank));
        const t = {
          tribeId: id, leagueKey: lg.key, leagueZh, teamId: String(r.teamId),
          nameZh: r.teamZh || r.team || '球队', logo: r.logo || (r.teamId ? ('https://a.espncdn.com/i/teamlogos/soccer/500/' + r.teamId + '.png') : ''), points: pts, rank, heat,
        };
        byId[id] = t;
        teams.push(t);
      }
    }
  }
  teams.sort((a, b) => b.heat - a.heat || a.nameZh.localeCompare(b.nameZh, 'zh-CN'));
  return { teams, byId };
}
function tribeStandingsSlicesFromCache() {
  const slices = {};
  try {
    const dc = S.dataCache || {};
    for (const k of Object.keys(dc)) {
      if (k.endsWith(':standings') && dc[k]) slices[k] = dc[k];
    }
  } catch (_) {}
  return slices;
}
function rebuildTribeCatalogFromCache({ renderIfTribe } = {}) {
  const cat = buildTribeCatalogFromSlices(tribeStandingsSlicesFromCache());
  cat._settled = true;
  S.tribeCat = cat;
  const paint = () => {
    if (!renderIfTribe) return;
    if (route().name !== 'tribe' && route().name !== 'tribe-club') return;
    try {
      if (route().name === 'tribe') {
        if (!softPatchTribeHub()) render({ force: true });
      } else render({ force: true });
    } catch (_) {}
  };
  paint();
  try { warmCrestCacheForTeams(cat.teams || []).catch(() => {}); } catch (_) {}
  return cat;
}
async function fetchTribeBootPackOnce({ timeoutMs, cache } = {}) {
  const ms = timeoutMs == null ? 8000 : timeoutMs;
  const base = (typeof CFG !== 'undefined' && CFG.apiBase) ? CFG.apiBase : '';
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let timer = null;
  try {
    if (ctrl) timer = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, ms);
    const r = await fetch(base + '/data-center-boot.json', {
      cache: cache || 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!r.ok) return false;
    const j = await r.json();
    if (!j || !j.slices || typeof j.slices !== 'object') return false;
    _bootPackSlices = j.slices;
    for (const [key, payload] of Object.entries(j.slices)) mergeBootPackSlice(key, payload);
    return true;
  } catch (_) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function ensureTribeCatalog(opts) {
  opts = opts || {};
  const force = !!opts.force;
  // Non-empty catalog: reuse.
  if (!force && S.tribeCat && S.tribeCat.byId && Object.keys(S.tribeCat.byId).length) {
    return Promise.resolve(S.tribeCat);
  }
  // 1.9.199: empty-but-settled must NOT re-enter (1.9.198 keys.length gate → endless spinner).
  if (!force && S.tribeCat && S.tribeCat.byId && S.tribeCat._settled) {
    return Promise.resolve(S.tribeCat);
  }
  if (S.tribeCatBusy) return (S._tribeCatWait || Promise.resolve(S.tribeCat));
  S.tribeCatBusy = true;
  S._tribeCatWait = (async () => {
    const finish = (cat) => {
      cat = cat || { teams: [], byId: {} };
      cat._settled = true;
      S.tribeCat = cat;
      S.tribeCatBusy = false;
      const paint = () => {
        try {
          if (route().name === 'tribe') {
            if (!softPatchTribeHub()) render({ force: true });
          } else if (route().name === 'tribe-club') {
            render({ force: true });
          }
        } catch (_) {}
      };
      paint();
      try { warmCrestCacheForTeams(cat.teams || []).catch(() => {}); } catch (_) {}
      return S.tribeCat;
    };
    try {
      // Drop legacy standings that paint OK but lack teamId (blocks tribe catalog).
      purgeStandingsWithoutTeamIds();
      // Prefer timed no-store boot after purge — force-cache can hang forever on some WebViews.
      _bootPackInflight = null;
      await fetchTribeBootPackOnce({ timeoutMs: 8000, cache: 'no-store' });
      let cat = buildTribeCatalogFromSlices(tribeStandingsSlicesFromCache());
      if (!Object.keys(cat.byId || {}).length) {
        // One more timed attempt (still no-store); then soft-fill via DC queue.
        await fetchTribeBootPackOnce({ timeoutMs: 8000, cache: 'no-store' });
        cat = buildTribeCatalogFromSlices(tribeStandingsSlicesFromCache());
      }
      const richer = buildTribeCatalogFromSlices(tribeStandingsSlicesFromCache());
      if (Object.keys(richer.byId || {}).length > Object.keys(cat.byId || {}).length) cat = richer;
      if (!Object.keys(cat.byId || {}).length) {
        try {
          for (const lg of TRIBE_LEAGUES) {
            scheduleDataCenterRefresh(lg.key, 'standings', { urgent: true });
          }
        } catch (_) {}
      }
      return finish(cat);
    } catch (_) {
      return finish({ teams: [], byId: {} });
    } finally {
      // Belt-and-suspenders: never leave spinner stuck if finish was skipped.
      if (S.tribeCatBusy) {
        S.tribeCatBusy = false;
        if (!S.tribeCat) S.tribeCat = { teams: [], byId: {}, _settled: true };
        else S.tribeCat._settled = true;
      }
    }
  })();
  return S._tribeCatWait;
}
function tribeById(id) {
  const cat = S.tribeCat;
  if (!cat || !cat.byId) return null;
  return cat.byId[String(id)] || null;
}
const isTribeFollow = id => (S.tribeFollows || []).some(f => f.tribeId === String(id));
function tribeFollowSnap(t) {
  return {
    tribeId: String(t.tribeId), nameZh: t.nameZh, leagueKey: t.leagueKey, leagueZh: t.leagueZh,
    teamId: t.teamId, logo: t.logo || '', savedAt: Date.now(),
  };
}
function tribeJoinBtnHtml(t, folOn) {
  const lab = folOn ? '已入驻' : '入驻';
  return `<button type="button" class="tribe-join-btn${folOn ? ' on' : ''}" data-act="tribeFollow" data-id="${esc(t.tribeId)}">${lab}</button>`;
}
function patchTribeJoinBtn(id) {
  try {
    const on = isTribeFollow(id);
    const sid = String(id);
    document.querySelectorAll('[data-act="tribeFollow"]').forEach((btn) => {
      if (btn.dataset.id !== sid) return;
      btn.classList.toggle('on', on);
      btn.textContent = on ? '已入驻' : '入驻';
    });
  } catch (_) {}
}
function tribeHeroAccent(leagueKey) {
  const m = { epl: '#3D195B', laliga: '#A50044', seriea: '#008FD7', bundesliga: '#D20515', ligue1: '#091C3E', ucl: '#0E1E5B' };
  return m[leagueKey] || '#1B2A4A';
}
async function toggleTribeFollow(id) {
  let t = tribeById(id);
  if (!t) {
    const f = (S.tribeFollows || []).find(x => x.tribeId === String(id));
    if (f) t = { tribeId: f.tribeId, nameZh: f.nameZh, leagueKey: f.leagueKey, leagueZh: f.leagueZh, logo: f.logo || '' };
  }
  if (!t) return toast('球队信息加载中，请稍后再试');
  const on = isTribeFollow(id);
  const snap = tribeFollowSnap(t);
  const prev = (S.tribeFollows || []).slice();
  S.tribeFollows = on
    ? S.tribeFollows.filter(f => f.tribeId !== String(id))
    : [snap, ...S.tribeFollows.filter(f => f.tribeId !== String(id))];
  persistLists();
  patchTribeJoinBtn(id);
  toast(on ? '已取消入驻' : (loggedIn() ? '已入驻，已同步到账号' : '已入驻（本机保存，登录后可同步）'));
  render();
  if (!loggedIn()) return;
  try {
    if (on) await api('/tribe-follows/' + encodeURIComponent(t.tribeId), { method: 'DELETE' });
    else await api('/tribe-follows/' + encodeURIComponent(t.tribeId), { method: 'PUT', body: snap });
  } catch (e) {
    S.tribeFollows = prev;
    persistLists();
    patchTribeJoinBtn(id);
    render();
    toast(e.message);
  }
}
function tribeFilterTeams(teams, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return teams;
  return teams.filter((t) => {
    const name = String(t.nameZh || '').toLowerCase();
    const circle = (name + '圈').toLowerCase();
    const league = String(t.leagueZh || '').toLowerCase();
    return name.includes(s) || circle.includes(s) || league.includes(s);
  });
}
function tribeTeamsForSide(sideKey) {
  const cat = S.tribeCat || { teams: [], byId: {} };
  const all = cat.teams || [];
  if (sideKey === '__followed__') {
    const ids = (S.tribeFollows || []).map(f => f.tribeId);
    return ids.map(id => cat.byId[id] || {
      tribeId: id, nameZh: (S.tribeFollows.find(f => f.tribeId === id) || {}).nameZh || '球队',
      leagueZh: (S.tribeFollows.find(f => f.tribeId === id) || {}).leagueZh || '',
      logo: (S.tribeFollows.find(f => f.tribeId === id) || {}).logo || '', heat: 0,
    }).filter(Boolean);
  }
  if (sideKey === '__hot__') return all.slice(0, 36);
  if (sideKey === '__rec__') {
    const out = [];
    for (const lg of TRIBE_LEAGUES) {
      const chunk = all.filter(t => t.leagueKey === lg.key).slice(0, 6);
      out.push(...chunk);
    }
    return out;
  }
  return all.filter(t => t.leagueKey === sideKey);
}
function tribeGridHtml(teams, title, opts) {
  opts = opts || {};
  if (!teams.length) {
    if (opts.searching) {
      return empty('没有匹配的球队或圈子，换个关键词试试。', '', '无搜索结果');
    }
    const side = tribeSideOf();
    if (side === '__followed__') {
      return empty('登录后入驻喜欢的球队，或先在下方联赛里点选球队并入驻。', '', '还没有关注的球队');
    }
    return empty('该分类暂无球队数据，请稍后重试。', '<button type="button" class="btn ghost sm" data-act="tribeReload">重新加载</button>', '暂无球队');
  }
  const head = title ? `<div class="tribe-sec-hd">${esc(title)}<small>${teams.length}个</small></div>` : '';
  const cells = teams.map(t => {
    const crest = badge(t.nameZh, 'tribe', t.logo, { eager: true, teamId: t.teamId || '' });
    const heat = t.heat > 0 ? `<span class="tribe-heat num">🔥 ${t.heat}</span>` : '';
    const fol = isTribeFollow(t.tribeId) ? '<span class="tribe-fol-dot" aria-hidden="true"></span>' : '';
    return `<button type="button" class="tribe-cell" data-go="#/tribe-club/${encodeURIComponent(t.tribeId)}" aria-label="${esc(t.nameZh)}">
      <span class="tribe-crest-wrap">${fol}${crest}</span>
      <span class="tribe-name">${esc(t.nameZh)}</span>${heat}</button>`;
  }).join('');
  return head + `<div class="tribe-grid">${cells}</div>`;
}
function tribeHubTitleForSide(side, teams) {
  const meta = TRIBE_SIDE_META.find(s => s.key === side);
  let title = meta ? meta.nameZh : '';
  if (side === '__followed__' && teams.length) title = '❤️ ' + title;
  if (side === '__hot__') title = '🔥 ' + (title || '当前热门');
  return title;
}
function tribeMainInnerHtml() {
  const side = tribeSideOf();
  const busy = S.tribeCatBusy && !(S.tribeCat && S.tribeCat.teams && S.tribeCat.teams.length);
  if (busy) return '<div class="spinner" style="margin:48px auto"></div>';
  const raw = tribeTeamsForSide(side);
  const q = String(S.tribeSearchQ || '').trim();
  const teams = tribeFilterTeams(raw, q);
  const title = tribeHubTitleForSide(side, raw);
  return tribeGridHtml(teams, title, { searching: !!q });
}
function hardenTribeCrestImgs(root) {
  try {
    const scope = root || document;
    scope.querySelectorAll('.tribe-crest-wrap .badge.crest img').forEach((img) => {
      if (img.complete && img.naturalWidth > 0) return;
      let done = false;
      const fall = () => {
        if (done) return;
        done = true;
        try { if (typeof img.onerror === 'function') img.onerror(); } catch (_) {}
      };
      const t = setTimeout(fall, 2800);
      img.addEventListener('load', () => { done = true; clearTimeout(t); }, { once: true });
      img.addEventListener('error', () => { done = true; clearTimeout(t); }, { once: true });
    });
  } catch (_) {}
}
function softPatchTribeHub() {
  if (route().name !== 'tribe') return false;
  const main = document.querySelector('.tribe-hub .tribe-main');
  if (!main) return false;
  main.innerHTML = tribeMainInnerHtml();
  try { hardenTribeCrestImgs(main); } catch (_) {}
  try { hydrateTribeCrests(main); } catch (_) {}
  return true;
}
function pageTribe() {
  ensureTribeCatalog();
  const side = tribeSideOf();
  const busy = S.tribeCatBusy && !(S.tribeCat && S.tribeCat.teams && S.tribeCat.teams.length);
  const sideBtns = TRIBE_SIDE_META.map(s =>
    `<button type="button" class="tribe-side-btn${side === s.key ? ' on' : ''}" data-act="tribeSide" data-side="${esc(s.key)}">${esc(s.nameZh)}</button>`
  ).join('');
  let body = '';
  if (busy) {
    body = '<div class="tribe-main"><div class="spinner" style="margin:48px auto"></div></div>';
  } else {
    body = `<div class="tribe-main">${tribeMainInnerHtml()}</div>`;
  }
  return `<div class="tribe-hub">
    <aside class="tribe-side" aria-label="联赛分类">${sideBtns}</aside>
    ${body}
  </div>` + foot();
}
function pageTribeClub(id) {
  ensureTribeCatalog();
  const tid = String(id || '').trim();
  let t = tribeById(tid);
  if (!t && (S.tribeFollows || []).length) {
    const f = S.tribeFollows.find(x => x.tribeId === tid);
    if (f) t = { tribeId: tid, nameZh: f.nameZh, leagueZh: f.leagueZh, leagueKey: f.leagueKey, logo: f.logo || '', heat: 0 };
  }
  if (!t) {
    return hdr('球队部落', { back: true }) + empty('球队信息加载中或暂无数据。', '<button type="button" class="btn ghost sm" data-go="#/tribe">返回论坛</button>', '未找到球队') + foot();
  }
  const folOn = isTribeFollow(t.tribeId);
  const folBtn = tribeJoinBtnHtml(t, folOn);
  const accent = tribeHeroAccent(t.leagueKey);
  const crest = badge(t.nameZh, 'lg tribe-club-crest', t.logo, { eager: true, teamId: t.teamId || (String(t.tribeId || '').includes('-') ? String(t.tribeId).split('-').slice(1).join('-') : '') });
  const sub = [t.leagueZh, t.points > 0 ? `积分榜 ${t.points} 分` : ''].filter(Boolean).join(' · ');
  const logoRaw = t.logo ? String(t.logo) : '';
  const heroCls = 'tribe-club-hero hero hero--edge' + (logoRaw ? ' has-logo' : '');
  const logoCss = logoRaw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const heroStyle = `--tribe-accent:${accent};` + (logoRaw ? `--tribe-logo:url("${logoCss}")` : '');
  const teamId = t.teamId || (String(t.tribeId || '').includes('-') ? String(t.tribeId).split('-').slice(1).join('-') : '');
  const teamGo = teamId ? `#/team/${encodeURIComponent(teamId)}?league=${encodeURIComponent(t.leagueKey || '')}` : '';
  const teamBtn = teamGo
    ? `<button type="button" class="ic-btn hero-ic" data-go="${teamGo}" aria-label="球队资料">${I.shield}</button>`
    : '';
  const nav = matchEdgeNavBar(teamBtn + folBtn);
  S.tribeFeedTeamMeta = S.tribeFeedTeamMeta || {};
  S.tribeFeedTeamMeta[t.tribeId] = { teamId, nameZh: t.nameZh, leagueKey: t.leagueKey || '' };
  S.tribeFeedUi = S.tribeFeedUi || { tab: 'latest', sort: 'reply' };
  const feedShell = typeof JCTribeFeed !== 'undefined' ? JCTribeFeed.clubFeedShell(t.tribeId, S.tribeFeedUi) : '';
  setTimeout(() => {
    if (typeof JCTribeFeed !== 'undefined' && route().name === 'tribe-club' && String(route().arg) === String(t.tribeId)) {
      JCTribeFeed.mountClubFeed(t.tribeId, S.tribeFeedTeamMeta[t.tribeId]);
    }
  }, 0);
  return `<div class="tribe-club-page" style="${heroStyle}">
    <section class="${heroCls}" style="${heroStyle}" aria-label="${esc(t.nameZh)}圈子">
      ${nav}
      <div class="tribe-club-hero-body">
        ${crest}
        <div class="tribe-club-hero-text">
          <h1 class="tribe-club-hero-name">${esc(t.nameZh)}</h1>
          ${sub ? `<p class="tribe-club-hero-sub">${esc(sub)}</p>` : ''}
        </div>
      </div>
    </section>
    ${feedShell}
    <div class="tribe-club-fabs" aria-label="快捷操作">
      <button type="button" class="tribe-fab tribe-fab--post" data-act="tribeComposeOpen" data-tribe="${esc(t.tribeId)}">
        <span class="tribe-fab-ic">${I.pen}</span><span class="tribe-fab-lab">发贴</span>
      </button>
      <button type="button" class="tribe-fab tribe-fab--refresh" data-act="tribeFeedRefresh" data-tribe="${esc(t.tribeId)}" aria-label="刷新">${I.refresh}</button>
    </div>
  </div>` + foot();
}
function pageTribeCompose(id) {
  ensureTribeCatalog();
  const tid = String(id || '').trim();
  let t = tribeById(tid);
  if (!t && (S.tribeFollows || []).length) {
    const f = S.tribeFollows.find(x => x.tribeId === tid);
    if (f) t = { tribeId: tid, nameZh: f.nameZh, leagueZh: f.leagueZh, leagueKey: f.leagueKey, logo: f.logo || '' };
  }
  if (!t) {
    return hdr('发布帖子', { back: true }) + empty('球队信息加载中或暂无数据。', '<button type="button" class="btn ghost sm" data-go="#/tribe">返回部落</button>', '未找到球队') + foot();
  }
  return typeof JCTribeFeed !== 'undefined'
    ? JCTribeFeed.pageCompose(t.tribeId, t.nameZh)
    : hdr('发布帖子', { back: true }) + empty('加载中…') + foot();
}
function pageTribePost(id) {
  const pid = String(id || '').trim();
  if (!pid) return hdr('帖子', { back: true }) + empty('帖子不存在') + foot();
  const h = typeof JCTribeFeed !== 'undefined'
    ? JCTribeFeed.pagePostDetail(pid)
    : hdr('帖子', { back: true }) + empty('加载中…') + foot();
  setTimeout(() => {
    if (typeof JCTribeFeed !== 'undefined' && route().name === 'tribe-post' && String(route().arg) === pid) {
      JCTribeFeed.loadPostDetail(pid);
    }
  }, 0);
  return h;
}

function dateStrip(dates, cur, key, { light = true } = {}) {
  const cls = 'dstrip' + (light ? ' light' : '');
  const btns = dates.map(d => `<button type="button" class="${d === cur ? 'on' : ''}" data-${key}="${d}">${dayName(d)}<small>${d.slice(5)}</small></button>`).join('');
  return `<div class="${cls}" id="dstrip"><span class="dstrip-edge" aria-hidden="true"></span>${btns}<span class="dstrip-edge" aria-hidden="true"></span></div>`;
}
/** 1.9.214: date strip — keep selected day readable without half-clipped edge cells. */
function syncDateStripScroll(nds) {
  if (!nds) return;
  const on = nds.querySelector('button.on');
  if (!on) return;
  const pad = Math.max(10, (nds.clientWidth - on.offsetWidth) / 2);
  const max = Math.max(0, nds.scrollWidth - nds.clientWidth);
  nds.scrollLeft = Math.max(0, Math.min(on.offsetLeft - pad, max));
}
/** 热门 = 竞彩常见优先联赛（LEAGUE_PRIO 白名单），不含瑞超/挪超/巴甲等长尾。 */
function isHotLeague(l) { return prio(l) < 99; }
function isFinishedRow(x) { return x._t === 'r' || !!x.full || (x.status && /完场|已结束|Payout/i.test(String(x.status))); }
const SCH_MODES = ['关注', '未开始', '已结束'];
/** 1.9.148: 赛程主筛选项（关注 / 未开始 / 已结束）在顶栏中部；1.9.147 曾误放在日期条下。 */
const SCH_MODE_ALL = '全部';
function initSchChannel() {
  try {
    const ch = localStorage.getItem('jc_sch_channel');
    return ch === 'calc' ? 'calc' : 'list';
  } catch (_) { return 'list'; }
}
function schChannelOf() { return S.schChannel === 'calc' ? 'calc' : 'list'; }
function setSchChannel(ch) {
  S.schChannel = ch === 'calc' ? 'calc' : 'list';
  try { localStorage.setItem('jc_sch_channel', S.schChannel); } catch (_) {}
}
function initSchMode() {
  const def = '未开始';
  try {
    if (typeof localStorage === 'undefined') return def;
    if (!localStorage.getItem('jc_sch_mode_v1')) {
      localStorage.setItem('jc_sch_mode_v1', '1');
      const ch = localStorage.getItem('jc_sch_ch');
      const st = localStorage.getItem('jc_sch_status');
      let mode = def;
      if (ch === '关注') mode = '关注';
      else if (st === '已结束') mode = '已结束';
      else if (st === '未开始') mode = '未开始';
      else if (st === '进行中' || st === '全部') mode = '未开始';
      localStorage.setItem('jc_sch_mode', mode);
      return mode;
    }
    const m = localStorage.getItem('jc_sch_mode');
    if (m === SCH_MODE_ALL) return SCH_MODE_ALL;
    return SCH_MODES.includes(m) ? m : def;
  } catch (_) { return def; }
}
function schModeOf() {
  const m = S.schMode;
  if (m === SCH_MODE_ALL) return SCH_MODE_ALL;
  if (SCH_MODES.includes(m)) return m;
  return '未开始';
}
function setSchMode(m) {
  S.schMode = (m === SCH_MODE_ALL || SCH_MODES.includes(m)) ? m : '未开始';
  try { localStorage.setItem('jc_sch_mode', S.schMode); } catch (_) {}
}
function setSchHideFinished(on) {
  S.schHideFinished = !!on;
  try { localStorage.setItem('jc_sch_hide_fin', on ? '1' : '0'); } catch (_) {}
}
function schModeFilterRows(classified, mode) {
  if (mode === '关注') return classified.filter(x => isFav(x.id));
  if (mode === '未开始') return classified.filter(x => x._kind === 'ns');
  if (mode === '已结束') return classified.filter(x => x._kind === 'ft');
  return classified;
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
  const id = String(x.id);
  let live = (S.liveScores && S.liveScores[id]) || null;
  // Prefer in-memory detail stats (incl. FT) when list poll still holds stale/empty sporttery
  const det = S.liveStatsCache && S.liveStatsCache[id];
  if (det && det.ok && det.score && det.score.home != null) {
    const dh = Number(det.score.home), da = Number(det.score.away);
    const detFin = !!det.finished || /^(FT|AET|PEN)$/i.test(String((det.status && det.status.short) || ''));
    const needSync = !live || live.homeScore == null || live.homeScore !== dh || live.awayScore !== da
      || (detFin && !live.finished) || (!!det.live && !live.live);
    if (needSync) {
      syncLiveScoreFromStats(id, det);
      live = S.liveScores[id];
    }
  }
  const ko = kickoff(x);
  const now = Date.now();
  const fromResult = x._t === 'r' || !!x.full;
  const statusFin = !!(x.status && /完场|已结束|Finished|Payout|已完成/i.test(String(x.status)));
  let homeScore = null, awayScore = null, half = '', full = '';
  if (live && live.homeScore != null) {
    homeScore = live.homeScore; awayScore = live.awayScore;
    full = live.full || `${live.homeScore}:${live.awayScore}`;
    half = live.half || '';
  } else if ((fromResult || statusFin) && x.full) {
    const parts = String(x.full).split(/[:：]/);
    homeScore = Number(parts[0]); awayScore = Number(parts[1]);
    if (Number.isNaN(homeScore)) homeScore = null;
    if (Number.isNaN(awayScore)) awayScore = null;
    full = x.full; half = x.half || '';
  }
  let kind = 'ns', phaseZh = '未开赛', minute = null, minuteExtra = null, liveFlag = false;
  const liveFin = !!(live && live.finished);
  if ((liveFin || fromResult || statusFin) && homeScore != null) {
    kind = 'ft'; phaseZh = (live && live.phaseZh) || (statusFin ? '完场' : (x.status || '完场'));
    if (!/完场|已结束|Finished|Payout|已完成/i.test(String(phaseZh))) phaseZh = '完场';
  } else if (liveFin && homeScore == null) {
    // Officially finished but score not yet in list payload — keep out of「未开始」
    kind = 'ft'; phaseZh = (live && live.phaseZh) || '完场';
  } else if (live && live.live && now >= ko + 2.5 * 3600e3) {
    // 1.9.258: sporttery payload still「进行中」long after KO — show FT, keep polling until server reconciles
    if (homeScore != null) { kind = 'ft'; phaseZh = '完场'; liveFlag = false; }
    else { kind = 'ns'; phaseZh = '待开奖'; }
  } else if (live && live.live) {
    kind = 'live'; phaseZh = live.phaseZh || '进行中';
    minute = live.minute; minuteExtra = live.minuteExtra; liveFlag = true;
  } else if (homeScore != null && now >= ko + 2.5 * 3600e3) {
    // Score + well past KO window → treat as FT (sporttery may omit finished flag)
    kind = 'ft'; phaseZh = '完场';
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

function formatLiveClockMinute(phaseZh, minute, minuteExtra) {
  // 1H stoppage → 45+N'; 2H stoppage → 90+N'; never flip half from minute alone.
  if (minute == null || Number.isNaN(Number(minute))) return '';
  const m = Number(minute);
  const ex = minuteExtra != null && Number(minuteExtra) > 0 ? Number(minuteExtra) : null;
  if (phaseZh === '上半场') {
    if (ex != null) return '45+' + ex + "'";
    if (m > 45) return '45+' + (m - 45) + "'";
    return m + "'";
  }
  if (phaseZh === '下半场') {
    if (ex != null) return '90+' + ex + "'";
    if (m > 90) return '90+' + (m - 90) + "'";
    return m + "'";
  }
  if (phaseZh === '加时') {
    if (ex != null) return m + '+' + ex + "'";
    return m + "'";
  }
  if (ex != null) return m + '+' + ex + "'";
  return m + "'";
}

function scoreMinuteLab(row) {
  if (row._kind === 'ft') return '完场';
  if (row._kind === 'live') {
    // Align with detail: 中场 alone; 上/下半场 + minute when known.
    // Defense: only score-past-half upgrades sticky 中场 → 下半场 (never minute≥46 alone —
    // 1H stoppage / HT often still report elapsed 45–47).
    let phaseZh = row._phaseZh || '进行中';
    const pastHt = (() => {
      if (!row._half || row._homeScore == null) return false;
      const hp = String(row._half).split(/[:：]/);
      if (hp.length < 2) return false;
      const hh = Number(hp[0]), ha = Number(hp[1]);
      if (Number.isNaN(hh) || Number.isNaN(ha)) return false;
      return row._homeScore !== hh || row._awayScore !== ha;
    })();
    if (phaseZh === '中场' && pastHt) phaseZh = '下半场';
    if (phaseZh === '中场') return '中场';
    if (row._minute != null) {
      const min = formatLiveClockMinute(phaseZh, row._minute, row._minuteExtra);
      if (phaseZh === '上半场' || phaseZh === '下半场' || phaseZh === '加时' || phaseZh === '进行中') {
        return phaseZh + ' ' + min;
      }
      return min;
    }
    return phaseZh;
  }
  // upcoming: show kickoff clock
  return esc(row.time || '--:--');
}

function scoreCard(row) {
  const kind = row._kind;
  const statusCls = kind === 'live' ? 'live' : kind === 'ft' ? 'ft' : 'ns';
  const midInner = matchScoreColumn(row);
  let cards = '';
  if (row._cards && (row._cards.yellow || row._cards.red)) {
    const y = row._cards.yellow || {}, r = row._cards.red || {};
    const bits = [];
    if ((y.home || 0) + (y.away || 0) > 0) bits.push(`<span class="ls-yc" title="黄牌">🟨${(y.home || 0) + (y.away || 0)}</span>`);
    if ((r.home || 0) + (r.away || 0) > 0) bits.push(`<span class="ls-rc" title="红牌">🟥${(r.home || 0) + (r.away || 0)}</span>`);
    if (bits.length) cards = `<div class="ls-cards">${bits.join('')}</div>`;
  }
  return `<button type="button" class="ls-row ${statusCls}" data-go="#/match/${encodeURIComponent(row.id)}">
    ${matchCardMeta(row, { favSize: 14 })}
    <div class="ls-body">
      <div class="ls-side h">${badge(row.home, 'sm', row.homeLogo)}<span class="nm">${esc(row.home)}</span></div>
      <div class="ls-mid">${midInner}</div>
      <div class="ls-side a"><span class="nm">${esc(row.away)}</span>${badge(row.away, 'sm', row.awayLogo)}</div>
    </div>
    ${cards}
  </button>`;
}

function stopLiveScorePoll() {
  if (S.liveScorePoll) { clearInterval(S.liveScorePoll); S.liveScorePoll = null; }
}
function scheduleRowSource(id) {
  const sid = String(id);
  return (S.matches || []).find(z => String(z.id) === sid)
    || (S.schedule || []).find(z => String(z.id) === sid)
    || (S.results || []).find(z => String(z.id) === sid);
}
/** 当日仍有未确认完场且已过开球 → 需要 live-scores 轮询（含尚未标 live 的场次）。 */
function scheduleNeedLivePoll(classifiedDay, counts) {
  if (!classifiedDay || !classifiedDay.length) return false;
  if (counts && counts.live > 0) return true;
  if (classifiedDay.some(scheduleLivePayloadStale)) return true;
  if (classifiedDay.some(scheduleLiveScoreNeedsReconcile)) return true;
  const now = Date.now();
  return classifiedDay.some(x => x._kind !== 'ft' && now >= kickoff(x));
}
function scheduleLivePayloadStale(row) {
  const id = String(row.id);
  const live = S.liveScores && S.liveScores[id];
  if (!live || !live.live || live.finished) return false;
  const ko = kickoff(row);
  return Number.isFinite(ko) && Date.now() >= ko + 2.5 * 3600e3;
}
/** Server list payload may still be sporttery-only long after KO — keep heartbeat until AF/seen merges. */
function scheduleLiveScoreNeedsReconcile(row) {
  const id = String(row.id);
  const live = S.liveScores && S.liveScores[id];
  if (!live) return false;
  if (scheduleLivePayloadStale(row)) return true;
  const ko = kickoff(row);
  if (!Number.isFinite(ko) || Date.now() < ko + 2 * 3600e3) return false;
  if (!live.finished) return true;
  const tag = String(live.source || '') + '|' + String(live.scoreSource || '');
  return !/\+af|\+seen|detail|results-seen|api-football/i.test(tag);
}
/** 当日仍有未完场场次（含未开球）→ 轮询需保持心跳，开球后自动开始刷新。 */
function scheduleHasPendingLive(classifiedDay) {
  return (classifiedDay || []).some(x => x._kind !== 'ft' || scheduleLivePayloadStale(x) || scheduleLiveScoreNeedsReconcile(x));
}
function resumeScheduleLivePoll() {
  if (route().name !== 'schedule') return;
  const model = scheduleDayModel();
  if (!model) return;
  ensureLiveScorePoll(scheduleHasPendingLive(model.classifiedDay));
}
/** live-scores 回流后刷新赛程 DOM（避开 tabContentSig 相同导致 render no-op）。 */
function afterScheduleLiveScoresLoaded() {
  if (route().name !== 'schedule') return;
  purgeCalcSelClosed();
  if (schChannelOf() === 'list' && softPatchScheduleLiveRows()) return;
  if (softPatchSchedule()) return;
  render({ force: true });
}
/** 原地更新赛程比分列表 ls-row（不整页 wipe）。 */
function softPatchScheduleLiveRows() {
  try {
    if (route().name !== 'schedule' || schChannelOf() !== 'list') return false;
    const nodes = document.querySelectorAll('#schBody .ls-row[data-go], .ls-list .ls-row[data-go]');
    if (!nodes.length) return false;
    let n = 0;
    nodes.forEach((btn) => {
      const go = btn.getAttribute('data-go') || '';
      const m = /#\/match\/(.+)$/.exec(go);
      if (!m) return;
      let id;
      try { id = decodeURIComponent(m[1]); } catch (_) { id = m[1]; }
      const rowSrc = scheduleRowSource(id);
      if (!rowSrc) return;
      const row = classifyScoreRow(rowSrc);
      const kind = row._kind;
      const statusCls = kind === 'live' ? 'live' : kind === 'ft' ? 'ft' : 'ns';
      const wantCls = 'ls-row ' + statusCls;
      if (btn.className !== wantCls) { btn.className = wantCls; n++; }
      const mid = btn.querySelector('.ls-mid');
      if (!mid) return;
      const next = matchScoreColumn(row);
      if (mid.innerHTML !== next) { mid.innerHTML = next; n++; }
    });
    return n > 0;
  } catch (_) { return false; }
}
async function loadLiveScores(ids, { force, bust } = {}) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!list.length) { S.liveScores = S.liveScores || {}; return S.liveScores; }
  if (!force && S.liveScoresAt && Date.now() - S.liveScoresAt < 35000 && S.liveScores) return S.liveScores;
  if (S.liveScoresLoading) {
    // 1.9.247: a forced refresh (pull-to-refresh / poll) must not be swallowed by an
    // in-flight plain load returning stale data — wait it out, then fetch fresh.
    if (!force || !S._liveScoresInflight) return S.liveScores;
    try { await S._liveScoresInflight; } catch (_) {}
    if (S.liveScoresLoading) return S.liveScores;
  }
  S.liveScoresLoading = true;
  const job = (async () => {
    try {
      // bust (pull-to-refresh): refresh=1 skips the server-side payload cache too.
      const j = await api('/live-scores?ids=' + encodeURIComponent(list.join(',')) + (bust ? '&refresh=1' : ''), { timeout: 15000 });
      if (j && j.data && typeof j.data === 'object') {
        const prevScores = S.liveScores || {};
        S.liveScores = { ...prevScores, ...j.data };
        S.liveScoresAt = Date.now();
        S.liveScoresMeta = { fetchedAt: j.fetchedAt, ttlSec: j.ttlSec, afUsed: j.afUsed, quota: j.quota, cached: j.cached };
        notifyFavGoalsFromScores(prevScores, S.liveScores);
      }
    } catch (e) {
      console.warn('live-scores', e.message);
    } finally {
      S.liveScoresLoading = false;
      S._liveScoresInflight = null;
    }
    return S.liveScores;
  })();
  S._liveScoresInflight = job;
  return job;
}

/** 1.9.264: 关注场次进球本地通知 — 纯函数，便于单测。 */
function scorePairKey(homeScore, awayScore) {
  if (homeScore == null || awayScore == null) return null;
  const h = Number(homeScore), a = Number(awayScore);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return h + '-' + a;
}
function parseScorePairKey(key) {
  if (key == null || key === '') return null;
  const p = String(key).split('-');
  if (p.length !== 2) return null;
  const h = Number(p[0]), a = Number(p[1]);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { h, a };
}
/**
 * lastNotified: '2-1' or null. alreadyWatching: poller already tracked this live match.
 * nextLive: { homeScore, awayScore }
 * action: seed | notify | skip | watch
 */
function favGoalAlertDecision(lastNotified, nextLive, alreadyWatching) {
  const nextKey = nextLive ? scorePairKey(nextLive.homeScore, nextLive.awayScore) : null;
  if (!nextKey) return { action: 'watch' };
  if (lastNotified === nextKey) return { action: 'skip', key: nextKey };
  const nh = Number(nextLive.homeScore), na = Number(nextLive.awayScore);
  if (lastNotified == null) {
    if (alreadyWatching && (nh > 0 || na > 0)) {
      return { action: 'notify', key: nextKey, homeScore: nh, awayScore: na };
    }
    return { action: 'seed', key: nextKey };
  }
  const last = parseScorePairKey(lastNotified);
  if (!last) return { action: 'seed', key: nextKey };
  if (nh > last.h || na > last.a) {
    return { action: 'notify', key: nextKey, homeScore: nh, awayScore: na };
  }
  return { action: 'seed', key: nextKey };
}
function buildFavGoalNotifyCopy(home, away, homeScore, awayScore, minute, player) {
  const h = home || '主队';
  const a = away || '客队';
  let body = h + ' ' + homeScore + '-' + awayScore + ' ' + a;
  if (player) body += ' · ' + player;
  if (minute != null && Number.isFinite(Number(minute))) body += ' · ' + Number(minute) + "'";
  return { title: '进球提醒', body };
}
function lastCachedGoalHint(liveStats) {
  const ev = liveStats && Array.isArray(liveStats.events) ? liveStats.events : null;
  if (!ev || !ev.length) return null;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (!e || e.kind !== 'goal') continue;
    return { minute: e.elapsed != null ? Number(e.elapsed) : null, player: e.playerZh || e.player || '' };
  }
  return null;
}
function favGoalWatchIds(now) {
  now = now || Date.now();
  const out = [];
  for (const f of (S.favs || [])) {
    const id = String(f.matchId || f.id || '');
    if (!id) continue;
    const live = S.liveScores && S.liveScores[id];
    if (live && live.finished && !live.live) continue;
    const m = findMatch(id) || scheduleRowSource(id) || (S.results || []).find(x => String(x.id) === id) || f;
    const ko = m && m.date ? kickoff(m) : NaN;
    if (Number.isFinite(ko)) {
      if (now < ko - 90e3) continue;
      if (now > ko + 3.5 * 3600e3 && !(live && live.live)) continue;
    } else if (!(live && live.live)) {
      continue;
    }
    out.push(id);
  }
  return out;
}
function favNotifyMeta(id) {
  const sid = String(id);
  const f = (S.favs || []).find(x => String(x.matchId) === sid);
  const m = findMatch(sid) || scheduleRowSource(sid);
  return {
    home: (m && m.home) || (f && f.home) || '主队',
    away: (m && m.away) || (f && f.away) || '客队',
  };
}
function requestFavGoalNotifyPermission() {
  try {
    if (!IS_APP) return;
    if (window.JingcaiChrome && typeof window.JingcaiChrome.requestNotifyPermission === 'function') {
      window.JingcaiChrome.requestNotifyPermission();
    }
  } catch (_) {}
}
function fireFavGoalNotify(payload) {
  try {
    if (!IS_APP) return;
    const bridge = window.JingcaiChrome;
    if (!bridge || typeof bridge.notifyGoal !== 'function') return;
    bridge.notifyGoal(JSON.stringify(payload));
  } catch (_) {}
}
function notifyFavGoalsFromScores(prevMap, nextMap) {
  if (!IS_APP) return;
  const favs = S.favs || [];
  if (!favs.length || !nextMap) return;
  S.goalAlertSeen = S.goalAlertSeen || {};
  S.goalAlertWatching = S.goalAlertWatching || {};
  let changed = false;
  for (const f of favs) {
    const id = String(f.matchId || f.id || '');
    if (!id) continue;
    const next = nextMap[id];
    if (!next) continue;
    const last = S.goalAlertSeen[id] || null;
    const watching = !!S.goalAlertWatching[id];
    const d = favGoalAlertDecision(last, next, watching);
    if (d.action === 'watch') {
      S.goalAlertWatching[id] = true;
      continue;
    }
    if (d.action === 'skip') continue;
    if (d.key) {
      S.goalAlertSeen[id] = d.key;
      changed = true;
    }
    if (d.action === 'notify') {
      const meta = favNotifyMeta(id);
      const hint = lastCachedGoalHint(S.liveStatsCache && S.liveStatsCache[id]);
      const minute = (hint && hint.minute != null) ? hint.minute : next.minute;
      const copy = buildFavGoalNotifyCopy(meta.home, meta.away, d.homeScore, d.awayScore, minute, hint && hint.player);
      fireFavGoalNotify({
        matchId: id,
        title: copy.title,
        body: copy.body,
        home: meta.home,
        away: meta.away,
        homeScore: d.homeScore,
        awayScore: d.awayScore,
      });
    }
    S.goalAlertWatching[id] = true;
  }
  if (changed) persistGoalAlertSeen();
}
function stopFavGoalPoll() {
  if (S.favGoalPoll) { clearInterval(S.favGoalPoll); S.favGoalPoll = null; }
}
async function tickFavGoalPoll() {
  if (!(S.favs || []).length) { stopFavGoalPoll(); return; }
  const ids = favGoalWatchIds();
  if (!ids.length) return;
  const scheduleCovering = !document.hidden && route().name === 'schedule' && S.liveScorePoll
    && S.liveScoresAt && Date.now() - S.liveScoresAt < 40000;
  if (scheduleCovering) {
    notifyFavGoalsFromScores(S.liveScores || {}, S.liveScores || {});
    return;
  }
  await loadLiveScores(ids, { force: true, bust: true });
}
function ensureFavGoalPoll() {
  if (!IS_APP) { stopFavGoalPoll(); return; }
  if (!(S.favs || []).length) { stopFavGoalPoll(); return; }
  if (S.favGoalPoll) return;
  tickFavGoalPoll();
  S.favGoalPoll = setInterval(tickFavGoalPoll, 30000);
}
try { window.__tickFavGoalPoll = tickFavGoalPoll; } catch (_) {}

/** 1.9.245: 下拉刷新时强制拉取当日实时比分（同时跳过客户端与服务端缓存）。 */
function pullRefreshScheduleLiveScores() {
  try {
    if (route().name !== 'schedule') return Promise.resolve(null);
    const model = scheduleDayModel();
    if (!model || !model.classifiedDay.length) return Promise.resolve(null);
    S.liveScoresAt = 0;
    return loadLiveScores(model.classifiedDay.map(x => String(x.id)), { force: true, bust: true });
  } catch (_) { return Promise.resolve(null); }
}
/**
 * 1.9.247: heartbeat poll while staying on the 赛程/比分 list.
 * - keepAlive as long as the day still has unfinished matches (even pre-KO, so games
 *   that kick off while the user stays on the list start refreshing without a re-render);
 * - ids recomputed each tick (date switch / late schedule rows are never missed);
 * - force+bust every tick so neither the 35s client TTL nor the ~45s server payload
 *   cache can hold the list minutes/scores behind match detail (AF upstream caches
 *   still bound API quota server-side).
 */
function ensureLiveScorePoll(keepAlive) {
  stopLiveScorePoll();
  if (!keepAlive) return;
  S.liveScorePoll = setInterval(async () => {
    if (document.hidden) return;
    const r = route();
    if (r.name !== 'schedule') { stopLiveScorePoll(); return; }
    const model = scheduleDayModel();
    if (!model || !model.classifiedDay.length) return;
    const { classifiedDay, counts } = model;
    if (!scheduleHasPendingLive(classifiedDay)) { stopLiveScorePoll(); return; }
    if (!scheduleNeedLivePoll(classifiedDay, counts)) return; // 未开球：待命不请求
    await loadLiveScores(classifiedDay.map(x => String(x.id)), { force: true, bust: true });
    afterScheduleLiveScoresLoaded();
  }, 30000);
}

/** Shared schedule day model (date strip + league chips + list body). */
function scheduleDayModel() {
  const ms = (S.schedule && S.schedule.length) ? S.schedule : S.matches;
  const rs = S.results;
  if (!ms) return null;
  const dates = [...new Set([...(rs || []).map(issueDate), ...ms.map(issueDate)])].sort();
  const today = bjDate(0);
  if (!S.schDate) {
    S.schDate = dates.find(d => d >= today && ms.some(m => issueDate(m) === d)) || dates.find(d => d >= today) || dates[dates.length - 1];
  }
  const dayRes = (rs || []).filter(r => issueDate(r) === S.schDate);
  const dayAll = [...ms.filter(m => issueDate(m) === S.schDate && !dayRes.some(r => r.id === m.id)).map(m => ({ ...m, _t: 'm' })), ...dayRes.map(r => ({ ...r, _t: 'r' }))];
  const classifiedDay = dayAll.map(classifyScoreRow);
  const mode = '当日';
  let modeRows = classifiedDay;
  if (S.schLeague !== '全部' && !modeRows.some(x => x.league === S.schLeague)) S.schLeague = '全部';
  const gapInfo = S.ssrc && S.ssrc.meta && S.ssrc.meta.gaps && S.ssrc.meta.gaps[S.schDate];
  const counts = {
    all: classifiedDay.length,
    live: classifiedDay.filter(x => x._kind === 'live').length,
    ns: classifiedDay.filter(x => x._kind === 'ns').length,
    ft: classifiedDay.filter(x => x._kind === 'ft').length,
  };
  return { ms, rs, dates, mode, dayAll, classifiedDay, modeRows, gapInfo, counts };
}

/** 竞彩场次编号排序键：「周日026」→ 26（取末尾连续数字）。 */
function matchNumSortKey(num) {
  const m = String(num || '').match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function scheduleListRows(modeRows) {
  let rows = modeRows.filter(x => S.schLeague === '全部' || x.league === S.schLeague);
  rows.sort((a, b) => {
    const finRank = k => (k === 'ft' ? 1 : 0);
    const d = finRank(a._kind) - finRank(b._kind);
    if (d) return d;
    const nk = matchNumSortKey(a.num) - matchNumSortKey(b.num);
    if (nk) return nk;
    return String(a.num || '').localeCompare(String(b.num || ''), 'zh');
  });
  return rows;
}

function scheduleBodyHtml(model) {
  if (!model) return '';
  const { mode, modeRows, gapInfo, counts, classifiedDay } = model;
  let h = '';
  if (gapInfo && gapInfo.missing && gapInfo.missing.length) {
    h += `<div class="sch-filter-banner warn" role="status">
      <span>编号缺口：当日缺 ${gapInfo.missing.map(n => '「' + n + '」').join('、')}（已显示 ${gapInfo.have}/${gapInfo.max}）。下拉刷新或稍后再试。</span>
    </div>`;
  }
  h += warnBar();
  const rows = scheduleListRows(modeRows);
  if (!rows.length) {
    h += empty('该日期暂无场次，可切换日期查看。', '', '暂无场次');
  } else {
    // 1.9.257: 「全部」与单联赛筛选均按竞彩编号平铺，不再按联赛分块（避免 009→意甲块、010→德甲块打断编号序）
    // 1.9.263: 未完场 / 已结束之间加隔断
    const open = rows.filter(x => x._kind !== 'ft');
    const done = rows.filter(x => x._kind === 'ft');
    const list = chunk => `<div class="ls-list">${chunk.map(scoreCard).join('')}</div>`;
    if (open.length && done.length) {
      h += list(open);
      h += `<div class="ls-sec ls-sec-ft" role="separator"><span class="ls-sec-lab">已结束</span></div>`;
      h += list(done);
    } else {
      h += list(rows);
    }
  }
  if (typeof console !== 'undefined' && console.debug) {
    console.debug('[schedule]', S.schDate, 'shown=', modeRows.length, 'league=', S.schLeague, 'gaps=', gapInfo || null);
  }
  return h;
}

function applySchLeagueFromChip(el) {
  const pick = String((el && (el.getAttribute('data-slg') || el.dataset.slg)) || '').trim();
  if (!pick) return false;
  const next = (pick === S.schLeague && pick !== '全部') ? '全部' : pick;
  if (next === S.schLeague) return false;
  S.schLeague = next;
  return true;
}

/** 1.9.154: patch schedule league chips + list in place (avoid TAB_KEEP / render no-op flash). */
function softPatchSchedule() {
  try {
    if (route().name !== 'schedule') return false;
    const model = scheduleDayModel();
    if (!model) return false;
    const v = document.getElementById('view');
    if (!v) return false;
    const chips = v.querySelector('.league-chips');
    if (!chips) return false;
    const wrap = document.createElement('div');
    wrap.innerHTML = leagueChips(model.modeRows, S.schLeague, 'slg', { strong: true });
    const nextChips = wrap.firstElementChild;
    if (nextChips) chips.replaceWith(nextChips);
    let body = document.getElementById('schBody');
    if (!body) {
      body = document.createElement('div');
      body.id = 'schBody';
      body.className = 'sch-body';
      const footEl = v.querySelector('.foot');
      if (footEl) v.insertBefore(body, footEl);
      else v.appendChild(body);
    }
    body.innerHTML = scheduleBodyHtml(model);
    resumeScheduleLivePoll();
    try {
      render.lastSig = tabContentSig('schedule');
      render.last = location.hash;
    } catch (_) {}
    saveTabKeep('schedule', v);
    return true;
  } catch (_) { return false; }
}

function schChannelsHtml() {
  const ch = schChannelOf();
  return `<nav class="sch-channels" aria-label="赛程视图">
    <button type="button" class="${ch === 'list' ? 'on' : ''}" data-act="schChannel" data-ch="list" aria-current="${ch === 'list' ? 'true' : 'false'}">比分</button>
    <button type="button" class="${ch === 'calc' ? 'on' : ''}" data-act="schChannel" data-ch="calc" aria-current="${ch === 'calc' ? 'true' : 'false'}">计算器</button>
  </nav>`;
}

/** 计算器停选：与比分页 classifyScoreRow + 开球时刻一致（非仅按日历日）。 */
function calcMatchClosed(row) {
  if (!row) return true;
  const x = row._kind != null ? row : classifyScoreRow(row);
  if (x._kind === 'ft' || x._kind === 'live') return true;
  if (Date.now() >= kickoff(x)) return true;
  return false;
}
function crsPoolKey(hg, ag) {
  return 's' + String(hg).padStart(2, '0') + 's' + String(ag).padStart(2, '0');
}
function crsCalcSelKey(hg, ag) {
  return 'crs_' + crsPoolKey(hg, ag);
}
function purgeCalcSelClosed() {
  let changed = false;
  for (const mid of Object.keys(S.calcSel)) {
    const m = findMatch(mid);
    if (!m || calcMatchClosed(m)) {
      delete S.calcSel[mid];
      changed = true;
    }
  }
  return changed;
}
function calcOddsCell(m, pool, k, closed) {
  const o = m[pool];
  const v = o && o[k];
  const key = pool + k;
  const sel = S.calcSel[m.id]?.[key];
  const pr = implied(o);
  const top = pr ? order(pr)[0] : null;
  const hot = !!(pr && k === top && pr[k] >= 0.45);
  const dis = closed || !v;
  return `<button type="button" class="calc-cell ${dis ? 'dis' : ''} ${sel ? 'sel' : ''}${hot && !dis ? ' is-hot' : ''}"${dis ? '' : ' data-act="calcPick"'} data-mid="${esc(m.id)}" data-calc-key="${esc(key)}" data-odds="${v || ''}"${dis ? ' disabled' : ''}><span class="lab">${LBL[pool][k]}</span><b class="num">${v ? v.toFixed(2) : '--'}</b>${hot && !dis ? '<i class="calc-hot">热</i>' : ''}</button>`;
}
function calcOddsRow(m, pool, closed) {
  const o = m[pool];
  const gl = pool === 'had' ? '0' : (o?.goalLine || '-');
  return `<div class="calc-odds-row"><div class="calc-gl ${pool === 'had' ? '' : String(gl).startsWith('-') ? 'neg' : 'pos'}">${esc(gl)}</div>${['h', 'd', 'a'].map(k => calcOddsCell(m, pool, k, closed)).join('')}</div>`;
}
function calcMatchPickCount(mid) {
  const s = S.calcSel[mid];
  return s ? Object.keys(s).length : 0;
}
function calcMoreBtnInner(mid) {
  const n = calcMatchPickCount(mid);
  if (!n) return '更多玩法';
  return `<span class="calc-more-n">${n}</span><span class="calc-more-sel">已选</span>`;
}
function syncCalcMoreBtn(mid) {
  const btn = document.querySelector(`.calc-more-btn[data-mid="${CSS.escape(String(mid))}"]`);
  if (!btn) return;
  const n = calcMatchPickCount(mid);
  btn.classList.toggle('has-sel', n > 0);
  btn.innerHTML = calcMoreBtnInner(mid);
}
function calcMatchCard(m) {
  const closed = calcMatchClosed(m);
  const lg = esc(m.leagueColor || '#2F6FED');
  const pickN = calcMatchPickCount(m.id);
  const phase = closed ? (m._phaseZh || (Date.now() >= kickoff(m) ? '已开赛' : '')) : '';
  return `<div class="calc-card${closed ? ' is-closed' : ''}" data-mid="${esc(m.id)}">
    <div class="calc-card-top">
      <div class="calc-teams-line"><span class="ct h">${badge(m.home, 'sm', m.homeLogo)}<b>${esc(m.home)}</b></span><span class="ct-vs">VS</span><span class="ct a"><b>${esc(m.away)}</b>${badge(m.away, 'sm', m.awayLogo)}</span></div>
      <div class="calc-card-meta"><span class="calc-num">${esc(m.num || '')}</span><span class="calc-lg" style="color:${lg}">${esc(m.league || '')}</span><span class="calc-tm">${esc(m.time || '--:--')}</span>${phase ? `<span class="calc-st">${esc(phase)}</span>` : ''}</div>
    </div>
    <div class="calc-card-odds">
      <div class="calc-odds-stack">${calcOddsRow(m, 'had', closed)}${calcOddsRow(m, 'hhad', closed)}</div>
      <button type="button" class="calc-more-btn${pickN ? ' has-sel' : ''}${closed ? ' dis' : ''}" data-act="calcMore" data-mid="${esc(m.id)}"${closed ? ' disabled' : ''}>${calcMoreBtnInner(m.id)}</button>
    </div>
  </div>`;
}
function scheduleCalcRows(model) {
  const rows = scheduleListRows(model.modeRows).filter(x => x._kind !== 'ft');
  return rows.filter(x => x.had || x.hhad);
}
function scheduleCalcHtml(model) {
  if (!model) return '';
  const rows = scheduleCalcRows(model);
  const wk = wd(S.schDate || bjDate(0));
  let h = `<div class="calc-panel">
    <div class="calc-date-row">
      <div class="calc-date-pill">${esc(S.schDate || '')} ${wk} 共${rows.length}场</div>
      <button type="button" class="calc-help-inline" data-act="calcHelp">玩法说明</button>
    </div>
    `;
  if (!rows.length) {
    h += empty('该日期暂无在售场次，可切换日期或查看比分列表。', '', '暂无可算场次');
  } else {
    h += `<div class="calc-list">${rows.map(calcMatchCard).join('')}</div>`;
  }
  h += `<p class="calc-edu-note">串关试算工具，仅供学习参考，非投注下单。</p>`;
  return h + '</div>';
}
function calcPickCount() {
  return calcSelMatches().reduce((a, x) => a + x.keys.length, 0);
}
function calcCanSubmit() {
  const sm = calcSelMatches();
  if (!sm.length) return false;
  if (sm.length >= 2) return true;
  return sm.length === 1 && sm[0].keys.length >= 1;
}
function calcSelLabel(key) {
  if (key.startsWith('hhad')) return LBL.hhad[key.slice(4)] + '(让球)';
  if (key.startsWith('had')) return LBL.had[key.slice(3)];
  if (key === 'crs_s1sh') return '比分 胜其它';
  if (key === 'crs_s1sd') return '比分 平其它';
  if (key === 'crs_s1sa') return '比分 负其它';
  if (key.startsWith('crs_')) {
    const m = key.slice(4).match(/s(\d+)s(\d+)/);
    return '比分 ' + (m ? (+m[1]) + ':' + (+m[2]) : key.slice(4));
  }
  if (key.startsWith('ttg_')) return '总进球 ' + (key.slice(4) === 's7' ? '7+' : key.slice(4).replace('s', ''));
  if (key.startsWith('hafu_')) {
    const map = { hh: '胜胜', hd: '胜平', ha: '胜负', dh: '平胜', dd: '平平', da: '平负', ah: '负胜', ad: '负平', aa: '负负' };
    return '半全场 ' + (map[key.slice(5)] || key.slice(5));
  }
  return key;
}
function toggleCalcPick(mid, key, oddsVal) {
  const m = findMatch(mid);
  if (!m || !key || calcMatchClosed(m)) return;
  const v = Number(oddsVal);
  if (!v || v < 1) return;
  const prevN = calcSelMatches().length;
  const s = (S.calcSel[mid] ||= {});
  if (s[key]) delete s[key];
  else s[key] = v;
  if (!Object.keys(s).length) delete S.calcSel[mid];
  bumpCalcTypesOnMoreMatches(prevN);
  const on = !!S.calcSel[mid]?.[key];
  const midQ = CSS.escape(String(mid));
  const keyQ = CSS.escape(key);
  document.querySelectorAll(`.calc-cell[data-mid="${midQ}"][data-calc-key="${keyQ}"],.calc-more-cell[data-mid="${midQ}"][data-calc-key="${keyQ}"]`).forEach(el => el.classList.toggle('sel', on));
  syncCalcMoreBtn(mid);
  renderCalcBar();
}
function renderCalcBar() {
  purgeCalcSelClosed();
  const bar = $('#calcbar');
  if (!bar) return;
  const r = route();
  const show = r.name === 'schedule' && schChannelOf() === 'calc';
  bar.classList.toggle('hidden', !show);
  const view = $('#view');
  if (view) view.classList.toggle('has-calcbar', show);
  if (!show) {
    bar.classList.remove('has-sel');
    if (view) view.classList.remove('has-calcbar-sel');
    return;
  }
  const sm = calcSelMatches();
  const c = calcFrom(S.calcSel, S.calcTypes, S.calcMult);
  S.calcTypes = c.types;
  const can = calcCanSubmit();
  if (!sm.length) {
    bar.classList.remove('has-sel');
    if (view) view.classList.remove('has-calcbar-sel');
    bar.innerHTML = `<button type="button" class="calcbar-clear" data-act="calcClear" aria-label="清空">${I.trash || '🗑'}</button>
      <div class="calcbar-hint"><div class="t">请选择比赛</div><div class="s">至少选择1场单关或任意两场比赛</div></div>
      <button type="button" class="calcbar-submit dis" data-act="calcSubmit" disabled>提交</button>`;
    return;
  }
  bar.classList.add('has-sel');
  if (view) view.classList.add('has-calcbar-sel');
  const typeLab = calcTypeBarLabel(S.calcTypes.length ? S.calcTypes : c.types);
  bar.innerHTML = `<button type="button" class="calcbar-clear" data-act="calcClear" aria-label="清空">${I.trash || '🗑'}</button>
    <div class="calcbar-body">
      <div class="calcbar-row1">
        <button type="button" class="calcbar-type" data-act="openCalcComboSheet" aria-label="过关方式">${typeLab}</button>
        <button type="button" class="calcbar-mult-wrap" data-act="openCalcMultSheet" data-mult-src="bar" aria-label="倍数">
          <span class="calcbar-mult-val">${S.calcMult}</span>
          <span class="bei">倍</span>
        </button>
        <div class="calcbar-cost">共 <b>${c.cost}</b> 元</div>
      </div>
      <div class="calcbar-row2">预测奖金 <span class="calcbar-prize"><b>${c.min.toFixed(2)}~${c.max.toFixed(2)}</b></span> 元</div>
    </div>
    <button type="button" class="calcbar-submit${can ? '' : ' dis'}" data-act="calcSubmit"${can ? '' : ' disabled'}>提交</button>`;
}
function calcComboBtnsHtml(avail, selectedTypes, pickAct) {
  const act = pickAct || 'calcType';
  const on = t => (selectedTypes || []).includes(t);
  return `<div class="calc-combo-btns">${avail.map(t => `<button type="button" data-act="${act}" data-type="${t}" class="calc-combo-btn${on(t) ? ' on' : ''}">${typeName(t)}</button>`).join('')}</div>`;
}
function calcComboSheetSubtitle(n, types) {
  const hit = (types && types.length) ? Math.min(...types) : (n === 1 ? 1 : 2);
  return `(命中${hit}场可中奖)`;
}
function openCalcComboSheet() {
  const c = calcFrom(S.calcSel, S.calcTypes, S.calcMult);
  S.calcTypes = c.types;
  openSheetHtml(`<div class="sheet calc-combo-sheet">
    <div class="calc-sheet-hd">
      <div class="calc-sheet-hd-t"><span class="t">过关方式</span><span class="sub">${calcComboSheetSubtitle(c.n, S.calcTypes)}</span></div>
      <button type="button" class="x" data-act="closeSheet">✕</button>
    </div>
    ${calcComboBtnsHtml(c.avail, S.calcTypes, 'calcType')}
  </div>`);
  renderCalcBar();
}
function calcMultContextCost(src) {
  if (src === 'plan') {
    const c = calc();
    return c.cost;
  }
  const c = calcFrom(S.calcSel, S.calcTypes, S.calcMult);
  return c.cost;
}
function calcMultSheetHtml(draftStr, costYuan, src) {
  const presets = [10, 20, 50, 100, 500];
  const show = draftStr || '1';
  const mult = clampCalcMult(parseInt(show, 10) || 1);
  const cost = src === 'plan' ? calc().cost : calcFrom(S.calcSel, S.calcTypes, mult).cost;
  return `<div class="sheet calc-mult-sheet">
    <div class="calc-sheet-hd calc-mult-hd">
      <div class="calc-sheet-hd-t center"><span class="t">已选<b>${esc(String(show))}</b>倍 <b>${cost}</b>元</span></div>
      <button type="button" class="x" data-act="closeCalcMultSheet">✕</button>
    </div>
    <div class="calc-mult-presets">${presets.map(p => `<button type="button" class="calc-mult-preset" data-act="calcMultPreset" data-val="${p}">${p}倍</button>`).join('')}</div>
    <div class="calc-mult-pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-act="calcMultKey" data-key="${n}">${n}</button>`).join('')}
      <button type="button" class="pad-del" data-act="calcMultKey" data-key="del">删除</button>
      <button type="button" data-act="calcMultKey" data-key="0">0</button>
      <button type="button" class="pad-ok" data-act="calcMultConfirm" data-mult-src="${esc(src)}">确定</button>
    </div>
  </div>`;
}
function openCalcMultSheet(src) {
  S._calcMultDraft = String(src === 'plan' ? S.mult : S.calcMult);
  S._calcMultSrc = src || 'bar';
  const cost = calcMultContextCost(S._calcMultSrc);
  openSheetHtml(calcMultSheetHtml(S._calcMultDraft, cost, S._calcMultSrc));
}
function refreshCalcMultSheet() {
  if (!S._calcMultSrc) return;
  const sh = $('#sheet');
  if (!sh || sh.classList.contains('hidden')) return;
  const el = sh.querySelector('.calc-mult-sheet');
  if (!el) return;
  el.outerHTML = calcMultSheetHtml(S._calcMultDraft || '1', calcMultContextCost(S._calcMultSrc), S._calcMultSrc);
}
function commitCalcMultFromDraft() {
  const v = clampCalcMult(parseInt(S._calcMultDraft || '1', 10) || 1);
  const src = S._calcMultSrc || 'bar';
  if (src === 'plan') {
    S.mult = v;
    closeSheet();
    return openPlanSheet();
  }
  S.calcMult = v;
  closeSheet();
  if (calcSubmitSheetOpen()) return openCalcSubmitSheet();
  renderCalcBar();
}
function closeCalcMultSheet() {
  S._calcMultDraft = '';
  S._calcMultSrc = '';
  closeSheet();
}
function openCalcHelpSheet() {
  openSheetHtml(`<div class="sheet calc-help-sheet"><h3><span>玩法说明</span><button class="x" data-act="closeSheet">✕</button></h3>
    <div class="doc" style="margin:0;box-shadow:none;padding:0">
      <p>本页为<strong>串关试算计算器</strong>：选择胜平负、让球及更多玩法后，按竞彩固定奖金规则估算注数与中奖金额。</p>
      <ul><li>每注按 <b>2 元</b>面值试算（与官方单注面值一致）。</li><li>单关：仅选 1 场；M串1：从所选场次中取 M 场组成一注，多场多选时按组合展开。</li><li>同场多选项会按「复式」展开；最高试算奖金为各注赔率乘积之和 × 2元 × 倍数。</li><li>未含税、未考虑官方封顶；结果仅供学习，不构成投注建议。</li></ul>
    </div></div>`);
}
function calcPickLineText(key, odds) {
  if (key.startsWith('had')) return `胜平负：${LBL.had[key.slice(3)]}@ ${odds.toFixed(2)}`;
  if (key.startsWith('hhad')) return `让球：${LBL.hhad[key.slice(4)]}@ ${odds.toFixed(2)}`;
  return `${calcSelLabel(key)} @${odds.toFixed(2)}`;
}
function calcResultMatchBlock(x) {
  const m = x.m;
  const gl = m.hhad?.goalLine;
  const hcap = gl ? `<em class="calc-rc-hcap">(主${esc(gl)})</em>` : '';
  const lines = x.keys.map((k, i) => `<li>${esc(calcPickLineText(k, x.odds[i]))}</li>`).join('');
  return `<div class="calc-rc-match">
    <div class="calc-rc-hd">
      <div class="calc-rc-teams">${badge(m.home, 'sm', m.homeLogo)}<span class="nm">${esc(m.home)}${hcap}</span><span class="vs">VS</span><span class="nm">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div>
      <span class="calc-rc-num">${esc(m.num || '')}</span>
    </div>
    <ul class="calc-rc-lines">${lines}</ul>
  </div>`;
}
function openCalcSubmitSheet() {
  purgeCalcSelClosed();
  const sm = calcSelMatches();
  if (!calcCanSubmit()) return toast('请先按规则选择场次');
  S.calcMult = clampCalcMult(S.calcMult);
  const c = calcFrom(S.calcSel, S.calcTypes, S.calcMult);
  S.calcTypes = c.types;
  openSheetHtml(`<div class="sheet calc-result-sheet"><h3><span>试算结果</span><button class="x" data-act="closeSheet">✕</button></h3>
    <div class="calc-rc-list">${sm.map(calcResultMatchBlock).join('')}</div>
    <div class="calc-combo-block">
      <div class="calc-sheet-hd-inline"><span class="t">过关方式</span><span class="sub">${calcComboSheetSubtitle(c.n, S.calcTypes)}</span></div>
      ${calcComboBtnsHtml(c.avail, S.calcTypes, 'calcType')}
    </div>
    <div class="calc-row"><span>倍数</span><button type="button" class="calc-mult-trigger" data-act="openCalcMultSheet" data-mult-src="submit"><span class="v">${S.calcMult}</span> 倍</button></div>
    <div class="calc-row"><span>注数</span><span class="num"><b>${c.bets}</b> 注 · 面值 ${c.cost} 元</span></div>
    <div class="calc-row"><span>中奖试算</span><span class="num"><b>${c.max.toFixed(2)}</b> 元</span></div>
    <p class="note">若所选赛果全部命中，按当前赔率组合展开后的最高可中金额（2元/注 × 赔率乘积 × 倍数，未计税）。仅供学习试算。</p>
    <button type="button" class="btn pri block" data-act="openBonusOpt">优化方案</button>
    <button type="button" class="btn ghost block" data-act="closeSheet">关闭</button></div>`);
  renderCalcBar();
}
function calcMorePickCell(mid, key, topLab, oddsVal, closed) {
  if (oddsVal == null || oddsVal === '' || Number(oddsVal) < 1) return '';
  const sel = S.calcSel[mid]?.[key] ? ' sel' : '';
  const dis = closed ? ' dis' : '';
  const act = closed ? '' : ' data-act="calcPick"';
  const disAttr = closed ? ' disabled' : '';
  return `<button type="button" class="calc-more-cell${sel}${dis}"${act} data-mid="${esc(mid)}" data-calc-key="${esc(key)}" data-odds="${Number(oddsVal)}"${disAttr}><span class="t">${esc(topLab)}</span><b class="o">${fmtOdd(oddsVal)}</b></button>`;
}
function calcMoreWdlRow(mid, gl, pool, o, closed) {
  if (!o) return '';
  const glLab = pool === 'had' ? '0' : (gl ?? o.goalLine ?? '-');
  const glCls = pool === 'had' ? '' : (String(glLab).startsWith('-') ? 'neg' : 'pos');
  const cells = ['h', 'd', 'a'].map(k => calcMorePickCell(mid, pool + k, LBL[pool][k], o[k], closed)).join('');
  if (!cells.replace(/\s/g, '')) return '';
  return `<div class="calc-more-wdl-row"><div class="calc-more-gl ${glCls}">${esc(glLab)}</div><div class="calc-more-wdl-cells">${cells}</div></div>`;
}
function calcMoreCrsBand(mid, p, seg, lab, scores, otherKey, otherLab, closed) {
  let cells = scores.map(([hg, ag]) => {
    const pk = crsPoolKey(hg, ag);
    return calcMorePickCell(mid, crsCalcSelKey(hg, ag), `${hg}:${ag}`, p.crs[pk], closed);
  }).join('');
  cells += calcMorePickCell(mid, 'crs_' + otherKey, otherLab, p.crs[otherKey], closed);
  if (!cells.replace(/\s/g, '')) return '';
  return `<div class="calc-more-crs-band ${seg}"><div class="calc-more-band-lab">${esc(lab)}</div><div class="calc-more-band-grid">${cells}</div></div>`;
}
function bonusOptModes() {
  return [
    { id: 'none', label: '未做优化' },
    { id: 'avg', label: '平均优化' },
    { id: 'cold', label: '博冷优化' },
  ];
}
function syncBonusOptFromCalc(forceAmount) {
  const lines = expandCalcDanShiLines(S.calcSel, S.calcTypes);
  const c = calcFrom(S.calcSel, S.calcTypes, S.calcMult);
  S.calcTypes = c.types;
  const bo = S.bonusOpt;
  if (forceAmount || !bo.amount) bo.amount = defaultBonusOptAmount(c.cost);
  bo.mults = computeBonusOptMults(bo.mode || 'avg', lines, bo.amount, S.calcMult);
  return lines;
}
function openBonusOptSheet() {
  if (!calcCanSubmit()) return toast('请先按规则选择场次');
  const lines = syncBonusOptFromCalc(true);
  if (!lines.length) return toast('当前串关无可优化单式');
  renderBonusOptSheet(lines);
}
function renderBonusOptSheet(lines) {
  const bo = S.bonusOpt;
  const modes = bonusOptModes();
  const mode = bo.mode || 'avg';
  const mults = bo.mults || [];
  const totals = bonusOptTotals(lines, mults);
  const optUnits = bonusOptUnitsFromAmount(bo.amount);
  const sh = $('#sheet');
  sh.classList.remove('hidden');
  sh.classList.add('bonus-opt-mask');
  const modeBtns = modes.map(m => `<button type="button" class="bonus-opt-tab${mode === m.id ? ' on' : ''}" data-act="bonusOptMode" data-mode="${m.id}">${m.label}</button>`).join('');
  const rows = lines.map((line, i) => {
    const m = mults[i] || 0;
    const amt = m * 2;
    const prize = lineEstPrize(line, m);
    const tags = line.picks.map(p => `<span class="bonus-opt-tag">${esc(p.num)} ${esc(p.short)}</span>`).join('');
    return `<div class="bonus-opt-row" data-line="${i}">
      <div class="bonus-opt-tags">${tags}</div>
      <div class="bonus-opt-step stepper"><button type="button" data-act="bonusOptMult" data-line="${i}" data-delta="-1">−</button><input type="number" class="bonus-opt-mult-inp" data-line="${i}" min="0" max="9999" value="${m}"><button type="button" data-act="bonusOptMult" data-line="${i}" data-delta="1">＋</button></div>
      <div class="bonus-opt-amt">${amt}元</div>
      <div class="bonus-opt-prize">${prize.toFixed(2)}</div>
    </div>`;
  }).join('');
  sh.innerHTML = `<div class="sheet bonus-opt-page">
    <header class="bonus-opt-hd">
      <button type="button" class="bonus-opt-back" data-act="bonusOptBack" aria-label="返回">‹</button>
      <span class="bonus-opt-title">奖金优化</span>
      <button type="button" class="bonus-opt-help" data-act="bonusOptHelp" aria-label="说明">?</button>
    </header>
    <div class="bonus-opt-body">
      <div class="bonus-opt-tabs-wrap"><div class="bonus-opt-tabs">${modeBtns}</div></div>
      <div class="bonus-opt-card">
        <section class="bonus-opt-amt-card">
          <div class="bonus-opt-amt-lab">优化金额</div>
          <div class="bonus-opt-amt-center">
            <button type="button" class="bonus-opt-amt-btn" data-act="bonusOptAmt" data-delta="-10" aria-label="减少金额">−</button>
            <div class="bonus-opt-amt-main">
              <span class="bonus-opt-amt-val"><input id="bonusOptAmtInp" type="number" min="2" step="2" value="${bo.amount}"></span>
              <span class="yuan">元</span>
            </div>
            <button type="button" class="bonus-opt-amt-btn" data-act="bonusOptAmt" data-delta="10" aria-label="增加金额">＋</button>
          </div>
          <p class="bonus-opt-amt-sub">（优化倍数 <b>${optUnits}</b> 倍）</p>
        </section>
        <section class="bonus-opt-results">
          <div class="bonus-opt-results-hd">优化结果</div>
          <div class="bonus-opt-table-hd"><span>单式</span><span>倍数</span><span>金额</span><span>预估奖金</span></div>
          <div class="bonus-opt-rows">${rows}</div>
        </section>
      </div>
    </div>
    <footer class="bonus-opt-ft">
      <div class="bonus-opt-ft-pill">
        <div class="bonus-opt-sum">
          <div class="bonus-opt-sum-line1">共 <b>${totals.bets}</b> 注 <b>${totals.cost}</b> 元</div>
          <div class="bonus-opt-sum-line2">预测奖金 <b class="bonus-opt-prize-range">${totals.min.toFixed(2)}~${totals.max.toFixed(2)}</b> 元</div>
        </div>
        <button type="button" class="bonus-opt-done" data-act="bonusOptDone">完成</button>
      </div>
      <p class="calc-edu-note bonus-opt-disclaimer">串关试算工具，仅供学习参考，非投注下单。</p>
    </footer>
  </div>`;
  syncSheetScrollLock();
}
function closeBonusOptSheet() {
  const sh = $('#sheet');
  sh.classList.remove('bonus-opt-mask');
}
function openBonusOptHelp() {
  confirmDlg('奖金优化说明',
    '<p>将试算单式按目标金额分配整数倍数，仅供学习试算，不涉及真实投注。</p><ul style="margin:8px 0 0;padding-left:18px;text-align:left"><li><b>未做优化</b>：在优化金额内各单式均分整数倍数（余数按序 +1）。</li><li><b>平均优化</b>：在优化金额内按赔率倒数分配倍数，使各单式预估奖金尽量接近。</li><li><b>博冷优化</b>：先为其余单式分配使预估奖金不低于优化金额的倍数（回本），剩余倍数全部给最高赔率单式；若全体回本超出预算，则几乎 all-in 最高赔率单式。</li></ul>',
    '知道了');
}
function renderCalcMorePickables(mid, snap, m) {
  const closed = calcMatchClosed(m);
  const p = snap && snap.pools;
  const had = (p && p.had) || m?.had;
  const hhad = (p && p.hhad) || m?.hhad;
  let h = '';
  if (had || hhad) {
    h += `<div class="calc-more-block"><div class="calc-more-st">胜平负/让球</div><div class="calc-more-wdl">`;
    h += calcMoreWdlRow(mid, '0', 'had', had, closed);
    h += calcMoreWdlRow(mid, hhad?.goalLine, 'hhad', hhad, closed);
    h += `</div></div>`;
  }
  if (p && p.crs) {
    h += `<div class="calc-more-block"><div class="calc-more-st">比分</div><div class="calc-more-crs-wrap">`;
    h += calcMoreCrsBand(mid, p, 'win', '胜', CRS_MORE_WIN, 's1sh', '胜其它', closed);
    h += calcMoreCrsBand(mid, p, 'draw', '平', CRS_MORE_DRAW, 's1sd', '平其它', closed);
    h += calcMoreCrsBand(mid, p, 'lose', '负', CRS_MORE_LOSE, 's1sa', '负其它', closed);
    h += `</div></div>`;
  }
  if (p && p.ttg) {
    h += `<div class="calc-more-block"><div class="calc-more-st">总进球</div><div class="calc-more-ttg-wrap">`;
    h += `<div class="calc-more-band-lab ttg">进球数</div><div class="calc-more-ttg-grid">`;
    for (let i = 0; i <= 7; i++) h += calcMorePickCell(mid, 'ttg_s' + i, (i === 7 ? '7+' : i + '球'), p.ttg['s' + i], closed);
    h += `</div></div></div>`;
  }
  if (p && p.hafu) {
    const labs = [['hh', '胜胜'], ['hd', '胜平'], ['ha', '胜负'], ['dh', '平胜'], ['dd', '平平'], ['da', '平负'], ['ah', '负胜'], ['ad', '负平'], ['aa', '负负']];
    h += `<div class="calc-more-block"><div class="calc-more-st">半全场</div><div class="calc-more-hafu-wrap">`;
    h += `<div class="calc-more-band-lab hafu">半全场</div><div class="calc-more-hafu-grid">`;
    for (const [k, lab] of labs) h += calcMorePickCell(mid, 'hafu_' + k, lab, p.hafu[k], closed);
    h += `</div></div></div>`;
  }
  if (!h) h = '<p class="note">暂无更多玩法数据，请稍后重试。</p>';
  return h;
}
function calcMoreSheetShell(m, body) {
  return `<div class="calc-more-top">
    <button type="button" class="calc-more-back" data-act="closeSheet" aria-label="返回">‹</button>
    <span class="calc-more-title">${esc(m.home)} VS ${esc(m.away)}</span>
    <button type="button" class="calc-more-rules" data-act="calcHelp">玩法说明</button>
  </div>
  <div class="calc-more-body">${body}</div>
  <div class="calc-more-foot">
    <button type="button" class="calc-more-cancel" data-act="closeSheet">取消</button>
    <button type="button" class="calc-more-ok" data-act="calcMoreOk">确定</button>
  </div>`;
}
async function openCalcMoreSheet(mid) {
  const m = findMatch(mid);
  if (!m) return;
  if (calcMatchClosed(m)) return toast('该场已开赛，不可再选');
  openSheetHtml(`<div class="sheet calc-more-sheet calc-more-sheet--official">${calcMoreSheetShell(m, '<div class="spinner"></div><p class="note">加载更多玩法…</p>')}</div>`);
  const snap = await loadOddsSnapshot(mid, m.date, m);
  const inner = document.querySelector('.calc-more-sheet');
  if (!inner) return;
  inner.innerHTML = calcMoreSheetShell(m, renderCalcMorePickables(mid, snap, m));
}

function pageSchedule() {
  let h = '';
  const model = scheduleDayModel();
  if (!model) return h + skeleton(4);
  const { modeRows, classifiedDay } = model;
  h += schChannelsHtml();
  if (schChannelOf() === 'calc') {
    h += scheduleCalcHtml(model);
  } else {
    h += leagueChips(modeRows, S.schLeague, 'slg', { strong: true });
    h += `<div id="schBody" class="sch-body">${scheduleBodyHtml(model)}</div>`;
  }
  const allDayIds = classifiedDay.map(x => String(x.id));
  const needFetch = !S.liveScoresAt || Date.now() - S.liveScoresAt > 35000;
  if (needFetch && allDayIds.length) {
    setTimeout(async () => {
      await loadLiveScores(allDayIds);
      afterScheduleLiveScoresLoaded();
    }, 0);
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
      <p class="note" style="margin:8px 0 0">历史回测：测试集中同规则约 66.7% 命中（21 个有样本的交易日）。</p></div>`;
  }
  const row = (x) => `<button class="tf-row" data-go="#/match/${encodeURIComponent(x.m.id)}">
      <div class="tf-l">${lgTag(x.m)}<span>${esc(x.m.num)}</span></div>
      <div class="tf-m">${esc(x.m.home)} vs ${esc(x.m.away)}</div>
      <div class="tf-r"><b>${x.pr.text}</b><span>${pct(x.pr.conf)} · @${Number(x.m.had[x.pr.top]).toFixed(2)}</span></div>
    </button>`;
  return `<div class="doc tf-card" style="margin:8px 12px"><h4 style="margin:0 0 6px">今日高信心 2串1 参考</h4>
    <p class="note" style="margin:0 0 8px">规则：在售胜平负中取隐含概率 ≥65% 且最高的两场。理论参考赔率约 <b>${c.comboOdds.toFixed(2)}</b>（两场开售赔乘积，未计税/限额）。</p>
    ${row(c.a)}${row(c.b)}
    <p class="note" style="margin:8px 0 0">${esc(c.hist.note)} 命中约 <b>${c.hist.hitRate}%</b>（${c.hist.days} 日）。命中率≠盈利。</p></div>`;
}

function ring(v, opts) {
  const muted = !!(opts && opts.muted);
  const sm = !!(opts && opts.sm);
  const r = sm ? 17 : 23;
  const vb = sm ? 40 : 54;
  const cx = vb / 2;
  const sw = sm ? 4 : 5;
  const c = 2 * Math.PI * r;
  const stroke = muted ? '#98a1b3' : (v >= .6 ? '#e03e36' : v >= .45 ? '#1565e0' : '#98a1b3');
  const cls = (muted ? 'ring ring-muted' : 'ring') + (sm ? ' ring-sm' : '');
  return `<div class="${cls}"><svg viewBox="0 0 ${vb} ${vb}"><circle cx="${cx}" cy="${cx}" r="${r}" stroke="#e9f0ff" stroke-width="${sw}" fill="none"/><circle cx="${cx}" cy="${cx}" r="${r}" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="num">${Math.round(v * 100)}</span></div>`;
}
function ringCluster(v, opts) {
  const muted = !!(opts && opts.muted);
  const lab = (opts && opts.label != null) ? opts.label : '信心';
  const sm = !!(opts && opts.sm);
  return `<div class="pr-conf-cluster${muted ? ' muted' : ''}${sm ? ' sm' : ''}"><span class="pr-conf-lab">${esc(lab)}</span>${ring(v, { muted, sm })}</div>`;
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
  // 1.9.102: when HAD absent, show HHAD strip (让球对照) instead of empty
  const hadIp = implied(m.had);
  const hhadIp = implied(m.hhad);
  const useHhad = !hadIp && !!hhadIp;
  const o = useHhad ? m.hhad : m.had;
  const ip = useHhad ? hhadIp : hadIp;
  if (!o || !ip) return '';
  const labs = useHhad
    ? [['h', '让胜'], ['d', '让平'], ['a', '让负']]
    : [['h', '主胜'], ['d', '平局'], ['a', '客胜']];
  const top = (pr && ((useHhad && pr.pool === 'hhad') || (!useHhad && pr.pool === 'had')) && pr.top)
    ? pr.top
    : order(ip)[0];
  const gl = useHhad && m.hhad && m.hhad.goalLine != null && m.hhad.goalLine !== ''
    ? `<div class="pr-odds-gl">让球对照 ${esc(String(m.hhad.goalLine))}</div>` : '';
  return `${gl}<div class="pr-odds">${labs.map(([k, lab]) =>
    `<div class="oc ${k === top ? 'on' : ''}">${lab}<b class="num">${o[k] ? o[k].toFixed(2) : '-'}</b></div>`
  ).join('')}</div>`;
}
function predCardHtml(m, pr, i, opts) {
  const quiet = !!(opts && opts.quiet);
  const confPct = Math.round(pr.conf * 100);
  const mode = pr.speakMode || 'amplify';
  const isPending = mode === 'pending' || !!pr._pending;
  const isWatch = !isPending && (mode === 'align' || mode === 'abstain' || (pr.lvl && pr.lvl[0] === 'l0'));
  const barColor = isPending
    ? 'linear-gradient(90deg,#d7dde8,#b8c0ce)'
    : isWatch
    ? 'linear-gradient(90deg,#c5ccd8,#98a1b3)'
    : pr.conf >= 0.62 ? 'linear-gradient(90deg,#ff6a3d,#e03e36)' : pr.conf >= 0.45 ? 'var(--pri-g)' : 'linear-gradient(90deg,#b0b8c8,#98a1b3)';
  const pickLab = isPending
    ? (pr.speakLabel || '情报加载中…')
    : isWatch ? (pr.speakLabel || pr.text || '观望') : (pr.pickText || pr.text);
  const pickCls = (!isPending && !isWatch && pr.lean && (pr.lean === 'h' || pr.lean === 'd' || pr.lean === 'a'))
    ? ` pick-${pr.lean}` : '';
  const leftLab = isPending ? '状态' : (isWatch ? '表态' : '推荐');
  const rightLab = isPending
    ? '简报加载中'
    : isWatch
    ? (mode === 'align' ? '与盘口一致' : '信息不足')
    : ((pr.multiFactor ? '情报简报' : (pr.pool === 'had' ? '胜平负' : '让球')) + ' · 信心 ' + confPct + '%');
  const mf = isPending
    ? '<span class="mf-tag watch">加载中</span>'
    : isWatch
    ? '<span class="mf-tag watch">观望</span>'
    : (pr.multiFactor ? '<span class="mf-tag">表态</span>' : '<span class="mf-tag watch">赔率参考</span>');
  const edged = !isPending && hasValueEdge(pr);
  const upset = !isPending && !isWatch && isUpsetPr(pr);
  const agree = !edged && !upset && !isPending && !isWatch && isAllAgreePr(pr);
  const flag = (edged ? '<span class="pr-edge-tag">优势关注</span>' : '') + (upset ? '<span class="pr-upset-tag">预测爆冷</span>' : '') + (agree ? '<span class="pr-agree-tag">态度一致</span>' : '');
  const cardCls = (isPending ? ' pr-pending' : (isWatch ? ' pr-watch' : ' pr-speak')) + (edged ? ' pr-edge' : '') + (upset ? ' pr-upset' : '') + (agree ? ' pr-agree' : '');
  if (quiet) {
    const qCls = (isPending ? ' pr-pending' : (isWatch ? ' pr-watch' : '')) + (m.sample ? ' pr-sample' : '');
    const confLab = isPending ? '参考' : (isWatch ? '观望' : '信心');
    return `<div class="card pr-card pr-list-quiet${qCls}" data-go="#/match/${encodeURIComponent(m.id)}">
    <div class="pr-quiet-head">
      <span class="rank ${i < 3 && !isWatch && !isPending ? 'r' + (i + 1) : ''} num">${i + 1}</span>
      <div class="pr-meta">${lgTag(m)}<span>${esc(m.num)} · ${esc(m.date.slice(5))} ${esc(m.time)}</span>${m.sample ? '<span class="sample-tag">示例</span>' : ''}</div>
      ${ringCluster(pr.conf, { muted: isWatch || isPending, label: confLab, sm: true })}
    </div>
    <div class="pr-quiet-body">${prTeamsQuietRow(m)}</div></div>`;
  }
  return `<div class="card pr-card${cardCls}" data-go="#/match/${encodeURIComponent(m.id)}">
    <div class="pr-hd"><span class="rank ${i < 3 && !isWatch && !isPending ? 'r' + (i + 1) : ''} num">${i + 1}</span>
      <div class="pr-hd-body">
        <div class="pr-meta">${lgTag(m)}<span>${esc(m.num)} · ${esc(m.date.slice(5))} ${esc(m.time)}</span>${flag}${m.sample ? '<span class="sample-tag">示例</span>' : ''}</div>
        <div class="pr-teams">${badge(m.home, 'sm', m.homeLogo)}<span class="nm">${esc(m.home)}</span><span class="vs">vs</span><span class="nm">${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}</div>
      </div>${ring(pr.conf, (isWatch || isPending) ? { muted: true } : null)}</div>
    <div class="pr-pick"><div class="pk-l">${leftLab} <b class="${pickCls.trim()}">${esc(pickLab)}</b> <span class="lvl ${pr.lvl[0]}">${esc(pr.lvl[1])}</span>${mf}</div>
      <div class="pk-r">${esc(rightLab)}</div></div>
    ${predOddsMini(m, pr)}
    <div class="pr-cbar"><div class="lab"><span>${isPending ? '参考指数' : (isWatch ? '观望指数' : '信心指数')}</span><span class="num">${confPct}%</span></div>
      <div class="track"><i style="width:${confPct}%;background:${barColor}"></i></div></div>
    ${prChipsHtml(pr)}${prCalibHtml(pr, isWatch || isPending)}
    <p class="pr-blurb">${esc(shortReason(m, pr))}</p></div>`;
}
const SIG_KIND = { intel: '临场', context: '背景', move: '变盘' };
function leanIcon(side) {
  return side === 'h' ? '<i class="ln ln-h">主</i>' : side === 'a' ? '<i class="ln ln-a">客</i>' : side === 'd' ? '<i class="ln ln-d">平</i>' : '<i class="ln ln-n">·</i>';
}
function prChipsHtml(pr) {
  const L = (pr && pr.chips) || [];
  if (!L.length) return '';
  const order = { intel: 0, context: 1, move: 2 };
  return `<div class="sig-chips">${L.slice().sort((a, b) => order[a.k] - order[b.k]).slice(0, 4).map(c =>
    `<span class="sig-chip k-${c.k}"><em>${SIG_KIND[c.k] || ''}</em>${leanIcon(c.side)}${esc(c.text)}</span>`).join('')}</div>`;
}
function prCalibHtml(pr, muted) {
  const c = pr && pr.calib;
  if (!c || muted) return prValueHtml(pr, muted);
  const up = pr.upset && pr.upset.hist;
  const upTxt = isUpsetPr(pr) && up ? (up.hit != null ? ` · 同类爆冷历史命中 ${up.hit}%（n=${up.n}）` : ' · 同类爆冷样本不足') : '';
  const cal = !c.enough
    ? `<div class="pr-calib muted">同类历史命中：样本不足（n=${c.n}）${esc(upTxt)}</div>`
    : `<div class="pr-calib">同类历史命中 <b>${c.rate}%</b>（n=${c.n}）${esc(upTxt)}</div>`;
  return cal + prValueHtml(pr, muted);
}
function prValueHtml(pr, muted) {
  const v = pr && pr.value;
  if (!v || muted) return '';
  if (v.hasEdge && v.best) {
    return `<div class="pr-value on">模型 ${(v.best.our * 100).toFixed(0)}% vs 盘口隐含 ${(v.best.fair * 100).toFixed(0)}%，优势 <b>+${(v.best.edge * 100).toFixed(0)}%</b> → 建议关注${esc(v.best.label)}</div>`;
  }
  return `<div class="pr-value">${esc(v.text || '未发现相对盘口的优势')}</div>`;
}
function sparkSvg(spark, dir) {
  if (!spark || spark.length < 2) return '';
  const W = 220, H = 56, n = spark.length;
  const ks = ['h', 'd', 'a'];
  const vals = spark.flatMap(p => ks.map(k => p[k]));
  const lo = Math.min(...vals) - 0.02, hi = Math.max(...vals) + 0.02;
  const y = v => (H - 6 - (v - lo) / (hi - lo) * (H - 12)).toFixed(1);
  const x = i => (6 + i * (W - 12) / (n - 1)).toFixed(1);
  const col = { h: '#e03e36', d: '#8a93a6', a: '#1a62f0' };
  return `<svg class="mv-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ks.map(k =>
    `<polyline fill="none" stroke="${col[k]}" stroke-width="${k === dir ? 2.4 : 1.3}" opacity="${k === dir || !dir ? 1 : 0.55}" points="${spark.map((p, i) => x(i) + ',' + y(p[k])).join(' ')}"/>`).join('')}</svg>`;
}
function signalPanelHtml(rep) {
  const c = rep && rep.sections && rep.sections.conclusion;
  if (!c || !Array.isArray(c.signals) || !c.signals.length) return '';
  const lab = { h: '主胜', d: '平局', a: '客胜' };
  const maxW = Math.max(1.2, ...c.signals.map(s => s.weight || 0));
  const rows = c.signals.map(s => {
    const has = !!s.lean;
    // 1.9.103: tags/detail without lean (杯赛/德比等) → 中性, not 无信号
    const neutral = !has && !!(s.detail && String(s.detail).trim());
    const same = has && s.lean === c.lean;
    const w = Math.round((s.weight || 0) / maxW * 100);
    const leanLab = has ? leanIcon(s.lean) + lab[s.lean] : (neutral ? leanIcon(null) + '中性' : '无信号');
    return `<div class="sg-row${has || neutral ? '' : ' none'}"><span class="sg-k">${esc(s.label)}</span>
      <span class="sg-lean ${has ? (same ? 'ok' : 'warn') : (neutral ? 'neu' : '')}">${leanLab}</span>
      <span class="sg-bar"><i style="width:${has ? Math.max(6, w) : (neutral ? 6 : 0)}%"></i></span>
      ${s.detail ? `<span class="sg-d">${esc(s.detail)}</span>` : ''}</div>`;
  }).join('');
  let mv = '';
  if (c.movement && c.movement.open) {
    const o = c.movement.open, l = c.movement.last;
    const hhadPool = c.movement.pool === 'hhad';
    const labs = hhadPool ? { h: '让胜', d: '让平', a: '让负' } : { h: '主', d: '平', a: '客' };
    const cell = (k, t) => `<span class="${c.movement.dir === k ? 'on' : ''}">${t} ${o[k].toFixed(2)}→<b>${l[k].toFixed(2)}</b></span>`;
    const title = hhadPool ? '让球变盘走势' : '变盘走势';
    const glNote = hhadPool && c.movement.hhad
      ? `<div class="mv-note">让球线 ${esc(c.movement.hhad.open.gl || '-')} → ${esc(c.movement.hhad.last.gl || '-')}</div>`
      : (c.movement.hhad && c.movement.hhad.lineChanged ? `<div class="mv-note">让球线 ${esc(c.movement.hhad.open.gl)} → ${esc(c.movement.hhad.last.gl)}</div>` : '');
    mv = `<div class="mv-box"><div class="mv-hd">${title} <small>开盘 → 最新（隐含概率曲线）</small></div>
      ${sparkSvg(c.movement.spark, c.movement.dir)}
      <div class="mv-legend">${cell('h', labs.h)}${cell('d', labs.d)}${cell('a', labs.a)}</div>
      ${glNote}</div>`;
  }
  const cal = c.calib;
  const calLine = cal ? (cal.enough ? `同类历史命中 <b>${cal.rate}%</b>（n=${cal.n}）` : `同类历史命中：样本不足（n=${cal.n}）`) : '';
  let up = '';
  if (c.upset) {
    const hh = c.upset.hist;
    up = `<div class="sg-upset ${c.upset.level}"><span class="pr-upset-tag">预测爆冷</span>
      ${c.upset.level === 'strong' ? '逆盘口 + 热门较开盘走弱' : '逆盘口表态'} · ${hh && hh.hit != null ? `同类爆冷历史命中 ${hh.hit}%（n=${hh.n}）` : '同类爆冷样本不足'}</div>`;
  } else if (c.allAgree) {
    up = `<div class="sg-upset agree"><span class="pr-agree-tag">态度一致</span> 盘面与状态两类独立信号同向，无反向信号</div>`;
  }
  const val = valuePanelHtml(c.value);
  return `<div class="dsec sig-panel"><h3>信号拆解 <button type="button" class="sg-help" data-act="modelCheck">模型体检</button></h3>
    ${val}${up}<div class="sg-list">${rows}</div>${calLine ? `<p class="sg-cal">${calLine}</p>` : ''}${mv}</div>`;
}
function valuePanelHtml(v) {
  if (!v) return '';
  const items = (v.items || []).filter(x => x.enough).map(x => {
    const lab = { h: '主胜', d: '平局', a: '客胜' }[x.side];
    const edge = x.edge == null ? '—' : ((x.edge >= 0 ? '+' : '') + (x.edge * 100).toFixed(0) + '%');
    const cls = v.best && v.best.side === x.side ? 'on' : (x.edge != null && x.edge < 0 ? 'neg' : '');
    return `<div class="ve-row ${cls}"><span>${lab}${x.isLean ? '<em>倾向</em>' : ''}</span>
      <span>模型 ${(x.our * 100).toFixed(0)}%</span><span>隐含 ${(x.fair * 100).toFixed(0)}%</span>
      <span class="ve-e">${edge}</span><span class="num">@${x.odds.toFixed(2)}</span></div>`;
  }).join('');
  const head = v.hasEdge && v.best
    ? `<div class="ve-head on"><span class="pr-edge-tag">优势关注</span>${esc(v.text)}</div>`
    : `<div class="ve-head">${esc(v.text || '未发现相对盘口的优势')}</div>`;
  return `<div class="ve-box">${head}${items ? `<div class="ve-list">${items}</div>` : ''}</div>`;
}
async function openModelCheck() {
  const sh = $('#sheet'); sh.classList.remove('hidden');
  sh.innerHTML = `<div class="sheet"><h3><span>模型体检</span><button class="x" data-act="closeSheet">✕</button></h3><div class="spinner"></div></div>`;
  let j = null;
  try { j = await api('/calibration', { timeout: 8000 }); } catch (_) {}
  if (!j || !j.ok) { sh.querySelector('.sheet').innerHTML += '<p class="note">暂不可用</p>'; return; }
  const bars = j.reliability.map(r => `<div class="rl-col"><div class="rl-bars"><i class="p" style="height:${r.avgConf || 0}%"></i><i class="a" style="height:${r.rate || 0}%"></i></div>
    <b>${r.n >= 30 ? r.rate + '%' : '—'}</b><small>${esc(r.bin)}</small><small>n=${r.n}</small></div>`).join('');
  const cat = j.categories.map(c => `<tr><td>${esc(c.label)}</td><td>${c.n >= 30 ? (c.hit != null ? c.hit + '%' : (c.roi != null ? c.roi + '% ROI' : '—')) : '样本不足'}</td><td>${c.n}</td></tr>`).join('');
  const edge = j.edge || null;
  const edgeBlock = edge ? `<div class="mc-edge"><h4>相对盘口优势（阈值 ${(edge.threshold * 100).toFixed(0)}pp）</h4>
    <p class="note">${esc(edge.noteZh || '')}</p>
    <table class="mc-tbl"><tr><th>集合</th><th>命中</th><th>ROI</th><th>样本</th></tr>
      <tr><td>优势关注·测试</td><td>${edge.test && edge.test.n >= 30 ? edge.test.hit + '%' : '样本不足'}</td><td>${edge.test && edge.test.roi != null ? edge.test.roi + '%' : '—'}</td><td>${edge.test ? edge.test.n : 0}</td></tr>
      <tr><td>同批改选热门</td><td>${edge.favOnEdgeTest && edge.favOnEdgeTest.n >= 30 ? edge.favOnEdgeTest.hit + '%' : '样本不足'}</td><td>${edge.favOnEdgeTest && edge.favOnEdgeTest.roi != null ? edge.favOnEdgeTest.roi + '%' : '—'}</td><td>${edge.favOnEdgeTest ? edge.favOnEdgeTest.n : 0}</td></tr>
      <tr><td>全程热门对照</td><td>${edge.vsFavTest && edge.vsFavTest.n >= 30 ? edge.vsFavTest.hit + '%' : '—'}</td><td>${edge.vsFavTest && edge.vsFavTest.roi != null ? edge.vsFavTest.roi + '%' : '—'}</td><td>${edge.vsFavTest ? edge.vsFavTest.n : 0}</td></tr>
    </table></div>` : '';
  sh.innerHTML = `<div class="sheet mc-sheet"><h3><span>模型体检</span><button class="x" data-act="closeSheet">✕</button></h3>
    <p class="note">历史回测 ${j.n} 场（${esc(j.range[0])} 至 ${esc(j.range[1])}），逐场只用赛前已知信息复算。</p>
    <div class="rl-chart">${bars}</div><div class="rl-key"><span><i class="p"></i>预测信心</span><span><i class="a"></i>实际命中</span></div>
    <table class="mc-tbl"><tr><th>类别</th><th>命中</th><th>样本</th></tr>${cat}</table>
    ${edgeBlock}
    <p class="note">样本少于 30 场的类别不显示百分比。优势关注不等于收益承诺。</p>
    <button type="button" class="btn ghost block" data-act="closeSheet">关闭</button></div>`;
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
  const pc = (r, n) => n >= 30 ? `<b>${r}%</b>` : '<b class="few">样本不足</b>';
  if (u && u.highConfHitRate && u.highConfHitRate.n) {
    bits.push(`<span>${pc(u.highConfHitRate.rate, u.highConfHitRate.n)}高信心命中<small>n=${u.highConfHitRate.n}</small></span>`);
  } else if (u && u.baselineHighConf && u.baselineHighConf.n) {
    bits.push(`<span>${pc(u.baselineHighConf.hitRate, u.baselineHighConf.n)}赔率基线命中<small>n=${u.baselineHighConf.n}</small></span>`);
  }
  if (u && u.alignRate != null && u.sampleN) {
    bits.push(`<span><b>${u.alignRate}%</b>与盘口一致<small>占比</small></span>`);
  }
  if (u && u.conflictHitRate && u.conflictHitRate.n) {
    bits.push(`<span>${pc(u.conflictHitRate.rate, u.conflictHitRate.n)}分歧场命中<small>n=${u.conflictHitRate.n}</small></span>`);
  } else if (u && u.amplifyHitRate && u.amplifyHitRate.n) {
    bits.push(`<span>${pc(u.amplifyHitRate.rate, u.amplifyHitRate.n)}表态命中<small>n=${u.amplifyHitRate.n}</small></span>`);
  }
  if (!bits.length) {
    return `<div class="use-strip"><span class="use-note">可用性指标：样本积累中（完场复盘后写入）</span><button type="button" class="use-mc" data-act="modelCheck">模型体检</button></div>`;
  }
  const note = (u && u.noteZh) ? `<span class="use-note">${esc(u.noteZh)}</span>` : '';
  return `<div class="use-strip">${bits.join('')}<button type="button" class="use-mc" data-act="modelCheck">模型体检</button>${note}</div>`;
}
function pagePredictHub() {
  const ms = S.matches;
  const n = ms ? ms.length : 0;
  const kbMeta = loggedIn() ? '仅本机与账号私有' : '登录后可用';
  return `<div class="pred-hub">
    <div class="pred-hub-hero">
      <div class="pred-hub-hero-ic">${I.chart}</div>
      <h2 class="pred-hub-title">选择预测来源</h2>
      <p class="pred-hub-sub">平台简报与个人知识相互独立，私有预测不写入平台缓存。</p>
    </div>
    <div class="pred-hub-stack">
      <button type="button" class="pred-hub-card pri" data-act="prLane" data-lane="platform">
        <div class="pred-hub-card-hd">
          <span class="pred-hub-ic pri">${I.chart}</span>
          <span class="pred-hub-pill">主入口</span>
        </div>
        <h3>平台预测</h3>
        <p>站内模型与情报简报，按场次查看信心指数与完整分析。</p>
        <div class="pred-hub-foot">
          <span class="pred-hub-stat">${n ? `在售 ${n} 场` : '加载场次…'}</span>
          <span class="pred-hub-go">进入<span class="go-ic">${I.arr}</span></span>
        </div>
      </button>
      <button type="button" class="pred-hub-card sec" data-act="prLane" data-lane="kb">
        <div class="pred-hub-card-hd">
          <span class="pred-hub-ic sec">${I.doc}</span>
          <span class="pred-hub-pill sec">知识库</span>
        </div>
        <h3>我的知识库</h3>
        <p>创建知识包、录入笔记，在单场预测中勾选条目生成个人参考概率。</p>
        <div class="pred-hub-foot">
          <span class="pred-hub-stat">${kbMeta}</span>
          <span class="pred-hub-go">进入<span class="go-ic">${I.arr}</span></span>
        </div>
      </button>
    </div>
    <div class="kb-intro">
      <button type="button" class="kb-entry" data-go="${loggedIn() ? '#/kb' : '#/login'}">
        <span class="pred-hub-ic sec">${I.doc}</span>
        <div class="kb-entry-body">
          <h3>我的知识库</h3>
          <p>登录后管理个人知识包；与平台预测相互独立，不写入平台缓存。</p>
        </div>
        <span class="pred-hub-go">打开<span class="go-ic">${I.arr}</span></span>
      </button>
    </div>
  </div>`;
}
function pagePredict() {
  const ms = S.matches;
  const lane = S.prLane || 'hub';
  let h = lane === 'platform'
    ? `<div class="shell-tools shell-tools--bare"><button type="button" class="shell-link" data-act="prHub">切换</button></div>`
    : '';
  if (!ms) return h + (lane === 'hub' ? pagePredictHub() : skeleton(4));
  if (lane === 'hub') {
    h += pagePredictHub();
    return h + foot();
  }
  const all = ms.map(m => ({ m, pr: effectivePredict(m) })).filter(x => x.pr)
    .sort(prCompare);
  const nSpeak = all.filter(x => isSpeakPr(x.pr)).length;
  const nPending = all.filter(x => isPendingPr(x.pr)).length;
  const nWatch = all.length - nSpeak - nPending;
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
  h += `<div id="prBody" class="pr-body">`;
  h += `<div class="list-meta"><span>点击场次查看完整简报与依据</span><span>${list.length} 场</span></div>`;
  if (!list.length) {
    h += empty('该筛选暂无场次，可切换「全部」或等待情报简报加载。', '<button class="btn ghost sm" data-pf="全部">查看全部</button>', '暂无场次');
  } else {
    // Group by 竞彩 businessDate (Asia/Shanghai match calendar day) so today/tomorrow aren't flat-mixed.
    const byDay = new Map();
    for (const x of list) {
      const d = issueDate(x.m) || x.m.date || '';
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(x);
    }
    const days = [...byDay.keys()].sort();
    for (const d of days) {
      byDay.get(d).sort(prCompare);
    }
    h += days.map(d => {
      const items = byDay.get(d);
      const md = (d && d.length >= 10) ? d.slice(5) : d;
      const lab = `${dayName(d)} ${md}`;
      return `<div class="pr-day"><div class="pr-day-h"><span class="pr-day-lab">${esc(lab)}</span><span>${items.length} 场</span></div>`
        + `<div class="grid">${items.map(({ m, pr }, i) => predCardHtml(m, pr, i, { quiet: true })).join('')}</div></div>`;
    }).join('');
  }
  if (nPending) h += `<p class="note" style="margin:10px 14px 4px">正在加载 ${nPending} 场情报简报…请稍候自动刷新。</p>`;
  h += `</div>`;
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
const DATA_KINDS_TEAM = [['standings', '积分榜'], ['clubvalues', '身价榜']];
const DATA_KINDS_STAR = [['topscorers', '射手榜'], ['topassists', '助攻榜'], ['topkeepers', '门神榜'], ['playervalues', '身价榜']];
function dataSectionOf() {
  return S.dataSection === 'star' ? 'star' : 'team';
}
function dataKindsForSection(sec) {
  return sec === 'star' ? DATA_KINDS_STAR : DATA_KINDS_TEAM;
}
function setDataSection(sec) {
  S.dataSection = sec === 'star' ? 'star' : 'team';
  try { localStorage.setItem('jc_data_section', S.dataSection); } catch { }
  const allowed = dataKindsForSection(S.dataSection).map(([k]) => k);
  if (!allowed.includes(S.dataKind)) setDataKind(allowed[0]);
}
function defaultDataKindForSection(sec) {
  return sec === 'star' ? 'topscorers' : 'standings';
}

function dataLeagueOf() {
  const k = S.dataLeague || 'epl';
  return k;
}
function setDataLeague(k) {
  S.dataLeague = k;
  try { localStorage.setItem('jc_data_lg', k); } catch { }
  if (route().name === 'data') pruneStaleDcSoftRefresh(dcVisibleSliceKey());
}
function dataKindOf() {
  const sec = dataSectionOf();
  const allowed = dataKindsForSection(sec).map(([x]) => x);
  let k = S.dataKind || defaultDataKindForSection(sec);
  if (k === 'clubvalues' && sec === 'star') k = 'playervalues';
  if (!allowed.includes(k)) k = defaultDataKindForSection(sec);
  return k;
}
function setDataKind(k) {
  S.dataKind = k;
  try { localStorage.setItem('jc_data_kind', k); } catch { }
  if (route().name === 'data') pruneStaleDcSoftRefresh(dcVisibleSliceKey());
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
      <thead><tr><th class="rk">#</th><th class="tm">球队</th><th class="dc-st">赛</th><th class="dc-st">胜</th><th class="dc-st">平</th><th class="dc-st">负</th><th class="dc-st gfga">进/失</th><th class="pts">积分</th></tr></thead><tbody>`;
    for (const r of rows) {
      const logoUrl = r.logo || (r.teamId ? ('https://a.espncdn.com/i/teamlogos/soccer/500/' + r.teamId + '.png') : '');
      const crestOpts = r.teamId ? { teamId: r.teamId, eager: Number(r.rank) <= 8 } : null;
      const logo = logoUrl ? badge(r.teamZh || r.team, '', logoUrl, crestOpts) : badge(r.teamZh || r.team);
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
        <td class="num dc-st">${r.played ?? '-'}</td>
        <td class="num dc-st">${r.win ?? '-'}</td>
        <td class="num dc-st">${r.draw ?? '-'}</td>
        <td class="num dc-st">${r.lose ?? '-'}</td>
        <td class="num dc-st gfga">${r.gf ?? '-'}/${r.ga ?? '-'}</td>
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
  if (kind === 'topkeepers') {
    if (payload.preparing || !rows.length) {
      const tip = payload.noteZh || '门神榜（零封 / 扑救）数据接入筹备中，可先查看射手榜与助攻榜。';
      return empty(esc(tip), '', '筹备中');
    }
  }
  if (!rows.length) {
    if (kind === 'topassists') return empty('该联赛暂无助攻榜数据。', '', '暂无榜单');
    if (kind === 'playervalues') return empty('该联赛暂无球员身价数据。', '', '暂无身价榜');
    return empty('该联赛暂无射手榜数据。', '', '暂无榜单');
  }
  const isAst = kind === 'topassists';
  const isMv = kind === 'playervalues';
  const lg = payload.leagueKey || dataLeagueOf();
  let h = `<div class="dc-scorers">`;
  rows.forEach((r, i) => {
    const initial = esc([...(r.playerZh || r.player || '?')][0] || '?');
    const altPhoto = (r.photoAlt && !isAfEspnIdPhotoUrl(r.photoAlt, r.playerId)) ? r.photoAlt : '';
    const lazyAttr = i >= 6 ? ' loading="lazy"' : '';
    const resolvedPid = resolveDcPlayerEspnId(r);
    const tmAttr = (r.tmId != null && String(r.tmId) !== '') ? ` data-tmid="${esc(String(r.tmId))}"` : '';
    const pidAttr = resolvedPid ? ` data-pid="${esc(resolvedPid)}"` : '';
    const phSrc = dcPlayerPhotoSrc(r);
    const photo = phSrc
      ? `<span class="dc-avatar" data-letter="${initial}" data-alt="${esc(altPhoto)}"${pidAttr}${tmAttr}><img alt="" width="88" height="88" decoding="async"${lazyAttr} src="${esc(phSrc)}" onerror="dcAvatarImgError(this)"></span>`
      : `<span class="dc-avatar letter"${pidAttr}${tmAttr} data-letter="${initial}">${initial}</span>`;
    const teamCrestOpts = r.teamId ? { teamId: r.teamId, eager: i < 8 } : null;
    const teamLogo = r.teamLogo ? badge(r.teamZh || r.team, 'sm', r.teamLogo, teamCrestOpts) : badge(r.teamZh || r.team, 'sm');
    const primary = isMv
      ? (r.labelZh || r.text || '暂无')
      : (isAst ? (r.assists ?? 0) : (r.goals ?? 0));
    const secondary = isMv
      ? (r.teamZh || r.team || '')
      : (isAst
        ? `进球 ${r.goals ?? 0}`
        : (r.assists != null ? `助攻 ${r.assists}` : ''));
    const href = r.playerId ? `#/aplayer/${encodeURIComponent(r.playerId)}?league=${encodeURIComponent(lg)}` : '';
    const teamHref = r.teamId ? `#/team/${encodeURIComponent(r.teamId)}?league=${encodeURIComponent(lg)}` : '';
    h += `<div class="dc-scorer${href ? ' dc-row-link' : ''}"${href ? ` data-go="${esc(href)}" role="link" tabindex="0"` : ''}>
      <span class="dc-rank num">${r.rank || (i + 1)}</span>
      ${photo}
      <div class="dc-sc-info">
        <div class="nm">${esc(r.playerZh || r.player)}${yiMark(r.playerZhAuto)}</div>
        <div class="sub"${teamHref ? ` data-go="${esc(teamHref)}"` : ''}>${teamLogo}<span>${esc(r.teamZh || r.team || '')}</span></div>
      </div>
      <div class="dc-sc-stat"><b class="${isMv ? 'dc-mv-amt' : 'num'}">${isMv ? esc(primary) : primary}</b><small>${isMv ? '身价' : (isAst ? '助攻' : '进球')}</small>${secondary && !isMv ? `<span class="sec">${esc(secondary)}</span>` : ''}</div>
    </div>`;
  });
  h += `</div>`;
  return h;
}

function renderClubValuesTable(payload) {
  const rows = payload.rows || [];
  if (!rows.length) {
    return empty('该联赛暂无身价榜数据。', '', '暂无身价榜');
  }
  const lg = payload.leagueKey || dataLeagueOf();
  let h = `<div class="dc-table-wrap"><table class="dc-table dc-mv">
    <thead><tr><th class="rk">#</th><th class="tm">球队</th><th class="mv">总身价</th><th class="sq">人数</th></tr></thead><tbody>`;
  for (const r of rows) {
    const logoUrl = r.logo || (r.teamId ? ('https://a.espncdn.com/i/teamlogos/soccer/500/' + r.teamId + '.png') : '');
    const crestOpts = r.teamId ? { teamId: r.teamId, eager: Number(r.rank) <= 8 } : null;
    const logo = logoUrl ? badge(r.teamZh || r.team, '', logoUrl, crestOpts) : badge(r.teamZh || r.team);
    const href = r.teamId ? `#/team/${encodeURIComponent(r.teamId)}?league=${encodeURIComponent(lg)}` : '';
    const rowCls = (href ? 'dc-row-link' : '') + (r.ok === false ? ' dc-mv-miss' : '');
    const goAttr = href ? ` data-go="${esc(href)}" role="link" tabindex="0"` : '';
    const val = r.ok === false
      ? `<span class="dc-mv-empty">暂无</span>`
      : `<b class="dc-mv-val">${esc(r.labelZh || r.text || '')}</b>`;
    const tip = [r.teamZh || r.team, r.ok === false ? '暂无身价' : (r.text || ''), r.standingsRank != null ? ('积分榜第' + r.standingsRank) : ''].filter(Boolean).join(' · ');
    h += `<tr class="${rowCls.trim()}"${goAttr} title="${esc(tip)}">
      <td class="rk num">${r.rank ?? ''}</td>
      <td class="tm"><div class="tm-in">${logo}<span class="tn">${esc(r.teamZh || r.team)}</span></div></td>
      <td class="mv num">${val}</td>
      <td class="sq num">${r.squadSize != null ? r.squadSize : '-'}</td>
    </tr>`;
  }
  h += `</tbody></table></div>`;
  const asOf = payload.asOf ? `参考市值约至 ${esc(payload.asOf)}` : '参考市值';
  h += `<div class="dc-legend" aria-label="身价说明"><span class="dc-leg-note">${asOf} · 按球队阵容总身价排序 · 点球队进详情看球星身价排名</span></div>`;
  return h;
}

function pageData() {
  const lg = dataLeagueOf();
  const kind = dataKindOf();
  const kinds = dataKindsForSection(dataSectionOf());
  const leagues = (S.dataLeagues && S.dataLeagues.length) ? S.dataLeagues : DATA_LEAGUES_FALLBACK;
  let h = `<div class="chips dc-leagues" id="dcLeagues">${leagues.map(l =>
    `<button type="button" class="${lg === l.key ? 'on' : ''}" data-act="dataLeague" data-lg="${esc(l.key)}">${esc(l.nameZh)}</button>`
  ).join('')}</div>`;
  h += `<div class="dtabs dc-kinds">${kinds.map(([k, lab]) =>
    `<button type="button" class="${kind === k ? 'on' : ''}" data-act="dataKind" data-kind="${k}">${lab}</button>`
  ).join('')}</div>`;

  const cacheKey = lg + ':' + kind;
  const cached = primeDataSliceFromBoot(lg, kind);
  if (!dataCacheRenderable(cached, kind)) {
    const snapBody = dataTabSnapBodyHtml(lg, kind);
    if (snapBody) {
      h += `<div class="dc-body" id="dcBody">${snapBody}</div>`;
      h += foot();
      scheduleDataCenterRefresh(lg, kind, { urgent: false });
      warmDataCenterPrefetch(lg, kind);
      return h;
    }
    h += `<div class="dc-body" id="dcBody">${skeleton(3)}</div>`;
    h += foot();
    loadDataCenterBootPack().then(() => {
      tryMergeBootPackSlice(lg, kind);
      if (dataCacheRenderable(ensureDataCacheSlice(cacheKey), kind)) softPatchDataBody(lg, kind);
    });
    scheduleDataCenterRefresh(lg, kind, { urgent: true });
    setTimeout(() => scheduleDcBodyWatchdog(lg, kind), 0);
    return h;
  }
  if (cached.ok === false) {
    const tip = cached.noteZh ? `<p class="note dc-note">${esc(cached.noteZh)}</p>` : '';
    h += `<div class="dc-body" id="dcBody">${empty(cached.error || '加载失败，请稍后重试。', '<button class="btn ghost sm" data-act="dataRefresh">重新加载</button>', '暂时不可用')}${tip}</div>` + foot();
    return h;
  }
  const srcLab = cached.source === 'espn' ? '日更/赛后刷新'
    : (cached.source === 'market-value' ? '参考市值'
      : (cached.source === 'api-football' ? (cached.pastSeason ? '历史赛季' : '第三方') : ''));
  const upd = formatUpdatedAt(cached.updatedAt || cached.fetchedAt);
  const countLab = kind === 'clubvalues'
    ? (cached.rows ? cached.rows.length + ' 队' : '')
    : (kind === 'standings'
      ? (cached.tables && cached.tables[0] ? cached.tables[0].rows.length + ' 队' : '')
      : (cached.rows ? cached.rows.length + ' 人' : ''));
  const right = [upd || (cached.refreshing ? '后台更新中' : (cached.stale ? '缓存' : (cached.cached ? '已缓存' : '刚更新'))), countLab].filter(Boolean).join(' · ');
  const meta = `<div class="list-meta dc-meta"><span>${esc(cached.leagueZh || '')} · ${esc(cached.seasonLabel || '')} 赛季${srcLab ? ' · ' + esc(srcLab) : ''}</span><span>${esc(right)}</span></div>`;
  const pastWarn = cached.pastSeason ? `<div class="warn-bar">⚠️ 正在查看历史赛季 ${esc(cached.seasonLabel || '')}，俱乐部归属以该赛季为准，非当前效力球队。</div>` : '';
  let body = meta + (pastWarn || "");
  if (kind === 'standings') body += renderStandingsTable(cached);
  else if (kind === 'clubvalues') body += renderClubValuesTable(cached);
  else body += renderScorersList(cached, kind);
  if (cached.noteZh) body += `<p class="note dc-note">${esc(cached.noteZh)}</p>`;
  h += `<div class="dc-body" id="dcBody">${body}</div>`;
  scheduleDataCenterRefresh(lg, kind, { urgent: false });
  warmDataCenterPrefetch(lg, kind);
  return h + foot();
}

async function loadDataCenter(lg, kind, { soft, signal } = {}) {
  const key = lg + ':' + kind;
  S.dataCache = S.dataCache || {};
  const hadRenderable = dataCacheRenderable(S.dataCache[key], kind);
  if (signal && signal.aborted) return;
  // api() already prefixes '/api' — do NOT pass '/api/standings' or it becomes /api/api/...
  const path = kind === 'standings' ? '/standings'
    : kind === 'topassists' ? '/topassists'
    : kind === 'clubvalues' ? '/club-values'
    : kind === 'playervalues' ? '/player-values'
    : kind === 'topkeepers' ? '/topkeepers'
    : '/topscorers';
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
    let j = await api(path + '?league=' + encodeURIComponent(lg), { timeout: 20000, signal });
    if (signal && signal.aborted) return;
    if (!j || j.ok === false) {
      if (!(soft && hadRenderable)) {
        S.dataCache[key] = { ok: false, error: (j && (j.error || j.detail || j.reason)) || '加载失败' };
      }
    } else {
      j._fresh = true;
      if (soft && hadRenderable && S.dataCache[key]) {
        j.refreshing = false;
        if (!j.updatedAt && S.dataCache[key].updatedAt) j.updatedAt = S.dataCache[key].updatedAt;
      }
      if (kind === 'standings' && S.dataCache[key]) {
        j = mergeStandingsPreferTeamIds(S.dataCache[key], j);
      }
      if (S.dataCache[key] && (kind === 'topscorers' || kind === 'topassists' || kind === 'playervalues' || kind === 'topkeepers')) {
        j = mergeDcRowsPreferIdentity(S.dataCache[key], j);
      }
      S.dataCache[key] = j;
      persistDataCacheSlice(key, j);
      // 1.9.112: warm team/player detail when browsing 资料 / 身价榜
      setTimeout(() => prefetchDetailWarm(lg, j, kind), 0);
    }
  } catch (e) {
    if (signal && signal.aborted) return;
    const msg = (e && e.message) ? String(e.message) : '';
    const isNet = !msg || /网络|超时|Failed to fetch|NetworkError|abort/i.test(msg);
    const errText = isNet
      ? (msg && !/^请求失败/.test(msg) ? msg : '网络异常，请检查连接后重试')
      : msg;
    if (soft && hadRenderable && S.dataCache[key]) {
      const cur = S.dataCache[key];
      if (cur.refreshing) { cur.refreshing = false; S.dataCache[key] = cur; }
    } else if (!S.dataCache[key] || S.dataCache[key].ok === false) {
      S.dataCache[key] = { ok: false, error: errText || '网络异常，请检查连接后重试' };
    }
  }
  if (route().name === 'data' && dataLeagueOf() === lg && dataKindOf() === kind) {
    if (!softPatchDataBody(lg, kind)) render({ force: true });
  }
  // 1.9.199/200: standings refresh rebuilds tribe when catalog empty OR missing leagues/crests.
  if (kind === 'standings' && (route().name === 'tribe' || route().name === 'tribe-club')) {
    try {
      const ready = dataCacheTribeReady(S.dataCache && S.dataCache[key]);
      if (ready && tribeCatalogNeedsRebuildFromCache()) {
        rebuildTribeCatalogFromCache({ renderIfTribe: true });
      }
    } catch (_) {}
  }
}

/** 1.9.124: update #dcBody (+ chips) in place — avoid full view wipe on data load / kind switch */
function dataBodyInnerHtml(cached, kind) {
  if (!cached) return skeleton(3);
  if (cached.ok === false) {
    const tip = cached.noteZh ? `<p class="note dc-note">${esc(cached.noteZh)}</p>` : '';
    return `${empty(cached.error || '加载失败，请稍后重试。', '<button class="btn ghost sm" data-act="dataRefresh">重新加载</button>', '暂时不可用')}${tip}`;
  }
  const srcLab = cached.source === 'espn' ? '日更/赛后刷新'
    : (cached.source === 'market-value' ? '参考市值'
      : (cached.source === 'api-football' ? (cached.pastSeason ? '历史赛季' : '第三方') : ''));
  const upd = formatUpdatedAt(cached.updatedAt || cached.fetchedAt);
  const countLab = kind === 'clubvalues'
    ? (cached.rows ? cached.rows.length + ' 队' : '')
    : (kind === 'standings'
      ? (cached.tables && cached.tables[0] ? cached.tables[0].rows.length + ' 队' : '')
      : (cached.rows ? cached.rows.length + ' 人' : ''));
  const right = [upd || (cached.refreshing ? '后台更新中' : (cached.stale ? '缓存' : (cached.cached ? '已缓存' : '刚更新'))), countLab].filter(Boolean).join(' · ');
  const meta = `<div class="list-meta dc-meta"><span>${esc(cached.leagueZh || '')} · ${esc(cached.seasonLabel || '')} 赛季${srcLab ? ' · ' + esc(srcLab) : ''}</span><span>${esc(right)}</span></div>`;
  const pastWarn = cached.pastSeason ? `<div class="warn-bar">⚠️ 正在查看历史赛季 ${esc(cached.seasonLabel || '')}，俱乐部归属以该赛季为准，非当前效力球队。</div>` : '';
  let body = meta + (pastWarn || '');
  if (kind === 'standings') body += renderStandingsTable(cached);
  else if (kind === 'clubvalues') body += renderClubValuesTable(cached);
  else body += renderScorersList(cached, kind);
  if (cached.noteZh) body += `<p class="note dc-note">${esc(cached.noteZh)}</p>`;
  return body;
}
function softPatchDataBody(lg, kind) {
  try {
    if (route().name !== 'data') return false;
    if (dataLeagueOf() !== lg || dataKindOf() !== kind) return false;
    const box = document.getElementById('dcBody');
    if (!box) return false;
    document.querySelectorAll('.dc-leagues [data-act="dataLeague"], #dcLeagues [data-act="dataLeague"]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-lg') === lg);
    });
    document.querySelectorAll('.dc-kinds [data-act="dataKind"]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-kind') === kind);
    });
    const cached = ensureDataCacheSlice(lg + ':' + kind);
    box.innerHTML = dataBodyInnerHtml(cached, kind);
    try { render.lastSig = tabContentSig('data'); } catch (_) {}
    const v = document.getElementById('view');
    saveTabKeep('data', v);
    persistDataTabSnap(v);
    prefetchDcImages(box);
    return true;
  } catch (_) { return false; }
}

function dash(v) { return (v == null || v === '') ? '暂无' : esc(String(v)); }

// 1.9.112: client detail cache — paint from LS, refresh in background
const DETAIL_LS_TTL_MS = 6 * 3600e3;
function detailLsKey(kind, id, lg) { return 'jc_' + kind + '_' + String(id) + '_' + String(lg || 'x'); }
function readDetailLs(kind, id, lg) {
  const row = LS.get(detailLsKey(kind, id, lg), null);
  if (!row || !row.data || !row.data.ok) return null;
  if (row.at && Date.now() - row.at > DETAIL_LS_TTL_MS * 4) return null;
  return row;
}
function writeDetailLs(kind, id, lg, data) {
  if (!data || data.ok === false) return;
  // 1.9.116: never persist wiped 身价 (coverage>0 but all 暂无)
  if (kind === 'td' && squadMvCorrupt(data)) return;
  LS.set(detailLsKey(kind, id, lg), { at: Date.now(), data });
}
/** Server coverage says matches exist but no marketValueEur on cards — do not paint/cache. */
function squadMvCorrupt(t) {
  if (!t || !Array.isArray(t.squad) || !t.squad.length) return false;
  const hit = t.squadMarketCoverage && Number(t.squadMarketCoverage.hit);
  if (!(hit > 0)) return false;
  const withMv = t.squad.filter(p => Number(p && p.marketValueEur) > 0).length;
  return withMv === 0;
}
function prefetchDetailWarm(lg, payload, kind) {
  try {
    if (kind === 'playervalues' || kind === 'clubvalues') return;
    const teams = [];
    const players = [];
    if (kind === 'standings' || kind === 'clubvalues') {
      const rows = kind === 'clubvalues'
        ? (payload.rows || [])
        : (((payload.tables || [])[0] || {}).rows || []);
      for (const r of rows.slice(0, 10)) {
        if (r && r.teamId) teams.push(r.teamId);
      }
    } else if (kind === 'topscorers' || kind === 'topassists' || kind === 'playervalues') {
      for (const r of (payload.rows || []).slice(0, 8)) {
        if (r && r.playerId) players.push(r.playerId);
        if (r && r.teamId && teams.length < 6) teams.push(r.teamId);
      }
    }
    if (!teams.length && !players.length) return;
    // fire-and-forget; also seed LS when responses arrive via warm endpoint is server-only —
    // additionally hit a couple of team endpoints so client LS is warm for instant open
    fetch(API + '/api/detail-warm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ league: lg, teams, players }),
    }).catch(() => {});
    const seed = teams.slice(0, 3);
    seed.forEach((tid, i) => {
      setTimeout(() => {
        api('/team?id=' + encodeURIComponent(tid) + '&league=' + encodeURIComponent(lg || '') + '&enrich=1', { timeout: 30000 })
          .then((t) => { if (t && t.ok) writeDetailLs('td', tid, lg, t); })
          .catch(() => {});
      }, 400 + i * 350);
    });
  } catch { /* ignore */ }
}

function pageTeam(id) {
  const lg = (route().query && route().query.league) || dataLeagueOf() || 'epl';
  let h = hdr('球队详情');
  const cached = readDetailLs('td', id, lg);
  h += `<div id="team-box" class="det-box">${cached && cached.data ? '' : skeleton(2)}</div>`;
  setTimeout(() => {
    const usable = cached && cached.data && !squadMvCorrupt(cached.data);
    if (usable) {
      try { paintTeamDetail(cached.data, id, lg, { fromCache: true }); } catch { /* fall through */ }
    } else if (cached && cached.data && squadMvCorrupt(cached.data)) {
      try { LS.del(detailLsKey('td', id, lg)); } catch { /* ignore */ }
    }
    fillTeam(id, lg, { soft: !!usable });
  }, 0);
  return h;
}
/** 1.9.115: 澳客-like short labels for fixture cards (display only; cache keeps full homeZh). */
const FX_TEAM_SHORT = {
  '巴黎圣日耳曼': '巴黎圣曼', '巴黎圣曼': '巴黎圣曼',
  '拜仁慕尼黑': '拜仁', '曼彻斯特联': '曼联', '曼彻斯特城': '曼城',
  '托特纳姆热刺': '热刺', '托特纳姆': '热刺',
  '国际米兰': '国米', '国际米兰尼': '国米',
  '马德里竞技': '马竞', '马德里竞技队': '马竞', '马德里竞技俱乐部': '马竞',
  '莱比锡红牛': '莱比锡', '门兴格拉德巴赫': '门兴',
  '布伦特福德': '布伦特', '纽卡斯尔联': '纽卡斯尔',
  '布莱顿霍夫阿尔比恩': '布莱顿', '布莱顿和霍夫阿尔比恩': '布莱顿',
  '沃尔弗汉普顿流浪': '狼队', '沃尔弗汉普顿': '狼队',
  '谢菲尔德联': '谢菲联', '西布罗姆维奇': '西布朗',
  '斯特拉斯堡': '斯特拉斯', '奥林匹亚科斯': '奥林匹亚',
  'AEK雅典': '雅典AEK', '雅典AEK': '雅典AEK',
  '阿斯顿维拉': '维拉', '皇家马德里': '皇马', '巴塞罗那': '巴萨',
  '云达不莱梅': '不莱梅', '拜仁慕尼黑足球俱乐部': '拜仁',
  '顿涅茨克矿工': '矿工', '布拉格斯拉维亚': '斯拉维亚',
  '布拉迪斯拉发斯拉万人': '斯拉万人', '葡萄牙体育': '体育',
  '勒沃库森': '勒沃库森', '法兰克福': '法兰克福',
  '伊普斯维奇': '伊普斯', '伊普斯维奇镇': '伊普斯',
};
function fxTeamShort(zh) {
  const n = String(zh || '').trim();
  if (!n) return '';
  if (FX_TEAM_SHORT[n]) return FX_TEAM_SHORT[n];
  // already short enough for single-line card
  if ([...n].length <= 5) return n;
  return n;
}
/** Asia/Shanghai Y-M-D + weekday + HH:mm — UTC+8 math (no Intl locale; avoids `/2/26 undefined`). */
function bjYmdHm(d) {
  const ms = d.getTime() + 8 * 3600e3;
  const x = new Date(ms);
  const y = x.getUTCFullYear();
  const mo = String(x.getUTCMonth() + 1).padStart(2, '0');
  const da = String(x.getUTCDate()).padStart(2, '0');
  const hh = String(x.getUTCHours()).padStart(2, '0');
  const mi = String(x.getUTCMinutes()).padStart(2, '0');
  const wi = new Date(`${y}-${mo}-${da}T12:00:00+08:00`).getDay();
  const wd = Number.isInteger(wi) ? (WEEK[wi] || '') : '';
  return { ymd: `${y}-${mo}-${da}`, mo, da, hm: `${hh}:${mi}`, wd };
}
/** Kickoff label in Asia/Shanghai: MM/DD 周X HH:mm */
function fxDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const s = String(iso);
    const day = s.slice(0, 10);
    const tm = /T\d{2}:\d{2}/.test(s) ? s.slice(11, 16) : '';
    const mmdd = day.length >= 10 && day[4] === '-' ? `${day.slice(5, 7)}/${day.slice(8, 10)}` : day;
    return tm ? `${mmdd} ${tm}` : mmdd;
  }
  const { mo, da, hm, wd } = bjYmdHm(d);
  return `${mo}/${da}${wd ? ' ' + wd : ''} ${hm}`;
}
function fxNameLooseEq(a, b) {
  const na = String(a || '').replace(/\s+/g, '').toLowerCase();
  const nb = String(b || '').replace(/\s+/g, '').toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = String(fxTeamShort(a) || '').replace(/\s+/g, '').toLowerCase();
  const sb = String(fxTeamShort(b) || '').replace(/\s+/g, '').toLowerCase();
  if (sa && sb && sa === sb) return true;
  return na.includes(nb) || nb.includes(na);
}
/** Match team-detail fixture against in-memory 竞彩 pools (schedule/matches/results). */
function matchFxAgainstPools(fx) {
  let day = '';
  if (fx && fx.date) {
    const d = new Date(fx.date);
    if (!Number.isNaN(d.getTime())) day = bjYmdHm(d).ymd;
    else day = String(fx.date).slice(0, 10);
  }
  const homes = [fx.homeZh, fx.home, fxTeamShort(fx.homeZh || fx.home)].filter(Boolean);
  const aways = [fx.awayZh, fx.away, fxTeamShort(fx.awayZh || fx.away)].filter(Boolean);
  const pools = [...(S.schedule || []), ...(S.matches || []), ...(S.results || [])];
  for (const m of pools) {
    if (!m || m.id == null) continue;
    if (day && m.date && String(m.date).slice(0, 10) !== day) continue;
    const okH = homes.some(h => fxNameLooseEq(h, m.home));
    const okA = aways.some(a => fxNameLooseEq(a, m.away));
    if (okH && okA) return m;
  }
  return null;
}
/** Stash a thin AF/ESPN shell so #/match/af:… can open 赛事详情 with scoreboard + empty-ish tabs. */
function stashFxShell(fx, id) {
  if (!fx || !id) return;
  S.fxShells = S.fxShells || {};
  let date = '', time = '';
  if (fx.date) {
    const d = new Date(fx.date);
    if (!Number.isNaN(d.getTime())) {
      const p = bjYmdHm(d);
      date = p.ymd; time = p.hm;
    } else {
      date = String(fx.date).slice(0, 10);
      time = /T\d{2}:\d{2}/.test(String(fx.date)) ? String(fx.date).slice(11, 16) : '';
    }
  }
  const gh = fx.goalsHome, ga = fx.goalsAway;
  const full = (gh != null && ga != null) ? `${gh}:${ga}` : '';
  const st = String(fx.status || '');
  const finished = /^(FT|AET|PEN)$/i.test(st) || !!full;
  const shell = {
    id: String(id),
    home: fx.homeZh || fx.home || '',
    away: fx.awayZh || fx.away || '',
    homeEn: fx.home || '',
    awayEn: fx.away || '',
    date, time,
    league: forceLeagueZh(fx.leagueZh || fx.league || fx.fallbackLeagueZh || '') || fx.leagueZh || fx.league || '',
    full: full || null,
    score: full || null,
    fixtureId: fx.fixtureId != null ? fx.fixtureId : null,
    homeLogo: fx.homeLogo || '',
    awayLogo: fx.awayLogo || '',
    status: finished ? '完场' : (fx.upcoming || /NS|TBD|NSY/i.test(st) ? '未开赛' : (st || '未开赛')),
    num: '',
    afShell: true,
    sample: false,
  };
  S.fxShells[String(id)] = shell;
  try { sessionStorage.setItem('jc_fx_shell_' + String(id), JSON.stringify(shell)); } catch (_) {}
}
function loadFxShell(id) {
  const sid = String(id || '');
  if (!sid) return null;
  if (S.fxShells && S.fxShells[sid]) return S.fxShells[sid];
  try {
    const raw = sessionStorage.getItem('jc_fx_shell_' + sid);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    S.fxShells = S.fxShells || {};
    S.fxShells[sid] = o;
    return o;
  } catch (_) { return null; }
}
/** Resolve #/match/… href for a team 赛程 card (prefer 竞彩 id, else AF/ESPN shell). */
function resolveFxMatchHref(fx) {
  if (!fx) return '';
  const direct = String(fx.matchId || fx.sportteryMatchId || '').trim();
  // Numeric 竞彩 id, or af:/espn: shell id already on the fixture (fixture-map)
  if (direct && (/^\d+$/.test(direct) || /^(af|espn):/i.test(direct))) {
    if (/^(af|espn):/i.test(direct)) stashFxShell(fx, direct);
    return `#/match/${encodeURIComponent(direct)}`;
  }
  const hit = matchFxAgainstPools(fx);
  if (hit && hit.id != null) return `#/match/${encodeURIComponent(hit.id)}`;
  const fid = fx.fixtureId != null ? String(fx.fixtureId).trim() : '';
  if (fid && /^\d+$/.test(fid)) {
    // ESPN event ids are typically 9 digits (40xxxxxxx); AF fixtures ~7 digits — still open a shell either way
    const shellId = fx.source === 'espn' ? `espn:${fid}` : `af:${fid}`;
    stashFxShell(fx, shellId);
    return `#/match/${encodeURIComponent(shellId)}`;
  }
  if (fx.date && (fx.home || fx.homeZh) && (fx.away || fx.awayZh)) {
    const d = new Date(fx.date);
    const day = !Number.isNaN(d.getTime()) ? bjYmdHm(d).ymd : String(fx.date).slice(0, 10);
    const shellId = `fx:${day}:${fx.homeZh || fx.home}:${fx.awayZh || fx.away}`;
    stashFxShell(fx, shellId);
    return `#/match/${encodeURIComponent(shellId)}`;
  }
  return '';
}
function fxRowHtml(fx) {
  const score = (fx.goalsHome != null && fx.goalsAway != null)
    ? `<b class="num">${fx.goalsHome}-${fx.goalsAway}</b>`
    : '<span class="note">未开赛</span>';
  const dateLab = fxDateLabel(fx.date);
  const homeFull = fx.homeZh || fx.home || '';
  const awayFull = fx.awayZh || fx.away || '';
  const resultChip = (() => {
    let r = String(fx.result || '').toUpperCase();
    if (!r && fx.goalsHome != null && fx.goalsAway != null) {
      const gh = Number(fx.goalsHome), ga = Number(fx.goalsAway);
      if (Number.isFinite(gh) && Number.isFinite(ga)) {
        const me = String(fx._perspectiveZh || fx._perspective || '').trim();
        if (me) {
          const isHome = me === String(homeFull).trim() || me === String(fx.home || '').trim();
          const isAway = me === String(awayFull).trim() || me === String(fx.away || '').trim();
          if (gh === ga) r = 'D';
          else if (isHome) r = gh > ga ? 'W' : 'L';
          else if (isAway) r = ga > gh ? 'W' : 'L';
        }
      }
    }
    if (r === 'W') return '<span class="fx-res w">胜</span>';
    if (r === 'D') return '<span class="fx-res d">平</span>';
    if (r === 'L') return '<span class="fx-res l">负</span>';
    return '';
  })();
  const homeName = esc(fxTeamShort(homeFull));
  const awayName = esc(fxTeamShort(awayFull));
  // 1.9.113: never show raw EN league when FORCE/leagueZh map exists
  let lgLabel = forceLeagueZh(fx.leagueZh || fx.league || fx.fallbackLeagueZh || '');
  const roundBit = fx.roundZh
    || (fx.round != null && String(fx.round).trim() !== ''
      ? (/轮/.test(String(fx.round)) ? String(fx.round) : `第${fx.round}轮`)
      : '');
  if (roundBit) lgLabel = (lgLabel ? lgLabel + ' ' : '') + roundBit;
  // 1.9.118: tappable → 赛事详情 (reuse #/match/…)
  const href = resolveFxMatchHref(fx);
  const tag = href ? 'button' : 'div';
  const attrs = href ? ` type="button" class="det-fx det-fx-go" data-go="${esc(href)}"` : ' class="det-fx"';
  // 澳客: home [短名][crest] | score | [crest][短名] away — crests bracket the score
  return `<${tag}${attrs}>
    <div class="fx-meta"><span class="fx-date">${esc(dateLab)}</span><span class="fx-league">${esc(lgLabel)}</span>${resultChip}</div>
    <div class="fx-teams">
      <div class="fx-side home"><span class="fx-name" title="${esc(homeFull)}">${homeName}</span>${badge(homeFull, 'sm', fx.homeLogo)}</div>
      <div class="fx-mid">${score}</div>
      <div class="fx-side away">${badge(awayFull, 'sm', fx.awayLogo)}<span class="fx-name" title="${esc(awayFull)}">${awayName}</span></div>
    </div>
  </${tag}>`;
}
function paintTeamDetail(t, id, lg, { fromCache } = {}) {
  const box = document.getElementById('team-box');
  if (!box || !t || t.ok === false) return;
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
  const past = (t.recent || []).filter(x => !x.upcoming);
  const future = (t.upcoming || []).length ? t.upcoming : (t.recent || []).filter(x => x.upcoming);
  let scheduleHtml = '';
  if (future.length || past.length) {
    scheduleHtml = `<div class="dsec team-fx-sec">`;
    if (future.length) {
      scheduleHtml += `<h3>未来赛程 <small class="note">${future.length} 场</small></h3><div class="det-recent">`
        + future.map(fx => fxRowHtml({ ...fx, fallbackLeagueZh: t.leagueZh || '', _perspectiveZh: t.teamZh || t.team || '' })).join('') + `</div>`;
    }
    if (past.length) {
      scheduleHtml += `<h3>过去比赛 <small class="note">${past.length} 场</small></h3><div class="det-recent">`
        + past.map(fx => fxRowHtml({ ...fx, fallbackLeagueZh: t.leagueZh || '', _perspectiveZh: t.teamZh || t.team || '' })).join('') + `</div>`;
    }
    scheduleHtml += `</div>`;
  } else if (t.formDots || t.form) {
    scheduleHtml = `<div class="dsec"><h3>近期战绩</h3><div class="det-form-lg">${formDots(t.formDots || t.form) || '<span class="note">暂无</span>'}</div>
      <p class="note">近场胜/平/负，来自积分榜缓存。</p></div>`;
  } else {
    scheduleHtml = `<div class="dsec"><h3>赛程</h3><p class="note">暂无赛程与近期比赛数据。</p></div>`;
  }

  const region = [t.country, t.venueCity].filter(Boolean).join(' · ') || '暂无';
  const introBody = (t.introZh || '').trim()
    ? `<div class="team-intro">${esc(t.introZh).replace(/\n/g, '<br>')}</div>`
    : `<p class="note">暂无球队介绍。</p>`;
  const introHtml = `<div class="dsec team-intro-sec">
    <h3>基本信息</h3>
    <dl class="kv">
      <dt>联赛</dt><dd>${dash(t.leagueZh)}</dd>
      <dt>成立时间</dt><dd>${t.founded ? esc(String(t.founded)) + '年' : '暂无'}</dd>
      <dt>所在地区</dt><dd>${esc(region)}</dd>
      <dt>主队主场</dt><dd>${t.venue ? esc(t.venue) + (t.venueCity ? ' · ' + esc(t.venueCity) : '') : '暂无'}</dd>
      <dt>阵容身价</dt><dd>${(t.marketValue && t.marketValue.text) ? esc(t.marketValue.text) : '暂无身价'}${(t.marketValue && t.marketValue.asOf) ? '<span class="note"> · 约 ' + esc(t.marketValue.asOf) + '</span>' : ''}</dd>
    </dl>
    <h3>球队介绍</h3>
    ${introBody}
  </div>`;

  let squadHtml = '';
  if (t.squad && t.squad.length) {
    const ranked = t.squad.slice().sort((a, b) => {
      const ae = Number(a && a.marketValueEur), be = Number(b && b.marketValueEur);
      const aOk = Number.isFinite(ae) && ae > 0, bOk = Number.isFinite(be) && be > 0;
      if (aOk && bOk) return be - ae;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return String((a && (a.playerZh || a.player)) || '').localeCompare(String((b && (b.playerZh || b.player)) || ''), 'zh');
    });
    const withMv = ranked.filter(p => Number(p.marketValueEur) > 0).length;
    const cov = (t.squadMarketCoverage && t.squadMarketCoverage.noteZh)
      || (t.squad.length ? (`身价匹配 ${withMv}/${t.squad.length}（${Math.round(100 * withMv / t.squad.length)}%）`) : '');
    squadHtml = `<div class="dsec"><h3>身价排名 <small class="note">${t.squad.length} 人${cov ? ' · ' + esc(cov) : ''}</small></h3>
      <div class="det-mv-list">`;
    ranked.forEach((p, i) => {
      const rk = p.marketValueRank || (i + 1);
      const ph = p.photo
        ? `<img class="sq-ph" alt="" src="${esc(logoProxy(p.photo))}" onerror="this.outerHTML='<span class=sq-ph letter>${esc([...(p.playerZh || p.player || '?')][0] || '?')}</span>'"/>`
        : `<span class="sq-ph letter">${esc([...(p.playerZh || p.player || '?')][0] || '?')}</span>`;
      const go = p.playerId ? ` data-go="#/aplayer/${encodeURIComponent(p.playerId)}?league=${encodeURIComponent(lg)}"` : '';
      const mvOk = Number(p.marketValueEur) > 0;
      const mvLab = mvOk ? esc(p.marketValueZh || p.marketValueText || '') : '暂无';
      const subBits = [p.number ? '#' + p.number : '', p.positionZh || p.position || ''].filter(Boolean).join(' · ');
      squadHtml += `<button type="button" class="sq-card sq-mv${mvOk ? '' : ' dim'}"${go}>
        <span class="sq-rk num">${rk}</span>${ph}
        <div class="sq-mv-info"><div class="nm">${esc(p.playerZh || p.player)}${yiMark(p.playerZhAuto)}</div>
          <div class="sub">${esc(subBits)}</div></div>
        <div class="sq-mv-stat"><b class="num">${mvLab}</b>${mvOk ? '<small>身价</small>' : '<small>暂无身价</small>'}</div>
      </button>`;
    });
    squadHtml += `</div><p class="note" style="margin:8px 0 0">按参考市值排序，暂无匹配的排在末尾。</p></div>`;
  } else {
    squadHtml = `<div class="dsec"><h3>阵容</h3>
      <p class="note">阵容需额外请求，点击下方加载（有日配额，结果会缓存）。</p>
      <button type="button" class="btn ghost sm" data-act="teamSquad" data-id="${esc(String(id))}" data-lg="${esc(lg)}">加载阵容</button>
    </div>`;
  }

  const z = zoneForRank(lg, t.rank);
  let zoneBanner = '';
  if (t.rank != null) {
    const bits = [`目前第${t.rank}`];
    if (z) bits.push(z.label);
    if (t.points != null) bits.push(`${t.points}分`);
    // Use in-memory standings cache only — never block first paint on another /standings round-trip
    try {
      const st = (S.dataCache && S.dataCache[(lg || '') + ':standings']) || null;
      const rows = ((st && st.tables && st.tables[0] && st.tables[0].rows) || []);
      const tip = standingGapHint(rows, { rank: t.rank, points: t.points }, lg);
      if (tip) bits.push(tip);
    } catch { /* optional */ }
    zoneBanner = `<div class="det-zone ${z ? esc(z.cls) : ''}" id="team-zone-banner">${esc(bits.join(' · '))}</div>`;
  }

  const tab = (typeof S.teamTab === 'string' && S.teamTab) || 'schedule';
  const cacheNote = fromCache ? '<span class="note"> · 本地缓存，后台更新中</span>' : (t.stale ? '<span class="note"> · 缓存刷新中</span>' : '');
  box.innerHTML = `<div class="det-hero">${logo}<div>
      <h2>${esc(t.teamZh || t.team)}</h2>
      ${t.teamZh && t.team && t.teamZh !== t.team ? `<div class="note">原文 ${esc(t.team)}</div>` : ''}
      <div class="player-tags">
        <span>${esc(t.leagueZh || '')}</span>
        ${t.seasonLabel ? `<span>${esc(t.seasonLabel)} 赛季</span>` : ''}
        ${t.country ? `<span>${esc(t.country)}</span>` : ''}
        ${t.marketValue && t.marketValue.text && t.marketValue.ok !== false ? `<span class="mv-tag">身价 ${esc(t.marketValue.labelZh || t.marketValue.text)}</span>` : ''}
      </div>
    </div></div>
    ${zoneBanner}
    ${stats}
    <div class="team-tabs" role="tablist">
      <button type="button" class="team-tab${tab === 'schedule' ? ' on' : ''}" data-act="teamTab" data-tab="schedule">赛程</button>
      <button type="button" class="team-tab${tab === 'intro' ? ' on' : ''}" data-act="teamTab" data-tab="intro">简介</button>
    </div>
    <div id="team-tab-schedule" class="team-tab-panel"${tab === 'schedule' ? '' : ' hidden'}>${scheduleHtml}${squadHtml}</div>
    <div id="team-tab-intro" class="team-tab-panel"${tab === 'intro' ? '' : ' hidden'}>${introHtml}</div>
    <p class="note">${esc(t.noteZh || '')}${cacheNote}</p>
    <div style="padding:8px 0 16px"><button class="btn ghost sm" data-go="#/data">返回数据中心</button></div>`;

  // Soft-upgrade zone tip from standings without blocking paint
  if (t.rank != null && !(S.dataCache && S.dataCache[(lg || '') + ':standings'])) {
    api('/standings?league=' + encodeURIComponent(lg || ''), { timeout: 8000 }).then((st) => {
      if (!st || st.ok === false) return;
      S.dataCache = S.dataCache || {};
      S.dataCache[(lg || '') + ':standings'] = st;
      const rows = ((st.tables && st.tables[0] && st.tables[0].rows) || []);
      const tip = standingGapHint(rows, { rank: t.rank, points: t.points }, lg);
      const el = document.getElementById('team-zone-banner');
      if (!el || !tip) return;
      const z2 = zoneForRank(lg, t.rank);
      const bits = [`目前第${t.rank}`];
      if (z2) bits.push(z2.label);
      if (t.points != null) bits.push(`${t.points}分`);
      bits.push(tip);
      el.textContent = bits.join(' · ');
    }).catch(() => {});
  }
}
async function fillTeam(id, lg, { squad, soft } = {}) {
  const box = document.getElementById('team-box');
  if (!box) return;
  try {
    let q = '/team?id=' + encodeURIComponent(id) + '&league=' + encodeURIComponent(lg || '') + '&enrich=1';
    if (squad) q += '&squad=1';
    const t = await api(q, { timeout: 25000 });
    if (!t || t.ok === false) {
      if (!soft) box.innerHTML = empty(esc((t && t.error) || '未找到球队'), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>', '暂无资料');
      return;
    }
    writeDetailLs('td', id, lg, t);
    paintTeamDetail(t, id, lg, { fromCache: false });
  } catch (e) {
    if (!soft) box.innerHTML = empty('加载失败：' + esc(e.message || ''), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>');
  }
}

function pageAfPlayer(id) {
  const lg = (route().query && route().query.league) || dataLeagueOf() || 'epl';
  let h = hdr('球员详情');
  const cached = readDetailLs('pd', id, lg);
  h += `<div id="aplayer-box" class="det-box">${cached && cached.data ? '' : skeleton(2)}</div>`;
  setTimeout(() => {
    if (cached && cached.data) {
      try { paintAfPlayer(cached.data, lg, { fromCache: true }); } catch { /* ignore */ }
    }
    fillAfPlayer(id, lg, { soft: !!(cached && cached.data) });
  }, 0);
  return h;
}
function paintAfPlayer(p, lg, { fromCache } = {}) {
  const box = document.getElementById('aplayer-box');
  if (!box || !p || p.ok === false) return;
  const initial = esc([...(p.playerZh || p.player || '?')][0] || '?');
  const img = p.photo
    ? `<img class="player-hero-ph" src="${esc(logoProxy(p.photo))}" alt="" onerror="this.outerHTML='<div class=\\'player-hero-ph fallback\\'>${initial}</div>'"/>`
    : `<div class="player-hero-ph fallback">${initial}</div>`;
  const teamGo = p.teamId ? ` data-go="#/team/${encodeURIComponent(p.teamId)}?league=${encodeURIComponent(lg)}"` : '';
  const cacheNote = fromCache ? '<span class="note"> · 本地缓存，后台更新中</span>' : (p.stale ? '<span class="note"> · 缓存刷新中</span>' : '');
  box.innerHTML = `<div class="player-hero">${img}<div>
      <h2>${esc(p.playerZh || p.player)}${yiMark(p.playerZhAuto)}</h2>
      ${p.playerZh && p.player && p.playerZh !== p.player ? `<div class="note">原文 ${esc(p.player)}${p.playerZhAuto ? '（中文为程序自动音译）' : ''}</div>` : ''}
      <div class="player-tags">
        ${p.positionZh || p.position ? `<span>${esc(p.positionZh || p.position)}</span>` : ''}
        ${p.number ? `<span>号码 ${esc(p.number)}</span>` : ''}
        ${p.nationalityZh || p.nationality ? `<span>${esc(p.nationalityZh || p.nationality)}</span>` : ''}
        ${p.leagueZh ? `<span>${esc(p.leagueZh)}</span>` : ''}
        ${p.marketValue && p.marketValue.text && p.marketValue.ok !== false ? `<span class="mv-tag">身价 ${esc(p.marketValue.labelZh || p.marketValue.text)}</span>` : ''}
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
      <dt>身价</dt><dd>${(p.marketValue && p.marketValue.text) ? esc(p.marketValue.text) : '暂无身价'}${(p.marketValue && p.marketValue.asOf) ? '<span class="note"> · 约 ' + esc(p.marketValue.asOf) + '</span>' : ''}</dd>
      <dt>位置</dt><dd>${dash(p.positionZh || p.position)}</dd>
      <dt>国籍</dt><dd>${dash(p.nationalityZh || p.nationality)}</dd>
      <dt>年龄</dt><dd>${dash(p.age)}</dd>
      <dt>身高</dt><dd>${dash(p.height)}</dd>
      <dt>出生日期</dt><dd>${dash(p.born)}</dd>
      <dt>赛季</dt><dd>${dash(p.seasonLabel)}</dd>
      <dt>评分</dt><dd>${dash(p.rating)}</dd>
    </dl>
    <p class="note">${esc(p.noteZh || '')}${cacheNote}</p>
    <div style="padding:8px 0 16px"><button class="btn ghost sm" data-go="#/data">返回数据中心</button></div>`;
}
async function fillAfPlayer(id, lg, { soft } = {}) {
  const box = document.getElementById('aplayer-box');
  if (!box) return;
  try {
    const p = await api('/af-player?id=' + encodeURIComponent(id) + '&league=' + encodeURIComponent(lg || ''), { timeout: 20000 });
    if (!p || p.ok === false) {
      if (!soft) box.innerHTML = empty(esc((p && p.error) || '未找到球员'), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>', '暂无资料');
      return;
    }
    writeDetailLs('pd', id, lg, p);
    paintAfPlayer(p, lg, { fromCache: false });
  } catch (e) {
    if (!soft) box.innerHTML = empty('加载失败：' + esc(e.message || ''), '<button class="btn ghost sm" data-go="#/data">返回数据中心</button>');
  }
}

/** Copy finished score fields from schedule/seen stub onto a 开奖 row (historical days). */
function hydrateResultScores(row, schedById) {
  if (!row || row.full) return row;
  const s = schedById.get(String(row.id));
  if (!s || !s.full) return row;
  const goalLine = row.goalLine || (s.hhad && s.hhad.goalLine) || s.goalLine || '';
  return {
    ...row,
    full: s.full,
    half: row.half || s.half || '',
    goalLine,
    had: row.had || s.had || null,
    hhad: row.hhad || s.hhad || null,
    status: row.status || s.status || '完场',
  };
}

/** Build 开奖 list day + filtered rows (shared by page + soft patch). */
function resultsDayModel() {
  const rs = S.results;
  if (!rs) return null;
  const sched = (S.schedule && S.schedule.length) ? S.schedule : [];
  const schedById = new Map(sched.map(m => [String(m.id), m]));
  const today = bjDate(0);
  const dates = [...new Set([...rs.map(issueDate), ...sched.filter(m => issueDate(m) <= today).map(issueDate)])].sort();
  if (!dates.length) return { emptyAll: true, dates };
  if (!S.rsDate || !dates.includes(S.rsDate)) {
    const withScores = dates.filter(d => rs.some(r => issueDate(r) === d && r.full && d <= today)
      || sched.some(m => issueDate(m) === d && m.full && d <= today));
    S.rsDate = withScores[withScores.length - 1] || [...dates].reverse().find(d => d <= today) || dates[dates.length - 1];
  }
  const dayRes = rs.filter(r => issueDate(r) === S.rsDate).map(r => hydrateResultScores(r, schedById));
  const dayFix = sched
    .filter(m => issueDate(m) === S.rsDate && !dayRes.some(r => r.id === m.id))
    .map(m => hydrateResultScores(m, schedById));
  const day = [...dayRes, ...dayFix];
  S.rsLeague = '全部';
  const list = day.sort((a, b) => String(a.num).localeCompare(String(b.num), 'zh'));
  return { dates, day, list, emptyAll: false };
}

/** Inner HTML under #rsBody — daysum / meta / cards (navy wrap paints around white cards). */
function resultsBodyHtml(list) {
  let h = '';
  if (S.rsrc?.source === 'sample') {
    h += `<div class="warn-bar">⚠️ <b>示例数据</b>：${esc(S.rsrc.note || '官方接口暂不可达')}，<b>非真实赛果</b>。</div>`;
  }
  let upsetN = 0, tot = 0;
  (list || []).forEach(r => {
    if (!r.full) return;
    const { res, fav } = resultInfo(r);
    if (res && fav) {
      tot++;
      if (fav !== res) upsetN++;
    }
  });
  if (tot) {
    h += `<div class="daysum"><b class="num">${upsetN}/${tot}</b><div>今日爆冷 ${upsetN} 场 / 共 ${tot} 场</div></div>`;
  }
  const wk = list && list[0] ? issueWeek(list[0]) : wd(S.rsDate);
  h += `<div class="list-meta"><span>${esc(S.rsDate)} ${wk} 开奖</span><span>${(list || []).length} 场</span></div>`;
  h += (list && list.length)
    ? `<div class="grid">${list.map(x => x.full ? resultCard(x) : matchCard(x, { odds: false })).join('')}</div>`
    : empty('该日期暂无场次。', '', '暂无场次');
  return h;
}

function pageResults() {
  let h = '';
  if (!S.results) return h + `<div class="dstrip light" style="height:50px"></div>` + skeleton(4);
  const model = resultsDayModel();
  if (!model || model.emptyAll) return h + empty('官方开奖数据暂未同步，请稍后下拉刷新。', '', '暂无开奖') + foot();
  h += dateStrip(model.dates, S.rsDate, 'rdate');
  h += `<div id="rsBody" class="rs-body rs-body--flush">${resultsBodyHtml(model.list)}</div>`;
  return h + foot();
}

/** 1.9.129: patch 开奖 date/league in place — avoid #view wipe → paint-hold navy flash. */
function softPatchResults() {
  try {
    if (route().name !== 'results') return false;
    const model = resultsDayModel();
    if (!model || model.emptyAll) return false;
    const v = document.getElementById('view');
    if (!v) return false;
    const ds = document.getElementById('dstrip');
    const dsx = ds ? ds.scrollLeft : null;
    if (ds) {
      const wrap = document.createElement('div');
      wrap.innerHTML = dateStrip(model.dates, S.rsDate, 'rdate');
      const next = wrap.firstElementChild;
      if (next) ds.replaceWith(next);
    }
    let body = document.getElementById('rsBody');
    if (!body) {
      body = document.createElement('div');
      body.id = 'rsBody';
      body.className = 'rs-body rs-body--flush';
      const footEl = v.querySelector('.foot');
      if (footEl) v.insertBefore(body, footEl);
      else v.appendChild(body);
    }
    body.innerHTML = resultsBodyHtml(model.list);
    const nds = document.getElementById('dstrip');
    if (nds) {
      if (dsx !== null) nds.scrollLeft = dsx;
      else syncDateStripScroll(nds);
    }
    try {
      const n = (S.results && S.results.length) || 0;
      const sn = (S.schedule && S.schedule.length) || 0;
      render.lastSig = 'results:' + n + ':' + sn + ':' + (S.rsDate || '') + ':' + (S.rsLeague || '') + ':' + JSON.stringify((route().query) || {});
      render.last = location.hash;
    } catch (_) {}
    return true;
  } catch (_) { return false; }
}

// ======================= detail =======================
function oddsSection(title, m, pool, ip, selectable) {
  const o = m[pool];
  if (!o) return `<div class="dsec"><h3>${title}</h3><div class="note">未开售</div></div>`;
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
const yiMark = auto => auto ? '<sup class="yi" title="程序自动音译">译</sup>' : '';
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
    h += `<div class="list-meta"><span>${esc(stateLab)}</span><span>来源综合公开数据</span></div>${chips}${lineupSide(lab, sideK === 'home' ? L.home : L.away)}`;
  } else {
    const pend = L.state === 'pending' ? '首发未公布（通常赛前约1小时）' : L.state === 'no-event' ? '未收录本场，无法获取本场首发' : '暂无本场阵容数据';
    h += `<div class="warn-bar">${esc(pend)}</div>`;
    if (L.prevHome || L.prevAway) {
      h += `<div class="list-meta"><span>参考：上一场实际首发（非本场）</span><span>来源综合公开数据</span></div>${chips}${lineupSide(lab, sideK === 'home' ? L.prevHome : L.prevAway, { hideBench: true, emptyText: '未获取到上一场首发' })}`;
    }
  }
  if (L.noteZh) h += `<p class="note" style="margin:8px 0 0">${esc(L.noteZh)} 照片来自公开名单匹配，无照片显示首字。</p>`;
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
      (p.nameZh ? '<div class="note">原文 ' + esc(p.name) + (p.nameZhSrc === 'auto' ? '（中文为程序自动音译）' : '') + '</div>' : (p.nameAlt ? '<div class="note">' + esc(p.nameAlt) + '</div>' : '')) +
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
// 1.9.107: chat merged under events tab
const DETAIL_TABS_BASE = [['attitude', '态度'], ['intel', '情报'], ['odds', '赔率'], ['data', '数据'], ['events', '事件'], ['squad', '阵容'], ['pred', '预测']];
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
  let t = S.detailTab[id] || 'attitude';
  // 1.9.107: legacy chat tab / deep-link -> events + scroll to chat
  if (t === 'chat') {
    S.detailTab[id] = 'events';
    S.scrollToChat = S.scrollToChat || {};
    S.scrollToChat[id] = true;
    t = 'events';
  }
  return t;
}
function isEventsTab(id) { return detailTabOf(id) === 'events'; }
function maybeScrollToChat(id) {
  if (!(S.scrollToChat && S.scrollToChat[id])) return;
  S.scrollToChat[id] = false;
  setTimeout(() => {
    const el = document.getElementById('match-chat-anchor-' + id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}
function intelBullets(m, stats) {
  const bullets = [];
  const p = implied(m.had);
  const q0 = implied(m.hhad);
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
  } else if (q0 && m.hhad) {
    // 1.9.102: HHAD-only → 让球对照 is primary intel (never「无法从赔率推导」)
    const gl = m.hhad.goalLine != null && m.hhad.goalLine !== '' ? Number(m.hhad.goalLine) : NaN;
    const qk = order(q0)[0];
    const gap = (q0[qk] - q0[order(q0)[1]]) * 100;
    const desc = Number.isFinite(gl)
      ? (gl < 0 ? `主队让 ${Math.abs(gl)} 球` : `主队受让 ${Math.abs(gl)} 球`)
      : '让球盘';
    bullets.push(`胜平负未开售。让球对照（${desc}）：让胜 ${pct(q0.h, 1)} / 让平 ${pct(q0.d, 1)} / 让负 ${pct(q0.a, 1)}，市场倾向 <b>${LBL.hhad[qk]}</b>（领先约 ${gap.toFixed(0)} 个百分点）。`);
  } else {
    bullets.push('该场暂未开售胜平负与让球玩法，暂无盘口隐含概率可参考。');
  }
  if (p && m.hhad && m.hhad.goalLine != null && q0) {
    const gl = Number(m.hhad.goalLine);
    const qk = order(q0)[0];
    const desc = gl < 0 ? `主队让 ${Math.abs(gl)} 球` : `主队受让 ${Math.abs(gl)} 球`;
    bullets.push(`让球盘（${desc}）倾向 <b>${LBL.hhad[qk]}</b>（${pct(q0[qk], 1)}）。`);
  }
  if (stats && stats.homeForm && stats.homeForm.matches && stats.homeForm.matches.length) {
    const hs = stats.homeForm.summary || { w: 0, d: 0, l: 0 };
    const as = (stats.awayForm && stats.awayForm.summary) || { w: 0, d: 0, l: 0 };
    // 1.9.42: keep 胜/平/负 counts only — do not append messy WDL letter strings like (WDLWLLL…)
    let line = `近期战绩（历史库）：${H} ${hs.w}胜${hs.d}平${hs.l}负`;
    if (stats.awayForm && stats.awayForm.matches && stats.awayForm.matches.length) {
      line += `；${A} ${as.w}胜${as.d}平${as.l}负`;
    }
    bullets.push(line + '。');
  }
  if (stats && stats.h2h && stats.h2h.matches && stats.h2h.matches.length) {
    const s0 = stats.h2h.summary;
    bullets.push(`双方近期交锋 ${stats.h2h.matches.length} 场：主队视角 ${s0.homeWins}胜${s0.draws}平${s0.awayWins}负。`);
  }
  bullets.push(`<span class="note">以上情报由官方即时赔率与本地历史赛果自动推导，不含伤停/主力出战等内部消息。</span>`);
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
  const lab = { history: '竞彩', espn: '综合赛程', 'api-football': '全赛程' };
  return t.map(x => lab[x] || x).join('+');
}
function formStrip(form, label, { teamId, venue = 'all', n = 5, compact = false, sourceHint = '', blockId = '' } = {}) {
  const idAttr = blockId ? ` id="${esc(blockId)}"` : '';
  const filtered = teamId ? filterFormMatches(form, teamId, venue, n) : {
    matches: ((form && form.matches) || []).slice(0, n),
    summary: form && form.summary ? form.summary : { w: 0, d: 0, l: 0 },
  };
  if (!filtered.matches.length) {
    return `<div class="form-block"${idAttr}><div class="form-h">${esc(label)}</div><p class="note">暂无近期赛果${venue !== 'all' ? '（该筛选）' : ''}</p></div>`;
  }
  const s = filtered.summary;
  const chips = filtered.matches.map(m => {
    const cls = m.outcome === 'W' ? 'w' : m.outcome === 'D' ? 'd' : 'l';
    const home = forceTeamZh(m.home);
    const away = forceTeamZh(m.away);
    const lgName = forceLeagueZh(m.league || '');
    const lg = lgName ? ` · ${lgName}` : '';
    const tip = esc(m.date + ' ' + home + ' ' + (m.ft || '') + ' ' + away + lg);
    return `<span class="fchip ${cls}" title="${tip}">${m.outcome || '?'}</span>`;
  }).join('');
  const venueLab = venue === 'home' ? '主场' : venue === 'away' ? '客场' : '全部';
  const srcLab = formSourceLab(form, sourceHint);
  return `<div class="form-block"${idAttr}><div class="form-h">${esc(label)} <small>近${filtered.matches.length} · ${venueLab} · ${s.w}胜${s.d}平${s.l}负 · ${esc(srcLab)}</small></div><div class="form-row">${chips}</div>
    ${compact ? '' : `<ul class="form-list">${filtered.matches.map(m => {
      const home = forceTeamZh(m.home);
      const away = forceTeamZh(m.away);
      const lgName = forceLeagueZh(m.league || '');
      return `<li><span>${esc(m.date)}</span><span>${esc(home)} ${esc(m.ft || '-')} ${esc(away)}${lgName ? ` <small class="muted">${esc(lgName)}</small>` : ''}</span><b class="${m.outcome === 'W' ? 'w' : m.outcome === 'D' ? 'd' : 'l'}">${m.outcome || '-'}</b></li>`;
    }).join('')}</ul>`}</div>`;
}
function h2hBlock(h2h, home, away, { n = 5, matchId = '', h2hSource = '' } = {}) {
  const all = (h2h && h2h.matches) ? h2h.matches : [];
  const list = all.slice(0, n);
  if (!list.length) {
    return `<div class="ana-card" id="intel-h2h"><div class="ana-hd"><h3>历史交锋</h3></div><p class="note">本地历史库与第三方均暂无双方完场交锋记录</p></div>`;
  }
  const s = summarizeOutcomes(list.map(m => ({ forCurrentHome: m.forCurrentHome })));
  const total = s.w + s.d + s.l || 1;
  const srcLab = h2hSource === 'api-football' ? '综合交锋库' : '本地历史库';
  const filters = matchId ? `<div class="ana-filters">
    ${[5, 10].map(k => `<button type="button" class="ana-chip ${n === k ? 'on' : ''}" data-act="statsUi" data-id="${esc(matchId)}" data-k="h2hN" data-v="${k}">近${k}</button>`).join('')}
  </div>` : '';
  return `<div class="ana-card" id="intel-h2h"><div class="ana-hd"><h3>历史交锋</h3><small>主队视角 · ${list.length} 场 · ${esc(srcLab)}</small></div>${filters}
    <div class="cmp-bars">
      <div class="cmp-row"><span>${esc(home)}</span><div class="cmp-track"><i class="h" style="width:${(s.w / total) * 100}%"></i></div><b>${s.w}</b></div>
      <div class="cmp-row"><span>平局</span><div class="cmp-track"><i class="d" style="width:${(s.d / total) * 100}%"></i></div><b>${s.d}</b></div>
      <div class="cmp-row"><span>${esc(away)}</span><div class="cmp-track"><i class="a" style="width:${(s.l / total) * 100}%"></i></div><b>${s.l}</b></div>
    </div>
    <div class="ana-table-wrap"><table class="ana-table"><thead><tr><th>日期</th><th>对阵</th><th>比分</th><th>主队</th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${esc(m.date)}</td><td>${esc(forceTeamZh(m.home))} vs ${esc(forceTeamZh(m.away))}${m.league ? ` <small class="muted">${esc(forceLeagueZh(m.league))}</small>` : ''}</td><td class="num">${esc(m.ft || '-')}</td>
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
  if (r === 'no_key') return '过程数据源暂未就绪';
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
  const hSosOk = !!(hOk && proc.home.sos && proc.home.sos.ok && proc.home.averagesAdjusted);
  const aSosOk = !!(aOk && proc.away.sos && proc.away.sos.ok && proc.away.averagesAdjusted);
  const anySos = !!(hSosOk || aSosOk);
  let small = available
    ? (`近${Math.max(hn, an) || (proc && proc.n) || 5}场场均` + (anySos ? ' · 含强度修正' : ''))
    : (reason === 'suspended' ? '数据源暂停' : reason === 'no_key' ? '暂未就绪' : reason === 'quota' ? '配额紧张' : '暂无数据');

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
      <p class="note">${esc((proc && proc.noteZh) || '过程数据源就绪后将展示控球、射门、传球等场均对比。')}</p>
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
      const hAdjMap = hSosOk ? proc.home.averagesAdjusted : null;
      const aAdjMap = aSosOk ? proc.away.averagesAdjusted : null;
      const hAdjV = hAdjMap ? hAdjMap[m.key] : null;
      const aAdjV = aAdjMap ? aAdjMap[m.key] : null;
      const adjLine = (hAdjV != null || aAdjV != null)
        ? `<div class="proc-sos">
            <span class="proc-sos-val h ${hAdjV == null ? 'na' : ''}">${hAdjV != null ? processMetricFmt(m.key, hAdjV) : '—'}</span>
            <span class="proc-sos-lab">强度修正</span>
            <span class="proc-sos-val a ${aAdjV == null ? 'na' : ''}">${aAdjV != null ? processMetricFmt(m.key, aAdjV) : '—'}</span>
          </div>`
        : '';
      return `<div class="proc-row ${both ? '' : 'one-side'}">
        <div class="proc-metric-lab">${esc(m.labelZh)}</div>
        <div class="proc-compare">
          <span class="proc-val h ${hLead ? 'lead' : ''} ${hv == null ? 'na' : ''}">${processMetricFmt(m.key, hv)}</span>
          <div class="${trackCls}">${hBar}${aBar}</div>
          <span class="proc-val a ${aLead ? 'lead' : ''} ${av == null ? 'na' : ''}">${processMetricFmt(m.key, av)}</span>
        </div>
        ${adjLine}
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
      <div class="proc-vs"><span>VS</span><small>${anySos ? '场均·强度修正' : '场均对比'}</small></div>
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
    ${anySos ? `<p class="proc-sos-banner note">${hSosOk && aSosOk
      ? '「强度修正」已按对手强度修正；双侧均有覆盖时过程倾向优先用修正场均。'
      : '「强度修正」仅一侧有对手强度覆盖；缺资料侧未臆造，过程倾向回退原始场均。'}</p>` : ''}
    <p class="proc-foot note">${esc((proc && proc.noteZh) || '过程指标为完场场均，反映风格倾向，需结合战绩与盘面。')}</p>`;
  }

  return `<div class="ana-card proc-card"><div class="ana-hd"><h3>近期过程数据</h3><small>${esc(small)}</small></div>${body}</div>`;
}
/** 1.9.83: scrub leftover English club/league labels in form/H2H/intel UI. */
const FORCE_TEAM_ZH = {
  'Machida Zelvia': '町田泽维', 'Avispa Fukuoka': '福冈黄蜂',
  'Yokohama F. Marinos': '横滨水手', 'Yokohama F Marinos': '横滨水手', 'Yokohama Marinos': '横滨水手',
  'Urawa Red Diamonds': '浦和红钻', 'Urawa Reds': '浦和红钻',
  'Nagoya Grampus': '名古屋鲸', 'Kawasaki Frontale': '川崎前锋',
  'Sanfrecce Hiroshima': '广岛三箭', 'Kashima Antlers': '鹿岛鹿角',
  'Shimizu S-Pulse': '清水鼓动', 'Kyoto Sanga': '京都', 'Yokohama FC': '横滨FC',
  'Fagiano Okayama': '冈山绿雉', 'Mito Hollyhock': '水户蜀葵', 'Kashiwa Reysol': '柏太阳神',
  'Tampines Rovers': '坦皮尼斯流浪', 'Svay Rieng': '柴桢',
  'Preah Khan Reach Svay Rieng': '柴桢', 'Lion City Sailors': '狮城水手',
  'Cerezo Osaka': '大阪樱花', 'Gamba Osaka': '大阪钢巴', 'FC Tokyo': 'FC东京',
  'Vissel Kobe': '神户胜利船',
  'JEF United Ichihara-Chiba': '千叶市原', 'JEF United Chiba': '千叶市原', 'JEF United': '千叶市原',
  'SV Elversberg': '埃沃斯堡', Elversberg: '埃沃斯堡',
  'Rot-Weiß Essen': '红白埃森', 'Rot-Weiss Essen': '红白埃森', 'Rot Weiss Essen': '红白埃森',
  'FC Schalke 04': '沙尔克04', 'Schalke 04': '沙尔克04', Schalke: '沙尔克04',
  'Hamburg SV': '汉堡', 'Hamburger SV': '汉堡', Hamburg: '汉堡', HSV: '汉堡',
};
const FORCE_LEAGUE_ZH = {
  'Japanese J1 League': '日职', 'Japanese J.League': '日职', 'Japanese J. League': '日职',
  'J1 League': '日职', 'J.League': '日职', 'J. League': '日职', 'Japan J1 League': '日职',
  'J2 League': '日乙', 'Japanese J2 League': '日乙',
  'English Premier League': '英超', 'Premier League': '英超',
  'English League Championship': '英冠', Championship: '英冠',
  'Spanish LALIGA': '西甲', LALIGA: '西甲', 'La Liga': '西甲', LaLiga: '西甲',
  'German Bundesliga': '德甲', Bundesliga: '德甲',
  'Italian Serie A': '意甲', 'Serie A': '意甲',
  'French Ligue 1': '法甲', 'Ligue 1': '法甲',
  'Portuguese Primeira Liga': '葡超', 'Dutch Eredivisie': '荷甲', Eredivisie: '荷甲',
  'UEFA Champions League': '欧冠', 'Champions League': '欧冠',
  'UEFA Europa League': '欧联', 'Europa League': '欧联',
  'UEFA Conference League': '欧协联', 'Conference League': '欧协联',
  'Club Friendlies': '球会友谊', Friendlies: '友谊赛',
  'AFC Champions League Elite': '亚冠精英', 'AFC Champions League': '亚冠',
  'AFC Champions League Two': '亚冠二级',
  'DFB Pokal': '德国杯', 'DFB-Pokal': '德国杯', 'German Cup': '德国杯', 'Germany DFB Pokal': '德国杯',
  '2. Bundesliga': '德乙', 'German 2. Bundesliga': '德乙', '2.Bundesliga': '德乙',
  '3. Liga': '德丙', 'German 3. Liga': '德丙',
  'FA Cup': '足总杯', 'EFL Cup': '联赛杯', 'Carabao Cup': '联赛杯',
  'Copa del Rey': '国王杯', 'Coppa Italia': '意大利杯', 'Coupe de France': '法国杯',
  'Chinese Super League': '中超', 'K League 1': '韩K联', 'K League': '韩K联',
  'Saudi Pro League': '沙特联', MLS: '美职足',
};
function forceTeamZh(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\u4e00-\u9fff]/.test(n)) return n;
  if (FORCE_TEAM_ZH[n]) return FORCE_TEAM_ZH[n];
  const low = n.toLowerCase().replace(/[.'']/g, '');
  for (const [en, zh] of Object.entries(FORCE_TEAM_ZH)) {
    if (en.toLowerCase().replace(/[.'']/g, '') === low) return zh;
  }
  return n;
}
function forceLeagueZh(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (/[\u4e00-\u9fff]/.test(n)) return n;
  if (FORCE_LEAGUE_ZH[n]) return FORCE_LEAGUE_ZH[n];
  const low = n.toLowerCase();
  for (const [en, zh] of Object.entries(FORCE_LEAGUE_ZH)) {
    if (en.toLowerCase() === low) return zh;
  }
  if (/ligue\s*1|french\s*ligue/i.test(n)) return '法甲';
  if (/uefa\s*champions|champions\s*league/i.test(n)) return '欧冠';
  if (/europa\s*league/i.test(n)) return '欧联';
  if (/conference\s*league/i.test(n)) return '欧协联';
  if (/premier\s*league/i.test(n)) return '英超';
  if (/la\s*liga|laliga/i.test(n)) return '西甲';
  if (/serie\s*a/i.test(n)) return '意甲';
  if (/^bundesliga$/i.test(n) || /german\s*bundesliga/i.test(n)) return '德甲';
  if (/j\s*1|j\.?\s*league|japanese/i.test(n)) return '日职';
  if (/dfb\s*-?\s*pokal|german\s*cup/i.test(n)) return '德国杯';
  if (/2\.?\s*bundesliga/i.test(n)) return '德乙';
  if (/coupe\s*de\s*france/i.test(n)) return '法国杯';
  if (/fa\s*cup/i.test(n)) return '足总杯';
  return n;
}
function leagueKeyFromMatch(x) {
  const lg = String((x && x.league) || '');
  const map = {
    '英超': 'epl', '西甲': 'laliga', '德甲': 'bundesliga', '意甲': 'seriea', '法甲': 'ligue1',
    '欧冠': 'ucl', '中超': 'csl', '英冠': 'championship', '荷甲': 'eredivisie',
  };
  if (map[lg]) return map[lg];
  const low = lg.toLowerCase();
  if (/premier|英超/.test(low)) return 'epl';
  if (/laliga|la liga|西甲/.test(low)) return 'laliga';
  if (/bundesliga|德甲/.test(low)) return 'bundesliga';
  if (/serie\s*a|意甲/.test(low)) return 'seriea';
  if (/ligue\s*1|法甲/.test(low)) return 'ligue1';
  if (/champions|欧冠/.test(low)) return 'ucl';
  return '';
}
function hubFormPageKey(matchId, jump) { return String(matchId) + ':' + String(jump); }
function hubFormShown(matchId, jump) {
  S.hubFormShown = S.hubFormShown || {};
  return S.hubFormShown[hubFormPageKey(matchId, jump)] || 15;
}
function setHubFormShown(matchId, jump, n) {
  S.hubFormShown = S.hubFormShown || {};
  S.hubFormShown[hubFormPageKey(matchId, jump)] = n;
}
async function openMatchHubSheet(matchId, jump) {
  const id = String(matchId || '');
  const x = findMatch(id) || (S.results || []).find(z => String(z.id) === id);
  if (!x) { toast('未找到比赛'); return; }
  const sh = $('#sheet');
  sh.classList.remove('hidden');
  const closeBtn = '<button type="button" class="x" data-act="closeSheet" aria-label="关闭">✕</button>';

  if (jump === 'rules') {
    sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>赛事规则</span>${closeBtn}</h3>
      <div class="hub-body">
        <p>竞彩足球玩法以官方开售为准：胜平负、让球胜平负等。本页战绩/交锋/积分/预测均来自公开赛果与赔率推导。，不构成投注建议。</p>
        <p class="note">关闭本面板（点 ✕、点遮罩或系统返回）即可回到赛事详情，不会离开当前比赛。</p>
        <button type="button" class="btn ghost block" data-act="closeSheet">关闭</button>
      </div></div>`;
    return;
  }

  if (jump === 'future') {
    sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>未来比赛</span>${closeBtn}</h3><div class="spinner"></div><p class="note">加载后续赛程…</p></div>`;
    let homeNext = [];
    let awayNext = [];
    let sourceZh = '综合赛程';
    try {
      const j = await loadNextFixtures(x, 5);
      homeNext = (j && j.home) || [];
      awayNext = (j && j.away) || [];
      sourceZh = (j && j.sourceZh) || sourceZh;
    } catch (_) {
      homeNext = nextFixturesFor(x.homeTeamId, x.id, 5);
      awayNext = nextFixturesFor(x.awayTeamId, x.id, 5);
      sourceZh = '在售/赛程缓存';
    }
    const row = (m) => {
      const side = m.side || (m.isHome ? '主' : '客');
      const vs = forceTeamZh(m.vs || (m.isHome ? m.away : m.home));
      const lg = forceLeagueZh(m.league || '');
      const d = String(m.date || (typeof issueDate === 'function' ? issueDate(m) : '') || '').slice(5);
      return `<li class="hub-fx"><span class="hub-fx-d">${esc(d)} ${esc(m.time || '')}</span>
        <span class="hub-fx-m"><i class="side">${esc(side)}</i> vs ${esc(vs)}</span>
        <span class="tag tag-muted">${esc(lg)}</span></li>`;
    };
    const emptyNote = /在售/.test(sourceZh)
      ? '当前在售/赛程中暂无该队后续场次'
      : '暂无该队后续场次';
    const block = (lab, list) => `<div class="hub-sec"><div class="form-h">${esc(lab)} · 未来比赛</div>
      ${list.length ? `<ul class="hub-fx-list">${list.map(row).join('')}</ul>` : `<p class="note">${emptyNote}</p>`}</div>`;
    sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>未来比赛</span>${closeBtn}</h3>
      <p class="note" style="margin:0 0 10px">本场主队/客队后续赛程（联赛与杯赛 · ${esc(sourceZh)}）</p>
      ${block(x.home, homeNext)}
      ${block(x.away, awayNext)}
      <button type="button" class="btn ghost block" data-act="closeSheet" style="margin-top:12px">关闭</button>
    </div>`;
    return;
  }

  if (jump === 'standings') {
    const key = leagueKeyFromMatch(x);
    sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>积分排名</span>${closeBtn}</h3><div class="spinner"></div><p class="note">加载积分榜…</p></div>`;
    if (!key) {
      sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>积分排名</span>${closeBtn}</h3>
        <p>本场联赛「${esc(x.league || '')}」暂未接入数据中心积分榜。</p>
        <p class="note">关闭本面板即可返回赛事详情（不会跳转数据中心）。</p>
        <button type="button" class="btn ghost block" data-act="closeSheet">关闭</button></div>`;
      return;
    }
    try {
      const j = await api('/standings?league=' + encodeURIComponent(key), { timeout: 12000 });
      const body = (j && j.ok !== false && (j.tables || []).length)
        ? renderStandingsTable(j)
        : `<p class="note">${esc((j && j.error) || '暂无积分榜数据')}</p>`;
      sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>积分排名 · ${esc((j && j.leagueZh) || x.league || key)}</span>${closeBtn}</h3>
        <div class="hub-standings">${body}</div>
        <button type="button" class="btn ghost block" data-act="closeSheet" style="margin-top:12px">关闭</button></div>`;
    } catch (e) {
      sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>积分排名</span>${closeBtn}</h3>
        <p class="note">积分榜加载失败，请稍后再试。</p>
        <button type="button" class="btn ghost block" data-act="closeSheet">关闭</button></div>`;
    }
    return;
  }

  // form / form-away — all matches we have, paginated
  const sideAway = jump === 'form-away';
  const title = sideAway ? '客队战绩' : '主队战绩';
  const label = sideAway ? x.away : x.home;
  const teamId = sideAway ? x.awayTeamId : x.homeTeamId;
  sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>${esc(title)} · ${esc(label)}</span>${closeBtn}</h3><div class="spinner"></div></div>`;
  // bust cache so limit=50 is honored
  const cacheKey = String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '');
  if (S.statsCache && S.statsCache[cacheKey]) delete S.statsCache[cacheKey];
  let stats = null;
  try { stats = await loadMatchStats(x); } catch (_) { stats = null; }
  const form = sideAway ? (stats && stats.awayForm) : (stats && stats.homeForm);
  const filtered = teamId ? filterFormMatches(form, teamId, 'all', 80) : {
    matches: ((form && form.matches) || []).slice(0, 80),
    summary: form && form.summary ? form.summary : { w: 0, d: 0, l: 0 },
  };
  const all = filtered.matches || [];
  const s = filtered.summary || { w: 0, d: 0, l: 0 };
  let shown = hubFormShown(id, jump);
  if (shown < 15) shown = 15;
  if (shown > all.length) shown = all.length;
  const page = all.slice(0, shown);
  const rows = page.map(m => {
    const home = forceTeamZh(m.home);
    const away = forceTeamZh(m.away);
    const lg = forceLeagueZh(m.league || '');
    const oc = m.outcome === 'W' ? 'w' : m.outcome === 'D' ? 'd' : 'l';
    return `<li class="hub-form-row"><span class="hub-f-d">${esc(String(m.date || '').slice(5))}${lg ? `<small>${esc(lg)}</small>` : ''}</span>
      <span class="hub-f-m"><b class="${String(m.homeTeamId) === String(teamId) ? 'focus' : ''}">${esc(home)}</b>
        <em class="num">${esc(m.ft || '-')}</em>
        <b class="${String(m.awayTeamId) === String(teamId) ? 'focus' : ''}">${esc(away)}</b></span>
      <b class="hub-f-r ${oc}">${m.outcome || '-'}</b></li>`;
  }).join('');
  const more = all.length > shown
    ? `<button type="button" class="btn ghost block" data-act="hubFormMore" data-id="${esc(id)}" data-jump="${esc(jump)}" data-n="${shown + 15}">加载更多（还有 ${all.length - shown} 场）</button>`
    : (all.length ? `<p class="note" style="text-align:center">已显示全部 ${all.length} 场</p>` : '');
  sh.innerHTML = `<div class="sheet hub-sheet"><h3><span>${esc(title)} · ${esc(label)}</span>${closeBtn}</h3>
    <div class="hub-form-meta">${esc(label)} · 共 ${all.length} 场 · ${s.w}胜${s.d}平${s.l}负</div>
    ${all.length ? `<ul class="hub-form-list">${rows}</ul>${more}` : '<p class="note">暂无战绩数据</p>'}
    <button type="button" class="btn ghost block" data-act="closeSheet" style="margin-top:8px">关闭</button>
  </div>`;
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
  return `<div class="ana-card" id="intel-form"><div class="ana-hd"><h3>近期战绩</h3><small>${esc(hdLab)}</small></div>${filters}
    ${formStrip(stats && stats.homeForm, x.home, { teamId: x.homeTeamId, venue: ui.formVenue, n: ui.formN, sourceHint: stats && stats.homeFormSource, blockId: 'intel-form-home' })}
    ${formStrip(stats && stats.awayForm, x.away, { teamId: x.awayTeamId, venue: ui.formVenue, n: ui.formN, sourceHint: stats && stats.awayFormSource, blockId: 'intel-form-away' })}
    <p class="note" style="margin:8px 0 0">${esc((stats && stats.noteZh) || '以上为历史赛果推导。')}${ui.formVenue !== 'all' ? ' 主/客场按该队在该场次的主客身份筛选。' : ''}</p>
  </div>`;
}
async function loadNextFixtures(x, limit = 5) {
  const mid = String((x && x.id) || '');
  if (!S.nextFxCache) S.nextFxCache = {};
  const key = mid + '|' + String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '') + '|' + limit;
  const hit = S.nextFxCache[key];
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.payload;
  const q = new URLSearchParams();
  if (mid) q.set('matchId', mid);
  if (x.homeTeamId) q.set('homeTeamId', x.homeTeamId);
  if (x.awayTeamId) q.set('awayTeamId', x.awayTeamId);
  if (x.home) q.set('home', x.home);
  if (x.away) q.set('away', x.away);
  if (x.date) q.set('date', x.date);
  if (x.time) q.set('time', x.time);
  q.set('limit', String(limit));
  const j = await api('/next-fixtures?' + q.toString(), { timeout: 15000 });
  if (j && j.ok !== false) {
    S.nextFxCache[key] = { at: Date.now(), payload: j };
    return j;
  }
  throw new Error((j && j.error) || 'next-fixtures failed');
}
function nextFixturesFor(teamId, excludeId, limit = 3) {
  const tid = String(teamId || '');
  if (!tid) return [];
  const pool = [];
  const seen = new Set();
  const now = Date.now();
  for (const m of [...(S.schedule || []), ...(S.matches || [])]) {
    const id = String(m.id);
    if (id === String(excludeId) || seen.has(id)) continue;
    if (String(m.homeTeamId) !== tid && String(m.awayTeamId) !== tid) continue;
    if (m.full) continue;
    // 1.9.104: schedule-seen keeps ~14d past rows; many lack full scores. 「未来」must use kickoff > now (Asia/Shanghai via kickoff()).
    if (!(kickoff(m) > now)) continue;
    if (m.status && /完场|已结束|Finished|Payout/i.test(String(m.status))) continue;
    seen.add(id);
    pool.push(m);
  }
  return pool.sort((a, b) => kickoff(a) - kickoff(b)).slice(0, limit);
}
function nextFixturesCard(x) {
  const mid = String(x.id || '');
  const cacheKey = mid + '|' + String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '') + '|5';
  const cached = S.nextFxCache && S.nextFxCache[cacheKey];
  let homeNext = (cached && cached.payload && cached.payload.home) || nextFixturesFor(x.homeTeamId, x.id, 3);
  let awayNext = (cached && cached.payload && cached.payload.away) || nextFixturesFor(x.awayTeamId, x.id, 3);
  const srcSmall = (cached && cached.payload && cached.payload.sourceZh) || '联赛与杯赛 · 打开「未来比赛」可刷新';
  if (!cached || Date.now() - cached.at > 10 * 60e3) {
    loadNextFixtures(x, 5).then(() => {
      try {
        const host = document.getElementById('intel-next');
        if (host) host.outerHTML = nextFixturesCard(x);
      } catch (_) { /* */ }
    }).catch(() => {});
  }
  if (!homeNext.length && !awayNext.length) {
    return `<div class="ana-card" id="intel-next"><div class="ana-hd"><h3>后续赛程</h3><small>加载中…</small></div><p class="note">正在拉取两队后续联赛/杯赛场次</p></div>`;
  }
  const row = (m) => {
    const side = m.side || (m.isHome ? '主' : '客');
    const vs = forceTeamZh(m.vs || (m.isHome ? m.away : m.home));
    const lg = forceLeagueZh(m.league || '');
    const d = String(m.date || issueDate(m) || '').slice(5);
    const go = (m.source === 'api-football' || String(m.id || '').startsWith('af:'))
      ? ''
      : `<button type="button" class="linkish" data-go="#/match/${encodeURIComponent(m.id)}">详情</button>`;
    return `<li><span>${esc(d)} ${esc(m.time || '')}</span><span><i class="side">${esc(side)}</i> vs ${esc(vs)}</span>${homeTheme() === 'pitch' ? `<span class="tag tag-muted">${esc(lg)}</span>` : `<span class="tag" style="background:${esc(m.leagueColor || '#2F6FED')}">${esc(lg)}</span>`}
      ${go}</li>`;
  };
  return `<div class="ana-card" id="intel-next"><div class="ana-hd"><h3>后续赛程</h3><small>${esc(srcSmall)}</small></div>
    <div class="next-form"><div class="form-h">${esc(x.home)}</div>
      ${homeNext.length ? `<ul class="next-list">${homeNext.slice(0, 3).map(row).join('')}</ul>` : '<p class="note">暂无后续场次</p>'}
    </div>
    <div class="next-form"><div class="form-h">${esc(x.away)}</div>
      ${awayNext.length ? `<ul class="next-list">${awayNext.slice(0, 3).map(row).join('')}</ul>` : '<p class="note">暂无后续场次</p>'}
    </div>
  </div>`;
}

function oddsCompareBlock(m) {
  const p = implied(m.had);
  const q = implied(m.hhad);
  if (p) {
    return `<div class="dsec"><h3>赔率隐含概率对比</h3>
    <div class="cmp-bars">
      <div class="cmp-row"><span>主胜 ${esc(m.home)}</span><div class="cmp-track"><i class="h" style="width:${p.h * 100}%"></i></div><b>${pct(p.h, 1)}</b></div>
      <div class="cmp-row"><span>平局</span><div class="cmp-track"><i class="d" style="width:${p.d * 100}%"></i></div><b>${pct(p.d, 1)}</b></div>
      <div class="cmp-row"><span>客胜 ${esc(m.away)}</span><div class="cmp-track"><i class="a" style="width:${p.a * 100}%"></i></div><b>${pct(p.a, 1)}</b></div>
    </div>
  </div>`;
  }
  if (q && m.hhad) {
    const gl = m.hhad.goalLine != null && m.hhad.goalLine !== '' ? esc(String(m.hhad.goalLine)) : '-';
    return `<div class="dsec"><h3>让球对照 <small>主队 ${gl}</small></h3>
    <p class="note" style="margin:0 0 8px">胜平负未开售，以下为让球胜平负隐含概率。</p>
    <div class="cmp-bars">
      <div class="cmp-row"><span>让胜</span><div class="cmp-track"><i class="h" style="width:${q.h * 100}%"></i></div><b>${pct(q.h, 1)}</b></div>
      <div class="cmp-row"><span>让平</span><div class="cmp-track"><i class="d" style="width:${q.d * 100}%"></i></div><b>${pct(q.d, 1)}</b></div>
      <div class="cmp-row"><span>让负</span><div class="cmp-track"><i class="a" style="width:${q.a * 100}%"></i></div><b>${pct(q.a, 1)}</b></div>
    </div>
  </div>`;
  }
  return `<div class="dsec"><h3>赔率对比</h3><p class="note">胜平负与让球均未开售</p></div>`;
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
      ? (mine ? '你已投票，投后不可修改（每场每人一票）。' : '登录用户每场可投一票，投后不可修改，结果实时汇总。')
      : '登录后可投票表达态度。<a href="#/login">去登录</a> · 投票。'}</p>
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
    q.push('limit=50');
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
  // 1.9.127: slim LS hydrate is ok+predict without html — must still fetch full brief
  if (!force && predictReportFull(S.predictCache[id])) {
    // 1.9.60: if AI赛前解读 still pending, re-fetch (server may have finished bg enrich)
    const ai = S.predictCache[id].aiPrematch;
    if (!(ai && ai.pending)) return S.predictCache[id];
  }
  try {
    const q = '/predict-report?matchId=' + encodeURIComponent(id) + (force ? '&refresh=1' : '');
    const j = await api(q, { timeout: 20000 });
    if (j && j.ok) {
      S.predictCache[id] = j;
      return j;
    }
    if (j) {
      const prev = S.predictCache[id];
      const err = j.error || j.reason || '综合报告暂不可用';
      if (prev && prev.predict && !prev.html) {
        S.predictCache[id] = Object.assign({}, prev, { ok: false, error: err, reason: j.reason || 'unavailable', _slim: true });
      } else if (!predictReportFull(prev)) {
        S.predictCache[id] = { ok: false, error: err, reason: j.reason || 'unavailable' };
      }
      return S.predictCache[id];
    }
    return S.predictCache[id] || null;
  } catch (e) {
    const fail = { ok: false, error: (e && e.message) || '加载失败' };
    // keep previous full report if any; slim alone is not enough for 预测 tab
    if (!predictReportFull(S.predictCache[id])) {
      const prev = S.predictCache[id];
      if (prev && prev.predict && !prev.html) {
        S.predictCache[id] = Object.assign({}, prev, fail, { _slim: true });
      } else {
        S.predictCache[id] = fail;
      }
    }
    return S.predictCache[id];
  }
}

/** 1.9.60: poll once/twice while AI赛前解读 is generating (non-blocking first paint). */
function ensurePrematchAiPoll(m) {
  const id = String(m && m.id || '');
  if (!id) return;
  S._aiPrematchPoll = S._aiPrematchPoll || {};
  if (S._aiPrematchPoll[id]) return;
  const ai0 = S.predictCache && S.predictCache[id] && S.predictCache[id].aiPrematch;
  if (!(ai0 && ai0.pending)) return;
  let tries = 0;
  S._aiPrematchPoll[id] = setInterval(async () => {
    tries += 1;
    if (tries > 6) {
      clearInterval(S._aiPrematchPoll[id]);
      delete S._aiPrematchPoll[id];
      return;
    }
    try {
      // Bypass client cache to pick up server bg enrich
      const prev = S.predictCache[id];
      if (S.predictCache) delete S.predictCache[id];
      const j = await loadPredictReport(m);
      if (!j || !j.ok) {
        if (prev) S.predictCache[id] = prev;
        return;
      }
      const ai = j.aiPrematch;
      if (ai && ai.ok && ai.narrativeZh) {
        clearInterval(S._aiPrematchPoll[id]);
        delete S._aiPrematchPoll[id];
        if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'pred') {
          const pane = document.getElementById('detail-pane-' + id);
          if (pane) pane.innerHTML = predTabHtml(m);
        }
      } else if (!(ai && ai.pending)) {
        clearInterval(S._aiPrematchPoll[id]);
        delete S._aiPrematchPoll[id];
      }
    } catch (_) {}
  }, 3500);
}
/** 1.9.97: structured per-signal leans from the report conclusion (no string parsing). */
function prSignalLeans(rep) {
  const c = (rep && rep.sections && rep.sections.conclusion) || {};
  let formLean = c.formLean || null;
  const fs = rep && rep.sections && rep.sections.form;
  if (!formLean && fs && fs.hasData && fs.facts && fs.facts.home && fs.facts.away && fs.facts.home.summary && fs.facts.away.summary) {
    const hs = fs.facts.home.summary, as = fs.facts.away.summary;
    const hp = hs.w * 3 + hs.d, ap = as.w * 3 + as.d;
    formLean = hp - ap >= 4 ? 'h' : ap - hp >= 4 ? 'a' : 'd';
  }
  const ps = rep && rep.sections && rep.sections.process;
  return { formLean, processLean: (ps && ps.hasData && c.processLean) || null };
}
/** 逆盘口爆冷: 表态 pick differs from the odds favourite (same rule as 逆盘命中 / reverse_market). */
function isUpsetPr(pr) {
  return !!(pr && isSpeakPr(pr) && pr.multiFactor && pr.top && pr.marketLean && pr.top !== pr.marketLean);
}
/** 态度一致: 表态 pick = 竞彩盘口 = 近况 = 近期过程 (all present). */
function isAllAgreePr(pr) {
  if (!pr || !isSpeakPr(pr) || !pr.multiFactor || !pr.top) return false;
  // 1.9.98: server decides on independent families (盘面 / 状态 / 临场 / 背景), no odds+form double count
  if (pr.allAgree !== undefined) return !!pr.allAgree;
  return pr.marketLean === pr.top && pr.formLean === pr.top && pr.processLean === pr.top;
}
function hasValueEdge(pr) { return !!(pr && pr.value && pr.value.hasEdge && pr.value.best); }
function edgeScore(pr) { return hasValueEdge(pr) ? (pr.value.best.edge || 0) : -1; }
/** 1.9.100: 优势关注(需临场/变盘) > 态度一致 > 其余；爆冷仅徽标、不再靠前。 */
function prTier(pr) {
  if (hasValueEdge(pr)) return 0;
  if (isAllAgreePr(pr)) return 1;
  return 2;
}
function prCompare(a, b) {
  const ta = prTier(a.pr), tb = prTier(b.pr);
  if (ta !== tb) return ta - tb;
  if (ta === 0) return edgeScore(b.pr) - edgeScore(a.pr);
  const as = isSpeakPr(a.pr) ? 1 : 0, bs = isSpeakPr(b.pr) ? 1 : 0;
  if (bs !== as) return bs - as;
  return b.pr.conf - a.pr.conf;
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
      ...prSignalLeans(rep),
      engineRev: rep.engineRev || 0,
      allAgree: rep.engineRev >= 198 ? !!pr.allAgree : undefined,
      calib: pr.calib || null,
      upset: pr.upset || null,
      value: pr.value || null,
      chips: pr.chips || [],
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
    try { persistPredictCache(); } catch (_) {}
    const r = route();
    if (r.name === 'predict' || r.name === 'home') {
      render();
      if (r.name === 'home') {
        try { persistHomeSnap(document.getElementById('view')); } catch (_) {}
        refreshHomeMidFeed();
      }
    }
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
      if (j && j.leanFeedback) rememberLeanFeedback(id, j.leanFeedback);
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
/** Insert 本场球员 after 本场对位 / before 主因解读 (fallback: before 预测对照 / disclaimer). */
function splicePlayersIntoReviewHtml(html, playersHtml) {
  if (!playersHtml || !html) return html || '';
  const markers = [
    /(<div class="pmr-sec pmr-main")/,
    /(<div class="pmr-sec"[^>]*>\s*<h4>主因解读<\/h4>)/,
    /(<div class="pmr-sec"[^>]*>\s*<h4>赛前预测对照<\/h4>)/,
    /(<p class="note">免责声明)/,
  ];
  for (const re of markers) {
    if (re.test(html)) return html.replace(re, playersHtml + '$1');
  }
  return html.replace(/<\/div>\s*$/, playersHtml + '</div>');
}
function reviewTabHtml(x) {
  const id = String(x && x.id || '');
  const rep = S.reviewCache && S.reviewCache[id];
  const playersHtml = fixturePlayersHtml(x);
  let h = '';
  if (!rep || rep._loading) {
    h += `<div class="dsec pmr-loading"><h3>赛后复盘</h3><div class="spinner"></div><p class="note">正在对照赛前过程均值与本场技术统计…</p></div>`;
    if (playersHtml) h += playersHtml;
  } else if (rep.ok && rep.html) {
    h += `<div class="dsec pr-report pmr-report">${splicePlayersIntoReviewHtml(rep.html, playersHtml)}</div>`;
    h += `<div class="pr-src-bar"><span>${rep.hasActualStats ? '含本场技术统计' : '本场统计暂缺'} · 基线 ${esc(rep.baselineSource || '—')}</span>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">刷新复盘</button></div>`;
  } else if (rep.ok && !rep.html) {
    h += `<div class="dsec pmr-loading"><h3>赛后复盘</h3><p class="note">复盘已生成，正在渲染…</p>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">刷新复盘</button></div>`;
    if (playersHtml) h += playersHtml;
  } else {
    h += `<div class="dsec"><h3>赛后复盘</h3><p class="note">${esc(rep.error || rep.noteZh || rep.reason || '复盘暂不可用（生成中或数据暂缺）')}</p>
      <button type="button" class="btn ghost sm" data-act="refreshReview" data-id="${esc(id)}">重试</button></div>`;
    if (playersHtml) h += playersHtml;
  }
  // 1.9.64: 「近期复盘」列表已迁入自有 match_outcomes，用户端不再展示
  h += ``;
  return h;
}
/** 1.9.70: strip internal/meta AI wording from cached report HTML (defense in depth). */
function productizePredictHtml(html) {
  let h = String(html || '');
  if (!h) return h;
  h = h
    .replace(/本程序硬仗记忆\s*[·•]?\s*非千篇一律\s*API/g, '')
    .replace(/硬仗记忆上/g, '硬仗表现上')
    .replace(/硬仗记忆/g, '硬仗表现')
    .replace(/已引用自有球员近场表[^<]*/g, '')
    .replace(/自有球员近场表显示/g, '近几场球员表现显示')
    .replace(/自有球员近场表/g, '近几场球员表现')
    .replace(/全文仅[此次]一句[^<。]*/g, '')
    .replace(/仅此一句[^<。]*/g, '')
    .replace(/<p class="note pr-ai-slice-note">[\s\S]*?<\/p>/g, '')
    .replace(/<p class="note">(?:本地规则|真相源|AI\s*仅作|不含投注建议|分析参考非购彩)[\s\S]*?<\/p>/g,
      '<p class="note">以上为数据分析</p>')
    .replace(/<h4>AI赛前解读\s*<small>[^<]*<\/small><\/h4>/g,
      '<h4>AI赛前解读 <small>数据分析</small></h4>')
    .replace(/综合分析\s*[·•]\s*非购彩建议/g, '综合分析')
    .replace(/仅供赛前理解，非购彩建议/g, '仅供赛前理解')
    .replace(/分析参考非购彩建议/g, '')
    .replace(/本地规则为真相源[^<。]*/g, '')
    .replace(/AI\s*仅作中文解说[^<。]*/g, '')
    // 1.9.98: no data-source labels / 仅供参考 in end-user UI
    .replace(/<p class="pr-brief-meta">数据来源：[\s\S]*?<\/p>/g, '')
    .replace(/<small>第三方明细<\/small>/g, '')
    .replace(/第三方公开数据，/g, '公开数据')
    .replace(/[，,·\s]*仅供(?:赛事理解)?参考[。.]?/g, '')
    .replace(/<p class="note">以上为数据分析<\/p>/g, '');
  return h;
}

function predTabHtml(m) {
  if (!m || m.full) {
    return `<div class="dsec reason"><h3>预测分析</h3><p class="note">比赛已完场，预测分析仅适用于未开赛场次。</p></div>`;
  }
  const rep = S.predictCache && S.predictCache[String(m.id)];
  const pr = effectivePredict(m);
  let h = '';
  // 1.9.127: slim cache (ok, no html) → still loading, not 「未知」
  if (!rep || (rep.ok && !rep.html)) {
    h += `<div class="dsec reason"><h3>赛前情报简报</h3><div class="spinner"></div><p class="note">正在汇总战绩、过程数据、交锋、积分、伤停（若有）与赔率参考…</p></div>`;
  } else if (predictReportFull(rep)) {
    h += signalPanelHtml(rep);
    h += `<div class="dsec reason pr-report">${productizePredictHtml(rep.html)}</div>`;
    h += `<div class="pr-src-bar"><span>更新于 ${esc(rep.generatedAtLocal || '')}</span>
      <button type="button" class="btn ghost sm" data-act="refreshPredict" data-id="${esc(m.id)}">刷新报告</button></div>`;
  } else {
    h += `<div class="dsec reason"><h3>赛前情报简报</h3><p class="note">综合报告暂不可用（${esc(rep.error || rep.reason || '加载失败')}），先展示赔率参考层。</p>${reasoningOddsFallback(m).join('')}</div>`;
  }
  h += `<div class="dsec kb-match-entry">
    <h3>个人知识库预测</h3>
    <p class="note" style="margin:0 0 10px">与上方「平台赛前简报」分开：仅在你主动选择知识条目后，按你的笔记调整参考概率。</p>
    <button type="button" class="btn pri block" data-go="${loggedIn() ? ('#/kb/predict/' + encodeURIComponent(String(m.id))) : '#/login'}">用我的知识库预测</button>
  </div>`;
  return h;
}
function intelFmtTs(iso) {
  if (!iso) {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 16);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}
function intelInjSide(items, x) {
  const home = [], away = [], other = [];
  const hid = x && x.homeTeamId != null ? String(x.homeTeamId) : '';
  const aid = x && x.awayTeamId != null ? String(x.awayTeamId) : '';
  const hNames = [x && x.home, x && x.homeEn].filter(Boolean).map(s => String(s).toLowerCase());
  const aNames = [x && x.away, x && x.awayEn].filter(Boolean).map(s => String(s).toLowerCase());
  for (const it of items || []) {
    const tid = it.teamId != null ? String(it.teamId) : '';
    const tlab = String(it.teamZh || it.team || '').toLowerCase();
    if (hid && tid === hid) home.push(it);
    else if (aid && tid === aid) away.push(it);
    else if (tlab && hNames.some(n => tlab.includes(n) || n.includes(tlab))) home.push(it);
    else if (tlab && aNames.some(n => tlab.includes(n) || n.includes(tlab))) away.push(it);
    else other.push(it);
  }
  return { home, away, other };
}
function intelPlayerLab(it) {
  const nm = (it.playerZh && it.playerZh !== it.player) ? it.playerZh : (it.player || '?');
  const rz = it.reasonZh || it.reason || it.type || '';
  return rz ? `${nm}（${rz}）` : nm;
}
function intelScoopCard({ title, badge, badgeCls, time, headline, body }) {
  return `<div class="intel-scoop">
    <div class="intel-scoop-hd"><i class="intel-bar"></i><h3>${esc(title)}</h3></div>
    <div class="intel-scoop-meta">
      ${badge ? `<span class="intel-badge ${badgeCls || ''}">${esc(badge)}</span>` : ''}
      ${time ? `<span class="intel-time">${esc(time)}</span>` : ''}
    </div>
    ${headline ? `<div class="intel-headline">“${esc(headline)}”</div>` : ''}
    ${body ? `<div class="intel-body">${body}</div>` : ''}
  </div>`;
}
function intelBuildScoops(x, m, stats, rep) {
  const cards = [];
  const ts = intelFmtTs(rep && (rep.generatedAt || rep.generatedAtLocal));
  const inj = rep && rep.sections && rep.sections.injuries;
  const items = (inj && Array.isArray(inj.items)) ? inj.items : [];
  const { home, away } = intelInjSide(items, x);
  const mkInjCard = (side, list) => {
    if (!list.length) return;
    const team = side === 'home' ? (x.home || '主队') : (x.away || '客队');
    const badge = side === 'home' ? '主队独家爆料' : '客队独家爆料';
    const labs = list.slice(0, 8).map(intelPlayerLab);
    const headline = list.length >= 2
      ? `遭遇重创！${team}多达 ${list.length} 人伤停/停赛！`
      : `${team}关键球员缺阵：${labs[0]}`;
    const body = `<p>${esc(team)}本场公开伤停/停赛名单（第三方，可能不全或滞后；临场以官方为准）：</p><p>${esc(labs.join('、'))}${list.length > 8 ? ' 等' : ''}。</p>`;
    cards.push(intelScoopCard({
      title: '绝密情报', badge, badgeCls: side === 'home' ? 'home' : 'away', time: ts, headline, body,
    }));
  };
  // Prefer the side with more injuries first (澳客 feel: lead with the bigger scoop)
  if (home.length >= away.length) { mkInjCard('home', home); mkInjCard('away', away); }
  else { mkInjCard('away', away); mkInjCard('home', home); }

  if (!cards.length && inj && inj.hasData && inj.text) {
    cards.push(intelScoopCard({
      title: '绝密情报',
      badge: '阵容情报',
      badgeCls: 'neutral',
      time: ts,
      headline: inj.available === false ? '伤停来源暂不可用' : '本场伤停情报速览',
      body: `<p>${esc(inj.text)}</p>`,
    }));
  }

  // Fallback scoop from market / conclusion when no injury scoop
  if (!cards.length) {
    const concl = rep && rep.sections && rep.sections.conclusion;
    const market = rep && rep.sections && rep.sections.market;
    const bullets = m ? intelBullets(m, stats) : [];
    let headline = '';
    let body = '';
    if (concl && concl.pickText) {
      headline = `市场与多维信号参考「${concl.pickText}」`;
      body = `<p>${esc(concl.text || market && market.text || bullets[0] || '综合情报推导中。')}</p>`;
    } else if (market && market.text) {
      headline = (market.pick && market.pick.pool === 'hhad') || (market.hadMissing) || /胜平负未开售/.test(market.text)
        ? '让球对照速览'
        : '赔率隐含概率速览';
      body = `<p>${esc(market.text)}</p>`;
    } else if (bullets.length) {
      headline = '综合情报摘要';
      body = `<p>${bullets[0].replace(/<[^>]+>/g, '')}</p>`;
    } else {
      headline = '情报汇总中';
      body = '<p class="note">暂无第三方伤停条目；下方交锋/战绩与赔率推导仍可参考。</p>';
    }
    cards.push(intelScoopCard({
      title: '绝密情报', badge: '综合情报', badgeCls: 'neutral', time: ts, headline, body,
    }));
  }
  return cards.join('');
}
function intelBuildSelected(x, m, stats, rep) {
  const bits = [];
  const sec = rep && rep.sections;
  if (sec && sec.postMatchIntel && sec.postMatchIntel.hasData && sec.postMatchIntel.bullets && sec.postMatchIntel.bullets.length) {
    for (const b of sec.postMatchIntel.bullets.slice(0, 3)) bits.push(String(b));
  }
  if (sec && sec.playerIntel && sec.playerIntel.hasData && sec.playerIntel.bullets && sec.playerIntel.bullets.length) {
    for (const b of sec.playerIntel.bullets.slice(0, 2)) bits.push(String(b));
  }
  if (sec && sec.form && sec.form.text) bits.push(sec.form.text);
  if (sec && sec.h2h && sec.h2h.text) bits.push(sec.h2h.text);
  if (sec && sec.schedule && sec.schedule.text) bits.push(sec.schedule.text);
  if (!bits.length) {
    const bullets = m ? intelBullets(m, stats) : [];
    for (const b of bullets.slice(0, 4)) bits.push(String(b).replace(/<[^>]+>/g, ''));
  }
  if (!bits.length) {
    return intelScoopCard({
      title: '精选情报',
      time: intelFmtTs(rep && rep.generatedAt),
      headline: '精选情报待更新',
      body: '<p class="note">战绩/交锋/日程加载后将在此展示精选要点。</p>',
    });
  }
  const scrubBit = (s) => {
    let t = String(s || '');
    for (const [en, zh] of Object.entries(FORCE_TEAM_ZH)) {
      if (t.includes(en)) t = t.split(en).join(zh);
    }
    for (const [en, zh] of Object.entries(FORCE_LEAGUE_ZH)) {
      if (t.includes(en)) t = t.split(en).join(zh);
    }
    return t;
  };
  const bitsZh = bits.map(scrubBit);
  const headline = bitsZh[0].length > 42 ? bitsZh[0].slice(0, 42) + '…' : bitsZh[0];
  const body = `<ul class="intel-sel-list">${bitsZh.slice(0, 6).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <p class="note" style="margin:8px 0 0">以上为公开数据与历史赛果推导。</p>`;
  return intelScoopCard({
    title: '精选情报',
    badge: '精选',
    badgeCls: 'pick',
    time: intelFmtTs(rep && rep.generatedAt),
    headline,
    body,
  });
}
function intelQuickLinks(x) {
  const mid = esc(String(x && x.id || ''));
  return `<div class="intel-hub" aria-label="数据快捷入口">
    <div class="intel-qlinks">
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="h2h"><span>历史交锋</span><i>›</i></button>
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="form"><span>主队战绩</span><i>›</i></button>
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="form-away"><span>客队战绩</span><i>›</i></button>
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="future"><span>未来比赛</span><i>›</i></button>
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="standings"><span>积分排名</span><i>›</i></button>
      <button type="button" data-act="intelJump" data-id="${mid}" data-jump="rules"><span>赛事规则</span><i>›</i></button>
    </div>
  </div>`;
}
function intelTabHtml(x, m, stats) {
  const ui = statsUiOf(x.id);
  const rep = (S.predictCache && S.predictCache[String(x.id)]) || null;
  let h = `<div class="intel-aoke">`;
  h += intelQuickLinks(x);
  if (!rep || !rep.ok) {
    h += `<div class="intel-scoop loading"><div class="intel-scoop-hd"><i class="intel-bar"></i><h3>绝密情报</h3></div><div class="spinner"></div><p class="note">正在汇总伤停/战绩/交锋情报…</p></div>`;
  } else {
    h += intelBuildScoops(x, m, stats, rep);
  }
  h += intelBuildSelected(x, m, stats, rep && rep.ok ? rep : null);
  h += `</div>`;
  // Secondary analysis (kept for depth; 澳客 ref is scoop-first)
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

function eventGoalKind(e) {
  if (e && e.goalKind) return e.goalKind;
  const d = String((e && e.detail) || '');
  if (/own\s*goal/i.test(d) || /乌龙/.test(d)) return 'own';
  if (/missed\s*penalty/i.test(d)) return 'missed_pen';
  if (/penalty/i.test(d) || /点球/.test(d)) return 'pen';
  return 'goal';
}
function eventIconHtml(e) {
  const kind = e.kind || 'other';
  if (kind === 'goal') {
    const gk = eventGoalKind(e);
    if (gk === 'own') return '<span class="ev-ico own" title="乌龙"><span class="ev-ball">⚽</span><b>OG</b></span>';
    if (gk === 'pen') return '<span class="ev-ico pen" title="点球"><span class="ev-ball">⚽</span><b>P</b></span>';
    if (gk === 'missed_pen') return '<span class="ev-ico missed" title="点球未进">○</span>';
    return '<span class="ev-ico goal" title="进球"><span class="ev-ball">⚽</span></span>';
  }
  if (kind === 'yellow') return '<span class="ev-ico yellow" title="黄牌"></span>';
  if (kind === 'red') return '<span class="ev-ico red" title="红牌"></span>';
  if (kind === 'subst') return '<span class="ev-ico subst" title="换人"><b class="up">↑</b><b class="dn">↓</b></span>';
  if (kind === 'var') return '<span class="ev-ico var" title="VAR">VAR</span>';
  return '<span class="ev-ico other">•</span>';
}
function eventMinuteLab(e) {
  if (e.elapsed == null || e.elapsed === '') return '';
  const extra = e.extra != null && e.extra !== '' ? '+' + e.extra : '';
  return e.elapsed + extra + "'";
}
function eventPlayerLab(e) {
  const nm = e.playerZh || e.player || '';
  const as = e.assistZh || e.assist || '';
  return { player: nm, assist: as, auto: !!(e.playerZhAuto) };
}
/** Consumer copy for /api/live-stats failures — never show raw English (`fetch failed`). */
function liveStatsUserMsg(live) {
  if (!live) return '加载中…';
  const reason = String(live.reason || '');
  if (reason === 'no_fixture') return '事件数据更新中';
  if (reason === 'no_key') return '实时数据更新中';
  const pick = [live.error, live.detail, live.eventsError].map(s => String(s || '').trim()).find(Boolean) || '';
  if (pick && /[\u4e00-\u9fff]/.test(pick)) return pick;
  if (pick && /^[\x00-\x7F]+$/.test(pick)) {
    if (reason === 'upstream' || reason === 'error') return '实时数据暂时不可用，请稍后重试';
    return '暂时不可用';
  }
  if (reason === 'upstream' || reason === 'error') return '实时数据暂时不可用，请稍后重试';
  return pick || '暂时不可用';
}
function eventsTabHtml(x, live) {
  const wrapId = 'events-tree-' + esc(x.id);
  const chatBelow = () => `<div class="match-chat-anchor" id="match-chat-anchor-${esc(x.id)}"></div>${aiChatPanelHtml(x)}${chatPanelHtml(x)}`;
  if (!live) {
    return `<div class="events-chat-stack"><div class="ev-tree-wrap" id="${wrapId}"><div class="spinner"></div><p class="note" style="text-align:center">加载比赛事件…</p></div>${chatBelow()}</div>`;
  }
  if (!live.ok) {
    const why = liveStatsUserMsg(live);
    const recovering = liveStatsFailRetryable(live) && matchExpectsLiveStats(x)
      && (Date.now() - (live._at || 0) < 180000);
    if (recovering) {
      return `<div class="events-chat-stack"><div class="ev-tree-wrap" id="${wrapId}"><div class="spinner"></div><p class="note" style="text-align:center">连接实时数据中…</p></div>${chatBelow()}</div>`;
    }
    return `<div class="events-chat-stack"><div class="ev-tree-wrap" id="${wrapId}"><div class="ana-card"><p class="note">${esc(why)}</p></div></div>${chatBelow()}</div>`;
  }
  const raw = (live.events || []).slice();
  // chronological ascending for tree (kickoff → FT)
  raw.sort((a, b) => {
    const ae = (a.elapsed == null ? 999 : Number(a.elapsed)) + (a.extra ? Number(a.extra) / 100 : 0);
    const be = (b.elapsed == null ? 999 : Number(b.elapsed)) + (b.extra ? Number(b.extra) / 100 : 0);
    return ae - be;
  });
  let sh = 0, sa = 0;
  const rows = [];
  for (const e of raw) {
    const side = e.side === 'away' ? 'away' : (e.side === 'home' ? 'home' : 'mid');
    const min = eventMinuteLab(e);
    const { player, assist, auto } = eventPlayerLab(e);
    let scoreBit = '';
    let main = esc(player || e.detail || e.type || '');
    let sub = '';
    if (e.kind === 'goal') {
      const gk = eventGoalKind(e);
      if (gk !== 'missed_pen') {
        if (side === 'home') sh += 1;
        else if (side === 'away') sa += 1;
        // own goal still credited to scoring side in AF (the benefiting team)
        scoreBit = `<b class="ev-score num">${sh}-${sa}</b>`;
      }
      if (gk === 'pen') sub = '点球';
      else if (gk === 'own') sub = '乌龙';
      else if (gk === 'missed_pen') sub = '点球未进';
      if (assist) sub = (sub ? sub + ' · ' : '') + '助攻 ' + assist;
    } else if (e.kind === 'subst') {
      // API-Football: player = on, assist = off
      const on = player;
      const off = assist;
      main = '';
      sub = '';
      if (on || off) {
        main = (on ? `<span class="ev-sub-on"><i>↑</i>${esc(on)}</span>` : '')
          + (off ? `<span class="ev-sub-off"><i>↓</i>${esc(off)}</span>` : '');
      } else {
        main = esc(e.detail || '换人');
      }
    } else if (e.kind === 'yellow') {
      sub = e.detail && !/yellow/i.test(e.detail) ? e.detail : '黄牌';
    } else if (e.kind === 'red') {
      sub = e.detail && !/red/i.test(e.detail) ? e.detail : '红牌';
    } else if (e.kind === 'var') {
      sub = e.detail || 'VAR';
    }
    const cardInner = `${eventIconHtml(e)}${scoreBit ? scoreBit : ''}
      <div class="ev-txt">${main}${auto ? yiMark(true) : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    rows.push(`<div class="ev-row ${side}">
      <div class="ev-side home">${side === 'home' ? `<div class="ev-card">${cardInner}</div>` : ''}</div>
      <div class="ev-axis"><span class="ev-min">${esc(min || '·')}</span></div>
      <div class="ev-side away">${side === 'away' ? `<div class="ev-card">${cardInner}</div>` : (side === 'mid' ? `<div class="ev-card mid">${cardInner}</div>` : '')}</div>
    </div>`);
  }
  const finished = isMatchFinished(x) || (live.status && /^(FT|AET|PEN)$/.test(String(live.status.short || '')));
  const eventsGap = liveStatsNeedsEventsRetry(live, x);
  const gapHint = eventsGap && rows.length
    ? `<p class="note ev-gap-hint" style="text-align:center;margin:8px 12px 0">进球事件同步中…</p>`
    : '';
  const empty = !rows.length
    ? (eventsGap
      ? `<div class="ev-empty"><div class="spinner"></div><p class="note" style="text-align:center">事件加载中…</p></div>`
      : `<div class="ev-empty"><p class="note">暂无事件记录（未开赛、无数据源或尚未产生进球/牌/换人）。</p></div>`)
    : '';
  const legend = `<div class="ev-legend">
    <span><i class="ev-ico goal"><span class="ev-ball">⚽</span></i>进球</span>
    <span><i class="ev-ico pen"><span class="ev-ball">⚽</span><b>P</b></i>点球</span>
    <span><i class="ev-ico own"><span class="ev-ball">⚽</span><b>OG</b></i>乌龙</span>
    <span><i class="ev-ico red"></i>红牌</span>
    <span><i class="ev-ico yellow"></i>黄牌</span>
    <span><i class="ev-ico subst"><b class="dn">↓</b></i>换下</span>
    <span><i class="ev-ico subst"><b class="up">↑</b></i>换上</span>
  </div>`;
  const tree = `<div class="ev-tree-wrap" id="${wrapId}">
    <div class="ev-tree">
      <div class="ev-rail"></div>
      ${empty || rows.join('')}
      <div class="ev-end"><span class="ev-whistle" title="${finished ? '完场' : '进行中'}">${finished ? '终' : '…'}</span></div>
    </div>
    ${gapHint}
    ${legend}
    <p class="note" style="margin:8px 12px 0">${esc(live.noteZh || '事件可能存在短暂延迟。')}${eventsGap && finished && !live.live ? ' 部分进球事件暂未从数据源同步，请以头部比分为准。' : ''}${live.live ? ' · 比赛进行中将自动刷新' : ''}</p>
  </div>`;
  return `<div class="events-chat-stack">${tree}${chatBelow()}</div>`;
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
    const why = liveStatsUserMsg(live);
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
    <p class="note" style="margin:8px 0 0">${esc(live.noteZh || '数据可能存在短暂延迟；事件动画为示意。')}${live.live ? ' · 比赛进行中将自动刷新' : ''}</p>
  </div>`;
}
function stopLivePoll() {
  if (S.livePoll) { clearInterval(S.livePoll); S.livePoll = null; }
}

/** 1.9.101: detail/events score is authoritative — push into list liveScores so cards match. */
function syncLiveScoreFromStats(matchId, live) {
  if (!matchId || !live || !live.ok || !live.score || live.score.home == null) return false;
  const id = String(matchId);
  S.liveScores = S.liveScores || {};
  const prev = S.liveScores[id] || { id };
  const nh = Number(live.score.home), na = Number(live.score.away);
  if (prev.homeScore === nh && prev.awayScore === na && prev.scoreSource === 'detail') return false;
  const st = live.status || {};
  const mapZh = { '1H': '上半场', HT: '中场', '2H': '下半场', ET: '加时', BT: '加时休息', P: '点球', LIVE: '进行中', FT: '完场' };
  const short = st.short || '';
  S.liveScores[id] = {
    ...prev,
    id,
    homeScore: nh,
    awayScore: na,
    full: nh + ':' + na,
    live: !!live.live,
    finished: !live.live && (short === 'FT' || short === 'AET' || short === 'PEN' || !!live.finished
      || (!live.live && live.score && live.score.home != null && /^(FT|AET|PEN)$/i.test(short))),
    phase: short || prev.phase,
    phaseZh: mapZh[short] || prev.phaseZh || (live.live ? '进行中' : prev.phaseZh),
    minute: st.elapsed != null ? Number(st.elapsed) : prev.minute,
    minuteExtra: st.extra != null ? Number(st.extra) : prev.minuteExtra,
    source: (prev.source ? prev.source + '+' : '') + 'detail',
    scoreSource: 'detail',
  };
  notifyFavGoalsFromScores({ [id]: prev }, { [id]: S.liveScores[id] });
  return true;
}
function appColdLiveStatsSession() {
  try {
    if (!IS_APP) return false;
    return !localStorage.getItem('jc_live_stats_warm_v1');
  } catch (_) { return false; }
}
function markLiveStatsWarmed() {
  try { localStorage.setItem('jc_live_stats_warm_v1', '1'); } catch (_) {}
}
/** Match header / list already shows score or kickoff — events should not stick on error card. */
function matchExpectsLiveStats(x) {
  if (!x) return false;
  if (isMatchFinished(x)) return true;
  const ko = matchKickoffMs(x);
  if (Number.isFinite(ko) && Date.now() >= ko - 90e3) return true;
  const id = String(x.id || '');
  const ls = S.liveScores && S.liveScores[id];
  if (ls && (ls.homeScore != null || ls.awayScore != null || ls.live || ls.finished)) return true;
  if (x.homeScore != null || x.awayScore != null) return true;
  const sc = String(x.score || x.full || x.half || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
  return !!(sc && Number(sc[1]) + Number(sc[2]) >= 0);
}
function liveStatsFailRetryable(live) {
  if (!live || live.ok) return false;
  const r = String(live.reason || '');
  return r === 'error' || r === 'upstream' || r === 'no_fixture';
}
function liveStatsNeedsRecover(live, x) {
  if (!live) return false;
  if (liveStatsFailRetryable(live) && matchExpectsLiveStats(x)) return true;
  return liveStatsNeedsEventsRetry(live, x);
}
async function waitForLiveStatsNetworkReady() {
  try {
    await Promise.race([
      (window.__partnerGateReady || Promise.resolve(true)),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
  } catch (_) {}
  if (appColdLiveStatsSession()) {
    await new Promise((r) => setTimeout(r, 450));
  }
}
function liveStatsGoalCountFromEvents(events) {
  let h = 0, a = 0;
  for (const e of events || []) {
    if (e.kind !== 'goal') continue;
    const gk = e.goalKind || eventGoalKind(e);
    if (gk === 'missed_pen') continue;
    if (/Disallowed|Cancelled|Canceled/i.test(String(e.detail || ''))) continue;
    if (gk === 'own') {
      if (e.side === 'home') a++;
      else if (e.side === 'away') h++;
    } else {
      if (e.side === 'home') h++;
      else if (e.side === 'away') a++;
    }
  }
  return { home: h, away: a };
}
function liveStatsEventsBehindScore(live, x) {
  if (!live || !live.ok) return false;
  let curH = live.score && live.score.home != null ? Number(live.score.home) : null;
  let curA = live.score && live.score.away != null ? Number(live.score.away) : null;
  if ((curH == null || curA == null) && x) {
    curH = x.homeScore != null ? Number(x.homeScore) : (x.homeGoals != null ? Number(x.homeGoals) : curH);
    curA = x.awayScore != null ? Number(x.awayScore) : (x.awayGoals != null ? Number(x.awayGoals) : curA);
    if (curH == null || curA == null) {
      const sc = String(x.score || x.full || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
      if (sc) { curH = Number(sc[1]); curA = Number(sc[2]); }
    }
  }
  if (curH == null || curA == null) return false;
  if (curH + curA <= 0) return false;
  const ev = liveStatsGoalCountFromEvents(live.events || []);
  return ev.home + ev.away < curH + curA;
}
function liveStatsNeedsEventsRetry(live, x) {
  if (!live || !live.ok) return false;
  if (live.eventsError) return true;
  if (live.eventsScoreGap) return true;
  if ((live.events || []).length) return liveStatsEventsBehindScore(live, x);
  const h = live.score && live.score.home != null ? Number(live.score.home) : null;
  const a = live.score && live.score.away != null ? Number(live.score.away) : null;
  if (h != null && a != null && h + a > 0) return true;
  if (x) {
    const mh = x.homeScore != null ? Number(x.homeScore) : (x.homeGoals != null ? Number(x.homeGoals) : null);
    const ma = x.awayScore != null ? Number(x.awayScore) : (x.awayGoals != null ? Number(x.awayGoals) : null);
    if (mh != null && ma != null && mh + ma > 0) return true;
    const sc = String(x.score || x.full || '').match(/(\d+)\s*[:：\-]\s*(\d+)/);
    if (sc && Number(sc[1]) + Number(sc[2]) > 0) return true;
  }
  // 1.9.243: a successful live payload with empty events and no score gap is a
  // legit empty state (e.g. live 0-0, no cards/subs yet) — show 暂无事件 instead
  // of a perpetual spinner. Background polling still refreshes live matches.
  return false;
}
function patchEventsTabIfVisible(x) {
  if (!x) return;
  const id = String(x.id || '');
  if (route().name !== 'match' || String(route().arg) !== id) return;
  if (detailTabOf(id) !== 'events') return;
  const live = (S.liveStatsCache && S.liveStatsCache[id]) || null;
  const pane = document.getElementById('detail-pane-' + id);
  if (!pane) return;
  const wrap = document.getElementById('events-tree-' + id);
  const tmp = document.createElement('div');
  tmp.innerHTML = eventsTabHtml(x, live);
  const nextTree = tmp.querySelector('.ev-tree-wrap');
  if (wrap && nextTree) wrap.replaceWith(nextTree);
  else pane.innerHTML = tmp.innerHTML;
  try { ensureChatPoll(x); renderAiChatList(id); } catch (_) {}
}
function scheduleLiveStatsRecover(x, key) {
  if (!x || !key) return;
  S._liveEvRetry = S._liveEvRetry || {};
  const st = S._liveEvRetry[key];
  if (st && st.timer) return;
  const n = (st && st.n) || 0;
  if (n >= 16) return;
  const cold = appColdLiveStatsSession();
  const delay = cold && n < 5
    ? [500, 1000, 1800, 3000, 5000][n]
    : Math.min(45000, 2000 + n * 2500);
  const timer = setTimeout(async () => {
    S._liveEvRetry[key] = { n: n + 1, timer: null };
    if (route().name !== 'match' || String(route().arg) !== String(x.id)) return;
    try { await loadLiveStats(x, { force: true }); } catch (_) {}
    const live = S.liveStatsCache && S.liveStatsCache[key];
    patchEventsTabIfVisible(x);
    if (detailTabOf(x.id) === 'data') renderLivePitch(x);
    if (liveStatsNeedsRecover(live, x)) scheduleLiveStatsRecover(x, key);
  }, delay);
  S._liveEvRetry[key] = { n, timer };
}
async function loadLiveStats(x, { force } = {}) {
  if (!x) return null;
  const key = String(x.id || '') || (String(x.homeTeamId || '') + '|' + String(x.awayTeamId || ''));
  S.liveStatsCache = S.liveStatsCache || {};
  const prev = S.liveStatsCache[key];
  const prevGap = prev && liveStatsNeedsRecover(prev, x);
  if (!force && !prevGap && prev && prev.ok && prev._at && Date.now() - prev._at < 20000) return prev;
  try {
    if (!force && appColdLiveStatsSession() && matchExpectsLiveStats(x)) {
      await waitForLiveStatsNetworkReady();
    }
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
    if (j && j.ok) markLiveStatsWarmed();
    if (liveStatsNeedsRecover(j, x)) scheduleLiveStatsRecover(x, key);
    else if (S._liveEvRetry && S._liveEvRetry[key] && S._liveEvRetry[key].timer) {
      try { clearTimeout(S._liveEvRetry[key].timer); } catch (_) {}
      delete S._liveEvRetry[key];
    }
    if (syncLiveScoreFromStats(x.id, j)) {
      // Refresh list cards / hero if visible
      try {
        const hero = document.getElementById('match-hero-' + key);
        if (hero && route().name === 'match' && String(route().arg) === key) {
          const m = (S.matches || []).find(z => String(z.id) === key) || x;
          const r = (S.results || []).find(z => String(z.id) === key);
          hero.outerHTML = matchHero(m || x, m, r, { favBtn: matchFavBtn(m || x) });
        }
        if (route().name === 'schedule') render();
        else if (route().name === 'home') { patchHomeFocusStrip(); if (!softPatchLiveScoreCards()) render(); }
      } catch (_) {}
    }
    return j;
  } catch (e) {
    const fail = { ok: false, reason: 'error', error: liveStatsUserMsg({ reason: 'error', error: e.message }), _at: Date.now() };
    S.liveStatsCache[key] = fail;
    if (matchExpectsLiveStats(x)) scheduleLiveStatsRecover(x, key);
    return fail;
  }
}
function renderLivePitch(x) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  const tab = detailTabOf(x.id);
  const compact = false; // 1.9.107: chat under events; no compact pitch
  const box = document.getElementById((compact ? 'live-pitch-chat-' : 'live-pitch-') + x.id);
  if (!box) return;
  box.outerHTML = livePitchHtml(x, live || { ok: false, reason: 'error', error: '暂无数据' }, { compact });
}
function ensureLivePoll(x) {
  stopLivePoll();
  const key = String(x.id || '');
  const live = S.liveStatsCache && S.liveStatsCache[key];
  if (!live) return;
  const retrying = liveStatsFailRetryable(live);
  const eventsGap = live.ok && liveStatsNeedsEventsRetry(live, x);
  if (!retrying && !eventsGap && (!live.ok || !live.live)) return;
  let tries = 0;
  const pollMs = (retrying || eventsGap) ? 12000 : 45000;
  const tick = async () => {
    if (++tries > 12 && !(S.liveStatsCache[key] && S.liveStatsCache[key].ok)) return stopLivePoll();
    if (document.hidden) return;
    if (route().name !== 'match' || String(route().arg) !== String(x.id)) return stopLivePoll();
    const tabNow = detailTabOf(x.id);
    if (tabNow !== 'data' && tabNow !== 'events') return stopLivePoll();
    const hadReview = detailTabsFor(x).some(t => t[0] === 'review');
    await loadLiveStats(x, { force: true });
    if (route().name === 'match' && String(route().arg) === String(x.id) && (detailTabOf(x.id) === 'data' || detailTabOf(x.id) === 'events')) {
      if (detailTabOf(x.id) === 'events') patchEventsTabIfVisible(x);
      else renderLivePitch(x);
      if (!hadReview && detailTabsFor(x).some(t => t[0] === 'review')) refreshDetailTabs(x);
      const again = S.liveStatsCache[key];
      if (again && again.ok && !again.live && !liveStatsNeedsEventsRetry(again, x)) stopLivePoll();
    }
  };
  setTimeout(tick, retrying ? 600 : 0);
  S.livePoll = setInterval(tick, pollMs);
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
    <p class="note chat-note">球迷交流</p>
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
    if (route().name !== 'match' || String(route().arg) !== id || !isEventsTab(id)) return stopChatPoll();
    const prev = S.chatCache && S.chatCache[id];
    const last = prev && prev.messages && prev.messages.length ? prev.messages[prev.messages.length - 1].id : 0;
    await loadChat(id, { afterId: last || undefined });
    if (route().name === 'match' && String(route().arg) === id && isEventsTab(id)) renderChatList(id);
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
              if (isEventsTab(id)) renderChatList(id);
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

function deviceId() {
  try {
    let d = localStorage.getItem('jc_device_id');
    if (!d || !/^[A-Za-z0-9_-]{8,64}$/.test(d)) {
      d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('jc_device_id', d);
    }
    return d;
  } catch { return ''; }
}
function aiChatMsgHtml(m) {
  const mine = m.role === 'user';
  const who = mine ? (S.user && S.user.nickname) || '我' : 'AI 聊球';
  return `<div class="chat-msg ai-chat-msg ${mine ? 'mine' : 'ai'}" data-role="${esc(m.role)}">
    <div class="chat-av ai-av">${mine ? avatarSvg((S.user && S.user.avatar) || 'a1') : '<span class="ai-bot">AI</span>'}</div>
    <div class="chat-bubble"><div class="chat-meta"><b>${esc(who)}</b></div><div class="chat-body">${esc(m.body)}</div></div>
  </div>`;
}
function aiChatPanelHtml(x) {
  const id = String(x.id);
  const pack = (S.aiChatCache && S.aiChatCache[id]) || { messages: [], dailyLeft: null, dailyLimit: null };
  const msgs = pack.messages || [];
  const list = msgs.length
    ? msgs.map(aiChatMsgHtml).join('')
    : '<div class="chat-empty">问问本场过程、球员或复盘要点吧</div>';
  const quota = (pack.dailyLeft != null)
    ? `<small class="ai-quota">今日剩余 ${esc(String(pack.dailyLeft))}/${esc(String(pack.dailyLimit || '—'))}</small>`
    : '<small class="ai-quota">本场 AI · 有次数上限</small>';
  return `<div class="chat-room ai-chat-room" id="ai-chat-room-${esc(id)}">
    <div class="chat-hd"><h3>AI 聊球</h3>${quota}</div>
    <div class="chat-list" id="ai-chat-list-${esc(id)}">${list}</div>
    <form class="chat-compose ai-chat-compose" id="ai-chat-form-${esc(id)}" data-match="${esc(id)}">
      <input name="body" maxlength="200" autocomplete="off" placeholder="只聊本场（最多200字）" />
      <button type="submit" class="btn pri sm">问 AI</button>
    </form>
    <p class="note chat-note">AI 仅基于本场简要上下文作答 · 违规话题会拒绝</p>
  </div>`;
}
function renderAiChatList(matchId) {
  const box = document.getElementById('ai-chat-list-' + matchId);
  if (!box) return;
  const pack = (S.aiChatCache && S.aiChatCache[matchId]) || { messages: [] };
  const msgs = pack.messages || [];
  box.innerHTML = msgs.length ? msgs.map(aiChatMsgHtml).join('') : '<div class="chat-empty">问问本场过程、球员或复盘要点吧</div>';
  box.scrollTop = box.scrollHeight;
  const room = document.getElementById('ai-chat-room-' + matchId);
  if (room && pack.dailyLeft != null) {
    const q = room.querySelector('.ai-quota');
    if (q) q.textContent = '今日剩余 ' + pack.dailyLeft + '/' + (pack.dailyLimit || '—');
  }
}
async function loadAiChatQuota(matchId) {
  S.aiChatCache = S.aiChatCache || {};
  try {
    const j = await api('/ai-match-chat/quota?matchId=' + encodeURIComponent(matchId), {
      timeout: 8000,
      headers: deviceId() ? { 'X-Device-Id': deviceId() } : {},
    });
    const pack = S.aiChatCache[matchId] || { messages: [] };
    pack.dailyLeft = j.dailyLeft;
    pack.dailyLimit = j.dailyLimit;
    pack.member = j.member;
    S.aiChatCache[matchId] = pack;
    return pack;
  } catch { return S.aiChatCache[matchId]; }
}
async function loadAiChatHistory(matchId) {
  S.aiChatCache = S.aiChatCache || {};
  try {
    const j = await api('/ai-match-chat/history?matchId=' + encodeURIComponent(matchId), {
      timeout: 10000,
      headers: deviceId() ? { 'X-Device-Id': deviceId() } : {},
    });
    const pack = S.aiChatCache[matchId] || { messages: [] };
    if (Array.isArray(j.messages) && j.messages.length) {
      pack.messages = j.messages.map(m => ({ role: m.role, body: m.body, at: m.at }));
    }
    S.aiChatCache[matchId] = pack;
    return pack;
  } catch { return S.aiChatCache[matchId]; }
}
async function sendAiChat(matchId, body) {
  S.aiChatCache = S.aiChatCache || {};
  const pack = S.aiChatCache[matchId] || { messages: [] };
  pack.messages = pack.messages || [];
  pack.messages.push({ role: 'user', body });
  while (pack.messages.length > 24) pack.messages.shift();
  S.aiChatCache[matchId] = pack;
  renderAiChatList(matchId);
  const hist = pack.messages.slice(0, -1).slice(-8).map(m => ({ role: m.role, body: m.body }));
  const headers = {};
  if (deviceId()) headers['X-Device-Id'] = deviceId();
  try {
    const j = await api('/ai-match-chat', {
      method: 'POST',
      body: { matchId, message: body, history: hist, deviceId: deviceId() || undefined },
      timeout: 35000,
      headers,
    });
    pack.messages.push({ role: 'assistant', body: j.reply || '（无回复）' });
    if (j.dailyLeft != null) pack.dailyLeft = j.dailyLeft;
    if (j.dailyLimit != null) pack.dailyLimit = j.dailyLimit;
    while (pack.messages.length > 24) pack.messages.shift();
    S.aiChatCache[matchId] = pack;
    renderAiChatList(matchId);
    return j;
  } catch (er) {
    pack.messages.push({ role: 'assistant', body: (er && er.message) || '发送失败' });
    while (pack.messages.length > 24) pack.messages.shift();
    S.aiChatCache[matchId] = pack;
    renderAiChatList(matchId);
    throw er;
  }
}

function chatTabHtml(x, m) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  let h = livePitchHtml(x, live, { compact: true });
  h += aiChatPanelHtml(x);
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

  // 1.9.58: block lives on 赛后复盘 — skip pre-match empty clutter
  if (!finished && !(pack && pack.ok)) {
    return '';
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
  h += `<p class="note" style="margin:10px 12px 0">${esc(pack.noteZh || '球员评分')}${pack.cached ? ' · 已缓存' : ''}${pack.playerCount ? ' · 共 ' + pack.playerCount + ' 人' : ''}</p>`;
  h += `</div>`;
  return h;
}

function dataTabHtml(x, m, stats) {
  const key = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[key]) || null;
  const ui = statsUiOf(x.id);
  let h = livePitchHtml(x, live);
  // 1.9.58: 本场球员 moved to 赛后复盘 tab
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
function matchHero(x, m, r, { favBtn = '' } = {}) {
  const started = !!(m && Date.now() > kickoff(m)) || !!(x && Date.now() > kickoff(x));
  const id = String(x.id || '');
  const live = (S.liveStatsCache && S.liveStatsCache[id]) || null;
  const ls = (S.liveScores && S.liveScores[id]) || null;
  const finished = isMatchFinished(x);
  let hg = null, ag = null, half = '', statusLab = '';
  if (r && r.full) {
    const parts = String(r.full).split(/[:：\-]/);
    hg = parts[0]; ag = parts[1];
    half = r.half || '';
    statusLab = r.status || '完场';
  } else if (x && x.full && (finished || x.afShell)) {
    const parts = String(x.full).split(/[:：\-]/);
    hg = parts[0]; ag = parts[1];
    half = x.half || '';
    statusLab = x.status || (finished ? '完场' : '');
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
  const nav = matchEdgeNavBar(favBtn);
  let h = `<div class="hero hero--edge" id="match-hero-${esc(id)}">${nav}<div class="meta">${lgTag(x)}<span>${esc(x.num)}</span><span>${esc(issueDate(x))} ${issueWeek(x)}${x.time ? ' · 开赛 ' + esc(x.date) + ' ' + esc(x.time) : ''}</span>${x.sample ? '<span class="sample-tag">示例数据</span>' : ''}</div>
    <div class="teams"><div class="tm">${badge(x.home, 'lg', x.homeLogo)}<span>${esc(x.home)}</span><small>主队 ${esc(x.homeRank || '')}</small></div>
    <div class="mid">${mid}</div>
    <div class="tm">${badge(x.away, 'lg', x.awayLogo)}<span>${esc(x.away)}</span><small>客队 ${esc(x.awayRank || '')}</small></div></div></div>`;
  return h;
}

// ----- 1.9.12 开赛赔率快照（只读展示） -----
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
      <p class="note"></p></div>`;
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

  h += `<p class="note">${esc(snap.noteZh || '')}</p></div>`;
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

/** 1.9.129: switch detail tab without wiping hero/header (no paint-hold navy flash). */
function detailPaneInnerHtml(x, tab) {
  const m = findMatch(x.id);
  const stats = (S.statsCache && S.statsCache[String(x.homeTeamId || '') + '|' + String(x.awayTeamId || '')]) || null;
  let h = '';
  if (tab === 'attitude') h = matchAttitudeTabHtml(x);
  else if (tab === 'intel') h = intelTabHtml(x, m, stats);
  else if (tab === 'odds') h = oddsTabHtml(x, oddsSnapCache()[String(x.id) + '|' + (x.date || '')]);
  else if (tab === 'data') h = dataTabHtml(x, m, stats);
  else if (tab === 'events') h = eventsTabHtml(x, (S.liveStatsCache && S.liveStatsCache[String(x.id)]) || null);
  else if (tab === 'squad') h = squadSectionHtml(x);
  else if (tab === 'review') h = reviewTabHtml(x);
  else h = predTabHtml(m || null);
  if (m && tab === 'intel') {
    h += `<div class="dsec"><h3>比赛信息</h3><dl class="kv"><dt>赛事编号</dt><dd>${esc(m.num)}</dd><dt>联赛</dt><dd>${esc(m.league)}</dd><dt>开赛时间</dt><dd>${esc(m.date)} ${esc(m.time)}（北京时间）</dd><dt>数据状态</dt><dd>${m.sample ? '示例数据（非真实）' : '官方在售赔率 · 赛程分层缓存；全玩法见「赔率」Tab'}</dd></dl>
      <p class="note" style="margin:10px 0 0">点击赔率可选择并生成个人方案记录（仅个人备忘）。</p></div>`;
  }
  return h;
}
function softPatchDetailTab(id, tab) {
  try {
    if (route().name !== 'match' || String(route().arg) !== String(id)) return false;
    const m = findMatch(id);
    const r = !m && (S.results || []).find(z => z.id === String(id));
    const shell = !m && !r && loadFxShell(id);
    const x = m || r || shell || null;
    if (!x) return false;
    const tabs = detailTabsFor(x);
    if (!tabs.some(tt => tt[0] === tab)) tab = 'attitude';
    S.detailTab = S.detailTab || {};
    S.detailTab[id] = tab;
    const bar = document.querySelector('.dtabs[data-mid="' + CSS.escape(String(id)) + '"]')
      || document.querySelector('.dtabs');
    if (bar) {
      bar.querySelectorAll('button[data-act="detailTab"]').forEach(b => {
        b.classList.toggle('on', b.getAttribute('data-tab') === tab);
      });
    }
    const pane = document.getElementById('detail-pane-' + id);
    if (!pane) return false;
    pane.className = detailPaneClass(tab);
    pane.innerHTML = detailPaneInnerHtml(x, tab);
    syncViewWrapClass();
    try {
      render.lastSig = 'match:' + String(id) + ':' + tab + ':' + ((S.squadTab && S.squadTab[id]) || '') + ':' + JSON.stringify((route().query) || {});
      render.last = location.hash;
    } catch (_) {}
    return true;
  } catch (_) { return false; }
}

function pageMatch(id) {
  const m = findMatch(id); const r = !m && (S.results || []).find(x => x.id === String(id));
  const shell = !m && !r && loadFxShell(id);
  const x = m || r || shell || null;
  const favBtn = matchFavBtn(x);
  if (!S.matches && !shell) {
    return `<div class="hero hero--edge hero--edge-min">${matchEdgeNavBar()}<div class="spinner" style="margin:24px auto"></div></div>`;
  }
  if (!x) {
    return `<div class="hero hero--edge hero--edge-min">${matchEdgeNavBar()}</div>`
      + empty('该场比赛已结束或已下架', '<button class="btn ghost sm" data-go="#/results">查看开奖</button>') + foot();
  }
  let tab = detailTabOf(x.id);
  const tabs = detailTabsFor(x);
  if (!tabs.some(tt => tt[0] === tab)) {
    tab = 'attitude';
    S.detailTab = S.detailTab || {};
    S.detailTab[x.id] = tab;
  }
  let h = matchHero(x, m, r, { favBtn });
  h += `<div class="dtabs" data-mid="${esc(x.id)}">${tabs.map(([k, lab]) =>
    `<button type="button" class="${tab === k ? 'on' : ''}" data-act="detailTab" data-id="${esc(x.id)}" data-tab="${k}">${lab}</button>`
  ).join('')}</div>`;
  h += `<div id="detail-pane-${esc(x.id)}" class="${detailPaneClass(tab)}">${detailPaneInnerHtml(x, tab)}</div>`;
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
    S.detailTab[x.id] = 'attitude';
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
    wrap.innerHTML = matchHero(x, m, r, { favBtn: matchFavBtn(x) });
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
  if (tab !== 'data' && tab !== 'events') stopLivePoll();
  if (tab !== 'events') stopChatPoll();
  if (route().name !== 'match') stopMatchStatusPoll();
  // 1.9.107: prefetch lineup when match detail opens so squad tab paints from cache
  try { ensureLineup(x); } catch (_) {}

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

  if (tab === 'attitude') {
    await loadMatchAttitude(x);
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
    ensurePrematchAiPoll(m);
  }
  if (tab === 'review') {
    // Paint loading shell immediately, then fill
    const pane0 = document.getElementById('detail-pane-' + x.id);
    if (pane0 && !(S.reviewCache && S.reviewCache[String(x.id)] && S.reviewCache[String(x.id)].ok)) {
      pane0.innerHTML = reviewTabHtml(x);
    }
    const reviewTasks = [loadPostMatchReview(x)];
    // 1.9.58: 本场球员 belongs on 赛后复盘 — load + re-render with review
    if (isMatchFinished(x)) reviewTasks.push(loadFixturePlayers(x));
    await Promise.all(reviewTasks);
    if (route().name === 'match' && String(route().arg) === String(x.id) && detailTabOf(x.id) === 'review') {
      const pane = document.getElementById('detail-pane-' + x.id);
      if (pane) pane.innerHTML = reviewTabHtml(x);
    }
  }
  if (tab === 'intel' || tab === 'data' || tab === 'events') {
    const tasks = [];
    if (tab === 'intel' || tab === 'data') tasks.push(loadMatchStats(x));
    if (tab === 'intel') tasks.push(loadPredictReport(findMatch(x.id) || x));
    // live-stats already warmed above when kickedOff; still refresh on data/events
    if (tab === 'data' || tab === 'events') tasks.push(loadLiveStats(x, { force: tab === 'events' }));
    if (tab === 'events') {
      tasks.push(loadChat(String(x.id)));
      tasks.push(loadAiChatHistory(String(x.id)).then(() => loadAiChatQuota(String(x.id))));
    }
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
        else if (tab === 'events') {
          const live = (S.liveStatsCache && S.liveStatsCache[String(x.id)]) || null;
          pane.innerHTML = eventsTabHtml(x, live);
          ensureLivePoll(x);
          ensureChatPoll(x);
          renderAiChatList(String(x.id));
          maybeScrollToChat(String(x.id));
        }
      }
    }
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
/** Current #/news/:id detail id (empty on list / search routes). Mirrors pageNews routing. */
function newsRouteDetailId() {
  const r = route();
  if (r.name !== 'news') return '';
  const arg = String(r.arg || '').trim();
  if (!arg) return '';
  if (r.query && Object.prototype.hasOwnProperty.call(r.query, 'q')) return '';
  return arg;
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
/** onerror: retry once via proxy (cache-bust); then placeholder / designed fallback / remove. */
function newsImgOnError(el, fallback) {
  if (!el || el.dataset.retried === '1') {
    if (fallback === 'remove') { el.remove(); return; }
    if (fallback === 'news') {
      el.dataset.retried = '2';
      el.classList.add('ph');
      el.src = 'banners/slide-news.jpg';
      el.onerror = null;
      return;
    }
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
  else if (fallback === 'news') {
    el.classList.add('ph');
    el.src = 'banners/slide-news.jpg';
    el.onerror = null;
  } else { el.classList.add('ph'); el.removeAttribute('src'); }
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
  // 1.9.87: prefer list thumb, else thumbFull; proxy+cache; designed fallback on miss
  const src = newsImgSrc(it.thumb || it.thumbFull || it.cover || '');
  const thumb = src
    ? `<img class="news-thumb" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="newsImgOnError(this,'news')"/>`
    : `<div class="news-thumb ph" style="background:url(banners/slide-news.jpg) center/cover">${I.news}</div>`;
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
  if (newsRouteDetailId()) {
    return pageNewsDetail(newsRouteDetailId());
  }
  // URL is source of truth — do not fall back to S.newsQ (that broke「清除筛选」)
  const q = String((r.query && r.query.q) || '').trim();
  S.newsQ = q;
  const tab = newsTabOf();
  S.newsTab = tab;
  let h = q ? `<div class="shell-tools shell-tools--compact"><span class="shell-title">搜索 · ${esc(q)}</span>${srcPill()}</div>` : '';
  h += `<div class="dtabs news-tabs">
    <button type="button" class="${tab === 'cn' ? 'on' : ''}" data-act="newsTab" data-tab="cn">国内</button>
    <button type="button" class="${tab === 'en' ? 'on' : ''}" data-act="newsTab" data-tab="en">外网</button>
  </div>`;
  h += `<form class="news-search" id="fNewsSearch" action="#" autocomplete="off">
    <input name="q" type="search" enterkeyhint="search" maxlength="40" placeholder="搜索球队（中文或英文）" value="${esc(q)}" aria-label="搜索球队">
    <button type="submit" class="btn pri sm">搜索</button>
  </form>`;
  if (q) h += `<div class="chips news-filter-chip"><button type="button" class="on" data-act="newsClear">清除筛选 · ${esc(q)}</button></div>`;
  if (tab === 'en') h += `<div class="warn-bar" style="background:var(--pri-l);border-color:var(--pri-m);color:var(--pri-d)">外网足球资讯</div>`;
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
          <p class="news-tr-note">机器翻译</p>
        </div>`;
      } else {
        translateBar = `<div class="news-tr-bar">
          <button type="button" class="btn pri sm" data-act="newsTranslate" data-id="${esc(item.id)}">一键译中文</button>
          <p class="news-tr-note">机器翻译</p>
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
      <p class="note" style="margin-top:12px">${esc(attr)}</p>`;
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



// ======================= 球员库浏览（内部只读，需查看密钥） =======================
function syncPlayerDbKeyFromRoute() {
  const r = route();
  if (r.name === 'player-db' && r.query && r.query.key) {
    S.playerDbKey = String(r.query.key);
    try { sessionStorage.setItem('jc_player_db_key', S.playerDbKey); } catch { }
  }
}
function pdbNum(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}
function pdbFmtBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KiB';
  return (v / (1024 * 1024)).toFixed(2) + ' MiB';
}
function pdbFmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + '（上海）';
  } catch { return String(iso); }
}
function pdbPlayerTable(rows, { showMatch = false } = {}) {
  if (!rows || !rows.length) return `<div class="pdb-empty">暂无球员行</div>`;
  const head = `<thead><tr>
    ${showMatch ? '<th>日期</th><th>对阵</th>' : ''}
    <th>姓名</th><th>位置</th><th>分钟</th><th>进球</th><th>助攻</th><th>射门</th><th>射正</th><th>关键传</th><th>抢断</th><th>评分</th>
  </tr></thead>`;
  const body = rows.map(p => {
    const nm = esc(p.name || p.nameZh || p.nameEn || p.playerId || '?');
    const matchBits = showMatch
      ? `<td class="nowrap">${esc(p.date || '')}</td><td class="pdb-vs"><button type="button" class="pdb-link" data-go="#/player-db/match/${encodeURIComponent(p.matchId)}">${esc((p.homeNameZh || '') + ' vs ' + (p.awayNameZh || ''))}${p.ft ? ' ' + esc(p.ft) : ''}</button></td>`
      : '';
    return `<tr>
      ${matchBits}
      <td><button type="button" class="pdb-link" data-go="#/player-db/player/${encodeURIComponent(p.playerId)}">${nm}</button></td>
      <td>${esc(p.pos || '')}</td>
      <td>${pdbNum(p.min)}</td><td>${pdbNum(p.goals)}</td><td>${pdbNum(p.assists)}</td>
      <td>${pdbNum(p.shots)}</td><td>${pdbNum(p.sot)}</td><td>${pdbNum(p.keyPasses)}</td><td>${pdbNum(p.tackles)}</td>
      <td class="pdb-rating">${pdbNum(p.rating)}</td>
    </tr>`;
  }).join('');
  return `<div class="pdb-scroll"><table class="pdb-table">${head}<tbody>${body}</tbody></table></div>`;
}
function pagePlayerDb() {
  syncPlayerDbKeyFromRoute();
  // Internal tool only: phone login is NOT enough; need ?key= matching PLAYER_DB_VIEW_KEY
  const can = !!S.playerDbKey;
  if (!can) {
    return hdr('球员库') + `<div class="pad-card"><p class="note" style="margin:0">内部工具，需查看密钥。普通登录无法访问。</p></div>` + foot();
  }
  const r = route();
  const parts = String(r.arg || '').split('/').filter(Boolean);
  const mode = parts[0] || '';
  const id = parts[1] || '';

  if (mode === 'match' && id) return pagePlayerDbMatch(id);
  if (mode === 'player' && id) return pagePlayerDbPlayer(id);
  return pagePlayerDbHome();
}
function pagePlayerDbHome() {
  const ov = S.playerDbCache.overview;
  const recent = S.playerDbCache.recent;
  const search = S.playerDbCache.search;
  const q = (route().query && route().query.q) || (search && search.q) || '';
  let h = hdr('球员库');
  h += infoBar('只读浏览自有 <code>player-match.sqlite</code>，不含投注功能。可按球员名（中/英）、队名、场次编号搜索。');
  h += `<div class="pdb-wrap">`;
  if (!ov) {
    h += `<div class="pad-card"><div class="spinner"></div><p class="note">加载概览…</p></div>`;
  } else {
    h += `<div class="pdb-stats">
      <div class="pdb-stat"><b>${ov.matches}</b><span>场次</span></div>
      <div class="pdb-stat"><b>${ov.jingcaiMatches != null ? ov.jingcaiMatches : '—'}</b><span>竞彩场</span></div>
      <div class="pdb-stat"><b>${ov.afShells != null ? ov.afShells : '—'}</b><span>非竞彩壳</span></div>
      <div class="pdb-stat"><b>${ov.playerRows}</b><span>球员行</span></div>
      <div class="pdb-stat"><b>${ov.playerGapJingcai != null ? ov.playerGapJingcai : '—'}</b><span>球员缺口</span></div>
      <div class="pdb-stat"><b>${ov.tags}</b><span>标签</span></div>
      <div class="pdb-stat"><b>${ov.outcomes != null ? ov.outcomes : '—'}</b><span>复盘结果</span></div>
      <div class="pdb-stat"><b>${ov.processCompare != null ? ov.processCompare : '—'}</b><span>指标对照</span></div>
      <div class="pdb-stat"><b>${ov.hardTestEpisodes != null ? ov.hardTestEpisodes : '—'}</b><span>硬仗检验</span></div>
    </div>`;
    h += `<p class="note">最近场次默认隐藏非竞彩 <code>af:</code> 壳（不删除）；回填优先竞彩球员缺口。</p>`;
    if (ov.bytes != null) {
      h += `<div class="pdb-meta pad-card"><div><span class="k">库文件大小</span>${esc(pdbFmtBytes(ov.bytes))}</div></div>`;
    }
    h += `<div class="pdb-meta pad-card">
      <div><span class="k">数据库路径</span><code class="pdb-path">${esc(ov.path || '')}</code></div>
      <div><span class="k">最近入库</span>${esc(pdbFmtTime(ov.lastFetchedAt))}</div>
      <div><span class="k">文件更新</span>${esc(pdbFmtTime(ov.fileMtime))}</div>
    </div>`;
  }
  h += `<div class="pdb-search pad-card">
    <form id="fPdbSearch" autocomplete="off">
      <label class="lb">搜索球员 / 球队 / 场次编号</label>
      <div class="fld pdb-fld"><input name="q" type="search" enterkeyhint="search" placeholder="例：哈兰德、曼城、2041971" value="${esc(q)}"></div>
      <button type="submit" class="btn pri block">搜索</button>
    </form>
  </div>`;
  if (search && search.q) {
    h += `<div class="sec-label">搜索结果 · ${esc(search.q)}（${(search.rows || []).length}）</div>`;
    h += `<div class="pad-card">${pdbPlayerTable(search.rows, { showMatch: true })}</div>`;
  }
  h += `<div class="sec-label">最近场次</div>`;
  if (!recent) {
    h += `<div class="pad-card"><div class="spinner"></div></div>`;
  } else if (!recent.length) {
    h += `<div class="pad-card"><div class="pdb-empty">暂无场次</div></div>`;
  } else {
    h += `<div class="pad-card pdb-match-list">${recent.map(m => {
      const title = (m.homeNameZh || m.homeName || '?') + ' vs ' + (m.awayNameZh || m.awayName || '?');
      const afBadge = m.isAfShell ? ' · <span class="pmr-tag">非竞彩壳</span>' : '';
      return `<button type="button" class="pdb-match-row" data-go="#/player-db/match/${encodeURIComponent(m.matchId)}">
        <div class="pdb-m-top"><span class="pdb-date">${esc(m.date || '')}</span><span class="pdb-ft">${esc(m.ft || '—')}</span></div>
        <div class="pdb-m-title">${esc(title)}</div>
        <div class="pdb-m-sub">${esc(m.competition || '')} · ${m.playerCount != null ? m.playerCount + ' 名球员' : ''} · ${esc(m.matchId)}${afBadge}</div>
      </button>`;
    }).join('')}</div>`;
  }
  const outs = S.playerDbCache.outcomes;
  h += `<div class="sec-label">复盘结果（表态命中）</div>`;
  if (!outs) {
    h += `<div class="pad-card"><div class="spinner"></div></div>`;
  } else if (!outs.length) {
    h += `<div class="pad-card"><div class="pdb-empty">暂无复盘结果（由赛后复盘缓存迁入）</div></div>`;
  } else {
    h += `<div class="pad-card pdb-match-list">${outs.map(o => {
      const title = (o.homeName || '?') + ' ' + (o.ft || '-') + ' ' + (o.awayName || '?');
      const hit = o.leanHit === 1 ? '命中' : (o.leanHit === 0 ? '未中' : '—');
      const hitCls = o.leanHit === 1 ? 'ok' : (o.leanHit === 0 ? 'bad' : '');
      const conf = o.predConf != null ? Math.round(Number(o.predConf) * 100) + '%' : '';
      const lean = o.predPickText || o.predLean || '—';
      const htChip = (ht, lab) => {
        if (!ht) return '';
        const cls = ht.moistureTag === '高' ? 'ht-high' : (ht.moistureTag === '低' ? 'ht-low' : (ht.moistureTag === '中' ? 'ht-mid' : 'ht-na'));
        return `<span class="pmr-tag ${cls}">${esc(lab)}${esc(ht.moistureLabelZh || ht.moistureTag || '')}</span>`;
      };
      const cmp = [o.homeCompareBrief, o.awayCompareBrief].filter(Boolean).join(' · ');
      return `<button type="button" class="pdb-match-row" data-go="#/player-db/match/${encodeURIComponent(o.matchId)}">
        <div class="pdb-m-top"><span class="pdb-date">${esc(o.date || '')}</span><span class="pdb-ft ${hitCls}">${esc(hit)}</span></div>
        <div class="pdb-m-title">${esc(title)}</div>
        <div class="pdb-m-sub">${esc(o.league || '')} · 表态 ${esc(lean)}${conf ? ' ' + conf : ''} · ${esc(o.matchId)}</div>
        <div class="pdb-m-sub pdb-ht-chips">${htChip(o.homeHardTest, '主·')}${htChip(o.awayHardTest, '客·')}${o.compareRows ? `<span class="pmr-tag">${o.compareRows}项对照</span>` : ''}</div>
        ${cmp ? `<div class="pdb-m-sub">Δ ${esc(cmp)}</div>` : ''}
        ${o.snippet ? `<div class="pdb-m-sub">${esc(o.snippet)}</div>` : ''}
      </button>`;
    }).join('')}</div>`;
  }
  h += `</div>`;
  return h + foot();
}
function pagePlayerDbMatch(matchId) {
  const cached = S.playerDbCache.match[matchId];
  let h = hdr('场次球员');
  h += `<div class="pdb-wrap">`;
  if (!cached) {
    h += `<div class="pad-card"><div class="spinner"></div><p class="note">加载场次 ${esc(matchId)}…</p></div>`;
  } else if (cached.error) {
    h += `<div class="pad-card"><p class="note">${esc(cached.error)}</p><button class="btn ghost" data-go="#/player-db">返回球员库</button></div>`;
  } else {
    const m = cached.match || {};
    const title = (m.homeNameZh || m.homeName || '?') + ' vs ' + (m.awayNameZh || m.awayName || '?');
    h += `<div class="pdb-match-hd pad-card">
      <div class="pdb-date">${esc(m.date || '')}${m.ft ? ' · ' + esc(m.ft) : ''}</div>
      <div class="pdb-m-title">${esc(title)}</div>
      <div class="pdb-m-sub">${esc(m.competition || '')} · matchId ${esc(m.matchId || matchId)}</div>
    </div>`;
    const oc = cached.outcome;
    if (oc) {
      const hit = oc.leanHit === 1 ? '命中' : (oc.leanHit === 0 ? '未中' : '—');
      const hitCls = oc.leanHit === 1 ? 'ok' : (oc.leanHit === 0 ? 'bad' : '');
      h += `<div class="sec-label">复盘结果</div><div class="pad-card">
        <div class="pdb-m-sub">表态 ${esc(oc.predPickText || oc.predLean || '—')}${oc.predConf != null ? ' · ' + Math.round(Number(oc.predConf)*100) + '%' : ''} · <span class="${hitCls}">${esc(hit)}</span></div>
        ${oc.snippet ? `<div class="pdb-m-sub">${esc(oc.snippet)}</div>` : ''}
      </div>`;
    }
    const cmp = cached.processCompare;
    if (cmp && cmp.rows) {
      const METRIC_ZH = { possession:'控球', shots:'射门', shotsOnTarget:'射正', passesPct:'传球%', corners:'角球', expectedGoals:'xG', attacks:'进攻', dangerousAttacks:'危攻' };
      const keys = Array.from(new Set([...Object.keys(cmp.home||{}), ...Object.keys(cmp.away||{})]));
      const cell = (d) => {
        if (!d || d.missing) return '—';
        const a = d.actual != null ? d.actual : '—';
        const r = d.recentAvg != null ? d.recentAvg : '—';
        const delta = d.delta != null ? ((d.delta > 0 ? '+' : '') + d.delta) : '';
        return `${a} / ${r}${delta ? ' (' + delta + ')' : ''}`;
      };
      h += `<div class="sec-label">指标对照（本场 / 近况 · Δ）</div><div class="pad-card"><table class="pdb-tbl"><thead><tr><th>指标</th><th>主队</th><th>客队</th></tr></thead><tbody>`;
      for (const k of keys) {
        h += `<tr><td>${esc(METRIC_ZH[k] || k)}</td><td>${esc(cell((cmp.home||{})[k]))}</td><td>${esc(cell((cmp.away||{})[k]))}</td></tr>`;
      }
      h += `</tbody></table></div>`;
    }
    const hts = cached.hardTest || [];
    if (hts.length) {
      h += `<div class="sec-label">硬仗检验</div><div class="pad-card">`;
      for (const ep of hts) {
        const cls = ep.moistureTag === '高' ? 'ht-high' : (ep.moistureTag === '低' ? 'ht-low' : (ep.moistureTag === '中' ? 'ht-mid' : 'ht-na'));
        h += `<div class="pdb-ht-card">
          <div class="pdb-m-top"><b>${esc(ep.teamNameZh || ep.teamName || ep.side || '')}</b>
            <span class="pmr-tag ${cls}">${esc(ep.moistureLabelZh || ep.moistureTag || '')}</span>
            ${ep.opponentSi != null ? `<span class="pmr-tag ht-na">${esc((Number(ep.opponentSi)>=1.08)?'对手偏强':(Number(ep.opponentSi)>=0.95)?'对手中等':'对手偏弱')}</span>` : ''}
            ${ep.isHardTest ? '<span class="pmr-tag">硬仗</span>' : ''}
          </div>
          <div class="pdb-m-sub">对阵 ${esc(ep.opponent || '')}${ep.ft ? ' ' + esc(ep.ft) : ''}</div>
          ${ep.briefSummaryZh ? `<div class="pdb-m-sub">${esc(ep.briefSummaryZh)}</div>` : ''}
          ${(ep.mechanismTags || []).length ? `<div class="pdb-m-sub">${esc((ep.mechanismTags || []).slice(0,4).join(' · '))}</div>` : ''}
        </div>`;
      }
      h += `</div>`;
    }
    h += `<div class="sec-label">主队 · ${esc(m.homeNameZh || m.homeName || '')}</div><div class="pad-card">${pdbPlayerTable(cached.home || [])}</div>`;
    h += `<div class="sec-label">客队 · ${esc(m.awayNameZh || m.awayName || '')}</div><div class="pad-card">${pdbPlayerTable(cached.away || [])}</div>`;
  }
  h += `</div>`;
  return h + foot();
}
function pagePlayerDbPlayer(playerId) {
  const cached = S.playerDbCache.player[playerId];
  let h = hdr('球员近场');
  h += `<div class="pdb-wrap">`;
  if (!cached) {
    h += `<div class="pad-card"><div class="spinner"></div><p class="note">加载球员 ${esc(playerId)}…</p></div>`;
  } else if (cached.error) {
    h += `<div class="pad-card"><p class="note">${esc(cached.error)}</p><button class="btn ghost" data-go="#/player-db">返回球员库</button></div>`;
  } else {
    h += `<div class="pdb-match-hd pad-card">
      <div class="pdb-m-title">${esc(cached.name || cached.nameZh || cached.nameEn || playerId)}</div>
      <div class="pdb-m-sub">${esc(cached.nameEn || '')}${cached.nameZh && cached.nameEn ? ' · ' : ''}${esc(cached.nameZh && cached.nameZh !== cached.name ? cached.nameZh : '')} · id ${esc(playerId)}</div>
      ${cached.tag ? `<div class="pdb-tag">线位 ${esc(cached.tag.line || '—')} · 关键分 ${pdbNum(cached.tag.keyPlayerScore)} · 出场 ${pdbNum(cached.tag.appearances)}</div>` : ''}
    </div>`;
    h += `<div class="sec-label">近场记录（${(cached.rows || []).length}）</div>`;
    h += `<div class="pad-card">${pdbPlayerTable(cached.rows || [], { showMatch: true })}</div>`;
  }
  h += `</div>`;
  return h + foot();
}
async function loadPlayerDbHome(force) {
  if (!S.playerDbKey) return;
  let changed = false;
  try {
    if (force || !S.playerDbCache.overview) {
      S.playerDbCache.overview = await api('/player-db/overview', { timeout: 15000 });
      changed = true;
    }
    if (force || !S.playerDbCache.recent) {
      const j = await api('/player-db/recent-matches?limit=30', { timeout: 15000 });
      S.playerDbCache.recent = j.matches || [];
      changed = true;
    }
    if (force || !S.playerDbCache.outcomes) {
      const j = await api('/player-db/outcomes?limit=30', { timeout: 15000 });
      S.playerDbCache.outcomes = j.outcomes || [];
      changed = true;
    }
    const q = route().query && route().query.q;
    if (q && (!S.playerDbCache.search || S.playerDbCache.search.q !== q)) {
      const j = await api('/player-db/search?q=' + encodeURIComponent(q) + '&limit=50', { timeout: 15000 });
      S.playerDbCache.search = j;
      changed = true;
    }
  } catch (e) {
    toast(e.message || '加载球员库失败');
    if (!S.playerDbCache.overview) {
      S.playerDbCache.overview = { matches: 0, playerRows: 0, tags: 0, path: '—', error: e.message };
      changed = true;
    }
    if (!S.playerDbCache.recent) { S.playerDbCache.recent = []; changed = true; }
  }
  if (changed && route().name === 'player-db' && !route().arg) render();
}
async function loadPlayerDbMatch(matchId) {
  if (!matchId || !S.playerDbKey) return;
  if (S.playerDbCache.match[matchId] && !S.playerDbCache.match[matchId].error) return;
  try {
    const j = await api('/player-db/matches/' + encodeURIComponent(matchId), { timeout: 15000 });
    S.playerDbCache.match[matchId] = j;
  } catch (e) {
    S.playerDbCache.match[matchId] = { error: e.message || '加载失败' };
  }
  const r = route();
  if (r.name === 'player-db' && String(r.arg || '').startsWith('match/')) render();
}
async function loadPlayerDbPlayer(playerId) {
  if (!playerId || !S.playerDbKey) return;
  if (S.playerDbCache.player[playerId] && !S.playerDbCache.player[playerId].error) return;
  try {
    const j = await api('/player-db/players/' + encodeURIComponent(playerId) + '?limit=40', { timeout: 15000 });
    S.playerDbCache.player[playerId] = j;
  } catch (e) {
    S.playerDbCache.player[playerId] = { error: e.message || '加载失败' };
  }
  const r = route();
  if (r.name === 'player-db' && String(r.arg || '').startsWith('player/')) render();
}
async function runPlayerDbSearch(q) {
  const term = String(q || '').trim();
  if (!term) { toast('请输入搜索关键词'); return; }
  try {
    const j = await api('/player-db/search?q=' + encodeURIComponent(term) + '&limit=50', { timeout: 15000 });
    S.playerDbCache.search = j;
    go('#/player-db?q=' + encodeURIComponent(term), true);
    render();
  } catch (e) { toast(e.message || '搜索失败'); }
}

// ======================= 个人知识库 =======================
const KB_IV = [
  ['explain', '仅解释', '展示命中与归因，不改变概率'],
  ['light', '轻度', '单项最多约 ±2%'],
  ['medium', '中度', '单项最多约 ±5%'],
  ['strong', '强度', '单项最多约 ±8%'],
];

function kbRouteParts() {
  const r = route();
  const p = String(r.arg || '').split('/').filter(Boolean);
  return { sub: p[0] || 'home', id: p[1] || '' };
}

async function loadKbPacks(force) {
  if (!loggedIn()) return [];
  if (!force && S.kb && S.kb.packs) return S.kb.packs;
  S.kb = S.kb || {};
  kbInflightEnter();
  try {
    const j = await api('/kb/packs', { timeout: 10000 });
    S.kb.packs = (j && j.packs) || [];
    S.kb.packsError = '';
    persistKbPacksCache(S.kb.packs);
    return S.kb.packs;
  } catch (e) {
    S.kb.packsError = (e && e.message) || '知识包加载失败，请检查网络';
    throw e;
  } finally {
    kbInflightLeave();
  }
}

async function loadKbPicker(force) {
  if (!loggedIn()) return [];
  if (!force && S.kb && S.kb.picker) return S.kb.picker;
  kbInflightEnter();
  try {
    const j = await api('/kb/picker');
    S.kb.picker = (j && j.packs) || [];
    return S.kb.picker;
  } finally {
    kbInflightLeave();
  }
}

async function loadKbPackItems(packId, force) {
  if (!loggedIn()) return null;
  if (!force && S.kb && S.kb.packId === packId && S.kb.packItems) return S.kb.packItems;
  S.kb = S.kb || {};
  kbInflightEnter();
  try {
    const j = await api('/kb/packs/' + encodeURIComponent(packId) + '/items', { timeout: 12000 });
    S.kb.packId = packId;
    S.kb.packItems = j;
    S.kb.packItemsError = '';
    return j;
  } catch (e) {
    S.kb.packItemsError = (e && e.message) || '知识包内容加载失败';
    throw e;
  } finally {
    kbInflightLeave();
  }
}

async function ensureKbItemBody(item) {
  if (!item || item.id == null) return '';
  if (item.body != null && String(item.body).length) return String(item.body);
  const cached = readKbItemBodyCache(item.id, item.updatedAt);
  if (cached != null) {
    item.body = cached;
    return cached;
  }
  kbInflightEnter();
  try {
    const j = await api('/kb/items/' + encodeURIComponent(item.id), { timeout: 15000 });
    const body = (j && j.item && j.item.body) ? String(j.item.body) : '';
    item.body = body;
    if (j && j.item && j.item.updatedAt) item.updatedAt = j.item.updatedAt;
    persistKbItemBodyCache(item.id, body, item.updatedAt);
    return body;
  } finally {
    kbInflightLeave();
  }
}

function syncKbCanvasEmptyHint() {
  const hint = document.getElementById('kb-canvas-hint');
  if (!hint) return;
  const n = ((S.kb && S.kb.packItems && S.kb.packItems.items) || []).length;
  hint.classList.toggle('hidden', n > 0);
}

function destroyKbCanvas() {
  if (S.kb && S.kb.canvasInst) {
    try { S.kb.canvasInst.flushChange(); } catch (_) {}
    S.kb.canvasInst.destroy();
    S.kb.canvasInst = null;
  }
}

let kbLayoutSaveTimer = null;
function scheduleKbLayoutSave(packId, payload) {
  clearTimeout(kbLayoutSaveTimer);
  kbLayoutSaveTimer = setTimeout(async () => {
    try {
      await api('/kb/packs/' + encodeURIComponent(packId) + '/layout', { method: 'PATCH', body: payload });
      if (S.kb && S.kb.packItems && S.kb.packItems.pack) {
        S.kb.packItems.pack.layoutPanX = payload.panX;
        S.kb.packItems.pack.layoutPanY = payload.panY;
        S.kb.packItems.pack.layoutZoom = payload.zoom;
        const items = S.kb.packItems.items || [];
        const nodes = payload.nodes || {};
        items.forEach((it) => {
          const p = nodes[String(it.id)];
          if (p) { it.posX = p.x; it.posY = p.y; }
        });
      }
    } catch (e) {
      console.warn('kb layout save', e.message || e);
    }
  }, 320);
}

let kbItemSaveDebounceTimer = null;
function scheduleKbSaveItemSheet(el) {
  clearTimeout(kbItemSaveDebounceTimer);
  const btn = el;
  if (btn) btn.disabled = true;
  kbItemSaveDebounceTimer = setTimeout(() => {
    flushKbSaveItemSheet(el).finally(() => { if (btn) btn.disabled = false; });
  }, 400);
}
async function flushKbSaveItemSheet(el) {
  const packId = el.dataset.pack;
  const iid = el.dataset.id;
  const sh = $('#sheet');
  const title = (sh.querySelector('input[name="kbSheetTitle"]') || {}).value;
  const body = (sh.querySelector('textarea[name="kbSheetBody"]') || {}).value;
  const posX = el.dataset.posx;
  const posY = el.dataset.posy;
  if (S.kb && S.kb._itemSaveInflight) return;
  S.kb = S.kb || {};
  S.kb._itemSaveInflight = true;
  try {
    if (iid) {
      const j = await api('/kb/items/' + iid, { method: 'PATCH', body: { title, body } });
      if (j && j.item && S.kb.packItems) {
        const items = S.kb.packItems.items || [];
        const idx = items.findIndex(x => String(x.id) === String(iid));
        if (idx >= 0) items[idx] = Object.assign({}, items[idx], j.item);
        else items.unshift(j.item);
        S.kb.packItems.items = items;
        persistKbItemBodyCache(j.item.id, j.item.body, j.item.updatedAt);
        if (S.kb.canvasInst) S.kb.canvasInst.upsertItem(j.item);
        syncKbCanvasEmptyHint();
      }
    } else {
      const payload = { title, body };
      if (posX !== '' && posY !== '') {
        payload.posX = Number(posX);
        payload.posY = Number(posY);
      }
      const j = await api('/kb/packs/' + packId + '/items', { method: 'POST', body: payload });
      if (j && j.item && S.kb) {
        S.kb.packItems = S.kb.packItems || { pack: {}, items: [] };
        S.kb.packItems.items = [j.item, ...(S.kb.packItems.items || []).filter(x => x.id !== j.item.id)];
        persistKbItemBodyCache(j.item.id, j.item.body, j.item.updatedAt);
        if (S.kb.canvasInst) S.kb.canvasInst.upsertItem(j.item);
        else render({ force: true });
        syncKbCanvasEmptyHint();
      }
    }
    S.kb.picker = null;
    closeSheet();
    toast('已保存');
  } catch (err) { toast(err.message || '保存失败'); }
  finally { S.kb._itemSaveInflight = false; }
}

function kbShowItemSheet({ packId, itemId, title, body, posX, posY }) {
  const isNew = !itemId;
  const sh = $('#sheet');
  sh.classList.remove('hidden');
  sh.innerHTML = `<div class="sheet kb-item-sheet"><h3><span>${isNew ? '新建节点' : '编辑节点'}</span><button class="x" data-act="closeSheet">✕</button></h3>
    <label>标题<input type="text" name="kbSheetTitle" maxlength="80" value="${esc(title || '')}" placeholder="简短标题"></label>
    <label>正文<textarea name="kbSheetBody" rows="6" maxlength="120000" placeholder="你的赛前依据、盘口观察等">${esc(body || '')}</textarea></label>
    <button type="button" class="btn pri block" data-act="kbSaveItemSheet" data-pack="${esc(packId)}" data-id="${esc(itemId || '')}" data-posx="${posX != null && posX !== '' ? esc(String(posX)) : ''}" data-posy="${posY != null && posY !== '' ? esc(String(posY)) : ''}">保存</button></div>`;
  const inp = sh.querySelector('input[name="kbSheetTitle"]');
  if (inp) inp.focus();
}

function mountKbPackCanvas(packId) {
  destroyKbCanvas();
  const mount = document.getElementById('kb-canvas-mount');
  const data = S.kb && S.kb.packItems;
  if (!mount || !data || String(S.kb.packId) !== String(packId)) return;
  if (!window.createKbCanvas) return;
  const pack = data.pack;
  const items = data.items || [];
  S.kb.canvasInst = window.createKbCanvas(mount, {
    pan: { x: pack.layoutPanX || 0, y: pack.layoutPanY || 0 },
    zoom: pack.layoutZoom || 1,
    items: items.map(it => ({ id: it.id, title: it.title, body: it.body != null ? it.body : (it.bodyPreview || ''), x: it.posX, y: it.posY })),
    onChange: (payload) => scheduleKbLayoutSave(packId, payload),
    onNodeOpen: (id) => {
      const it = (S.kb.packItems.items || []).find(x => String(x.id) === String(id));
      if (!it) return;
      ensureKbItemBody(it).then((body) => {
        kbShowItemSheet({ packId, itemId: it.id, title: it.title, body });
      }).catch(() => { if (route().name === 'kb') toast('正文加载失败'); });
    },
    onDelete: async (id) => {
      if (!window.confirm('删除该节点？')) return;
      try {
        await api('/kb/items/' + id, { method: 'DELETE' });
        if (S.kb.packItems) {
          S.kb.packItems.items = (S.kb.packItems.items || []).filter(x => String(x.id) !== String(id));
        }
        S.kb.picker = null;
        if (S.kb.canvasInst) S.kb.canvasInst.removeItem(id);
        syncKbCanvasEmptyHint();
        toast('已删除');
      } catch (err) { toast(err.message || '删除失败'); }
    },
  });
  syncKbCanvasEmptyHint();
}

/** Load KB data for current route only when cache miss — avoids render↔fetch infinite loop (1.9.131). */
function ensureKbRouteData() {
  if (!loggedIn() || route().name !== 'kb') return;
  const { sub, id } = kbRouteParts();
  S.kb = S.kb || { selected: {}, intervention: 'medium' };
  hydrateKbPacksCache();
  const jobs = [];
  if (sub === 'predict' && id) {
    if (S.kb.picker == null) jobs.push(loadKbPicker(false));
  } else if (sub === 'pack' && id) {
    if (S.kb.packs == null) jobs.push(loadKbPacks(false));
    if (String(S.kb.packId) !== String(id) || !S.kb.packItems) jobs.push(loadKbPackItems(id, true));
  } else if (S.kb.packs == null) {
    jobs.push(loadKbPacks(false));
  }
  if (!jobs.length) {
    S.kb.loading = false;
    return;
  }
  S.kb.loading = true;
  Promise.all(jobs).then(() => {
    S.kb.loading = false;
    if (route().name === 'kb') render({ force: true });
  }).catch(() => {
    S.kb.loading = false;
    const onKb = route().name === 'kb';
    if (onKb && kbLoadFailToastAllowed('kb')) toast('知识库加载失败');
    if (onKb) render({ force: true });
  });
}

function kbToggleItem(id) {
  S.kb = S.kb || { selected: {} };
  const k = String(id);
  if (S.kb.selected[k]) delete S.kb.selected[k];
  else S.kb.selected[k] = true;
}

function kbSelectedIds() {
  return Object.keys((S.kb && S.kb.selected) || {}).filter(k => S.kb.selected[k]);
}

function kbProbBlock(title, probs, pick) {
  return `<div class="kb-prob"><div class="kb-prob-h">${esc(title)}${pick ? ` · <b>${esc(pick)}</b>` : ''}</div>
    <div class="kb-prob-bar"><span style="width:${(probs.h * 100).toFixed(1)}%">主 ${pct(probs.h, 1)}</span>
    <span style="width:${(probs.d * 100).toFixed(1)}%">平 ${pct(probs.d, 1)}</span>
    <span style="width:${(probs.a * 100).toFixed(1)}%">客 ${pct(probs.a, 1)}</span></div></div>`;
}

function pageKb(arg) {
  const parts = String(arg || '').split('/').filter(Boolean);
  const sub = parts[0] || 'home';
  const id = parts[1] || '';
  if (sub === 'predict' && id) return pageKbPredict(id);
  if (sub === 'pack' && id) return pageKbPack(id);
  return pageKbHome();
}

function pageKbHome() {
  if (!loggedIn()) {
    return hdr('我的知识库') + `<div class="pad-card"><p class="note">登录后可创建知识包、录入笔记，并在单场预测中勾选使用。</p><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  }
  const packs = S.kb && S.kb.packs;
  const list = packs || [];
  const packsErr = S.kb && S.kb.packsError;
  const pending = S.kb && (S.kb.loading || (packs == null && !packsErr));
  let h = hdr('我的知识库', { back: true });
  h += `<div class="pad-card kb-intro"><p class="note" style="margin:0">知识包相当于标签；条目为标题+正文。个人预测<strong>不会</strong>写入或影响站内平台简报缓存。</p></div>`;
  h += `<div class="kb-form pad-card"><label>新建知识包<input type="text" name="kbPackName" maxlength="32" placeholder="例如：英超主场、伤停笔记"></label>
    <button type="button" class="btn pri sm" data-act="kbCreatePack">创建</button></div>`;
  if (pending && !list.length) h += skeleton(2);
  else if (packsErr && !list.length) {
    h += empty(esc(packsErr), '<button type="button" class="btn ghost sm" data-act="kbRetryPacks">重试</button>', '加载失败');
  } else if (!list.length) {
    h += empty('还没有知识包，先创建一个吧。打开知识包可在画布上添加节点。', '', '暂无知识');
  } else {
    h += `<div class="list-meta" style="margin:8px 12px"><span>${list.length} 个知识包</span><button type="button" class="btn ghost sm" data-act="kbExport">导出备份</button></div>`;
    h += `<div class="kb-pack-list">${list.map(p => `<div class="kb-pack-row">
      <button type="button" class="kb-pack-main" data-go="#/kb/pack/${p.id}"><b>${esc(p.name)}</b><span>${p.itemCount || 0} 条</span></button>
      <button type="button" class="btn ghost sm" data-act="kbRenamePack" data-id="${p.id}" data-name="${esc(p.name)}">改名</button>
      <button type="button" class="btn ghost sm danger" data-act="kbDeletePack" data-id="${p.id}">删除</button>
    </div>`).join('')}</div>`;
  }
  return h + foot();
}

function pageKbPack(packId) {
  if (!loggedIn()) return hdr('知识包') + `<div class="pad-card"><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  const data = S.kb && S.kb.packItems && String(S.kb.packId) === String(packId) ? S.kb.packItems : null;
  const pack = data && data.pack;
  const items = (data && data.items) || [];
  const itemsErr = S.kb && S.kb.packItemsError;
  const itemsPending = S.kb && S.kb.loading && !data;
  let h = hdr(pack ? esc(pack.name) : '知识包', { back: true });
  if (itemsPending) {
    h += skeleton(3);
    return h + foot();
  }
  if (!data) {
    h += empty(itemsErr ? esc(itemsErr) : '无法打开该知识包', '<button type="button" class="btn ghost sm" data-act="kbRetryPack" data-id="' + esc(packId) + '">重试</button>', '加载失败');
    return h + foot();
  }
  h += `<div class="kb-canvas-page">
    <div id="kb-canvas-mount" class="kb-canvas-mount" aria-label="知识画布"></div>
    <p id="kb-canvas-hint" class="kb-canvas-hint${items.length ? ' hidden' : ''}">画布为空，点击右下角「添加节点」开始。</p>
    <button type="button" class="kb-canvas-fab" data-act="kbAddNode" data-pack="${esc(packId)}">添加节点</button>
  </div>`;
  return h + foot();
}

function pageKbPredict(matchId) {
  if (!loggedIn()) {
    return hdr('知识库预测') + `<div class="pad-card"><button class="btn pri block" data-go="#/login">去登录</button></div>` + foot();
  }
  const m = findMatch(matchId) || (S.results || []).find(x => String(x.id) === String(matchId));
  let h = hdr('知识库预测', { back: true });
  if (!m) {
    h += `<div class="pad-card"><p class="note">未找到场次 ${esc(matchId)}，请从预测列表或赛程进入。</p><button class="btn ghost sm" data-go="#/predict">返回预测</button></div>`;
    return h + foot();
  }
  h += `<div class="pad-card kb-match-hd"><div class="note">${esc(m.num || '')} · ${esc(m.league || '')}</div><h3 style="margin:6px 0">${esc(m.home)} vs ${esc(m.away)}</h3></div>`;
  const picker = (S.kb && S.kb.picker) || [];
  const sel = kbSelectedIds();
  const ivCur = (S.kb && S.kb.intervention) || 'medium';
  h += `<div class="pad-card"><h4 style="margin:0 0 8px">干预强度</h4><div class="chips kb-iv">${KB_IV.map(([k, lab, sub]) =>
    `<button type="button" class="${ivCur === k ? 'on' : ''}" data-act="kbIv" data-iv="${k}">${lab}<small>${sub}</small></button>`).join('')}</div></div>`;
  if (S.kb && S.kb.loading && !picker.length) h += skeleton(3);
  else if (!picker.length) {
    h += empty('还没有知识条目，先去创建知识包并添加内容。', '<button class="btn pri sm" data-go="#/kb">去管理</button>', '暂无知识');
  } else {
    h += `<div class="list-meta" style="margin:8px 12px"><span>已选 ${sel.length} 条（至少 1 条）</span></div>`;
    h += picker.map(pk => `<div class="kb-pick-pack"><div class="kb-pick-pack-h">${esc(pk.name)}</div>
      ${(pk.items || []).map(it => `<label class="kb-pick-item"><input type="checkbox" data-act="kbToggle" data-id="${it.id}" ${S.kb.selected[String(it.id)] ? 'checked' : ''}>
        <span><b>${esc(it.title)}</b></span></label>`).join('') || '<p class="note" style="padding:8px 12px">本包暂无条目</p>'}
    </div>`).join('');
    h += `<div class="pad-card"><button type="button" class="btn pri block" data-act="kbRunPredict" data-mid="${esc(matchId)}" ${sel.length ? '' : 'disabled'}>生成个人预测</button></div>`;
  }
  const res = S.kb && S.kb.lastResult;
  if (res && String(res.matchId) === String(matchId) && res.ok) {
    h += `<div class="pad-card kb-result">
      <h4>平台基线 vs 个人调整</h4>
      <p class="note">${esc(res.source || '')} · ${esc(res.interventionLabel || '')}</p>
      ${kbProbBlock('平台基线', res.base, res.basePick)}
      ${kbProbBlock('个人参考', res.adjusted, res.adjustedPick)}
      <h4 style="margin:14px 0 8px">归因</h4>
      <div class="kb-attr-list">${(res.attributions || []).map(a => `<div class="kb-attr"><div class="kb-attr-h"><span class="kb-tag">${esc(a.packName)}</span><b>${esc(a.title)}</b></div>
        <p class="note">${esc(a.snippet)}</p>
        <p style="margin:4px 0 0;font-size:13px">${esc(a.note)} · 主${(a.effect.h * 100).toFixed(1)}% 平${(a.effect.d * 100).toFixed(1)}% 客${(a.effect.a * 100).toFixed(1)}%</p></div>`).join('')}</div>
      <p class="note" style="margin-top:10px">${esc(res.disclaimerZh || '')}</p></div>`;
  }
  return h + foot();
}

// ======================= 我的（1.9.143 侧栏抽屉；#/me 重定向到首页并打开抽屉） =======================
function pageMe() {
  return pageHome();
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
  h += `<div class="vip-status ${mem ? 'on' : ''}"><div class="vs-l"><div class="vs-title">${mem ? '会员有效' : '尚未开通会员'}</div><div class="vs-sub">${mem ? `到期日 ${esc(fmtMemberUntil(until))} · 可续费叠加时长` : '订阅可解锁资讯与高级数据'}</div></div><div class="vs-badge">${I.vip}</div></div>`;
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
  h += `<div class="menu" style="margin-top:12px"><button data-go="#/orders"><span class="mic" style="background:#1a62f0">${I.doc}</span><span class="sp">订单记录</span>${I.arr}</button></div>`;
  /* vip-bar is position:fixed — keep at end of markup; .view.has-vip supplies scroll padding */
  h += `<div class="vip-bar"><button class="btn pri block" data-act="goPay" ${plans.length ? '' : 'disabled'}>${mem ? '续费会员' : '立即开通'} · ${esc(planAmountYuan(plans.find(x => x.id === sel) || plans[0] || { amountYuan: '0.00' }))} 元</button></div>`;
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
    <div class="ps-tip">资讯会员 / 高级数据服务</div></div>`;

  h += `<div class="sec-label">支付方式</div><div class="pay-channels">`;
  for (const ch of channels) {
    const on = S.payUi.channel === ch.id;
    const ic = ch.id === 'alipay' ? I.alipay : I.wechat;
    const bg = ch.id === 'alipay' ? '#1677ff' : '#09bb07';
    h += `<button type="button" class="pay-ch ${on ? 'on' : ''}" data-act="pickChannel" data-ch="${esc(ch.id)}"><span class="pay-ch-ic" style="background:${bg}">${ic}</span><span class="sp">${esc(ch.name)}</span><span class="pay-ch-mock">模拟</span>${on ? `<span class="pay-ch-ck">${I.check}</span>` : ''}</button>`;
  }
  h += `</div>`;
  h += `<label class="agree pay-agree"><input type="checkbox" data-act="payAgree" ${S.payUi.agree ? 'checked' : ''}><span>我已阅读并同意 <a href="#/member-terms">《会员服务协议》</a>，知悉当前为模拟支付、不会真实扣款；订阅仅对应资讯与高级数据。</span></label>`;
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
  h += `<p class="note" style="margin:12px">会员订单仅对应资讯/数据订阅。</p>`;
  return h + foot();
}

function pageMemberTerms() {
  return hdr('会员服务协议') + `<div class="doc">${TPL}<h2>竞彩预测会员服务协议（模板）</h2>
  <p>更新日期：2026年10月14日　运营方：【运营主体名称】</p>
  <h4>一、服务性质</h4><p>会员服务指向注册用户提供的<strong>资讯内容与高级数据访问</strong>权益（如高级预测简报、数据中心完整浏览、无广告纯净浏览等）。本服务面向资讯与数据访问，内容<strong>仅供参考</strong>。</p>
  <h4>二、费用与支付</h4><p>1. 会员套餐价格以应用内展示为准。<br>2. <strong>当前版本为模拟支付（sandbox/mock）</strong>：选择微信/支付宝仅演示流程，不会真实扣款。<br>3. 正式接入微信/支付宝前，须完成商户入驻、经营类目审核与证书配置；正式扣款上线前会另行告知。</p>
  <h4>三、权益与期限</h4><p>会员自支付成功（含模拟确认）起按套餐天数生效；续费在剩余有效期基础上叠加。权益以当时产品实际功能为准，内容仅供参考。</p>
  <h4>四、退款</h4><p>模拟支付无真实资金流转，不适用退款。正式支付上线后的退款规则由运营方依法公示。</p>
  <h4>五、使用规范</h4><p>不得利用本应用从事违法违规活动；会员服务仅对应资讯与数据权益，内容仅供参考。</p>
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
const infoBar = t => `<div class="warn-bar" style="background:var(--pri-l);border-color:var(--pri-m);color:var(--pri-d)">${t}</div>`;
function pagePlans() {
  let h = hdr('我的方案');
  h += infoBar(`方案仅作为个人记录${loggedIn() ? '，已同步到你的账号' : '保存在本机，<a href="#/login">登录</a>后可同步到账号'}；不会提交到任何第三方。`);
  if (!S.plans.length) return h + empty('在赛程或赛事详情中点击赔率选项，即可生成个人方案记录（仅个人备忘）。', '<button class="btn pri sm" data-go="#/schedule">去看赛程</button>', '还没有方案') + foot();
  h += '<div style="height:10px"></div><div class="grid">' + S.plans.map(p => `<div class="card plan"><div class="ph"><span class="sp">${esc((p.types || []).join('、'))} · ${esc(p.mult)}倍</span>${p.sample ? '<span class="sample-tag">示例数据</span>' : ''}<button class="del" data-act="delPlan" data-id="${esc(p.id)}">删除</button></div>
    ${(p.picks || []).map(x => `<div class="pk" style="padding:8px 0"><div class="n" style="font-size:13px">${esc(x.num)} ${esc(x.home)} vs ${esc(x.away)}</div><div class="items">${(x.items || []).map(it => `<span>${esc(it.label)} @${Number(it.odds).toFixed(2)}</span>`).join('')}</div></div>`).join('')}
    <div class="foot2"><span>${esc(new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false }))}</span><span>${esc(p.bets)}注 · 理论奖金 <b>${Number(p.min).toFixed(2)}~${Number(p.max).toFixed(2)}</b></span></div></div>`).join('') + '</div>';
  return h + foot();
}
function friendListRow(u, { showUnfollow } = {}) {
  const uid = u.userId;
  const av = avatarHtml(u.avatar, 'sm');
  const act = showUnfollow
    ? `<button type="button" class="btn ghost sm" data-act="userFollow" data-uid="${esc(String(uid))}">取消关注</button>`
    : (isUserFollow(uid)
      ? `<span class="uf-muted">已关注</span>`
      : `<button type="button" class="btn pri sm" data-act="userFollow" data-uid="${esc(String(uid))}">回关</button>`);
  return `<div class="uf-row">${av}<div class="uf-row-txt"><b>${esc(u.nickname || '球迷')}</b></div>${act}</div>`;
}
function pageFriends() {
  const tab = S.friendsTab === 'followers' ? 'followers' : 'following';
  let h = hdr('好友', { back: true });
  if (!loggedIn()) {
    return h + empty('登录后可查看你关注的用户与粉丝', '<button class="btn pri sm" data-go="#/login">登录</button>', '未登录') + foot();
  }
  h += `<div class="uf-tabs" role="tablist">
    <button type="button" class="uf-tab${tab === 'following' ? ' on' : ''}" data-act="friendsTab" data-tab="following" role="tab">我关注的</button>
    <button type="button" class="uf-tab${tab === 'followers' ? ' on' : ''}" data-act="friendsTab" data-tab="followers" role="tab">粉丝</button>
  </div>`;
  const cache = S.friendsListCache && S.friendsListCache[tab];
  if (cache === undefined) {
    h += '<div class="pad-card"><div class="spinner" style="margin:24px auto"></div></div>';
  } else if (!cache.length) {
    const msg = tab === 'following' ? '还没有关注任何人，在看帖时点击「+ 关注」添加好友。' : '暂无粉丝';
    h += empty(msg, tab === 'following' ? '<button class="btn pri sm" data-go="#/tribe">去论坛看看</button>' : '', tab === 'following' ? '列表为空' : '暂无粉丝');
  } else {
    h += `<div class="uf-list">${cache.map(u => friendListRow(u, { showUnfollow: tab === 'following' })).join('')}</div>`;
  }
  return h + foot();
}
async function loadFriendsList() {
  if (!loggedIn()) return;
  const tab = S.friendsTab === 'followers' ? 'followers' : 'following';
  S.friendsListCache = S.friendsListCache || {};
  try {
    const path = tab === 'followers' ? '/user-follows/followers' : '/user-follows/following';
    const j = await api(path, { timeout: 12000 });
    S.friendsListCache[tab] = j.users || [];
    if (tab === 'following') applyUserFollowList(j.users);
    if (route().name === 'friends') render({ force: true });
    if (meDrawerOpen()) syncMeDrawer();
  } catch (e) {
    S.friendsListCache[tab] = [];
    toast(e.message || '加载失败');
    if (route().name === 'friends') render({ force: true });
  }
}
function pageFavs() {
  let h = hdr('我的关注');
  if (!S.favs.length) return h + empty('在赛事详情页点击「关注」，即可把场次收藏到这里，方便跟踪。', '<button class="btn pri sm" data-go="#/schedule">去看赛程</button>', '还没有关注') + foot();
  if (!loggedIn()) h += infoBar('当前为游客，关注仅保存在本机。<a href="#/login">登录</a> 后自动同步到账号。');
  if (IS_APP) h += infoBar('关注场次进行中进球时，将弹出系统通知（需授予通知权限）。');
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
  <p class="auth-note">手机号 + 密码登录（暂未接入短信验证码）<br>登录即表示同意 <a href="#/terms" data-doc="terms">《用户协议》</a> 和 <a href="#/privacy" data-doc="privacy">《隐私政策》</a></p></div>`;
}
function pageRegister() {
  return `<div class="auth"><div class="auth-hd"><button class="back" data-act="back">${I.back}</button><div class="lg"></div><h1>注册账号</h1><p>注册后方案与关注可多设备同步</p></div>
  <form class="auth-card" id="fReg" novalidate>
    <div class="fld">${I.phone}<span class="pfx">+86</span><input name="phone" type="tel" inputmode="numeric" maxlength="11" placeholder="手机号（11位）" autocomplete="tel"></div>
    <div class="fld">${I.lock}<input name="password" type="password" maxlength="32" placeholder="设置密码（8-32位，含字母和数字）" autocomplete="new-password"><button type="button" class="eye" data-act="eye">显示</button></div>
    <div class="fld">${I.lock}<input name="password2" type="password" maxlength="32" placeholder="再次输入密码" autocomplete="new-password"></div>
    <div class="fld">${I.nick}<input name="nickname" maxlength="16" placeholder="昵称（选填，1-16字）"></div>
    <label class="agree"><input type="checkbox" name="agree"><span>我已年满18周岁，已阅读并同意 <a href="#/terms" data-doc="terms">《用户协议》</a> 和 <a href="#/privacy" data-doc="privacy">《隐私政策》</a>，知悉本应用仅提供资讯与预测分析。</span></label>
    <div class="form-err" id="err"></div>
    <button class="btn pri block" type="submit">注册并登录</button>
    <div class="auth-links"><span></span><button type="button" data-go="#/login">已有账号？去登录</button></div>
  </form>
  <p class="auth-note">暂未接入短信验证码，请牢记密码。</p></div>`;
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
  const th = homeTheme();
  return hdr('设置') + `<div class="sec-label" style="margin:14px 16px 6px">外观 / 主题</div>
    <div class="theme-pick">
      <button type="button" class="theme-opt ${th === 'luxury' ? 'on' : ''}" data-act="setTheme" data-theme="luxury">
        <span class="to-preview lux"></span>
        <span class="to-title">轻奢数据感</span>
        <span class="to-desc">浅色 · 数据 3D 主视觉 · 焦点对阵卡</span>
      </button>
      <button type="button" class="theme-opt ${th === 'pitch' ? 'on' : ''}" data-act="setTheme" data-theme="pitch">
        <span class="to-preview pitch"></span>
        <span class="to-title">绿茵沉浸感</span>
        <span class="to-desc">暗夜球场 · 软质足球主视觉 · 磨砂磁贴</span>
      </button>
    </div>
    <p class="note" style="margin:4px 16px 12px">选择会保存在本机，下次打开仍生效。也可在首页右下角主题条切换。</p>
    ${IS_APP ? '<p class="note" style="margin:4px 16px 12px">关注场次进行中进球时会弹出系统通知。首次关注或打开应用时将申请通知权限；拒绝后可在系统设置中开启。</p>' : ''}
    <div class="menu">
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
  <p class="note">命中率高于乱猜或全选主胜，不等于长期盈利；未计税、限额与截期。仅作方法说明。</p>`;
}
function pageAbout() {
  return hdr('关于') + `<div class="doc" style="text-align:center"><div style="width:72px;height:72px;margin:10px auto;border-radius:18px;background:url(icons/icon-192.png) center/cover;box-shadow:var(--sh2)"></div><h2>竞彩预测</h2><p class="note">版本 ${esc(CFG.version)} · ${IS_APP ? 'Android 应用' : '网页版'}</p></div>
  <div class="doc"><h4>我们提供什么</h4><p>竞彩足球在售赛程、胜平负/让球赔率、基于赔率隐含概率的预测分析、联赛积分榜/射手榜数据中心，以及开奖结果查询。</p>
  <h4>预测如何计算</h4><p>详情「预测」页生成赛前情报简报：赛况背景、近期战绩与进失球、交锋史、伤停（有第三方数据才写，否则标明暂无）、主客日程，以及市场赔率（仅参考项）。由服务端按场次缓存，避免打爆数据源配额。不编造伤停/比分/未发生新闻。</p>
  <h4>历史实测（基线）</h4>${baselineDoc()}
  <h4>服务说明</h4><p>「保存方案」仅为个人记录，不会被提交到任何第三方。应用内「资讯会员」订阅对应资讯与高级数据访问（当前为模拟支付）。全部内容<strong>仅供参考</strong>。</p>
  <h4>数据来源</h4><p>中国体育彩票官网公开数据，服务器约每 3 分钟更新；官方接口不可达时会明确标注「示例数据」。</p>
  <p class="note">本应用面向年满18周岁用户。${DISCLAIMER}</p></div>` + foot();
}
const TPL = '<div class="tpl">【模板文本】以下内容为占位模板，请店主/运营方根据实际运营主体信息及适用法律法规修改、并经专业人士审核后再正式使用。</div>';
function pageTerms() {
  return hdr('用户协议') + `<div class="doc">${TPL}<h2>竞彩预测用户协议（模板）</h2><p>更新日期：【YYYY年MM月DD日】　运营方：【运营主体名称】</p>
  <h4>一、服务内容</h4><p>本应用向用户提供体育赛事资讯、赔率展示、基于赔率的概率分析与开奖结果查询服务。上述内容<strong>仅供参考</strong>，不构成任何收益承诺。</p>
  <h4>二、服务范围</h4><p>「保存方案」功能仅为用户个人记录，不会提交给任何第三方。资讯会员订阅（若开通）仅对应资讯与数据权益，当前版本为模拟支付。全部内容仅供参考。</p>
  <h4>三、账号注册与使用</h4><p>用户须年满18周岁，应使用本人手机号注册，妥善保管密码，并对账号下的行为负责。不得利用本应用从事违法违规活动。</p>
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


// ======================= 专栏 / 比赛态度 / 付费云朵 (1.9.88) =======================
const COL_TOPIC_COLORS = {
  '首发': '#7b4ce0', '伤停': '#ff8a1f', '战报': '#12a150', '赛况': '#1a62f0', '分析': '#c2185b', '闲聊': '#546e7a',
};
const COL_EMPTY_ICO = `<div class="col-empty-ico" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="8" y="10" width="32" height="28" rx="4" stroke="#5b8def" stroke-width="2.2"/><path d="M14 18h20M14 24h14M14 30h10" stroke="#5b8def" stroke-width="2" stroke-linecap="round"/><circle cx="34" cy="32" r="8" fill="#5b8def"/><path d="M31 32.5l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
const COL_SEARCH_ICO = `<svg class="col-search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16.5 16.5 20 20"/></svg>`;
const COL_PRICE_OPTIONS = [0, 8, 18, 38, 68, 98];
const COL_COIN_ICO = `<img class="col-coin-ico" src="icons/yun-duo.png" alt="" width="16" height="16" decoding="async">`;
function colSettleTag(p) {
  if (!p || !p.pickLabel) return '';
  if (p.settleHit === true) return `<span class="col-settle hit">单选中</span>`;
  if (p.settleHit === false) return `<span class="col-settle miss">黑</span>`;
  return `<span class="col-settle open">待结算</span>`;
}
function colPriceBit(p) {
  const price = Number(p.priceCoins) || 0;
  if (price <= 0) return '';
  const bought = Number(p.purchaseCount) || 0;
  return `<span class="col-paid-meta"><span class="col-bought">${bought}人已购</span><span class="col-price">${COL_COIN_ICO}${price}</span></span>`;
}
function colTopicChip(tag) {
  if (!tag) return '';
  const c = COL_TOPIC_COLORS[tag] || '#546e7a';
  return `<span class="col-tag" style="--tag:${c}">${esc(tag)}</span>`;
}
function colEngagement(p) {
  return `<span class="col-eng">${Number(p.reads) || 0} 人阅读 · ${Number(p.likes) || 0} 赞</span>`;
}
function colTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p2 = (x) => String(x).padStart(2, '0');
  return `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function colStatsBadges(st) {
  if (!st) return '';
  if (st.insufficient && st.recentLabel) {
    return `<span class="col-badges"><span class="col-badge muted">${esc(st.recentLabel)}</span></span>`;
  }
  if (!st.recentLabel && !st.streakLabel && !st.hitPctLabel) return '';
  const bits = [];
  if (st.streakLabel) bits.push(`<span class="col-badge streak">${esc(st.streakLabel)}</span>`);
  if (st.recentLabel && !st.insufficient) bits.push(`<span class="col-badge recent">${esc(st.recentLabel)}</span>`);
  return `<span class="col-badges">${bits.join('')}</span>`;
}
function colHitPct(st) {
  if (!st || st.insufficient || !st.hitPctLabel) return '';
  return `<span class="col-hitpct"><small>单选比例</small><b>${esc(st.hitPctLabel)}</b></span>`;
}
function colAuthorCard(a) {
  const tags = (a.tags || []).slice(0, 3).map(colTopicChip).join('') || '<span class="col-tag muted">未设话题</span>';
  return `<button type="button" class="col-acard" data-go="#/column/author/${a.userId}">
    <div class="col-av">${avatarSvg(a.avatar || 'a1')}</div>
    <div class="col-anm">${esc(a.nickname || '球迷')}</div>
    ${colStatsBadges(a.stats)}
    <div class="col-atags">${tags}</div>
  </button>`;
}
/** Empty 2×2 chrome so layout still matches 澳客严选 author wall when no writers yet */
function colAuthorPlaceholders(n = 4) {
  const phTags = [
    colTopicChip('首发'), colTopicChip('伤停'), colTopicChip('战报'), colTopicChip('赛况'),
  ];
  return Array.from({ length: n }, (_, i) =>
    `<div class="col-acard col-acard-ph" aria-hidden="true">
      <div class="col-av">${avatarSvg('a' + ((i % 4) + 1))}</div>
      <div class="col-anm">虚位以待</div>
      <div class="col-atags">${phTags[i % phTags.length]}</div>
    </div>`
  ).join('');
}
function colAuthorsWallHtml(authors) {
  const list = (authors || []).slice(0, 4);
  const inner = list.length
    ? list.map(colAuthorCard).join('')
    : colAuthorPlaceholders(4);
  return `<div class="col-wall-card"><div class="col-wall-grid">${inner}</div>${!list.length ? `<p class="col-wall-empty">还没有专栏作者 · 登录后可开通，分享首发/伤停/赛况等真实观点</p>` : ''}</div>`;
}
function colFeedEmptyHtml(tab) {
  const tip = tab === 'attitude'
    ? '还没有比赛态度帖。登录后可关联场次并可选胜平负表态；完场后按赛果自动结算真实战绩。'
    : '还没有星球互动帖。聊球、闲聊、复盘都可以发到这里。';
  const btn = loggedIn()
    ? '<button class="btn pri sm" data-go="#/column/compose">发帖</button>'
    : '<button class="btn pri sm" data-go="#/login">登录后发帖</button>';
  return `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">暂无内容</div><div class="empty-d">${tip}</div>${btn}</div>`;
}
function colPostCard(p, { showDel = false, authorMode = false } = {}) {
  const a = p.author || {};
  const mine = loggedIn() && S.user && a.userId === S.user.id;
  const del = (showDel || mine) ? `<button type="button" class="col-del" data-act="colDel" data-id="${p.id}" aria-label="删除">删除</button>` : '';
  const matchBit = p.matchLabel
    ? `<button type="button" class="col-match" data-go="${p.matchId ? '#/match/' + encodeURIComponent(p.matchId) : '#/column'}">${esc(p.matchLabel)}</button>`
    : (p.matchId ? `<button type="button" class="col-match" data-go="#/match/${encodeURIComponent(p.matchId)}">关联比赛</button>` : '');
  const likeOn = p.liked ? 'on' : '';
  const pickBit = p.pickLabel
    ? `<span class="col-pick ${p.settleHit === true ? 'hit' : p.settleHit === false ? 'miss' : 'open'}">${esc(p.pickLabel)}${
        p.settleHit === true ? ' · 单选中' : p.settleHit === false ? ' · 黑' : ' · 待结算'
      }</span>`
    : '';
  const authStats = authorMode ? '' : colStatsBadges(a.stats);
  const locked = !!p.locked;
  const bodyHtml = locked
    ? `<div class="col-pbody col-locked"><div class="col-lock-mask">${esc(p.bodyPreview || '付费内容 · 解锁后查看')}</div>
        <button type="button" class="btn pri sm col-unlock-btn" data-act="colBuy" data-id="${p.id}" data-price="${Number(p.priceCoins) || 0}">${COL_COIN_ICO}${Number(p.priceCoins) || 0} 云朵解锁</button></div>`
    : `<div class="col-pbody">${esc(sanitizeBanCopy(p.body || ''))}</div>`;
  const titleHtml = p.title
    ? `<h3 class="col-ptitle">${esc(p.title)}${p.paid ? '<span class="col-paid-chip">收费</span>' : ''}</h3>`
    : (p.paid ? `<h3 class="col-ptitle"><span class="col-paid-chip">收费</span> 付费观点</h3>` : '');
  return `<article class="col-post ${p.paid ? 'paid' : ''} ${locked ? 'is-locked' : ''}" data-post="${p.id}">
    <header class="col-phd">
      <button type="button" class="col-pauth" data-go="#/column/author/${a.userId}">
        <span class="col-av sm">${avatarSvg(a.avatar || 'a1')}</span>
        <span class="col-anm">${esc(a.nickname || '球迷')}</span>
      </button>
      ${authStats}
      ${colTopicChip(p.topic)}
      <span class="col-time">${esc(colTime(p.createdAt))}</span>
      ${del}
    </header>
    ${titleHtml}
    ${bodyHtml}
    <footer class="col-pft">
      ${matchBit}
      ${pickBit}
      ${colSettleTag(p)}
      ${colPriceBit(p)}
      ${colEngagement(p)}
      <button type="button" class="col-like ${likeOn}" data-act="colLike" data-id="${p.id}" data-liked="${p.liked ? 1 : 0}">${p.liked ? '已赞' : '点赞'}</button>
    </footer>
  </article>`;
}
async function fillHomeColumnAuthors() {
  const el = document.getElementById('home-column-authors');
  if (!el) return;
  try {
    if (!S.columnAuthors) {
      const j = await api('/column/authors?limit=4', { timeout: 10000 });
      S.columnAuthors = j.authors || [];
    }
    const list = S.columnAuthors.slice(0, 4);
    if (!list.length) {
      el.innerHTML = colAuthorsWallHtml([]) + '';
      return;
    }
    el.innerHTML = colAuthorsWallHtml(list);
  } catch (e) {
    el.innerHTML = `<div class="note">专栏暂时不可用</div>`;
  }
}
async function ensureColumnFeed(tab, force) {
  const key = tab === 'interact' ? 'interact' : 'attitude';
  if (!force && S.columnFeed[key] && S.columnFeed[key].posts) return S.columnFeed[key];
  const j = await api('/column/feed?tab=' + encodeURIComponent(key) + '&limit=30', { timeout: 12000 });
  S.columnFeed[key] = j;
  return j;
}
function colFilterPosts(posts, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return posts || [];
  return (posts || []).filter((p) => {
    const hay = [p.title, p.body, p.matchLabel, p.topic, p.author && p.author.nickname].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(s);
  });
}
function pageColumn(arg) {
  const parts = String(arg || '').split('/').filter(Boolean);
  if (parts[0] === 'author' && parts[1]) return pageColumnAuthor(parts[1]);
  if (parts[0] === 'compose') return pageColumnCompose();
  if (parts[0] === 'edit') return pageColumnEdit();
  if (parts[0] === 'wallet') return pageColumnWallet();
  if (parts[0] === 'post' && parts[1]) return pageColumnPost(parts[1]);

  const tab = (route().query && route().query.tab) || S.columnTab || 'attitude';
  S.columnTab = tab === 'interact' ? 'interact' : 'attitude';
  const q = (S.columnSearch || '').trim();
  let h = hdr('球迷专栏', {
    back: true,
    right: loggedIn()
      ? `<button class="ic-btn" data-go="#/column/compose" aria-label="发帖" title="发帖">＋</button>`
      : `<button class="ic-btn" data-go="#/login" aria-label="登录">登</button>`,
  });
  h += `<div class="col-page">`;
  h += `<div class="col-search"><form id="fColSearch" action="#" autocomplete="off" role="search">
    ${COL_SEARCH_ICO}
    <input name="q" type="search" enterkeyhint="search" maxlength="40" placeholder="请输入查询的内容" value="${esc(q)}" aria-label="搜索专栏">
  </form></div>`;
  h += `<div class="col-intro"><b>真实用户专栏</b> · 完场结算真实战绩 · 可用云朵发布/解锁付费观点。</div>`;
  h += `<div class="col-wall-wrap"><div class="sec-h" style="margin-top:4px"><h2>专栏作者</h2>${loggedIn() ? `<span class="col-sec-actions"><button class="more" data-go="#/column/wallet">云朵 ${I.arr}</button><button class="more" data-go="#/column/edit">编辑我的专栏 ${I.arr}</button></span>` : `<button class="more" data-go="#/login">登录开通 ${I.arr}</button>`}</div>`;
  h += `<div id="col-authors-main" class="col-wall">${S.columnAuthors && S.columnAuthors.length ? colAuthorsWallHtml(S.columnAuthors) : skeletonNews(1)}</div></div>`;
  h += `<div class="col-tabs">
    <button type="button" class="${S.columnTab === 'attitude' ? 'on' : ''}" data-act="colTab" data-tab="attitude">比赛态度</button>
    <button type="button" class="${S.columnTab === 'interact' ? 'on' : ''}" data-act="colTab" data-tab="interact">星球互动</button>
  </div>`;
  h += `<div id="col-feed" class="col-feed">${skeletonNews(2)}</div>`;
  h += `</div>`;
  setTimeout(() => {
    fillHomeColumnAuthors();
    const el = document.getElementById('col-authors-main');
    if (el && S.columnAuthors && S.columnAuthors.length) {
      el.innerHTML = colAuthorsWallHtml(S.columnAuthors);
    } else if (el) {
      api('/column/authors?limit=4').then((j) => {
        S.columnAuthors = j.authors || [];
        if (!el.isConnected) return;
        el.innerHTML = colAuthorsWallHtml(S.columnAuthors);
      }).catch(() => { if (el.isConnected) el.innerHTML = '<div class="note">加载失败</div>'; });
    }
    loadColumnFeedUi();
  }, 0);
  return h + foot();
}
async function loadColumnFeedUi() {
  const el = document.getElementById('col-feed');
  if (!el) return;
  try {
    const j = await ensureColumnFeed(S.columnTab, true);
    if (!el.isConnected) return;
    const posts = colFilterPosts(j.posts || [], S.columnSearch);
    if (!posts.length) {
      el.innerHTML = colFeedEmptyHtml(S.columnTab) +
        (S.columnSearch ? `<p class="col-note">未找到与「${esc(S.columnSearch)}」匹配的内容</p>` : '');
      return;
    }
    el.innerHTML = posts.map((p) => colPostCard(p)).join('') +
      `<p class="col-note">${esc(j.noteZh || '真实用户观点 · 战绩仅来自完场结算')}</p>`;
  } catch (e) {
    if (el.isConnected) el.innerHTML = `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">加载失败</div><div class="empty-d">${esc(e.message || '请稍后重试')}</div><button class="btn ghost sm" data-act="colTab" data-tab="${S.columnTab}">重试</button></div>`;
  }
}
function pageColumnAuthor(userId) {
  const id = String(userId || '');
  const q = (route().query || {});
  const tab = ['all', 'football', 'paid'].includes(q.tab) ? q.tab : 'all';
  S.columnAuthorTab = tab;
  let h = hdr('专栏作者');
  h += `<div class="col-page"><div id="col-author-page" class="col-author-page">${skeletonNews(2)}</div></div>`;
  setTimeout(async () => {
    const el = document.getElementById('col-author-page');
    if (!el) return;
    try {
      const j = await api('/column/authors/' + encodeURIComponent(id) + '?limit=40&tab=' + encodeURIComponent(tab), { timeout: 12000 });
      S.columnAuthorCache[id] = j;
      if (!el.isConnected) return;
      const a = j.author || {};
      const tags = (a.tags || []).map(colTopicChip).join('') || '<span class="note">未设置话题标签</span>';
      const tabs = [
        ['all', '全部态度'],
        ['football', '足球态度'],
        ['paid', '收费'],
      ];
      let html = `<div class="col-aprofile">
        <div class="col-av lg">${avatarSvg(a.avatar || 'a1')}</div>
        <div class="col-anm">${esc(a.nickname || '球迷')}</div>
        <div class="col-atags">${tags}</div>
        <div class="col-abio">${esc(a.bio || '这个作者还没有简介')}</div>
        <div class="col-astat">${Number(a.postCount) || 0} 篇帖子${a.paidCount ? ' · ' + a.paidCount + ' 篇收费' : ''}${a.stats && a.stats.recentLabel ? ' · ' + esc(a.stats.recentLabel) + (a.stats.streakLabel ? ' · ' + esc(a.stats.streakLabel) : '') : ''}</div>
      </div>`;
      html += `<div class="col-tabs col-author-tabs" role="tablist">
        ${tabs.map(([k, lab]) => {
          const paidMark = k === 'paid' ? '<span class="col-tab-check" aria-hidden="true">✓</span>' : '';
          return `<button type="button" class="${tab === k ? 'on' : ''}" data-act="colAuthorTab" data-uid="${esc(id)}" data-tab="${k}">${esc(lab)}${paidMark}</button>`;
        }).join('')}
      </div>`;
      const posts = j.posts || [];
      if (!posts.length) {
        html += colFeedEmptyHtml(tab === 'paid' ? 'interact' : 'attitude');
      } else {
        const latest = posts[0];
        const hist = posts.slice(1);
        html += `<div class="col-sec-label">最新表态(${posts.length ? 1 : 0})</div>`;
        html += colAttitudeCard(latest);
        if (hist.length) {
          html += `<div class="col-sec-label">历史表态</div>`;
          html += hist.map((p) => colAttitudeCard(p)).join('');
        }
      }
      el.innerHTML = html;
    } catch (e) {
      if (el.isConnected) el.innerHTML = `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">加载失败</div><div class="empty-d">${esc(e.message || '')}</div><button class="btn ghost sm" data-act="back">返回</button></div>`;
    }
  }, 0);
  return h + foot();
}

/** 1.9.88: match detail「态度」— 澳客-style cards for this matchId */
function matchAttitudeTabHtml(x) {
  const mid = String(x && x.id || '');
  const label = x ? `${x.home || ''} vs ${x.away || ''}` : '';
  const composeQ = mid
    ? `#/column/compose?matchId=${encodeURIComponent(mid)}&matchLabel=${encodeURIComponent((x.num ? x.num + ' ' : '') + label)}`
    : '#/column/compose';
  const actions = loggedIn()
    ? `<button type="button" class="btn pri sm" data-go="${composeQ}">发表态度</button>
       <button type="button" class="btn ghost sm" data-go="#/column/wallet">云朵钱包</button>`
    : `<button type="button" class="btn pri sm" data-go="#/login">登录后发表态度</button>`;
  return `<div class="dsec match-attitude-sec" id="match-attitude-${esc(mid)}">
    <div class="match-att-hd"><h3>态度</h3><div class="match-att-actions">${actions}</div></div>
    <p class="note">平台简报与用户观点同列展示 · 完场按赛果结算战绩 · 付费帖用云朵解锁。</p>
    <div id="match-attitude-list-${esc(mid)}" class="match-att-list">${skeletonNews(2)}</div>
  </div>`;
}
async function loadMatchAttitude(x) {
  if (!x || !x.id) return;
  const mid = String(x.id);
  const listEl = document.getElementById('match-attitude-list-' + mid);
  if (!listEl) return;
  try {
    const j = await api('/column/feed?tab=attitude&matchId=' + encodeURIComponent(mid) + '&limit=40', { timeout: 12000 });
    S.matchAttitude = S.matchAttitude || {};
    S.matchAttitude[mid] = j;
    if (!listEl.isConnected) return;
    const posts = j.posts || [];
    if (!posts.length) {
      const composeQ = `#/column/compose?matchId=${encodeURIComponent(mid)}&matchLabel=${encodeURIComponent((x.num ? x.num + ' ' : '') + (x.home || '') + ' vs ' + (x.away || ''))}`;
      listEl.innerHTML = `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">本场暂无态度</div><div class="empty-d">还没有用户对本场发表观点。完场后表态会按赛果结算真实战绩。</div>${
        loggedIn()
          ? `<button class="btn pri sm" data-go="${composeQ}">发表态度</button>`
          : `<button class="btn pri sm" data-go="#/login">登录后发表</button>`
      }</div>`;
      return;
    }
    listEl.innerHTML = posts.map(colMatchAttitudeCard).join('');
  } catch (e) {
    if (listEl.isConnected) {
      listEl.innerHTML = `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">加载失败</div><div class="empty-d">${esc(e.message || '请稍后重试')}</div>
        <button class="btn ghost sm" data-act="detailTab" data-id="${esc(mid)}" data-tab="attitude">重试</button></div>`;
    }
  }
}
/** 澳客-style card on match detail: author · streak · hit% · 已购 · 云朵价 */
function colMatchAttitudeCard(p) {
  if (!p) return '';
  const a = p.author || {};
  const st = a.stats || null;
  const plat = !!p.isPlatformBrief;
  const locked = !!p.locked;
  const bodyText = sanitizeBanCopy(p.body || '');
  const preview = locked
    ? (p.bodyPreview || '付费内容 · 解锁后查看全文')
    : (bodyText.length > 140 ? bodyText.slice(0, 140) + '…' : bodyText);
  const unlock = locked
    ? `<button type="button" class="btn pri sm col-unlock-btn" data-act="colBuy" data-id="${p.id}" data-price="${Number(p.priceCoins) || 0}">${COL_COIN_ICO}${Number(p.priceCoins) || 0} 云朵解锁</button>`
    : '';
  const pickBit = p.pickLabel
    ? `<span class="col-pick ${p.settleHit === true ? 'hit' : p.settleHit === false ? 'miss' : 'open'}">${esc(p.pickLabel)}${
        p.settleHit === true ? ' · 单选中' : p.settleHit === false ? ' · 黑' : ''
      }</span>`
    : '';
  const price = Number(p.priceCoins) || 0;
  const bought = Number(p.purchaseCount) || 0;
  const footPaid = price > 0
    ? `<div class="col-att-foot"><span class="col-bought">${bought}人已购</span>
        <span class="col-price-tag"><span class="col-single">单场</span>${COL_COIN_ICO}<b>${price}</b></span></div>`
    : `<div class="col-att-foot"><span class="col-eng">${Number(p.reads) || 0} 阅读 · ${Number(p.likes) || 0} 赞</span>${pickBit}</div>`;
  const authHead = plat
    ? `<span class="col-pauth col-pauth-plat"><span class="ha-av sm" aria-hidden="true">${I.chart}</span><span class="col-anm">${esc(a.nickname || '平台简报')}</span></span>`
    : `<button type="button" class="col-pauth" data-go="#/column/author/${a.userId}">
        <span class="col-av sm">${avatarSvg(a.avatar || 'a1')}</span>
        <span class="col-anm">${esc(a.nickname || '球迷')}</span>
      </button>`;
  return `<article class="col-macard ${p.paid ? 'paid' : ''} ${locked ? 'is-locked' : ''} ${plat ? 'platform-brief' : ''}" data-post="${p.id}">
    <header class="col-macard-hd">
      ${authHead}
      ${colStatsBadges(st)}
      ${colHitPct(st)}
    </header>
    ${p.title ? `<h3 class="col-ptitle">${esc(p.title)}</h3>` : ''}
    <div class="col-macard-body ${locked ? 'col-locked' : ''}">${esc(preview)}</div>
    ${unlock ? `<div class="col-macard-unlock">${unlock}</div>` : ''}
    ${footPaid}
  </article>`;
}

/** 澳客-style attitude card: title + match row + settle tag + 已购/价格 */
function colAttitudeCard(p) {
  if (!p) return '';
  const locked = !!p.locked;
  const title = p.title || (p.pickLabel ? p.pickLabel : (p.topic || '观点'));
  const leagueBit = p.matchLabel ? `【${esc(String(p.matchLabel).split(/\s+/).slice(0, 2).join('/'))}】` : '';
  const settle = colSettleTag(p);
  const scoreOrLabel = p.matchLabel
    ? `<div class="col-att-match"><span class="col-att-mlab">${esc(p.matchLabel)}</span>${settle}</div>`
    : '';
  const bodyText = sanitizeBanCopy(p.body || '');
  const body = locked
    ? `<div class="col-att-body col-locked"><p>${esc(p.bodyPreview || '付费内容')}</p>
        <button type="button" class="btn pri sm" data-act="colBuy" data-id="${p.id}" data-price="${Number(p.priceCoins) || 0}">${COL_COIN_ICO}${Number(p.priceCoins) || 0} 云朵解锁</button></div>`
    : `<div class="col-att-body">${esc(bodyText.slice(0, 120))}${bodyText.length > 120 ? '…' : ''}</div>`;
  const footPaid = p.paid
    ? `<div class="col-att-foot">${colPriceBit(p)}</div>`
    : `<div class="col-att-foot"><span class="col-eng">${Number(p.reads) || 0} 阅读 · ${Number(p.likes) || 0} 赞</span></div>`;
  return `<article class="col-att-card ${p.paid ? 'paid' : ''} ${locked ? 'is-locked' : ''}" data-post="${p.id}">
    <button type="button" class="col-att-head" data-go="#/column/post/${p.id}">
      <div class="col-att-title">${leagueBit}<b>${esc(title)}</b></div>
    </button>
    ${scoreOrLabel}
    ${body}
    ${footPaid}
  </article>`;
}
function pageColumnEdit() {
  if (!loggedIn()) { setTimeout(() => go('#/login', true), 0); return hdr('编辑专栏') + `<div class="col-page">` + empty('请先登录', '<button class="btn pri sm" data-go="#/login">去登录</button>') + `</div>` + foot(); }
  let h = hdr('编辑我的专栏');
  h += `<div class="col-page"><div id="col-edit" class="pad-card col-edit">${skeletonNews(1)}</div></div>`;
  setTimeout(async () => {
    const el = document.getElementById('col-edit');
    if (!el) return;
    try {
      const j = await api('/column/me');
      S.columnMe = j.author;
      const topics = j.topics || Object.keys(COL_TOPIC_COLORS);
      const selected = new Set((j.author && j.author.tags) || []);
      el.innerHTML = `
        <p class="note">设置昵称请到「个人资料」。此处编辑专栏简介与擅长话题（最多 4 个）。战绩仅统计完场后自动结算的胜平负表态。</p>
        <label class="fld"><span>简介（${80}字内）</span><textarea id="colBio" rows="3" maxlength="80" placeholder="一句话介绍你关注的联赛或擅长方向">${esc((j.author && j.author.bio) || '')}</textarea></label>
        <div class="col-tag-pick" id="colTagPick">${topics.map((tg) =>
          `<button type="button" class="col-tag-btn ${selected.has(tg) ? 'on' : ''}" data-act="colToggleTag" data-tag="${esc(tg)}">${esc(tg)}</button>`
        ).join('')}</div>
        <button type="button" class="btn pri block" data-act="colSaveProfile">保存专栏资料</button>
        <button type="button" class="btn ghost block" data-go="#/column/compose" style="margin-top:8px">去发帖</button>`;
    } catch (e) {
      if (el.isConnected) el.innerHTML = `<p class="note">${esc(e.message)}</p>`;
    }
  }, 0);
  return h + foot();
}
function syncColumnComposeFromDom() {
  const c = S.columnCompose || (S.columnCompose = { kind: 'match', topic: '分析', matchId: '', matchLabel: '', title: '', body: '', pick: '', priceCoins: 0 });
  const sel = document.getElementById('colMatchSel');
  if (sel) {
    c.matchId = sel.value || '';
    const opt = sel.selectedOptions && sel.selectedOptions[0];
    c.matchLabel = (opt && (opt.dataset.label || opt.textContent)) || c.matchLabel || '';
  }
  const titleEl = document.getElementById('colTitle');
  if (titleEl) c.title = titleEl.value || '';
  const bodyEl = document.getElementById('colBody');
  if (bodyEl) c.body = bodyEl.value || '';
  const priceOn = document.querySelector('#colPricePick .col-price-btn.on');
  if (priceOn) c.priceCoins = parseInt(priceOn.dataset.price, 10) || 0;
  return c;
}
function pageColumnCompose() {
  if (!loggedIn()) { setTimeout(() => go('#/login', true), 0); return hdr('发帖') + `<div class="col-page">` + empty('请先登录', '<button class="btn pri sm" data-go="#/login">去登录</button>') + `</div>` + foot(); }
  const c = S.columnCompose || { kind: 'match', topic: '分析', matchId: '', matchLabel: '', title: '', body: '', pick: '', priceCoins: 0 };
  // prefill match from query
  const q = route().query || {};
  if (q.matchId) { c.matchId = q.matchId; c.kind = 'match'; }
  if (q.matchLabel) c.matchLabel = q.matchLabel;
  S.columnCompose = c;
  const upcoming = (S.matches || []).filter((m) => Date.now() < kickoff(m) + 3 * 3600e3).slice(0, 40);
  let h = hdr('发帖');
  h += `<div class="col-page"><div class="pad-card col-compose">
    <p class="note">发布真实观点。可选胜平负表态，完场后按赛果自动结算；可设云朵价格（0=免费）。</p>
    <div class="fld"><span>云朵价格（虚拟币）</span>
      <div class="col-price-pick" id="colPricePick">
        ${COL_PRICE_OPTIONS.map((pr) =>
          `<button type="button" class="col-price-btn ${(Number(c.priceCoins)||0) === pr ? 'on' : ''}" data-act="colPrice" data-price="${pr}">${pr === 0 ? '免费' : COL_COIN_ICO + pr}</button>`
        ).join('')}
      </div>
    </div>
    <div class="col-kind">
      <button type="button" class="${c.kind === 'match' ? 'on' : ''}" data-act="colKind" data-kind="match">比赛态度</button>
      <button type="button" class="${c.kind === 'general' ? 'on' : ''}" data-act="colKind" data-kind="general">星球互动</button>
    </div>
    <div class="col-tag-pick">${Object.keys(COL_TOPIC_COLORS).map((tg) =>
      `<button type="button" class="col-tag-btn ${c.topic === tg ? 'on' : ''}" data-act="colComposeTopic" data-tag="${esc(tg)}">${esc(tg)}</button>`
    ).join('')}</div>
    ${c.kind === 'match' ? `
      <label class="fld"><span>关联比赛</span>
        <select id="colMatchSel">
          <option value="">请选择场次</option>
          ${upcoming.map((m) => {
            const lab = `${m.num || ''} ${m.home} vs ${m.away}`;
            const sel = String(c.matchId) === String(m.id) ? ' selected' : '';
            return `<option value="${esc(String(m.id))}" data-label="${esc(lab)}"${sel}>${esc(m.date.slice(5) + ' ' + m.time + ' · ' + lab)}</option>`;
          }).join('')}
        </select>
      </label>
      <div class="fld"><span>胜平负表态（可选，赛后自动结算）</span>
        <div class="col-pick-row" id="colPickRow">
          ${[['H','主胜'],['D','平局'],['A','客胜']].map(([k, lab]) =>
            `<button type="button" class="col-pick-btn ${c.pick === k ? 'on' : ''}" data-act="colPick" data-pick="${k}">${lab}</button>`
          ).join('')}
          <button type="button" class="col-pick-btn ghost ${!c.pick ? 'on' : ''}" data-act="colPick" data-pick="">不表态</button>
        </div>
      </div>` : ''}
    <label class="fld"><span>标题（可选）</span><input id="colTitle" maxlength="40" placeholder="一句话概括" value="${esc(c.title || '')}"></label>
    <label class="fld"><span>正文</span><textarea id="colBody" rows="6" maxlength="800" placeholder="分享你的看法…">${esc(c.body || '')}</textarea></label>
    <button type="button" class="btn pri block" data-act="colPublish">发布</button>
  </div></div>`;
  return h + foot();
}
function pageColumnWallet() {
  if (!loggedIn()) { setTimeout(() => go('#/login', true), 0); return hdr('云朵钱包') + `<div class="col-page">` + empty('请先登录', '<button class="btn pri sm" data-go="#/login">去登录</button>') + `</div>` + foot(); }
  let h = hdr('云朵钱包');
  h += `<div class="col-page"><div id="col-wallet" class="pad-card col-wallet">${skeletonNews(1)}</div></div>`;
  setTimeout(async () => {
    const el = document.getElementById('col-wallet');
    if (!el) return;
    try {
      const j = await api('/column/wallet');
      S.columnWallet = j;
      if (S.user) S.user.coinBalance = j.coins;
      const packs = j.packs || [];
      el.innerHTML = `
        <div class="col-wallet-bal"><div class="lab">当前云朵</div><div class="num">${COL_COIN_ICO}${Number(j.coins) || 0}</div></div>
        <p class="note">${esc(j.noteZh || '云朵用于解锁专栏付费观点；模拟充值不真实扣款。')}</p>
        <div class="col-pack-list">${packs.map((pk) => `
          <button type="button" class="col-pack ${pk.highlight ? 'hi' : ''}" data-act="colTopup" data-pack="${esc(pk.id)}">
            <div class="col-pack-l"><b>${esc(pk.label)}</b>${pk.tag ? `<span class="col-pack-tag">${esc(pk.tag)}</span>` : ''}</div>
            <div class="col-pack-r"><span class="yen">¥${esc(pk.amountYuan)}</span><span class="hint">模拟支付</span></div>
          </button>`).join('')}</div>
        <button type="button" class="btn ghost block" data-go="#/column" style="margin-top:12px">返回专栏</button>`;
    } catch (e) {
      if (el.isConnected) el.innerHTML = `<p class="note">${esc(e.message)}</p>`;
    }
  }, 0);
  return h + foot();
}
function pageColumnPost(id) {
  let h = hdr('帖子详情');
  h += `<div class="col-page"><div id="col-post-detail">${skeletonNews(1)}</div></div>`;
  setTimeout(async () => {
    const el = document.getElementById('col-post-detail');
    if (!el) return;
    try {
      const j = await api('/column/posts/' + encodeURIComponent(id));
      if (!el.isConnected) return;
      el.innerHTML = colPostCard(j.post, { showDel: true });
    } catch (e) {
      if (el.isConnected) el.innerHTML = `<div class="col-feed-empty">${COL_EMPTY_ICO}<div class="empty-t">加载失败</div><div class="empty-d">${esc(e.message || '')}</div></div>`;
    }
  }, 0);
  return h + foot();
}


// ======================= global search (1.9.119) =======================
const SEARCH_TABS = [['all', '全部'], ['teams', '球队'], ['players', '球员'], ['matches', '比赛']];
function searchTabOf() {
  const t = (route().query && route().query.tab) || S.searchTab || 'all';
  return SEARCH_TABS.some(([k]) => k === t) ? t : 'all';
}
function setSearchTab(t) {
  S.searchTab = SEARCH_TABS.some(([k]) => k === t) ? t : 'all';
}
function pageSearch() {
  const r = route();
  const q = String((r.query && r.query.q) || S.searchQ || '').trim();
  S.searchQ = q;
  const tab = searchTabOf();
  S.searchTab = tab;
  let h = `<header class="hdr search-page-hdr">
    <button type="button" class="ic-btn" data-act="back" aria-label="返回">${I.back}</button>
    <form class="gs-bar" id="fGlobalSearch" action="#" autocomplete="off">
      <span class="gs-ico" aria-hidden="true">${I.search}</span>
      <input id="gsInput" name="q" type="search" enterkeyhint="search" maxlength="40"
        placeholder="请输入查询的内容" value="${esc(q)}" aria-label="搜索球队、球员、比赛" />
      ${q ? `<button type="button" class="gs-clear" data-act="searchClearInput" aria-label="清除">${I.clear}</button>` : ''}
    </form>
    <button type="button" class="gs-go" data-act="searchSubmit">搜索</button>
  </header>`;
  h += `<div class="gs-tabs">${SEARCH_TABS.map(([k, lab]) =>
    `<button type="button" class="${tab === k ? 'on' : ''}" data-act="searchTab" data-tab="${k}">${lab}</button>`
  ).join('')}</div>`;
  h += `<div id="gsResults" class="gs-results">${q ? '<div class="spinner"></div>' : empty('输入球队、球员或比赛关键词开始搜索', '', '全局搜索')}</div>`;
  setTimeout(() => {
    const inp = document.getElementById('gsInput');
    if (inp) {
      try { inp.focus(); if (q) inp.setSelectionRange(q.length, q.length); } catch { /* ignore */ }
    }
    if (q) runGlobalSearch(q, tab);
    bindGlobalSearchInput();
  }, 0);
  return h;
}
function bindGlobalSearchInput() {
  const form = document.getElementById('fGlobalSearch');
  const inp = document.getElementById('gsInput');
  if (!form || !inp || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commitSearchQuery(String(inp.value || '').trim());
  });
  inp.addEventListener('input', () => {
    clearTimeout(bindGlobalSearchInput._t);
    const term = String(inp.value || '').trim();
    S.searchQ = term;
    bindGlobalSearchInput._t = setTimeout(() => {
      if (route().name !== 'search') return;
      commitSearchQuery(term, true);
    }, 320);
  });
}
function commitSearchQuery(term, soft) {
  const tab = searchTabOf();
  const q = String(term || '').trim();
  S.searchQ = q;
  const hash = q
    ? `#/search?q=${encodeURIComponent(q)}&tab=${encodeURIComponent(tab)}`
    : `#/search?tab=${encodeURIComponent(tab)}`;
  if (soft) {
    // Keep input focused while typing: update URL without re-render
    if (location.hash !== hash) {
      history.replaceState(null, '', hash);
      if (typeof NAV !== 'undefined') {
        if (NAV.length) NAV[NAV.length - 1] = hash;
        else NAV.push(hash);
      }
    }
    runGlobalSearch(q, tab);
    return;
  }
  if (location.hash !== hash) go(hash, false);
  else runGlobalSearch(q, tab);
}
function gsLogo(url, name) {
  if (!url) return `<span class="gs-av letter">${esc([...(name || '?')][0] || '?')}</span>`;
  const letter = esc([...(name || '?')][0] || '?');
  return `<span class="gs-av"><img alt="" width="40" height="40" decoding="async" src="${esc(API + '/api/logo?url=' + encodeURIComponent(url))}" onerror="this.parentNode.classList.add('letter');this.parentNode.textContent='${letter}';"/></span>`;
}
function renderSearchSection(title, rows, moreTab) {
  if (!rows || !rows.length) return '';
  const more = moreTab
    ? `<button type="button" class="gs-sec-more" data-act="searchTab" data-tab="${esc(moreTab)}">更多 ${I.arr}</button>`
    : '';
  return `<div class="gs-sec"><div class="gs-sec-h"><span>${esc(title)}</span>${more}</div>
    <div class="gs-list">${rows.map(gsResultRow).join('')}</div></div>`;
}
function gsResultRow(r) {
  const title = esc(r.nameZh || r.name || '');
  const sub = esc(r.sub || '');
  const href = esc(r.href || '#/home');
  if (r.kind === 'match') {
    return `<button type="button" class="gs-row gs-match" data-go="${href}">
      <div class="gs-match-main">
        <div class="gs-match-teams">${esc(r.home || '')}<span class="vs">vs</span>${esc(r.away || '')}</div>
        <div class="gs-sub">${sub}</div>
      </div>
      <span class="gs-chev">${I.arr}</span>
    </button>`;
  }
  const logo = r.kind === 'player'
    ? (r.photo ? gsLogo(r.photo, r.nameZh || r.name) : `<span class="gs-av letter">${esc([...(r.nameZh || r.name || '?')][0] || '?')}</span>`)
    : gsLogo(r.logo, r.nameZh || r.name);
  return `<button type="button" class="gs-row" data-go="${href}">
    ${logo}
    <div class="gs-meta"><div class="gs-title">${title}</div><div class="gs-sub">${sub}</div></div>
    <span class="gs-chev">${I.arr}</span>
  </button>`;
}
async function runGlobalSearch(q, tab) {
  const box = document.getElementById('gsResults');
  if (!box) return;
  const term = String(q || '').trim();
  if (!term) {
    box.innerHTML = empty('输入球队、球员或比赛关键词开始搜索', '', '全局搜索');
    return;
  }
  box.innerHTML = '<div class="spinner"></div>';
  const reqId = (runGlobalSearch._n = (runGlobalSearch._n || 0) + 1);
  try {
    const j = await api('/search?q=' + encodeURIComponent(term) + '&tab=' + encodeURIComponent(tab || 'all') + '&limit=24', { timeout: 12000 });
    if (reqId !== runGlobalSearch._n || route().name !== 'search') return;
    if (!j || j.ok === false) {
      box.innerHTML = empty(esc((j && j.error) || '搜索失败'), '', '暂时不可用');
      return;
    }
    let teams = j.teams || [];
    let players = j.players || [];
    let matches = j.matches || [];
    if (tab === 'all' || tab === 'matches') {
      const local = localMatchSearch(term, 12);
      const seen = new Set(matches.map(m => String(m.id)));
      for (const m of local) {
        if (seen.has(String(m.id))) continue;
        matches.push(m);
        seen.add(String(m.id));
      }
    }
    S.searchCache = { q: term, tab, teams, players, matches, at: Date.now() };
    const emptyAll = !teams.length && !players.length && !matches.length;
    if (emptyAll) {
      box.innerHTML = empty('没有找到与「' + esc(term) + '」相关的结果', '<button class="btn ghost sm" data-act="searchClearInput">清除关键词</button>', '无结果');
      return;
    }
    let html = '';
    if (tab === 'all') {
      html += renderSearchSection('球队', teams.slice(0, 5), teams.length > 5 ? 'teams' : '');
      html += renderSearchSection('球员', players.slice(0, 5), players.length > 5 ? 'players' : '');
      html += renderSearchSection('比赛', matches.slice(0, 5), matches.length > 5 ? 'matches' : '');
    } else if (tab === 'teams') html += renderSearchSection('球队', teams);
    else if (tab === 'players') html += renderSearchSection('球员', players);
    else html += renderSearchSection('比赛', matches);
    box.innerHTML = html || empty('暂无结果');
  } catch (e) {
    if (reqId !== runGlobalSearch._n) return;
    const local = localMatchSearch(term, 20);
    if (local.length && (tab === 'all' || tab === 'matches')) {
      box.innerHTML = renderSearchSection('比赛', local) + '<p class="note" style="margin:8px 16px">网络搜索暂不可用，仅显示本地赛程匹配。</p>';
    } else {
      box.innerHTML = empty('搜索失败：' + esc(e.message || ''), '', '暂时不可用');
    }
  }
}
function localMatchSearch(q, limit) {
  const raw = String(q || '').trim();
  const nq = raw.toLowerCase().replace(/\s+/g, '');
  if (!nq) return [];
  const pools = [...(S.schedule || []), ...(S.matches || []), ...(S.results || [])];
  const seen = new Set();
  const out = [];
  for (const m of pools) {
    if (!m || m.id == null) continue;
    const id = String(m.id);
    if (seen.has(id)) continue;
    const blob = ((m.home || '') + (m.away || '') + (m.league || '')).toLowerCase().replace(/\s+/g, '');
    if (!blob.includes(nq) && !(m.home || '').includes(raw) && !(m.away || '').includes(raw)) continue;
    seen.add(id);
    const when = [m.date || '', m.time || ''].filter(Boolean).join(' ');
    out.push({
      kind: 'match', id,
      name: (m.home || '') + ' vs ' + (m.away || ''),
      nameZh: (m.home || '') + ' vs ' + (m.away || ''),
      home: m.home, away: m.away,
      league: m.league || '', date: m.date || '', time: m.time || '',
      href: '#/match/' + encodeURIComponent(id),
      sub: ['足球', m.league || '', when].filter(Boolean).join(' · '),
    });
    if (out.length >= limit) break;
  }
  return out;
}


// 1.9.121: native edge-to-edge — icon color + re-inject --sat
function syncAndroidChrome(routeName) {
  try {
    if (window.JingcaiChrome && typeof window.JingcaiChrome.refreshSafeArea === 'function') {
      window.JingcaiChrome.refreshSafeArea();
    }
    const darkIcons = isShellTab(routeName) || routeName === 'search';
    if (window.JingcaiChrome && typeof window.JingcaiChrome.statusBarStyle === 'function') {
      window.JingcaiChrome.statusBarStyle(darkIcons ? 'dark' : 'light');
    }
  } catch (_) {}
}


/** 1.9.123: patch score cells in place — avoid full view.innerHTML wipe (home flicker) */
function softPatchLiveScoreCards() {
  try {
    const cards = document.querySelectorAll('.card.mc[data-go]');
    if (!cards.length) return false;
    let n = 0;
    cards.forEach((card) => {
      const go = card.getAttribute('data-go') || '';
      const m = /#\/match\/(.+)$/.exec(go);
      if (!m) return;
      let id;
      try { id = decodeURIComponent(m[1]); } catch (_) { id = m[1]; }
      const rowSrc = (S.matches || []).find(z => String(z.id) === String(id))
        || (S.schedule || []).find(z => String(z.id) === String(id))
        || (S.results || []).find(z => String(z.id) === String(id));
      if (!rowSrc) return;
      const row = classifyScoreRow(rowSrc);
      const mid = card.querySelector('.mc-mid');
      if (!mid) return;
      const next = matchScoreColumn(row);
      if (mid.innerHTML !== next) { mid.innerHTML = next; n++; }
    });
    return n >= 0;
  } catch (_) { return false; }
}

// ======================= render (1.9.124 keep-alive + 1.9.125 home snap / boot-shell) =======================
const PAGES = { home: pageHome, tribe: pageTribe, 'tribe-club': pageTribeClub, 'tribe-compose': pageTribeCompose, 'tribe-post': pageTribePost, schedule: pageSchedule, predict: pagePredict, data: pageData, results: pageResults, me: pageMe, match: pageMatch, player: pagePlayer, team: pageTeam, aplayer: pageAfPlayer, search: pageSearch, 'player-db': pagePlayerDb, plans: pagePlans, favs: pageFavs, friends: pageFriends,
  news: pageNews, login: pageLogin, register: pageRegister, profile: pageProfile, password: pagePassword, delete: pageDelete, settings: pageSettings, about: pageAbout, terms: pageTerms, privacy: pagePrivacy,
  membership: pageMembership, pay: pagePay, orders: pageOrders, 'member-terms': pageMemberTerms, column: pageColumn, kb: pageKb };
const TITLES = { home: '首页', tribe: '论坛', 'tribe-club': '球队部落', 'tribe-compose': '发布帖子', 'tribe-post': '看帖', schedule: '赛程', predict: '预测', data: '数据中心', results: '开奖', news: '头条', me: '我的', match: '赛事详情', player: '球员详情', team: '球队详情', aplayer: '球员详情', search: '搜索', 'player-db': '球员库', news: '体坛资讯', login: '登录', register: '注册', membership: '会员中心', pay: '确认支付', orders: '会员订单', 'member-terms': '会员服务协议', column: '球迷专栏', kb: '我的知识库', friends: '好友' };

/** In-memory keep-alive for bottom-tab pages — restore DOM HTML instead of wiping to skeleton. */
const TAB_KEEP = Object.create(null);

function tabContentSig(name) {
  try {
    if (name === 'home') {
      const ms = S.matches || [];
      const a = ms[0] ? String(ms[0].id) : '';
      const b = ms[Math.floor(ms.length / 2)] ? String(ms[Math.floor(ms.length / 2)].id) : '';
      let predReady = 0;
      try {
        const pc = S.predictCache || {};
        for (const m of ms.slice(0, 10)) {
          if (pc[String(m.id)] && pc[String(m.id)].ok) predReady++;
        }
      } catch (_) {}
      return 'h:' + ms.length + ':' + a + ':' + b + ':' + homeTheme() + ':' + predReady;
    }
    if (name === 'schedule') {
      const n = (S.schedule && S.schedule.length) || (S.matches && S.matches.length) || 0;
      const calcN = calcSelMatches().length;
      return 's:' + n + ':' + (S.schDate || '') + ':' + (S.schLeague || '') + ':' + (S.schHideFinished ? 1 : 0) + ':' + schChannelOf() + ':' + calcN + ':' + (S.calcMult || 1);
    }
    if (name === 'predict') {
      const ms = S.matches || [];
      const pc = S.predictCache || {};
      let ready = 0;
      for (const k of Object.keys(pc)) { if (pc[k] && pc[k].ok) ready++; }
      return 'p:' + ms.length + ':' + (S.prFilter || '') + ':' + ready + ':' + (S.prLane || 'hub');
    }
    if (name === 'kb') {
      const p = kbRouteParts();
      const nsel = kbSelectedIds().length;
      const lr = (S.kb && S.kb.lastResult && S.kb.lastResult.matchId) || '';
      const np = (S.kb && S.kb.packs) ? S.kb.packs.length : (S.kb && S.kb.loading ? 'L' : 'x');
      return 'kb:' + p.sub + ':' + p.id + ':' + nsel + ':' + lr + ':' + ((S.kb && S.kb.intervention) || 'medium') + ':' + np;
    }
    if (name === 'data') {
      const lg = dataLeagueOf(), kind = dataKindOf(), sec = dataSectionOf();
      const c = S.dataCache && S.dataCache[lg + ':' + kind];
      const stamp = c ? String(c.updatedAt || c.fetchedAt || (c.fromCache ? 'c' : '') || '') : 'miss';
      return 'd:' + sec + ':' + lg + ':' + kind + ':' + stamp + ':' + (c && c.ok === false ? 'e' : (c ? 'ok' : '0'));
    }
    if (name === 'news') {
      const tab = newsTabOf();
      const q = String((route().query && route().query.q) || S.newsQ || '').trim();
      const detailId = newsRouteDetailId();
      const n = (S.newsList && S.newsList.items && S.newsList.items.length) || (S.newsCache && S.newsCache.items && S.newsCache.items.length) || 0;
      // 1.9.233: list vs article detail must differ — TAB_KEEP was restoring stale 资讯详情 after 头条 / new carousel tap
      return 'news:' + (detailId ? 'd:' + detailId : 'l') + ':' + tab + ':' + q + ':' + n;
    }
    if (name === 'results') {
      const n = (S.results && S.results.length) || 0;
      return 'rs:' + n + ':' + (S.rsDate || '') + ':' + (S.rsLeague || '');
    }
    if (name === 'tribe') {
      const n = (S.tribeCat && S.tribeCat.teams && S.tribeCat.teams.length) || 0;
      return 'tr:' + tribeSideOf() + ':' + String(S.tribeSearchQ || '').trim() + ':' + n + ':' + ((S.tribeFollows && S.tribeFollows.length) || 0);
    }
  } catch (_) {}
  return String(name || '') + ':x';
}

function saveTabKeep(name, viewEl) {
  if (!name || !isShellTab(name) || !viewEl) return;
  try {
    const html = viewEl.innerHTML;
    if (!html || html.length < 120) return;
    // 1.9.233: never keep-alive article detail DOM on the news tab
    if (name === 'news' && html.indexOf('id="news-detail"') >= 0 && html.indexOf('id="news-list"') < 0) return;
    // Skip pure-skeleton data shells so we don't "keep" a flash forever
    if (name === 'data' && html.indexOf('sk-card') >= 0 && html.indexOf('dc-table') < 0 && html.indexOf('dc-scorer') < 0 && html.indexOf('dc-mv') < 0) return;
    TAB_KEEP[name] = { html, y: window.scrollY, sig: tabContentSig(name), at: Date.now() };
    if (name === 'data') persistDataTabSnap(viewEl);
  } catch (_) {}
}

function invalidateTabKeep(name) {
  try {
    if (name) delete TAB_KEEP[name];
    else Object.keys(TAB_KEEP).forEach(k => { delete TAB_KEEP[k]; });
  } catch (_) {}
}

function applyViewHtml(v, html, { isTab, hasPrev, cold, softSame } = {}) {
  // Cold empty: navy hold so splash→first paint stays one color
  // 1.9.125: while #boot-shell is up, keep paint-hold until revealBootShell (images may still load)
  if (cold || !hasPrev) {
    v.classList.add('paint-hold');
    v.innerHTML = html;
    if (bootShellHeld()) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { v.classList.remove('paint-hold'); } catch (_) {}
      });
    });
    return;
  }
  // 1.9.129: same-route soft rebuild — never navy wipe (chips/tabs already soft-patched when possible)
  if (softSame) {
    try { v.classList.remove('paint-hold', 'view-fade'); v.style.opacity = ''; } catch (_) {}
    v.innerHTML = html;
    return;
  }
  // Tab switches / soft rebuilds: crossfade without navy wipe (avoids "一闪一闪")
  if (isTab) {
    v.classList.add('view-fade');
    v.style.opacity = '0';
    void v.offsetHeight;
    v.innerHTML = html;
    requestAnimationFrame(() => {
      v.style.opacity = '1';
      setTimeout(() => {
        try { v.classList.remove('view-fade'); v.style.opacity = ''; } catch (_) {}
      }, 160);
    });
    return;
  }
  // Sub-pages (navigating in): brief navy hold (header chrome)
  v.classList.add('paint-hold');
  v.innerHTML = html;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try { v.classList.remove('paint-hold'); } catch (_) {}
    });
  });
}

function syncTabbar(rName, isTab) {
  const tb = $('#tabbar');
  if (!tb) return;
  tb.classList.toggle('hidden', !isTab);
  const want = TAB_DEF.map(([k, t, ic]) => `<button class="${k === rName ? 'on' : ''}" data-go="#/${k}">${ic}<span>${t}</span></button>`).join('');
  if (tb.innerHTML !== want) tb.innerHTML = want;
}

/** True when predict tab should use navy list wrap (state or cached #prBody DOM). */
function predictPlatformWrapActive(r, viewEl) {
  if (!r || r.name !== 'predict') return false;
  if ((S.prLane || 'hub') === 'platform') return true;
  if (!viewEl) return false;
  try {
    return !!viewEl.querySelector('#prBody.pr-body');
  } catch (_) {
    return false;
  }
}

/** Tab/sub view class + optional navy wrap (开奖 rs-wrap / 预测 platform pr-wrap). */
function viewWrapClass(r, viewEl) {
  const isTab = isShellTab(r.name);
  const prPlat = predictPlatformWrapActive(r, viewEl);
  let wrap = '';
  if (r.name === 'match') {
    // 1.9.142: 赛后复盘不用 md-wrap 海军蓝内容包裹（宽表不被裁切）；其它 Tab 保持 md-wrap
    const isReview = detailTabOf(String(r.arg || '')) === 'review';
    wrap = isReview ? ' md-wrap--review' : ' md-wrap';
  } else if (prPlat) wrap = ' pr-wrap';
  // 1.9.143: 开奖顶 Tab 使用浅色壳，不再 rs-wrap
  if (r.name === 'kb') {
    const kp = String(r.arg || '').split('/').filter(Boolean);
    if (kp[0] === 'pack') wrap += ' kb-wrap';
  }
  if (r.name === 'tribe') wrap += ' view--tribe-hub';
  if (r.name === 'tribe-club') wrap += ' view--tribe-club';
  if (r.name === 'tribe-compose') wrap += ' view--tribe-compose';
  if (r.name === 'tribe-post') wrap += ' view--tribe-post';
  return 'view' + (isTab ? '' : ' sub') + wrap;
}

function applyViewWrapClass(v, r) {
  if (!v) return;
  v.className = viewWrapClass(r, v);
}

function detailPaneClass(tab) {
  return 'detail-pane' + (tab === 'review' ? ' detail-pane--review' : '');
}

function syncViewWrapClass() {
  const v = $('#view');
  if (!v) return;
  const r = route();
  if (r.name !== 'match') return;
  applyViewWrapClass(v, r);
}

/** Quiet predict list team row — same ends-flush layout as 开奖 mc-teams (名+徽 … vs … 徽+名). */
function prTeamsQuietRow(m) {
  return `<div class="pr-teams pr-teams-row"><div class="t h"><span class="nm" title="${esc(m.home)}">${esc(m.home)}</span>${badge(m.home, 'sm', m.homeLogo)}</div><span class="vs">vs</span><div class="t">${badge(m.away, 'sm', m.awayLogo)}<span class="nm" title="${esc(m.away)}">${esc(m.away)}</span></div></div>`;
}

function render(opts) {
  opts = opts || {};
  applyHomeTheme(homeTheme());
  let r = route();
  if (r.name === 'me') {
    openMeDrawer();
    if (location.hash !== '#/home') {
      history.replaceState(null, '', '#/home');
      navNote('#/home');
    }
    r = route();
  }
  if (!PAGES[r.name]) return go('#/home', true);
  if (PROTECTED.includes(r.name) && !loggedIn()) return go('#/login', true);
  if ((r.name === 'login' || r.name === 'register') && loggedIn()) {
    return go('#/home', true);
  }
  const isTab = isShellTab(r.name);
  const v = $('#view');
  if (!v) return;
  const same = render.last === location.hash;
  const y = window.scrollY;
  const ds = $('#dstrip');
  const dsx = same && ds ? ds.scrollLeft : null;
  const curSig = (function () {
    if (isTab) return tabContentSig(r.name);
    // 1.9.126: include match detailTab so tab taps are not no-op'd
    if (r.name === 'match') {
      const id = String(r.arg || '');
      return 'match:' + id + ':' + detailTabOf(id) + ':' + (isFav(id) ? 1 : 0) + ':' + ((S.squadTab && S.squadTab[id]) || '') + ':' + JSON.stringify(r.query || {});
    }
    // 1.9.128: include 开奖 date/league filters (hash stays #/results; without these, chip taps no-op)
    if (r.name === 'results') {
      const n = (S.results && S.results.length) || 0;
      const sn = (S.schedule && S.schedule.length) || 0;
      return 'results:' + n + ':' + sn + ':' + (S.rsDate || '') + ':' + (S.rsLeague || '') + ':' + JSON.stringify(r.query || {});
    }
    if (r.name === 'kb') {
      const kp = String(r.arg || '').split('/').filter(Boolean);
      const sub = kp[0] || 'home';
      const kid = kp[1] || '';
      const kb = S.kb || {};
      if (sub === 'pack' && kid && kb.packItems && String(kb.packId) === kid) {
        const items = kb.packItems.items || [];
        const sig = items.map(it => `${it.id}:${it.updatedAt}:${it.posX}:${it.posY}`).join(',');
        const pk = kb.packItems.pack || {};
        return `kb:pack:${kid}:${sig}:${pk.updatedAt}:${pk.layoutPanX}:${pk.layoutPanY}:${pk.layoutZoom}`;
      }
      const pn = kb.packs == null ? 'u' : String((kb.packs && kb.packs.length) || 0);
      return 'kb:' + sub + ':' + kid + ':' + pn + ':' + (kb.loading ? 1 : 0) + ':' + (kb.packsError || '') + ':' + (kb.packItemsError || '');
    }
    if (r.name === 'tribe-club') {
      const tid = String(r.arg || '');
      const fc = (S.tribeFeedCache && S.tribeFeedCache[tid] && S.tribeFeedCache[tid].length) || 0;
      const ui = S.tribeFeedUi || {};
      return 'tribe-club:' + tid + ':' + (isTribeFollow(tid) ? 1 : 0) + ':' + fc + ':' + (ui.tab || 'latest') + ':' + (ui.sort || 'reply');
    }
    if (r.name === 'tribe-post') return 'tribe-post:' + String(r.arg || '');
    if (r.name === 'tribe-compose') return 'tribe-compose:' + String(r.arg || '');
    return r.name + ':' + String(r.arg || '') + ':' + JSON.stringify(r.query || {});
  })();

  // No-op: same route + same content signature (boot double-render / 3min poll)
  if (!opts.force && same && render.lastSig === curSig && v.childNodes.length) {
    syncTopChrome(r.name);
    syncTabbar(r.name, isTab);
    applyViewWrapClass(v, r);
    if (meDrawerOpen()) syncMeDrawer();
    renderPlanBar();
    renderCalcBar();
    return;
  }

  const prevTab = render.lastTab || null;
  const switchingTab = isTab && prevTab && prevTab !== r.name && isShellTab(prevTab);

  // Stash leaving tab before wipe
  if (switchingTab) saveTabKeep(prevTab, v);

  const keep = isTab ? TAB_KEEP[r.name] : null;
  const canRestore = !opts.force && switchingTab && keep && keep.html && keep.sig === curSig;
  const hasPrev = v.childNodes.length > 0;
  const cold = !hasPrev && !document.documentElement.getAttribute('data-ready');

  if (canRestore) {
    applyViewHtml(v, keep.html, { isTab: true, hasPrev: true, cold: false });
    applyViewWrapClass(v, r);
    window.scrollTo(0, keep.y || 0);
  } else {
    if (r.name === 'kb' && loggedIn()) {
      S.kb = S.kb || { selected: {}, intervention: 'medium' };
      hydrateKbPacksCache();
      ensureKbRouteData();
    }
    const nextHtml = PAGES[r.name](r.arg);
    // 1.9.129: rs-wrap / md-wrap = intentional navy list bg (match-detail hero #1B2A4A)
    applyViewWrapClass(v, r);
    const softSame = !!(same && hasPrev && !switchingTab);
    applyViewHtml(v, nextHtml, { isTab, hasPrev, cold, softSame });
    applyViewWrapClass(v, r);
    if (isTab) saveTabKeep(r.name, v);
    if (same) window.scrollTo(0, y);
  }

  if (!bootShellHeld()) {
    try { document.documentElement.setAttribute('data-ready', '1'); } catch (_) {}
  } else {
    try { document.documentElement.setAttribute('data-boot', '1'); } catch (_) {}
  }
  syncAndroidChrome(r.name);
  const prevRouteName = render.lastRouteName || null;
  syncDcRoutePriority(prevRouteName, r.name);
  render.lastRouteName = r.name;
  render.last = location.hash;
  render.lastSig = curSig;
  render.lastTab = isTab ? r.name : prevTab;
  if (r.name === 'home' && !canRestore) {
    try { persistHomeSnap(v); persistPredictCache(); } catch (_) {}
  }

  const nds = $('#dstrip');
  if (nds) {
    if (dsx !== null) nds.scrollLeft = dsx;
    else syncDateStripScroll(nds);
  }
  syncTopChrome(r.name);
  syncTabbar(r.name, isTab);
  if (meDrawerOpen()) syncMeDrawer();
  renderPlanBar();
  renderCalcBar();
  const payPhase = (S.payUi && S.payUi.phase) || 'form';
  const hasVip = (r.name === 'membership' && loggedIn()) || (r.name === 'pay' && payPhase === 'form');
  v.classList.toggle('has-vip', !!hasVip);
  if (r.name === 'home' && !canRestore) initBanner();
  else if (r.name === 'home' && canRestore && $('#bnTrack')) initBanner();
  if (r.name === 'home') setTimeout(syncHomeAttitudeScroll, 0);
  if (r.name === 'schedule') resumeScheduleLivePoll();
  else stopLiveScorePoll();
  document.title = (TITLES[r.name] ? TITLES[r.name] + ' · ' : '') + '竞彩预测';
  try { if (window.JCFloatBall) window.JCFloatBall.syncRoute(r.name); } catch (_) {}
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
    ensureMembershipReady().then(() => { if (route().name === need) render({ force: true }); });
  }
  if (r.name === 'orders' && S.orders == null) {
    loadOrders().then(() => { if (route().name === 'orders') render({ force: true }); });
  }
  if (r.name === 'friends' && loggedIn()) {
    const tab = S.friendsTab === 'followers' ? 'followers' : 'following';
    if (!S.friendsListCache || S.friendsListCache[tab] === undefined) {
      setTimeout(() => { if (route().name === 'friends') loadFriendsList(); }, 0);
    }
  }
  if (r.name === 'player-db') {
    syncPlayerDbKeyFromRoute();
    const parts = String(r.arg || '').split('/').filter(Boolean);
    if (parts[0] === 'match' && parts[1]) setTimeout(() => loadPlayerDbMatch(parts[1]), 0);
    else if (parts[0] === 'player' && parts[1]) setTimeout(() => loadPlayerDbPlayer(parts[1]), 0);
    else setTimeout(() => loadPlayerDbHome(false), 0);
  }
  if (r.name === 'kb') {
    const kp = String(r.arg || '').split('/').filter(Boolean);
    if (kp[0] === 'pack' && kp[1]) setTimeout(() => mountKbPackCanvas(kp[1]), 0);
    else destroyKbCanvas();
  }
  if (r.name === 'data') {
    const lg = dataLeagueOf(), kind = dataKindOf();
    ensureDataCacheSlice(lg + ':' + kind);
    if (!canRestore) warmDataCenterPrefetch(lg, kind);
    setTimeout(() => prefetchDcImages(document.getElementById('dcBody') || v), 0);
  }
  if (r.name === 'tribe-compose' && typeof JCTribeFeed !== 'undefined') {
    const composeTid = String(r.arg || '');
    setTimeout(() => {
      if (route().name === 'tribe-compose' && String(route().arg) === composeTid) {
        JCTribeFeed.mountCompose(composeTid);
      }
    }, 0);
  }
  if (r.name === 'tribe' || r.name === 'tribe-club') {
    setTimeout(() => {
      try {
        const root = document.getElementById('view') || document;
        hardenTribeCrestImgs(root);
        hydrateTribeCrests(root);
      } catch (_) {}
    }, 0);
  }
  tickClock();
}

function initBanner() {
  const t = $('#bnTrack'); if (!t) return;
  const dots = t.parentElement.querySelectorAll('.dots i');
  if (S.bannerIdx) t.scrollLeft = S.bannerIdx * t.clientWidth;
  t.onscroll = () => { const i = Math.round(t.scrollLeft / t.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); S.bannerIdx = i; };
  clearInterval(initBanner.iv);
  const n = Math.max(1, t.children.length || BANNER_N);
  initBanner.iv = setInterval(() => { if (!document.body.contains(t) || document.hidden) return clearInterval(initBanner.iv); t.scrollTo({ left: ((S.bannerIdx + 1) % n) * t.clientWidth, behavior: 'smooth' }); }, 4500);
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
  if (typeof JCTribeFeed !== 'undefined') {
    if (JCTribeFeed.onClick(e)) return;
    if (e.target.closest('#tribe-feed-list')) JCTribeFeed.onFeedClick(e);
    if (e.target.closest('#homeHotFeed')) JCTribeFeed.onFeedClick(e);
  }
  const el = e.target.closest('[data-act],[data-go],[data-key],[data-type],[data-mult],[data-sdate],[data-slg],[data-rdate],[data-pf],[data-av]');
  if (!el) {
    if (e.target.id === 'sheet' && Date.now() >= schSheetDismissGuardUntil) closeSheet();
    if (e.target.id === 'me-drawer-mask') closeMeDrawer();
    return;
  }
  const d = el.dataset;
  if (d.mid && d.key) return toggleSel(d.mid, d.key);
  if (d.type && d.act !== 'calcType' && d.act !== 'calcTypePick') { const n = +d.type; S.types = S.types.includes(n) ? S.types.filter(x => x !== n) : [...S.types, n]; if (!S.types.length) S.types = [n]; return openPlanSheet(); }
  if (d.mult && d.act !== 'calcMult') { S.mult = clampCalcMult(S.mult + +d.mult); return openPlanSheet(); }
  if (d.sdate) {
    if (window.__schDateSuppressClick) return;
    commitSchDate(d.sdate);
    return;
  }
  if (d.slg) {
    if (!applySchLeagueFromChip(el)) return;
    invalidateTabKeep('schedule');
    if (softPatchSchedule()) { syncTopChrome('schedule'); return; }
    return render({ force: true });
  }
  if (d.rdate) { S.rsDate = d.rdate; if (softPatchResults()) return; return render({ force: true }); }
  if (d.pf) { S.prFilter = d.pf; return render(); }
  if (d.av) { S.pendingAv = d.av; document.querySelectorAll('[data-av]').forEach(b => b.classList.toggle('on', b === el)); return; }
  if (d.go) {
    e.preventDefault();
    if (el.closest('#me-drawer')) S.meBackToDrawer = true;
    return go(d.go);
  }
  switch (d.act) {
    case 'dataSection': {
      setDataSection(el.dataset.sec === 'star' ? 'star' : 'team');
      syncTopChrome('data');
      const lg = dataLeagueOf(), kind = dataKindOf();
      primeDataSliceFromBoot(lg, kind);
      scheduleDataCenterRefresh(lg, kind, { urgent: !dataCacheRenderable(S.dataCache[lg + ':' + kind], kind) });
      warmDataCenterPrefetch(lg, kind);
      invalidateTabKeep('data');
      return render({ force: true });
    }
    case 'schDateStep': {
      if (window.__schDateSuppressClick) return;
      const delta = Number(el.dataset.delta);
      if (!delta || !S.schDate) return;
      commitSchDate(shiftIssueDate(S.schDate, delta));
      return;
    }
    case 'schDateOpenCal': {
      if (window.__schDateSuppressClick) return;
      return openSchDateCalendar();
    }
    case 'schCalCancel': schCalViewMonth = null; return closeSheet();
    case 'schCalToday': {
      commitSchDate(bjDate(0));
      schCalViewMonth = null;
      return closeSheet();
    }
    case 'schCalPrev': {
      if (!schCalViewMonth) return;
      const y = schCalViewMonth.getUTCFullYear();
      const m = schCalViewMonth.getUTCMonth();
      schCalViewMonth = new Date(Date.UTC(y, m - 1, 1));
      return renderSchDateCalendarSheet();
    }
    case 'schCalNext': {
      if (!schCalViewMonth) return;
      const y = schCalViewMonth.getUTCFullYear();
      const m = schCalViewMonth.getUTCMonth();
      schCalViewMonth = new Date(Date.UTC(y, m + 1, 1));
      return renderSchDateCalendarSheet();
    }
    case 'schCalPick': {
      const pick = el.dataset.date;
      if (!pick) return;
      commitSchDate(pick);
      schCalViewMonth = null;
      return closeSheet();
    }
    case 'tribeSub': {
      setTribeSub(el.dataset.sub || 'enter');
      syncTopChrome('tribe');
      invalidateTabKeep('tribe');
      return render({ force: true });
    }
    case 'tribeSide': {
      const side = el.dataset.side || '__hot__';
      setTribeSide(side);
      invalidateTabKeep('tribe');
      if (TRIBE_LEAGUES.some((l) => l.key === side) && !tribeTeamsForSide(side).length) {
        purgeStandingsWithoutTeamIds();
        loadDataCenterBootPack();
        const slice = ensureDataCacheSlice(side + ':standings');
        if (dataCacheTribeReady(slice)) {
          rebuildTribeCatalogFromCache({ renderIfTribe: true });
        } else {
          scheduleDataCenterRefresh(side, 'standings', { urgent: true });
          if (S.tribeCat && S.tribeCat._settled) {
            S.tribeCat._settled = false;
            ensureTribeCatalog({ force: true });
          }
        }
      }
      return render({ force: true });
    }
    case 'tribeFollow': return toggleTribeFollow(el.dataset.id);
    case 'userFollow': {
      const postEl = document.getElementById('tribe-post-detail');
      const refreshDetail = postEl && postEl.dataset.postId;
      return toggleUserFollow(el.dataset.uid, { refreshDetail });
    }
    case 'friendsTab': {
      S.friendsTab = el.dataset.tab === 'followers' ? 'followers' : 'following';
      S.friendsListCache = null;
      render({ force: true });
      return;
    }
    case 'tribeReload': {
      S.tribeCat = null; S.tribeCatBusy = false; S._tribeCatWait = null;
      _bootPackInflight = null;
      purgeStandingsWithoutTeamIds();
      invalidateTabKeep('tribe');
      ensureTribeCatalog({ force: true });
      return render({ force: true });
    }
    case 'schRefresh': {
      S.liveScoresAt = 0;
      const ms = (S.schedule && S.schedule.length) ? S.schedule : S.matches;
      const rs = S.results;
      const dayRes = (rs || []).filter(r => issueDate(r) === S.schDate);
      const dayRows = [...(ms || []).filter(m => issueDate(m) === S.schDate && !dayRes.some(r => r.id === m.id)), ...dayRes];
      toast('正在刷新比分…');
      Promise.all([reloadData(true), loadLiveScores(dayRows.map(x => String(x.id)), { force: true, bust: true })]).then(() => {
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
    case 'intelJump': {
      const id = el.dataset.id;
      const jump = el.dataset.jump || '';
      // 1.9.83: form / future / standings / rules open dismissible sheets (no route replace)
      if (['form', 'form-away', 'future', 'standings', 'rules'].includes(jump)) {
        openMatchHubSheet(id, jump);
        return;
      }
      if (id) {
        S.detailTab = S.detailTab || {};
        S.detailTab[String(id)] = 'intel';
      }
      render();
      const x = id ? (findMatch(id) || (S.results || []).find(z => z.id === String(id))) : null;
      if (x) enrichMatchDetail(x);
      const targetId = jump === 'h2h' ? 'intel-h2h'
        : jump === 'form-away' ? 'intel-form-away'
        : jump === 'form' ? 'intel-form-home'
        : 'intel-form';
      setTimeout(() => {
        const node = document.getElementById(targetId) || document.getElementById('intel-form');
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return;
    }
    case 'hubFormMore': {
      const id = el.dataset.id;
      const jump = el.dataset.jump || 'form';
      const n = Math.max(15, Number(el.dataset.n) || 30);
      setHubFormShown(id, jump, n);
      openMatchHubSheet(id, jump);
      return;
    }
    case 'dataLeague': {
      setDataLeague(el.dataset.lg || 'epl');
      {
        const lg = dataLeagueOf(), kind = dataKindOf();
        primeDataSliceFromBoot(lg, kind);
        if (softPatchDataBody(lg, kind)) {
          scheduleDataCenterRefresh(lg, kind, { urgent: !dataCacheRenderable(S.dataCache[lg + ':' + kind], kind) });
          warmDataCenterPrefetch(lg, kind);
          return;
        }
      }
      return render({ force: true });
    }
    case 'dataKind': {
      setDataKind(el.dataset.kind || 'standings');
      {
        const lg = dataLeagueOf(), kind = dataKindOf();
        primeDataSliceFromBoot(lg, kind);
        if (softPatchDataBody(lg, kind)) {
          scheduleDataCenterRefresh(lg, kind, { urgent: !dataCacheRenderable(S.dataCache[lg + ':' + kind], kind) });
          return;
        }
      }
      return render({ force: true });
    }
    case 'dataRefresh': {
      const k = dataLeagueOf() + ':' + dataKindOf();
      if (S.dataCache) delete S.dataCache[k];
      invalidateTabKeep('data');
      return render({ force: true });
    }
    case 'teamTab': {
      S.teamTab = el.dataset.tab === 'intro' ? 'intro' : 'schedule';
      document.querySelectorAll('.team-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === S.teamTab));
      const sch = document.getElementById('team-tab-schedule');
      const intro = document.getElementById('team-tab-intro');
      if (sch) sch.classList.toggle('hidden', S.teamTab !== 'schedule');
      if (intro) intro.classList.toggle('hidden', S.teamTab !== 'intro');
      return;
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
    case 'searchTab': {
      const t = el.dataset.tab || 'all';
      setSearchTab(t);
      const inp = document.getElementById('gsInput');
      const q = String((inp && inp.value) || S.searchQ || '').trim();
      const hash = q
        ? '#/search?q=' + encodeURIComponent(q) + '&tab=' + encodeURIComponent(t)
        : '#/search?tab=' + encodeURIComponent(t);
      return go(hash, true);
    }
    case 'searchSubmit': {
      const inp = document.getElementById('gsInput');
      commitSearchQuery(inp ? inp.value : S.searchQ);
      return;
    }
    case 'searchClearInput': {
      S.searchQ = '';
      const inp = document.getElementById('gsInput');
      if (inp) inp.value = '';
      return go('#/search?tab=' + encodeURIComponent(searchTabOf()), true);
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
      // 1.9.58: 本场球员 on 赛后复盘
      if (pane && detailTabOf(id) === 'review') {
        pane.innerHTML = reviewTabHtml(x);
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
      if (pane && detailTabOf(id) === 'review') {
        pane.innerHTML = reviewTabHtml(x);
      }
      await loadFixturePlayers(x, { force: true });
      if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'review') {
        const p2 = document.getElementById('detail-pane-' + id);
        if (p2) p2.innerHTML = reviewTabHtml(x);
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
      await Promise.all([loadPostMatchReview(x, { force: true })]);
      if (route().name === 'match' && String(route().arg) === id && detailTabOf(id) === 'review') {
        const p2 = document.getElementById('detail-pane-' + id);
        if (p2) p2.innerHTML = reviewTabHtml(x);
      }
      toast('复盘已更新');
      return;
    }
    case 'prLane': {
      const lane = el.dataset.lane || 'platform';
      if (lane === 'kb') {
        go(loggedIn() ? '#/kb' : '#/login');
        return;
      }
      S.prLane = 'platform';
      invalidateTabKeep('predict');
      return render({ force: true });
    }
    case 'prHub': {
      S.prLane = 'hub';
      invalidateTabKeep('predict');
      return render({ force: true });
    }
    case 'kbRetryPacks': {
      S.kb = S.kb || {};
      S.kb.packs = null;
      S.kb.packsError = '';
      ensureKbRouteData();
      return render({ force: true });
    }
    case 'kbRetryPack': {
      const pid = el.dataset.id || '';
      if (!pid) return;
      S.kb = S.kb || {};
      S.kb.packItems = null;
      S.kb.packItemsError = '';
      ensureKbRouteData();
      return render({ force: true });
    }
    case 'kbCreatePack': {
      if (S.kb && S.kb._creating) return;
      const inp = document.querySelector('input[name="kbPackName"]');
      const name = (inp && inp.value || '').trim();
      if (!name) { toast('请输入知识包名称'); return; }
      S.kb = S.kb || {};
      S.kb._creating = true;
      try {
        const j = await api('/kb/packs', { method: 'POST', body: { name } });
        if (j && j.pack) {
          const prev = Array.isArray(S.kb.packs) ? S.kb.packs : [];
          S.kb.packs = [j.pack, ...prev.filter(p => p.id !== j.pack.id)];
          persistKbPacksCache(S.kb.packs);
        } else {
          S.kb.packs = null;
          await loadKbPacks(true);
        }
        if (inp) inp.value = '';
        toast('知识包已创建');
        render({ force: true });
      } catch (err) { toast(err.message || '创建失败'); }
      finally { if (S.kb) S.kb._creating = false; }
      return;
    }
    case 'kbRenamePack': {
      const pid = el.dataset.id;
      const cur = el.dataset.name || '';
      const name = window.prompt('新的知识包名称', cur);
      if (!name || name === cur) return;
      try {
        await api('/kb/packs/' + pid, { method: 'PATCH', body: { name } });
        await loadKbPacks(true);
        toast('已改名');
        render({ force: true });
      } catch (err) { toast(err.message || '改名失败'); }
      return;
    }
    case 'kbDeletePack': {
      const pid = el.dataset.id;
      if (!window.confirm('删除知识包将同时删除其中所有条目，确定？')) return;
      try {
        await api('/kb/packs/' + pid, { method: 'DELETE' });
        S.kb.picker = null;
        await loadKbPacks(true);
        toast('已删除');
        render({ force: true });
      } catch (err) { toast(err.message || '删除失败'); }
      return;
    }
    case 'kbAddNode': {
      const packId = el.dataset.pack;
      let px;
      let py;
      if (S.kb && S.kb.canvasInst && S.kb.canvasInst.getViewportCenterWorld) {
        const c = S.kb.canvasInst.getViewportCenterWorld();
        px = Math.round(c.x - 88);
        py = Math.round(c.y - 44);
      }
      kbShowItemSheet({ packId, posX: px, posY: py });
      return;
    }
    case 'kbSaveItemSheet': {
      scheduleKbSaveItemSheet(el);
      return;
    }
    case 'kbExport': {
      try {
        const j = await api('/kb/export');
        const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'jingcai-kb-backup.json';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('已导出 JSON');
      } catch (err) { toast(err.message || '导出失败'); }
      return;
    }
    case 'kbIv': {
      S.kb.intervention = el.dataset.iv || 'medium';
      return render();
    }
    case 'kbToggle': {
      kbToggleItem(el.dataset.id);
      return render();
    }
    case 'kbRunPredict': {
      const mid = el.dataset.mid;
      const ids = kbSelectedIds().map(Number);
      if (!ids.length) { toast('请至少选择一条知识'); return; }
      try {
        const j = await api('/predict/personal', { method: 'POST', body: { matchId: mid, intervention: S.kb.intervention || 'medium', itemIds: ids } });
        S.kb.lastResult = j;
        toast('个人预测已生成');
        render({ force: true });
      } catch (err) { toast(err.message || '生成失败'); }
      return;
    }
    case 'modelCheck': { e.stopPropagation && e.stopPropagation(); return openModelCheck(); }
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
      const id = el.dataset.id;
      let tab = el.dataset.tab;
      S.detailTab = S.detailTab || {};
      if (tab === 'chat') {
        tab = 'events';
        S.scrollToChat = S.scrollToChat || {};
        S.scrollToChat[id] = true;
      }
      S.detailTab[id] = tab;
      // 1.9.129: soft-patch pane/tabs — avoid full view paint-hold navy flash
      if (!softPatchDetailTab(id, tab)) render({ force: true });
      enrichMatchDetail(findMatch(id) || (S.results || []).find(z => z.id === String(id)));
      return;
    }
    case 'squadTab': {
      const id = el.dataset.id, side = el.dataset.side;
      S.squadTab = S.squadTab || {}; S.squadTab[id] = side;
      const x = findMatch(id) || (S.results || []).find(z => z.id === String(id));
      render({ force: true });
      ensureSquad(x);
      return;
    }
    case 'vote': {
      const id = el.dataset.id, choice = el.dataset.choice;
      if (!loggedIn()) { toast('请先登录后再投票'); return go('#/login'); }
      const prev = S.voteCache && S.voteCache[id];
      if (prev && prev.myVote) { toast('已投票，不可修改'); return; }
      const lab = ({ h: '胜', d: '平', a: '负' }[choice] || choice);
      if (!(await confirmDlg('确认投票', `确定选择「${lab}」？投票后不可修改。`, '确认投票'))) return;
      try {
        const j = await api('/match-vote', { method: 'POST', body: { matchId: id, choice } });
        S.voteCache = S.voteCache || {}; S.voteCache[id] = j;
        renderVoteBox(id);
        toast('已投票：' + lab);
      } catch (er) { toast(er.message || '投票失败'); }
      return;
    }
    case 'fav': return toggleFav(d.id);
    case 'unfav': {
      if (loggedIn()) { try { await api('/favorites/' + encodeURIComponent(d.id), { method: 'DELETE' }); } catch (er) { return toast(er.message); } }
      S.favs = S.favs.filter(f => f.matchId !== d.id); persistLists(); toast('已取消关注');
      ensureFavGoalPoll();
      return render();
    }
    case 'clearSel': S.sel = {}; S.types = []; S.mult = 1; return render();
    case 'schChannel': {
      setSchChannel(d.ch);
      invalidateTabKeep('schedule');
      stopLiveScorePoll();
      return render({ force: true });
    }
    case 'calcPick': return toggleCalcPick(d.mid, d.calcKey, d.odds);
    case 'calcClear': S.calcSel = {}; S.calcTypes = []; S.calcMult = 1; return render({ force: true });
    case 'calcSubmit': return openCalcSubmitSheet();
    case 'openCalcComboSheet': return openCalcComboSheet();
    case 'openCalcMultSheet': return openCalcMultSheet(d.multSrc || 'bar');
    case 'calcTypePick': {
      const n = +d.type;
      S.calcTypes = S.calcTypes.includes(n) ? S.calcTypes.filter(x => x !== n) : [...S.calcTypes, n];
      if (!S.calcTypes.length) S.calcTypes = [n];
      if (calcComboSheetOpen()) return openCalcComboSheet();
      if (calcSubmitSheetOpen()) return openCalcSubmitSheet();
      renderCalcBar();
      return;
    }
    case 'closeCalcMultSheet': return closeCalcMultSheet();
    case 'calcMultConfirm': return commitCalcMultFromDraft();
    case 'calcMultPreset': {
      S._calcMultDraft = String(clampCalcMult(+d.val || 1));
      refreshCalcMultSheet();
      return;
    }
    case 'calcMultKey': {
      let s = S._calcMultDraft || '';
      if (d.key === 'del') s = s.slice(0, -1);
      else if (s === '0' || !s) s = d.key;
      else s += d.key;
      if (s.length > 5) s = s.slice(0, 5);
      const n = parseInt(s, 10);
      if (Number.isFinite(n) && n > CALC_MULT_MAX) s = String(CALC_MULT_MAX);
      S._calcMultDraft = s;
      refreshCalcMultSheet();
      return;
    }
    case 'calcHelp': return openCalcHelpSheet();
    case 'calcMore': return openCalcMoreSheet(d.mid);
    case 'calcType': {
      const n = +d.type;
      S.calcTypes = S.calcTypes.includes(n) ? S.calcTypes.filter(x => x !== n) : [...S.calcTypes, n];
      if (!S.calcTypes.length) S.calcTypes = [n];
      if (calcComboSheetOpen()) return openCalcComboSheet();
      if (calcSubmitSheetOpen()) return openCalcSubmitSheet();
      renderCalcBar();
      return;
    }
    case 'calcMult': {
      S.calcMult = clampCalcMult(S.calcMult + +d.mult);
      if (calcSubmitSheetOpen()) return openCalcSubmitSheet();
      renderCalcBar();
      return;
    }
    case 'calcMoreOk': return closeSheet();
    case 'openBonusOpt': return openBonusOptSheet();
    case 'bonusOptBack': { closeBonusOptSheet(); return openCalcSubmitSheet(); }
    case 'bonusOptHelp': return openBonusOptHelp();
    case 'bonusOptDone': { toast('方案已保存（仅本机试算记录，未投注）', 2200); closeBonusOptSheet(); return openCalcSubmitSheet(); }
    case 'bonusOptMode': {
      S.bonusOpt.mode = d.mode || 'avg';
      const lines = syncBonusOptFromCalc(false);
      return renderBonusOptSheet(lines);
    }
    case 'bonusOptAmt': {
      S.bonusOpt.amount = Math.max(2, Math.min(99999, (S.bonusOpt.amount || 0) + (+d.delta || 0)));
      const lines = syncBonusOptFromCalc(false);
      return renderBonusOptSheet(lines);
    }
    case 'bonusOptMult': {
      const i = +d.line;
      const lines = expandCalcDanShiLines(S.calcSel, S.calcTypes);
      if (i < 0 || i >= lines.length) return;
      const mults = S.bonusOpt.mults || [];
      mults[i] = Math.max(0, Math.min(9999, (mults[i] || 0) + (+d.delta || 0)));
      S.bonusOpt.mults = mults;
      return renderBonusOptSheet(lines);
    }
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

    case 'colTab': {
      S.columnTab = el.dataset.tab === 'interact' ? 'interact' : 'attitude';
      // update tab UI without full remount if on column root
      document.querySelectorAll('.col-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.columnTab));
      loadColumnFeedUi();
      return;
    }
    case 'homeMidTab': {
      const next = el.dataset.tab === 'hot' ? 'hot' : 'attitude';
      if (S.homeMidTab === next) return;
      S.homeMidTab = next;
      syncHomeMidPanels();
      if (next === 'attitude') {
        fillHomePlatformAttitude();
        requestAnimationFrame(() => syncHomeAttitudeScroll());
      } else {
        S.homeHotLoaded = false;
        fillHomeTribeHot();
      }
      return;
    }
    case 'colToggleTag': {
      const wrap = document.getElementById('colTagPick');
      if (!wrap) return;
      const btn = el;
      const on = btn.classList.toggle('on');
      const ons = [...wrap.querySelectorAll('.col-tag-btn.on')];
      if (ons.length > 4) { btn.classList.remove('on'); toast('最多选择 4 个话题'); }
      return;
    }
    case 'colSaveProfile': {
      (async () => {
        if (!loggedIn()) return go('#/login');
        const bio = (document.getElementById('colBio') || {}).value || '';
        const tags = [...document.querySelectorAll('#colTagPick .col-tag-btn.on')].map((b) => b.dataset.tag);
        try {
          const j = await api('/column/me', { method: 'PUT', body: { bio, tags } });
          S.columnMe = j.author;
          S.columnAuthors = null;
          toast('专栏资料已保存');
          go('#/column', true);
        } catch (e) { toast(e.message || '保存失败'); }
      })();
      return;
    }
    case 'colKind': {
      const c = syncColumnComposeFromDom();
      c.kind = el.dataset.kind === 'general' ? 'general' : 'match';
      return render();
    }
    case 'colComposeTopic': {
      const c = syncColumnComposeFromDom();
      c.topic = el.dataset.tag || '分析';
      return render();
    }
    case 'colPick': {
      const c = syncColumnComposeFromDom();
      const pk = String(el.dataset.pick || '').toUpperCase();
      c.pick = (pk === 'H' || pk === 'D' || pk === 'A') ? pk : '';
      return render();
    }
    case 'colPrice': {
      const c = syncColumnComposeFromDom();
      c.priceCoins = parseInt(el.dataset.price, 10) || 0;
      return render();
    }
    case 'colAuthorTab': {
      const uid = el.dataset.uid;
      const t = el.dataset.tab || 'all';
      return go('#/column/author/' + encodeURIComponent(uid) + '?tab=' + encodeURIComponent(t), true);
    }
    case 'colBuy': {
      (async () => {
        if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
        const id = el.dataset.id;
        const price = parseInt(el.dataset.price, 10) || 0;
        try {
          const j = await api('/column/posts/' + encodeURIComponent(id) + '/purchase', { method: 'POST', body: {} });
          if (j.coins != null && S.user) S.user.coinBalance = j.coins;
          toast(j.message || '已解锁');
          S.columnFeed = { attitude: null, interact: null };
          S.columnAuthorCache = {};
          S.matchAttitude = {};
          if (route().name === 'match' && detailTabOf(route().arg) === 'attitude') {
            const mx = findMatch(route().arg) || (S.results || []).find(z => String(z.id) === String(route().arg));
            if (mx) { await loadMatchAttitude(mx); return; }
          }
          render();
        } catch (e) {
          if (e && (e.code === 'INSUFFICIENT_COINS' || /云朵不足|金豆不足/.test(e.message || ''))) {
            if (await confirmDlg('云朵不足', `解锁需要 ${price} 云朵。当前余额不足，是否去充值？（模拟充值，不真实扣款）`, '去充值')) {
              return go('#/column/wallet');
            }
            return;
          }
          toast(e.message || '解锁失败');
        }
      })();
      return;
    }
    case 'colTopup': {
      (async () => {
        if (!loggedIn()) return go('#/login');
        const packId = el.dataset.pack;
        if (!(await confirmDlg('模拟充值', '确认购买该云朵套餐？当前为模拟支付，不会真实扣款。', '确认充值'))) return;
        try {
          const j = await api('/column/wallet/topup', { method: 'POST', body: { packId } });
          if (j.coins != null && S.user) S.user.coinBalance = j.coins;
          S.columnWallet = j;
          toast(j.message || '充值成功');
          render();
        } catch (e) { toast(e.message || '充值失败'); }
      })();
      return;
    }
    case 'colPublish': {
      (async () => {
        if (!loggedIn()) return go('#/login');
        const c = syncColumnComposeFromDom();
        const title = c.title || '';
        const body = c.body || '';
        const kind = c.kind === 'general' ? 'general' : 'match';
        const payload = { kind, topic: c.topic || '分析', title, body, priceCoins: Number(c.priceCoins) || 0 };
        if (kind === 'match') {
          if (!c.matchId) { toast('请选择关联比赛'); return; }
          payload.matchId = c.matchId;
          payload.matchLabel = c.matchLabel || '';
          if (c.pick) payload.pick = c.pick;
        }
        try {
          await api('/column/posts', { method: 'POST', body: payload });
          S.columnFeed = { attitude: null, interact: null };
          S.columnAuthors = null;
          S.columnCompose = { kind, topic: c.topic || '分析', matchId: '', matchLabel: '', title: '', body: '', pick: '', priceCoins: 0 };
          toast('已发布');
          go('#/column?tab=' + (kind === 'general' ? 'interact' : 'attitude'), true);
        } catch (e) { toast(e.message || '发布失败'); }
      })();
      return;
    }
    case 'colLike': {
      (async () => {
        if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
        const id = el.dataset.id;
        const liked = el.dataset.liked === '1';
        try {
          const j = liked
            ? await api('/column/posts/' + encodeURIComponent(id) + '/like', { method: 'DELETE' })
            : await api('/column/posts/' + encodeURIComponent(id) + '/like', { method: 'POST' });
          el.dataset.liked = j.liked ? '1' : '0';
          el.classList.toggle('on', !!j.liked);
          el.textContent = j.liked ? '已赞' : '点赞';
          const card = el.closest('.col-post');
          if (card) {
            const eng = card.querySelector('.col-eng');
            if (eng) {
              const m = /(\d+)\s*人阅读/.exec(eng.textContent || '');
              const reads = m ? m[1] : '0';
              eng.textContent = reads + ' 人阅读 · ' + (j.likes || 0) + ' 赞';
            }
          }
          // invalidate feed caches lightly
          S.columnFeed = { attitude: null, interact: null };
        } catch (e) { toast(e.message || '操作失败'); }
      })();
      return;
    }
    case 'colDel': {
      (async () => {
        if (!loggedIn()) return go('#/login');
        if (!(await confirmDlg('删除帖子', '删除后他人将无法再看到这条内容。', '删除'))) return;
        try {
          await api('/column/posts/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
          S.columnFeed = { attitude: null, interact: null };
          S.columnAuthors = null;
          toast('已删除');
          render();
        } catch (e) { toast(e.message || '删除失败'); }
      })();
      return;
    }
    case 'openMe': return openMeDrawer();
    case 'closeMe': return closeMeDrawer();
    case 'guest': S.guest = true; LS.set('jc_guest', true); return go('#/home', true);
    case 'forgot': return confirmDlg('忘记密码', '当前版本暂未接入短信验证码，无法自助找回密码。<br>如需重置，请联系运营方客服协助处理。', '知道了');
    case 'logout': {
      if (!(await confirmDlg('退出登录', '退出后本机将不再显示账号内的方案与关注（云端数据保留，重新登录即可恢复）。', '退出'))) return;
      try { await api('/auth/logout', { method: 'POST' }); } catch { }
      clearSession(); S.guest = false; LS.set('jc_guest', false); toast('已退出登录'); return go('#/login', true);
    }
    case 'setTheme': {
      const th = el.dataset.theme === 'pitch' ? 'pitch' : 'luxury';
      setHomeTheme(th);
      toast('已切换为「' + THEME_LABEL[th] + '」');
      return render();
    }
    case 'cycleTheme': {
      const th = homeTheme() === 'pitch' ? 'luxury' : 'pitch';
      setHomeTheme(th);
      toast('已切换为「' + THEME_LABEL[th] + '」');
      return render();
    }
    case 'clearCache': {
      if (!(await confirmDlg('清除缓存', '将清除本机缓存的赛事/开奖数据与离线资源（不会退出登录，也不会删除你的方案与关注）。', '清除'))) return;
      LS.del('jc_cache_matches'); LS.del('jc_cache_results'); LS.del('jc_cache_schedule'); LS.del('jc_data_cache_v1'); clearHomeSnap(); invalidateTabKeep();
      try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { }
      try { await crestIdbClear(); } catch { }
      S.matches = S.schedule = S.results = null; S.liveScores = null; S.liveScoresAt = 0; await reloadData(true); render(); return toast('缓存已清除，数据已刷新');
    }
  }
});
document.addEventListener('input', e => {
  const form = e.target && e.target.closest && e.target.closest('#fColSearch');
  if (form && e.target.name === 'q') {
    S.columnSearch = String(e.target.value || '').trim();
    if (S._colSearchTimer) clearTimeout(S._colSearchTimer);
    S._colSearchTimer = setTimeout(() => loadColumnFeedUi(), 220);
  }
  if (e.target && e.target.id === 'tribe-hub-search') {
    S.tribeSearchQ = String(e.target.value || '');
    if (S._tribeSearchTimer) clearTimeout(S._tribeSearchTimer);
    S._tribeSearchTimer = setTimeout(() => {
      if (route().name !== 'tribe') return;
      if (!softPatchTribeHub()) render({ force: true });
      else invalidateTabKeep('tribe');
    }, 160);
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'bonusOptAmtInp') {
    S.bonusOpt.amount = Math.max(2, Math.min(99999, parseInt(e.target.value, 10) || 2));
    const lines = syncBonusOptFromCalc(false);
    renderBonusOptSheet(lines);
  }
  if (e.target.classList.contains('bonus-opt-mult-inp')) {
    const i = +e.target.dataset.line;
    const lines = expandCalcDanShiLines(S.calcSel, S.calcTypes);
    if (i >= 0 && i < lines.length) {
      const mults = S.bonusOpt.mults || [];
      mults[i] = Math.max(0, Math.min(9999, parseInt(e.target.value, 10) || 0));
      S.bonusOpt.mults = mults;
      renderBonusOptSheet(lines);
    }
  }
  if (e.target.id === 'schHideFin') { setSchHideFinished(!!e.target.checked); render(); }
  if (e.target.id === 'colMatchSel' || e.target.id === 'colTitle' || e.target.id === 'colBody') syncColumnComposeFromDom();
});

const PHONE_RE = /^1[3-9]\d{9}$/;
const pwOk = p => typeof p === 'string' && p.length >= 8 && p.length <= 32 && /[A-Za-z]/.test(p) && /\d/.test(p) && !/\s/.test(p);
async function afterAuth(res, isNew) {
  setSession(res.token, res.user);
  // merge guest (local) plans/favorites into the account, then drop the local copies
  const lp = LS.get('jc_plans_local', []), lf = LS.get('jc_favs_local', []), lt = LS.get('jc_tribe_follows_local', []);
  try {
    const s = await api('/sync', { method: 'POST', body: { plans: lp, favorites: lf, tribeFollows: lt } });
    S.plans = s.plans; S.favs = s.favorites; S.tribeFollows = s.tribeFollows || [];
    LS.set('jc_plans_local', []); LS.set('jc_favs_local', []); LS.set('jc_tribe_follows_local', []);
  } catch { S.plans = []; S.favs = []; S.tribeFollows = []; }
  persistLists();
  try { S.membership = await api('/membership/status'); } catch { S.membership = null; }
  S.memberCatalog = null;
  toast(isNew ? '注册成功，欢迎你！' : `欢迎回来，${res.user.nickname}` + (lp.length || lf.length || lt.length ? '（本机数据已同步）' : ''));
  go('#/home', true);
}
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  if (f.classList.contains('ai-chat-compose')) {
    const matchId = f.dataset.match;
    const inp = f.querySelector('input[name="body"]');
    const body = (inp && inp.value || '').trim();
    if (!body) return toast('请输入内容');
    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await sendAiChat(matchId, body);
      if (inp) inp.value = '';
    } catch (er) {
      const msg = (er && er.message) || '发送失败';
      if (/今日次数已用完/.test(msg)) toast('今日次数已用完');
      else toast(msg);
    }
    finally { if (btn) btn.disabled = false; if (inp) inp.focus(); }
    return;
  }
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

  if (f.id === 'fColSearch') {
    const q = String(new FormData(f).get('q') || '').trim();
    S.columnSearch = q;
    loadColumnFeedUi();
    return;
  }
  if (f.id === 'fNewsSearch') {
    const q = String(new FormData(f).get('q') || '').trim();
    S.newsQ = q;
    document.title = (q ? ('体坛资讯 · ' + q) : '体坛资讯') + ' · 竞彩预测';
    return go(q ? '#/news?q=' + encodeURIComponent(q) : '#/news', true);
  }
  if (f.id === 'fPdbSearch') {
    const q = String(new FormData(f).get('q') || '').trim();
    return runPlayerDbSearch(q);
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
  addEventListener('touchstart', e => { y0 = null; if (busy || window.__fbBusy || window.scrollY > 0 || !isShellTab(route().name) || !$('#sheet').classList.contains('hidden')) return; y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0; if (dy <= 0) return;
    const d = Math.min(dy * 0.5, 90); ptr.style.transition = 'none'; ptr.style.transform = `translate(-50%, ${d - 50}px)`;
    ptr.querySelector('.ptr-spin').style.transform = `rotate(${dy * 2}deg)`; txt(d > 60 ? '释放立即刷新' : '下拉刷新');
  }, { passive: true });
  addEventListener('touchend', async () => {
    if (y0 === null) return; const d = Math.min(dy * 0.5, 90); y0 = null; ptr.style.transition = '';
    if (d <= 60) { ptr.style.transform = ''; return; }
    busy = true; ptr.classList.add('loading'); ptr.style.transform = 'translate(-50%, 14px)'; txt('正在刷新…');
    try {
      // 1.9.245: 赛程页下拉刷新必须同步强刷实时比分（此前只刷新赛程列表，比分沿用旧缓存）
      const work = Promise.all([reloadData(true), refreshAccount(), pullRefreshScheduleLiveScores()]);
      const timed = new Promise((resolve) => setTimeout(resolve, 12000));
      await Promise.race([work, timed]);
      invalidateTabKeep();
      render({ force: true });
      txt('刷新完成');
    } catch (_) {
      txt('刷新失败');
      try { invalidateTabKeep(); render({ force: true }); } catch (_) {}
    } finally {
      setTimeout(() => { ptr.classList.remove('loading'); ptr.style.transform = ''; busy = false; }, 500);
    }
  });
})();

// ======================= boot =======================
loadLocalLists();
loadGoalAlertSeen();
// 1.9.265: first launch must prompt Android POST_NOTIFICATIONS even with zero favs
if (IS_APP) requestFavGoalNotifyPermission();
hydrateFromCache(); // 1.9.124: JSON lists
hydrateKbPacksCache(); // 1.9.158: KB list before first /kb paint
if (loggedIn()) prefetchKbPacksOnBoot(); // 1.9.161: idle KB warm; DC queue yields while #/kb or KB in-flight
hydratePredictCache(); // 1.9.125: predict reports so home sig matches snap
seedBootPackFromInline(); // 1.9.209: sync APK boot before any fetch
loadDataCenterBootPack(); // 1.9.156: bundled slices for first install / empty LS
ensurePartnerWatermark();
try { document.documentElement.setAttribute('data-boot', '1'); } catch (_) {}
window.__partnerGateReady = checkPartnerGate().then((ok) => {
  if (!ok) { window.__partnerKilled = true; return false; }
  return true;
});
if (!route().name || !location.hash || location.hash === '#') history.replaceState(null, '', (loggedIn() || S.guest) ? '#/home' : '#/login');
if (location.hash !== '#/home' && /^#\/(login|register)?$/.test(location.hash) === false) NAV.push('#/home');
NAV.push(location.hash || '#/home');

/** 1.9.125 cold home: restore persisted HTML snap (survives process kill) OR rebuild under boot-shell until above-fold ready. */
(function coldFirstPaint() {
  const r0 = route();
  const wantHome = r0.name === 'home' && (loggedIn() || S.guest);
  const v = document.getElementById('view');
  const snap = wantHome ? readHomeSnap() : null;
  let restored = false;
  if (snap && v && snap.html) {
    try {
      v.className = 'view';
      v.classList.add('paint-hold');
      v.innerHTML = snap.html;
      syncTabbar('home', true);
      render.last = location.hash || '#/home';
      render.lastSig = snap.sig || tabContentSig('home');
      render.lastTab = 'home';
      saveTabKeep('home', v);
      window.scrollTo(0, snap.y || 0);
      if (document.getElementById('bnTrack')) initBanner();
      restored = true;
      window.__homeSnapRestored = true;
      try { syncAndroidChrome('home'); renderPlanBar(); } catch (_) {}
    } catch (_) { restored = false; }
  }
  if (!restored) {
    render({ force: true });
  } else {
    try { if (window.JCFloatBall) window.JCFloatBall.syncRoute('home'); } catch (_) {}
    tickClock();
    // Soft async fill under shell / after reveal — do not wipe banner track until images settled
    setTimeout(() => {
      try {
        fillHomeNews();
        fillHomeColumnAuthors();
        refreshHomeMidFeed();
        // Banner: only refresh if track looks stale/empty
        const track = document.getElementById('bnTrack');
        if (track && track.children.length < 2) fillHomeBanners();
      } catch (_) {}
    }, 700);
  }
  const reveal = () => waitAboveFoldReady(v, restored ? 520 : 560).then(() => revealBootShell());
  reveal();
  // If first paint was empty/skel (no cache), keep shell until reloadData then one commit
  window.__bootReveal = reveal;
})();

window.__partnerGateReady.then((ok) => {
  if (!ok) return;
  // Soft: render() no-ops when content signature unchanged after network reload
  loadDataCenterBootPack();
  reloadData().then(() => {
    const r = route();
    if (r.name === 'home' && bootShellHeld() && !(S.matches && S.matches.length) && !window.__homeSnapRestored) {
      render({ force: true });
      waitAboveFoldReady(document.getElementById('view'), 480).then(() => revealBootShell());
    } else {
      render();
      tickClock();
      if (r.name === 'home') { try { persistHomeSnap(document.getElementById('view')); persistPredictCache(); } catch (_) {} }
      if (bootShellHeld()) revealBootShell();
    }
    ensureFavGoalPoll();
  });
  refreshAccount().then(() => {
    if (['me', 'plans', 'favs', 'profile', 'membership', 'orders', 'pay'].includes(route().name)) render({ force: true });
    requestFavGoalNotifyPermission();
    ensureFavGoalPoll();
  });
  loadMembershipCatalog();
  ensureFavGoalPoll();
});
setInterval(tickClock, 1000);
addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ensureFavGoalPoll();
    return;
  }
  tickClock();
  // 1.9.247: 回前台立即强刷赛程实时比分（后台期间 interval 不跑，比分/分钟会停滞）
  if (route().name === 'schedule') {
    pullRefreshScheduleLiveScores().then(() => { afterScheduleLiveScoresLoaded(); resumeScheduleLivePoll(); }).catch(() => {});
  }
  ensureFavGoalPoll();
});
if (IS_PARTNER) {
  setInterval(() => { if (!document.hidden && !window.__partnerKilled) checkPartnerGate(); }, 60 * 1000);
}
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
