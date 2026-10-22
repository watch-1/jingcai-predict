/**
 * Real-user 专栏 / forum (1.9.77).
 * 澳客严选 pastel UI + transparent real 胜平负 stats:
 * optional pre-match pick linked to matchId → auto settle after FT →
 * show 近N中M / 连红 only from settled picks (never fake %).
 * Paid posts: price in virtual coins; unlock via wallet (mock top-up).
 * No betting / tickets.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, DATA_DIR } = require('./db');
const { requireAuth, optionalAuth } = require('./auth');

const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PICK_SET = new Set(['H', 'D', 'A']);
const PICK_LABEL = { H: '主胜', D: '平局', A: '客胜' };
const TOPIC_TAGS = ['首发', '伤停', '战报', '赛况', '分析', '闲聊'];
const TOPIC_SET = new Set(TOPIC_TAGS);
const MAX_BIO = 80;
const MAX_TITLE = 40;
const MAX_BODY = 800;
const MAX_TAGS = 4;
const MAX_MATCH_LABEL = 80;
const RECENT_WINDOW = 5;

/** Publish rate limits (documented in /column/meta + release notes). Not 1/day. */
const POST_PER_MIN = 10;
const POST_PER_HOUR = 20;
const POST_PER_DAY = 20;
const POST_BURST_MS = 1500;

/** Allowed paid-post prices in virtual coins (0 = free). */
const PRICE_OPTIONS = Object.freeze([0, 8, 18, 38, 68, 98]);
const PRICE_SET = new Set(PRICE_OPTIONS);

/** Mock coin top-up packs (no real charge; same spirit as membership mock pay). */
const COIN_PACKS = Object.freeze([
  { id: 'c100', coins: 100, amountFen: 600, label: '100 云朵', tag: '体验' },
  { id: 'c300', coins: 300, amountFen: 1800, label: '300 云朵', tag: '常用', highlight: true },
  { id: 'c680', coins: 680, amountFen: 3800, label: '680 云朵', tag: '超值' },
  { id: 'c1280', coins: 1280, amountFen: 6800, label: '1280 云朵', tag: '囤货' },
]);

const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  buckets.set(key, arr);
  return arr.length <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of buckets) if (!a.some((t) => now - t < 3600e3)) buckets.delete(k);
}, 600e3).unref();

/** Optional live results lookup injected by server (matchId → 'H'|'D'|'A'|null). */
let liveResultLookup = null;
function configure({ lookupMatchResult } = {}) {
  if (typeof lookupMatchResult === 'function') liveResultLookup = lookupMatchResult;
}

function parseTags(raw) {
  if (Array.isArray(raw)) {
    const out = [];
    for (const t of raw) {
      const s = String(t || '').trim();
      if (TOPIC_SET.has(s) && !out.includes(s)) out.push(s);
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  }
  if (typeof raw === 'string') {
    try { return parseTags(JSON.parse(raw)); } catch { return []; }
  }
  return [];
}

function cleanText(raw, max) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n/g, '\n').trim();
  if (!s) return null;
  const chars = [...s];
  if (chars.length > max) s = chars.slice(0, max).join('');
  return s;
}

/** Strip legacy ban/compliance suffixes from user-visible column copy (1.9.78). */
const BAN_COPY_RE = /(?:[（(]?\s*(?:仍)?不出票[、,，]?\s*不代打\s*[）)]?|禁止投注(?:\/出票|出票)?|禁止下注(?:\/出票(?:\/购彩代下)?)?|购彩代下|本站不提供投注服务|不提供投注(?:\/出票)?服务?|理性购彩\s*[·•]?\s*本站不提供投注服务)/g;

function sanitizeBanCopy(text) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(BAN_COPY_RE, '');
  s = s.replace(/[（(]\s*[）)]/g, '');
  s = s.replace(/[·•]\s*[·•]/g, '·');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s;
}



function normalizePick(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  if (PICK_SET.has(s)) return s;
  const low = String(raw).trim().toLowerCase();
  if (low === 'h' || low === 'home' || low === '主' || low === '主胜') return 'H';
  if (low === 'd' || low === 'draw' || low === '平' || low === '平局') return 'D';
  if (low === 'a' || low === 'away' || low === '客' || low === '客胜') return 'A';
  return null;
}

function winFlagFromFull(full) {
  const [hg, ag] = String(full || '').split(/[:：-]/).map(Number);
  if (Number.isNaN(hg) || Number.isNaN(ag)) return null;
  return hg > ag ? 'H' : hg === ag ? 'D' : 'A';
}

