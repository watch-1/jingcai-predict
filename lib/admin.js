/**
 * Operator admin console API (1.9.72).
 * Separate from end-user phone auth. Password from ADMIN_PASSWORD (or ADMIN_TOKEN) env.
 * Session: opaque token (HttpOnly cookie jingcai_admin + Authorization Bearer).
 * No betting / tickets.
 */
'use strict';

const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');
const flags = require('./feature-flags');

const COOKIE = 'jingcai_admin';
const SESSION_DAYS = 7;
const STARTED_AT = Date.now();
const ROLES = new Set(['user', 'vip', 'tester']);

function adminSecretConfigured() {
  const pw = String(process.env.ADMIN_PASSWORD || '').trim();
  const tok = String(process.env.ADMIN_TOKEN || '').trim();
  return !!(pw || tok);
}

function checkPassword(candidate) {
  const pw = String(process.env.ADMIN_PASSWORD || '').trim();
  const tok = String(process.env.ADMIN_TOKEN || '').trim();
  const c = String(candidate || '');
  if (!c) return false;
  const ok = (expected) => {
    if (!expected) return false;
    const a = Buffer.from(c, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    try { return crypto.timingSafeEqual(a, b); } catch { return false; }
  };
  return ok(pw) || ok(tok);
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  for (const part of String(h).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    let v = part.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep */ }
    if (k) out[k] = v;
  }
  return out;
}

function extractToken(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,120})$/.exec(req.get('authorization') || '');
  if (m) return m[1];
  const c = parseCookies(req)[COOKIE];
  if (c && /^[A-Za-z0-9_-]{20,120}$/.test(c)) return c;
  return '';
}

function createAdminSession(req) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '').slice(0, 64);
  const ua = String(req.get('user-agent') || '').slice(0, 200);
  db.prepare(
    'INSERT INTO admin_sessions (token_hash, created_at, expires_at, ua, ip) VALUES (?,?,?,?,?)'
  ).run(sha(token), now, now + SESSION_DAYS * 86400e3, ua, ip);
  return token;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 86400;
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  // Secure only when behind HTTPS; current prod is HTTP :8088
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

setInterval(() => {
  try { db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now()); } catch { /* */ }
}, 3600e3).unref();

// crude rate limit for login
const loginHits = new Map();
function hitLogin(ip) {
  const now = Date.now();
  const arr = (loginHits.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  arr.push(now);
  loginHits.set(ip, arr);
  return arr.length <= 20;
}

function requireAdmin(req, res, next) {
  if (!adminSecretConfigured()) {
    return res.status(503).json({ error: '管理后台未配置 ADMIN_PASSWORD / ADMIN_TOKEN' });
  }
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: '请先登录管理后台' });
  const row = db.prepare(
    'SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?'
  ).get(sha(token));
  if (!row || row.expires_at < Date.now()) {
    return res.status(401).json({ error: '管理会话已过期，请重新登录' });
  }
  req.admin = { tokenHash: row.token_hash };
  next();
}

function fenToYuan(fen) {
  return (Number(fen) / 100).toFixed(2);
}

function memberOf(u) {
  const until = u && u.member_until != null ? Number(u.member_until) : 0;
  const now = Date.now();
  const active = Number.isFinite(until) && until > now;
  return {
    active,
    memberUntil: (active || until > 0) ? until : null,
    daysLeft: active ? Math.max(1, Math.ceil((until - now) / 86400e3)) : 0,
  };
}

function publicAdminUser(u) {
  if (!u) return null;
  const m = memberOf(u);
  return {
    id: u.id,
    phone: u.phone,
    nickname: u.nickname,
    avatar: u.avatar,
    role: u.role || 'user',
    banned: !!Number(u.banned),
    createdAt: u.created_at,
    updatedAt: u.updated_at,
    memberActive: m.active,
    memberUntil: m.memberUntil,
    memberDaysLeft: m.daysLeft,
  };
}

function publicAdminOrder(row, phone) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    phone: phone || null,
    planId: row.plan_id,
    planName: row.plan_name,
    amountFen: row.amount_fen,
    amountYuan: fenToYuan(row.amount_fen),
    days: row.days,
    channel: row.channel,
    status: row.status,
    provider: row.provider,
    providerTradeNo: row.provider_trade_no || null,
    paidAt: row.paid_at || null,
    expireExtendTo: row.expire_extend_to || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mock: String(row.provider || '').includes('mock') || row.provider === 'mock',
  };
}

