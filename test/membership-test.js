// node test/membership-test.js [BASE]
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8088';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
async function call(method, path, body, token) {
  const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json'; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { } return { s: r.status, j };
}
(async () => {
  const phone = '198' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'MemTest9x';
  let tok = null; let deleted = false;
  try {
    let r = await call('GET', '/membership/plans');
    ok(r.s === 200 && r.j.mode === 'mock' && r.j.plans?.length >= 3, 'plans catalog mock: ' + r.j.plans?.map(p => p.id).join(','));
    r = await call('POST', '/auth/register', { phone, password: pw, nickname: '会员测', agree: true });
    ok(r.s === 201, 'register'); tok = r.j.token;
    ok(r.j.user.memberActive === false, 'new user not member');
    r = await call('GET', '/membership/status', undefined, tok);
    ok(r.s === 200 && r.j.active === false, 'status inactive');
    r = await call('POST', '/membership/orders', { planId: 'month', channel: 'wechat' }, tok);
    ok(r.s === 201 && r.j.order?.status === 'pending' && r.j.mode === 'mock', 'create order ' + r.j.order?.id);
    const oid = r.j.order.id;
    r = await call('POST', '/membership/orders/' + oid + '/pay', { channel: 'wechat' }, tok);
    ok(r.s === 200 && r.j.ok && r.j.order.status === 'paid' && r.j.membership.active, 'mock pay success, until=' + r.j.membership.memberUntil);
    r = await call('GET', '/me', undefined, tok);
    ok(r.s === 200 && r.j.user.memberActive === true, 'GET /me shows member');
    r = await call('POST', '/membership/orders', { planId: 'quarter', channel: 'alipay' }, tok);
    const oid2 = r.j.order.id;
    const until1 = (await call('GET', '/membership/status', undefined, tok)).j.memberUntil;
    r = await call('POST', '/membership/orders/' + oid2 + '/pay', {}, tok);
    ok(r.s === 200 && r.j.membership.memberUntil > until1, 'renew extends membership');
    r = await call('GET', '/membership/orders', undefined, tok);
    ok(r.s === 200 && r.j.orders.length >= 2 && r.j.orders.every(o => o.mock), 'orders list');
    r = await call('POST', '/membership/orders/' + oid2 + '/pay', { useRealProvider: true }, tok);
    ok(r.s === 200 && r.j.alreadyPaid, 'repay paid order is idempotent');
    r = await call('POST', '/membership/orders', { planId: 'year', channel: 'wechat' }, tok);
    const oid3 = r.j.order.id;
    r = await call('POST', '/membership/orders/' + oid3 + '/pay', { useRealProvider: true }, tok);
    ok(r.s === 501 && r.j.code === 'PROVIDER_NOT_CONFIGURED', 'real provider stub 501');
    // still can mock-pay the pending year order
    r = await call('POST', '/membership/orders/' + oid3 + '/pay', {}, tok);
    ok(r.s === 200 && r.j.ok, 'mock pay year after stub');
    r = await call('POST', '/membership/notify/wechat', {});
    ok(r.s === 501, 'notify stub 501');
    r = await call('DELETE', '/me', { password: pw }, tok); ok(r.s === 200, 'cleanup delete'); deleted = true;
  } finally {
    if (!deleted && tok) await call('DELETE', '/me', { password: pw }, tok);
  }
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
