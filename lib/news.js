// Domestic Chinese sports news aggregator (懂球帝公开接口 + 中新网/人民网 RSS).
// English RSS (?lang=en): Sky/BBC/Guardian/ESPN. In-app reader scrapes article body server-side
// (box or Aliyun); CN clients only hit 120.77.152.74. Foreign images via /api/news-image.
// If scrape fails: RSS summary + proxied thumb — never open foreign iframe as primary.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR, archiveNewsItems, queryNewsArchive, getArchivedNewsItem } = require('./db');

const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const CACHE_DIR = () => path.join(DATA_DIR, 'news');
const CACHE_FILE = (lang) => path.join(CACHE_DIR(), lang === 'en' ? 'cache-en.json' : 'cache-zh.json');

// Default: 国内体坛中文源（经 box + 阿里云 120.77.152.74 实测可达）
const SOURCES_ZH = [
  {
    id: 'dq_top',
    name: '懂球帝',
    nameZh: '懂球帝',
    format: 'dongqiudi',
    url: 'https://api.dongqiudi.com/app/tabs/android/1.json',
  },
  {
    id: 'dq_epl',
    name: '懂球帝英超',
    nameZh: '懂球帝·英超',
    format: 'dongqiudi',
    url: 'https://api.dongqiudi.com/app/tabs/android/3.json',
  },
  {
    id: 'dq_csl',
    name: '懂球帝中超',
    nameZh: '懂球帝·中超',
    format: 'dongqiudi',
    url: 'https://api.dongqiudi.com/app/tabs/android/56.json',
  },
  {
    id: 'chinanews',
    name: '中国新闻网',
    nameZh: '中新网体育',
    format: 'rss',
    url: 'https://www.chinanews.com.cn/rss/sports.xml',
  },
  {
    id: 'people',
    name: '人民网',
    nameZh: '人民网体育',
    format: 'rss',
    url: 'https://www.people.com.cn/rss/sports.xml',
  },
];

// Optional English feeds (?lang=en) — often blocked or empty from CN egress
const SOURCES_EN = [
  {
    id: 'sky',
    name: 'Sky Sports',
    nameZh: '天空体育',
    format: 'rss',
    url: 'https://www.skysports.com/rss/12040',
  },
  {
    id: 'espn',
    name: 'ESPN FC',
    nameZh: 'ESPN足球',
    format: 'rss',
    url: 'https://www.espn.com/espn/rss/soccer/news',
  },
  {
    id: 'bbc',
    name: 'BBC Sport',
    nameZh: 'BBC体育',
    format: 'rss',
    url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    nameZh: '卫报足球',
    format: 'rss',
    url: 'https://www.theguardian.com/football/rss',
  },
];

// Prefer Chinese keys for 竞彩 team filter; English tokens still help EN mode
const ZH_TEAM = {
  '曼城': ['Manchester City', 'Man City'],
  '曼联': ['Manchester United', 'Man United', 'Man Utd'],
  '利物浦': ['Liverpool'],
  '阿森纳': ['Arsenal'],
  '切尔西': ['Chelsea'],
  '热刺': ['Tottenham', 'Spurs'],
  '纽卡': ['Newcastle'],
  '维拉': ['Aston Villa'],
  '布莱顿': ['Brighton'],
  '西汉姆': ['West Ham'],
  '富勒姆': ['Fulham'],
  '狼队': ['Wolves', 'Wolverhampton'],
  '埃弗顿': ['Everton'],
  '水晶宫': ['Crystal Palace'],
  '布伦特福德': ['Brentford'],
  '诺丁汉': ['Nottingham Forest', 'Forest'],
  '伯恩茅斯': ['Bournemouth'],
  '莱斯特': ['Leicester'],
  '南安普顿': ['Southampton'],
  '伊普斯维奇': ['Ipswich'],
  '皇马': ['Real Madrid'],
  '巴萨': ['Barcelona', 'Barça', 'Barca'],
  '马竞': ['Atletico Madrid', 'Atlético'],
  '塞维利亚': ['Sevilla'],
  '皇家社会': ['Real Sociedad'],
  '比利亚雷亚尔': ['Villarreal'],
  '拜仁': ['Bayern', 'Bayern Munich'],
  '多特': ['Dortmund', 'Borussia Dortmund'],
  '勒沃库森': ['Leverkusen'],
  '莱比锡': ['Leipzig', 'RB Leipzig'],
  '法兰克福': ['Frankfurt'],
  '国米': ['Inter', 'Inter Milan'],
  '米兰': ['AC Milan', 'Milan'],
  '尤文': ['Juventus', 'Juve'],
  '那不勒斯': ['Napoli'],
  '罗马': ['Roma', 'AS Roma'],
  '拉齐奥': ['Lazio'],
  '亚特兰大': ['Atalanta'],
  '佛罗伦萨': ['Fiorentina'],
  '巴黎': ['PSG', 'Paris Saint-Germain', 'Paris'],
  '马赛': ['Marseille'],
  '里昂': ['Lyon'],
  '摩纳哥': ['Monaco'],
  '葡体': ['Sporting'],
  '本菲卡': ['Benfica'],
  '波尔图': ['Porto'],
  '阿贾克斯': ['Ajax'],
  '埃因霍温': ['PSV'],
  '凯尔特人': ['Celtic'],
  '流浪者': ['Rangers'],
  '上海海港': ['Shanghai Port'],
  '上海申花': ['Shanghai Shenhua'],
  '山东泰山': ['Shandong Taishan'],
  '北京国安': ['Beijing Guoan'],
  '成都蓉城': ['Chengdu Rongcheng'],
  '武汉三镇': ['Wuhan Three Towns'],
  '天津津门虎': ['Tianjin Jinmen Tiger'],
  '浙江': ['Zhejiang'],
  '河南': ['Henan'],
  '青岛海牛': ['Qingdao Hainiu'],
  '青岛西海岸': ['Qingdao West Coast'],
  '梅州客家': ['Meizhou Hakka'],
  '长春亚泰': ['Changchun Yatai'],
  '深圳新鹏城': ['Shenzhen Peng City'],
};

const memByLang = { zh: null, en: null };
const inflightByLang = { zh: null, en: null };