function applyPaidOrderAdmin(orderRow) {
  const now = Date.now();
  const user = db.prepare('SELECT id, member_until FROM users WHERE id = ?').get(orderRow.user_id);
  if (!user) throw new Error('用户不存在');
  const base = Math.max(Number(user.member_until) || 0, now);
  const until = base + orderRow.days * 86400e3;
  const tradeNo = `ADM${now}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const tx = db.transaction(() => {
    const info = db.prepare(
      `UPDATE membership_orders SET status=?, provider_trade_no=?, paid_at=?, expire_extend_to=?, updated_at=?
       WHERE id=? AND status IN ('pending','failed','cancelled')`
    ).run('paid', tradeNo, now, until, now, orderRow.id);
    if (!info.changes) {
      // already paid?
      const cur = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(orderRow.id);
      if (cur && cur.status === 'paid') return cur;
      return null;
    }
    db.prepare('UPDATE users SET member_until = ?, updated_at = ? WHERE id = ?').run(until, now, user.id);
    return db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(orderRow.id);
  });
  return tx();
}

const r = express.Router();
r.use(express.json({ limit: '64kb' }));

/** Public bootstrap: whether admin is configured (never leak password). */
r.get('/admin/meta', (_req, res) => {
  res.json({
    ok: true,
    configured: adminSecretConfigured(),
    version: require('../package.json').version,
    cookie: COOKIE,
  });
});

r.post('/admin/login', (req, res) => {
  if (!adminSecretConfigured()) {
    return res.status(503).json({ error: '请先在服务器 .env 设置 ADMIN_PASSWORD 或 ADMIN_TOKEN' });
  }
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!hitLogin(ip)) return res.status(429).json({ error: '登录尝试过多，请15分钟后再试' });
  const password = (req.body && (req.body.password || req.body.token)) || '';
  if (!checkPassword(password)) {
    return res.status(401).json({ error: '管理密码错误' });
  }
  const token = createAdminSession(req);
  setSessionCookie(res, token);
  res.json({
    ok: true,
    token,
    expiresInDays: SESSION_DAYS,
    message: '登录成功',
  });
});

r.post('/admin/logout', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(req.admin.tokenHash);
  } catch { /* */ }
  clearSessionCookie(res);
  res.json({ ok: true });
});

r.get('/admin/me', requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    admin: true,
    version: require('../package.json').version,
    startedAt: STARTED_AT,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
  });
});

/** Dashboard monitor cards */
r.get('/admin/dashboard', requireAdmin, (_req, res) => {
  let af = null;
  try { af = require('./live-stats').getQuota(); } catch { /* */ }
  let policy = null;
  try { policy = require('./predict-report').getQuotaPolicy(); } catch { /* */ }
  let playerDb = null;
  try { playerDb = require('./player-match-db').overview(); } catch (e) {
    playerDb = { error: e.message };
  }
  const usersTotal = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const usersBanned = db.prepare('SELECT COUNT(*) n FROM users WHERE banned = 1').get().n;
  const membersActive = db.prepare(
    'SELECT COUNT(*) n FROM users WHERE member_until IS NOT NULL AND member_until > ?'
  ).get(Date.now()).n;
  const orderStats = db.prepare(
    'SELECT status, COUNT(*) n FROM membership_orders GROUP BY status'
  ).all();
  const flagList = flags.listFlags();
  let columnPosts = 0, columnAuthors = 0;
  try {
    columnPosts = db.prepare('SELECT COUNT(*) n FROM column_posts WHERE deleted_at IS NULL').get().n;
    columnAuthors = db.prepare('SELECT COUNT(DISTINCT user_id) n FROM column_posts WHERE deleted_at IS NULL').get().n;
  } catch { /* tables may lag on first boot */ }
  res.json({
    ok: true,
    version: require('../package.json').version,
    startedAt: STARTED_AT,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    now: Date.now(),
    users: { total: usersTotal, banned: usersBanned, membersActive },
    orders: Object.fromEntries(orderStats.map((r) => [r.status, r.n])),
    column: { posts: columnPosts, authors: columnAuthors },
    apiFootball: af,
    predictPolicy: policy,
    playerDb,
    flags: flagList,
    deepseekConfigured: String(process.env.DEEPSEEK_API_KEY || '').length > 10,
    afKeyConfigured: String(process.env.API_FOOTBALL_KEY || '').length > 5,
  });
});

/** Users */
r.get('/admin/users', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim(); // all|active|banned|member
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const where = [];
  const params = [];
  if (q) {
    if (/^\d+$/.test(q) && q.length < 11) {
      where.push('(id = ? OR phone LIKE ? OR nickname LIKE ?)');
      params.push(Number(q), '%' + q + '%', '%' + q + '%');
    } else {
      where.push('(phone LIKE ? OR nickname LIKE ? OR CAST(id AS TEXT) = ?)');
      params.push('%' + q + '%', '%' + q + '%', q);
    }
  }
  if (status === 'banned') where.push('banned = 1');
  else if (status === 'active') where.push('(banned IS NULL OR banned = 0)');
  else if (status === 'member') {
    where.push('member_until IS NOT NULL AND member_until > ?');
    params.push(Date.now());
  }
  const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM users ${wsql}`).get(...params).n;
  const rows = db.prepare(
    `SELECT * FROM users ${wsql} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  res.json({ ok: true, total, limit, offset, users: rows.map(publicAdminUser) });
});

r.get('/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效用户 id' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const plans = db.prepare('SELECT COUNT(*) n FROM plans WHERE user_id = ?').get(id).n;
  const favs = db.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id = ?').get(id).n;
  const orders = db.prepare(
    'SELECT * FROM membership_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(id).map((o) => publicAdminOrder(o, u.phone));
  const sessions = db.prepare(
    'SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires_at > ?'
  ).get(id, Date.now()).n;
  res.json({
    ok: true,
    user: publicAdminUser(u),
    stats: { plans, favorites: favs, activeSessions: sessions },
    orders,
  });
});

r.patch('/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效用户 id' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const body = req.body || {};
  const now = Date.now();
  let banned = Number(u.banned) || 0;
  let role = u.role || 'user';
  let memberUntil = u.member_until;

  if (body.banned !== undefined) banned = body.banned ? 1 : 0;
  if (body.role !== undefined) {
    const r0 = String(body.role || '').trim();
    if (!ROLES.has(r0)) return res.status(400).json({ error: 'role 仅支持 user / vip / tester' });
    role = r0;
  }
  if (body.memberUntil !== undefined) {
    if (body.memberUntil === null || body.memberUntil === 0 || body.memberUntil === '') {
      memberUntil = null;
    } else {
      const n = Number(body.memberUntil);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'memberUntil 无效' });
      memberUntil = n;
    }
  }
  if (body.extendDays != null) {
    const days = parseInt(body.extendDays, 10);
    if (!Number.isFinite(days) || days < -3650 || days > 3650) {
      return res.status(400).json({ error: 'extendDays 范围 -3650～3650' });
    }
    const base = Math.max(Number(memberUntil) || 0, now);
    memberUntil = days >= 0 ? base + days * 86400e3 : Math.max(0, (Number(memberUntil) || now) + days * 86400e3);
    if (days < 0 && memberUntil <= now) memberUntil = null;
  }

  db.prepare(
    'UPDATE users SET banned = ?, role = ?, member_until = ?, updated_at = ? WHERE id = ?'
  ).run(banned, role, memberUntil, now, id);

  if (banned) {
    try { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); } catch { /* */ }
  }

  res.json({ ok: true, user: publicAdminUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

/** Convenience ban/unban */
r.post('/admin/users/:id/set-ban', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ban = !!(req.body && req.body.banned);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  db.prepare('UPDATE users SET banned = ?, updated_at = ? WHERE id = ?').run(ban ? 1 : 0, Date.now(), id);
  if (ban) try { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); } catch { /* */ }
  res.json({ ok: true, user: publicAdminUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});

/** Membership orders */
r.get('/admin/orders', requireAdmin, (req, res) => {
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const where = [];
  const params = [];
  if (status && ['pending', 'paid', 'failed', 'cancelled', 'refunded'].includes(status)) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(o.id LIKE ? OR u.phone LIKE ? OR CAST(o.user_id AS TEXT) = ?)');
    params.push('%' + q + '%', '%' + q + '%', q);
  }
  const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(
    `SELECT COUNT(*) n FROM membership_orders o JOIN users u ON u.id = o.user_id ${wsql}`
  ).get(...params).n;
  const rows = db.prepare(
    `SELECT o.*, u.phone AS _phone FROM membership_orders o
     JOIN users u ON u.id = o.user_id ${wsql}
     ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  res.json({
    ok: true,
    total,
    limit,
    offset,
    orders: rows.map((row) => publicAdminOrder(row, row._phone)),
  });
});