/* ---- FT result sources (transparent, no manual hit flags) ---- */
let histCache = { at: 0, map: new Map() };
function loadHistoryResultsMap(force) {
  const now = Date.now();
  if (!force && histCache.map.size && now - histCache.at < 5 * 60e3) return histCache.map;
  const file = path.join(DATA_DIR, 'history', 'results.jsonl');
  const map = new Map();
  try {
    if (fs.existsSync(file)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          const id = row.matchId != null ? String(row.matchId) : (row.id != null ? String(row.id) : '');
          if (!id) continue;
          let flag = row.winFlag || row.result || '';
          if (!PICK_SET.has(String(flag).toUpperCase())) {
            flag = winFlagFromFull(row.ft || row.full || (row.homeScore != null ? `${row.homeScore}:${row.awayScore}` : ''));
          } else {
            flag = String(flag).toUpperCase();
          }
          if (PICK_SET.has(flag)) map.set(id, flag);
        } catch { /* skip bad line */ }
      }
    }
  } catch (e) {
    console.warn('column hist results', e.message);
  }
  histCache = { at: now, map };
  return map;
}

function lookupFromOutcomesDb(matchId) {
  try {
    const Database = require('better-sqlite3');
    const p = path.join(DATA_DIR, 'player-match.sqlite');
    if (!fs.existsSync(p)) return null;
    const pdb = new Database(p, { readonly: true, fileMustExist: true });
    try {
      const row = pdb.prepare('SELECT result, ft FROM match_outcomes WHERE match_id = ?').get(String(matchId));
      if (!row) return null;
      let flag = row.result ? String(row.result).toUpperCase() : '';
      if (!PICK_SET.has(flag)) flag = winFlagFromFull(row.ft) || '';
      return PICK_SET.has(flag) ? flag : null;
    } finally {
      try { pdb.close(); } catch { /* */ }
    }
  } catch {
    return null;
  }
}

function lookupMatchResult(matchId) {
  const id = String(matchId || '').trim();
  if (!id) return null;
  if (liveResultLookup) {
    try {
      const v = liveResultLookup(id);
      if (v && PICK_SET.has(String(v).toUpperCase())) return String(v).toUpperCase();
    } catch { /* ignore */ }
  }
  const hist = loadHistoryResultsMap(false);
  if (hist.has(id)) return hist.get(id);
  return lookupFromOutcomesDb(id);
}

function settlePending(limit = 80) {
  const rows = db.prepare(`
    SELECT id, match_id, pick FROM column_posts
    WHERE deleted_at IS NULL AND pick IS NOT NULL AND settle_hit IS NULL AND match_id IS NOT NULL
    ORDER BY id ASC LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 200));
  if (!rows.length) return 0;
  const upd = db.prepare(`
    UPDATE column_posts SET settle_result = ?, settle_hit = ?, settled_at = ? WHERE id = ? AND settle_hit IS NULL
  `);
  const now = Date.now();
  let n = 0;
  const tx = db.transaction((list) => {
    for (const r of list) {
      const result = lookupMatchResult(r.match_id);
      if (!result) continue;
      const hitFlag = String(r.pick).toUpperCase() === result ? 1 : 0;
      upd.run(result, hitFlag, now, r.id);
      n++;
    }
  });
  tx(rows);
  return n;
}

setInterval(() => {
  try { settlePending(100); } catch (e) { console.warn('column settle', e.message); }
}, 120e3).unref();

/** Stats from settled picks only. No settled → null (UI shows nothing). */
function authorPickStats(userId) {
  const rows = db.prepare(`
    SELECT settle_hit FROM column_posts
    WHERE user_id = ? AND deleted_at IS NULL AND pick IS NOT NULL AND settle_hit IS NOT NULL
    ORDER BY COALESCE(settled_at, created_at) DESC, id DESC
    LIMIT 30
  `).all(userId);
  if (!rows.length) return null;
  let streak = 0;
  for (const r of rows) {
    if (Number(r.settle_hit) === 1) streak++;
    else break;
  }
  const recentN = Math.min(rows.length, RECENT_WINDOW);
  const recent = rows.slice(0, recentN);
  const recentHits = recent.filter((r) => Number(r.settle_hit) === 1).length;
  const hitsAll = rows.filter((r) => Number(r.settle_hit) === 1).length;
  const hitPct = Math.round((100 * hitsAll) / rows.length);
  const out = {
    settled: rows.length,
    recentN,
    recentHits,
    recentLabel: `近${recentN}中${recentHits}`,
    streak,
    hitPct,
  };
  if (streak >= 2) out.streakLabel = `${streak}连红`;
  if (rows.length >= 3) out.hitPctLabel = `${hitPct}%`;
  return out;
}

function ensureProfile(userId) {
  const row = db.prepare('SELECT * FROM column_profiles WHERE user_id = ?').get(userId);
  if (row) return row;
  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO column_profiles (user_id, bio, tags, created_at, updated_at) VALUES (?,?,?,?,?)'
  ).run(userId, '', '[]', now, now);
  return db.prepare('SELECT * FROM column_profiles WHERE user_id = ?').get(userId);
}

function shanghaiDayStartMs(now = Date.now()) {
  const shifted = new Date(now + 8 * 3600e3);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 3600e3;
}

function postsTodayCount(userId) {
  const start = shanghaiDayStartMs();
  const row = db.prepare(
    'SELECT COUNT(*) n FROM column_posts WHERE user_id = ? AND created_at >= ? AND deleted_at IS NULL'
  ).get(userId, start);
  return Number(row && row.n) || 0;
}

function coinBalanceOf(userId) {
  const row = db.prepare('SELECT coin_balance FROM users WHERE id = ?').get(userId);
  return Math.max(0, Number(row && row.coin_balance) || 0);
}

function purchasedSet(userId, postIds) {
  const set = new Set();
  if (!userId || !postIds.length) return set;
  const placeholders = postIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT post_id FROM column_purchases WHERE user_id = ? AND post_id IN (${placeholders})`
  ).all(userId, ...postIds);
  for (const r of rows) set.add(r.post_id);
  return set;
}

