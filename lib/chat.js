// Per-match text chat rooms (文字聊球房). No voice. SQLite + short-poll / SSE.
'use strict';
const express = require('express');
const { db } = require('./db');
const { requireAuth, optionalAuth } = require('./auth');

const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 120;
const MAX_HISTORY = 80;
const POLL_LIMIT = 50;

// in-memory rate limit
const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); buckets.set(key, arr);
  return arr.length <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of buckets) if (!a.some(t => now - t < 3600e3)) buckets.delete(k);
}, 600e3).unref();

// SSE subscribers: matchId -> Set of res
const subs = new Map();
function subscribe(matchId, res) {
  let set = subs.get(matchId);
  if (!set) { set = new Set(); subs.set(matchId, set); }
  set.add(res);
  return () => {
    set.delete(res);
    if (!set.size) subs.delete(matchId);
  };
}
function broadcast(matchId, msg) {
  const set = subs.get(matchId);
  if (!set || !set.size) return;
  const payload = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const res of set) {
    try { res.write(payload); } catch { /* closed */ }
  }
}

function cleanBody(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const chars = [...s];
  if (chars.length > MAX_BODY) s = chars.slice(0, MAX_BODY).join('');
  return s;
}

function rowToMsg(row) {
  return {
    id: row.id,
    matchId: row.match_id,
    userId: row.user_id,
    nickname: row.nickname || '球迷',
    avatar: row.avatar || 'a1',
    body: row.body,
    createdAt: row.created_at,
  };
}

const listStmt = db.prepare(`
  SELECT c.id, c.match_id, c.user_id, c.body, c.created_at, u.nickname, u.avatar
  FROM match_chat c JOIN users u ON u.id = c.user_id
  WHERE c.match_id = ? AND c.id > ?
  ORDER BY c.id ASC LIMIT ?
`);
const histStmt = db.prepare(`
  SELECT c.id, c.match_id, c.user_id, c.body, c.created_at, u.nickname, u.avatar
  FROM match_chat c JOIN users u ON u.id = c.user_id
  WHERE c.match_id = ?
  ORDER BY c.id DESC LIMIT ?
`);
const insStmt = db.prepare(`
  INSERT INTO match_chat (match_id, user_id, body, created_at) VALUES (?,?,?,?)
`);

const r = express.Router();
r.use(express.json({ limit: '32kb' }));

/** GET /match-chat?matchId=&afterId=&limit=  — history or delta (short poll) */
r.get('/match-chat', optionalAuth, (req, res) => {
  const matchId = String(req.query.matchId || '').trim();
  if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
  const afterId = Math.max(0, parseInt(req.query.afterId, 10) || 0);
  const limit = Math.min(POLL_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || (afterId ? 30 : MAX_HISTORY)));
  let rows;
  if (afterId > 0) {
    rows = listStmt.all(matchId, afterId, limit);
  } else {
    rows = histStmt.all(matchId, limit).reverse();
  }
  res.json({
    matchId,
    messages: rows.map(rowToMsg),
    serverTime: Date.now(),
    pollHintMs: 3000,
    noteZh: '聊球仅供球迷交流参考，仅供参考。',
  });
});

/** POST /match-chat { matchId, body } — logged-in only */
r.post('/match-chat', requireAuth, (req, res) => {
  const uid = req.user.id;
  if (!hit('chat:' + uid, 12, 60e3)) return res.status(429).json({ error: '发送太频繁，请稍后再试' });
  if (!hit('chat-burst:' + uid, 1, 2500)) return res.status(429).json({ error: '请稍等再发' });
  const matchId = String((req.body && req.body.matchId) || '').trim();
  const body = cleanBody(req.body && req.body.body);
  if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
  if (!body) return res.status(400).json({ error: '请输入内容（最多' + MAX_BODY + '字）' });
  const now = Date.now();
  const info = insStmt.run(matchId, uid, body, now);
  const msg = {
    id: Number(info.lastInsertRowid),
    matchId,
    userId: uid,
    nickname: req.user.nickname || '球迷',
    avatar: req.user.avatar || 'a1',
    body,
    createdAt: now,
  };
  broadcast(matchId, { type: 'message', message: msg });
  res.json({ ok: true, message: msg });
});

/** GET /match-chat/stream?matchId=&afterId= — SSE (token optional via query for EventSource) */
r.get('/match-chat/stream', (req, res) => {
  const matchId = String(req.query.matchId || '').trim();
  if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
  // optional bearer via query (EventSource cannot set Authorization)
  const token = String(req.query.token || '').trim();
  if (token && !req.user) {
    try {
      const crypto = require('crypto');
      const sha = t => crypto.createHash('sha256').update(t).digest('hex');
      const row = db.prepare('SELECT s.expires_at, u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
        .get(sha(token));
      if (row && row.expires_at >= Date.now()) req.user = { id: row.id };
    } catch { /* ignore */ }
  }
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': ok\n\n');
  let afterId = Math.max(0, parseInt(req.query.afterId, 10) || 0);
  // catch-up
  try {
    const rows = listStmt.all(matchId, afterId, POLL_LIMIT);
    for (const row of rows) {
      const m = rowToMsg(row);
      afterId = m.id;
      res.write('data: ' + JSON.stringify({ type: 'message', message: m }) + '\n\n');
    }
  } catch { /* ignore */ }
  const unsub = subscribe(matchId, res);
  const ping = setInterval(() => {
    try { res.write(': ping ' + Date.now() + '\n\n'); } catch { /* closed */ }
  }, 25000);
  req.on('close', () => { clearInterval(ping); unsub(); });
});

module.exports = r;
module.exports.broadcast = broadcast;
