/**
 * 1.9.80: neutralize end-user visible data-vendor / API brand callouts.
 * Keep fetching from those backends; only scrub displayed copy.
 * Machine codes (source: 'espn' | 'api-football') stay internal.
 *
 * 1.9.81: never mutate URL / crest / photo strings — vendor CDN hostnames
 * (espncdn, thesportsdb, sporttery.cn, api-sports.io) must stay intact.
 */
'use strict';

const REPLACERS = [
  // Compound phrases first (longest / most specific)
  [/API-Football\s*Free\s*~?\s*100\s*req\/day/gi, '第三方过程数据配额策略'],
  [/API-Football\s*场均\s*\+\s*自有检验/g, '综合技术统计场均 + 自有检验'],
  [/API-Football\s*近期过程数据/g, '综合技术统计（过程数据）'],
  [/API-Football\s*完场技术统计均值/g, '综合赛程与技术统计均值'],
  [/API-Football\s*全赛程/g, '综合全赛程'],
  [/API-Football\s*交锋/g, '综合交锋库'],
  [/API-Football\s*伤停/g, '第三方伤停'],
  [/API-Football\s*账户已暂停/g, '第三方数据账户暂不可用'],
  [/未配置\s*API-Football\s*密钥[^。；\n]*/g, '过程数据源暂未就绪'],
  [/未能映射到\s*API-Football\s*球队[^。；\n]*/g, '未能映射到过程数据球队'],
  [/配置有效\s*API-Football\s*密钥后[^。；\n]*/g, '过程数据源就绪后'],
  [/本场暂无\s*API-Football\s*完场技术统计/g, '本场暂无完场技术统计'],
  [/本场球员数据来自\s*API-Football/g, '本场球员数据来自综合技术统计'],
  [/该球员来自\s*API-Football\s*阵容回退/g, '该球员来自阵容回退源'],
  [/阵容来自\s*API-Football（TheSportsDB\s*名单不全时回退）/g, '阵容来自综合球员库（公开名单不全时回退）'],
  [/阵容来自\s*API-Football/g, '阵容来自综合球员库'],
  [/近期过程数据（API-Football）/g, '近期过程数据'],
  [/（API-Football，若可用）/g, '（若可用）'],
  [/（API-Football，磁盘缓存）/g, '（磁盘缓存）'],
  [/（API-Football）/g, ''],
  [/来自\s*API-Football（/g, '来自综合交锋库（'],
  [/交锋来自\s*API-Football\s*缓存/g, '交锋来自综合交锋库缓存'],
  [/交锋来自\s*API-Football/g, '交锋来自综合交锋库'],
  [/来源\s*API-Football/g, '来源综合交锋库'],
  [/API-Football\s*免费档仅支持到\s*2024\/25，已停用为默认数据源；请查看本赛季（ESPN）数据。/g,
    '历史赛季数据源已停用为默认；请查看本赛季公开积分榜数据。'],
  [/API-Football\s*免费档仅到\s*\d{4}\/\d{2}，不再当作当前赛季。/g, '历史赛季数据不再当作当前赛季默认源。'],
  [/API-Football\s*免费档[^。；\n]*/g, '历史赛季数据源'],
  [/API-Football/gi, '综合技术统计'],

  [/ESPN\s*公开赛程（本赛季联赛\+欧战）/g, '综合赛程（本赛季联赛+欧战）'],
  [/ESPN\s*公开赛程/g, '综合赛程'],
  [/ESPN赛程/g, '综合赛程'],
  [/ESPN\s*·\s*日更\/赛后刷新/g, '日更/赛后刷新'],
  [/来源\s*ESPN/g, '来源综合公开数据'],
  [/来自\s*ESPN\s*与竞彩历史/g, '来自综合赛程与竞彩历史'],
  [/来自\s*ESPN\s*公开名单/g, '来自公开名单'],
  [/来自\s*ESPN\s*本赛季积分榜与公开名单/g, '来自本赛季积分榜与公开名单'],
  [/来自\s*ESPN\s*公开页\s*\+\s*TheSportsDB\s*照片匹配/g, '来自公开资料页与照片匹配'],
  [/数据来自\s*ESPN\s*公开名单/g, '数据来自公开名单'],
  [/阵容来自\s*ESPN\s*公开名单/g, '阵容来自公开名单'],
  [/照片来自\s*ESPN\s*\/\s*TheSportsDB\s*名单匹配/g, '照片来自公开名单匹配'],
  [/本场实际首发与替补（ESPN\s*赛后数据）/g, '本场实际首发与替补（赛后数据）'],
  [/本场首发（ESPN，比赛进行中）/g, '本场首发（比赛进行中）'],
  [/本场首发已公布（ESPN）/g, '本场首发已公布'],
  [/ESPN\s*未提供本场阵容数据/g, '暂未提供本场阵容数据'],
  [/未在\s*ESPN\s*找到本场比赛/g, '未收录本场比赛'],
  [/ESPN\s*未收录本场/g, '未收录本场'],
  [/可稍后重试（ESPN）/g, '可稍后重试'],
  [/（ESPN\s*公开数据：/g, '（公开数据：'],
  [/，来源\s*ESPN）/g, '）'],
  [/战绩优先\s*ESPN\s*\/\s*本地 history JSONL，零\/低配额/g, '战绩优先综合赛程 / 本地历史库，零/低配额'],
  [/ESPN/gi, '公开资料'],

  [/TheSportsDB/gi, '公开资料库'],
  [/Opta/gi, '技术统计'],
  [/DeepSeek/gi, 'AI'],

  [/中国体育彩票官网\s*sporttery\.cn\s*公开数据/g, '中国体育彩票官网公开数据'],
  [/中国体育彩票\s*sporttery\.cn\s*公开数据/g, '中国体育彩票公开数据'],
  [/sporttery\.cn/gi, '体彩公开接口'],
];