function normalizePriceCoins(raw) {
  if (raw == null || raw === '' || raw === false) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  if (!PRICE_SET.has(n)) return null;
  return n;
}

function newTopupId() {
  return 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function publicAuthor(u, profile, extras = {}) {
  if (!u) return null;
  const stats = extras.stats !== undefined ? extras.stats : authorPickStats(u.id);
  const base = {
    userId: u.id,
    nickname: u.nickname || '球迷',
    avatar: u.avatar || 'a1',
    bio: (profile && profile.bio) || '',
    tags: parseTags(profile && profile.tags),
    banned: !!Number(u.banned),
  };
  const { stats: _drop, ...rest } = extras;
  const out = { ...base, ...rest };
  if (stats) out.stats = stats;
  return out;
}

function publicPost(row, { liked = false, includeAuthor = true, authorStats = undefined, viewerId = null, purchased = undefined } = {}) {
  if (!row) return null;
  const pick = row.pick ? String(row.pick).toUpperCase() : null;
  const priceCoins = Math.max(0, Number(row.price_coins) || 0);
  const purchaseCount = Math.max(0, Number(row.purchase_count) || 0);
  const isAuthor = !!(viewerId && Number(viewerId) === Number(row.user_id));
  let unlocked = true;
  if (priceCoins > 0) {
    if (isAuthor) unlocked = true;
    else if (purchased === true) unlocked = true;
    else if (purchased === false) unlocked = false;
    else unlocked = false;
  }
  const post = {
    id: row.id,
    kind: row.kind,
    matchId: row.match_id || null,
    matchLabel: row.match_label || null,
    topic: row.topic || null,
    title: row.title || null,
    reads: Number(row.reads) || 0,
    likes: Number(row.likes) || 0,
    liked: !!liked,
    createdAt: row.created_at,
    priceCoins,
    purchaseCount,
    paid: priceCoins > 0,
    locked: priceCoins > 0 && !unlocked,
  };
  if (unlocked) {
    post.body = sanitizeBanCopy(row.body);
  } else {
    post.body = null;
    post.bodyPreview = '付费内容 · 解锁后查看完整分析';
  }
  if (pick && PICK_SET.has(pick)) {
    post.pick = pick;
    post.pickLabel = PICK_LABEL[pick];
  }
  if (row.settle_hit != null) {
    post.settleHit = Number(row.settle_hit) === 1;
    post.settleResult = row.settle_result || null;
    post.settledAt = row.settled_at || null;
  }
  if (includeAuthor) {
    const a = {
      userId: row.user_id,
      nickname: row.nickname || '球迷',
      avatar: row.avatar || 'a1',
      tags: parseTags(row.author_tags),
    };
    const st = authorStats !== undefined ? authorStats : authorPickStats(row.user_id);
    if (st) a.stats = st;
    post.author = a;
  }
  return post;
}

function likedSet(userId, postIds) {
  const set = new Set();
  if (!userId || !postIds.length) return set;
  const placeholders = postIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT post_id FROM column_likes WHERE user_id = ? AND post_id IN (${placeholders})`
  ).all(userId, ...postIds);
  for (const r of rows) set.add(r.post_id);
  return set;
}

const NOTE_META = '专栏为真实用户观点交流；完场后根据赛果自动结算胜平负表态战绩（近N中M / 连红仅来自已结算场次）。可用云朵发布/解锁付费观点。仅供参考。';
const NOTE_FEED = '真实用户观点 · 阅读/点赞为真实互动 · 战绩仅来自完场结算的表态 · 仅供参考';

const r = express.Router();
r.use(express.json({ limit: '64kb' }));

r.get('/column/meta', (_req, res) => {
  try { settlePending(40); } catch { /* */ }
  res.json({
    ok: true,
    topics: TOPIC_TAGS,
    tabs: [
      { id: 'attitude', label: '比赛态度', kind: 'match' },
      { id: 'interact', label: '星球互动', kind: 'general' },
    ],
    picks: [
      { id: 'H', label: '主胜' },
      { id: 'D', label: '平局' },
      { id: 'A', label: '客胜' },
    ],
    noteZh: NOTE_META,
    monetization: {
      paidPosts: true,
      membershipCoins: true,
      phase: 'live',
      currency: 'coins',
      currencyLabel: '云朵',
      currencyIcon: '/icons/yun-duo.png',
      priceOptions: PRICE_OPTIONS.slice(),
      noteZh: '作者可设云朵价格；读者用钱包云朵解锁正文。仅供参考。',
    },
    coinPacks: COIN_PACKS.map((x) => ({
      id: x.id, coins: x.coins, amountFen: x.amountFen,
      amountYuan: (x.amountFen / 100).toFixed(2),
      label: x.label, tag: x.tag || null, highlight: !!x.highlight,
    })),
    limits: {
      bio: MAX_BIO, title: MAX_TITLE, body: MAX_BODY, tags: MAX_TAGS,
      postRate: {
        perMinute: POST_PER_MIN,
        perHour: POST_PER_HOUR,
        perDay: POST_PER_DAY,
        burstMs: POST_BURST_MS,
        noteZh: `每分钟最多${POST_PER_MIN}篇、每小时${POST_PER_HOUR}篇、每日（上海时区）${POST_PER_DAY}篇；连发间隔约${POST_BURST_MS / 1000}秒。`,
      },
    },
  });
});

/** 2×2-style author wall: recent active writers with tags + real stats */
r.get('/column/authors', optionalAuth, (req, res) => {
  try { settlePending(40); } catch { /* */ }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 24);
  const rows = db.prepare(`
    SELECT u.id, u.nickname, u.avatar, u.banned,
           p.bio, p.tags,
           MAX(c.created_at) AS last_post_at,
           COUNT(c.id) AS post_count
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE c.deleted_at IS NULL AND (u.banned IS NULL OR u.banned = 0)
    GROUP BY u.id
    ORDER BY last_post_at DESC
    LIMIT ?
  `).all(limit);
  if (rows.length < limit) {
    const have = new Set(rows.map((x) => x.id));
    const more = db.prepare(`
      SELECT u.id, u.nickname, u.avatar, u.banned, p.bio, p.tags,
             NULL AS last_post_at, 0 AS post_count
      FROM column_profiles p
      JOIN users u ON u.id = p.user_id
      WHERE (u.banned IS NULL OR u.banned = 0)
      ORDER BY p.updated_at DESC
      LIMIT ?
    `).all(limit);
    for (const m of more) {
      if (have.has(m.id)) continue;
      rows.push(m);
      have.add(m.id);
      if (rows.length >= limit) break;
    }
  }
  res.json({
    ok: true,
    authors: rows.map((row) => publicAuthor(row, row, {
      postCount: Number(row.post_count) || 0,
      lastPostAt: row.last_post_at || null,
    })),
  });
});

r.get('/column/authors/:userId', optionalAuth, (req, res) => {
  try { settlePending(40); } catch { /* */ }
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: '无效作者' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u || Number(u.banned)) return res.status(404).json({ error: '作者不存在或已停用' });
  const profile = ensureProfile(userId);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const before = Math.max(0, parseInt(req.query.before, 10) || 0);
  const tabRaw = String(req.query.tab || 'all').trim();
  const tab = tabRaw === 'paid' ? 'paid' : (tabRaw === 'football' || tabRaw === 'attitude' ? 'football' : 'all');
  let where = 'c.user_id = ? AND c.deleted_at IS NULL';
  const params = [userId];
  if (tab === 'paid') where += ' AND c.price_coins > 0';
  else if (tab === 'football') where += " AND c.kind = 'match'";
  if (before > 0) {
    where += ' AND c.id < ?';
    params.push(before);
  }
  const posts = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, p.tags AS author_tags
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE ${where}
    ORDER BY c.id DESC LIMIT ?
  `).all(...params, limit + 1);
  const hasMore = posts.length > limit;
  const slice = hasMore ? posts.slice(0, limit) : posts;
  const liked = likedSet(req.user && req.user.id, slice.map((x) => x.id));
  const bought = purchasedSet(req.user && req.user.id, slice.map((x) => x.id));
  const postCount = db.prepare(
    'SELECT COUNT(*) n FROM column_posts WHERE user_id = ? AND deleted_at IS NULL'
  ).get(userId).n;
  const paidCount = db.prepare(
    'SELECT COUNT(*) n FROM column_posts WHERE user_id = ? AND deleted_at IS NULL AND price_coins > 0'
  ).get(userId).n;
  const stats = authorPickStats(userId);
  res.json({
    ok: true,
    author: publicAuthor(u, profile, { postCount, paidCount, stats }),
    posts: slice.map((row) => publicPost(row, {
      liked: liked.has(row.id),
      authorStats: stats,
      viewerId: req.user && req.user.id,
      purchased: bought.has(row.id) || (req.user && req.user.id === row.user_id),
    })),
    tab,
    hasMore,
  });
});