function normalizeLang(lang) {
  return String(lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

function sourcesFor(lang) {
  return normalizeLang(lang) === 'en' ? SOURCES_EN : SOURCES_ZH;
}

function readDisk(lang) {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE(lang), 'utf8'));
  } catch {
    // migrate legacy cache.json into zh once
    if (lang === 'zh') {
      try {
        const legacy = JSON.parse(fs.readFileSync(path.join(CACHE_DIR(), 'cache.json'), 'utf8'));
        return legacy;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function writeDisk(lang, obj) {
  try {
    fs.mkdirSync(CACHE_DIR(), { recursive: true });
    const tmp = CACHE_FILE(lang) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, CACHE_FILE(lang));
  } catch (e) {
    console.warn('news cache write failed', e.message);
  }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(block, tag) {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`,
    'i'
  );
  const m = block.match(re);
  if (!m) return '';
  return stripHtml(m[1] != null && m[1] !== undefined ? m[1] : m[2] || '');
}

function attrIn(block, re) {
  const m = block.match(re);
  return m ? String(m[1] || '').trim() : '';
}

function parsePubDate(s) {
  if (!s) return null;
  const t = Date.parse(String(s).replace(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2+08:00'));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Prefer created_at when published_at is a far-future pin (懂球帝置顶常见). */
function pickTime(...candidates) {
  const now = Date.now();
  const parsed = candidates.map(parsePubDate).filter(Boolean);
  for (const iso of parsed) {
    const t = Date.parse(iso);
    if (t <= now + 24 * 60 * 60 * 1000) return iso; // allow up to +1 day skew
  }
  return parsed[0] || null;
}


/** Upgrade 懂球帝 CDN thumbs: list uses 640x480 crop; full strips size/crop segments. */
function rewriteDqImageUrl(url, mode) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (mode === 'full') {
    return u.replace(/\/\d+x-?\d*\/(?:crop\/)?-\/(?:-\/)?/, '/');
  }
  if (/\/\d+x\d+\/crop\/-\//.test(u)) {
    return u.replace(/\/\d+x\d+\/crop\/-\//, '/640x480/crop/-/');
  }
  if (/\/\d+x-\/-\/-\//.test(u)) {
    return u.replace(/\/\d+x-\/-\/-\//, '/640x480/crop/-/');
  }
  return u;
}

function extractDongqiudiId(linkOrId) {
  const s = String(linkOrId || '').trim();
  if (/^\d+$/.test(s)) return s;
  const m =
    s.match(/dongqiudi\.com\/article\/(\d+)/i) ||
    s.match(/[?&]articleId=(\d+)/i) ||
    s.match(/dongqiudi:\/\/\/news\/(\d+)/i);
  return m ? m[1] : '';
}

function escapeAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Unwrap /api/news-image?url=… back to the upstream URL for filtering. */
function unwrapNewsImageSrc(src) {
  let s = String(src || '').trim();
  const m = s.match(/\/api\/news-image\?url=([^&"']+)/i);
  if (m) {
    try {
      s = decodeURIComponent(m[1]);
    } catch {
      /* keep encoded */
    }
  }
  return s;
}

/**
 * Skip tiny icons / reaction glyphs / author avatars that would stretch huge under width:100%.
 * Prefer real content photos (og cover + in-body photos without tiny display sizes).
 */
function shouldSkipArticleImage(src, attrs) {
  const raw = unwrapNewsImageSrc(src);
  if (!raw || /^data:/i.test(raw)) return true;
  const u = raw.toLowerCase();
  // Known decorative / UI chrome
  if (
    /content-reactions|\/check\.png|favicon|sprite|\/emoji|\/icons?\/|pixel\.|(?:[^0-9]|^)1x1(?:[^0-9]|$)|tracking|badge[-_]?(?:small|icon)|placeholder|\/thumbnail(?:\?|$)/i.test(
      u
    )
  ) {
    return true;
  }
  // ESPN columnist headshots / generic avatars
  if (/\/i\/columnists\//i.test(u) || /espn_generic_[mf]\.jpe?g/i.test(u)) return true;
  // 中新网 chrome / site logos (not article photos)
  if (/\/fileftp\//i.test(u) && /logo|U435P4T47D50136|U947P4T47D55186/i.test(u)) return true;
  if (/\/default\/[0-9a-f]+\//i.test(u) && /\/(qw|jw|ecns)\.jpe?g/i.test(u)) return true;
  if (/\/images\/images1\/logo/i.test(u) || /toparr\.png/i.test(u)) return true;

  const getAttr = (name) => {
    if (!attrs) return '';
    const m = String(attrs).match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|(\\d+))', 'i'));
    return m ? (m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] || '') : '';
  };
  const wAttr = parseInt(getAttr('width'), 10);
  const hAttr = parseInt(getAttr('height'), 10);
  if ((wAttr > 0 && wAttr <= 120) || (hAttr > 0 && hAttr <= 120)) return true;

  // ESPN combiner & similar: display size in query (?w=80&h=80, ?w=130&h=130)
  const qw = u.match(/[?&]w(?:idth)?=(\d+)/);
  const qh = u.match(/[?&]h(?:eight)?=(\d+)/);
  if (qw || qh) {
    const w = qw ? parseInt(qw[1], 10) : 0;
    const h = qh ? parseInt(qh[1], 10) : 0;
    if ((!w || w <= 160) && (!h || h <= 160) && (w > 0 || h > 0)) return true;
  }
  return false;
}

/** Drop decorative/tiny <img> from already-sanitized (or raw) article HTML. */
function scrubArticleHtmlImages(html) {
  return String(html || '').replace(/<img\b([^>]*)>/gi, (tag, attrs) => {
    const m = String(attrs).match(/src\s*=\s*("([^"]*)"|'([^']*)')/i);
    const src = m ? (m[2] != null ? m[2] : m[3] || '') : '';
    if (!src || shouldSkipArticleImage(src, attrs)) return '';
    return tag;
  });
}

/** Allowlist-sanitize article HTML; rewrite images to full-res and /api/news-image proxy paths. */
function sanitizeArticleHtml(html) {
  let s = String(html || '');
  if (!s) return '';
  // Drop scripts/styles/iframes and event handlers
  s = s.replace(/<(script|style|iframe|object|embed|form|link|meta)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove 懂球帝 interactive score widgets / ads shells
  s = s.replace(/<div[^>]*(?:playscore|dqd_ad|ad-wrap|advertise)[^>]*>[\s\S]*?<\/div>/gi, '');
  // Promote lazy-load attrs to src; skip tiny icons / reaction glyphs
  s = s.replace(/<img\b([^>]*)>/gi, (_, attrs) => {
    const get = (name) => {
      const m = attrs.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
      return m ? (m[2] != null ? m[2] : m[3] || '') : '';
    };
    let src = get('orig-src') || get('data-gif-src') || get('data-src') || get('src');
    if (!src) return '';
    if (src.startsWith('//')) src = 'https:' + src;
    src = rewriteDqImageUrl(src, 'full');
    if (!/^https?:\/\//i.test(src)) return '';
    if (shouldSkipArticleImage(src, attrs)) return '';
    const alt = get('alt') || '';
    const proxy = '/api/news-image?url=' + encodeURIComponent(src);
    return `<img src="${escapeAttr(proxy)}" alt="${escapeAttr(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="if(window.newsImgOnError)newsImgOnError(this,'remove')"/>`;
  });
  // Anchors: keep http(s) only, force noopener
  s = s.replace(/<a\b([^>]*)>/gi, (_, attrs) => {
    const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^\']*)')/i);
    let href = m ? (m[2] != null ? m[2] : m[3] || '') : '';
    if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:\/\//i.test(href)) return '<a>';
    return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`;
  });
  // Strip disallowed tags (keep content)
  s = s.replace(/<\/?(?!\/?(?:p|br|img|a|strong|b|em|i|h2|h3|ul|ol|li|blockquote|span)\b)[a-z0-9]+(?:\s[^>]*)?\/?>/gi, '');
  // Collapse empty paragraphs from removed widgets
  s = s.replace(/<p>\s*<\/p>/gi, '');
  return scrubArticleHtmlImages(s.trim());
}


const ARTICLE_TTL_MS = 60 * 60 * 1000;
const articleMem = new Map();

function articleCachePath(key) {
  return path.join(CACHE_DIR(), 'articles', key + '.json');
}

function readArticleCache(key) {
  const mem = articleMem.get(key);
  if (mem && Date.now() - mem.at < ARTICLE_TTL_MS) return mem.payload;
  try {
    const obj = JSON.parse(fs.readFileSync(articleCachePath(key), 'utf8'));
    if (obj && obj.fetchedAt && Date.now() - Date.parse(obj.fetchedAt) < ARTICLE_TTL_MS) {
      articleMem.set(key, { at: Date.now(), payload: obj });
      return obj;
    }
  } catch { /* miss */ }
  return null;
}

function writeArticleCache(key, payload) {
  try {
    const dir = path.join(CACHE_DIR(), 'articles');
    fs.mkdirSync(dir, { recursive: true });
    const tmp = articleCachePath(key) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, articleCachePath(key));
    articleMem.set(key, { at: Date.now(), payload });
  } catch (e) {
    console.warn('article cache write failed', e.message);
  }
}

async function fetchDongqiudiBody(articleId) {
  const url = `https://api.dongqiudi.com/v2/article/detail/${articleId}`;
  const text = await fetchText(url);
  const j = JSON.parse(text);
  if (!j || (j.code !== 0 && j.code !== '0' && j.message && j.message !== 'OK')) {
    if (!(j && j.data && j.data.body)) throw new Error('懂球帝详情接口异常');
  }
  const data = j.data || {};
  const html = sanitizeArticleHtml(data.body || '');
  if (!html || html.length < 40) throw new Error('正文为空');
  let cover = rewriteDqImageUrl(data.thumb || '', 'full');
  return {
    mode: 'html',
    html,
    cover: cover || '',
    writer: String(data.writer || '').trim(),
    sourceName: String(data.source || '懂球帝').trim(),
    attribution: `来源：${data.source || '懂球帝'}${data.writer ? ' · 作者 ' + data.writer : ''} · 应用内阅读，版权归原出处所有`,
  };
}

/** Class token match: avoid prefix hits (e.g. sdc-article-body vs sdc-article-body-width-limiter). */
function classTokenRe(sel) {
  const esc = String(sel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<(div|article|section)([^>]*class=["']([^"']*)["'][^>]*)>`,
    'gi'
  );
}

function elementHasClass(classAttr, sel) {
  return String(classAttr || '')
    .split(/\\s+/)
    .filter(Boolean)
    .includes(sel);
}

/** Depth-aware extract of first element whose class list contains exact token `sel`. */
function extractByClassToken(html, sel) {
  const src = String(html || '');
  const re = /<(div|article|section)([^>]*class=["']([^"']*)["'][^>]*)>/gi;
  let m;
  while ((m = re.exec(src))) {
    if (!elementHasClass(m[3], sel)) continue;
    const tag = m[1].toLowerCase();
    const start = m.index + m[0].length;
    const slice = src.slice(start);
    let depth = 1;
    let pos = 0;
    const openRe = new RegExp(`<${tag}\\b`, 'gi');
    const closeRe = new RegExp(`</${tag}>`, 'gi');
    while (depth > 0 && pos < slice.length) {
      openRe.lastIndex = pos;
      closeRe.lastIndex = pos;
      const o = openRe.exec(slice);
      const c = closeRe.exec(slice);
      if (!c) break;
      if (o && o.index < c.index) {
        depth++;
        pos = o.index + 1;
      } else {
        depth--;
        if (depth === 0) return slice.slice(0, c.index);
        pos = c.index + 1;
      }
    }
    return slice.slice(0, Math.min(slice.length, 120000));
  }
  return '';
}

function extractBySelectors(html, selectors) {
  const src = String(html || '');
  for (const sel of selectors) {
    let raw = extractByClassToken(src, sel);
    if (!raw) {
      // legacy shallow cut for CN pages (left_zw etc.)
      const startRe = new RegExp(
        `<div[^>]*class=["']([^"']*)["'][^>]*>`,
        'gi'
      );
      let sm;
      while ((sm = startRe.exec(src))) {
        if (!elementHasClass(sm[1], sel)) continue;
        const start = sm.index + sm[0].length;
        const tail = src.slice(start);
        const endM = tail.match(
          /<\/div>\s*<div[^>]*(?:adEditor|editor|edit|function_code|more_page)|<\/div>\s*<script|责任编辑|（记者|\[责任编辑|<!--\s*正文结束/i
        );
        raw = endM ? tail.slice(0, endM.index) : tail.slice(0, 120000);
        break;
      }
    }
    if (!raw) continue;
    raw = raw.replace(/<table[\s\S]*?adInContent[\s\S]*?<\/table>/gi, '');
    raw = raw.replace(/<!--[\s\S]*?-->/g, '');
    if (raw.replace(/<[^>]+>/g, '').trim().length > 80) return raw;
  }
  return '';
}

function extractOgMeta(html) {
  const src = String(html || '');
  const get = (prop) => {
    const re1 = new RegExp(
      `property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const re2 = new RegExp(
      `content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
      'i'
    );
    const m = src.match(re1) || src.match(re2);
    return m ? String(m[1] || '').trim() : '';
  };
  let image = get('og:image') || get('twitter:image') || get('twitter:image:src');
  if (image && image.startsWith('//')) image = 'https:' + image;
  const description = get('og:description') || get('twitter:description') || '';
  return { image, description: stripHtml(description) };
}

/**
 * 1.9.87: pick a list-card cover when RSS has no enclosure.
 * Prefer og/twitter image; else first real photo inside article body blocks
 * (中新网 left_zw / 人民网 content / generic article).
 */
function extractCoverFromHtml(html) {
  const src = String(html || '');
  if (!src) return '';
  const og = extractOgMeta(src);
  if (og.image && !shouldSkipArticleImage(og.image, '')) {
    return og.image.startsWith('//') ? ('https:' + og.image) : og.image;
  }
  // Prefer images inside known content containers
  const chunks = [];
  const pushChunk = (re) => {
    const m = src.match(re);
    if (m) chunks.push(m[1] || m[0]);
  };
  pushChunk(/<div[^>]*class=["'][^"']*left_zw[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  pushChunk(/<div[^>]*id=["']?(?:rwb_zw|articleContent|content|cont_\d+)["']?[^>]*>([\s\S]*?)<\/div>/i);
  pushChunk(/<div[^>]*class=["'][^"']*content_maincontent_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  pushChunk(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (!chunks.length) chunks.push(src.slice(0, 200000));

  const candidates = [];
  for (const chunk of chunks) {
    const re = /<img\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(chunk))) {
      const attrs = m[1] || '';
      const get = (name) => {
        const am = attrs.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
        return am ? (am[2] != null ? am[2] : am[3] || '') : '';
      };
      let img = get('data-src') || get('data-original') || get('orig-src') || get('src');
      if (!img) continue;
      if (img.startsWith('//')) img = 'https:' + img;
      if (!/^https?:\/\//i.test(img)) continue;
      if (shouldSkipArticleImage(img, attrs)) continue;
      const score =
        (/simg\/ypt|\/cspimp\/|\/upload\/|\/photo\/|\/media\/|fastdfs|\/ace\//i.test(img) ? 50 : 0) +
        (/\.(jpe?g|png|webp)(?:$|\?)/i.test(img) ? 10 : 0) +
        (/fileftp|logo|icon|sprite/i.test(img) ? -40 : 0);
      candidates.push({ img, score });
      if (candidates.length >= 12) break;
    }
    if (candidates.length) break;
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].img;
}

function harvestParagraphsHtml(html) {
  const src = String(html || '');
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(src))) {
    const inner = m[1] || '';
    const plain = stripHtml(inner);
    if (plain.length < 40) continue;
    if (
      /cookie|subscribe|sign in|newsletter|advertisement|related topics|accept all|privacy policy/i.test(
        plain
      )
    )
      continue;
    out.push('<p>' + inner + '</p>');
    if (out.length >= 40) break;
  }
  return out.join('\n');
}

const EN_SOURCE_IDS = new Set(['sky', 'espn', 'bbc', 'guardian']);

function isEnForeignItem(item) {
  const sid = (item && item.sourceId) || '';
  if (EN_SOURCE_IDS.has(sid)) return true;
  const link = String((item && item.link) || '');
  return /(?:skysports\.com|espn\.com|bbc\.(?:co\.uk|com)|theguardian\.com)/i.test(link);
}

const EN_SCRAPE = {
  sky: {
    selectors: ['sdc-article-body', 'article-body'],
    sourceName: '天空体育',
  },
  espn: {
    selectors: ['article-body', 'article'],
    sourceName: 'ESPN足球',
  },
  bbc: {
    selectors: ['ssrcss-11r1ur1-RichTextComponentWrapper', 'article-body', 'story-body'],
    sourceName: 'BBC体育',
  },
  guardian: {
    selectors: ['article-body-viewer-selector', 'article-body-commercial-selector', 'content__article-body'],
    sourceName: '卫报足球',
  },
};

function escapeText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function summaryFallback(item, reason) {
  const sourceName = (item && (item.sourceZh || item.source)) || '';
  const summary = String((item && item.summary) || '').trim();
  const htmlFromSummary = summary
    ? `<p>${escapeText(summary)}</p>`
    : `<p>${escapeText('暂无摘要正文。正文抓取受限，请稍后再试或切换其它资讯。')}</p>`;
  return {
    mode: 'summary',
    html: htmlFromSummary,
    cover: (item && (item.thumbFull || item.thumb)) || '',
    writer: '',
    sourceName,
    attribution: `来源：${sourceName} · ${
      reason ? '正文抓取受限，显示摘要' : '摘要'
    } · 版权归原出处所有`,
    error: reason || undefined,
  };
}

async function fetchHtmlArticle(pageUrl, { selectors, sourceName, embedUrl, allowEmbed = true, allowHarvest = true }) {
  const text = await fetchText(pageUrl);
  if (!/html/i.test(text.slice(0, 200)) && text.length < 200) throw new Error('非 HTML');
  const og = extractOgMeta(text);
  let raw = extractBySelectors(text, selectors);
  if (!raw) {
    // looser: content_main / article body (CN sites)
    const m = text.match(/<div[^>]*id=["']?(?:rwb_zw|articleContent|content)["']?[^>]*>([\s\S]*?)<\/div>/i);
    if (m) raw = m[1];
  }
  if ((!raw || raw.replace(/<[^>]+>/g, '').trim().length < 80) && allowHarvest) {
    raw = harvestParagraphsHtml(text);
  }
  const html = sanitizeArticleHtml(raw);
  const cover = extractCoverFromHtml(src) || og.image || '';
  if (html && html.replace(/<[^>]+>/g, '').trim().length > 80) {
    return {
      mode: 'html',
      html,
      cover,
      writer: '',
      sourceName,
      attribution: `来源：${sourceName} · 应用内阅读，版权归原出处所有`,
    };
  }
  if (!allowEmbed) {
    const err = new Error('正文不足');
    err.og = og;
    err.cover = cover;
    throw err;
  }
  return {
    mode: 'embed',
    html: '',
    cover,
    writer: '',
    sourceName,
    embedUrl: embedUrl || pageUrl,
    attribution: `来源：${sourceName} · 正文抓取受限，以下嵌出来源页面（或请打开原文）`,
  };
}

async function fetchEnArticle(item) {
  const sid = item.sourceId || '';
  const cfg = EN_SCRAPE[sid] || {
    selectors: ['article-body', 'article', 'story-body', 'content__article-body'],
    sourceName: item.sourceZh || item.source || '外网',
  };
  const sourceName = item.sourceZh || cfg.sourceName;
  try {
    const got = await fetchHtmlArticle(item.link, {
      selectors: cfg.selectors,
      sourceName,
      allowEmbed: false,
      allowHarvest: true,
    });
    const plain = String(got.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const stub =
      plain.length < 120 ||
      /blog is currently unavailable|please enable javascript|subscribe to continue|sign in to continue/i.test(
        plain
      );
    if (stub) {
      const reason = /blog is currently unavailable/i.test(plain)
        ? '直播正文不可用'
        : '正文过短或不可用';
      const fb = summaryFallback(item, reason);
      if (got.cover) fb.cover = got.cover;
      return fb;
    }
    if (!got.cover && item.thumb) got.cover = item.thumb;
    return got;
  } catch (e) {
    const fb = summaryFallback(item, e.message || '抓取失败');
    // Prefer og:image from a partial fetch if we stored it
    if (e.og && e.og.image) fb.cover = e.og.image;
    if (!fb.html && e.og && e.og.description) {
      fb.html = `<p>${escapeText(e.og.description)}</p>`;
    }
    return fb;
  }
}

function readArticleCacheRelaxed(key, foreignEn) {
  const mem = articleMem.get(key);
  if (mem && Date.now() - mem.at < ARTICLE_TTL_MS) return mem.payload;
  try {
    const obj = JSON.parse(fs.readFileSync(articleCachePath(key), 'utf8'));
    if (!obj || !obj.fetchedAt) return null;
    const age = Date.now() - Date.parse(obj.fetchedAt);
    const maxAge = foreignEn ? STALE_MAX_MS : ARTICLE_TTL_MS;
    if (age < maxAge) {
      articleMem.set(key, { at: Date.now(), payload: obj });
      return obj;
    }
  } catch { /* miss */ }
  return null;
}

async function loadArticleContent(item) {
  if (!item || !item.link) {
    return { mode: 'summary', html: '', attribution: '暂无正文', sourceName: item && (item.sourceZh || item.source) || '' };
  }
  const cacheKey = item.id || itemId(item.link);
  const foreignEn = isEnForeignItem(item);
  const cached = readArticleCacheRelaxed(cacheKey, foreignEn);
  // 1.9.87: cover-only stubs (from list thumb fill) must not block a real body scrape
  if (cached && !cached.coverOnly) {
    // Re-scrub so older caches drop ESPN check.png / tiny icons without waiting for TTL
    if (cached.html) {
      const scrubbed = scrubArticleHtmlImages(cached.html);
      if (scrubbed !== cached.html) return { ...cached, html: scrubbed };
    }
    return cached;
  }
  const coverOnlyStub = (cached && cached.coverOnly) ? cached : null;

  let result;
  try {
    const sid = item.sourceId || '';
    if (sid.startsWith('dq_') || /dongqiudi\.com/i.test(item.link)) {
      const aid = extractDongqiudiId(item.link) || extractDongqiudiId(item.articleId);
      if (!aid) throw new Error('无文章 id');
      result = await fetchDongqiudiBody(aid);
    } else if (sid === 'chinanews' || /chinanews\.com/i.test(item.link)) {
      result = await fetchHtmlArticle(item.link, {
        selectors: ['left_zw', 'content_maincontent_content'],
        sourceName: item.sourceZh || '中新网体育',
        embedUrl: item.link,
      });
    } else if (sid === 'people' || /people\.com\.cn/i.test(item.link)) {
      result = await fetchHtmlArticle(item.link, {
        selectors: ['rm_txt_con', 'box_con', 'content'],
        sourceName: item.sourceZh || '人民网体育',
        embedUrl: item.link.replace(/^http:/, 'https:'),
      });
    } else if (foreignEn) {
      // Sky/BBC/Guardian/ESPN: server-side body only; never foreign iframe as primary
      result = await fetchEnArticle(item);
    } else {
      result = summaryFallback(item, '未知来源');
    }
  } catch (e) {
    if (foreignEn) {
      result = summaryFallback(item, e.message);
    } else {
      result = {
        mode: 'embed',
        html: '',
        cover: '',
        writer: '',
        sourceName: item.sourceZh || item.source || '',
        embedUrl: item.link,
        attribution: `来源：${item.sourceZh || item.source || ''} · 正文暂不可用（${e.message}），可嵌出或打开原文`,
        error: e.message,
      };
    }
  }
  if (coverOnlyStub && coverOnlyStub.cover && !(result && result.cover)) {
    result = { ...result, cover: coverOnlyStub.cover };
  }
  const payload = { ...result, fetchedAt: new Date().toISOString(), itemId: cacheKey };
  // Always cache EN results (including summary) so Aliyun can serve without re-hitting blocked hosts
  writeArticleCache(cacheKey, payload);
  return payload;
}

function itemId(link) {
  return crypto.createHash('sha256').update(String(link || '')).digest('hex').slice(0, 16);
}

function parseRss(xml, source) {
  const items = [];
  const chunks = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  const entries = chunks.length ? chunks : (String(xml || '').match(/<entry[\s\S]*?<\/entry>/gi) || []);
  for (const block of entries) {
    let title = tagText(block, 'title');
    let link = tagText(block, 'link');
    if (!link) {
      link = attrIn(block, /<link[^>]+href=["']([^"']+)["']/i);
    }
    if (!link) {
      const guid = tagText(block, 'guid');
      if (/^https?:\/\//i.test(guid)) link = guid;
    }
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    try {
      const u = new URL(link);
      u.searchParams.delete('at_medium');
      u.searchParams.delete('at_campaign');
      link = u.toString();
    } catch { /* keep */ }

    let summary = tagText(block, 'description') || tagText(block, 'summary') || tagText(block, 'content:encoded') || tagText(block, 'content');
    if (summary.length > 480) summary = summary.slice(0, 477) + '…';

    let thumb =
      attrIn(block, /<media:thumbnail[^>]+url=["']([^"']+)["']/i) ||
      attrIn(block, /<media:content[^>]+url=["']([^"']+)["'][^>]*(?:medium=["']image["']|type=["']image)/i) ||
      attrIn(block, /<enclosure[^>]+(?:type=["']image[^"']*["'][^>]+url=["']([^"']+)["']|url=["']([^"']+)["'][^>]+type=["']image)/i) ||
      attrIn(block, /<enclosure[^>]+url=["']([^"']+\.(?:jpe?g|png|webp|gif)[^"']*)["']/i) ||
      '';
    if (!thumb) {
      const img = block.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (img) thumb = img[1];
    }
    if (thumb && thumb.startsWith('//')) thumb = 'https:' + thumb;
    if (thumb && /qunliao\.info|dongqiudi\.com/i.test(thumb)) thumb = rewriteDqImageUrl(thumb, 'list');

    const publishedAt = pickTime(
      tagText(block, 'pubDate'),
      tagText(block, 'published'),
      tagText(block, 'updated'),
      attrIn(block, /<dc:date[^>]*>([^<]+)</i)
    );

    items.push({
      id: itemId(link),
      title,
      summary,
      link,
      thumb: thumb || '',
      source: source.name,
      sourceId: source.id,
      sourceZh: source.nameZh,
      publishedAt,
    });
  }
  return items;
}

function parseDongqiudi(jsonText, source) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error('invalid JSON');
  }
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const items = [];
  for (const a of articles) {
    if (!a || a.is_business_ad) continue;
    const title = String(a.title || a.share_title || '').trim();
    if (!title) continue;
    // Prefer stable public article URL for attribution / outbound
    let link =
      (a.share && String(a.share)) ||
      (a.id ? `https://www.dongqiudi.com/article/${a.id}` : '') ||
      String(a.url || a.web_url || '');
    if (!/^https?:\/\//i.test(link)) continue;
    // Drop tracking query on webapp urls
    try {
      const u = new URL(link);
      if (u.hostname.includes('dongqiudi.com') && a.id) {
        link = `https://www.dongqiudi.com/article/${a.id}`;
      }
    } catch { /* keep */ }

    let summary = String(a.description || a.b_description || '').trim();
    if (summary.length > 480) summary = summary.slice(0, 477) + '…';
    let thumb = String(a.thumb || a.litpic || a.cover || '').trim();
    if (thumb.startsWith('//')) thumb = 'https:' + thumb;
    // List cards: 640x480 (not 280x210). Detail uses rewriteDqImageUrl(..., 'full').
    thumb = rewriteDqImageUrl(thumb, 'list');

    const publishedAt = pickTime(a.created_at, a.published_at, a.display_time);
    const articleId = a.id != null ? String(a.id) : extractDongqiudiId(link);

    const authorName = String(a.author_name || '').trim();
    items.push({
      id: itemId(link),
      title,
      summary,
      link,
      thumb: thumb || '',
      thumbFull: rewriteDqImageUrl(String(a.thumb || a.litpic || a.cover || '').trim(), 'full'),
      articleId: articleId || undefined,
      authorName: authorName || undefined,
      // 战报bot = auto match-slice (lineup/stats cards); not for homepage carousel
      matchSlice: authorName === '战报bot' || undefined,
      source: source.name,
      sourceId: source.id,
      sourceZh: source.nameZh,
      publishedAt,
    });
  }
  return items;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JingcaiNews/1.4.1; +https://tiicai.local)',
        Accept: 'application/rss+xml, application/atom+xml, application/json, application/xml, text/xml, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    if (!text || text.length < 32) throw new Error('empty body');
    return text;
  } finally {
    clearTimeout(t);
  }
}

function mergeBySource(prevItems, freshBySource, now) {
  const bySource = {};
  for (const it of prevItems || []) {
    if (!bySource[it.sourceId]) bySource[it.sourceId] = [];
    bySource[it.sourceId].push(it);
  }
  for (const [sid, items] of Object.entries(freshBySource)) {
    bySource[sid] = items.map((x) => ({ ...x, _fetchedAt: now }));
  }
  const out = [];
  const seen = new Set();
  for (const list of Object.values(bySource)) {
    for (const it of list) {
      if (seen.has(it.id)) continue;
      const fetched = it._fetchedAt || (it.publishedAt ? Date.parse(it.publishedAt) : now);
      if (now - fetched > STALE_MAX_MS && !freshBySource[it.sourceId]) continue;
      seen.add(it.id);
      const { _fetchedAt, ...clean } = it;
      out.push(clean);
    }
  }
  out.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return out;
}

async function refresh(lang) {
  lang = normalizeLang(lang);
  const sources = sourcesFor(lang);
  const prev = (memByLang[lang] && memByLang[lang].payload) || readDisk(lang) || { items: [], sources: [], errors: [] };
  // Drop legacy English items from zh cache when switching sources
  const prevItems = (prev.items || []).filter((it) => {
    if (lang !== 'zh') return true;
    return sources.some((s) => s.id === it.sourceId);
  });
  const freshBySource = {};
  const errors = [];
  const sourceStatus = [];

  await Promise.all(
    sources.map(async (src) => {
      try {
        const body = await fetchText(src.url);
        let items;
        if (src.format === 'dongqiudi') {
          items = parseDongqiudi(body, src);
        } else {
          if (/^\s*<!DOCTYPE html/i.test(body) || /^\s*<html/i.test(body)) throw new Error('HTML not RSS');
          items = parseRss(body, src);
        }
        if (!items.length) throw new Error('no items parsed');
        freshBySource[src.id] = items.slice(0, 40);
        sourceStatus.push({ id: src.id, name: src.nameZh, ok: true, count: items.length });
      } catch (e) {
        errors.push(`${src.id}: ${e.message}`);
        sourceStatus.push({ id: src.id, name: src.nameZh, ok: false, error: e.message });
      }
    })
  );

  const now = Date.now();
  const items = mergeBySource(prevItems, freshBySource, now);
  const noteZh =
    lang === 'en'
      ? '外网资讯来自多家国际体育媒体公开 RSS；标题多为英文。正文由服务器抓取后缓存，配图经本站代理，国内手机无需直连外网。抓取失败时显示摘要。仅供参考，不构成购彩/投注建议。'
      : '体坛资讯来自国内公开源（懂球帝、中新网/人民网），应用内阅读正文并注明出处；亦可打开来源原文。仅供参考。';
  const payload = {
    source: Object.keys(freshBySource).length ? 'live' : prevItems.length ? 'cache' : 'empty',
    lang,
    fetchedAt: new Date().toISOString(),
    cacheTtlSec: Math.round(CACHE_TTL_MS / 1000),
    sources: sourceStatus,
    errors: errors.length ? errors : undefined,
    noteZh,
    items,
  };
  memByLang[lang] = { at: Date.now(), payload };
  writeDisk(lang, payload);
  try {
    archiveNewsItems(items, lang);
  } catch (e) {
    console.warn('news archive persist failed', e.message);
  }
  // 1.9.87: background-fill missing CN covers (中新网/人民网 RSS often has no enclosure)
  if (lang === 'zh') {
    setTimeout(() => {
      fillMissingCnThumbs({ limit: 10 }).catch((e) => console.warn('fillMissingCnThumbs', e.message));
    }, 50);
  }
  return payload;
}

async function getNews({ force, lang } = {}) {
  lang = normalizeLang(lang);
  const mem = memByLang[lang];
  if (!force && mem && Date.now() - mem.at < CACHE_TTL_MS) return mem.payload;
  if (!force && !mem) {
    const disk = readDisk(lang);
    if (disk && disk.fetchedAt && Date.now() - Date.parse(disk.fetchedAt) < CACHE_TTL_MS) {
      memByLang[lang] = { at: Date.parse(disk.fetchedAt) || Date.now(), payload: disk };
      return disk;
    }
    if (disk && disk.items && disk.items.length) {
      memByLang[lang] = { at: Date.now() - CACHE_TTL_MS + 5000, payload: disk };
    }
  }
  if (inflightByLang[lang]) return inflightByLang[lang];
  inflightByLang[lang] = refresh(lang)
    .catch((e) => {
      const disk = readDisk(lang);
      if (disk && disk.items && disk.items.length) {
        const payload = {
          ...disk,
          source: 'cache',
          noteZh: (disk.noteZh || '') + '（刷新失败，显示缓存）',
          errors: [e.message],
        };
        memByLang[lang] = { at: Date.now(), payload };
        return payload;
      }
      throw e;
    })
    .finally(() => {
      inflightByLang[lang] = null;
    });
  return inflightByLang[lang];
}

function expandQuery(q) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const terms = new Set([raw]);
  const rawLower = raw.toLowerCase();
  const addTeam = (zh, ens) => {
    terms.add(zh);
    (ens || []).forEach((t) => terms.add(t));
  };
  let hitTeam = false;
  // Whole-query match: Chinese key or any English alias (e.g. "Man City" → 曼城)
  for (const [zh, ens] of Object.entries(ZH_TEAM)) {
    if (raw === zh || raw.includes(zh) || (zh.length >= 2 && zh.includes(raw))) {
      addTeam(zh, ens);
      hitTeam = true;
      continue;
    }
    if ((ens || []).some((en) => String(en).toLowerCase() === rawLower)) {
      addTeam(zh, ens);
      hitTeam = true;
    }
  }
  // Tokenize only when whole query did not resolve (e.g. "曼城 阿森纳")
  if (!hitTeam) {
    for (const part of raw.split(/[\s,，/|]+/).filter(Boolean)) {
      const mapped = ZH_TEAM[part];
      if (mapped) { addTeam(part, mapped); hitTeam = true; continue; }
      const partLower = part.toLowerCase();
      for (const [zh, ens] of Object.entries(ZH_TEAM)) {
        if (part.includes(zh) || (zh.length >= 2 && zh.includes(part))) {
          addTeam(zh, ens);
          hitTeam = true;
        } else if ((ens || []).some((en) => String(en).toLowerCase() === partLower)) {
          addTeam(zh, ens);
          hitTeam = true;
        }
      }
      if (!hitTeam) terms.add(part); // free-text fallback
    }
  }
  try {
    const crests = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'crests.json'), 'utf8'));
    const lowerTerms = new Set([...terms].map((x) => String(x).toLowerCase()));
    for (const row of Object.values((crests && crests.teams) || {})) {
      const en = row && row.en;
      if (!en) continue;
      const el = en.toLowerCase();
      if (lowerTerms.has(el)) terms.add(en);
    }
  } catch { /* optional */ }
  return [...terms].filter(Boolean);
}

