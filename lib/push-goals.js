// Followed-match (关注场次) goal push: device registry + fav sync + score
// watcher + JPush REST. Works when the Android process is killed.
// Env (never commit real values): JPUSH_APPKEY, JPUSH_MASTER_SECRET,
// optional JPUSH_API=https://api.jpush.cn/v3/push, PUSH_GOALS_INTERVAL_MS.
'use strict';

const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');
const { favGoalAlertDecision, buildFavGoalNotifyCopy } = require('./goal-alert');

const MATCH_ID_RE = /^[A-Za-z0-9:._-]{1,80}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const REG_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;
const MAX_FAVS_PER_DEVICE = 80;
const PACKAGE_NAME = 'com.tiicai.jingcai';
const DEFAULT_INTERVAL_MS = 30000;

db.exec(`
CREATE TABLE IF NOT EXISTS push_devices (
  device_id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  reg_id TEXT,
  user_id INTEGER,
  platform TEXT NOT NULL DEFAULT 'android',
  app_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_devices_reg ON push_devices(reg_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);
CREATE TABLE IF NOT EXISTS push_device_favs (
  device_id TEXT NOT NULL REFERENCES push_devices(device_id) ON DELETE CASCADE,
  match_id TEXT NOT NULL,
  home TEXT,
  away TEXT,
  kickoff_ms INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_push_favs_match ON push_device_favs(match_id);
CREATE TABLE IF NOT EXISTS push_goal_seen (
  match_id TEXT PRIMARY KEY,
  score_key TEXT,
  watching INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_goal_sent (
  match_id TEXT NOT NULL,
  score_key TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, score_key)
);
`);

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => Date.now();

function jpushConfigured() {
  return !!(String(process.env.JPUSH_APPKEY || '').trim() && String(process.env.JPUSH_MASTER_SECRET || '').trim());
}

function hitIp(req, limit, windowMs) {
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return hitLocal('ip:' + ip, limit, windowMs);
}

const buckets = new Map();
function hitLocal(key, limit, windowMs) {
  const t = Date.now();
  const arr = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  arr.push(t);
  buckets.set(key, arr);
  return arr.length <= limit;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, a] of buckets) if (!a.some((x) => t - x < 86400e3)) buckets.delete(k);
}, 600e3).unref();

function cleanMatchId(id) {
  const s = String(id || '').trim();
  return MATCH_ID_RE.test(s) ? s : null;
}

function cleanDeviceId(id) {
  const s = String(id || '').trim();
  return DEVICE_ID_RE.test(s) ? s : null;
}

function newSecret() {
  return crypto.randomBytes(24).toString('base64url');
}

function verifyDevice(deviceId, secret) {
  const id = cleanDeviceId(deviceId);
  if (!id || typeof secret !== 'string' || secret.length < 8 || secret.length > 128) return null;
  const row = db.prepare('SELECT * FROM push_devices WHERE device_id = ?').get(id);
  if (!row || row.secret_hash !== sha(secret)) return null;
  return row;
}

