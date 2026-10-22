#!/usr/bin/env node
/** Column / forum API smoke test (1.9.78): settle + paid coins + rate limits. */
'use strict';
const BASE = process.argv[2] || 'http://127.0.0.1:8088';

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const phone = '139' + String(Date.now()).slice(-8);
  const password = 'Testcol1';
  let token = null;
  let userId = null;
  let postId = null;
  let matchPostId = null;
  try {
    const meta = await req('/column/meta');
    assert(meta.status === 200, 'meta');
    assert(Array.isArray(meta.j.topics) && meta.j.topics.includes('首发'), 'topics');
    assert(!/不提供连红|不提供.*命中率/.test(meta.j.noteZh || ''), 'disclaimer forbidding 连红 removed');
    assert(/仅供参考/.test(meta.j.noteZh || ''), 'neutral disclaimer');
    assert(!/禁止投注|出票|禁止下注|购彩代下|不提供投注/.test(meta.j.noteZh || ''), 'no ban wording');
    assert(meta.j.monetization && meta.j.monetization.paidPosts === true, 'paid posts live');
    assert(meta.j.monetization.currencyLabel === '云朵', 'currency 云朵');
    assert((meta.j.coinPacks || []).some((x) => /云朵/.test(x.label || '')), 'pack labels 云朵');
    assert(meta.j.limits && meta.j.limits.postRate && meta.j.limits.postRate.perDay >= 10, 'daily post limit >=10');
    assert(Array.isArray(meta.j.picks) && meta.j.picks.some((p) => p.id === 'H'), 'picks listed');

    const reg = await req('/auth/register', {
      method: 'POST',
      body: { phone, password, nickname: '专栏测' + phone.slice(-4), agree: true },
    });
    assert(reg.status === 201, 'register ' + JSON.stringify(reg.j));
    token = reg.j.token;
    userId = reg.j.user.id;

    const prof = await req('/column/me', {
      method: 'PUT',
      token,
      body: { bio: '关注五大联赛伤停', tags: ['伤停', '首发'] },
    });
    assert(prof.status === 200, 'profile ' + JSON.stringify(prof.j));
    assert(prof.j.author.tags.includes('伤停'), 'tags saved');
    assert(!prof.j.author.stats, 'no stats before settled picks');

    const bad = await req('/column/posts', {
      method: 'POST',
      token,
      body: { kind: 'match', body: '测试态度', topic: '分析' },
    });
    assert(bad.status === 400, 'match requires matchId');

    const fake = await req('/column/posts', {
      method: 'POST',
      token,
      body: {
        kind: 'match',
        matchId: 'settle_test_001',
        matchLabel: '结算测 主队 vs 客队',
        topic: '分析',
        body: '试图手填命中',
        pick: 'H',
        settleHit: true,
        hitRate: 99,
      },
    });
    assert(fake.status === 400, 'reject manual settle/hitRate');

    await new Promise(r => setTimeout(r, 2100));
    const g = await req('/column/posts', {
      method: 'POST',
      token,
      body: { kind: 'general', topic: '闲聊', title: '互动测', body: '这是一条互动帖。' },
    });
    assert(g.status === 201, 'general post ' + JSON.stringify(g.j));
    postId = g.j.post.id;
    assert(g.j.post.likes === 0 && g.j.post.reads === 0, 'engagement starts at 0');
    assert(!('hitRate' in g.j.post) && !('streak' in g.j.post), 'no fake tipster % fields on post');

    await new Promise(r => setTimeout(r, 2100));
    // Use a known finished match from history if available; else unsettled pick is fine
    let finishedId = 'settle_test_open_001';
    let expectSettle = false;
    try {
      const res = await req('/results');
      const row = (res.j.data || []).find((m) => m.full && (m.winFlag === 'H' || m.winFlag === 'D' || m.winFlag === 'A'));
      if (row) {
        finishedId = String(row.id);
        expectSettle = true;
      }
    } catch { /* */ }

    const pickSide = 'H';
    const m = await req('/column/posts', {
      method: 'POST',
      token,
      body: {
        kind: 'match',
        matchId: finishedId,
        matchLabel: '结算测 主队 vs 客队',
        topic: '分析',
        body: '比赛态度+胜平负表态测试。',
        pick: pickSide,
      },
    });
    assert(m.status === 201, 'match post ' + JSON.stringify(m.j));
    matchPostId = m.j.post.id;
    assert(m.j.post.pick === 'H', 'pick saved');
    if (expectSettle) {
      assert(typeof m.j.post.settleHit === 'boolean', 'auto settled when FT known');
    } else {
      assert(m.j.post.settleHit === undefined, 'no settle until FT');
    }

    // Force settle path via history id that exists in results.jsonl (2041882 = D)
    await new Promise(r => setTimeout(r, 2100));
    const hist = await req('/column/posts', {
      method: 'POST',
      token,
      body: {
        kind: 'match',
        matchId: '2041882',
        matchLabel: '曼联 vs 热刺',
        topic: '分析',
        body: '历史场次表态：选平。',
        pick: 'D',
      },
    });
    assert(hist.status === 201, 'hist pick ' + JSON.stringify(hist.j));
    // May settle immediately from results.jsonl
    if (hist.j.post.settleHit === true) {
      const authors = await req('/column/authors?limit=8');
      const me = (authors.j.authors || []).find((a) => a.userId === userId);
      assert(me, 'authors wall has me');
      assert(me.stats && me.stats.recentLabel, 'real recentLabel after settle');
      assert(!('hitRatePct' in (me.stats || {})), 'no fake pct');
    }

    const feedA = await req('/column/feed?tab=attitude');
    assert(feedA.status === 200 && (feedA.j.posts || []).some((p) => p.id === matchPostId), 'attitude feed');
    assert(!/不提供连红/.test(feedA.j.noteZh || ''), 'feed note no longer forbids 连红');
    const feedI = await req('/column/feed?tab=interact');
    assert(feedI.status === 200 && (feedI.j.posts || []).some((p) => p.id === postId), 'interact feed');

    const like = await req('/column/posts/' + postId + '/like', { method: 'POST', token });
    assert(like.status === 200 && like.j.liked === true && like.j.likes >= 1, 'like');

    const authors = await req('/column/authors?limit=8');
    assert(authors.status === 200 && (authors.j.authors || []).some((a) => a.userId === userId), 'authors wall');

    // ---- paid post + wallet (1.9.78) ----
    await new Promise(r => setTimeout(r, 1600));
    const paid = await req('/column/posts', {
      method: 'POST',
      token,
      body: {
        kind: 'match',
        matchId: 'paid_test_001',
        matchLabel: '付费测 甲 vs 乙',
        topic: '分析',
        title: '收费观点',
        body: '这是付费正文，只有购买后可见。',
        pick: 'H',
        priceCoins: 8,
      },
    });
    assert(paid.status === 201, 'paid post ' + JSON.stringify(paid.j));
    const paidId = paid.j.post.id;
    assert(paid.j.post.priceCoins === 8 && paid.j.post.paid === true, 'price saved');
    assert(paid.j.post.locked === false, 'author sees unlocked');

    const phone2 = '138' + String(Date.now()).slice(-8);
    const reg2 = await req('/auth/register', {
      method: 'POST',
      body: { phone: phone2, password, nickname: '买家' + phone2.slice(-4), agree: true },
    });
    assert(reg2.status === 201, 'buyer register');
    const token2 = reg2.j.token;

    const peek = await req('/column/posts/' + paidId, { token: token2 });
    assert(peek.status === 200 && peek.j.post.locked === true, 'buyer sees locked');
    assert(peek.j.post.body == null, 'body hidden when locked');

    const broke = await req('/column/posts/' + paidId + '/purchase', { method: 'POST', token: token2, body: {} });
    assert(broke.status === 402, 'insufficient coins ' + JSON.stringify(broke.j));

    const top = await req('/column/wallet/topup', { method: 'POST', token: token2, body: { packId: 'c100' } });
    assert(top.status === 201 && top.j.coins >= 100, 'mock topup ' + JSON.stringify(top.j));

    const buy = await req('/column/posts/' + paidId + '/purchase', { method: 'POST', token: token2, body: {} });
    assert(buy.status === 200 && buy.j.post && buy.j.post.locked === false, 'purchase unlock');
    assert(buy.j.post.body && buy.j.post.body.includes('付费正文'), 'body visible after buy');

    const authTab = await req('/column/authors/' + userId + '?tab=paid');
    assert(authTab.status === 200 && (authTab.j.posts || []).some((x) => x.id === paidId), 'author paid tab');

    const del = await req('/column/posts/' + postId, { method: 'DELETE', token });
    assert(del.status === 200, 'author delete');
    await req('/column/posts/' + paidId, { method: 'DELETE', token });

    console.log('column-test OK against', BASE);
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    if (token) {
      try {
        await req('/me', { method: 'DELETE', token, body: { password } });
      } catch { /* */ }
    }
  }
})();
