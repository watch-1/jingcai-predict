// Free server-side EN→zh translation for foreign news.
// Primary: MyMemory (works from Aliyun CN). Optional de=email → 50k chars/day vs 5k anonymous.
// Fallback: Youdao aidemo when MyMemory rate-limits / quota exhausted.
// Caches by article id under data/news/translations/.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./db');

const PROVIDER = 'mymemory';
const FALLBACK_PROVIDER = 'youdao';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const YOUDAO_URL = 'https://aidemo.youdao.com/trans';
// MyMemory GET q limit ~500 bytes; keep under that for ASCII news.
const MAX_CHUNK = 450;
const FETCH_TIMEOUT_MS = 20000;
const CHUNK_GAP_MS = 150;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 700;
const UA = 'Mozilla/5.0 (compatible; JingcaiNews/1.4.1)';
// Email raises MyMemory free quota 5k→50k chars/day (no signup; tracked by email).
const MYMEMORY_EMAIL = String(process.env.MYMEMORY_EMAIL || 'jingcai-news@tiicai.local').trim();

const CACHE_DIR = () => path.join(DATA_DIR, 'news', 'translations');

const mem = new Map(); // id -> payload
const inflight = new Map();

class TranslateError extends Error {
  constructor(message, { code = 'TRANSLATE_FAILED', retryable = false, userMessage } = {}) {
    super(message);
    this.name = 'TranslateError';
    this.code = code;
    this.retryable = retryable;
    this.userMessage = userMessage || message;
  }
}

function ensureDir() {
  fs.mkdirSync(CACHE_DIR(), { recursive: true });
}

function cachePath(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(CACHE_DIR(), safe + '.json');
}

function sourceHash(title, html) {
  return crypto.createHash('sha256').update(String(title || '') + '\n' + String(html || ''), 'utf8').digest('hex');
}

function readCache(id, hash) {
  if (mem.has(id)) {
    const hit = mem.get(id);
    if (hit && hit.sourceHash === hash) return hit;
  }
  try {
    const obj = JSON.parse(fs.readFileSync(cachePath(id), 'utf8'));
    if (obj && obj.sourceHash === hash && obj.titleZh != null && obj.htmlZh != null) {
      mem.set(id, obj);
      return obj;
    }
  } catch { /* miss */ }
  return null;
}

function writeCache(id, payload) {
  ensureDir();
  mem.set(id, payload);
  try {
    fs.writeFileSync(cachePath(id), JSON.stringify(payload), 'utf8');
  } catch (e) {
    console.warn('translate cache write failed', e.message);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksTranslatable(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (!/[A-Za-z\u00C0-\u024F]/.test(t)) return false;
  const letters = t.replace(/\s+/g, '');
  const cjk = (letters.match(/[\u4e00-\u9fff]/g) || []).length;
  if (letters.length && cjk / letters.length > 0.55) return false;
  return true;
}

function isRateLimitMessage(s) {
  return /MYMEMORY WARNING|YOU USED ALL AVAILABLE|QUOTA|TOO MANY REQUESTS|RATE.?LIMIT|QUERY LENGTH LIMIT|NEXT AVAILABLE IN/i.test(String(s || ''));
}

function isDailyQuotaMessage(s) {
  return /YOU USED ALL AVAILABLE|QUOTA EXCEEDED|quotaFinished|NEXT AVAILABLE IN\s+\d+\s+HOURS/i.test(String(s || ''));
}

function classifyMyMemoryFailure(status, j, translatedText) {
  const detail = String(
    (j && (j.responseDetails || j.error)) ||
    translatedText ||
    ('HTTP ' + status)
  ).slice(0, 200);
  const quota = (j && j.quotaFinished) || isDailyQuotaMessage(detail) || isDailyQuotaMessage(translatedText);
  if (status === 429 || quota || isRateLimitMessage(detail) || isRateLimitMessage(translatedText)) {
    return new TranslateError(detail, {
      code: 'RATE_LIMIT',
      // Daily quota will not recover in seconds — skip long backoff, go to fallback.
      retryable: !quota,
      userMessage: quota
        ? '翻译服务今日额度已用完，正在切换备用通道…'
        : '翻译请求过快，正在重试…',
    });
  }
  return new TranslateError(detail, {
    code: 'PROVIDER_ERROR',
    retryable: status >= 500 || status === 408,
    userMessage: '翻译服务暂时异常，请稍后重试',
  });
}

/** Split plain text into ≤MAX_CHUNK pieces on sentence/space boundaries; also respect byte limit. */
function chunkText(text) {
  const s = String(text || '');
  if (!s) return [];
  const maxBytes = 480; // MyMemory ~500 byte cap
  const out = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + MAX_CHUNK, s.length);
    // Shrink if UTF-8 bytes exceed MyMemory limit
    while (end > i && Buffer.byteLength(s.slice(i, end), 'utf8') > maxBytes) {
      end = Math.max(i + 1, end - 20);
    }
    if (end < s.length) {
      const slice = s.slice(i, end);
      let breakAt = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('; '),
        slice.lastIndexOf(', '),
        slice.lastIndexOf(' ')
      );
      if (breakAt > MAX_CHUNK * 0.35) end = i + breakAt + 1;
      // Re-check bytes after boundary adjust
      while (end > i && Buffer.byteLength(s.slice(i, end), 'utf8') > maxBytes) {
        const slice2 = s.slice(i, end);
        const sp = slice2.lastIndexOf(' ');
        if (sp > 10) end = i + sp + 1;
        else end = Math.max(i + 1, end - 16);
      }
    }
    out.push(s.slice(i, end));
    i = end;
  }
  return out.filter(Boolean);
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* non-json */ }
    return { r, text, j };
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new TranslateError('翻译请求超时', {
        code: 'TIMEOUT',
        retryable: true,
        userMessage: '翻译超时，请稍后重试',
      });
    }
    throw new TranslateError(e.message || '网络错误', {
      code: 'NETWORK',
      retryable: true,
      userMessage: '无法连接翻译服务，请检查网络后重试',
    });
  } finally {
    clearTimeout(t);
  }
}