r.post('/admin/orders/:id/mark-paid', requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  if (row.status === 'paid') {
    const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(row.user_id);
    return res.json({ ok: true, order: publicAdminOrder(row, u && u.phone), message: '订单已是已支付' });
  }
  if (row.status === 'refunded') return res.status(400).json({ error: '已退款订单不可再标为已支付' });
  try {
    const paid = applyPaidOrderAdmin(row);
    if (!paid) return res.status(409).json({ error: '状态冲突，请刷新后重试' });
    const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(paid.user_id);
    res.json({ ok: true, order: publicAdminOrder(paid, u && u.phone), message: '已标记支付并延长会员' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/admin/orders/:id/cancel', requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  if (row.status !== 'pending' && row.status !== 'failed') {
    return res.status(400).json({ error: '仅待支付/失败订单可取消' });
  }
  const now = Date.now();
  db.prepare(`UPDATE membership_orders SET status='cancelled', updated_at=? WHERE id=?`).run(now, id);
  const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(row.user_id);
  res.json({
    ok: true,
    order: publicAdminOrder(db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id), u && u.phone),
  });
});

r.post('/admin/orders/:id/refund', requireAdmin, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  if (row.status !== 'paid') return res.status(400).json({ error: '仅已支付订单可退款标记' });
  const now = Date.now();
  const revoke = !(req.body && req.body.revokeMembership === false);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE membership_orders SET status='refunded', updated_at=? WHERE id=?`).run(now, id);
    if (revoke && row.days > 0) {
      const u = db.prepare('SELECT member_until FROM users WHERE id = ?').get(row.user_id);
      if (u && u.member_until) {
        let next = Number(u.member_until) - row.days * 86400e3;
        if (!Number.isFinite(next) || next <= now) next = null;
        db.prepare('UPDATE users SET member_until = ?, updated_at = ? WHERE id = ?').run(next, now, row.user_id);
      }
    }
  });
  tx();
  const u = db.prepare('SELECT phone FROM users WHERE id = ?').get(row.user_id);
  res.json({
    ok: true,
    order: publicAdminOrder(db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id), u && u.phone),
    message: revoke ? '已标记退款并回退会员天数' : '已标记退款（未改会员期）',
  });
});

/** Feature flags */
r.get('/admin/flags', requireAdmin, (_req, res) => {
  res.json({ ok: true, flags: flags.listFlags() });
});

r.put('/admin/flags/:key', requireAdmin, (req, res) => {
  const key = String(req.params.key || '');
  const on = !!(req.body && (req.body.on === true || req.body.on === 1 || req.body.on === '1'
    || req.body.value === '1' || req.body.value === true));
  const offExplicit = req.body && (req.body.on === false || req.body.on === 0 || req.body.on === '0'
    || req.body.value === '0' || req.body.value === false);
  if (!offExplicit && !on && req.body && req.body.on === undefined && req.body.value === undefined) {
    return res.status(400).json({ error: '请传 on 或 value' });
  }
  try {
    const flag = flags.setFlag(key, offExplicit ? false : on, req.body && req.body.note);
    res.json({ ok: true, flag });
  } catch (e) {
    if (e.code === 'UNKNOWN_FLAG') return res.status(404).json({ error: e.message });
    throw e;
  }
});


/** Column / forum moderation (1.9.73) */
r.get('/admin/column/posts', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const kind = String(req.query.kind || '').trim(); // match|general|all
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (kind === 'match' || kind === 'general') {
    where.push('c.kind = ?');
    params.push(kind);
  }
  if (q) {
    where.push('(c.body LIKE ? OR c.title LIKE ? OR u.nickname LIKE ? OR CAST(c.user_id AS TEXT) = ? OR CAST(c.id AS TEXT) = ?)');
    const like = '%' + q + '%';
    params.push(like, like, like, q, q);
  }
  const wsql = 'WHERE ' + where.join(' AND ');
  const total = db.prepare(`
    SELECT COUNT(*) n FROM column_posts c JOIN users u ON u.id = c.user_id ${wsql}
  `).get(...params).n;
  const rows = db.prepare(`
    SELECT c.*, u.nickname, u.phone, u.avatar, u.banned
    FROM column_posts c JOIN users u ON u.id = c.user_id
    ${wsql}
    ORDER BY c.id DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  res.json({
    ok: true,
    total,
    limit,
    offset,
    posts: rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      nickname: row.nickname,
      phone: row.phone,
      avatar: row.avatar,
      userBanned: !!Number(row.banned),
      kind: row.kind,
      matchId: row.match_id,
      matchLabel: row.match_label,
      topic: row.topic,
      title: row.title,
      body: row.body,
      reads: row.reads,
      likes: row.likes,
      createdAt: row.created_at,
    })),
  });
});

r.delete('/admin/column/posts/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: '无效帖子 id' });
  const row = db.prepare('SELECT * FROM column_posts WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '帖子不存在' });
  if (row.deleted_at) return res.json({ ok: true, already: true });
  db.prepare('UPDATE column_posts SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
  res.json({ ok: true, message: '已删除帖子' });
});

r.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  console.error('admin api error', err.message);
  res.status(500).json({ error: '服务器错误' });
});

module.exports = r;
module.exports.requireAdmin = requireAdmin;
module.exports.STARTED_AT = STARTED_AT;
module.exports.adminSecretConfigured = adminSecretConfigured;