r.get('/column/me', requireAuth, (req, res) => {
  const profile = ensureProfile(req.user.id);
  const postCount = db.prepare(
    'SELECT COUNT(*) n FROM column_posts WHERE user_id = ? AND deleted_at IS NULL'
  ).get(req.user.id).n;
  res.json({
    ok: true,
    author: publicAuthor(req.user, profile, { postCount }),
    topics: TOPIC_TAGS,
  });
});

r.put('/column/me', requireAuth, (req, res) => {
  if (!hit('col-prof:' + req.user.id, 20, 60e3)) {
    return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  }
  const body = req.body || {};
  let bio = '';
  if (body.bio !== undefined) {
    if (body.bio === null || body.bio === '') bio = '';
    else {
      const cleaned = cleanText(String(body.bio), MAX_BIO);
      if (cleaned == null && String(body.bio).trim()) {
        return res.status(400).json({ error: '简介无效' });
      }
      bio = cleaned || '';
    }
  } else {
    const cur = ensureProfile(req.user.id);
    bio = cur.bio || '';
  }
  let tags;
  if (body.tags !== undefined) tags = parseTags(body.tags);
  else tags = parseTags(ensureProfile(req.user.id).tags);
  const now = Date.now();
  db.prepare(`
    INSERT INTO column_profiles (user_id, bio, tags, created_at, updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET bio=excluded.bio, tags=excluded.tags, updated_at=excluded.updated_at
  `).run(req.user.id, bio, JSON.stringify(tags), now, now);
  const profile = db.prepare('SELECT * FROM column_profiles WHERE user_id = ?').get(req.user.id);
  res.json({ ok: true, author: publicAuthor(req.user, profile) });
});