async function mymemoryOne(q, langpair) {
  const params = { q, langpair };
  if (MYMEMORY_EMAIL) params.de = MYMEMORY_EMAIL;
  const url = MYMEMORY_URL + '?' + new URLSearchParams(params).toString();
  const { r, text, j } = await fetchJson(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!j) throw new TranslateError('MyMemory 非JSON响应', { code: 'BAD_RESPONSE', userMessage: '翻译服务响应异常' });
  const out = (j.responseData && j.responseData.translatedText) || '';
  if (!r.ok || (j.responseStatus && j.responseStatus !== 200)) {
    throw classifyMyMemoryFailure(r.status || j.responseStatus, j, out);
  }
  if (!out) throw new TranslateError('MyMemory 空译文', { code: 'EMPTY', retryable: true, userMessage: '翻译结果为空，请稍后重试' });
  if (isRateLimitMessage(out) || /^\s*INVALID\s+LANGUAGE\s+PAIR/i.test(out) || /QUERY LENGTH LIMIT/i.test(out)) {
    throw classifyMyMemoryFailure(429, j, out);
  }
  return out;
}

async function youdaoOne(q) {
  const body = new URLSearchParams({
    q,
    from: 'en',
    to: 'zh-CHS',
  }).toString();
  const { r, j } = await fetchJson(YOUDAO_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
    body,
  });
  if (!j) throw new TranslateError('备用翻译非JSON响应', { code: 'BAD_RESPONSE', userMessage: '备用翻译响应异常' });
  const code = String(j.errorCode == null ? '' : j.errorCode);
  if (!r.ok || (code && code !== '0')) {
    const retryable = code === '411' || code === '103' || r.status === 429 || r.status >= 500;
    throw new TranslateError('Youdao error ' + (code || r.status), {
      code: retryable ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
      retryable,
      userMessage: '备用翻译暂时不可用，请稍后重试',
    });
  }
  const out = Array.isArray(j.translation) ? j.translation.join('') : String(j.translation || '');
  if (!out) throw new TranslateError('备用翻译空译文', { code: 'EMPTY', retryable: true, userMessage: '翻译结果为空，请稍后重试' });
  return out;
}

