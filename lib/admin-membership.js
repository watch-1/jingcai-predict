'use strict';

const { db } = require('./db');
const { shanghaiDayStr, shanghaiDayStartMs } = require('./admin-time');
const backup = require('./admin-backup');

function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length === 11) return s.slice(0, 3) + '****' + s.slice(7);
  if (s.length > 4) return s.slice(0, 2) + '****' + s.slice(-2);
  return s || '—';
}

function loadScheduleRows() {
  try {
    const sample = require('../sample-data');
    const rows = sample.matches && sample.matches();
    if (Array.isArray(rows) && rows.length) return { rows, source: 'sample' };
  } catch { /* */ }
  return { rows: [], source: 'none' };
}

function countSellingToday(rows) {
  const day = shanghaiDayStr();
  let n = 0;
  for (const m of rows || []) {
    const md = m.matchDate || m.businessDate || m.date || '';
    if (String(md).slice(0, 10) !== day) continue;
    const st = String(m.matchStatus || m.sellStatus || m.status || '');
    if (!st || /sell/i.test(st) || st === 'Selling') n++;
  }
  return n;
}

function computeHealth(ctx) {
  const alerts = [];
  const todos = [];
  const now = Date.now();
  const day = shanghaiDayStr();

  const af = ctx.apiFootball || {};
  const remaining = af.remaining != null ? Number(af.remaining) : null;
  const limit = af.limit != null ? Number(af.limit) : null;
  if (remaining != null && limit != null) {
    const pct = limit > 0 ? remaining / limit : 1;
    if (remaining <= 5 || pct < 0.05) {
      alerts.push({ severity: 'red', title: 'API-Football 配额极低', count: remaining, page: 'dashboard', href: 'dashboard' });
      todos.push({ text: `AF 剩余 ${remaining}/${limit}，暂缓非必要刷新`, page: 'match-health', priority: 1 });
    } else if (pct < 0.15) {
      alerts.push({ severity: 'yellow', title: 'API-Football 配额偏低', count: remaining, page: 'dashboard', href: 'dashboard' });
    } else {
      alerts.push({ severity: 'green', title: 'API-Football 配额充足', count: remaining, page: 'dashboard', href: 'dashboard' });
    }
  } else {
    alerts.push({ severity: 'yellow', title: 'AF 配额尚未采样', count: null, page: 'dashboard', href: 'dashboard' });
  }

  const sched = loadScheduleRows();
  const sellingToday = countSellingToday(sched.rows);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', hour12: false }).format(new Date()));
  if (sellingToday === 0 && hour >= 10 && hour <= 22) {
    alerts.push({
      severity: 'yellow',
      title: '今日赛程在售场次偏少',
      count: sellingToday,
      page: 'match-health',
      href: 'match-health',
      note: `数据源：${sched.source}`,
    });
    todos.push({ text: '核对竞彩 schedule/matches 是否正常拉取', page: 'match-health', priority: 2 });
  } else if (sellingToday > 0) {
    alerts.push({ severity: 'green', title: '今日在售场次', count: sellingToday, page: 'match-health', href: 'match-health' });
  }

  const liveLag = ctx.liveEventsLagCount != null ? ctx.liveEventsLagCount : null;
  if (liveLag != null && liveLag > 0) {
    alerts.push({ severity: 'red', title: '进行中比赛事件滞后', count: liveLag, page: 'match-health', href: 'match-health' });
    todos.push({ text: `${liveLag} 场 live 比分/事件不同步，查看赛事健康`, page: 'match-health', priority: 1 });
  } else if (liveLag === 0) {
    alerts.push({ severity: 'green', title: '进行中比赛事件正常', count: 0, page: 'match-health', href: 'match-health' });
  }

  const bf = backup.freshnessAlert();
  alerts.push(bf);

  if (ctx.deepseekConfigured) {
    alerts.push({ severity: 'green', title: 'DeepSeek 已配置', count: null, page: 'flags', href: 'flags' });
  } else {
    alerts.push({ severity: 'yellow', title: 'DeepSeek 未配置', count: null, page: 'flags', href: 'flags' });
  }

  const pendingOld = db.prepare(
    `SELECT COUNT(*) n FROM membership_orders WHERE status='pending' AND created_at < ?`
  ).get(now - 48 * 3600e3).n;
  if (pendingOld > 0) {
    alerts.push({ severity: 'yellow', title: '待支付订单滞留>48h', count: pendingOld, page: 'orders', href: 'orders' });
    todos.push({ text: `处理 ${pendingOld} 笔滞留待支付订单`, page: 'orders', priority: 3 });
  }

  const exp7 = db.prepare(
    `SELECT COUNT(*) n FROM users WHERE member_until IS NOT NULL AND member_until > ? AND member_until <= ?`
  ).get(now, now + 7 * 86400e3).n;
  if (exp7 > 0) {
    alerts.push({ severity: 'yellow', title: '7 日内会员到期', count: exp7, page: 'membership', href: 'membership' });
    todos.push({ text: `${exp7} 位会员 7 天内到期，查看经营页`, page: 'membership', priority: 2 });
  } else {
    alerts.push({ severity: 'green', title: '7 日内无集中到期', count: 0, page: 'membership', href: 'membership' });
  }

  const pendingCovers = (ctx.pendingCovers != null) ? ctx.pendingCovers : 0;
  if (pendingCovers > 0) {
    todos.push({ text: `审核 ${pendingCovers} 组头条 A/B 封面`, page: 'news-covers', priority: 3 });
  }

  todos.sort((a, b) => a.priority - b.priority);
  return {
    alerts,
    todos,
    day,
    scheduleSource: sched.source,
    sellingToday,
  };
}