function filterItems(items, q) {
  const terms = expandQuery(q);
  if (!terms.length) return items;
  const lower = terms.map((t) => String(t).toLowerCase());
  return items.filter((it) => {
    const hay = (it.title + ' ' + (it.summary || '')).toLowerCase();
    return lower.some((t) => t.length >= 2 && hay.includes(t));
  });
}

function mapListItem(it) {
  let thumb = it.thumb || '';
  let thumbFull = it.thumbFull || rewriteDqImageUrl(thumb, 'full') || '';
  // 1.9.87: fill missing covers from article cache (EN + CN RSS without enclosure)
  if (!thumb) {
    const art = readArticleCacheRelaxed(it.id, isEnForeignItem(it));
    if (art && art.cover) {
      thumb = art.cover;
      thumbFull = art.cover;
    }
  }
  return {
    id: it.id,
    title: it.title,
    summary: it.summary,
    link: it.link,
    thumb,
    thumbFull: thumbFull || thumb || '',
    articleId: it.articleId,
    authorName: it.authorName || undefined,
    matchSlice: it.matchSlice || undefined,
    source: it.source,
    sourceZh: it.sourceZh,
    sourceId: it.sourceId,
    publishedAt: it.publishedAt,
  };
}

function listNews(opts = {}) {
  const lang = normalizeLang(opts.lang);
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 100);
  const hasBefore = opts.before != null && String(opts.before).trim() !== '';
  const hasOffset = opts.offset != null && String(opts.offset).trim() !== '' && Number(opts.offset) > 0;
  const wantArchivePage = hasBefore || hasOffset;

  // Seed archive from current feed cache (idempotent upsert)
  const seedArchive = (payload) => {
    try {
      if (payload && payload.items && payload.items.length) archiveNewsItems(payload.items, lang);
    } catch (e) {
      console.warn('news archive seed failed', e.message);
    }
  };

  if (wantArchivePage) {
    return getNews({ force: !!opts.force, lang }).then((payload) => {
      seedArchive(payload);
      let arch = queryNewsArchive({
        lang,
        limit,
        before: hasBefore ? opts.before : undefined,
        offset: hasOffset ? opts.offset : 0,
      });
      let items = arch.items || [];
      if (opts.q) items = filterItems(items, opts.q);
      // If q filter shortened the page, we still report hasMore from archive cursor
      const mapped = items.slice(0, limit).map(mapListItem);
      const oldest = mapped.length ? mapped[mapped.length - 1] : null;
      return {
        source: 'archive',
        lang,
        fetchedAt: payload.fetchedAt,
        noteZh: (payload.noteZh || '') + (lang === 'en' ? '' : ' · 含历史存档'),
        q: opts.q || undefined,
        total: arch.total,
        hasMore: !!arch.hasMore,
        nextBefore: oldest && oldest.publishedAt ? oldest.publishedAt : (oldest ? oldest.id : undefined),
        nextOffset: (hasOffset ? Number(opts.offset) : 0) + mapped.length,
        items: mapped,
      };
    });
  }

  return getNews({ force: !!opts.force, lang }).then((payload) => {
    seedArchive(payload);
    let items = payload.items || [];
    if (opts.q) items = filterItems(items, opts.q);
    const mapped = items.slice(0, limit).map(mapListItem);
    // hasMore if archive has older items beyond this page
    let hasMore = false;
    let archTotal = mapped.length;
    try {
      const arch = queryNewsArchive({ lang, limit: 1, offset: mapped.length });
      archTotal = arch.total;
      hasMore = arch.total > mapped.length || !!arch.hasMore;
      // also true if feed itself was truncated by limit
      if (items.length > limit) hasMore = true;
    } catch { /* archive optional */ }
    const oldest = mapped.length ? mapped[mapped.length - 1] : null;
    return {
      ...payload,
      q: opts.q || undefined,
      total: Math.max(archTotal, items.length),
      hasMore,
      nextBefore: oldest && oldest.publishedAt ? oldest.publishedAt : (oldest ? oldest.id : undefined),
      nextOffset: mapped.length,
      items: mapped,
    };
  });
}