/** Reject MyMemory TM junk (e.g. Devanagari for Latin "Hello "). */
function translationLooksSane(source, translated) {
  const src = String(source || '');
  const out = String(translated || '');
  if (!out.trim()) return false;
  if (isRateLimitMessage(out)) return false;
  const srcLatin = (src.match(/[A-Za-z]/g) || []).length;
  if (srcLatin < 3) return true;
  const outCjk = (out.match(/[\u4e00-\u9fff]/g) || []).length;
  const outLatin = (out.match(/[A-Za-z]/g) || []).length;
  const outWeird = (out.match(/[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF]/g) || []).length;
  if (outWeird > 2 && outCjk === 0) return false;
  if (outCjk === 0 && outLatin > 0 && srcLatin > 8) {
    return out.length >= Math.min(4, src.trim().length);
  }
  return true;
}

async function withRetries(fn, { label = 'translate' } = {}) {
  let last;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      const retryable = e && (e.retryable || e.code === 'RATE_LIMIT' || e.code === 'TIMEOUT' || e.code === 'NETWORK');
      if (!retryable || attempt >= MAX_RETRIES) break;
      const wait = BACKOFF_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      console.warn(label, 'retry', attempt + 1, 'after', wait, 'ms:', e.message);
      await sleep(wait);
    }
  }
  throw last;
}

/**
 * Translate one chunk: MyMemory with retries; on sustained rate-limit → Youdao fallback.
 */
async function translateChunk(text, langpair) {
  let rateLimited = false;
  try {
    return {
      text: await withRetries(() => mymemoryOne(text, langpair), { label: 'mymemory' }),
      provider: PROVIDER,
    };
  } catch (e) {
    if (e && e.code === 'RATE_LIMIT') rateLimited = true;
    else if (!(e && (e.code === 'TIMEOUT' || e.code === 'NETWORK' || e.retryable))) throw e;
    console.warn('mymemory failed, trying youdao fallback:', e.message);
  }
  try {
    const out = await withRetries(() => youdaoOne(text), { label: 'youdao' });
    return { text: out, provider: FALLBACK_PROVIDER, fellBack: rateLimited || true };
  } catch (e2) {
    throw new TranslateError(e2.message || '翻译失败', {
      code: rateLimited ? 'RATE_LIMIT' : (e2.code || 'TRANSLATE_FAILED'),
      retryable: false,
      userMessage: rateLimited
        ? '翻译额度已用完，备用通道也暂不可用，请数小时后再试'
        : (e2.userMessage || '翻译暂时不可用，请稍后重试'),
    });
  }
}

async function translatePlain(text, opts = {}) {
  const { source = 'en', target = 'zh-CN', stats } = opts;
  const s = String(text || '');
  if (!looksTranslatable(s)) return s;
  const langpair = source + '|' + target;
  const parts = chunkText(s);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i) await sleep(CHUNK_GAP_MS);
    let got;
    let provider = PROVIDER;
    const r = await translateChunk(parts[i], langpair);
    got = r.text;
    provider = r.provider;
    if (!translationLooksSane(parts[i], got)) {
      const padded = /[.!?]$/.test(parts[i].trim()) ? parts[i] + ' News.' : parts[i].trimEnd() + '.';
      try {
        const retry = await translateChunk(padded, langpair);
        if (translationLooksSane(parts[i], retry.text)) {
          got = retry.text.replace(/\s*News\.?\s*$/i, '').replace(/\.\s*$/, (parts[i].match(/[.!?]\s*$/) || [''])[0]);
          provider = retry.provider;
        } else {
          got = parts[i];
        }
      } catch {
        got = parts[i];
      }
    }
    out.push(got);
    if (stats && stats.providers) stats.providers.add(provider);
  }
  return out.join('');
}

/**
 * Tokenize HTML into tags vs text; translate text nodes only (keeps markup / attrs).
 * Skips script/style contents.
 */
function tokenizeHtml(html) {
  const s = String(html || '');
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
  let m;
  while ((m = re.exec(s))) {
    const v = m[0];
    if (v.startsWith('<')) tokens.push({ type: 'tag', value: v });
    else tokens.push({ type: 'text', value: v });
  }
  return tokens;
}

function isSkipTag(tag) {
  return /^<\/?(script|style|noscript|code|pre)\b/i.test(tag);
}

