/**
 * Tribe (部落) in-circle feed: user posts, replies, image attachments,
 * idempotent pinned match-day 胜平负 vote cards (uses shared match_votes table).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db, DATA_DIR } = require('./db');
const { requireAuth, optionalAuth } = require('./auth');
const { teamZh } = require('./league-tables');

const TRIBE_ID_RE = /^[a-z][a-z0-9]*-[A-Za-z0-9_-]{1,32}$/;
const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VOTE_CHOICE = new Set(['h', 'd', 'a']);
const MAX_BODY = 2000;
const MAX_REPLY = 500;
const MAX_IMAGES = 9;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UPLOAD_DIR = path.join(DATA_DIR, 'tribe-uploads');

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

let listMatches = null;
function configure(opts = {}) {
  if (typeof opts.listMatches === 'function') listMatches = opts.listMatches;
}

function bjToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

const ISSUE_WEEK = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
function issueDateFromNum(matchDate, matchNumStr) {
  const hit = String(matchNumStr || '').match(/周([日一二三四五六])/);
  if (!hit || !/^\d{4}-\d{2}-\d{2}$/.test(String(matchDate || ''))) return matchDate || null;
  const want = ISSUE_WEEK[hit[1]];
  const d = new Date(matchDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - want + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function cleanText(raw, max) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const chars = [...s];
  if (chars.length > max) s = chars.slice(0, max).join('');
  return s;
}

function parseImages(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((u) => String(u || '').trim()).filter((u) => u.startsWith('/api/tribe/media/'));
  } catch {
    return [];
  }
}

function voteCounts(matchId) {
  const rows = db.prepare('SELECT choice, COUNT(*) n FROM match_votes WHERE match_id = ? GROUP BY choice').all(matchId);
  const counts = { h: 0, d: 0, a: 0 };
  for (const r of rows) if (counts[r.choice] != null) counts[r.choice] = r.n;
  return { counts, total: counts.h + counts.d + counts.a };
}

function tribeVoteView(matchJson, votePack) {
  const side = matchJson && matchJson.tribeSide === 'away' ? 'away' : 'home';
  const { counts, total } = votePack;
  if (side === 'home') {
    return {
      counts: { win: counts.h, draw: counts.d, loss: counts.a },
      labels: { win: '胜', draw: '平', loss: '负' },
      keys: { win: 'h', draw: 'd', loss: 'a' },
      total,
    };
  }
  return {
    counts: { win: counts.a, draw: counts.d, loss: counts.h },
    labels: { win: '胜', draw: '平', loss: '负' },
    keys: { win: 'a', draw: 'd', loss: 'h' },
    total,
  };
}

function myTribeVote(matchId, userId, matchJson) {
  if (!userId) return null;
  const row = db.prepare('SELECT choice FROM match_votes WHERE match_id = ? AND user_id = ?').get(matchId, userId);
  if (!row) return null;
  const side = matchJson && matchJson.tribeSide === 'away' ? 'away' : 'home';
  const c = row.choice;
  if (side === 'home') {
    if (c === 'h') return 'win';
    if (c === 'd') return 'draw';
    if (c === 'a') return 'loss';
  } else {
    if (c === 'a') return 'win';
    if (c === 'd') return 'draw';
    if (c === 'h') return 'loss';
  }
  return null;
}

function rowToPost(row, userId) {
  const images = parseImages(row.images_json);
  let match = null;
  if (row.match_json) {
    try { match = JSON.parse(row.match_json); } catch { match = null; }
  }
  const out = {
    id: row.id,
    tribeId: row.tribe_id,
    kind: row.kind,
    body: row.body || '',
    images,
    pinned: !!row.pinned,
    replyCount: row.reply_count || 0,
    createdAt: row.created_at,
    author: row.user_id
      ? { userId: row.user_id, nickname: row.nickname || '球迷', avatar: row.avatar || 'a1' }
      : { userId: null, nickname: '部落小助手', avatar: 'a5' },
  };
  if (row.kind === 'match_vote' && row.match_id && match) {
    const vp = voteCounts(row.match_id);
    const view = tribeVoteView(match, vp);
    out.match = match;
    out.matchId = row.match_id;
    const myVote = myTribeVote(row.match_id, userId, match);
    out.vote = {
      ...view,
      myVote,
      canVote: myVote == null,
    };
  }
  return out;
}

const REACTION_KINDS = new Set(['laugh', 'like', 'fire']);

function emptyReactionPack() {
  return { laugh: 0, like: 0, fire: 0, total: 0 };
}

function attachReactionsToPosts(posts, userId) {
  if (!posts.length) return posts;
  const ids = posts.map((p) => p.id);
  const ph = ids.map(() => '?').join(',');
  const countRows = db.prepare(
    `SELECT post_id, kind, COUNT(*) n FROM tribe_post_reactions WHERE post_id IN (${ph}) GROUP BY post_id, kind`
  ).all(...ids);
  const countsByPost = new Map();
  for (const id of ids) countsByPost.set(id, emptyReactionPack());
  for (const r of countRows) {
    const pack = countsByPost.get(r.post_id) || emptyReactionPack();
    if (REACTION_KINDS.has(r.kind)) {
      pack[r.kind] = r.n;
      pack.total += r.n;
    }
    countsByPost.set(r.post_id, pack);
  }
  const myByPost = new Map();
  if (userId) {
    const myRows = db.prepare(
      `SELECT post_id, kind FROM tribe_post_reactions WHERE user_id = ? AND post_id IN (${ph})`
    ).all(userId, ...ids);
    for (const r of myRows) {
      const arr = myByPost.get(r.post_id) || [];
      arr.push(r.kind);
      myByPost.set(r.post_id, arr);
    }
  }
  return posts.map((p) => ({
    ...p,
    reactions: countsByPost.get(p.id) || emptyReactionPack(),
    myReactions: myByPost.get(p.id) || [],
  }));
}

function reactionPackForPost(postId, userId) {
  const rows = db.prepare(
    'SELECT kind, COUNT(*) n FROM tribe_post_reactions WHERE post_id = ? GROUP BY kind'
  ).all(postId);
  const pack = emptyReactionPack();
  for (const r of rows) {
    if (REACTION_KINDS.has(r.kind)) {
      pack[r.kind] = r.n;
      pack.total += r.n;
    }
  }
  let myReactions = [];
  if (userId) {
    const mines = db.prepare('SELECT kind FROM tribe_post_reactions WHERE post_id = ? AND user_id = ?').all(postId, userId);
    myReactions = mines.map((m) => m.kind);
  }
  return { reactions: pack, myReactions };
}

function attachLikesToReplies(replies, userId) {
  if (!replies.length) return replies;
  const ids = replies.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const countRows = db.prepare(
    `SELECT reply_id, COUNT(*) n FROM tribe_reply_likes WHERE reply_id IN (${ph}) GROUP BY reply_id`
  ).all(...ids);
  const counts = new Map(ids.map((id) => [id, 0]));
  for (const r of countRows) counts.set(r.reply_id, r.n);
  const liked = new Set();
  if (userId) {
    const myRows = db.prepare(
      `SELECT reply_id FROM tribe_reply_likes WHERE user_id = ? AND reply_id IN (${ph})`
    ).all(userId, ...ids);
    for (const r of myRows) liked.add(r.reply_id);
  }
  return replies.map((r) => ({
    ...r,
    likeCount: counts.get(r.id) || 0,
    myLiked: liked.has(r.id),
  }));
}

const TRIBE_PREFIX_LEAGUE_KEY = {
  epl: 'epl',
  laliga: 'laliga',
  bundesliga: 'bundesliga',
  seriea: 'seriea',
  ligue1: 'ligue1',
  ucl: 'ucl',
  csl: 'csl',
  championship: 'championship',
};

function zhTeamNamesEqual(a, b) {
  const x = String(a || '').trim();
  const y = String(b || '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const xz = teamZh(x) || x;
  const yz = teamZh(y) || y;
  if (xz === yz) return true;
  if (xz.length >= 2 && yz.length >= 2 && (xz.includes(yz) || yz.includes(xz))) return true;
  return false;
}

function tribeTeamOnSideMatches(nameZh, m, side) {
  const sideName = side === 'away' ? m.away : m.home;
  return zhTeamNamesEqual(nameZh, sideName);
}

function leagueKeyFromMatchLeague(m) {
  const lg = String((m && m.league) || '').trim();
  const map = {
    英超: 'epl', 西甲: 'laliga', 德甲: 'bundesliga', 意甲: 'seriea', 法甲: 'ligue1',
    欧冠: 'ucl', 中超: 'csl', 英冠: 'championship',
  };
  if (map[lg]) return map[lg];
  if (m && m.leagueKey) return String(m.leagueKey).trim();
  const low = lg.toLowerCase();
  if (/premier|英超/.test(low)) return 'epl';
  if (/laliga|la liga|西甲/.test(low)) return 'laliga';
  if (/bundesliga|德甲/.test(low)) return 'bundesliga';
  if (/serie\s*a|意甲/.test(low)) return 'seriea';
  if (/ligue\s*1|法甲/.test(low)) return 'ligue1';
  if (/champions|欧冠/.test(low)) return 'ucl';
  return '';
}

function resolveTribeLeagueKey(tribeId, leagueKeyParam) {
  const fromClient = String(leagueKeyParam || '').trim();
  if (fromClient) return fromClient;
  const prefix = String(tribeId || '').split('-')[0];
  return TRIBE_PREFIX_LEAGUE_KEY[prefix] || '';
}

function resolveTribeSideForMatch(m, teamId, teamNameZh) {
  const tid = String(teamId || '').trim();
  const name = String(teamNameZh || '').trim();
  const hid = String(m.homeTeamId || '');
  const aid = String(m.awayTeamId || '');
  if (tid && name) {
    if (hid === tid && tribeTeamOnSideMatches(name, m, 'home')) return 'home';
    if (aid === tid && tribeTeamOnSideMatches(name, m, 'away')) return 'away';
    return null;
  }
  if (name) {
    if (tribeTeamOnSideMatches(name, m, 'home')) return 'home';
    if (tribeTeamOnSideMatches(name, m, 'away')) return 'away';
    return null;
  }
  if (tid) {
    if (hid === tid) return 'home';
    if (aid === tid) return 'away';
  }
  return null;
}

function findTodayMatch(teamId, teamNameZh, opts = {}) {
  const today = bjToday();
  const list = (listMatches && listMatches()) || [];
  const tid = String(teamId || '').trim();
  const name = String(teamNameZh || '').trim();
  const wantLeague = resolveTribeLeagueKey(opts.tribeId, opts.leagueKey);
  const candidates = [];
  for (const m of list) {
    const cal = String(m.date || '');
    const issue = m.businessDate || issueDateFromNum(m.date, m.num);
    if (cal !== today && issue !== today) continue;
    const tribeSide = resolveTribeSideForMatch(m, tid, name);
    if (!tribeSide) continue;
    const lk = leagueKeyFromMatchLeague(m);
    const leagueScore = wantLeague ? (lk === wantLeague ? 2 : 0) : 1;
    candidates.push({ match: m, tribeSide, leagueScore });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.leagueScore - a.leagueScore);
  const best = candidates[0];
  return { match: best.match, tribeSide: best.tribeSide };
}

function cleanupWrongMatchVotePosts(tribeId, teamNameZh) {
  const name = String(teamNameZh || '').trim();
  if (!name || !tribeId) return 0;
  const now = Date.now();
  const rows = db.prepare(
    "SELECT id, match_json FROM tribe_posts WHERE tribe_id = ? AND kind = 'match_vote' AND deleted_at IS NULL"
  ).all(tribeId);
  let n = 0;
  for (const row of rows) {
    let match = null;
    try { match = JSON.parse(row.match_json || '{}'); } catch { match = {}; }
    const side = match.tribeSide === 'away' ? 'away' : 'home';
    const m = { home: match.home || '', away: match.away || '' };
    if (tribeTeamOnSideMatches(name, m, side)) continue;
    db.prepare('UPDATE tribe_posts SET deleted_at = ?, pinned = 0, updated_at = ? WHERE id = ?').run(now, now, row.id);
    n += 1;
  }
  return n;
}

function ensureMatchVotePost(tribeId, teamId, teamNameZh, opts = {}) {
  cleanupWrongMatchVotePosts(tribeId, teamNameZh);
  const hit = findTodayMatch(teamId, teamNameZh, { tribeId, leagueKey: opts.leagueKey });
  if (!hit) return null;
  const m = hit.match;
  const matchId = String(m.id);
  const now = Date.now();
  const matchJson = {
    matchId,
    league: m.league || '',
    date: m.date,
    time: m.time || '',
    num: m.num || '',
    home: m.home,
    away: m.away,
    homeLogo: m.homeLogo || '',
    awayLogo: m.awayLogo || '',
    tribeSide: hit.tribeSide,
    tribeTeamName: hit.tribeSide === 'home' ? m.home : m.away,
  };
  const body = `今日比赛 · ${matchJson.league || '赛程'}\n${matchJson.home} vs ${matchJson.away}\n开球 ${matchJson.date} ${matchJson.time || ''}`.trim();
  const existing = db.prepare(
    "SELECT id FROM tribe_posts WHERE tribe_id = ? AND kind = 'match_vote' AND match_id = ? AND deleted_at IS NULL"
  ).get(tribeId, matchId);
  if (existing) {
    db.prepare('UPDATE tribe_posts SET match_json = ?, body = ?, pinned = 1, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(matchJson), body, now, existing.id);
    return existing.id;
  }
  const ins = db.prepare(`
    INSERT INTO tribe_posts (tribe_id, user_id, kind, body, images_json, match_id, match_json, pinned, reply_count, created_at, updated_at, deleted_at)
    VALUES (?, NULL, 'match_vote', ?, '[]', ?, ?, 1, 0, ?, ?, NULL)
  `);
  const r = ins.run(tribeId, body, matchId, JSON.stringify(matchJson), now, now);
  return r.lastInsertRowid;
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return null;
}

const r = express.Router();
r.use(express.json({ limit: '3mb' }));

r.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '图片过大（单张不超过 2MB）' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求格式错误' });
  }
  return next(err);
});

r.get('/tribe/media/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  if (!/^[a-f0-9]{32}\.(jpe?g|png|gif|webp)$/i.test(file)) return res.status(404).end();
  const fp = path.join(UPLOAD_DIR, file);
  if (!fp.startsWith(UPLOAD_DIR) || !fs.existsSync(fp)) return res.status(404).end();
  const ext = path.extname(file).toLowerCase();
  const type = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(type);
  fs.createReadStream(fp).pipe(res);
});

r.post('/tribe/upload', requireAuth, (req, res) => {
  if (!hit('tribe-up:' + req.user.id, 30, 3600e3)) return res.status(429).json({ error: '上传太频繁，请稍后再试' });
  const b64 = String((req.body && req.body.data) || '').trim();
  const mime = String((req.body && req.body.mime) || '').toLowerCase();
  if (!b64 || b64.length > MAX_IMAGE_BYTES * 1.4) return res.status(400).json({ error: '图片无效或过大（单张不超过 2MB）' });
  let buf;
  try {
    buf = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } catch {
    return res.status(400).json({ error: '图片格式错误' });
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: '图片无效或过大（单张不超过 2MB）' });
  const kind = sniffImage(buf);
  if (!kind) return res.status(400).json({ error: '仅支持 JPG、PNG、GIF、WEBP' });
  const allowed = { 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
  if (mime && allowed[mime] && allowed[mime] !== kind) {
    return res.status(400).json({ error: '图片类型与内容不一致' });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  res.json({ ok: true, url: '/api/tribe/media/' + name });
});

function hotScoreSql(nowMs) {
  const ageH = `MAX(0, 72.0 - ((${nowMs} - p.created_at) / 3600000.0))`;
  const reactN = `(SELECT COUNT(*) FROM tribe_post_reactions r WHERE r.post_id = p.id)`;
  return `(${reactN} * 2.0 + COALESCE(p.reply_count, 0) * 3.0 + ${ageH} * 0.8)`;
}

function listHotTribePosts(userId, limit, offset) {
  const now = Date.now();
  const score = hotScoreSql(now);
  const rows = db.prepare(`
    SELECT p.*, u.nickname, u.avatar, ${score} AS hot_score
    FROM tribe_posts p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.deleted_at IS NULL
    ORDER BY hot_score DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit + 1, offset);
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const posts = attachReactionsToPosts(slice.map((row) => rowToPost(row, userId)), userId);
  return { posts, hasMore };
}

r.get('/tribe/hot', optionalAuth, (req, res) => {
  const limit = Math.min(30, Math.max(5, parseInt(req.query.limit, 10) || 15));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const uid = req.user ? req.user.id : null;
  const { posts, hasMore } = listHotTribePosts(uid, limit, offset);
  res.json({ posts, limit, offset, hasMore });
});

r.get('/tribe/:tribeId/feed', optionalAuth, (req, res) => {
  const tribeId = String(req.params.tribeId || '').trim();
  if (!TRIBE_ID_RE.test(tribeId)) return res.status(400).json({ error: '部落编号无效' });
  const teamId = String(req.query.teamId || '').trim();
  const teamName = String(req.query.teamName || '').trim();
  const leagueKey = String(req.query.leagueKey || '').trim();
  if (teamName) {
    try { cleanupWrongMatchVotePosts(tribeId, teamName); } catch (e) { console.warn('[tribe-feed] cleanup', e.message); }
  }
  if (req.query.ensure === '1' || req.query.ensure === 'true') {
    try { ensureMatchVotePost(tribeId, teamId, teamName, { leagueKey }); } catch (e) { console.warn('[tribe-feed] ensure', e.message); }
  }
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 30));
  const rows = db.prepare(`
    SELECT p.*, u.nickname, u.avatar
    FROM tribe_posts p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.tribe_id = ? AND p.deleted_at IS NULL
    ORDER BY p.pinned DESC, p.created_at DESC
    LIMIT ?
  `).all(tribeId, limit);
  const uid = req.user ? req.user.id : null;
  const posts = attachReactionsToPosts(rows.map((row) => rowToPost(row, uid)), uid);
  res.json({ tribeId, posts });
});

r.post('/tribe/:tribeId/feed/ensure-match', optionalAuth, (req, res) => {
  const tribeId = String(req.params.tribeId || '').trim();
  if (!TRIBE_ID_RE.test(tribeId)) return res.status(400).json({ error: '部落编号无效' });
  const teamId = String((req.body && req.body.teamId) || req.query.teamId || '').trim();
  const teamName = String((req.body && req.body.teamName) || req.query.teamName || '').trim();
  const leagueKey = String((req.body && req.body.leagueKey) || req.query.leagueKey || '').trim();
  let postId = null;
  try { postId = ensureMatchVotePost(tribeId, teamId, teamName, { leagueKey }); } catch (e) {
    console.warn('[tribe-feed] ensure-match', e.message);
  }
  res.json({ ok: true, ensured: !!postId, postId });
});

r.post('/tribe/:tribeId/posts', requireAuth, (req, res) => {
  if (!hit('tribe-post:' + req.user.id, 20, 3600e3)) return res.status(429).json({ error: '发帖太频繁，请稍后再试' });
  const tribeId = String(req.params.tribeId || '').trim();
  if (!TRIBE_ID_RE.test(tribeId)) return res.status(400).json({ error: '部落编号无效' });
  const body = cleanText(String((req.body && req.body.body) || ''), MAX_BODY);
  let images = (req.body && req.body.images) || [];
  if (!Array.isArray(images)) images = [];
  images = images.map((u) => String(u || '').trim()).filter((u) => u.startsWith('/api/tribe/media/')).slice(0, MAX_IMAGES);
  if (!body && !images.length) return res.status(400).json({ error: '请输入文字或添加图片' });
  const now = Date.now();
  const r0 = db.prepare(`
    INSERT INTO tribe_posts (tribe_id, user_id, kind, body, images_json, match_id, match_json, pinned, reply_count, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'user', ?, ?, NULL, NULL, 0, 0, ?, ?, NULL)
  `).run(tribeId, req.user.id, body || '', JSON.stringify(images), now, now);
  const row = db.prepare(`
    SELECT p.*, u.nickname, u.avatar FROM tribe_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(r0.lastInsertRowid);
  const post = attachReactionsToPosts([rowToPost(row, req.user.id)], req.user.id)[0];
  res.status(201).json({ ok: true, post });
});

r.get('/tribe/posts/:postId', optionalAuth, (req, res) => {
  const id = parseInt(req.params.postId, 10);
  if (!id) return res.status(400).json({ error: '帖子无效' });
  const row = db.prepare(`
    SELECT p.*, u.nickname, u.avatar FROM tribe_posts p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ? AND p.deleted_at IS NULL
  `).get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  const uid = req.user ? req.user.id : null;
  const post = rowToPost(row, uid);
  const enriched = attachReactionsToPosts([post], uid)[0];
  res.json({ post: enriched });
});

r.get('/tribe/posts/:postId/replies', optionalAuth, (req, res) => {
  const id = parseInt(req.params.postId, 10);
  if (!id) return res.status(400).json({ error: '帖子无效' });
  const post = db.prepare('SELECT id FROM tribe_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));
  const rows = db.prepare(`
    SELECT r.id, r.post_id, r.user_id, r.body, r.created_at, u.nickname, u.avatar
    FROM tribe_post_replies r JOIN users u ON u.id = r.user_id
    WHERE r.post_id = ? AND r.deleted_at IS NULL
    ORDER BY r.created_at ASC
    LIMIT ?
  `).all(id, limit);
  const uid = req.user ? req.user.id : null;
  const replies = attachLikesToReplies(rows.map((row) => ({
    id: row.id,
    postId: row.post_id,
    body: row.body,
    createdAt: row.created_at,
    author: { userId: row.user_id, nickname: row.nickname || '球迷', avatar: row.avatar || 'a1' },
  })), uid);
  res.json({ replies });
});

r.post('/tribe/posts/:postId/replies', requireAuth, (req, res) => {
  if (!hit('tribe-reply:' + req.user.id, 40, 3600e3)) return res.status(429).json({ error: '回复太频繁，请稍后再试' });
  const id = parseInt(req.params.postId, 10);
  if (!id) return res.status(400).json({ error: '帖子无效' });
  const post = db.prepare('SELECT id FROM tribe_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const body = cleanText(String((req.body && req.body.body) || ''), MAX_REPLY);
  if (!body) return res.status(400).json({ error: '回复不能为空' });
  const now = Date.now();
  const ins = db.prepare('INSERT INTO tribe_post_replies (post_id, user_id, body, created_at, deleted_at) VALUES (?,?,?,?,NULL)').run(id, req.user.id, body, now);
  db.prepare('UPDATE tribe_posts SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?').run(now, id);
  const row = db.prepare(`
    SELECT r.id, r.post_id, r.user_id, r.body, r.created_at, u.nickname, u.avatar
    FROM tribe_post_replies r JOIN users u ON u.id = r.user_id WHERE r.id = ?
  `).get(ins.lastInsertRowid);
  res.status(201).json({
    ok: true,
    reply: {
      id: row.id,
      postId: row.post_id,
      body: row.body,
      createdAt: row.created_at,
      author: { userId: row.user_id, nickname: row.nickname || '球迷', avatar: row.avatar || 'a1' },
    },
  });
});

r.delete('/tribe/posts/:postId', requireAuth, (req, res) => {
  const id = parseInt(req.params.postId, 10);
  if (!id) return res.status(400).json({ error: '帖子无效' });
  const row = db.prepare('SELECT id, user_id, kind FROM tribe_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  if (!row.user_id || row.user_id !== req.user.id) return res.status(403).json({ error: '只能删除自己的帖子' });
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE tribe_posts SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
    db.prepare('UPDATE tribe_post_replies SET deleted_at = ? WHERE post_id = ? AND deleted_at IS NULL').run(now, id);
  });
  tx();
  res.json({ ok: true });
});

r.delete('/tribe/replies/:replyId', requireAuth, (req, res) => {
  const id = parseInt(req.params.replyId, 10);
  if (!id) return res.status(400).json({ error: '回贴无效' });
  const row = db.prepare(`
    SELECT r.id, r.post_id, r.user_id FROM tribe_post_replies r
    WHERE r.id = ? AND r.deleted_at IS NULL
  `).get(id);
  if (!row) return res.status(404).json({ error: '回贴不存在' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: '只能删除自己的回贴' });
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('UPDATE tribe_post_replies SET deleted_at = ? WHERE id = ?').run(now, id);
    db.prepare('UPDATE tribe_posts SET reply_count = CASE WHEN reply_count > 0 THEN reply_count - 1 ELSE 0 END, updated_at = ? WHERE id = ?')
      .run(now, row.post_id);
  });
  tx();
  res.json({ ok: true });
});

r.post('/tribe/posts/:postId/reactions', requireAuth, (req, res) => {
  if (!hit('tribe-react:' + req.user.id, 80, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const id = parseInt(req.params.postId, 10);
  const kind = String((req.body && req.body.kind) || '').trim();
  if (!id) return res.status(400).json({ error: '帖子无效' });
  if (!REACTION_KINDS.has(kind)) return res.status(400).json({ error: '无效表情' });
  const post = db.prepare('SELECT id FROM tribe_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const now = Date.now();
  const existing = db.prepare(
    'SELECT 1 FROM tribe_post_reactions WHERE post_id = ? AND user_id = ? AND kind = ?'
  ).get(id, req.user.id, kind);
  if (existing) {
    db.prepare('DELETE FROM tribe_post_reactions WHERE post_id = ? AND user_id = ? AND kind = ?')
      .run(id, req.user.id, kind);
  } else {
    db.prepare('INSERT INTO tribe_post_reactions (post_id, user_id, kind, created_at) VALUES (?,?,?,?)')
      .run(id, req.user.id, kind, now);
  }
  const pack = reactionPackForPost(id, req.user.id);
  res.json({ ok: true, ...pack });
});

r.post('/tribe/replies/:replyId/like', requireAuth, (req, res) => {
  if (!hit('tribe-reply-like:' + req.user.id, 80, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const id = parseInt(req.params.replyId, 10);
  if (!id) return res.status(400).json({ error: '回贴无效' });
  const reply = db.prepare('SELECT id FROM tribe_post_replies WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!reply) return res.status(404).json({ error: '回贴不存在' });
  const now = Date.now();
  const existing = db.prepare('SELECT 1 FROM tribe_reply_likes WHERE reply_id = ? AND user_id = ?').get(id, req.user.id);
  if (existing) {
    db.prepare('DELETE FROM tribe_reply_likes WHERE reply_id = ? AND user_id = ?').run(id, req.user.id);
  } else {
    db.prepare('INSERT INTO tribe_reply_likes (reply_id, user_id, created_at) VALUES (?,?,?)').run(id, req.user.id, now);
  }
  const likeCount = db.prepare('SELECT COUNT(*) n FROM tribe_reply_likes WHERE reply_id = ?').get(id).n;
  const myLiked = !!db.prepare('SELECT 1 FROM tribe_reply_likes WHERE reply_id = ? AND user_id = ?').get(id, req.user.id);
  res.json({ ok: true, likeCount, myLiked });
});

r.post('/tribe/posts/:postId/vote', requireAuth, (req, res) => {
  if (!hit('tribe-vote:' + req.user.id, 60, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const id = parseInt(req.params.postId, 10);
  const choiceKey = String((req.body && req.body.choice) || '').trim();
  if (!id) return res.status(400).json({ error: '帖子无效' });
  const row = db.prepare('SELECT * FROM tribe_posts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row || row.kind !== 'match_vote' || !row.match_id) return res.status(400).json({ error: '该帖不支持投票' });
  let match = null;
  try { match = JSON.parse(row.match_json || '{}'); } catch { match = {}; }
  const view = tribeVoteView(match, voteCounts(row.match_id));
  const apiChoice = view.keys[choiceKey];
  if (!apiChoice || !VOTE_CHOICE.has(apiChoice)) return res.status(400).json({ error: '请选择胜、平或负' });
  const matchId = String(row.match_id);
  const now = Date.now();
  const existing = db.prepare('SELECT choice FROM match_votes WHERE match_id = ? AND user_id = ?').get(matchId, req.user.id);
  if (existing) return res.status(409).json({ error: '已投票，不可修改' });
  db.prepare('INSERT INTO match_votes (match_id, user_id, choice, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(matchId, req.user.id, apiChoice, now, now);
  const vp = voteCounts(matchId);
  const v2 = tribeVoteView(match, vp);
  res.json({
    ok: true,
    vote: { ...v2, myVote: choiceKey, canVote: false },
  });
});

module.exports = r;
module.exports.configure = configure;
module.exports.ensureMatchVotePost = ensureMatchVotePost;
module.exports.findTodayMatch = findTodayMatch;
module.exports.cleanupWrongMatchVotePosts = cleanupWrongMatchVotePosts;
module.exports.TRIBE_ID_RE = TRIBE_ID_RE;
module.exports.listHotTribePosts = listHotTribePosts;
