// Accounts API: phone + password (no SMS — no SMS provider is integrated), opaque bearer session tokens,
// scrypt password hashes, in-memory rate limiting, strict input validation. Plans/favorites are personal
// records only: nothing here places, submits or forwards any bet.
const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');

const SESSION_DAYS = 30;
const MAX_PLANS = 200, MAX_FAVS = 300;
const AVATARS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];

// ---------- password hashing (scrypt, built into Node) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
function scryptAsync(pw, salt, o) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scryptAsync(pw, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${k.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const k = await scryptAsync(pw, Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, keylen: expected.length });
  return crypto.timingSafeEqual(k, expected);
}
// constant-ish work for unknown phones so response time doesn't reveal which phones are registered
const DUMMY_HASH = hashPassword('dummy-password-0');

// ---------- validation ----------
const PHONE_RE = /^1[3-9]\d{9}$/;
function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 32 && /[A-Za-z]/.test(pw) && /\d/.test(pw) && !/\s/.test(pw);
}
function cleanNickname(n) {
  if (typeof n !== 'string') return null;
  n = n.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return n.length >= 1 && [...n].length <= 16 ? n : null;
}
const maskPhone = p => p.slice(0, 3) + '****' + p.slice(7);

// ---------- rate limiting (in-memory sliding window) ----------
const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); buckets.set(key, arr);
  return arr.length <= limit;
}
function count(key, windowMs) { const now = Date.now(); return (buckets.get(key) || []).filter(t => now - t < windowMs).length; }
setInterval(() => { const now = Date.now(); for (const [k, a] of buckets) if (!a.some(t => now - t < 86400e3)) buckets.delete(k); }, 600e3).unref();
const ipOf = req => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

// ---------- sessions ----------
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function createSession(userId, ua) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)')
    .run(sha(token), userId, now, now + SESSION_DAYS * 86400e3, String(ua || '').slice(0, 200));
  return token;
}
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600e3).unref();

function requireAuth(req, res, next) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
  if (!m) return res.status(401).json({ error: '请先登录' });
  const row = db.prepare('SELECT s.token_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(m[1]));
  if (!row || row.expires_at < Date.now()) return res.status(401).json({ error: '登录已过期，请重新登录' });
  req.user = row; req.tokenHash = row.token_hash;
  if (!hit('u:' + row.id, 240, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  next();
}

function memberStatusOf(u) {
  const until = u && u.member_until != null ? Number(u.member_until) : 0;
  const now = Date.now();
  const active = Number.isFinite(until) && until > now;
  return {
    active,
    memberUntil: (active || until > 0) ? until : null,
    daysLeft: active ? Math.max(1, Math.ceil((until - now) / 86400e3)) : 0,
  };
}

const publicUser = u => {
  const m = memberStatusOf(u);
  return { id: u.id, phone: maskPhone(u.phone), nickname: u.nickname, avatar: u.avatar, createdAt: u.created_at, memberActive: m.active, memberUntil: m.memberUntil, memberDaysLeft: m.daysLeft };
};

function optionalAuth(req, res, next) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
  if (!m) return next();
  const row = db.prepare('SELECT s.token_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(m[1]));
  if (row && row.expires_at >= Date.now()) { req.user = row; req.tokenHash = row.token_hash; }
  next();
}


// ---------- plan / favorite payload validation ----------
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function jsonWithin(obj, max) { try { const s = JSON.stringify(obj); return s && s.length <= max ? s : null; } catch { return null; } }
function cleanPlan(p) {
  if (!p || typeof p !== 'object' || !ID_RE.test(String(p.id || ''))) return null;
  if (!Array.isArray(p.picks) || !p.picks.length || p.picks.length > 15) return null;
  const s = jsonWithin(p, 16 * 1024); if (!s) return null;
  const created = Number.isFinite(+p.createdAt) && +p.createdAt > 0 ? Math.min(+p.createdAt, Date.now()) : Date.now();
  return { id: String(p.id), data: s, created };
}
function cleanFav(f) {
  if (!f || typeof f !== 'object' || !ID_RE.test(String(f.matchId || ''))) return null;
  const s = jsonWithin(f, 2 * 1024); if (!s) return null;
  return { id: String(f.matchId), data: s };
}
const listPlans = uid => db.prepare('SELECT data FROM plans WHERE user_id = ? ORDER BY created_at DESC').all(uid).map(r => JSON.parse(r.data));
const listFavs = uid => db.prepare('SELECT data FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(uid).map(r => JSON.parse(r.data));
const nPlans = uid => db.prepare('SELECT COUNT(*) n FROM plans WHERE user_id = ?').get(uid).n;
const nFavs = uid => db.prepare('SELECT COUNT(*) n FROM favorites WHERE user_id = ?').get(uid).n;
const insPlan = db.prepare('INSERT OR IGNORE INTO plans (user_id, id, data, created_at) VALUES (?,?,?,?)');
const insFav = db.prepare('INSERT OR REPLACE INTO favorites (user_id, match_id, data, created_at) VALUES (?,?,?,?)');

// ---------- routes ----------
const r = express.Router();
r.use(express.json({ limit: '256kb' }));

r.post('/auth/register', async (req, res) => {
  const ip = ipOf(req);
  if (!hit('reg-try:' + ip, 30, 3600e3)) return res.status(429).json({ error: '注册尝试过于频繁，请1小时后再试' });
  if (count('reg-ok:' + ip, 86400e3) >= 20) return res.status(429).json({ error: '该网络今日注册账号过多，请明天再试' });
  const { phone, password, nickname, agree } = req.body || {};
  if (!PHONE_RE.test(String(phone || ''))) return res.status(400).json({ error: '请输入正确的11位手机号' });
  if (!validPassword(password)) return res.status(400).json({ error: '密码需8-32位，且同时包含字母和数字，不能有空格' });
  if (agree !== true) return res.status(400).json({ error: '请阅读并同意《用户协议》和《隐私政策》' });
  const nick = nickname ? cleanNickname(nickname) : '球迷' + String(phone).slice(-4);
  if (!nick) return res.status(400).json({ error: '昵称需1-16个字符' });
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) return res.status(409).json({ error: '该手机号已注册，请直接登录' });
  const now = Date.now();
  const hash = await hashPassword(password);
  let info;
  try { info = db.prepare('INSERT INTO users (phone, pass_hash, nickname, avatar, agreed_terms_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(phone, hash, nick, 'a1', now, now, now); }
  catch (e) { if (/UNIQUE/.test(e.message)) return res.status(409).json({ error: '该手机号已注册，请直接登录' }); throw e; }
  hit('reg-ok:' + ip, 1e9, 86400e3);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: createSession(user.id, req.get('user-agent')), user: publicUser(user) });
});

r.post('/auth/login', async (req, res) => {
  const ip = ipOf(req);
  const { phone, password } = req.body || {};
  if (!hit('login-ip:' + ip, 30, 15 * 60e3)) return res.status(429).json({ error: '登录尝试过多，请15分钟后再试' });
  if (!PHONE_RE.test(String(phone || '')) || typeof password !== 'string' || !password || password.length > 64) return res.status(400).json({ error: '请输入正确的手机号和密码' });
  const failKey = 'login-fail:' + phone;
  if (count(failKey, 15 * 60e3) >= 5) return res.status(429).json({ error: '密码错误次数过多，该账号已临时锁定15分钟' });
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const ok = user ? await verifyPassword(password, user.pass_hash) : (await verifyPassword(password, await DUMMY_HASH), false);
  if (!ok) {
    hit(failKey, 1e9, 15 * 60e3);
    const left = Math.max(0, 5 - count(failKey, 15 * 60e3));
    return res.status(401).json({ error: `手机号或密码错误${left ? `，还可尝试${left}次` : '，账号已临时锁定15分钟'}` });
  }
  buckets.delete(failKey);
  res.json({ token: createSession(user.id, req.get('user-agent')), user: publicUser(user) });
});

r.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
  res.json({ ok: true });
});