function getNewsItem(idOrHash, opts = {}) {
  const key = String(idOrHash || '').trim();
  if (!key) return Promise.resolve(null);
  const lang = normalizeLang(opts.lang);
  const wantArticle = opts.article !== false && opts.full !== false;
  // Search both caches so deep links still resolve after lang switch
  return Promise.all([getNews({ lang }), getNews({ lang: lang === 'en' ? 'zh' : 'en' })]).then(async ([a, b]) => {
    const items = [...(a.items || []), ...(b.items || [])];
    let hit = items.find((x) => x.id === key);
    if (!hit && /^https?:\/\//i.test(key)) {
      const id = itemId(key);
      hit = items.find((x) => x.id === id || x.link === key);
    }
    if (!hit) {
      hit = items.find((x) => x.id.startsWith(key) || key.startsWith(x.id));
    }
    if (!hit) {
      try { hit = getArchivedNewsItem(key); } catch { hit = null; }
    }
    if (!hit) return null;
    const item = {
      ...hit,
      thumbFull: hit.thumbFull || rewriteDqImageUrl(hit.thumb, 'full') || hit.thumb || '',
    };
    const out = {
      source: a.source,
      fetchedAt: a.fetchedAt,
      noteZh: a.noteZh,
      item,
    };
    if (wantArticle) {
      try {
        out.article = await loadArticleContent(item);
      } catch (e) {
        out.article = {
          mode: 'summary',
          html: '',
          attribution: '正文加载失败：' + e.message,
          error: e.message,
        };
      }
    }
    return out;
  });
}