function upsertDevice({ deviceId, secret, regId, userId, platform, appVersion }) {
  const id = cleanDeviceId(deviceId);
  if (!id) return { error: '设备编号无效', status: 400 };
  const plat = platform === 'android' || !platform ? 'android' : String(platform).slice(0, 20);
  const ver = appVersion ? String(appVersion).slice(0, 32) : '';
  const rid = regId && REG_ID_RE.test(String(regId)) ? String(regId) : (regId ? null : '');
  if (regId && rid == null) return { error: '推送令牌无效', status: 400 };
  const t = now();
  const existing = db.prepare('SELECT * FROM push_devices WHERE device_id = ?').get(id);
  if (existing) {
    if (!secret || existing.secret_hash !== sha(secret)) {
      return { error: '设备凭证无效', status: 403 };
    }
    db.prepare(`UPDATE push_devices SET
      reg_id = COALESCE(?, reg_id),
      user_id = COALESCE(?, user_id),
      platform = ?,
      app_version = ?,
      updated_at = ?
      WHERE device_id = ?`).run(rid === '' ? null : (rid || null), userId || null, plat, ver, t, id);
    return { deviceId: id, deviceSecret: secret, created: false };
  }
  const issued = newSecret();
  db.prepare(`INSERT INTO push_devices
    (device_id, secret_hash, reg_id, user_id, platform, app_version, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, sha(issued), rid || null, userId || null, plat, ver, t, t);
  return { deviceId: id, deviceSecret: issued, created: true };
}

function replaceFavs(deviceId, favorites) {
  const id = cleanDeviceId(deviceId);
  if (!id) return { error: '设备编号无效', status: 400 };
  if (!Array.isArray(favorites) || favorites.length > MAX_FAVS_PER_DEVICE) {
    return { error: '关注列表无效', status: 400 };
  }
  const cleaned = [];
  const seen = new Set();
  for (const f of favorites) {
    const mid = cleanMatchId(f && (f.matchId || f.id));
    if (!mid || seen.has(mid)) continue;
    seen.add(mid);
    const home = f && f.home != null ? String(f.home).slice(0, 40) : '';
    const away = f && f.away != null ? String(f.away).slice(0, 40) : '';
    let ko = null;
    if (f && f.date) {
      const ms = Date.parse(`${f.date}T${String(f.time || '00:00').slice(0, 5)}:00+08:00`);
      if (Number.isFinite(ms)) ko = ms;
    }
    cleaned.push({ matchId: mid, home, away, kickoffMs: ko });
  }
  const t = now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM push_device_favs WHERE device_id = ?').run(id);
    const ins = db.prepare(`INSERT INTO push_device_favs
      (device_id, match_id, home, away, kickoff_ms, updated_at) VALUES (?,?,?,?,?,?)`);
    for (const f of cleaned) ins.run(id, f.matchId, f.home, f.away, f.kickoffMs, t);
  });
  tx();
  return { ok: true, count: cleaned.length, matchIds: cleaned.map((x) => x.matchId) };
}

function listFollowedMatchIds() {
  const rows = db.prepare(`
    SELECT DISTINCT f.match_id AS match_id
    FROM push_device_favs f
    JOIN push_devices d ON d.device_id = f.device_id
    WHERE d.reg_id IS NOT NULL AND length(d.reg_id) > 0
  `).all();
  return rows.map((r) => r.match_id).filter(Boolean).slice(0, 80);
}

function listDevicesForMatch(matchId) {
  return db.prepare(`
    SELECT d.device_id AS deviceId, d.reg_id AS regId, f.home AS home, f.away AS away
    FROM push_device_favs f
    JOIN push_devices d ON d.device_id = f.device_id
    WHERE f.match_id = ? AND d.reg_id IS NOT NULL AND length(d.reg_id) > 0
  `).all(matchId);
}

function getSeen(matchId) {
  const row = db.prepare('SELECT score_key, watching FROM push_goal_seen WHERE match_id = ?').get(matchId);
  return row || { score_key: null, watching: 0 };
}

function setSeen(matchId, scoreKey, watching) {
  const t = now();
  db.prepare(`INSERT INTO push_goal_seen (match_id, score_key, watching, updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(match_id) DO UPDATE SET
      score_key = excluded.score_key,
      watching = excluded.watching,
      updated_at = excluded.updated_at`).run(matchId, scoreKey || null, watching ? 1 : 0, t);
}

function alreadySent(matchId, scoreKey) {
  return !!db.prepare('SELECT 1 FROM push_goal_sent WHERE match_id = ? AND score_key = ?').get(matchId, scoreKey);
}

function markSent(matchId, scoreKey) {
  db.prepare('INSERT OR IGNORE INTO push_goal_sent (match_id, score_key, sent_at) VALUES (?,?,?)')
    .run(matchId, scoreKey, now());
}

function intentForMatch(matchId) {
  return `intent:#Intent;component=${PACKAGE_NAME}/.MainActivity;S.match_id=${matchId};end`;
}

function buildJpushPayload({ regIds, title, body, matchId, scoreKey }) {
  return {
    platform: 'android',
    audience: { registration_id: regIds },
    notification: {
      android: {
        alert: body,
        title,
        extras: { matchId, scoreKey, kind: 'fav_goal' },
        channel_id: 'goal_alerts',
        priority: 2,
        // App in the foreground: local poll shows the tray. Avoid double-spam.
        display_foreground: '0',
        intent: { url: intentForMatch(matchId) },
      },
    },
    options: {
      time_to_live: 3600,
      classification: 1,
    },
  };
}

let _sender = null;
function setSender(fn) { _sender = fn; }

async function defaultJpushSend(payload) {
  const appKey = String(process.env.JPUSH_APPKEY || '').trim();
  const secret = String(process.env.JPUSH_MASTER_SECRET || '').trim();
  if (!appKey || !secret) return { skipped: 'no_jpush_credentials' };
  if (process.env.PUSH_DRY_RUN === '1') return { dryRun: true, payload };
  const url = String(process.env.JPUSH_API || 'https://api.jpush.cn/v3/push').trim();
  const auth = Buffer.from(appKey + ':' + secret).toString('base64');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  if (!r.ok) {
    const err = new Error('JPush HTTP ' + r.status);
    err.status = r.status;
    err.body = body;
    throw err;
  }
  return { ok: true, body };
}

async function sendGoalPush(devices, ev) {
  const ids = [...new Set(devices.map((d) => d.regId).filter(Boolean))];
  if (!ids.length) return { skipped: 'no_reg' };
  const title = ev.title || '进球提醒';
  const body = ev.body || '';
  const payload = buildJpushPayload({
    regIds: ids,
    title,
    body,
    matchId: ev.matchId,
    scoreKey: ev.scoreKey,
  });
  const send = _sender || defaultJpushSend;
  return send(payload);
}

function favMeta(matchId, devices, liveRow) {
  const d0 = devices && devices[0];
  return {
    home: (liveRow && liveRow.home) || (d0 && d0.home) || '主队',
    away: (liveRow && liveRow.away) || (d0 && d0.away) || '客队',
  };
}

/**
 * Detect goals among followed matches and push. `getLiveScores` is injected
 * so tests can stub sporttery / AF.
 */
async function detectAndPush(opts = {}) {
  const getLiveScores = opts.getLiveScores || (async (args) => {
    const ls = require('./live-scores');
    return ls.getLiveScores(args);
  });
  const ids = listFollowedMatchIds();
  if (!ids.length) return { skipped: 'no_favs', events: [] };
  const payload = await getLiveScores({
    ids,
    fetchJson: opts.fetchJson,
    base: opts.base,
    force: opts.force !== false,
    withAf: opts.withAf !== false,
    resolveMeta: opts.resolveMeta || {},
  });
  const data = (payload && payload.data) || {};
  const events = [];
  for (const id of ids) {
    const row = data[id];
    const prev = getSeen(id);
    const watching = !!prev.watching;
    const d = favGoalAlertDecision(prev.score_key, row, watching);
    if (d.action === 'watch') {
      setSeen(id, prev.score_key, true);
      continue;
    }
    if (d.key) setSeen(id, d.key, true);
    else setSeen(id, prev.score_key, true);
    if (d.action !== 'notify' || !d.key) continue;
    if (alreadySent(id, d.key)) continue;
    const devices = listDevicesForMatch(id);
    if (!devices.length) continue;
    const meta = favMeta(id, devices, row);
    const minute = row && row.minute != null ? row.minute : null;
    const copy = buildFavGoalNotifyCopy(meta.home, meta.away, d.homeScore, d.awayScore, minute, null);
    const ev = {
      matchId: id,
      scoreKey: d.key,
      homeScore: d.homeScore,
      awayScore: d.awayScore,
      home: meta.home,
      away: meta.away,
      title: copy.title,
      body: copy.body,
    };
    try {
      const sent = await sendGoalPush(devices, ev);
      markSent(id, d.key);
      events.push({ ...ev, sent });
    } catch (e) {
      events.push({ ...ev, error: e.message, status: e.status || 0 });
    }
  }
  return { ids, events, cached: !!(payload && payload.cached) };
}

let _timer = null;
let _running = false;

function startWorker(opts = {}) {
  if (process.env.PUSH_GOALS_WORKER === '0') return { skipped: 'disabled' };
  if (_timer) return { skipped: 'already' };
  const interval = Number(opts.intervalMs || process.env.PUSH_GOALS_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  const tick = async () => {
    if (_running) return;
    _running = true;
    try {
      const r = await detectAndPush(opts);
      if (r && r.events && r.events.length) {
        console.log('[push-goals]', r.events.length, 'goal push(es)', r.events.map((e) => e.matchId + ':' + e.scoreKey).join(','));
      }
    } catch (e) {
      console.warn('[push-goals] tick failed', e.message);
    } finally {
      _running = false;
    }
  };
  _timer = setInterval(tick, interval);
  if (_timer.unref) _timer.unref();
  setTimeout(tick, 8000).unref();
  console.log('[push-goals] worker every', interval, 'ms; jpush', jpushConfigured() ? 'configured' : 'credentials missing');
  return { started: true, interval };
}

function stopWorker() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ---------- HTTP ----------
const r = express.Router();
r.use(express.json({ limit: '64kb' }));

function deviceFromReq(req) {
  const body = req.body || {};
  const q = req.query || {};
  const deviceId = body.deviceId || q.deviceId;
  const secret = body.deviceSecret || req.get('x-device-secret') || q.deviceSecret;
  return verifyDevice(deviceId, secret);
}

r.post('/push/register', (req, res) => {
  if (!hitIp(req, 40, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const body = req.body || {};
  const deviceId = cleanDeviceId(body.deviceId);
  if (!deviceId) return res.status(400).json({ error: '设备编号无效' });
  let userId = null;
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.get('authorization') || '');
  if (m) {
    try {
      const { db: authDb } = require('./db');
      const tokenHash = crypto.createHash('sha256').update(m[1]).digest('hex');
      const row = authDb.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, Date.now());
      if (row) userId = row.user_id;
    } catch { /* optional */ }
  }
  const out = upsertDevice({
    deviceId,
    secret: body.deviceSecret,
    regId: body.regId,
    userId,
    platform: body.platform,
    appVersion: body.appVersion,
  });
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json({
    ok: true,
    deviceId: out.deviceId,
    deviceSecret: out.deviceSecret,
    pushEnabled: jpushConfigured(),
    created: !!out.created,
  });
});

r.put('/push/favs', (req, res) => {
  if (!hitIp(req, 60, 60e3)) return res.status(429).json({ error: '操作太频繁，请稍后再试' });
  const row = deviceFromReq(req);
  if (!row) return res.status(401).json({ error: '设备未注册' });
  const out = replaceFavs(row.device_id, (req.body && req.body.favorites) || []);
  if (out.error) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true, count: out.count });
});

r.get('/push/status', (req, res) => {
  const row = deviceFromReq(req);
  if (!row && req.query.deviceId) {
    const id = cleanDeviceId(req.query.deviceId);
    const exists = id && db.prepare('SELECT 1 FROM push_devices WHERE device_id = ?').get(id);
    return res.json({
      ok: true,
      registered: !!exists,
      authorized: false,
      pushEnabled: jpushConfigured(),
    });
  }
  if (!row) return res.json({ ok: true, registered: false, pushEnabled: jpushConfigured() });
  const n = db.prepare('SELECT COUNT(*) n FROM push_device_favs WHERE device_id = ?').get(row.device_id).n;
  res.json({
    ok: true,
    registered: true,
    authorized: true,
    hasRegId: !!(row.reg_id && row.reg_id.length),
    favCount: n,
    pushEnabled: jpushConfigured(),
  });
});

module.exports = r;
module.exports.upsertDevice = upsertDevice;
module.exports.replaceFavs = replaceFavs;
module.exports.listFollowedMatchIds = listFollowedMatchIds;
module.exports.listDevicesForMatch = listDevicesForMatch;
module.exports.detectAndPush = detectAndPush;
module.exports.startWorker = startWorker;
module.exports.stopWorker = stopWorker;
module.exports.setSender = setSender;
module.exports.buildJpushPayload = buildJpushPayload;
module.exports.jpushConfigured = jpushConfigured;
module.exports.verifyDevice = verifyDevice;
module.exports.MATCH_ID_RE = MATCH_ID_RE;
module.exports.DEVICE_ID_RE = DEVICE_ID_RE;
module.exports.PACKAGE_NAME = PACKAGE_NAME;
