/**
 * Tribe club feed UI (1.9.180). Depends on globals from app.js: api, esc, loggedIn, toast, go, back, badge, S, route, render, avatarHtml, timeAgo, isUserFollow, tribeById, API, confirmDlg.
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

  function followPill(author) {
    const uid = author && author.userId;
    if (!uid) return '';
    if (global.S && global.S.user && String(global.S.user.id) === String(uid)) return '';
    const on = typeof global.isUserFollow === 'function' && global.isUserFollow(uid);
    return `<button type="button" class="tf-follow${on ? ' on' : ''}" data-act="userFollow" data-uid="${esc(String(uid))}">${on ? '已关注' : '关注'}</button>`;
  }

  function isOwnAuthor(author) {
    return loggedIn() && global.S && global.S.user && author && author.userId
      && String(global.S.user.id) === String(author.userId);
  }

  const MORE_DOTS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';

  function moreMenuBtn(attrs) {
    return `<button type="button" class="tf-more-btn" data-act="tribeMoreOpen" ${attrs} aria-label="更多" aria-haspopup="true">${MORE_DOTS_SVG}</button>`;
  }

  function ownPostMoreBtn(post) {
    if (!isOwnAuthor(post.author) || post.kind === 'match_vote') return '';
    const tid = esc(post.tribeId || '');
    return moreMenuBtn(`data-scope="post" data-post="${post.id}" data-tribe="${tid}"`);
  }

  function ownReplyMoreBtn(r) {
    if (!isOwnAuthor(r.author)) return '';
    return moreMenuBtn(`data-scope="reply" data-reply="${r.id}" data-post="${r.postId}"`);
  }

  let moreMenuOutsideBound = false;

  function closeMoreMenu() {
    const pop = document.getElementById('tf-more-pop');
    if (pop) pop.remove();
    const mask = document.getElementById('tf-more-mask');
    if (mask) mask.remove();
    if (moreMenuOutsideBound) {
      document.removeEventListener('click', onMoreMenuOutside, true);
      moreMenuOutsideBound = false;
    }
  }

  function onMoreMenuOutside(ev) {
    if (ev.target.closest('#tf-more-pop') || ev.target.closest('.tf-more-btn')) return;
    closeMoreMenu();
  }

  function openMoreMenu(anchorBtn) {
    closeMoreMenu();
    const scope = anchorBtn.dataset.scope;
    const rect = anchorBtn.getBoundingClientRect();
    const mask = document.createElement('div');
    mask.id = 'tf-more-mask';
    mask.className = 'tf-more-mask';
    mask.setAttribute('data-act', 'tribeMoreClose');
    document.body.appendChild(mask);

    const pop = document.createElement('div');
    pop.id = 'tf-more-pop';
    pop.className = 'tf-more-pop';
    pop.setAttribute('role', 'menu');
    if (scope === 'post') {
      const tid = esc(anchorBtn.dataset.tribe || '');
      pop.innerHTML = `<button type="button" class="tf-more-item danger" role="menuitem" data-act="tribePostDelete" data-post="${esc(anchorBtn.dataset.post)}" data-tribe="${tid}">删除</button>`;
    } else if (scope === 'reply') {
      pop.innerHTML = `<button type="button" class="tf-more-item danger" role="menuitem" data-act="tribeReplyDelete" data-reply="${esc(anchorBtn.dataset.reply)}" data-post="${esc(anchorBtn.dataset.post)}">删除</button>`;
    }
    document.body.appendChild(pop);

    const popRect = pop.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.right - popRect.width;
    const pad = 8;
    left = Math.max(pad, Math.min(left, window.innerWidth - popRect.width - pad));
    if (top + popRect.height > window.innerHeight - pad) top = Math.max(pad, rect.top - popRect.height - 6);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    moreMenuOutsideBound = true;
    setTimeout(() => document.addEventListener('click', onMoreMenuOutside, true), 0);
  }

  const REACT_DEFS = [
    ['laugh', '😂'],
    ['like', '👍'],
    ['fire', '🔥'],
  ];

  function defaultReactions() {
    return { laugh: 0, like: 0, fire: 0, total: 0 };
  }

  function myReactionSet(post) {
    if (Array.isArray(post.myReactions)) return new Set(post.myReactions);
    if (post.myReaction) return new Set([post.myReaction]);
    return new Set();
  }

  function myReactionsList(post) {
    if (Array.isArray(post.myReactions)) return post.myReactions.slice();
    if (post.myReaction) return [post.myReaction];
    return [];
  }

  async function appConfirm(message, { title = '提示', confirmText = '确定', danger = false } = {}) {
    const fn = global.confirmDlg;
    if (typeof fn === 'function') return await fn(title, message, confirmText, danger);
    return false;
  }

  function reactionsHtml(post) {
    const rx = post.reactions || defaultReactions();
    const mineSet = myReactionSet(post);
    const btns = REACT_DEFS.map(([kind, emo]) => {
      const on = mineSet.has(kind);
      const n = rx[kind] || 0;
      const cnt = n > 0 ? `<span class="tf-react-n">${n}</span>` : '';
      return `<button type="button" class="tf-react-b${on ? ' on' : ''}" data-act="tribeReact" data-post="${post.id}" data-kind="${kind}" aria-label="${kind}">${emo}${cnt}</button>`;
    }).join('');
    return `<div class="tf-react">${btns}</div>`;
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


  /** Prefix relative media paths with API base (Capacitor WebView origin is not the API host). */
  function mediaUrl(u) {
    if (!u) return '';
    const s = String(u);
    if (/^https?:/i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
    const base = (typeof API !== 'undefined' && API) || (typeof global.API === 'string' ? global.API : '') || '';
    return String(base) + s;
  }

  function imagesHtml(images) {
    if (!images || !images.length) return '';
    const cls = images.length === 1 ? 'tf-imgs one' : 'tf-imgs';
    return `<div class="${cls}">${images.map((u) => `<img src="${esc(mediaUrl(u))}" alt="" loading="lazy" decoding="async">`).join('')}</div>`;
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
    const likeN = (post.reactions && post.reactions.like) || 0;
    const likeLab = likeN > 0 ? likeN + ' 赞' : '赞';
    const foot = detail ? '' : `<div class="tf-card-foot">
      ${reactionsHtml(post)}
      <div class="tf-stat">
        <span class="tf-stat-i">${rc > 0 ? rc + ' 评论' : '评论'}</span>
        <span class="tf-stat-i tf-like">${likeLab}</span>
      </div>
    </div>`;
    const follow = detail ? '' : followPill(post.author);
    const delBtn = detail ? '' : ownPostMoreBtn(post);
    const time = fmtTime(post.createdAt);
    return `<article class="tf-card ${kind}" data-post="${post.id}">
      <div class="tf-card-hd">
        ${authorRow(post.author, time)}
        <div class="tf-card-hd-r">${delBtn}${follow}</div>
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
    if (teamMeta && teamMeta.leagueKey) q.set('leagueKey', teamMeta.leagueKey);
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
        <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple id="tribe-compose-files" class="tf-compose-file-input" tabindex="-1" aria-hidden="true">
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="表情">😊</button>
        <button type="button" class="tribe-compose-tb" disabled aria-hidden="true" title="@">@</button>
        <button type="button" class="tribe-compose-tb tf-pick-img" data-act="tribeComposePick" title="添加图片" aria-label="添加图片">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5.5-5.5a2 2 0 00-2.8 0L3 18"/></svg>
        </button>
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
    bindComposeFileInput();
  }

  function bindComposeFileInput() {
    const inp = document.getElementById('tribe-compose-files');
    if (!inp) return;
    inp.onchange = onPickImages;
  }

  function pickComposeImages() {
    if (pendingUploads.length >= MAX_IMAGES) {
      toast('最多 ' + MAX_IMAGES + ' 张图');
      return;
    }
    const inp = document.getElementById('tribe-compose-files');
    if (!inp) return;
    try { inp.click(); } catch (_) {}
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
    if (!room) { toast('最多 ' + MAX_IMAGES + ' 张图'); return; }
    if (files.length > room) toast('最多 ' + MAX_IMAGES + ' 张图');
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
        const msg = e.message || '图片上传失败';
        toast(/过大|413|数据过大/i.test(msg) ? '图片过大（单张不超过 2MB）' : msg);
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

  function tribeInfoForId(tribeId) {
    const tid = String(tribeId || '');
    if (typeof global.tribeById === 'function') {
      const t = global.tribeById(tid);
      if (t) return t;
    }
    const meta = S.tribeFeedTeamMeta && S.tribeFeedTeamMeta[tid];
    if (meta) {
      return { tribeId: tid, nameZh: meta.nameZh || tid, logo: meta.logo || '', teamId: meta.teamId || '' };
    }
    const f = (S.tribeFollows || []).find((x) => x.tribeId === tid);
    if (f) return { tribeId: tid, nameZh: f.nameZh || tid, logo: f.logo || '', teamId: f.teamId || '' };
    return { tribeId: tid, nameZh: tid, logo: '', teamId: '' };
  }

  function tribeCircleLabel(nameZh) {
    const n = String(nameZh || '').trim();
    if (!n) return '球队圈子';
    return n.endsWith('圈') ? n : n + '圈';
  }

  function detailUserFollowBtn(author) {
    const uid = author && author.userId;
    if (!uid) return '';
    if (global.S && global.S.user && String(global.S.user.id) === String(uid)) return '';
    if (!loggedIn()) {
      return `<button type="button" class="tf-post-follow" data-go="#/login">+ 关注</button>`;
    }
    const on = typeof global.isUserFollow === 'function' && global.isUserFollow(uid);
    return `<button type="button" class="tf-post-follow${on ? ' on' : ''}" data-act="userFollow" data-uid="${esc(String(uid))}">${on ? '已关注' : '+ 关注'}</button>`;
  }

  function detailImagesHtml(images) {
    if (!images || !images.length) return '';
    return `<div class="tf-post-imgs">${images.map((u) =>
      `<figure class="tf-post-img"><img src="${esc(mediaUrl(u))}" alt="" loading="lazy" decoding="async"></figure>`
    ).join('')}</div>`;
  }

  function detailPostMain(post, tribe) {
    const tid = post.tribeId || tribe.tribeId;
    const av = typeof global.avatarHtml === 'function' ? global.avatarHtml(post.author.avatar, 'md') : '';
    const body = post.kind !== 'match_vote' && post.body
      ? `<div class="tf-post-text">${esc(post.body).replace(/\n/g, '<br>')}</div>` : '';
    const vote = post.kind === 'match_vote' ? voteBlock(post) : '';
    return `<article class="tf-post-main" data-post="${post.id}">
      <div class="tf-post-author">
        ${av}
        <div class="tf-post-author-txt">
          <div class="tf-post-author-name">${esc(post.author.nickname || '球迷')}</div>
          <time class="tf-post-author-time">${fmtTime(post.createdAt)}</time>
        </div>
        <div class="tf-post-author-r">${ownPostMoreBtn(post)}${detailUserFollowBtn(post.author)}</div>
      </div>
      ${vote}
      ${body}
      ${post.kind !== 'match_vote' ? detailImagesHtml(post.images) : ''}
    </article>`;
  }

  function detailAttitudeStub(n) {
    const c = Math.max(0, Number(n) || 0);
    if (!c) return '';
    return `<div class="tf-post-attitude" aria-hidden="true">
      <p class="tf-post-attitude-t">${c}人发表了态度</p>
      <div class="tf-post-attitude-ph"><span></span><span></span><span></span></div>
    </div>`;
  }

  function detailReplyItem(r) {
    const av = typeof global.avatarHtml === 'function' ? global.avatarHtml(r.author.avatar, 'sm') : '';
    const more = ownReplyMoreBtn(r);
    return `<div class="tf-huitie-item" data-reply-id="${r.id}">
      <div class="tf-huitie-hd">
        ${av}
        <div class="tf-huitie-meta">
          <span class="tf-huitie-name">${esc(r.author.nickname || '球迷')}</span>
          <time class="tf-huitie-time">${fmtTime(r.createdAt)}</time>
        </div>
        <div class="tf-huitie-actions">${more}<button type="button" class="tf-huitie-like${r.myLiked ? ' on' : ''}" data-act="tribeReplyLike" data-reply="${r.id}" aria-label="点赞">👍${(r.likeCount || 0) > 0 ? `<span class="tf-huitie-like-n">${r.likeCount}</span>` : ''}</button></div>
      </div>
      <p class="tf-huitie-body">${esc(r.body)}</p>
    </div>`;
  }

  function detailHeaderHtml(tribe) {
    const circle = tribeCircleLabel(tribe.nameZh);
    const crest = badge(tribe.nameZh, 'sm', tribe.logo);
    return `<header class="tf-post-hdr">
      <button type="button" class="tf-post-back" data-act="back" aria-label="返回">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <div class="tf-post-hdr-tribe">
        <div class="tf-post-hdr-txt">
          <div class="tf-post-hdr-name">${esc(circle)}</div>
        </div>
        ${crest}
      </div>
    </header>`;
  }

  function detailBottomBar(post) {
    const ph = loggedIn() ? '回复楼主' : '登录后回复';
    return `<footer class="tf-post-foot">
      <input type="text" id="tribe-reply-input" class="tf-post-reply-inp" maxlength="500" placeholder="${ph}" aria-label="回复楼主" ${loggedIn() ? '' : 'readonly data-go="#/login"'}>
      <button type="button" class="tf-post-reply-btn" data-act="tribeReply" data-post="${post.id}">发送</button>
    </footer>`;
  }

  function pagePostDetail(postId) {
    return `<div id="tribe-post-detail" class="tf-post-page" data-post-id="${esc(postId)}"><div class="spinner" style="margin:48px auto"></div></div>`;
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
      const tribe = tribeInfoForId(post.tribeId);
      const huitie = `<section class="tf-huitie-sec">
        <div class="tf-huitie-hd-row">
          <span class="tf-huitie-bar"></span>
          <h2 class="tf-huitie-title">回贴 <span class="tf-huitie-n">(${replies.length})</span></h2>
          <span class="tf-huitie-sort">按热门</span>
        </div>
        <div class="tf-huitie-list">${replies.map(detailReplyItem).join('') || '<p class="tf-huitie-empty">暂无回贴，来抢沙发吧</p>'}</div>
      </section>`;
      el.className = 'tf-post-page';
      el.dataset.postId = String(post.id);
      S.tribeDetailPost = post;
      el.innerHTML = detailHeaderHtml(tribe)
        + `<div class="tf-post-scroll">${detailPostMain(post, tribe)}${detailReactionsBar(post)}${detailAttitudeStub(replies.length)}${huitie}</div>`
        + detailBottomBar(post);
      const inp = document.getElementById('tribe-reply-input');
      if (inp) {
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); submitReply(post.id); }
        });
      }
    } catch (e) {
      el.innerHTML = `<header class="tf-post-hdr"><button type="button" class="tf-post-back" data-act="back" aria-label="返回"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button></header>
        <p class="tribe-feed-empty" style="padding:24px 16px">${esc(e.message || '加载失败')}</p>`;
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

  const POP_CLASSES = ['tf-pop-laugh', 'tf-pop-like', 'tf-pop-fire'];
  const POP_ANIM_MS = 720;

  function bumpReactAnim(el, kind) {
    if (!el) return Promise.resolve();
    const cls = kind === 'laugh' ? 'tf-pop-laugh' : kind === 'fire' ? 'tf-pop-fire' : 'tf-pop-like';
    el.classList.remove(...POP_CLASSES);
    void el.offsetWidth;
    el.classList.add(cls);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ev) => {
        if (ev && ev.animationName && !String(ev.animationName).includes('tf-pop') && !String(ev.animationName).includes('tf-fire')) return;
        if (settled) return;
        settled = true;
        el.classList.remove(cls);
        el.removeEventListener('animationend', finish);
        resolve();
      };
      el.addEventListener('animationend', finish);
      setTimeout(finish, POP_ANIM_MS + 100);
    });
  }

  function detailReactionsBar(post) {
    return `<div class="tf-post-react-wrap">${reactionsHtml(post)}</div>`;
  }

  function refreshDetailReactions(post) {
    const wrap = document.querySelector('.tf-post-react-wrap');
    if (!wrap || !post) return;
    wrap.innerHTML = reactionsHtml(post);
  }

  function refreshVoteUi(post, tribeId) {
    if (!post || !post.vote) return;
    const pid = String(post.id);
    const tid = tribeId ? String(tribeId) : '';
    const card = document.querySelector('.tf-card[data-post="' + pid + '"]');
    if (card && tid) {
      const tmp = document.createElement('div');
      tmp.innerHTML = postCard(post, { tribeId: tid });
      card.replaceWith(tmp.firstElementChild);
    }
    const main = document.querySelector('.tf-post-main[data-post="' + pid + '"]');
    if (!main || post.kind !== 'match_vote') return;
    const voteHtml = voteBlock(post);
    const old = main.querySelector('.tf-match-card');
    if (!old || !voteHtml) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = voteHtml;
    old.replaceWith(wrap.firstElementChild);
  }

  function paintReactionButtons(wrap, rx, myReactions) {
    if (!wrap) return;
    const mineSet = new Set(Array.isArray(myReactions) ? myReactions : (myReactions ? [myReactions] : []));
    wrap.querySelectorAll('.tf-react-b').forEach((btn) => {
      const k = btn.dataset.kind;
      btn.classList.toggle('on', mineSet.has(k));
      const n = (rx && rx[k]) || 0;
      const nEl = btn.querySelector('.tf-react-n');
      if (n > 0) {
        if (nEl) nEl.textContent = String(n);
        else btn.insertAdjacentHTML('beforeend', `<span class="tf-react-n">${n}</span>`);
      } else if (nEl) nEl.remove();
    });
  }

  function patchPostInCache(tribeId, postId, patch) {
    S.tribeFeedCache = S.tribeFeedCache || {};
    const pid = String(postId);
    const posts = (S.tribeFeedCache[tribeId] || []).map((p) => (String(p.id) === pid ? Object.assign({}, p, patch) : p));
    S.tribeFeedCache[tribeId] = posts;
    return posts.find((p) => String(p.id) === pid);
  }

  async function togglePostReaction(postId, kind, btnEl) {
    if (!loggedIn()) { toast('登录后可表态'); return go('#/login'); }
    const r = route();
    const tid = r.name === 'tribe-club' ? r.arg : '';
    const posts = (tid && S.tribeFeedCache && S.tribeFeedCache[tid]) || [];
    let post = posts.find((p) => String(p.id) === String(postId));
    if (!post && S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
      post = S.tribeDetailPost;
    }
    const prevRx = post ? Object.assign({}, post.reactions || defaultReactions()) : defaultReactions();
    const prevMine = post ? myReactionsList(post) : [];
    const nextRx = Object.assign({}, prevRx);
    const hadKind = prevMine.includes(kind);
    let nextMine;
    if (hadKind) {
      nextMine = prevMine.filter((k) => k !== kind);
      if (nextRx[kind] > 0) { nextRx[kind] -= 1; nextRx.total = Math.max(0, (nextRx.total || 0) - 1); }
    } else {
      nextMine = prevMine.concat(kind);
      nextRx[kind] = (nextRx[kind] || 0) + 1;
      nextRx.total = (nextRx.total || 0) + 1;
    }
    if (post && tid) patchPostInCache(tid, postId, { reactions: nextRx, myReactions: nextMine });
    if (post && S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
      S.tribeDetailPost = Object.assign({}, S.tribeDetailPost, { reactions: nextRx, myReactions: nextMine });
    }
    const animDone = bumpReactAnim(btnEl, kind);
    const card = document.querySelector('.tf-card[data-post="' + postId + '"]');
    const updated = post && tid ? patchPostInCache(tid, post.id, { reactions: nextRx, myReactions: nextMine }) : post;
    const repaintFeedCard = () => {
      const cardNow = document.querySelector('.tf-card[data-post="' + postId + '"]');
      const fresh = tid ? (S.tribeFeedCache[tid] || []).find((p) => String(p.id) === String(postId)) : updated;
      if (cardNow && fresh && tid) {
        const tmp = document.createElement('div');
        tmp.innerHTML = postCard(fresh, { tribeId: tid });
        cardNow.replaceWith(tmp.firstElementChild);
      }
    };
    animDone.then(repaintFeedCard);
    const detailWrap = document.querySelector('.tf-post-react-wrap');
    if (detailWrap && S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
      paintReactionButtons(detailWrap, nextRx, nextMine);
    }
    try {
      const j = await api('/tribe/posts/' + encodeURIComponent(postId) + '/reactions', { method: 'POST', body: { kind }, timeout: 10000 });
      await animDone;
      if (post && j.reactions) {
        if (tid) patchPostInCache(tid, postId, { reactions: j.reactions, myReactions: j.myReactions || [] });
        if (S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
          S.tribeDetailPost = Object.assign({}, S.tribeDetailPost, { reactions: j.reactions, myReactions: j.myReactions || [] });
          refreshDetailReactions(S.tribeDetailPost);
        }
      }
    } catch (e) {
      await animDone;
      if (post && tid) patchPostInCache(tid, postId, { reactions: prevRx, myReactions: prevMine });
      if (S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
        S.tribeDetailPost = Object.assign({}, S.tribeDetailPost, { reactions: prevRx, myReactions: prevMine });
        refreshDetailReactions(S.tribeDetailPost);
      }
      repaintFeedCard();
      toast(e.message || '表态失败');
    }
  }

  async function deletePost(postId, tribeId) {
    if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
    if (!(await appConfirm('确定删除这条帖子？删除后不可恢复。', { title: '删除帖子', confirmText: '删除', danger: true }))) return;
    try {
      await api('/tribe/posts/' + encodeURIComponent(postId), { method: 'DELETE', timeout: 12000 });
      toast('已删除');
      S.tribeDetailPost = null;
      if (tribeId) {
        S.tribeFeedCache = S.tribeFeedCache || {};
        S.tribeFeedCache[tribeId] = (S.tribeFeedCache[tribeId] || []).filter((p) => String(p.id) !== String(postId));
      }
      const backTo = tribeId ? '#/tribe-club/' + encodeURIComponent(tribeId) : '#/tribe';
      if (typeof global.back === 'function') global.back();
      else go(backTo, true);
      setTimeout(() => {
        const r = route();
        if (r.name === 'tribe-club' && tribeId && String(r.arg) === String(tribeId)) {
          mountClubFeed(tribeId, S.tribeFeedTeamMeta && S.tribeFeedTeamMeta[tribeId]);
        }
      }, 0);
    } catch (e) { toast(e.message || '删除失败'); }
  }

  async function deleteReply(replyId, postId) {
    if (!loggedIn()) { toast('请先登录'); return go('#/login'); }
    if (!(await appConfirm('确定删除这条回贴？', { title: '删除回贴', confirmText: '删除', danger: true }))) return;
    try {
      await api('/tribe/replies/' + encodeURIComponent(replyId), { method: 'DELETE', timeout: 12000 });
      toast('已删除');
      const row = document.querySelector('.tf-huitie-item[data-reply-id="' + replyId + '"]');
      if (row) row.remove();
      const nEl = document.querySelector('.tf-huitie-title .tf-huitie-n');
      if (nEl) {
        const m = nEl.textContent.match(/\((\d+)\)/);
        const n = m ? Math.max(0, parseInt(m[1], 10) - 1) : 0;
        nEl.textContent = '(' + n + ')';
      }
      if (S.tribeDetailPost && String(S.tribeDetailPost.id) === String(postId)) {
        S.tribeDetailPost = Object.assign({}, S.tribeDetailPost, {
          replyCount: Math.max(0, (S.tribeDetailPost.replyCount || 1) - 1),
        });
      }
    } catch (e) { toast(e.message || '删除失败'); }
  }

  async function toggleReplyLike(replyId, btnEl) {
    if (!loggedIn()) { toast('登录后可点赞'); return go('#/login'); }
    const on = btnEl && btnEl.classList.contains('on');
    const animDone = bumpReactAnim(btnEl, 'like');
    if (btnEl) {
      btnEl.classList.toggle('on', !on);
      const nEl = btnEl.querySelector('.tf-huitie-like-n');
      const n = parseInt(nEl && nEl.textContent, 10) || 0;
      const next = on ? Math.max(0, n - 1) : n + 1;
      if (next > 0) {
        if (nEl) nEl.textContent = String(next);
        else btnEl.insertAdjacentHTML('beforeend', `<span class="tf-huitie-like-n">${next}</span>`);
      } else if (nEl) nEl.remove();
    }
    try {
      const j = await api('/tribe/replies/' + encodeURIComponent(replyId) + '/like', { method: 'POST', body: {}, timeout: 10000 });
      await animDone;
      if (btnEl) {
        btnEl.classList.toggle('on', !!j.myLiked);
        const nEl = btnEl.querySelector('.tf-huitie-like-n');
        if ((j.likeCount || 0) > 0) {
          if (nEl) nEl.textContent = String(j.likeCount);
          else btnEl.insertAdjacentHTML('beforeend', `<span class="tf-huitie-like-n">${j.likeCount}</span>`);
        } else if (nEl) nEl.remove();
      }
    } catch (e) {
      if (btnEl) {
        btnEl.classList.toggle('on', on);
        toast(e.message || '点赞失败');
      }
    }
  }

  async function castVote(postId, choice, matchId) {
    if (!loggedIn()) { toast('请先登录后再投票'); return go('#/login'); }
    const pid = String(postId);
    const r = route();
    let tribeId = r.name === 'tribe-club' ? String(r.arg || '') : '';
    try {
      const j = await api('/tribe/posts/' + encodeURIComponent(pid) + '/vote', { method: 'POST', body: { choice }, timeout: 10000 });
      if (j.vote) {
        let post = tribeId ? patchPostInCache(tribeId, pid, { vote: j.vote }) : null;
        if (!post && S.tribeFeedCache) {
          for (const key of Object.keys(S.tribeFeedCache)) {
            const hit = (S.tribeFeedCache[key] || []).some((p) => String(p.id) === pid);
            if (hit) {
              tribeId = String(key);
              post = patchPostInCache(tribeId, pid, { vote: j.vote });
              break;
            }
          }
        }
        if (S.tribeDetailPost && String(S.tribeDetailPost.id) === pid) {
          S.tribeDetailPost = Object.assign({}, S.tribeDetailPost, { vote: j.vote });
          post = post || S.tribeDetailPost;
        }
        if (post) refreshVoteUi(post, tribeId);
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
    if (act === 'tribeComposePick') { pickComposeImages(); return true; }
    if (act === 'tribeComposeCancel') { cancelCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeSubmit') { submitCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeRm') {
      pendingUploads.splice(parseInt(el.dataset.i, 10), 1);
      renderPreviews();
      scheduleDraftSave(composeTribeId || el.closest('[data-tribe]')?.dataset?.tribe || route().arg);
      return true;
    }
    if (act === 'tribeReply') { submitReply(el.dataset.post); return true; }
    if (act === 'tribeVote') { ev.stopPropagation(); castVote(el.dataset.post, el.dataset.choice, el.dataset.mid); return true; }
    if (act === 'tribeFeedRefresh') { refreshFeed(el.dataset.tribe); return true; }
    if (act === 'tribeFeedTab') { setFeedTab(el.dataset.tab); return true; }
    if (act === 'tribeFeedSort') { setFeedSort(el.dataset.sort); return true; }
    if (act === 'tribePostOpen') { go('#/tribe-post/' + el.dataset.post); return true; }
    if (act === 'userFollow' && typeof global.toggleUserFollow === 'function') {
      const root = document.getElementById('tribe-post-detail');
      global.toggleUserFollow(el.dataset.uid, { refreshDetail: root && root.dataset.postId });
      return true;
    }
    if (act === 'tribeReact') { ev.stopPropagation(); togglePostReaction(el.dataset.post, el.dataset.kind, el); return true; }
    if (act === 'tribeReplyLike') { ev.stopPropagation(); toggleReplyLike(el.dataset.reply, el); return true; }
    if (act === 'tribeMoreOpen') { ev.stopPropagation(); openMoreMenu(el); return true; }
    if (act === 'tribeMoreClose') { ev.stopPropagation(); closeMoreMenu(); return true; }
    if (act === 'tribePostDelete') {
      ev.stopPropagation();
      closeMoreMenu();
      deletePost(el.dataset.post, el.dataset.tribe);
      return true;
    }
    if (act === 'tribeReplyDelete') {
      ev.stopPropagation();
      closeMoreMenu();
      deleteReply(el.dataset.reply, el.dataset.post);
      return true;
    }
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