/** Feed: tab=attitude|interact (default attitude) */
r.get('/column/feed', optionalAuth, (req, res) => {
  try { settlePending(40); } catch { /* */ }
  const tab = String(req.query.tab || 'attitude').trim();
  const kind = tab === 'interact' ? 'general' : 'match';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const before = Math.max(0, parseInt(req.query.before, 10) || 0);
  const matchId = String(req.query.matchId || '').trim();
  const params = [kind];
  let sql = `
    SELECT c.*, u.nickname, u.avatar, p.tags AS author_tags
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE c.deleted_at IS NULL AND c.kind = ?
      AND (u.banned IS NULL OR u.banned = 0)
  `;
  if (matchId) {
    if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
    sql += ' AND c.match_id = ?';
    params.push(matchId);
  }
  if (before > 0) {
    sql += ' AND c.id < ?';
    params.push(before);
  }
  sql += ' ORDER BY c.id DESC LIMIT ?';
  params.push(limit + 1);
  const rows = db.prepare(sql).all(...params);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const liked = likedSet(req.user && req.user.id, slice.map((x) => x.id));
  const bought = purchasedSet(req.user && req.user.id, slice.map((x) => x.id));
  const statsCache = new Map();
  const viewerId = req.user && req.user.id;
  const posts = slice.map((row) => {
    let st = statsCache.get(row.user_id);
    if (st === undefined) {
      st = authorPickStats(row.user_id);
      statsCache.set(row.user_id, st);
    }
    return publicPost(row, {
      liked: liked.has(row.id),
      authorStats: st,
      viewerId,
      purchased: bought.has(row.id) || (viewerId && viewerId === row.user_id),
    });
  });
  res.json({
    ok: true,
    tab: kind === 'general' ? 'interact' : 'attitude',
    posts,
    hasMore,
    noteZh: NOTE_FEED,
  });
});