r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user), counts: { plans: nPlans(req.user.id), favorites: nFavs(req.user.id) } }));

r.patch('/me', requireAuth, (req, res) => {
  const { nickname, avatar } = req.body || {};
  const u = req.user;
  let nick = u.nickname, av = u.avatar;
  if (nickname !== undefined) { nick = cleanNickname(nickname); if (!nick) return res.status(400).json({ error: '昵称需1-16个字符' }); }
  if (avatar !== undefined) { if (!AVATARS.includes(avatar)) return res.status(400).json({ error: '头像无效' }); av = avatar; }
  db.prepare('UPDATE users SET nickname = ?, avatar = ?, updated_at = ? WHERE id = ?').run(nick, av, Date.now(), u.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

r.post('/me/password', requireAuth, async (req, res) => {
  if (!hit('pw:' + req.user.id, 10, 15 * 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const { oldPassword, newPassword } = req.body || {};
  if (typeof oldPassword !== 'string' || !(await verifyPassword(oldPassword, req.user.pass_hash))) return res.status(400).json({ error: '原密码不正确' });
  if (!validPassword(newPassword)) return res.status(400).json({ error: '新密码需8-32位，且同时包含字母和数字，不能有空格' });
  if (newPassword === oldPassword) return res.status(400).json({ error: '新密码不能与原密码相同' });
  db.prepare('UPDATE users SET pass_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(newPassword), Date.now(), req.user.id);
  // sign out all other devices
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, req.tokenHash);
  res.json({ ok: true });
});

r.delete('/me', requireAuth, async (req, res) => {
  if (!hit('del:' + req.user.id, 10, 15 * 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || !(await verifyPassword(password, req.user.pass_hash))) return res.status(400).json({ error: '密码不正确' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascades to sessions, plans, favorites
  res.json({ ok: true });
});

// ---- 我的方案 (personal records only; never submitted anywhere) ----
r.get('/plans', requireAuth, (req, res) => res.json({ plans: listPlans(req.user.id) }));
r.post('/plans', requireAuth, (req, res) => {
  const p = cleanPlan(req.body);
  if (!p) return res.status(400).json({ error: '方案数据无效' });
  if (nPlans(req.user.id) >= MAX_PLANS) return res.status(400).json({ error: `最多保存${MAX_PLANS}个方案，请先删除旧方案` });
  insPlan.run(req.user.id, p.id, p.data, p.created);
  res.status(201).json({ ok: true });
});
r.delete('/plans/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM plans WHERE user_id = ? AND id = ?').run(req.user.id, String(req.params.id));
  res.json({ ok: true });
});

// ---- 关注 ----
r.get('/favorites', requireAuth, (req, res) => res.json({ favorites: listFavs(req.user.id) }));
r.put('/favorites/:matchId', requireAuth, (req, res) => {
  const f = cleanFav({ ...(req.body || {}), matchId: req.params.matchId });
  if (!f) return res.status(400).json({ error: '关注数据无效' });
  const exists = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND match_id = ?').get(req.user.id, f.id);
  if (!exists && nFavs(req.user.id) >= MAX_FAVS) return res.status(400).json({ error: `最多关注${MAX_FAVS}场比赛` });
  insFav.run(req.user.id, f.id, f.data, Date.now());
  res.json({ ok: true });
});
r.delete('/favorites/:matchId', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND match_id = ?').run(req.user.id, String(req.params.matchId));
  res.json({ ok: true });
});

// ---- merge guest (local) data into the account after login ----
r.post('/sync', requireAuth, (req, res) => {
  const { plans = [], favorites = [] } = req.body || {};
  if (!Array.isArray(plans) || !Array.isArray(favorites) || plans.length > MAX_PLANS || favorites.length > MAX_FAVS) return res.status(400).json({ error: '同步数据无效' });
  const uid = req.user.id;
  db.transaction(() => {
    let np = nPlans(uid), nf = nFavs(uid);
    for (const p0 of plans) { const p = cleanPlan(p0); if (p && np < MAX_PLANS) np += insPlan.run(uid, p.id, p.data, p.created).changes; }
    for (const f0 of favorites) {
      const f = cleanFav(f0); if (!f || nf >= MAX_FAVS) continue;
      nf += db.prepare('INSERT OR IGNORE INTO favorites (user_id, match_id, data, created_at) VALUES (?,?,?,?)').run(uid, f.id, f.data, Date.now()).changes;
    }
  })();
  res.json({ plans: listPlans(uid), favorites: listFavs(uid) });
});


// ---- 大众态度 (match vote poll) ----
const VOTE_CHOICE = new Set(['h', 'd', 'a']);
const MATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function voteCounts(matchId) {
  const rows = db.prepare('SELECT choice, COUNT(*) n FROM match_votes WHERE match_id = ? GROUP BY choice').all(matchId);
  const counts = { h: 0, d: 0, a: 0 };
  for (const r of rows) if (counts[r.choice] != null) counts[r.choice] = r.n;
  const total = counts.h + counts.d + counts.a;
  return { counts, total };
}
r.get('/match-vote', optionalAuth, (req, res) => {
  const matchId = String(req.query.matchId || '').trim();
  if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
  const { counts, total } = voteCounts(matchId);
  let myVote = null;
  if (req.user) {
    const row = db.prepare('SELECT choice FROM match_votes WHERE match_id = ? AND user_id = ?').get(matchId, req.user.id);
    myVote = row ? row.choice : null;
  }
  res.json({ matchId, counts, total, myVote, labels: { h: '胜', d: '平', a: '负' } });
});
r.post('/match-vote', requireAuth, (req, res) => {
  if (!hit('vote:' + req.user.id, 60, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const matchId = String((req.body && req.body.matchId) || '').trim();
  const choice = String((req.body && req.body.choice) || '').trim();
  if (!MATCH_ID_RE.test(matchId)) return res.status(400).json({ error: '比赛编号无效' });
  if (!VOTE_CHOICE.has(choice)) return res.status(400).json({ error: '请选择胜、平或负' });
  const now = Date.now();
  const existing = db.prepare('SELECT choice FROM match_votes WHERE match_id = ? AND user_id = ?').get(matchId, req.user.id);
  if (existing) {
    db.prepare('UPDATE match_votes SET choice = ?, updated_at = ? WHERE match_id = ? AND user_id = ?').run(choice, now, matchId, req.user.id);
  } else {
    db.prepare('INSERT INTO match_votes (match_id, user_id, choice, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(matchId, req.user.id, choice, now, now);
  }
  const { counts, total } = voteCounts(matchId);
  res.json({ ok: true, matchId, counts, total, myVote: choice, labels: { h: '胜', d: '平', a: '负' } });
});

// JSON errors (bad JSON body etc.)
r.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '数据过大' });
  console.error('api error', err.message);
  res.status(500).json({ error: '服务器错误' });
});

module.exports = r;
module.exports.requireAuth = requireAuth;
module.exports.optionalAuth = optionalAuth;