/** In-flight guard so list refreshes do not stampede article scrapes. */
let cnThumbFillInflight = null;

/**
 * 1.9.87: for ZH items missing thumb, scrape article page for cover (og / body photo),
 * write article cache + patch list disk cache. Non-blocking; capped concurrency.
 */
async function fillMissingCnThumbs(opts = {}) {
  if (cnThumbFillInflight) return cnThumbFillInflight;
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 24);
  cnThumbFillInflight = (async () => {
    const disk = readDisk('zh') || (memByLang.zh && memByLang.zh.payload) || { items: [] };
    const need = (disk.items || []).filter((it) => {
      if (it.thumb) return false;
      const sid = it.sourceId || '';
      return sid === 'chinanews' || sid === 'people' || /chinanews\.com|people\.com\.cn/i.test(it.link || '');
    }).slice(0, limit);
    if (!need.length) return { filled: 0, tried: 0 };
    const updated = {};
    let filled = 0;
    for (const it of need) {
      try {
        // Prefer cheap HTML cover extract without full article cache miss thrash
        const text = await fetchText(it.link);
        let cover = extractCoverFromHtml(text);
        if (!cover) {
          // Fall through to full load (also caches body for detail)
          const art = await loadArticleContent(it);
          cover = (art && art.cover) || '';
        } else {
          // Seed a minimal article cache so mapListItem / detail can reuse cover
          const existing = readArticleCacheRelaxed(it.id, false);
          if (!existing || !existing.cover) {
            writeArticleCache(it.id, {
              mode: existing && existing.mode ? existing.mode : 'summary',
              html: (existing && existing.html) || '',
              cover,
              writer: '',
              sourceName: it.sourceZh || it.source || '',
              attribution: `来源：${it.sourceZh || it.source || ''} · 封面已缓存`,
              fetchedAt: new Date().toISOString(),
              itemId: it.id,
              coverOnly: true,
            });
          }
        }
        if (cover) {
          updated[it.id] = cover;
          filled++;
        }
      } catch (e) {
        console.warn('cn thumb fill', it.id, e.message);
      }
    }
    if (Object.keys(updated).length) {
      const cur = readDisk('zh') || disk;
      cur.items = (cur.items || []).map((it) => {
        const cover = updated[it.id];
        if (!cover) return it;
        return { ...it, thumb: it.thumb || cover, thumbFull: it.thumbFull || cover };
      });
      cur.fetchedAt = cur.fetchedAt || new Date().toISOString();
      cur.coversFilledAt = new Date().toISOString();
      writeDisk('zh', cur);
      if (memByLang.zh) {
        memByLang.zh = { at: Date.now(), payload: cur };
      }
      try { archiveNewsItems(cur.items, 'zh'); } catch (_) {}
    }
    return { filled, tried: need.length };
  })().finally(() => { cnThumbFillInflight = null; });
  return cnThumbFillInflight;
}

