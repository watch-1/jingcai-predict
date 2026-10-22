/**
 * 资讯会员 / 高级数据订阅（资讯会员 mock）。
 * 当前仅 mock/sandbox 支付确认；正式微信/支付宝需商户号 + 类目审核后再接。
 *
 * 预留正式接口位：
 *   createProviderPrepay(order)  — 调微信/支付宝统一下单，返回 prepay 参数
 *   handleProviderNotify(req)    — 支付结果异步回调验签与入账
 * 当前 mockPay 直接确认成功并延长 member_until。
 */
'use strict';
const crypto = require('crypto');
const express = require('express');
const { db } = require('./db');
const { requireAuth } = require('./auth');

const PLANS = Object.freeze([
  {
    id: 'month',
    name: '月度会员',
    days: 31,
    amountFen: 1990,
    tag: '体验优选',
    desc: '适合短期查阅高级预测简报与完整数据',
    perDayFen: Math.round(1990 / 31),
  },
  {
    id: 'quarter',
    name: '季度会员',
    days: 93,
    amountFen: 4990,
    tag: '最受欢迎',
    desc: '整季赛事周期更划算，含全部会员权益',
    perDayFen: Math.round(4990 / 93),
    highlight: true,
  },
  {
    id: 'year',
    name: '年度会员',
    days: 365,
    amountFen: 12800,
    tag: '全年畅享',
    desc: '全年资讯与数据中心完整访问，性价比最高',
    perDayFen: Math.round(12800 / 365),
  },
]);

const BENEFITS = Object.freeze([
  { icon: 'chart', title: '高级预测简报', desc: '赛前情报完整版：战绩/交锋/伤停（若有）+ 赔率参考' },
  { icon: 'data', title: '数据中心完整', desc: '积分榜、射手榜、助攻榜与球队/球员详情完整浏览' },
  { icon: 'shield', title: '无广告纯净浏览', desc: '会员期内不展示推广条（当前版本本就无第三方广告）' },
  { icon: 'doc', title: '方案与关注云同步', desc: '登录账号后方案/关注多端同步（会员与免费账号均支持）' },
  { icon: 'news', title: '资讯优先体验', desc: '后续会员专属资讯能力优先对会员开放（占位，不承诺购彩）' },
]);

const CHANNELS = Object.freeze([
  { id: 'wechat', name: '微信支付', provider: 'wechat_mock', mock: true },
  { id: 'alipay', name: '支付宝', provider: 'alipay_mock', mock: true },
]);

function fenToYuan(fen) {
  return (Number(fen) / 100).toFixed(2);
}

function planById(id) {
  return PLANS.find((p) => p.id === id) || null;
}

function memberStatusOf(user) {
  const until = user && user.member_until != null ? Number(user.member_until) : 0;
  const now = Date.now();
  const active = Number.isFinite(until) && until > now;
  return {
    active,
    memberUntil: active || until > 0 ? until : null,
    daysLeft: active ? Math.max(1, Math.ceil((until - now) / 86400e3)) : 0,
  };
}

function publicOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
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

function newOrderId() {
  const t = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  return `M${ts}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** 正式支付预留下单位：未配置商户时拒绝 */
function createProviderPrepay(/* order */) {
  const err = new Error('正式支付未接入：需完成微信/支付宝商户入驻与类目审核后配置商户号');
  err.code = 'PROVIDER_NOT_CONFIGURED';
  throw err;
}

/** 正式支付回调预留位 */
function handleProviderNotify(/* req */) {
  const err = new Error('正式支付回调未接入');
  err.code = 'NOTIFY_NOT_CONFIGURED';
  throw err;
}

function applyPaidOrder(orderRow, userId) {
  const now = Date.now();
  const user = db.prepare('SELECT id, member_until FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');
  const base = Math.max(Number(user.member_until) || 0, now);
  const until = base + orderRow.days * 86400e3;
  const tradeNo = `MOCK${now}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const tx = db.transaction(() => {
    const info = db.prepare(
      `UPDATE membership_orders SET status=?, provider_trade_no=?, paid_at=?, expire_extend_to=?, updated_at=?
       WHERE id=? AND user_id=? AND status='pending'`
    ).run('paid', tradeNo, now, until, now, orderRow.id, userId);
    if (!info.changes) return null;
    db.prepare('UPDATE users SET member_until = ?, updated_at = ? WHERE id = ?').run(until, now, userId);
    return db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(orderRow.id);
  });
  return tx();
}

const r = express.Router();
r.use(express.json({ limit: '64kb' }));

r.get('/membership/plans', (_req, res) => {
  res.json({
    mode: 'mock',
    currency: 'CNY',
    note: '当前为模拟支付（sandbox/mock），不会真实扣款。正式微信/支付宝需商户与类目审核。',
    plans: PLANS.map((p) => ({
      ...p,
      amountYuan: fenToYuan(p.amountFen),
      perDayYuan: fenToYuan(p.perDayFen),
    })),
    benefits: BENEFITS,
    channels: CHANNELS,
  });
});

