// node test/tribe-follow-test.js [BASE]
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
  const phone = '197' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'TribeTest9x';
  let tok = null;
  try {
    let r = await call('POST', '/auth/register', { phone, password: pw, nickname: '部落测', agree: true });
    ok(r.s === 201, 'register'); tok = r.j.token;
    r = await call('GET', '/tribe-follows', undefined, tok);
    ok(r.s === 200 && Array.isArray(r.j.tribeFollows) && r.j.tribeFollows.length === 0, 'empty tribe follows');
    const snap = { tribeId: 'epl-382', nameZh: '曼城', leagueKey: 'epl', leagueZh: '英超', teamId: '382', logo: '', savedAt: Date.now() };
    r = await call('PUT', '/tribe-follows/epl-382', snap, tok);
    ok(r.s === 200 && r.j.ok, 'put tribe follow');
    r = await call('GET', '/tribe-follows', undefined, tok);
    ok(r.s === 200 && r.j.tribeFollows.length === 1 && r.j.tribeFollows[0].tribeId === 'epl-382', 'list after put');
    r = await call('GET', '/me', undefined, tok);
    ok(r.s === 200 && r.j.counts.tribeFollows === 1, 'me counts tribeFollows');
    r = await call('DELETE', '/tribe-follows/epl-382', undefined, tok);
    ok(r.s === 200, 'delete tribe follow');
    r = await call('POST', '/sync', { plans: [], favorites: [], tribeFollows: [snap] }, tok);
    ok(r.s === 200 && r.j.tribeFollows.length === 1, 'sync merge tribeFollows');
    r = await call('PUT', '/tribe-follows/bad:id', snap, tok);
    ok(r.s === 400, 'reject invalid tribe id');
  } finally {
    if (tok) await call('DELETE', '/me', { password: pw }, tok);
  }
  if (fails) process.exit(1);
  console.log('tribe-follow-test OK');
})();