/**
 * Prefetch EN list + article bodies (+ optional thumb URLs into item.thumb) from a host
 * that can reach foreign sites (box). Aliyun then serves data/news cache to CN phones.
 */
async function prefetchEnNews(opts = {}) {
  const perSource = Math.min(Math.max(parseInt(opts.perSource, 10) || 12, 1), 40);
  const payload = await refresh('en');
  const bySource = {};
  const rank = (it) => {
    const link = String(it.link || '');
    if (/\/live-blog\//i.test(link)) return 2;
    if (/\/video\//i.test(link)) return 1;
    return 0;
  };
  const sorted = [...(payload.items || [])].sort((a, b) => rank(a) - rank(b));
  for (const it of sorted) {
    if (!bySource[it.sourceId]) bySource[it.sourceId] = [];
    if (bySource[it.sourceId].length < perSource) bySource[it.sourceId].push(it);
  }
  const targets = Object.values(bySource).flat();
  let ok = 0;
  let summary = 0;
  let fail = 0;
  const updatedThumbs = {};
  for (const it of targets) {
    try {
      // Force re-fetch by clearing mem entry only (keep disk until rewritten)
      articleMem.delete(it.id);
      try { fs.unlinkSync(articleCachePath(it.id)); } catch { /* miss */ }
      const art = await loadArticleContent(it);
      // loadArticleContent wrote fresh cache
      if (art && art.mode === 'html') ok++;
      else if (art && art.mode === 'summary') summary++;
      else fail++;
      if (art && art.cover && !it.thumb) {
        updatedThumbs[it.id] = art.cover;
      }
    } catch (e) {
      fail++;
      console.warn('prefetch article', it.id, e.message);
    }
  }
  if (Object.keys(updatedThumbs).length) {
    const disk = readDisk('en') || payload;
    disk.items = (disk.items || []).map((it) => {
      const cover = updatedThumbs[it.id];
      if (!cover) return it;
      return { ...it, thumb: it.thumb || cover, thumbFull: it.thumbFull || cover };
    });
    disk.fetchedAt = new Date().toISOString();
    disk.prefetchAt = disk.fetchedAt;
    writeDisk('en', disk);
    memByLang.en = { at: Date.now(), payload: disk };
  }
  return {
    listSource: payload.source,
    listItems: (payload.items || []).length,
    prefetched: targets.length,
    html: ok,
    summary,
    fail,
    thumbsFilled: Object.keys(updatedThumbs).length,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  listNews,
  getNewsItem,
  getNews,
  refresh,
  mapListItem,
  loadArticleContent,
  prefetchEnNews,
  fillMissingCnThumbs,
  extractCoverFromHtml,
  rewriteDqImageUrl,
  sanitizeArticleHtml,
  scrubArticleHtmlImages,
  shouldSkipArticleImage,
  extractDongqiudiId,
  isEnForeignItem,
  summaryFallback,
  SOURCES: SOURCES_ZH,
  SOURCES_ZH,
  SOURCES_EN,
  EN_SOURCE_IDS,
  CACHE_TTL_MS,
  itemId,
  parseRss,
  parseDongqiudi,
  expandQuery,
  normalizeLang,
};