r.get('/column/posts/:id', optionalAuth, (req, res) => {
  try { settlePending(20); } catch { /* */ }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子' });
  const row = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.banned, p.tags AS author_tags
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `).get(id);
  if (!row || Number(row.banned)) return res.status(404).json({ error: '帖子不存在' });
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (hit('col-read:' + ip + ':' + id, 1, 30e3)) {
    db.prepare('UPDATE column_posts SET reads = reads + 1 WHERE id = ?').run(id);
    row.reads = (Number(row.reads) || 0) + 1;
  }
  const liked = !!(req.user && db.prepare(
    'SELECT 1 FROM column_likes WHERE post_id = ? AND user_id = ?'
  ).get(id, req.user.id));
  const viewerId = req.user && req.user.id;
  const purchased = !!(viewerId && (
    viewerId === row.user_id
    || db.prepare('SELECT 1 FROM column_purchases WHERE post_id = ? AND user_id = ?').get(id, viewerId)
  ));
  res.json({ ok: true, post: publicPost(row, { liked, viewerId, purchased }), wallet: viewerId ? { coins: coinBalanceOf(viewerId) } : null });
});

r.post('/column/posts', requireAuth, (req, res) => {
  const uid = req.user.id;
  if (!hit('col-post:' + uid, POST_PER_MIN, 60e3)) {
    return res.status(429).json({ error: `发布太频繁（每分钟最多${POST_PER_MIN}篇），请稍后再试` });
  }
  if (!hit('col-post-h:' + uid, POST_PER_HOUR, 3600e3)) {
    return res.status(429).json({ error: `本小时发布已达上限（${POST_PER_HOUR}篇），请稍后再试` });
  }
  const todayN = postsTodayCount(uid);
  if (todayN >= POST_PER_DAY) {
    return res.status(429).json({ error: `今日发布已达上限（${POST_PER_DAY}篇/天，上海时区），明天再来` });
  }

  const bodyIn = req.body || {};
  const kindRaw = String(bodyIn.kind || (bodyIn.matchId ? 'match' : 'general')).trim();
  const kind = kindRaw === 'match' ? 'match' : 'general';
  const body = sanitizeBanCopy(cleanText(bodyIn.body, MAX_BODY));
  if (!body) return res.status(400).json({ error: '请输入内容（最多' + MAX_BODY + '字）' });
  let title = null;
  if (bodyIn.title != null && String(bodyIn.title).trim()) {
    title = cleanText(String(bodyIn.title), MAX_TITLE);
    if (!title) return res.status(400).json({ error: '标题无效' });
  }
  let topic = null;
  if (bodyIn.topic != null && String(bodyIn.topic).trim()) {
    topic = String(bodyIn.topic).trim();
    if (!TOPIC_SET.has(topic)) return res.status(400).json({ error: '话题标签无效' });
  }
  let matchId = null;
  let matchLabel = null;
  if (kind === 'match') {
    matchId = String(bodyIn.matchId || '').trim();
    if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '请关联一场比赛（比赛态度）' });
    if (bodyIn.matchLabel != null && String(bodyIn.matchLabel).trim()) {
      matchLabel = cleanText(String(bodyIn.matchLabel), MAX_MATCH_LABEL);
    }
  } else if (bodyIn.matchId) {
    const mid = String(bodyIn.matchId).trim();
    if (MATCH_ID_RE.test(mid)) {
      matchId = mid;
      if (bodyIn.matchLabel != null && String(bodyIn.matchLabel).trim()) {
        matchLabel = cleanText(String(bodyIn.matchLabel), MAX_MATCH_LABEL);
      }
    }
  }

  let pick = null;
  if (bodyIn.pick != null && String(bodyIn.pick).trim() !== '') {
    pick = normalizePick(bodyIn.pick);
    if (!pick) return res.status(400).json({ error: '表态须为胜/平/负（H/D/A）' });
    if (!matchId) return res.status(400).json({ error: '胜平负表态须关联比赛' });
  }

  // Reject client-supplied settle fields (anti fake tipster)
  if (bodyIn.settleHit != null || bodyIn.settle_hit != null || bodyIn.hitRate != null || bodyIn.streak != null) {
    return res.status(400).json({ error: '战绩由完场赛果自动结算，不可手动填写' });
  }

  const priceCoins = normalizePriceCoins(
    bodyIn.priceCoins != null ? bodyIn.priceCoins : bodyIn.price_coins
  );
  if (priceCoins == null) {
    return res.status(400).json({ error: '价格须为 ' + PRICE_OPTIONS.join('/') + ' 云朵（0为免费）' });
  }

  if (!hit('col-burst:' + uid, 1, POST_BURST_MS)) return res.status(429).json({ error: '请稍等再发' });
  ensureProfile(uid);
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO column_posts (user_id, kind, match_id, match_label, topic, title, body, reads, likes, created_at, deleted_at, pick, settle_result, settle_hit, settled_at, price_coins, purchase_count)
    VALUES (?,?,?,?,?,?,?,0,0,?,NULL,?,NULL,NULL,NULL,?,0)
  `).run(uid, kind, matchId, matchLabel, topic, title, body, now, pick, priceCoins);

  const row = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, p.tags AS author_tags
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE c.id = ?
  `).get(info.lastInsertRowid);

  // If match already finished (late post), settle immediately
  if (pick && matchId) {
    try {
      const result = lookupMatchResult(matchId);
      if (result) {
        const hitFlag = pick === result ? 1 : 0;
        db.prepare('UPDATE column_posts SET settle_result = ?, settle_hit = ?, settled_at = ? WHERE id = ?')
          .run(result, hitFlag, Date.now(), row.id);
        row.settle_result = result;
        row.settle_hit = hitFlag;
        row.settled_at = Date.now();
      }
    } catch { /* */ }
  }

  res.status(201).json({
    ok: true,
    post: publicPost(row, { liked: false, viewerId: uid, purchased: true }),
    message: '已发布',
    limits: { postsToday: postsTodayCount(uid), perDay: POST_PER_DAY },
  });
});

r.delete('/column/posts/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子' });
  const row = db.prepare('SELECT * FROM column_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: '只能删除自己的帖子' });
  db.prepare('UPDATE column_posts SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
  res.json({ ok: true });
});

r.post('/column/posts/:id/like', requireAuth, (req, res) => {
  const uid = req.user.id;
  if (!hit('col-like:' + uid, 60, 60e3)) return res.status(429).json({ error: '操作太频繁' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子' });
  const row = db.prepare('SELECT id, likes FROM column_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  const now = Date.now();
  const tx = db.transaction(() => {
    const info = db.prepare(
      'INSERT OR IGNORE INTO column_likes (post_id, user_id, created_at) VALUES (?,?,?)'
    ).run(id, uid, now);
    if (info.changes) {
      db.prepare('UPDATE column_posts SET likes = likes + 1 WHERE id = ?').run(id);
    }
    return db.prepare('SELECT likes FROM column_posts WHERE id = ?').get(id).likes;
  });
  const likes = tx();
  res.json({ ok: true, liked: true, likes });
});

r.delete('/column/posts/:id/like', requireAuth, (req, res) => {
  const uid = req.user.id;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子' });
  const row = db.prepare('SELECT id, likes FROM column_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  const tx = db.transaction(() => {
    const info = db.prepare('DELETE FROM column_likes WHERE post_id = ? AND user_id = ?').run(id, uid);
    if (info.changes) {
      db.prepare('UPDATE column_posts SET likes = CASE WHEN likes > 0 THEN likes - 1 ELSE 0 END WHERE id = ?').run(id);
    }
    return db.prepare('SELECT likes FROM column_posts WHERE id = ?').get(id).likes;
  });
  const likes = tx();
  res.json({ ok: true, liked: false, likes });
});

r.get('/column/wallet', requireAuth, (req, res) => {
  res.json({
    ok: true,
    coins: coinBalanceOf(req.user.id),
    packs: COIN_PACKS.map((x) => ({
      id: x.id, coins: x.coins, amountFen: x.amountFen,
      amountYuan: (x.amountFen / 100).toFixed(2),
      label: x.label, tag: x.tag || null, highlight: !!x.highlight,
    })),
    noteZh: '云朵用于解锁专栏付费观点；当前为模拟充值，不会真实扣款。仅供参考。',
  });
});

r.post('/column/wallet/topup', requireAuth, (req, res) => {
  const uid = req.user.id;
  if (!hit('col-topup:' + uid, 12, 60e3)) return res.status(429).json({ error: '操作太频繁' });
  const packId = String((req.body && req.body.packId) || '').trim();
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (!pack) return res.status(400).json({ error: '套餐无效' });
  const now = Date.now();
  const id = newTopupId();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO coin_topups (id, user_id, pack_id, coins, amount_fen, status, provider, paid_at, created_at, updated_at)
      VALUES (?,?,?,?,?,'paid','mock',?,?,?)
    `).run(id, uid, pack.id, pack.coins, pack.amountFen, now, now, now);
    db.prepare('UPDATE users SET coin_balance = COALESCE(coin_balance,0) + ?, updated_at = ? WHERE id = ?')
      .run(pack.coins, now, uid);
    return coinBalanceOf(uid);
  });
  const coins = tx();
  res.status(201).json({
    ok: true,
    mode: 'mock',
    message: '模拟充值成功，云朵已到账（未真实扣款）',
    topup: { id, packId: pack.id, coins: pack.coins, amountFen: pack.amountFen },
    coins,
  });
});

