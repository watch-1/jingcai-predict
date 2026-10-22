(() => {
  const TOKEN_KEY = 'jingcai_admin_token';
  const TITLES = { dashboard: '总览监控', users: '用户管理', orders: '会员订单', column: '专栏管理', flags: '功能开关' };
  const STATE = { page: 'dashboard', token: localStorage.getItem(TOKEN_KEY) || '', users: null, orders: null };

  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const shell = $('shell');
  const content = $('content');

  function fmtTime(ms) {
    if (ms == null || ms === '') return '—';
    const n = Number(ms);
    if (!Number.isFinite(n)) return String(ms);
    const d = new Date(n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function fmtUptime(sec) {
    sec = Math.max(0, Number(sec) || 0);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d) return `${d}天${h}时`;
    if (h) return `${h}时${m}分`;
    return `${m}分${sec % 60}秒`;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function statusBadge(st) {
    const map = {
      paid: 'ok', pending: 'warn', cancelled: 'muted', failed: 'bad', refunded: 'bad',
    };
    const lab = { paid: '已支付', pending: '待支付', cancelled: '已取消', failed: '失败', refunded: '已退款' };
    return `<span class="badge ${map[st] || ''}">${esc(lab[st] || st)}</span>`;
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (STATE.token) headers.Authorization = 'Bearer ' + STATE.token;
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { data = {}; }
    if (res.status === 401 && path !== '/admin/login') {
      logout(false);
      throw new Error(data.error || '未登录');
    }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  function showLogin() {
    shell.classList.add('hidden');
    loginView.classList.remove('hidden');
  }
  function showShell() {
    loginView.classList.add('hidden');
    shell.classList.remove('hidden');
  }

  function logout(callApi) {
    const t = STATE.token;
    STATE.token = '';
    localStorage.removeItem(TOKEN_KEY);
    if (callApi !== false && t) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + t },
        credentials: 'same-origin',
      }).catch(() => {});
    }
    showLogin();
  }

  async function ensureAuth() {
    if (!STATE.token) { showLogin(); return false; }
    try {
      const me = await api('/admin/me');
      $('side-ver').textContent = 'v' + (me.version || '');
      showShell();
      return true;
    } catch {
      showLogin();
      return false;
    }
  }

  async function renderDashboard() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/dashboard');
    const af = d.apiFootball || {};
    const pdb = d.playerDb || {};
    const orders = d.orders || {};
    content.innerHTML = `
      <div class="cards">
        <div class="card"><div class="k">服务版本</div><div class="v">${esc(d.version)}</div><div class="s">运行 ${esc(fmtUptime(d.uptimeSec))} · Asia/Shanghai</div></div>
        <div class="card"><div class="k">用户 / 会员 / 封禁</div><div class="v">${d.users.total} / ${d.users.membersActive} / ${d.users.banned}</div><div class="s">注册用户总数</div></div>
        <div class="card"><div class="k">订单（已付/待付）</div><div class="v">${orders.paid || 0} / ${orders.pending || 0}</div><div class="s">取消 ${orders.cancelled || 0} · 退款 ${orders.refunded || 0}</div></div>
        <div class="card"><div class="k">专栏帖子</div><div class="v">${(d.column && d.column.posts) || 0}</div><div class="s">作者 ${(d.column && d.column.authors) || 0} · 战绩仅完场结算</div></div>
        <div class="card"><div class="k">AF 配额剩余</div><div class="v">${af.remaining == null ? '—' : af.remaining}</div><div class="s">限额 ${af.limit == null ? '—' : af.limit} · 采样 ${af.at ? fmtTime(af.at) : '尚未请求'}</div></div>
        <div class="card"><div class="k">球员库缺口</div><div class="v">${pdb.playerGapJingcai == null ? '—' : pdb.playerGapJingcai}</div><div class="s">竞彩场 ${pdb.jingcaiMatches || 0} · 球员行 ${pdb.playerRows || 0}</div></div>
        <div class="card"><div class="k">最近入库</div><div class="v" style="font-size:15px">${esc(pdb.lastFetchedAt ? fmtTime(Date.parse(pdb.lastFetchedAt)) : '—')}</div><div class="s">库文件 ${pdb.fileMtime ? fmtTime(Date.parse(pdb.fileMtime)) : '—'}</div></div>
      </div>
      <div class="card">
        <div class="k">能力配置</div>
        <div class="s" style="font-size:13px;line-height:1.7;color:var(--text)">
          DeepSeek：${d.deepseekConfigured ? '<span class="badge ok">已配置</span>' : '<span class="badge bad">未配置</span>'}
          &nbsp; API-Football Key：${d.afKeyConfigured ? '<span class="badge ok">已配置</span>' : '<span class="badge bad">未配置</span>'}
          &nbsp; 开关：${(d.flags || []).map((f) => `${esc(f.label)} ${f.on ? '开' : '关'}`).join(' · ')}
        </div>
        ${pdb.error ? `<p class="err">${esc(pdb.error)}</p>` : ''}
      </div>`;
  }

  async function renderUsers() {
    content.innerHTML = `
      <div class="toolbar">
        <input id="u-q" placeholder="手机号 / ID / 昵称" />
        <select id="u-status">
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="banned">已封禁</option>
          <option value="member">会员中</option>
        </select>
        <button class="btn primary" id="u-search">搜索</button>
        <span class="muted" id="u-total"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>手机号</th><th>昵称</th><th>角色</th><th>会员</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
        <tbody id="u-body"><tr><td colspan="8" class="muted">加载中…</td></tr></tbody>
      </table></div>
      <div class="pager"><button class="btn sm" id="u-prev">上一页</button><span class="muted" id="u-page"></span><button class="btn sm" id="u-next">下一页</button></div>
      <div id="u-detail"></div>`;

    let offset = 0;
    const limit = 50;
    const load = async () => {
      const q = $('u-q').value.trim();
      const status = $('u-status').value;
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      const data = await api('/admin/users?' + qs);
      $('u-total').textContent = `共 ${data.total} 人`;
      $('u-page').textContent = `${offset + 1}-${Math.min(offset + limit, data.total)} / ${data.total}`;
      $('u-prev').disabled = offset <= 0;
      $('u-next').disabled = offset + limit >= data.total;
      const tb = $('u-body');
      if (!data.users.length) {
        tb.innerHTML = '<tr><td colspan="8" class="muted">无用户</td></tr>';
        return;
      }
      tb.innerHTML = data.users.map((u) => `
        <tr>
          <td>${u.id}</td>
          <td>${esc(u.phone)}</td>
          <td>${esc(u.nickname)}</td>
          <td><span class="badge">${esc(u.role)}</span></td>
          <td>${u.memberActive ? `<span class="badge ok">${u.memberDaysLeft}天</span>` : '<span class="badge muted">非会员</span>'}</td>
          <td>${u.banned ? '<span class="badge bad">封禁</span>' : '<span class="badge ok">正常</span>'}</td>
          <td>${esc(fmtTime(u.createdAt))}</td>
          <td class="actions">
            <button class="btn sm" data-view="${u.id}">详情</button>
            <button class="btn sm ${u.banned ? 'ok' : 'danger'}" data-ban="${u.id}" data-on="${u.banned ? 0 : 1}">${u.banned ? '解禁' : '封禁'}</button>
          </td>
        </tr>`).join('');
    };

    $('u-search').onclick = () => { offset = 0; load().catch(alert); };
    $('u-prev').onclick = () => { offset = Math.max(0, offset - limit); load().catch(alert); };
    $('u-next').onclick = () => { offset += limit; load().catch(alert); };
    content.onclick = async (ev) => {
      const ban = ev.target.closest('[data-ban]');
      const view = ev.target.closest('[data-view]');
      if (ban) {
        const id = ban.getAttribute('data-ban');
        const on = ban.getAttribute('data-on') === '1';
        if (!confirm(on ? `确认封禁用户 #${id}？将踢出登录会话。` : `确认解禁用户 #${id}？`)) return;
        await api('/admin/users/' + id + '/set-ban', { method: 'POST', body: { banned: on } });
        await load();
      }
      if (view) {
        const id = view.getAttribute('data-view');
        const d = await api('/admin/users/' + id);
        const u = d.user;
        $('u-detail').innerHTML = `
          <div class="detail">
            <h3 style="margin:0 0 10px">用户 #${u.id} · ${esc(u.nickname)}</h3>
            <p class="muted">方案 ${d.stats.plans} · 关注 ${d.stats.favorites} · 活跃会话 ${d.stats.activeSessions}</p>
            <p>会员到期：${u.memberUntil ? fmtTime(u.memberUntil) : '—'}</p>
            <div class="toolbar" style="margin-top:10px">
              <select id="u-role">
                <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                <option value="vip" ${u.role === 'vip' ? 'selected' : ''}>vip</option>
                <option value="tester" ${u.role === 'tester' ? 'selected' : ''}>tester</option>
              </select>
              <input id="u-days" type="number" placeholder="延长会员天数（可负）" style="width:180px" />
              <button class="btn primary sm" id="u-save">保存角色/会员</button>
            </div>
            <div class="table-wrap" style="margin-top:10px"><table>
              <thead><tr><th>订单号</th><th>套餐</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
              <tbody>${(d.orders || []).map((o) => `<tr>
                <td>${esc(o.id)}</td><td>${esc(o.planName)}</td><td>¥${esc(o.amountYuan)}</td>
                <td>${statusBadge(o.status)}</td><td>${esc(fmtTime(o.createdAt))}</td>
              </tr>`).join('') || '<tr><td colspan="5" class="muted">无订单</td></tr>'}
              </tbody>
            </table></div>
          </div>`;
        $('u-save').onclick = async () => {
          const body = { role: $('u-role').value };
          const days = $('u-days').value.trim();
          if (days !== '') body.extendDays = Number(days);
          await api('/admin/users/' + id, { method: 'PATCH', body });
          alert('已保存');
          await load();
          view.click();
        };
      }
    };
    await load();
  }

  async function renderOrders() {
    content.innerHTML = `
      <div class="toolbar">
        <input id="o-q" placeholder="订单号 / 手机 / 用户ID" />
        <select id="o-status">
          <option value="">全部状态</option>
          <option value="pending">待支付</option>
          <option value="paid">已支付</option>
          <option value="cancelled">已取消</option>
          <option value="refunded">已退款</option>
          <option value="failed">失败</option>
        </select>
        <button class="btn primary" id="o-search">筛选</button>
        <span class="muted" id="o-total"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>订单号</th><th>用户</th><th>套餐</th><th>金额</th><th>渠道</th><th>状态</th><th>会员至</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody id="o-body"><tr><td colspan="9" class="muted">加载中…</td></tr></tbody>
      </table></div>
      <div class="pager"><button class="btn sm" id="o-prev">上一页</button><span class="muted" id="o-page"></span><button class="btn sm" id="o-next">下一页</button></div>`;

    let offset = 0;
    const limit = 50;
    const load = async () => {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const q = $('o-q').value.trim();
      const status = $('o-status').value;
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      const data = await api('/admin/orders?' + qs);
      $('o-total').textContent = `共 ${data.total} 单`;
      $('o-page').textContent = `${data.total ? offset + 1 : 0}-${Math.min(offset + limit, data.total)} / ${data.total}`;
      $('o-prev').disabled = offset <= 0;
      $('o-next').disabled = offset + limit >= data.total;
      const tb = $('o-body');
      if (!data.orders.length) {
        tb.innerHTML = '<tr><td colspan="9" class="muted">无订单</td></tr>';
        return;
      }
      tb.innerHTML = data.orders.map((o) => `
        <tr>
          <td>${esc(o.id)}</td>
          <td>#${o.userId}<br><span class="muted">${esc(o.phone || '')}</span></td>
          <td>${esc(o.planName)}<br><span class="muted">${o.days}天</span></td>
          <td>¥${esc(o.amountYuan)}</td>
          <td>${esc(o.channel)}${o.mock ? ' <span class="badge warn">mock</span>' : ''}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${o.expireExtendTo ? fmtTime(o.expireExtendTo) : '—'}</td>
          <td>${fmtTime(o.createdAt)}</td>
          <td class="actions">
            ${o.status === 'pending' || o.status === 'failed' || o.status === 'cancelled' ? `<button class="btn sm ok" data-paid="${esc(o.id)}">标已付</button>` : ''}
            ${o.status === 'pending' || o.status === 'failed' ? `<button class="btn sm" data-cancel="${esc(o.id)}">取消</button>` : ''}
            ${o.status === 'paid' ? `<button class="btn sm danger" data-refund="${esc(o.id)}">退款</button>` : ''}
          </td>
        </tr>`).join('');
    };

    $('o-search').onclick = () => { offset = 0; load().catch(alert); };
    $('o-prev').onclick = () => { offset = Math.max(0, offset - limit); load().catch(alert); };
    $('o-next').onclick = () => { offset += limit; load().catch(alert); };
    content.onclick = async (ev) => {
      const paid = ev.target.closest('[data-paid]');
      const cancel = ev.target.closest('[data-cancel]');
      const refund = ev.target.closest('[data-refund]');
      try {
        if (paid) {
          if (!confirm('确认标记已支付并延长会员？')) return;
          await api('/admin/orders/' + paid.getAttribute('data-paid') + '/mark-paid', { method: 'POST', body: {} });
          await load();
        }
        if (cancel) {
          if (!confirm('确认取消该订单？')) return;
          await api('/admin/orders/' + cancel.getAttribute('data-cancel') + '/cancel', { method: 'POST', body: {} });
          await load();
        }
        if (refund) {
          if (!confirm('确认退款？将回退对应会员天数（mock，无真实退款）。')) return;
          await api('/admin/orders/' + refund.getAttribute('data-refund') + '/refund', { method: 'POST', body: { revokeMembership: true } });
          await load();
        }
      } catch (e) { alert(e.message); }
    };
    await load();
  }

  async function renderFlags() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const data = await api('/admin/flags');
    content.innerHTML = `
      <p class="muted" style="margin-top:0">开关写入数据库，立即影响对应 API（无需重启）。默认开启；仅显式关闭生效。</p>
      ${(data.flags || []).map((f) => `
        <div class="flag-row">
          <div>
            <h3>${esc(f.label)} <span class="muted">(${esc(f.key)})</span></h3>
            <div class="muted">${esc(f.note || '')}</div>
            <div class="muted" style="margin-top:4px">更新：${f.updatedAt ? fmtTime(f.updatedAt) : '使用默认'}</div>
          </div>
          <button type="button" class="switch ${f.on ? 'on' : ''}" data-key="${esc(f.key)}" data-on="${f.on ? 1 : 0}" title="切换"></button>
        </div>`).join('')}`;
    content.onclick = async (ev) => {
      const sw = ev.target.closest('.switch');
      if (!sw) return;
      const key = sw.getAttribute('data-key');
      const next = sw.getAttribute('data-on') !== '1';
      try {
        await api('/admin/flags/' + encodeURIComponent(key), { method: 'PUT', body: { on: next } });
        await renderFlags();
      } catch (e) { alert(e.message); }
    };
  }


  async function renderColumn() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const STATE_COL = { q: '', kind: 'all' };
    async function load() {
      const qs = new URLSearchParams({ limit: '50', kind: STATE_COL.kind === 'all' ? '' : STATE_COL.kind });
      if (STATE_COL.q) qs.set('q', STATE_COL.q);
      const data = await api('/admin/column/posts?' + qs.toString());
      content.innerHTML = `
        <div class="toolbar">
          <input type="search" id="col-q" placeholder="搜索内容/昵称/id" value="${esc(STATE_COL.q)}" />
          <select id="col-kind">
            <option value="all"${STATE_COL.kind === 'all' ? ' selected' : ''}>全部</option>
            <option value="match"${STATE_COL.kind === 'match' ? ' selected' : ''}>比赛态度</option>
            <option value="general"${STATE_COL.kind === 'general' ? ' selected' : ''}>互动</option>
          </select>
          <button type="button" class="btn" id="col-search">搜索</button>
          <span class="muted">共 ${data.total} 条 · 真实互动；连红/近N中M仅来自完场结算</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>ID</th><th>作者</th><th>类型</th><th>话题</th><th>内容</th><th>互动</th><th>时间</th><th></th></tr></thead>
          <tbody>
            ${(data.posts || []).map((p) => `
              <tr>
                <td>${p.id}</td>
                <td>${esc(p.nickname)}<div class="muted">#${p.userId}${p.userBanned ? ' · 已封禁' : ''}</div></td>
                <td>${p.kind === 'match' ? '比赛态度' : '互动'}${p.matchLabel ? `<div class="muted">${esc(p.matchLabel)}</div>` : ''}</td>
                <td>${esc(p.topic || '—')}</td>
                <td style="max-width:280px"><div style="font-weight:600">${esc(p.title || '')}</div><div class="muted" style="white-space:pre-wrap">${esc((p.body || '').slice(0, 160))}</div></td>
                <td>${p.reads || 0} 读 · ${p.likes || 0} 赞</td>
                <td>${fmtTime(p.createdAt)}</td>
                <td><button type="button" class="btn danger sm" data-del="${p.id}">删除</button></td>
              </tr>`).join('') || '<tr><td colspan="8" class="muted">暂无帖子</td></tr>'}
          </tbody>
        </table></div>`;
      $('col-search').onclick = () => {
        STATE_COL.q = $('col-q').value.trim();
        STATE_COL.kind = $('col-kind').value;
        load().catch((e) => { content.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
      };
      content.onclick = async (ev) => {
        const btn = ev.target.closest('[data-del]');
        if (!btn) return;
        if (!confirm('确认删除该专栏帖子？')) return;
        try {
          await api('/admin/column/posts/' + btn.getAttribute('data-del'), { method: 'DELETE' });
          await load();
        } catch (e) { alert(e.message); }
      };
    }
    await load();
  }

  async function go(page) {
    STATE.page = page;
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-page') === page);
    });
    $('page-title').textContent = TITLES[page] || page;
    try {
      if (page === 'dashboard') await renderDashboard();
      else if (page === 'users') await renderUsers();
      else if (page === 'orders') await renderOrders();
      else if (page === 'column') await renderColumn();
      else if (page === 'flags') await renderFlags();
    } catch (e) {
      content.innerHTML = `<p class="err">${esc(e.message)}</p>`;
    }
  }

  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('login-err').textContent = '';
    try {
      const data = await api('/admin/login', {
        method: 'POST',
        body: { password: $('login-pw').value },
      });
      STATE.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      $('login-pw').value = '';
      showShell();
      await go('dashboard');
    } catch (e) {
      $('login-err').textContent = e.message;
    }
  });

  $('btn-logout').onclick = () => logout(true);
  document.getElementById('nav').onclick = (ev) => {
    const btn = ev.target.closest('[data-page]');
    if (btn) go(btn.getAttribute('data-page'));
  };

  setInterval(() => {
    const el = $('clock');
    if (!el) return;
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} Asia/Shanghai`;
  }, 1000);

  (async () => {
    const ok = await ensureAuth();
    if (ok) await go('dashboard');
  })();
})();
