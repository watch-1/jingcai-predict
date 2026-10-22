/**
 * 1.9.139: Materialize 平台简报 as real column_posts (same record on home + match 态度 tab).
 * Stats: settled platform picks first; else lean-feedback aggregate; never invent 近N中M.
 */
'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR } = require('./db');

const PLATFORM_PHONE = '19900001939';
const PLATFORM_NICKNAME = '平台简报';
const PLATFORM_AVATAR = 'a1';
const PLATFORM_BRIEF_PRICE = 18;
const MAX_BODY = 800;
const RECENT_WINDOW = 5;
const MIN_SETTLED_FOR_PCT = 3;

const PICK_SET = new Set(['H', 'D', 'A']);
const LEAN_TO_PICK = { h: 'H', d: 'D', a: 'A' };

let platformUserId = null;
let getMatchById = null;
let listUpcomingMatches = null;

function configure({ lookupMatch, listMatches } = {}) {
  if (typeof lookupMatch === 'function') getMatchById = lookupMatch;
  if (typeof listMatches === 'function') listUpcomingMatches = listMatches;
}

function scryptHashSync(pw) {
  const salt = crypto.randomBytes(16);
  const k = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${k.toString('base64')}`;
}

function ensurePlatformUserId() {
  if (platformUserId) return platformUserId;
  let row = db.prepare('SELECT id FROM users WHERE phone = ?').get(PLATFORM_PHONE);
  if (!row) {
    const now = Date.now();
    const hash = scryptHashSync(crypto.randomBytes(24).toString('hex'));
    const info = db.prepare(
      'INSERT INTO users (phone, pass_hash, nickname, avatar, agreed_terms_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(PLATFORM_PHONE, hash, PLATFORM_NICKNAME, PLATFORM_AVATAR, now, now, now);
    row = { id: info.lastInsertRowid };
    db.prepare(
      'INSERT OR IGNORE INTO column_profiles (user_id, bio, tags, created_at, updated_at) VALUES (?,?,?,?,?)'
    ).run(row.id, '站内赛前情报简报与态度推荐，战绩来自完场结算与复盘样本。', '[]', now, now);
  }
  platformUserId = row.id;
  return platformUserId;
}

function isPlatformUserId(uid) {
  return Number(uid) === Number(ensurePlatformUserId());
}

function kickoffMs(m) {
  if (!m || !m.date) return NaN;
  const t = String(m.time || '12:00').slice(0, 5);
  return new Date(`${m.date}T${t}:00+08:00`).getTime();
}

function leanToPick(lean) {
  if (!lean) return null;
  const p = LEAN_TO_PICK[String(lean).toLowerCase()];
  return PICK_SET.has(p) ? p : null;
}

function buildPlatformBody(report) {
  const lines = [];
  const summary = report.summary || (report.predict && report.predict.summary) || '';
  if (summary) lines.push(String(summary).trim());
  const concl = report.sections && report.sections.conclusion;
  const reasons = (concl && concl.reasons) || [];
  for (const r of reasons) {
    if (lines.length >= 12) break;
    if (typeof r === 'string' && r.trim()) lines.push('· ' + r.trim());
    else if (r && r.text && String(r.text).trim()) lines.push('· ' + String(r.text).trim());
  }
  let body = lines.join('\n').trim();
  if (!body) {
    const pr = report.predict || {};
    body = (pr.pickText || pr.text || '平台赛前简报').trim();
  }
  const chars = [...body];
  if (chars.length > MAX_BODY) body = chars.slice(0, MAX_BODY).join('');
  return body;
}

function buildPlatformTitle(report) {
  const concl = (report.sections && report.sections.conclusion) || {};
  const pr = report.predict || {};
  const conf = concl.conf != null ? concl.conf : pr.conf;
  const confPct = Math.round((Number(conf) || 0) * 100);
  const pickText = concl.pickText || pr.pickText || pr.text || '—';
  const league = report.league || '赛事';
  const home = report.home || '主队';
  const away = report.away || '客队';
  return `【${league}】${home} VS ${away} 表态「${pickText}」信心 ${confPct}%`;
}

function matchLabelFromReport(report) {
  const num = report.num ? String(report.num) + ' ' : '';
  return `${num}${report.home || ''} vs ${report.away || ''}`.trim();
}

function upsertPlatformPost(report) {
  if (!report || !report.ok) return null;
  const matchId = String(report.matchId || '').trim();
  if (!matchId) return null;
  const uid = ensurePlatformUserId();
  const concl = (report.sections && report.sections.conclusion) || {};
  const pr = report.predict || {};
  const pick = leanToPick(concl.lean || pr.top);
  const title = buildPlatformTitle(report);
  const body = buildPlatformBody(report);
  const matchLabel = matchLabelFromReport(report);
  const now = Date.now();

  const existing = db.prepare(`
    SELECT id FROM column_posts
    WHERE user_id = ? AND match_id = ? AND deleted_at IS NULL
    ORDER BY id DESC LIMIT 1
  `).get(uid, matchId);

  if (existing) {
    db.prepare(`
      UPDATE column_posts SET title = ?, body = ?, pick = ?, match_label = ?, price_coins = ?, topic = ?
      WHERE id = ? AND user_id = ?
    `).run(title, body, pick, matchLabel, PLATFORM_BRIEF_PRICE, '分析', existing.id, uid);
    return existing.id;
  }

  const info = db.prepare(`
    INSERT INTO column_posts (
      user_id, kind, match_id, match_label, topic, title, body, reads, likes, created_at, deleted_at,
      pick, settle_result, settle_hit, settled_at, price_coins, purchase_count
    ) VALUES (?,?,?,?,?,?,?,0,0,?,NULL,?,NULL,NULL,NULL,?,0)
  `).run(uid, 'match', matchId, matchLabel, '分析', title, body, now, pick, PLATFORM_BRIEF_PRICE);
  return info.lastInsertRowid;
}

function syncFromReport(report) {
  try {
    if (!report || !report.ok) return null;
    const ko = kickoffMs(report);
    if (Number.isFinite(ko) && ko < Date.now() - 3 * 3600e3) return null;
    return upsertPlatformPost(report);
  } catch (e) {
    console.warn('platform-attitude sync', e.message);
    return null;
  }
}

function syncForMatchId(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  try {
    const { loadCachedReport } = require('./predict-report');
    let m = getMatchById && getMatchById(id);
    if (!m) {
      m = { id, date: null, time: null };
    }
    const report = loadCachedReport(id, m);
    if (!report || !report.ok) return null;
    if (!report.home && m.home) {
      report.home = m.home;
      report.away = m.away;
      report.league = m.league;
      report.date = m.date;
      report.time = m.time;
    }
    return syncFromReport(report);
  } catch (e) {
    console.warn('platform-attitude syncForMatchId', e.message);
    return null;
  }
}

function syncUpcomingFromCachedReports(matches, { limit = 24 } = {}) {
  let pool = matches;
  if (!pool || !pool.length) {
    try { pool = listUpcomingMatches ? listUpcomingMatches() : []; } catch { pool = []; }
  }
  const list = (pool || []).filter((m) => m && m.id && Number.isFinite(kickoffMs(m)) && kickoff(m) > Date.now());
  list.sort((a, b) => kickoffMs(a) - kickoffMs(b));
  let n = 0;
  try {
    const { loadCachedReport } = require('./predict-report');
    for (const m of list.slice(0, limit)) {
      const report = loadCachedReport(String(m.id), m);
      if (report && report.ok && syncFromReport(report)) n++;
    }
  } catch (e) {
    console.warn('platform-attitude batch', e.message);
  }
  return n;
}

function kickoff(m) {
  return kickoffMs(m);
}

function statsFromLeanFeedback() {
  let agg;
  try {
    const file = path.join(DATA_DIR, 'history', 'lean-feedback.json');
    if (!fs.existsSync(file)) return null;
    agg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const byMatch = (agg && agg.byMatch) || {};
  const snaps = Object.values(byMatch)
    .filter((s) => s && s.leanHit != null && (s.speakMode === 'amplify' || s.speakMode == null))
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (!snaps.length) return null;
  const recentN = Math.min(snaps.length, RECENT_WINDOW);
  const recent = snaps.slice(0, recentN);
  const recentHits = recent.filter((s) => s.leanHit === true).length;
  const hitsAll = snaps.filter((s) => s.leanHit === true).length;
  const settled = snaps.length;
  const hitPct = Math.round((100 * hitsAll) / settled);
  const out = {
    settled,
    recentN,
    recentHits,
    recentLabel: settled < MIN_SETTLED_FOR_PCT ? '样本不足' : `近${recentN}中${recentHits}`,
    hitPct,
    source: 'lean-feedback',
  };
  if (settled >= MIN_SETTLED_FOR_PCT) out.hitPctLabel = `${hitPct}%`;
  else out.insufficient = true;
  return out;
}

function platformAuthorStats() {
  const { authorPickStats } = require('./column');
  const uid = ensurePlatformUserId();
  const col = authorPickStats(uid);
  if (col && col.settled >= MIN_SETTLED_FOR_PCT) {
    return { ...col, source: 'column-settled' };
  }
  const lean = statsFromLeanFeedback();
  if (lean && lean.settled >= MIN_SETTLED_FOR_PCT) return lean;
  if (col && col.settled > 0) {
    return {
      ...col,
      hitPctLabel: null,
      recentLabel: '样本不足',
      insufficient: true,
      source: 'column-settled',
    };
  }
  if (lean && lean.settled > 0) return lean;
  return { insufficient: true, recentLabel: '样本不足', settled: 0, source: 'none' };
}

function confFromTitle(title) {
  const m = /信心\s*(\d+)\s*%/.exec(String(title || ''));
  return m ? parseInt(m[1], 10) : 0;
}

function sortPlatformPosts(posts) {
  return [...posts].sort((a, b) => confFromTitle(b.title) - confFromTitle(a.title));
}

function decoratePublicPost(post, row) {
  if (!post || !row || !isPlatformUserId(row.user_id)) return post;
  post.isPlatformBrief = true;
  post.author = post.author || {};
  post.author.nickname = PLATFORM_NICKNAME;
  post.author.stats = platformAuthorStats();
  return post;
}

module.exports = {
  configure,
  ensurePlatformUserId,
  isPlatformUserId,
  PLATFORM_BRIEF_PRICE,
  PLATFORM_NICKNAME,
  syncFromReport,
  syncForMatchId,
  syncUpcomingFromCachedReports,
  platformAuthorStats,
  sortPlatformPosts,
  decoratePublicPost,
  confFromTitle,
};