function funnelMetrics() {
  const now = Date.now();
  const registered = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  const everPaid = db.prepare(
    `SELECT COUNT(DISTINCT user_id) n FROM membership_orders WHERE status='paid'`
  ).get().n;
  const activeMember = db.prepare(
    'SELECT COUNT(*) n FROM users WHERE member_until IS NOT NULL AND member_until > ?'
  ).get(now).n;
  const churned = Math.max(0, everPaid - activeMember);
  return {
    registered,
    everPaid,
    activeMember,
    churned,
    noteZh: '漏斗基于 users / membership_orders；「流失」= 曾付费但当前非会员，未区分退款。',
  };
}

function revenueWindows() {
  const now = Date.now();
  const windows = [
    { key: 'today', label: '今日', from: shanghaiDayStartMs(shanghaiDayStr()) },
    { key: 'd7', label: '近7天', from: now - 7 * 86400e3 },
    { key: 'd30', label: '近30天', from: now - 30 * 86400e3 },
  ];
  return windows.map((w) => {
    const rows = db.prepare(
      `SELECT plan_id, plan_name, COUNT(*) cnt, SUM(amount_fen) fen
       FROM membership_orders WHERE status='paid' AND paid_at >= ? GROUP BY plan_id, plan_name`
    ).all(w.from);
    const orders = rows.reduce((s, r) => s + r.cnt, 0);
    const fen = rows.reduce((s, r) => s + (r.fen || 0), 0);
    return {
      key: w.key,
      label: w.label,
      fromMs: w.from,
      orderCount: orders,
      revenueYuan: (fen / 100).toFixed(2),
      byPlan: rows.map((r) => ({
        planId: r.plan_id,
        planName: r.plan_name,
        count: r.cnt,
        yuan: (r.fen / 100).toFixed(2),
      })),
    };
  });
}

function expiringMembers(days = 7) {
  const now = Date.now();
  const until = now + days * 86400e3;
  return db.prepare(
    `SELECT id, phone, nickname, member_until FROM users
     WHERE member_until IS NOT NULL AND member_until > ? AND member_until <= ?
     ORDER BY member_until ASC LIMIT 500`
  ).all(now, until).map((u) => ({
    id: u.id,
    nickname: u.nickname,
    phoneMask: maskPhone(u.phone),
    memberUntil: u.member_until,
  }));
}

function recentRefunds(days = 30) {
  const from = Date.now() - days * 86400e3;
  return db.prepare(
    `SELECT COUNT(*) n FROM membership_orders WHERE status='refunded' AND updated_at >= ?`
  ).get(from).n;
}

module.exports = {
  computeHealth,
  funnelMetrics,
  revenueWindows,
  expiringMembers,
  recentRefunds,
  maskPhone,
  loadScheduleRows,
};
