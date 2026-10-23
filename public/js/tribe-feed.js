/**
 * Tribe club feed UI (1.9.170). Depends on globals from app.js: api, esc, loggedIn, toast, go, back, badge, S, route, render, avatarHtml, timeAgo, isTribeFollow.
 */
(function (global) {
  'use strict';

  const MAX_IMAGES = 9;
  const BODY_PREVIEW = 140;
  const DRAFT_LS = 'jc_tribe_compose_draft_v1';
  const pendingUploads = [];
  let composeTribeId = '';
  let draftSaveTimer = null;

  function fmtTime(ts) {
    if (typeof global.timeAgo === 'function') return global.timeAgo(ts);
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function esc(s) {
    return typeof global.esc === 'function' ? global.esc(s) : String(s || '');
  }

  function badge(name, cls, logo) {
    return typeof global.badge === 'function' ? global.badge(name, cls, logo) : '';
  }

  function feedUi() {
    S.tribeFeedUi = S.tribeFeedUi || { tab: 'latest', sort: 'reply' };
    return S.tribeFeedUi;
  }

  function isFeaturedPost(p) {
    return !!(p.pinned || p.kind === 'match_vote');
  }

  function sortPosts(posts, sort) {
    const pinned = [];
    const rest = [];
    for (const p of posts) {
      if (p.pinned) pinned.push(p);
      else rest.push(p);
    }
    const cmp = sort === 'reply'
      ? (a, b) => (b.replyCount || 0) - (a.replyCount || 0) || (b.createdAt || 0) - (a.createdAt || 0)
      : (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
    rest.sort(cmp);
    return [...pinned, ...rest];
  }

  function filterPosts(posts) {
    const ui = feedUi();
    let list = (posts || []).slice();
    if (ui.tab === 'featured') list = list.filter(isFeaturedPost);
    return sortPosts(list, ui.sort);
  }

  function authorRow(a, metaExtra) {
    const av = typeof global.avatarHtml === 'function' ? global.avatarHtml(a.avatar, 'sm') : '';
    const meta = metaExtra ? esc(metaExtra) : '';
    return `<div class="tf-author">${av}<div class="tf-author-txt"><span class="tf-nick">${esc(a.nickname || '球迷')}</span>${meta ? `<span class="tf-meta-line">${meta}</span>` : ''}</div></div>`;
  }

  function followPill(tribeId) {
    if (typeof global.isTribeFollow === 'function' && global.isTribeFollow(tribeId)) return '';
    return `<button type="button" class="tf-follow" data-act="tribeFollow" data-id="${esc(tribeId)}">关注</button>`;
  }

  function voteBlock(post) {
    const v = post.vote;
    const m = post.match || {};
    if (!v) return '';
    const total = v.total || 0;
    const pct = (k) => (total ? ((v.counts[k] / total) * 100) : 0);
    const mine = v.myVote;
    const mid = post.matchId || m.matchId;
    return `<div class="tf-match-card">
      <div class="tf-match-meta">${esc(m.league || '')} · ${esc(m.date || '')} ${esc(m.time || '')}</div>
      <div class="tf-match-teams">
        ${badge(m.home, 'sm', m.homeLogo)}<span class="tf-vs">${esc(m.home)} vs ${esc(m.away)}</span>${badge(m.away, 'sm', m.awayLogo)}
      </div>
      <p class="tf-match-hint">本场态度（每人一票，可改选）</p>
      <div class="vote-bars tf-vote-bars">${['win', 'draw', 'loss'].map((k) => {
        const p = pct(k);
        return `<div class="vote-row ${mine === k ? 'mine' : ''}"><div class="vote-lab">${esc(v.labels[k])}</div>
          <div class="vote-track"><i class="${k === 'win' ? 'h' : k === 'draw' ? 'd' : 'a'}" style="width:${Math.max(p, total ? 2 : 0)}%"></i></div>
          <div class="vote-pct num">${p.toFixed(0)}%</div></div>`;
      }).join('')}</div>
      <div class="vote-btns">${['win', 'draw', 'loss'].map((k) =>
        `<button type="button" class="vote-btn ${mine === k ? 'on' : ''}" data-act="tribeVote" data-post="${post.id}" data-mid="${esc(mid)}" data-choice="${k}">${esc(v.labels[k])}</button>`
      ).join('')}</div>
    </div>`;
  }

  function imagesHtml(images) {
    if (!images || !images.length) return '';
    const cls = images.length === 1 ? 'tf-imgs one' : 'tf-imgs';
    return `<div class="${cls}">${images.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`;
  }

  function bodyHtml(post) {
    if (post.kind === 'match_vote' || !post.body) return '';
    const raw = String(post.body);
    const plain = raw.replace(/\s+/g, ' ');
    if (plain.length <= BODY_PREVIEW) {
      return `<p class="tf-body">${esc(post.body).replace(/\n/g, '<br>')}</p>`;
    }
    const short = plain.slice(0, BODY_PREVIEW);
    return `<p class="tf-body">${esc(short)}… <button type="button" class="tf-fulltxt" data-act="tribePostOpen" data-post="${post.id}">全文</button></p>`;
  }

  function reactionsPlaceholder() {
    return `<div class="tf-react" aria-hidden="true"><span class="tf-react-b">😂</span><span class="tf-react-b">👍</span><span class="tf-react-b">🔥</span></div>`;
  }

  function postCard(post, { detail, tribeId } = {}) {
    const tid = tribeId || post.tribeId || '';
    const essence = (post.pinned || post.kind === 'match_vote')
      ? '<span class="tf-essence">精华</span>' : '';
    const kind = post.kind === 'match_vote' ? 'tf-card--match' : '';
    const vote = post.kind === 'match_vote' ? voteBlock(post) : '';
    const titleLine = post.kind === 'match_vote' && post.body
      ? `<p class="tf-title-line">${essence}${esc(post.body.split('\n')[0] || '今日比赛')}</p>` : '';
    const textBody = post.kind !== 'match_vote' ? bodyHtml(post) : '';
    const imgs = post.kind !== 'match_vote' ? imagesHtml(post.images) : '';
    const rc = post.replyCount || 0;
    const foot = detail ? '' : `<div class="tf-card-foot">
      ${reactionsPlaceholder()}
      <div class="tf-stat">
        <span class="tf-stat-i">${rc > 0 ? rc + ' 评论' : '评论'}</span>
        <span class="tf-stat-i tf-like">赞</span>
      </div>
    </div>`;
    const follow = detail ? '' : followPill(tid);
    const time = fmtTime(post.createdAt);
    return `<article class="tf-card ${kind}" data-post="${post.id}">
      <div class="tf-card-hd">
        ${authorRow(post.author, time)}
        ${follow}
      </div>
      ${titleLine || (essence && post.kind !== 'match_vote' ? `<div class="tf-essence-row">${essence}</div>` : '')}
      ${vote}
      ${textBody}
      ${imgs}
      ${foot}
    </article>`;
  }

  function clubFeedShell(tribeId, ui) {
    ui = ui || feedUi();
    const tabLatest = ui.tab !== 'featured';
    const sortReply = ui.sort === 'reply';
    return `<div class="tribe-club-body" id="tribe-feed-root">
      <nav class="tribe-club-subnav" aria-label="圈子筛选">
        <div class="tribe-club-tabs">
          <button type="button" class="tribe-club-tab${tabLatest ? ' on' : ''}" data-act="tribeFeedTab" data-tab="latest">最新</button>
          <button type="button" class="tribe-club-tab${!tabLatest ? ' on' : ''}" data-act="tribeFeedTab" data-tab="featured">精华</button>
        </div>
        <div class="tribe-club-sub-r">
          <button type="button" class="tribe-club-sort${sortReply ? ' on' : ''}" data-act="tribeFeedSort" data-sort="reply">按最新回复</button>
          <button type="button" class="tribe-club-list-ic" data-act="tribeFeedSort" data-sort="time" aria-label="按发帖时间" title="按发帖时间">${sortReply ? '≡' : '☰'}</button>
        </div>
      </nav>
      <div class="tribe-club-scroll">
        <div id="tribe-feed-list" class="tribe-feed-list"><div class="spinner" style="margin:24px auto"></div></div>
      </div>
    </div>`;
  }

  async function loadFeed(tribeId, teamMeta) {
    const q = new URLSearchParams({ ensure: '1', limit: '40' });
    if (teamMeta && teamMeta.teamId) q.set('teamId', teamMeta.teamId);
    if (teamMeta && teamMeta.nameZh) q.set('teamName', teamMeta.nameZh);
    const j = await api('/tribe/' + encodeURIComponent(tribeId) + '/feed?' + q.toString(), { timeout: 15000 });
    return (j && j.posts) || [];
  }

  function patchFeedList(posts, tribeId) {
    const el = document.getElementById('tribe-feed-list');
    if (!el) return;
    const list = filterPosts(posts);
    if (!list.length) {
      const ui = feedUi();
      const msg = ui.tab === 'featured' ? '暂无精华帖，比赛态度帖与置顶会出现在这里。' : '还没有动态，来发第一条吧。';
      el.innerHTML = `<p class="tribe-feed-empty">${msg}</p>`;
      return;
    }
    el.innerHTML = list.map((p) => postCard(p, { tribeId })).join('');
  }

  function syncSubnavUi() {
    const ui = feedUi();
    document.querySelectorAll('[data-act="tribeFeedTab"]').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.tab === ui.tab);
    });
    const sortReply = ui.sort === 'reply';
    document.querySelectorAll('[data-act="tribeFeedSort"]').forEach((btn) => {
      if (btn.classList.contains('tribe-club-sort')) btn.classList.toggle('on', sortReply);
    });
    const ic = document.querySelector('.tribe-club-list-ic');
    if (ic) ic.textContent = sortReply ? '≡' : '☰';
  }

  function mountClubFeed(tribeId, teamMeta) {
    const list = document.getElementById('tribe-feed-list');
    if (list) list.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';
    loadFeed(tribeId, teamMeta).then((posts) => {
      if (route().name !== 'tribe-club' || String(route().arg) !== String(tribeId)) return;
      S.tribeFeedCache = S.tribeFeedCache || {};
      S.tribeFeedCache[tribeId] = posts;
      patchFeedList(posts, tribeId);
    }).catch(() => {
      const el = document.getElementById('tribe-feed-list');
      if (el) el.innerHTML = '<p class="tribe-feed-empty">加载失败，请点右下角刷新重试。</p>';
    });
  }

  function refreshFeed(tribeId) {
    const meta = (S.tribeFeedTeamMeta && S.tribeFeedTeamMeta[tribeId]) || {};
    mountClubFeed(tribeId, meta);
    toast('刷新中…');
  }

  function setFeedTab(tab) {
    feedUi().tab = tab === 'featured' ? 'featured' : 'latest';
    syncSubnavUi();
    const tid = route().arg;
    const posts = (S.tribeFeedCache && S.tribeFeedCache[tid]) || [];
    patchFeedList(posts, tid);
  }

  function setFeedSort(sort) {
    feedUi().sort = sort === 'time' ? 'time' : 'reply';
    syncSubnavUi();
    const tid = route().arg;
    const posts = (S.tribeFeedCache && S.tribeFeedCache[tid]) || [];
    patchFeedList(posts, tid);
  }

  function draftStorageKey(tribeId) {
    return DRAFT_LS + ':' + String(tribeId || '');
  }

  function readDraft(tribeId) {
    try {
      const raw = localStorage.getItem(draftStorageKey(tribeId));
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      return {
        body: typeof d.body === 'string' ? d.body : '',
        images: Array.isArray(d.images) ? d.images.filter((x) => x && x.data) : [],
      };
    } catch (_) { return null; }
  }

  function writeDraft(tribeId) {
    if (!tribeId) return;
    const bodyEl = document.getElementById('tribe-compose-body');
    const body = bodyEl ? bodyEl.value : '';
    const images = pendingUploads.map((p) => ({ mime: p.mime || 'image/jpeg', data: p.data }));
    try {
      if (!body.trim() && !images.length) {
        localStorage.removeItem(draftStorageKey(tribeId));
        return;
      }
      localStorage.setItem(draftStorageKey(tribeId), JSON.stringify({ body, images, savedAt: Date.now() }));
    } catch (_) {}
  }

  function clearDraft(tribeId) {
    try { localStorage.removeItem(draftStorageKey(tribeId)); } catch (_) {}
  }

  function scheduleDraftSave(tribeId) {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => writeDraft(tribeId), 280);
  }

  function openCompose(tribeId) {
    if (!loggedIn()) { toast('登录后可发帖'); return go('#/login'); }
    go('#/tribe-compose/' + encodeURIComponent(tribeId));
  }

  function pageCompose(tribeId, teamName) {
    return `<div class="tribe-compose-page" data-tribe="${esc(tribeId)}">
      <header class="tribe-compose-hdr">
        <button type="button" class="tribe-compose-cancel" data-act="tribeComposeCancel" data-tribe="${esc(tribeId)}">取消</button>
        <h1 class="tribe-compose-title">发布帖子</h1>
        <button type="button" class="tribe-compose-pub" data-act="tribeComposeSubmit" data-tribe="${esc(tribeId)}">发布</button>
      </header>
      <div class="tribe-compose-main">
        <textarea id="tribe-compose-body" class="tribe-compose-body" maxlength="2000" placeholder="输入内容：默认第一段内容为标题" rows="8"></textarea>
        <div id="tribe-compose-previews" class="tf-compose-previews"></div>
      </div>
      <div class="tribe-compose-toolbar" aria-label="发帖工具">
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="表情">😊</button>
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="@">@</button>
        <label class="tribe-compose-tb tf-pick-img" title="添加图片">
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden id="tribe-compose-files">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5.5-5.5a2 2 0 00-2.8 0L3 18"/></svg>
        </label>
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="视频">▶</button>
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="球场">⚽</button>
      </div>
      <p class="tribe-compose-hint note">最多 ${MAX_IMAGES} 张图，单张不超过 2MB。${teamName ? '发布到「' + esc(teamName) + '」圈子' : ''}</p>
    </div>`;
  }

  function mountCompose(tribeId) {
    composeTribeId = String(tribeId || '');
    pendingUploads.length = 0;
    const draft = readDraft(composeTribeId);
    if (draft) {
      pendingUploads.push(...draft.images.map((img) => ({
        mime: img.mime || 'image/jpeg',
        data: img.data,
        preview: 'data:' + (img.mime || 'image/jpeg') + ';base64,' + img.data,
      })));
      const bodyEl = document.getElementById('tribe-compose-body');
      if (bodyEl) bodyEl.value = draft.body || '';
    }
    renderPreviews();
    const bodyEl = document.getElementById('tribe-compose-body');
    if (bodyEl) {
      bodyEl.addEventListener('input', () => scheduleDraftSave(composeTribeId));
      setTimeout(() => { try { bodyEl.focus(); } catch (_) {} }, 50);
    }
    const inp = document.getElementById('tribe-compose-files');
    if (inp) inp.addEventListener('change', onPickImages);
  }

  function cancelCompose(tribeId) {
    writeDraft(tribeId);
    pendingUploads.length = 0;
    composeTribeId = '';
    if (typeof global.back === 'function') global.back();
    else go('#/tribe-club/' + encodeURIComponent(tribeId), true);
  }

  function onPickImages(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    const room = MAX_IMAGES - pendingUploads.length;
    files.slice(0, room).forEach((file) => {
      if (file.size > 2 * 1024 * 1024) { toast('图片过大'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        pendingUploads.push({ mime: file.type, data: String(reader.result).split(',')[1] || reader.result });
        renderPreviews();
        scheduleDraftSave(composeTribeId || (route().name === 'tribe-compose' ? route().arg : ''));
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPreviews() {
    const box = document.getElementById('tribe-compose-previews');
    if (!box) return;
    box.innerHTML = pendingUploads.map((p, i) => {
      const src = p.preview || ('data:' + p.mime + ';base64,' + p.data);
      return `<div class="tf-prev"><img src="${src}" alt=""><button type="button" data-act="tribeComposeRm" data-i="${i}">×</button></div>`;
    }).join('');
    pendingUploads.forEach((p, i) => {
      if (!p.preview && p.data) {
        p.preview = 'data:' + (p.mime || 'image/jpeg') + ';base64,' + p.data;
      }
    });
  }

  async function submitCompose(tribeId) {
    const bodyEl = document.getElementById('tribe-compose-body');
    const body = bodyEl ? bodyEl.value.trim() : '';
    const urls = [];
    for (const p of pendingUploads) {
      try {
        const j = await api('/tribe/upload', { method: 'POST', body: { mime: p.mime, data: p.data }, timeout: 30000 });
        if (j && j.url) urls.push(j.url);
      } catch (e) {
        toast(e.message || '图片上传失败');
        return;
      }
    }
    if (!body && !urls.length) { toast('请输入文字或添加图片'); return; }
    try {
      await api('/tribe/' + encodeURIComponent(tribeId) + '/posts', { method: 'POST', body: { body, images: urls }, timeout: 15000 });
      clearDraft(tribeId);
      pendingUploads.length = 0;
      composeTribeId = '';
      toast('已发布');
      go('#/tribe-club/' + encodeURIComponent(tribeId), true);
      setTimeout(() => {
        if (route().name === 'tribe-club' && String(route().arg) === String(tribeId)) {
          mountClubFeed(tribeId, S.tribeFeedTeamMeta && S.tribeFeedTeamMeta[tribeId]);
          feedUi().tab = 'latest';
          syncSubnavUi();
        }
      }, 0);
    } catch (e) {
      toast(e.message || '发布失败');
    }
  }

  function postDetailHdr(title) {
    return `<header class="hdr center"><div class="hdr-side left"><button class="ic-btn" data-act="back" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button></div><h1 class="hdr-title">${esc(title)}</h1><div class="hdr-side right"><span class="ph"></span></div></header>`;
  }

  function pagePostDetail(postId) {
    return postDetailHdr('帖子') + `<div id="tribe-post-detail" class="pad-card tf-detail"><div class="spinner"></div></div>`;
  }

  async function loadPostDetail(postId) {
    const el = document.getElementById('tribe-post-detail');
    if (!el) return;
    try {
      const [pj, rj] = await Promise.all([
        api('/tribe/posts/' + encodeURIComponent(postId), { timeout: 12000 }),
        api('/tribe/posts/' + encodeURIComponent(postId) + '/replies', { timeout: 12000 }),
      ]);
      const post = pj.post;
      const replies = (rj.replies) || [];
      let h = postCard(post, { detail: true, tribeId: post.tribeId });
      h += `<div class="tf-reply-hd">回复 <small>${replies.length}</small></div>`;
      h += `<div class="tf-replies-list">${replies.map((r) =>
        `<div class="tf-reply">${authorRow(r.author, fmtTime(r.createdAt))}<p>${esc(r.body)}</p></div>`
      ).join('') || '<p class="note">暂无回复</p>'}</div>`;
      h += `<div class="tf-reply-bar">
        <input type="text" id="tribe-reply-input" maxlength="500" placeholder="${loggedIn() ? '写回复…' : '登录后回复'}" ${loggedIn() ? '' : 'disabled'}>
        <button type="button" class="btn pri sm" data-act="tribeReply" data-post="${post.id}">发送</button>
      </div>`;
      el.innerHTML = h;
      el.classList.remove('pad-card');
      el.classList.add('tf-detail-inner');
    } catch (e) {
      el.innerHTML = `<p class="tribe-feed-empty">${esc(e.message || '加载失败')}</p>`;
    }
  }

  async function submitReply(postId) {
    if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
    const inp = document.getElementById('tribe-reply-input');
    const body = inp ? inp.value.trim() : '';
    if (!body) return;
    try {
      await api('/tribe/posts/' + encodeURIComponent(postId) + '/replies', { method: 'POST', body: { body }, timeout: 12000 });
      if (inp) inp.value = '';
      toast('已回复');
      loadPostDetail(postId);
    } catch (e) { toast(e.message || '回复失败'); }
  }

  async function castVote(postId, choice, matchId) {
    if (!loggedIn()) { toast('请先登录后再投票'); return go('#/login'); }
    try {
      const j = await api('/tribe/posts/' + encodeURIComponent(postId) + '/vote', { method: 'POST', body: { choice }, timeout: 10000 });
      const card = document.querySelector('.tf-card[data-post="' + postId + '"]');
      if (card && j.vote) {
        S.tribeFeedCache = S.tribeFeedCache || {};
        const tid = route().arg;
        const posts = (S.tribeFeedCache[tid] || []).map((p) => {
          if (p.id === postId) return Object.assign({}, p, { vote: j.vote });
          return p;
        });
        S.tribeFeedCache[tid] = posts;
        const post = posts.find((p) => p.id === postId);
        if (post) {
          const tmp = document.createElement('div');
          tmp.innerHTML = postCard(post, { tribeId: tid });
          card.replaceWith(tmp.firstElementChild);
        }
      }
      if (matchId) {
        S.voteCache = S.voteCache || {};
        try {
          const mv = await api('/match-vote?matchId=' + encodeURIComponent(matchId), { timeout: 8000 });
          S.voteCache[matchId] = mv;
        } catch (_) {}
      }
      toast('已投票');
    } catch (e) { toast(e.message || '投票失败'); }
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el) return false;
    const act = el.dataset.act;
    if (act === 'tribeComposeOpen') { openCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeCancel') { cancelCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeSubmit') { submitCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeRm') {
      pendingUploads.splice(parseInt(el.dataset.i, 10), 1);
      renderPreviews();
      scheduleDraftSave(composeTribeId || el.closest('[data-tribe]')?.dataset?.tribe || route().arg);
      return true;
    }
    if (act === 'tribeReply') { submitReply(el.dataset.post); return true; }
    if (act === 'tribeVote') { castVote(el.dataset.post, el.dataset.choice, el.dataset.mid); return true; }
    if (act === 'tribeFeedRefresh') { refreshFeed(el.dataset.tribe); return true; }
    if (act === 'tribeFeedTab') { setFeedTab(el.dataset.tab); return true; }
    if (act === 'tribeFeedSort') { setFeedSort(el.dataset.sort); return true; }
    if (act === 'tribePostOpen') { go('#/tribe-post/' + el.dataset.post); return true; }
    return false;
  }

  function onFeedClick(ev) {
    if (ev.target.closest('[data-act]')) return;
    const card = ev.target.closest('.tf-card');
    if (!card) return;
    const id = card.dataset.post;
    if (id) go('#/tribe-post/' + id);
  }

  global.JCTribeFeed = {
    mountClubFeed,
    pagePostDetail,
    loadPostDetail,
    pageCompose,
    mountCompose,
    onClick,
    onFeedClick,
    postCard,
    clubFeedShell,
  };
})(typeof window !== 'undefined' ? window : global);
