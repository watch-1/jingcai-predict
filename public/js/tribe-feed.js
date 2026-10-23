/**
 * Tribe club feed UI (1.9.168). Depends on globals from app.js: api, esc, loggedIn, toast, go, badge, S, route, render, avatarHtml, timeAgo.
 */
(function (global) {
  'use strict';

  const MAX_IMAGES = 9;
  const pendingUploads = [];

  function fmtTime(ts) {
    if (typeof global.timeAgo === 'function') return global.timeAgo(ts);
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function authorRow(a) {
    const av = typeof global.avatarHtml === 'function' ? global.avatarHtml(a.avatar, 'sm') : '';
    return `<div class="tf-author">${av}<span class="tf-nick">${esc(a.nickname || '球迷')}</span></div>`;
  }

  function esc(s) {
    return typeof global.esc === 'function' ? global.esc(s) : String(s || '');
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

  function badge(name, cls, logo) {
    return typeof global.badge === 'function' ? global.badge(name, cls, logo) : '';
  }

  function imagesHtml(images) {
    if (!images || !images.length) return '';
    const cls = images.length === 1 ? 'tf-imgs one' : 'tf-imgs';
    return `<div class="${cls}">${images.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`;
  }

  function postCard(post, { detail } = {}) {
    const pin = post.pinned ? '<span class="tf-pin">置顶</span>' : '';
    const kind = post.kind === 'match_vote' ? 'tf-card--match' : '';
    const textBody = post.kind !== 'match_vote' && post.body
      ? `<p class="tf-body">${esc(post.body).replace(/\n/g, '<br>')}</p>` : '';
    const replies = post.replyCount > 0 ? `<span class="tf-replies">${post.replyCount} 回复</span>` : '';
    const foot = detail ? '' : `<div class="tf-card-foot">${replies}<span class="tf-more">看帖</span></div>`;
    const vote = post.kind === 'match_vote' ? voteBlock(post) : '';
    const tag = post.kind === 'match_vote' ? '<span class="tf-tag">今日比赛</span>' : '';
    return `<article class="tf-card ${kind}" data-post="${post.id}">
      <div class="tf-card-hd">${authorRow(post.author)}${pin}${tag}<time class="tf-time">${fmtTime(post.createdAt)}</time></div>
      ${vote}
      ${textBody}
      ${post.kind !== 'match_vote' ? imagesHtml(post.images) : ''}
      ${foot}
    </article>`;
  }

  function composeBar(tribeId) {
    return `<div class="tf-compose-bar">
      <button type="button" class="tf-compose-btn" data-act="tribeComposeOpen" data-tribe="${esc(tribeId)}">发帖…</button>
    </div>`;
  }

  async function loadFeed(tribeId, teamMeta) {
    const q = new URLSearchParams({ ensure: '1', limit: '40' });
    if (teamMeta && teamMeta.teamId) q.set('teamId', teamMeta.teamId);
    if (teamMeta && teamMeta.nameZh) q.set('teamName', teamMeta.nameZh);
    const j = await api('/tribe/' + encodeURIComponent(tribeId) + '/feed?' + q.toString(), { timeout: 15000 });
    return (j && j.posts) || [];
  }

  function patchFeedList(posts) {
    const el = document.getElementById('tribe-feed-list');
    if (!el) return;
    if (!posts.length) {
      el.innerHTML = '<p class="tribe-feed-empty">还没有动态，来发第一条吧。</p>';
      return;
    }
    el.innerHTML = posts.map((p) => postCard(p)).join('');
  }

  function mountClubFeed(tribeId, teamMeta) {
    const root = document.getElementById('tribe-feed-root');
    if (!root) return;
    const list = document.getElementById('tribe-feed-list');
    if (list) list.innerHTML = '<div class="spinner" style="margin:24px auto"></div>';
    loadFeed(tribeId, teamMeta).then((posts) => {
      if (route().name !== 'tribe-club' || String(route().arg) !== String(tribeId)) return;
      S.tribeFeedCache = S.tribeFeedCache || {};
      S.tribeFeedCache[tribeId] = posts;
      patchFeedList(posts);
    }).catch(() => {
      const el = document.getElementById('tribe-feed-list');
      if (el) el.innerHTML = '<p class="tribe-feed-empty">加载失败，请下拉刷新重试。</p>';
    });
  }

  function openCompose(tribeId) {
    if (!loggedIn()) { toast('登录后可发帖'); return go('#/login'); }
    const sheet = document.getElementById('sheet');
    if (!sheet) return;
    pendingUploads.length = 0;
    sheet.innerHTML = `<div class="sheet tribe-compose-sheet">
      <div class="sheet-hd"><h3>发帖</h3><button type="button" class="btn ghost sm" data-act="closeSheet">关闭</button></div>
      <textarea id="tribe-compose-body" class="tf-compose-input" maxlength="2000" placeholder="说点什么…" rows="4"></textarea>
      <div id="tribe-compose-previews" class="tf-compose-previews"></div>
      <div class="tf-compose-actions">
        <label class="btn ghost sm tf-pick-img"><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden id="tribe-compose-files">添加图片</label>
        <button type="button" class="btn pri sm" data-act="tribeComposeSubmit" data-tribe="${esc(tribeId)}">发布</button>
      </div>
      <p class="note">最多 ${MAX_IMAGES} 张图，单张不超过 2MB。</p>
    </div>`;
    sheet.classList.remove('hidden');
    const inp = document.getElementById('tribe-compose-files');
    if (inp) inp.addEventListener('change', onPickImages);
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
      closeSheet();
      toast('已发布');
      mountClubFeed(tribeId, S.tribeFeedTeamMeta && S.tribeFeedTeamMeta[tribeId]);
    } catch (e) {
      toast(e.message || '发布失败');
    }
  }

  function pagePostDetail(postId) {
    return hdr('帖子', { back: true }) + `<div id="tribe-post-detail" class="pad-card tf-detail"><div class="spinner"></div></div>` + foot();
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
      let h = postCard(post, { detail: true });
      h += `<div class="tf-reply-hd">回复 <small>${replies.length}</small></div>`;
      h += `<div class="tf-replies-list">${replies.map((r) =>
        `<div class="tf-reply">${authorRow(r.author)}<p>${esc(r.body)}</p><time>${fmtTime(r.createdAt)}</time></div>`
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
          tmp.innerHTML = postCard(post);
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
    if (act === 'tribeComposeSubmit') { submitCompose(el.dataset.tribe); return true; }
    if (act === 'tribeComposeRm') {
      pendingUploads.splice(parseInt(el.dataset.i, 10), 1);
      renderPreviews();
      return true;
    }
    if (act === 'tribeReply') { submitReply(el.dataset.post); return true; }
    if (act === 'tribeVote') { castVote(el.dataset.post, el.dataset.choice, el.dataset.mid); return true; }
    return false;
  }

  function onFeedClick(ev) {
    const card = ev.target.closest('.tf-card');
    if (!card || ev.target.closest('[data-act]')) return;
    const id = card.dataset.post;
    if (id) go('#/tribe-post/' + id);
  }

  global.JCTribeFeed = {
    mountClubFeed,
    pagePostDetail,
    loadPostDetail,
    onClick,
    onFeedClick,
    postCard,
    composeBar,
  };
})(typeof window !== 'undefined' ? window : global);
