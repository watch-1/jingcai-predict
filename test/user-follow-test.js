// node test/user-follow-test.js [BASE]
'use strict';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8088';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FAIL', m); if (!c) fails++; };
async function call(method, path, body, token) {
  const h = {};
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch { }
  return { s: r.status, j };
}
(async () => {
  const phoneA = '196' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const phoneB = '195' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'FollowTest9x';
  let tokA = null; let tokB = null; let idB = null;
  try {
    let r = await call('POST', '/auth/register', { phone: phoneA, password: pw, nickname: '甲球迷', agree: true });
    ok(r.s === 201, 'register A'); tokA = r.j.token;
    r = await call('POST', '/auth/register', { phone: phoneB, password: pw, nickname: '乙球迷', avatar: 'a2', agree: true });
    ok(r.s === 201, 'register B'); tokB = r.j.token; idB = r.j.user.id;
    r = await call('GET', '/user-follows/following', undefined, tokA);
    ok(r.s === 200 && Array.isArray(r.j.users) && r.j.users.length === 0, 'empty following');
    r = await call('PUT', '/user-follows/' + idB, undefined, tokA);
    ok(r.s === 200 && r.j.following === true, 'follow B');
    r = await call('GET', '/user-follows/is-following/' + idB, undefined, tokA);
    ok(r.s === 200 && r.j.following === true, 'is-following true');
    r = await call('GET', '/user-follows/following', undefined, tokA);
    ok(r.s === 200 && r.j.users.length === 1 && r.j.users[0].userId === idB && r.j.users[0].nickname === '乙球迷', 'following list has B');
    r = await call('GET', '/user-follows/followers', undefined, tokB);
    ok(r.s === 200 && r.j.users.length === 1 && r.j.users[0].nickname === '甲球迷', 'B sees follower A');
    r = await call('GET', '/me', undefined, tokA);
    ok(r.s === 200 && r.j.counts.userFollowing === 1, 'me counts userFollowing');
    r = await call('PUT', '/user-follows/' + idB, undefined, tokA);
    ok(r.s === 200, 'follow again idempotent');
    const meA = await call('GET', '/me', undefined, tokA);
    r = await call('PUT', '/user-follows/' + meA.j.user.id, undefined, tokA);
    ok(r.s === 400, 'block self-follow');
    r = await call('DELETE', '/user-follows/' + idB, undefined, tokA);
    ok(r.s === 200 && r.j.following === false, 'unfollow B');
    r = await call('GET', '/user-follows/following', undefined, tokA);
    ok(r.s === 200 && r.j.users.length === 0, 'empty after unfollow');
  } finally {
    if (tokA) await call('DELETE', '/me', { password: pw }, tokA);
    if (tokB) await call('DELETE', '/me', { password: pw }, tokB);
  }
  if (fails) process.exit(1);
  console.log('user-follow-test OK');
})();