/** True when the whole string is (or embeds) a URL we must not brand-scrub. */
function isUrlLike(s) {
  if (typeof s !== 'string' || !s) return false;
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return true;
  if (/^\/api\/logo\b/i.test(t)) return true;
  if (/\/api\/logo\?/i.test(t)) return true;
  if (/https?%3A%2F%2F/i.test(t)) return true;
  return false;
}

const URL_FIELD = /^(homeLogo|awayLogo|logo|photo|photoAlt|thumb|cutout|render|headshot|avatar|image|img|src|href|url|crest|badge|teamLogo|photoSrc)$|Logo$|Photo$|Url$|Image$|Thumb$|Crest$|Src$|Href$|Avatar$|Cutout$|Headshot$/i;

function scrubVendorLabels(input) {
  if (input == null) return input;
  if (typeof input !== 'string') return input;
  // Whole-string URL (crest / photo / logo proxy) — leave untouched
  if (isUrlLike(input)) return input;

  // Protect embedded http(s) URLs and /api/logo?... inside HTML / longer copy
  const protectedUrls = [];
  const park = (m) => {
    protectedUrls.push(m);
    return `\0URL${protectedUrls.length - 1}\0`;
  };
  let s = input
    .replace(/https?:\/\/[^\s"'<>\\]+/gi, park)
    .replace(/\/api\/logo\?[^"'<\s\\]*/gi, park);

  for (const [re, to] of REPLACERS) s = s.replace(re, to);
  // Collapse accidental double spaces / empty parens from removals
  s = s.replace(/（\s*）/g, '').replace(/[ \t]{2,}/g, ' ').replace(/··+/g, '·');
  s = s.replace(/\0URL(\d+)\0/g, (_, i) => protectedUrls[Number(i)] || '');
  return s;
}

/** Deep-scrub common user-facing string fields on a plain object (shallow+nested notes). */
function scrubPayloadStrings(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return obj;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        if (!isUrlLike(obj[i])) obj[i] = scrubVendorLabels(obj[i]);
      } else if (obj[i] && typeof obj[i] === 'object') scrubPayloadStrings(obj[i], depth + 1);
    }
    return obj;
  }
  const keys = Object.keys(obj);
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') {
      // Never scrub crest / photo / logo URL fields
      if (URL_FIELD.test(k) || isUrlLike(v)) continue;
      if (/noteZh|text|html|title|label|sourceZh|attribution|disclaimer|plan|rationale|summary|blurb|headline|body|message|error|warn|hint|footer|small|usedList|sources/i.test(k)
        || /来自|来源|API|ESPN|DeepSeek|Opta|sporttery/i.test(v)) {
        obj[k] = scrubVendorLabels(v);
      }
    } else if (Array.isArray(v) && (k === 'sources' || k === 'notes' || k === 'noteParts' || k === 'formNotes')) {
      obj[k] = v.map(x => (typeof x === 'string' ? scrubVendorLabels(x) : (x && typeof x === 'object' ? scrubPayloadStrings(x, depth + 1) : x)));
    } else if (v && typeof v === 'object' && !Buffer.isBuffer(v)) {
      // Skip huge binary-ish / internal maps
      if (k === 'quota' || k === 'samples' || k === 'raw' || k === 'athletes') continue;
      scrubPayloadStrings(v, depth + 1);
    }
  }
  return obj;
}

module.exports = { scrubVendorLabels, scrubPayloadStrings, REPLACERS, isUrlLike };