async function translateHtml(html, opts) {
  const s = String(html || '');
  if (!s.trim()) return s;
  const blockRe = /(<(?:p|h[1-6]|li|blockquote|div|section|article|figcaption|td|th)(\s[^>]*)?>)([\s\S]*?)(<\/(?:p|h[1-6]|li|blockquote|div|section|article|figcaption|td|th)>)/gi;
  const parts = [];
  let last = 0;
  let m;
  const matches = [];
  while ((m = blockRe.exec(s))) matches.push(m);
  if (!matches.length) {
    return await translateHtmlTextNodes(s, opts);
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.index > last) parts.push(s.slice(last, m.index));
    const open = m[1];
    const inner = m[3];
    const close = m[4];
    const translatedInner = await translateInlineHtml(inner, opts);
    parts.push(open + translatedInner + close);
    last = m.index + m[0].length;
    if (i + 1 < matches.length) await sleep(CHUNK_GAP_MS);
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts.join('');
}

async function translateInlineHtml(inner, opts) {
  const tags = [];
  const masked = String(inner || '').replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => {
    const i = tags.length;
    tags.push(tag);
    return ' XPH' + i + 'X ';
  });
  if (!looksTranslatable(masked.replace(/XPH\d+X/g, ' '))) return inner;
  let translated = await translatePlain(masked, opts);
  const found = [];
  const re = /XPH\s*(\d+)\s*X/gi;
  let m;
  while ((m = re.exec(translated))) found.push(+m[1]);
  translated = translated.replace(/\s*XPH\s*(\d+)\s*X\s*/gi, (all, n) => {
    const i = +n;
    return tags[i] != null ? tags[i] : all;
  });
  if (tags.length && found.length < tags.length * 0.5) {
    return await translateHtmlTextNodes(inner, opts);
  }
  return translated;
}

async function translateHtmlTextNodes(html, opts) {
  const tokens = tokenizeHtml(html);
  let skipDepth = 0;
  const jobs = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'tag') {
      if (/^<(script|style|noscript|code|pre)\b/i.test(tok.value) && !/\/>$/.test(tok.value)) skipDepth++;
      else if (/^<\/(script|style|noscript|code|pre)\b/i.test(tok.value) && skipDepth) skipDepth--;
      continue;
    }
    if (skipDepth) continue;
    if (!looksTranslatable(tok.value)) continue;
    jobs.push(i);
  }
  for (let j = 0; j < jobs.length; j++) {
    if (j) await sleep(CHUNK_GAP_MS);
    const i = jobs[j];
    tokens[i].value = await translatePlain(tokens[i].value, opts);
  }
  return tokens.map((t) => t.value).join('');
}

async function translateArticle(id, { title, html } = {}) {
  const key = String(id || '').trim();
  if (!key) throw new TranslateError('缺少资讯 id', { code: 'BAD_REQUEST', userMessage: '缺少资讯 id' });
  const titleIn = String(title || '');
  const htmlIn = String(html || '');
  const hash = sourceHash(titleIn, htmlIn);

  const cached = readCache(key, hash);
  if (cached) {
    return {
      id: key,
      provider: cached.provider || PROVIDER,
      cached: true,
      titleZh: cached.titleZh,
      htmlZh: cached.htmlZh,
      disclaimerZh: '机器翻译仅供参考',
      fetchedAt: cached.fetchedAt,
    };
  }

  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const stats = { providers: new Set() };
    const titleZh = await translatePlain(titleIn, { stats });
    await sleep(CHUNK_GAP_MS);
    const htmlZh = htmlIn ? await translateHtml(htmlIn, { stats }) : '';
    const provider = stats.providers.has(FALLBACK_PROVIDER)
      ? (stats.providers.has(PROVIDER) ? PROVIDER + '+' + FALLBACK_PROVIDER : FALLBACK_PROVIDER)
      : PROVIDER;
    const payload = {
      id: key,
      provider,
      sourceHash: hash,
      titleZh: String(titleZh),
      htmlZh: String(htmlZh),
      fetchedAt: new Date().toISOString(),
    };
    writeCache(key, payload);
    return {
      id: key,
      provider,
      cached: false,
      titleZh: payload.titleZh,
      htmlZh: payload.htmlZh,
      disclaimerZh: '机器翻译仅供参考',
      fetchedAt: payload.fetchedAt,
    };
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

module.exports = {
  PROVIDER,
  FALLBACK_PROVIDER,
  TranslateError,
  translateArticle,
  translatePlain,
  translateHtml,
  looksTranslatable,
  chunkText,
  sourceHash,
  isRateLimitMessage,
};