r.post('/column/posts/:id/purchase', requireAuth, (req, res) => {
  const uid = req.user.id;
  if (!hit('col-buy:' + uid, 30, 60e3)) return res.status(429).json({ error: '操作太频繁' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子' });
  const row = db.prepare(`
    SELECT c.*, u.nickname, u.avatar, u.banned, p.tags AS author_tags
    FROM column_posts c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN column_profiles p ON p.user_id = u.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `).get(id);
  if (!row || Number(row.banned)) return res.status(404).json({ error: '帖子不存在' });
  const price = Math.max(0, Number(row.price_coins) || 0);
  if (price <= 0) return res.status(400).json({ error: '该帖免费，无需购买' });
  if (row.user_id === uid) {
    return res.json({
      ok: true, alreadyOwned: true,
      post: publicPost(row, { liked: false, viewerId: uid, purchased: true }),
      coins: coinBalanceOf(uid),
    });
  }
  const exist = db.prepare('SELECT 1 FROM column_purchases WHERE post_id = ? AND user_id = ?').get(id, uid);
  if (exist) {
    return res.json({
      ok: true, alreadyPurchased: true,
      post: publicPost(row, { liked: false, viewerId: uid, purchased: true }),
      coins: coinBalanceOf(uid),
    });
  }
  try {
    const result = db.transaction(() => {
      const bal = coinBalanceOf(uid);
      if (bal < price) {
        const err = new Error('INSUFFICIENT');
        err.code = 'INSUFFICIENT_COINS';
        err.need = price;
        err.coins = bal;
        throw err;
      }
      const now = Date.now();
      const upd = db.prepare(
        'UPDATE users SET coin_balance = coin_balance - ?, updated_at = ? WHERE id = ? AND coin_balance >= ?'
      ).run(price, now, uid, price);
      if (!upd.changes) {
        const err = new Error('INSUFFICIENT');
        err.code = 'INSUFFICIENT_COINS';
        err.need = price;
        err.coins = coinBalanceOf(uid);
        throw err;
      }
      db.prepare(
        'INSERT INTO column_purchases (post_id, user_id, coins, created_at) VALUES (?,?,?,?)'
      ).run(id, uid, price, now);
      db.prepare(
        'UPDATE column_posts SET purchase_count = purchase_count + 1 WHERE id = ?'
      ).run(id);
      // credit author 80% (platform 20%) — informational, still virtual coins
      const credit = Math.max(1, Math.floor(price * 0.8));
      db.prepare(
        'UPDATE users SET coin_balance = COALESCE(coin_balance,0) + ?, updated_at = ? WHERE id = ?'
      ).run(credit, now, row.user_id);
      const fresh = db.prepare(`
        SELECT c.*, u.nickname, u.avatar, p.tags AS author_tags
        FROM column_posts c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN column_profiles p ON p.user_id = u.id
        WHERE c.id = ?
      `).get(id);
      return { fresh, coins: coinBalanceOf(uid) };
    })();
    return res.json({
      ok: true,
      post: publicPost(result.fresh, { liked: false, viewerId: uid, purchased: true }),
      coins: result.coins,
      message: '已解锁',
    });
  } catch (e) {
    if (e && e.code === 'INSUFFICIENT_COINS') {
      return res.status(402).json({
        error: '云朵不足，请先充值',
        code: 'INSUFFICIENT_COINS',
        need: e.need,
        coins: e.coins,
      });
    }
    console.error('column purchase', e.message);
    return res.status(500).json({ error: '购买失败，请重试' });
  }
});

r.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '数据过大' });
  console.error('column api error', err.message);
  res.status(500).json({ error: '服务器错误' });
});

module.exports = r;
module.exports.TOPIC_TAGS = TOPIC_TAGS;
module.exports.configure = configure;
module.exports.settlePending = settlePending;
module.exports.authorPickStats = authorPickStats;
module.exports.lookupMatchResult = lookupMatchResult;
module.exports.PICK_LABEL = PICK_LABEL;
