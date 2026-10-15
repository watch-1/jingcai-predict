// node test/api-test.js [BASE]  — end-to-end account API test (register → login → plans/favorites → logout → relogin sync
// → password change → account deletion). Creates a random test account and always deletes it at the end.
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8088';
const RATE = process.env.TEST_RATE_LIMIT === '1';
let fails = 0; const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
async function call(method, path, body, token) {
  const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json'; if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { } return { s: r.status, j };
}
(async () => {
  const phone = '199' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'Test' + Math.random().toString(36).slice(2, 8) + '9', pw2 = pw + 'x1';
  let tok = null; let deleted = false;
  try {
    let r = await call('POST', '/auth/register', { phone: '123', password: pw, agree: true }); ok(r.s === 400, 'reject bad phone: ' + r.j?.error);
    r = await call('POST', '/auth/register', { phone, password: 'short', agree: true }); ok(r.s === 400, 'reject weak password: ' + r.j?.error);
    r = await call('POST', '/auth/register', { phone, password: pw }); ok(r.s === 400, 'require agreement: ' + r.j?.error);
    r = await call('POST', '/auth/register', { phone, password: pw, nickname: '测试<b>球迷</b>', agree: true });
    ok(r.s === 201 && r.j.token && r.j.user.phone.includes('****'), `register ${phone} -> 201, masked phone ${r.j?.user?.phone}, nickname "${r.j?.user?.nickname}"`);
    tok = r.j?.token;
    r = await call('POST', '/auth/register', { phone, password: pw, agree: true }); ok(r.s === 409, 'duplicate phone -> 409');
    r = await call('POST', '/auth/login', { phone, password: 'Wrong12345' }); ok(r.s === 401, 'wrong password -> 401: ' + r.j?.error);
    r = await call('POST', '/auth/login', { phone, password: pw }); ok(r.s === 200 && r.j.token, 'login -> token'); tok = r.j.token;
    r = await call('GET', '/me', undefined, tok); ok(r.s === 200 && r.j.user.nickname, 'GET /me: ' + JSON.stringify(r.j.user));
    r = await call('GET', '/me'); ok(r.s === 401, 'GET /me without token -> 401');
    r = await call('PATCH', '/me', { nickname: '新昵称', avatar: 'a3' }, tok); ok(r.s === 200 && r.j.user.avatar === 'a3' && r.j.user.nickname === '新昵称', 'update nickname/avatar');
    r = await call('PATCH', '/me', { avatar: 'evil' }, tok); ok(r.s === 400, 'reject unknown avatar');
    const m = (await (await fetch(BASE + '/api/matches')).json()); const mt = m.data[0];
    console.log('     matches source:', m.source, '— using match', mt.id, mt.home, 'vs', mt.away);
    const plan = { id: 'test' + Date.now(), createdAt: Date.now(), types: ['单关'], mult: 1, bets: 1, cost: 2, min: 2 * mt.had.h, max: 2 * mt.had.h,
      picks: [{ matchId: mt.id, num: mt.num, home: mt.home, away: mt.away, items: [{ key: 'hadh', label: '胜', odds: mt.had.h }] }] };
    r = await call('POST', '/plans', plan, tok); ok(r.s === 201, 'save plan');
    r = await call('POST', '/plans', { id: 'x', picks: [] }, tok); ok(r.s === 400, 'reject invalid plan');
    r = await call('PUT', '/favorites/' + mt.id, { matchId: mt.id, home: mt.home, away: mt.away, date: mt.date, time: mt.time }, tok); ok(r.s === 200, 'favorite match ' + mt.id);
    r = await call('POST', '/sync', { plans: [{ ...plan, id: 'guest' + Date.now() }], favorites: [] }, tok); ok(r.s === 200 && r.j.plans.length === 2, 'sync guest plan -> 2 plans');
    r = await call('POST', '/auth/logout', undefined, tok); ok(r.s === 200, 'logout');
    r = await call('GET', '/plans', undefined, tok); ok(r.s === 401, 'old token rejected after logout');
    r = await call('POST', '/auth/login', { phone, password: pw }); tok = r.j.token; ok(r.s === 200, 'relogin');
    r = await call('GET', '/plans', undefined, tok); ok(r.s === 200 && r.j.plans.length === 2 && r.j.plans.some(p => p.id === plan.id), 'relogin: plans synced from server (' + r.j.plans.length + ')');
    r = await call('GET', '/favorites', undefined, tok); ok(r.s === 200 && r.j.favorites[0]?.matchId === mt.id, 'relogin: favorites synced from server');
    r = await call('DELETE', '/favorites/' + mt.id, undefined, tok); r = await call('GET', '/favorites', undefined, tok); ok(r.j.favorites.length === 0, 'unfavorite');
    r = await call('POST', '/me/password', { oldPassword: 'nope', newPassword: pw2 }, tok); ok(r.s === 400, 'change password rejects wrong old password');
    r = await call('POST', '/me/password', { oldPassword: pw, newPassword: pw2 }, tok); ok(r.s === 200, 'change password');
    r = await call('POST', '/auth/login', { phone, password: pw }); ok(r.s === 401, 'old password no longer works');
    r = await call('POST', '/auth/login', { phone, password: pw2 }); ok(r.s === 200, 'new password works'); tok = r.j.token;
    if (RATE) {
      let last; for (let i = 0; i < 6; i++) last = await call('POST', '/auth/login', { phone, password: 'Wrong12345' });
      ok(last.s === 429, 'login lockout after 5 failures -> 429: ' + last.j?.error);
    }
    r = await call('DELETE', '/me', { password: 'bad' }, tok); ok(r.s === 400, 'delete account requires correct password');
    r = await call('DELETE', '/me', { password: pw2 }, tok); ok(r.s === 200, 'delete account'); deleted = r.s === 200;
    r = await call('GET', '/me', undefined, tok); ok(r.s === 401, 'token invalid after deletion');
    r = await call('POST', '/auth/login', { phone, password: pw2 }); ok(r.s === 401 || r.s === 429, 'deleted account cannot log in (' + r.s + ')');
  } finally {
    if (!deleted && tok) { const r = await call('DELETE', '/me', { password: pw2 }, tok); if (r.s !== 200) await call('DELETE', '/me', { password: pw }, tok); console.log('cleanup: test account deleted'); }
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
