'use strict';

const { db } = require('./db');
const { shanghaiNowLabel } = require('./admin-time');

function clientIp(req) {
  const raw = req && (req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress) || '';
  const first = String(raw).split(',')[0].trim().replace(/^::ffff:/, '');
  return first.slice(0, 64);
}

function log(req, action, targetType, targetId, summary) {
  const now = Date.now();
  const actor = 'admin';
  const ip = clientIp(req);
  const sum = String(summary || '').slice(0, 500);
  db.prepare(
    `INSERT INTO admin_audit_log (created_at, tz_label, action, target_type, target_id, summary, actor, ip)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(now, shanghaiNowLabel(new Date(now)), String(action), targetType || null, targetId != null ? String(targetId) : null, sum, actor, ip || null);
}

function list(opts = {}) {
  const action = String(opts.action || '').trim();
  const fromMs = opts.fromMs != null ? Number(opts.fromMs) : null;
  const toMs = opts.toMs != null ? Number(opts.toMs) : null;
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const where = [];
  const params = [];
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (Number.isFinite(fromMs)) {
    where.push('created_at >= ?');
    params.push(fromMs);
  }
  if (Number.isFinite(toMs)) {
    where.push('created_at <= ?');
    params.push(toMs);
  }
  const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM admin_audit_log ${wsql}`).get(...params).n;
  const rows = db.prepare(
    `SELECT * FROM admin_audit_log ${wsql} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);
  return {
    total,
    limit,
    offset,
    logs: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      tzLabel: r.tz_label,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      summary: r.summary,
      actor: r.actor,
      ip: r.ip,
    })),
  };
}

function actionTypes() {
  return db.prepare('SELECT DISTINCT action FROM admin_audit_log ORDER BY action').all().map((r) => r.action);
}

module.exports = { log, list, actionTypes, clientIp };
