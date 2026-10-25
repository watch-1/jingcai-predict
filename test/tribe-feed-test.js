// node test/tribe-feed-test.js [BASE]
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
  const phone = '198' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const pw = 'TribeFeed9x';
  let tok = null;
  const tribeId = 'epl-382';
  try {
    let r = await call('POST', '/auth/register', { phone, password: pw, nickname: '部落帖', agree: true });
    ok(r.s === 201, 'register'); tok = r.j.token;
    r = await call('GET', '/tribe/' + tribeId + '/feed?ensure=1&teamId=382&teamName=' + encodeURIComponent('曼城'), undefined, tok);
    ok(r.s === 200 && Array.isArray(r.j.posts), 'feed list');
    r = await call('POST', '/tribe/' + tribeId + '/posts', { body: '测试圈内发帖 ' + Date.now() }, tok);
    ok(r.s === 201 && r.j.post && r.j.post.id, 'create text post');
    const postId = r.j.post.id;
    const imgBuf = Buffer.alloc(210 * 1024, 0xff);
    imgBuf[0] = 0xff; imgBuf[1] = 0xd8;
    r = await call('POST', '/tribe/upload', { mime: 'image/jpeg', data: imgBuf.toString('base64') }, tok);
    ok(r.s === 200 && r.j.url && String(r.j.url).includes('/api/tribe/media/'), 'upload ~210KB jpeg');
    const imgUrl = r.j.url;
    r = await call('POST', '/tribe/' + tribeId + '/posts', { body: '图文帖 ' + Date.now(), images: [imgUrl] }, tok);
    ok(r.s === 201 && r.j.post && r.j.post.images && r.j.post.images.length === 1, 'create image post');
    r = await call('GET', '/tribe/posts/' + postId, undefined, tok);
    ok(r.s === 200 && r.j.post.body.includes('测试圈内发帖'), 'get post');
    r = await call('POST', '/tribe/posts/' + postId + '/replies', { body: '沙发' }, tok);
    ok(r.s === 201 && r.j.reply && r.j.reply.body === '沙发', 'reply');
    r = await call('GET', '/tribe/posts/' + postId + '/replies', undefined, tok);
    ok(r.s === 200 && r.j.replies.length >= 1, 'list replies');
    const replyId = r.j.replies[0].id;
    r = await call('POST', '/tribe/posts/' + postId + '/reactions', { kind: 'like' }, tok);
    ok(r.s === 200 && r.j.reactions && r.j.reactions.like === 1 && Array.isArray(r.j.myReactions) && r.j.myReactions.includes('like'), 'post reaction toggle on');
    r = await call('POST', '/tribe/posts/' + postId + '/reactions', { kind: 'fire' }, tok);
    ok(r.s === 200 && r.j.reactions.like === 1 && r.j.reactions.fire === 1 && r.j.myReactions.includes('like') && r.j.myReactions.includes('fire'), 'multi reactions coexist');
    r = await call('POST', '/tribe/posts/' + postId + '/reactions', { kind: 'like' }, tok);
    ok(r.s === 200 && r.j.reactions.like === 0 && r.j.reactions.fire === 1 && !r.j.myReactions.includes('like') && r.j.myReactions.includes('fire'), 'toggle one kind off');
    r = await call('POST', '/tribe/posts/' + postId + '/reactions', { kind: 'fire' }, tok);
    ok(r.s === 200 && r.j.reactions.fire === 0 && r.j.myReactions.length === 0, 'post reaction toggle off');
    r = await call('POST', '/tribe/replies/' + replyId + '/like', {}, tok);
    ok(r.s === 200 && r.j.likeCount === 1 && r.j.myLiked, 'reply like on');
    r = await call('POST', '/tribe/replies/' + replyId + '/like', {}, tok);
    ok(r.s === 200 && r.j.likeCount === 0 && !r.j.myLiked, 'reply like off');
    r = await call('GET', '/tribe/' + tribeId + '/feed?limit=5', undefined, tok);
    const fp = (r.j.posts || []).find((p) => p.id === postId);
    ok(fp && fp.reactions, 'feed posts include reactions');
    r = await call('POST', '/tribe/' + tribeId + '/feed/ensure-match', { teamId: '382', teamName: '曼城' }, tok);
    ok(r.s === 200 && r.j.ok, 'ensure-match endpoint');
    r = await call('GET', '/tribe/' + tribeId + '/feed?ensure=1&teamId=382&teamName=' + encodeURIComponent('曼城'), undefined, tok);
    const mv = (r.j.posts || []).filter((p) => p.kind === 'match_vote');
    ok(mv.length <= 1, 'at most one match_vote post per ensure');
    if (mv[0]) {
      const vr = await call('POST', '/tribe/posts/' + mv[0].id + '/vote', { choice: 'win' }, tok);
      ok(vr.s === 200 && vr.j.vote && vr.j.vote.myVote === 'win' && vr.j.vote.canVote === false, 'tribe perspective vote');
      const vr2 = await call('POST', '/tribe/posts/' + mv[0].id + '/vote', { choice: 'draw' }, tok);
      ok(vr2.s === 409, 'tribe vote locked after first cast');
    }
    const phone2 = '199' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    const r2 = await call('POST', '/auth/register', { phone: phone2, password: pw, nickname: '路人', agree: true });
    const tok2 = r2.j && r2.j.token;
    if (tok2) {
      const deny = await call('DELETE', '/tribe/posts/' + postId, undefined, tok2);
      ok(deny.s === 403, 'non-author cannot delete post');
      const denyR = await call('DELETE', '/tribe/replies/' + replyId, undefined, tok2);
      ok(denyR.s === 403, 'non-author cannot delete reply');
    }
    r = await call('DELETE', '/tribe/replies/' + replyId, undefined, tok);
    ok(r.s === 200 && r.j.ok, 'author delete reply');
    r = await call('GET', '/tribe/posts/' + postId + '/replies', undefined, tok);
    ok(r.s === 200 && !(r.j.replies || []).some((x) => x.id === replyId), 'reply gone after delete');
    r = await call('DELETE', '/tribe/posts/' + postId, undefined, tok);
    ok(r.s === 200 && r.j.ok, 'author delete post');
    r = await call('GET', '/tribe/posts/' + postId, undefined, tok);
    ok(r.s === 404, 'post 404 after delete');
  } finally {
    if (tok) await call('DELETE', '/me', { password: pw }, tok);
  }
  if (fails) process.exit(1);
  console.log('tribe-feed-test OK');
})();