r.get('/membership/status', requireAuth, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const st = memberStatusOf(u);
  res.json({
    ...st,
    mode: 'mock',
    benefits: BENEFITS,
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      days: p.days,
      amountFen: p.amountFen,
      amountYuan: fenToYuan(p.amountFen),
      tag: p.tag,
      highlight: !!p.highlight,
    })),
  });
});

r.get('/membership/orders', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const rows = db.prepare(
    `SELECT * FROM membership_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(req.user.id, limit);
  res.json({ orders: rows.map(publicOrder), mode: 'mock' });
});

r.get('/membership/orders/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ? AND user_id = ?').get(String(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  res.json({ order: publicOrder(row), membership: memberStatusOf(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

r.post('/membership/orders', requireAuth, (req, res) => {
  const { planId, channel } = req.body || {};
  const plan = planById(String(planId || ''));
  if (!plan) return res.status(400).json({ error: '请选择有效套餐' });
  const ch = CHANNELS.find((c) => c.id === String(channel || ''));
  if (!ch) return res.status(400).json({ error: '请选择支付方式（微信/支付宝）' });
  // 限流：每用户每分钟最多 8 单
  const recent = db.prepare(
    `SELECT COUNT(*) n FROM membership_orders WHERE user_id = ? AND created_at > ?`
  ).get(req.user.id, Date.now() - 60e3);
  if (recent.n >= 8) return res.status(429).json({ error: '下单过于频繁，请稍后再试' });

  const now = Date.now();
  const id = newOrderId();
  db.prepare(
    `INSERT INTO membership_orders
      (id, user_id, plan_id, plan_name, amount_fen, days, channel, status, provider, created_at, updated_at, meta)
     VALUES (?,?,?,?,?,?,?,'pending',?,?,?,?)`
  ).run(
    id,
    req.user.id,
    plan.id,
    plan.name,
    plan.amountFen,
    plan.days,
    ch.id,
    ch.provider,
    now,
    now,
    JSON.stringify({ mode: 'mock', agree: true })
  );
  const order = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id);
  res.status(201).json({
    order: publicOrder(order),
    mode: 'mock',
    payHint: '当前为模拟支付：确认后即时到账，不会真实扣款。正式支付接口位已预留。',
  });
});

/**
 * Mock 支付确认（sandbox）。正式环境应改为：
 * 1) createProviderPrepay → 客户端调起微信/支付宝 SDK
 * 2) handleProviderNotify → 验签后入账
 */
r.post('/membership/orders/:id/pay', requireAuth, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  if (row.status === 'paid') {
    return res.json({
      ok: true,
      alreadyPaid: true,
      order: publicOrder(row),
      membership: memberStatusOf(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)),
      mode: 'mock',
    });
  }
  if (row.status !== 'pending') return res.status(400).json({ error: '订单状态不可支付' });

  const forceReal = req.body && req.body.useRealProvider === true;
  if (forceReal) {
    try {
      createProviderPrepay(row);
    } catch (e) {
      return res.status(501).json({ error: e.message, code: e.code || 'PROVIDER_NOT_CONFIGURED' });
    }
  }

  // 模拟支付处理延迟感由前端控制；服务端即时成功
  let paid;
  try {
    paid = applyPaidOrder(row, req.user.id);
  } catch (e) {
    console.error('mock pay failed', e.message);
    return res.status(500).json({ error: '支付确认失败，请重试' });
  }
  if (!paid) {
    const again = db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id);
    if (again && again.status === 'paid') {
      return res.json({
        ok: true,
        alreadyPaid: true,
        order: publicOrder(again),
        membership: memberStatusOf(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)),
        mode: 'mock',
      });
    }
    return res.status(409).json({ error: '订单状态已变更，请刷新后重试' });
  }
  const membership = memberStatusOf(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id));
  res.json({
    ok: true,
    order: publicOrder(paid),
    membership,
    mode: 'mock',
    message: '模拟支付成功，会员权益已生效（未真实扣款）',
  });
});

r.post('/membership/orders/:id/cancel', requireAuth, (req, res) => {
  const id = String(req.params.id || '');
  const row = db.prepare('SELECT * FROM membership_orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '订单不存在' });
  if (row.status !== 'pending') return res.status(400).json({ error: '仅待支付订单可取消' });
  const now = Date.now();
  db.prepare(`UPDATE membership_orders SET status='cancelled', updated_at=? WHERE id=?`).run(now, id);
  res.json({ ok: true, order: publicOrder(db.prepare('SELECT * FROM membership_orders WHERE id = ?').get(id)) });
});

/** 正式支付异步通知预留（当前恒为 501） */
r.post('/membership/notify/:provider', (req, res) => {
  try {
    handleProviderNotify(req);
  } catch (e) {
    return res.status(501).json({ error: e.message, code: e.code || 'NOTIFY_NOT_CONFIGURED' });
  }
});

r.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求格式错误' });
  console.error('membership api error', err.message);
  res.status(500).json({ error: '服务器错误' });
});

module.exports = r;
module.exports.PLANS = PLANS;
module.exports.BENEFITS = BENEFITS;
module.exports.memberStatusOf = memberStatusOf;
module.exports.createProviderPrepay = createProviderPrepay;
module.exports.handleProviderNotify = handleProviderNotify;
