(() => {
  const TOKEN_KEY = 'jingcai_admin_token';
  const TITLES = {
    dashboard: '总览', pageviews: '浏览量', 'match-health': '赛事健康', 'data-browser': '数据浏览',
    backup: '备份', users: '用户', orders: '订单', membership: '经营', column: '专栏',
    'news-covers': '头条封面', flags: '功能开关', audit: '审计日志',
  };
  const STATE = { page: 'dashboard', token: localStorage.getItem(TOKEN_KEY) || '', users: null, orders: null };

  const SVG_ICO = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const NAV_ICONS = {
    dashboard: `<svg ${SVG_ICO}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
    pageviews: `<svg ${SVG_ICO}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
    'match-health': `<svg ${SVG_ICO}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    'data-browser': `<svg ${SVG_ICO}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/></svg>`,
    backup: `<svg ${SVG_ICO}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 15v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>`,
    users: `<svg ${SVG_ICO}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    orders: `<svg ${SVG_ICO}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    membership: `<svg ${SVG_ICO}><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>`,
    column: `<svg ${SVG_ICO}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>`,
    'news-covers': `<svg ${SVG_ICO}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5L5 21"/></svg>`,
    flags: `<svg ${SVG_ICO}><path d="M12 3v18"/><path d="M12 3c2.5 2 5.5 2 8 0v9c-2.5-2-5.5-2-8 0"/><path d="M5 7v11"/></svg>`,
    audit: `<svg ${SVG_ICO}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`,
  };
  const KPI_ICONS = {
    'ic-users': `<svg ${SVG_ICO}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    'ic-orders': `<svg ${SVG_ICO}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
    'ic-pv': `<svg ${SVG_ICO}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
    'ic-column': `<svg ${SVG_ICO}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>`,
  };
  const LOGO_MARK = `<svg ${SVG_ICO} class="logo-mark"><path d="M12 2 4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>`;

  function alertIcon(title) {
    const t = String(title || '');
    if (/API-Football|AF 配额/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/></svg>`;
    }
    if (/在售场次|赛程/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`;
    }
    if (/事件/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
    }
    if (/备份|SQLite/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>`;
    }
    if (/DeepSeek/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 18 10 5 10-5"/></svg>`;
    }
    if (/待支付|订单/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
    }
    if (/会员|到期/.test(t)) {
      return `<svg ${SVG_ICO} class="chip-ico"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    }
    return `<svg ${SVG_ICO} class="chip-ico"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
  }

  function decorateNav() {
    document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
      const page = btn.getAttribute('data-page');
      const ico = NAV_ICONS[page];
      if (!ico || btn.querySelector('.nav-ico')) return;
      const label = btn.textContent.trim();
      btn.innerHTML = `<span class="nav-ico">${ico}</span><span class="nav-text">${esc(label)}</span>`;
    });
    const logos = document.querySelectorAll('.logo-mark-wrap');
    logos.forEach((el) => {
      if (!el.querySelector('svg')) el.innerHTML = LOGO_MARK;
    });
  }

  const chartSmooth = () => window.AdminChartSmooth;

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

  function fmtMetric(n) {
    const v = Number(n) || 0;
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function renderDelta(pct) {
    if (pct == null || !Number.isFinite(Number(pct))) return '';
    const n = Number(pct);
    if (n === 0) return '<span class="delta flat">0%</span>';
    const cls = n > 0 ? 'up' : 'down';
    const sign = n > 0 ? '+' : '';
    return `<span class="delta ${cls}">${sign}${n}%</span>`;
  }

  function renderSparkline(values, color) {
    const CS = chartSmooth();
    const vals = values || [];
    if (CS && CS.seriesIsFlat && CS.seriesIsFlat(vals)) {
      return `<div class="spark-empty"><span class="spark-empty-line" aria-hidden="true"></span><span class="spark-empty-hint">近14日无波动</span></div>`;
    }
    if (CS && CS.renderSparklineSvg) {
      const svg = CS.renderSparklineSvg(vals, color);
      if (svg) return svg;
      return `<div class="spark-empty"><span class="spark-empty-line" aria-hidden="true"></span><span class="spark-empty-hint">近14日无波动</span></div>`;
    }
    const vals = (values || []).map((v) => Number(v) || 0);
    if (!vals.length) return '';
    const w = 132;
    const h = 40;
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * w;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const fillPts = `0,${h} ${pts} ${w},${h}`;
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polygon class="spark-fill" fill="${color}" fill-opacity=".18" points="${fillPts}"/>
      <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${pts}"/>
    </svg>`;
  }

  function normalizeArr(vals) {
    const max = Math.max(1, ...(vals || []).map((v) => Number(v) || 0));
    return (vals || []).map((v) => (Number(v) || 0) / max);
  }

  function renderStackedTrendChart(series) {
    const rows = series || [];
    if (!rows.length) return '<p class="muted">暂无趋势数据</p>';
    const CS = chartSmooth();
    const W = 640;
    const H = 220;
    const padL = 36;
    const padR = 12;
    const padT = 22;
    const padB = 28;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const views = normalizeArr(rows.map((r) => r.views));
    const signups = normalizeArr(rows.map((r) => r.signups));
    const paid = normalizeArr(rows.map((r) => r.paid));
    const layerVals = [views, signups, paid];
    const yExt = CS && CS.stackedTrendYExtents
      ? CS.stackedTrendYExtents(layerVals, { headroom: 1.18, bottomPad: 0.1 })
      : { yMax: 1.18, yMin: -0.1, maxCum: 1 };
    const { yMax, yMin } = yExt;
    const layers = [
      { key: 'views', vals: views, color: '#6366f1', color2: '#a78bfa', label: '浏览量' },
      { key: 'signups', vals: signups, color: '#14b8a6', color2: '#2dd4bf', label: '新增用户' },
      { key: 'paid', vals: paid, color: '#f59e0b', color2: '#fbbf24', label: '付费笔数' },
    ];
    const n = rows.length;
    const xAt = (i) => padL + (i / Math.max(1, n - 1)) * innerW;
    const yAt = (v) => (CS && CS.valueToChartY
      ? CS.valueToChartY(v, yMin, yMax, padT, innerH)
      : padT + (1 - v) * innerH);
    const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

    function bandPaths(cumulativeTop, cumulativeBottom) {
      const topPts = cumulativeTop.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
      const botPts = cumulativeBottom.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
      if (CS && CS.smoothAreaBetween) {
        return CS.smoothAreaBetween(topPts, botPts);
      }
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = xAt(i);
        const y = yAt(cumulativeTop[i]);
        d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
      for (let i = n - 1; i >= 0; i--) {
        d += ` L ${xAt(i)} ${yAt(cumulativeBottom[i])}`;
      }
      return d + ' Z';
    }

    const cum0 = rows.map(() => 0);
    let cumBottom = cum0.slice();
    let svgLayers = '';
    let strokeLines = '';
    const defs = layers.map((layer) => {
      const gid = uid('tg');
      return { layer, gid, strokeId: uid('ts') };
    }).map(({ layer, gid, strokeId }, idx) => {
      const cumTop = cumBottom.map((b, i) => b + layer.vals[i]);
      const d = bandPaths(cumTop, cumBottom);
      const topLine = cumTop.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
      const lineD = CS && CS.smoothPathThrough ? CS.smoothPathThrough(topLine) : '';
      cumBottom = cumTop;
      svgLayers += `<path d="${d}" fill="url(#${gid})" class="chart-layer"/>`;
      if (lineD) {
        strokeLines += `<path d="${lineD}" fill="none" stroke="${layer.color2}" stroke-width="4" stroke-opacity=".15" stroke-linecap="round"/>`;
        strokeLines += `<path d="${lineD}" fill="none" stroke="${layer.color2}" stroke-width="1.5" stroke-linecap="round" class="chart-stroke"/>`;
      }
      return `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${layer.color}" stop-opacity=".55"/>
        <stop offset="100%" stop-color="${layer.color}" stop-opacity=".08"/>
      </linearGradient>`;
    }).join('');

    const grid = [0.35, 0.65].map((frac) => {
      const y = padT + frac * innerH;
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="chart-grid"/>`;
    }).join('');

    const labels = rows.map((r, i) => {
      if (i % 2 !== 0 && i !== n - 1) return '';
      const day = esc(String(r.day || '').slice(5));
      return `<text x="${xAt(i)}" y="${H - 6}" class="chart-axis">${day}</text>`;
    }).join('');

    const hoverZones = rows.map((r, i) => {
      const x = xAt(i);
      const w = innerW / Math.max(1, n - 1);
      const tip = `${r.day || ''}\n浏览 ${r.views || 0} · 注册 ${r.signups || 0} · 付费 ${r.paid || 0}`;
      return `<rect class="chart-hover" x="${x - w / 2}" y="${padT}" width="${w}" height="${innerH}" data-tip="${esc(tip)}"><title>${esc(tip.replace(/\n/g, ' · '))}</title></rect>`;
    }).join('');

    const legend = layers.map((l) =>
      `<span class="chart-legend-item"><i style="background:linear-gradient(180deg,${l.color2},${l.color})"></i>${l.label}</span>`).join('');

    return `<div class="chart-head"><div><strong>运营趋势</strong><span class="muted">近 14 日 · 各指标按峰值归一化叠加</span></div><div class="chart-legend">${legend}</div></div>
      <div class="chart-wrap">
      <svg class="chart-area" viewBox="0 0 ${W} ${H}" role="img" aria-label="近14日浏览量、新增用户与付费笔数趋势" overflow="visible">
        <defs>${defs}</defs>
        <g class="chart-plot" style="overflow:visible">${grid}${svgLayers}${strokeLines}${hoverZones}${labels}</g>
      </svg>
      <div class="chart-tooltip hidden" id="chart-tip"></div>
      </div>`;
  }

  function renderDonut(segments) {
    const items = (segments || []).filter((s) => (Number(s.value) || 0) > 0);
    const total = items.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
    const cx = 54;
    const cy = 54;
    const r = 42;
    const ri = 26;
    let angle = -Math.PI / 2;
    const paths = items.map((seg) => {
      const frac = (Number(seg.value) || 0) / total;
      const sweep = frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + sweep);
      const y2 = cy + r * Math.sin(angle + sweep);
      const xi1 = cx + ri * Math.cos(angle + sweep);
      const yi1 = cy + ri * Math.sin(angle + sweep);
      const xi2 = cx + ri * Math.cos(angle);
      const yi2 = cy + ri * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${ri} ${ri} 0 ${large} 0 ${xi2} ${yi2} Z`;
      angle += sweep;
      return `<path d="${d}" fill="${seg.color}"/>`;
    }).join('');
    const list = items.map((seg) =>
      `<div class="donut-row"><span class="dot" style="background:${seg.color}"></span><span>${esc(seg.label)}</span><strong>${seg.value}</strong></div>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 108 108" class="donut">${paths}<text x="${cx}" y="${cy}" class="donut-center">${total}</text></svg><div class="donut-list">${list}</div></div>`;
  }

  function renderKpiTile(opts) {
    const { iconClass, label, value, sub, delta, sparkValues, sparkColor, linkPage } = opts;
    const foot = linkPage
      ? `<button type="button" class="kpi-link" data-go-page="${esc(linkPage)}">查看详情</button>` : '';
    return `<article class="kpi-card">
      <div class="kpi-top"><span class="kpi-icon ${iconClass || ''}">${KPI_ICONS[iconClass] || ''}</span><span class="kpi-label">${esc(label)}</span></div>
      <div class="kpi-metric">${renderDelta(delta)}<span class="kpi-value">${esc(value)}</span></div>
      <div class="kpi-sub">${esc(sub || '')}</div>
      <div class="kpi-spark-wrap">${renderSparkline(sparkValues, sparkColor || '#60a5fa')}</div>
      ${foot}
    </article>`;
  }

  function renderBarChart(series, valueKey, accent) {
    const key = valueKey || 'views';
    const vals = (series || []).map((s) => Number(s[key]) || 0);
    const total = vals.reduce((s, v) => s + v, 0);
    if (!series || !series.length || total === 0) {
      return `<div class="chart-bars-empty" role="img" aria-label="暂无数据">
        <div class="chart-empty-ghost" aria-hidden="true"></div>
        <p class="muted">暂无数据</p>
      </div>`;
    }
    const max = Math.max(1, ...vals);
    const grad = accent || '';
    return `<div class="chart-bars${grad ? ' pro' : ''}">${(series || []).map((s, i) => {
      const v = vals[i];
      const h = Math.round((v / max) * 100);
      const day = esc(String(s.day || '').slice(5));
      const style = grad ? ` style="height:${h}%;background:${grad}"` : ` style="height:${h}%"`;
      return `<div class="bar-col" title="${esc(s.day)}: ${v}"><div class="bar"${style}></div><span>${day}</span></div>`;
    }).join('')}</div>`;
  }

  function renderAlertStrip(alerts) {
    return `<div class="alert-strip">${(alerts || []).map((a) => {
      const cnt = a.count != null && a.count !== '' ? `<span class="cnt">${esc(a.count)}</span>` : '';
      return `<button type="button" class="alert-chip ${esc(a.severity || 'yellow')}" data-go-page="${esc(a.page || 'dashboard')}"><span class="chip-ico-wrap">${alertIcon(a.title)}</span><span>${esc(a.title)}</span> ${cnt}</button>`;
    }).join('')}</div>`;
  }

  function bindChartTooltip(root) {
    const wrap = (root || content).querySelector('.chart-wrap');
    if (!wrap) return;
    const tip = wrap.querySelector('.chart-tooltip');
    if (!tip) return;
    wrap.querySelectorAll('.chart-hover').forEach((rect) => {
      rect.addEventListener('mouseenter', () => {
        const raw = rect.getAttribute('data-tip') || '';
        tip.textContent = raw.replace(/\n/g, ' · ');
        tip.classList.remove('hidden');
      });
      rect.addEventListener('mousemove', (ev) => {
        const b = wrap.getBoundingClientRect();
        tip.style.left = `${ev.clientX - b.left + 10}px`;
        tip.style.top = `${ev.clientY - b.top - 28}px`;
      });
      rect.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    });
  }

  function bindAlertNav(root) {
    (root || content).querySelectorAll('[data-go-page]').forEach((btn) => {
      btn.onclick = () => go(btn.getAttribute('data-go-page'));
    });
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
    decorateNav();
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
    content.classList.add('content--dashboard');
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/dashboard');
    const af = d.apiFootball || {};
    const pdb = d.playerDb || {};
    const orders = d.orders || {};
    const health = d.health || {};
    const pv = d.pageViews || {};
    const charts = d.charts || {};
    const series = charts.series14d || [];
    const deltas = charts.deltas || {};
    const revenue14 = series.reduce((s, r) => s + (Number(r.revenueFen) || 0), 0);
    const orderDonut = [
      { label: '已支付', value: orders.paid || 0, color: '#22c55e' },
      { label: '待支付', value: orders.pending || 0, color: '#f59e0b' },
      { label: '已取消', value: orders.cancelled || 0, color: '#64748b' },
      { label: '已退款', value: orders.refunded || 0, color: '#ef4444' },
      { label: '失败', value: orders.failed || 0, color: '#a855f7' },
    ];
    const todoBlock = (health.todos || []).length
      ? `<ol class="todo-list">${health.todos.map((t) =>
        `<li><button type="button" class="btn ghost sm" data-go-page="${esc(t.page)}">${esc(t.text)}</button></li>`).join('')}</ol>`
      : '<p class="muted calm">暂无待办 · 系统状态良好</p>';
    content.innerHTML = `
      ${renderAlertStrip(health.alerts)}
      <div class="dash-grid">
        <section class="dash-col dash-col-left">
          <div class="surface panel-block">
            <div class="panel-head"><h3>今日待办</h3><span class="muted">${(health.todos || []).length} 项</span></div>
            ${todoBlock}
          </div>
          <div class="surface panel-block compact">
            <div class="panel-head"><h3>服务状态</h3></div>
            <div class="stat-lines">
              <div><span class="muted">版本</span><strong>v${esc(d.version)}</strong></div>
              <div><span class="muted">运行</span><strong>${esc(fmtUptime(d.uptimeSec))}</strong></div>
              <div><span class="muted">AF 配额</span><strong>${af.remaining == null ? '—' : af.remaining}/${af.limit == null ? '—' : af.limit}</strong></div>
              <div><span class="muted">球员库缺口</span><strong>${pdb.playerGapJingcai == null ? '—' : pdb.playerGapJingcai}</strong></div>
            </div>
          </div>
        </section>
        <section class="dash-col dash-col-main">
          <div class="kpi-grid">
            ${renderKpiTile({
              iconClass: 'ic-users',
              label: '注册用户',
              value: fmtMetric(d.users.total),
              sub: `会员 ${d.users.membersActive} · 封禁 ${d.users.banned}`,
              delta: deltas.signups,
              sparkValues: series.map((r) => r.signups),
              sparkColor: '#14b8a6',
              linkPage: 'users',
            })}
            ${renderKpiTile({
              iconClass: 'ic-orders',
              label: '已付订单',
              value: fmtMetric(orders.paid || 0),
              sub: `待付 ${orders.pending || 0} · 近14日收入 ¥${(revenue14 / 100).toFixed(0)}`,
              delta: deltas.paid,
              sparkValues: series.map((r) => r.paid),
              sparkColor: '#f59e0b',
              linkPage: 'orders',
            })}
            ${renderKpiTile({
              iconClass: 'ic-pv',
              label: '今日浏览量',
              value: fmtMetric((pv.today && pv.today.views) || 0),
              sub: `UV 近似 ${fmtMetric((pv.today && pv.today.uniques) || 0)}`,
              delta: deltas.views,
              sparkValues: series.map((r) => r.views),
              sparkColor: '#6366f1',
              linkPage: 'pageviews',
            })}
            ${renderKpiTile({
              iconClass: 'ic-column',
              label: '专栏内容',
              value: fmtMetric((d.column && d.column.posts) || 0),
              sub: `作者 ${(d.column && d.column.authors) || 0} 人`,
              sparkValues: [],
              sparkColor: '#38bdf8',
              linkPage: 'column',
            })}
          </div>
          <div class="surface panel-block chart-panel">
            ${renderStackedTrendChart(series)}
          </div>
          <div class="kpi-grid kpi-grid-secondary">
            <div class="mini-card"><div class="k">今日在售场次</div><div class="v">${health.sellingToday != null ? health.sellingToday : '—'}</div><div class="s">赛程源 ${esc(health.scheduleSource || '—')}</div></div>
            <div class="mini-card"><div class="k">竞彩覆盖场次</div><div class="v">${pdb.jingcaiMatches || 0}</div><div class="s">球员库同步</div></div>
            <div class="mini-card"><div class="k">功能开关</div><div class="v">${(d.flags || []).filter((f) => f.on).length}/${(d.flags || []).length}</div><div class="s">已启用 / 总数</div></div>
          </div>
        </section>
        <section class="dash-col dash-col-right">
          <div class="surface panel-block">
            <div class="panel-head"><h3>订单构成</h3><button type="button" class="kpi-link" data-go-page="orders">订单列表</button></div>
            ${renderDonut(orderDonut)}
          </div>
          <div class="surface panel-block">
            <div class="panel-head"><h3>近 14 日浏览量</h3><button type="button" class="kpi-link" data-go-page="pageviews">浏览量页</button></div>
            ${renderBarChart(pv.series14d || [], 'views', 'linear-gradient(180deg, #c084fc, #7c3aed)')}
          </div>
          <div class="surface panel-block">
            <div class="panel-head"><h3>能力配置</h3><button type="button" class="kpi-link" data-go-page="flags">功能开关</button></div>
            <div class="cap-badges">
              DeepSeek ${d.deepseekConfigured ? '<span class="badge ok">已配置</span>' : '<span class="badge bad">未配置</span>'}
              API-Football ${d.afKeyConfigured ? '<span class="badge ok">Key 已配置</span>' : '<span class="badge bad">Key 未配置</span>'}
            </div>
            ${pdb.error ? `<p class="err">${esc(pdb.error)}</p>` : ''}
          </div>
        </section>
      </div>`;
    bindAlertNav(content);
    bindChartTooltip(content);
  }

  async function renderPageviews() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/pageviews');
    content.innerHTML = `
      <p class="muted">聚合表 app_page_views · 客户端可 POST /api/analytics/page-view</p>
      <div class="cards">
        <div class="card"><div class="k">${esc(d.day)} PV</div><div class="v">${d.totals.views}</div></div>
        <div class="card"><div class="k">UV（近似）</div><div class="v">${d.totals.uniques}</div></div>
      </div>
      <div class="panel-block"><h3>近 14 日趋势</h3>${renderBarChart(d.series14d)}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>路径</th><th>浏览</th><th>UV</th></tr></thead>
        <tbody>${(d.topPaths || []).map((r) => `<tr><td>${esc(r.path)}</td><td>${r.views}</td><td>${r.uniques}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">暂无数据</td></tr>'}</tbody>
      </table></div>`;
  }

  async function renderMatchHealth() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/match-health');
    content.innerHTML = `
      <p class="muted">${esc(d.noteZh || '')} · 数据源 ${esc(d.scheduleSource || '')}</p>
      <div class="cards">
        <div class="card"><div class="k">今日场次</div><div class="v">${d.todayCount}</div></div>
        <div class="card"><div class="k">进行中</div><div class="v">${d.liveCount}</div></div>
        <div class="card"><div class="k">未完结</div><div class="v">${d.unfinished}</div></div>
        <div class="card"><div class="k">事件滞后</div><div class="v">${d.eventsLagCount}</div></div>
        <div class="card"><div class="k">球员库缺口</div><div class="v">${d.playerGapJingcai == null ? '—' : d.playerGapJingcai}</div></div>
      </div>
      <div class="panel-block"><h3>事件滞后样本</h3>
        <div class="table-wrap"><table><thead><tr><th>场次</th><th>说明</th><th>原因</th></tr></thead><tbody>
        ${(d.eventsLagSamples || []).map((x) => `<tr><td>${esc(x.matchId)}</td><td>${esc(x.label)}</td><td>${esc(x.reason)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">无滞后样本</td></tr>'}</tbody></table></div>
      </div>
      <div class="panel-block"><h3>AF 未映射样本（竞彩→AF）</h3>
        <div class="table-wrap"><table><thead><tr><th>matchId</th><th>对阵</th></tr></thead><tbody>
        ${(d.afUnmappedSamples || []).map((x) => `<tr><td>${esc(x.matchId)}</td><td>${esc(x.sporttery)}</td></tr>`).join('')
          || '<tr><td colspan="2" class="muted">无样本或映射齐全</td></tr>'}</tbody></table></div>
      </div>`;
  }

  async function renderDataBrowser() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/data-browser');
    content.innerHTML = `
      <p class="muted">SQLite 表行数只读快照（${esc(new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}）</p>
      <div class="table-wrap"><table>
        <thead><tr><th>表名</th><th>行数</th></tr></thead>
        <tbody>${(d.tables || []).map((t) => `<tr><td>${esc(t.name)}</td><td>${t.count == null ? '—' : t.count}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }

  async function renderBackup() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/backups');
    content.innerHTML = `
      <div class="toolbar">
        <button type="button" class="btn primary" id="bk-create">立即备份 jingcai.db</button>
        <span class="muted">目录 ${esc(d.dir || '')}${d.latest ? ` · 最近 ${esc(d.latest.name)}` : ' · 尚无备份'}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>文件</th><th>大小</th><th>时间</th></tr></thead>
        <tbody>${(d.files || []).map((f) => `<tr><td>${esc(f.name)}</td><td>${Math.round(f.sizeBytes / 1024)} KB</td><td>${fmtTime(f.mtimeMs)}</td></tr>`).join('')
          || '<tr><td colspan="3" class="muted">暂无备份文件</td></tr>'}</tbody>
      </table></div>`;
    $('bk-create').onclick = async () => {
      if (!confirm('确认复制当前 SQLite 到 data/backups/？')) return;
      try {
        await api('/admin/backups', { method: 'POST', body: { label: 'admin' } });
        await renderBackup();
      } catch (e) { alert(e.message); }
    };
  }

  async function renderMembership() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/membership');
    const f = d.funnel || {};
    content.innerHTML = `
      <p class="muted">${esc(f.noteZh || '')}</p>
      <div class="cards">
        <div class="card"><div class="k">注册用户</div><div class="v">${f.registered}</div></div>
        <div class="card"><div class="k">曾付费</div><div class="v">${f.everPaid}</div></div>
        <div class="card"><div class="k">当前会员</div><div class="v">${f.activeMember}</div></div>
        <div class="card"><div class="k">流失（估算）</div><div class="v">${f.churned}</div></div>
        <div class="card"><div class="k">近30天退款</div><div class="v">${d.refunds30d}</div></div>
      </div>
      ${(d.revenue || []).map((w) => `
        <div class="panel-block"><h3>${esc(w.label)} 收入</h3>
          <p>订单 ${w.orderCount} 笔 · 合计 ¥${esc(w.revenueYuan)}</p>
          <div class="table-wrap"><table><thead><tr><th>套餐</th><th>笔数</th><th>金额</th></tr></thead><tbody>
          ${(w.byPlan || []).map((p) => `<tr><td>${esc(p.planName)}</td><td>${p.count}</td><td>¥${esc(p.yuan)}</td></tr>`).join('')
            || '<tr><td colspan="3" class="muted">无已付订单</td></tr>'}</tbody></table></div>
        </div>`).join('')}
      <div class="panel-block"><h3>7 日内到期会员</h3>
        <div class="table-wrap"><table><thead><tr><th>ID</th><th>昵称</th><th>手机</th><th>到期</th><th></th></tr></thead><tbody>
        ${(d.expiring7 || []).map((u) => `<tr><td>${u.id}</td><td>${esc(u.nickname)}</td><td>${esc(u.phoneMask)}</td><td>${fmtTime(u.memberUntil)}</td>
          <td><button type="button" class="btn sm" data-go-page="users">用户</button></td></tr>`).join('')
          || '<tr><td colspan="5" class="muted">无</td></tr>'}</tbody></table></div>
      </div>`;
    bindAlertNav(content);
  }

  async function renderNewsCovers() {
    content.innerHTML = '<p class="muted">加载中…</p>';
    const d = await api('/admin/news-covers');
    content.innerHTML = `
      <p class="muted">${esc(d.noteZh || '')} · 共 ${d.total} 组 · 公开预览 <a href="/news-covers/" target="_blank" rel="noopener">/news-covers/</a></p>
      <div class="cover-grid">
        ${(d.items || []).map((it) => {
          const st = it.status || 'pending';
          const a = (it.variants && it.variants.A) || '';
          const b = (it.variants && it.variants.B) || '';
          return `<div class="cover-card">
            <div class="muted">${esc(it.league)} · <span class="badge ${st === 'approved' ? 'ok' : st === 'rejected' ? 'bad' : 'warn'}">${esc(st)}</span></div>
            <strong>${esc(it.title || it.slug)}</strong>
            <div class="cover-pair"><div><div class="muted">A</div><img src="${esc(a)}" alt="A"/></div>
              <div><div class="muted">B</div><img src="${esc(b)}" alt="B"/></div></div>
            <div class="actions">
              <button type="button" class="btn ok sm" data-lock="${esc(it.slug)}" data-var="A">锁定 A</button>
              <button type="button" class="btn ok sm" data-lock="${esc(it.slug)}" data-var="B">锁定 B</button>
              <button type="button" class="btn sm" data-reject="${esc(it.slug)}">驳回</button>
              <button type="button" class="btn sm" data-hide="${esc(it.slug)}">隐藏</button>
            </div>
          </div>`;
        }).join('') || '<p class="muted">暂无封面，请将素材放入 public/news-covers/assets/ 或 manifest</p>'}
      </div>`;
    content.onclick = async (ev) => {
      const lock = ev.target.closest('[data-lock]');
      const rej = ev.target.closest('[data-reject]');
      const hid = ev.target.closest('[data-hide]');
      try {
        if (lock) {
          const slug = lock.getAttribute('data-lock');
          const variant = lock.getAttribute('data-var') || 'A';
          if (!confirm(`确认锁定 ${slug} 变体 ${variant} 入库？`)) return;
          await api('/admin/news-covers/' + encodeURIComponent(slug) + '/lock', { method: 'POST', body: { variant } });
          await renderNewsCovers();
        }
        if (rej) {
          if (!confirm('确认驳回？')) return;
          await api('/admin/news-covers/' + encodeURIComponent(rej.getAttribute('data-reject')) + '/reject', { method: 'POST', body: {} });
          await renderNewsCovers();
        }
        if (hid) {
          await api('/admin/news-covers/' + encodeURIComponent(hid.getAttribute('data-hide')) + '/hide', { method: 'POST', body: {} });
          await renderNewsCovers();
        }
      } catch (e) { alert(e.message); }
    };
  }

  async function renderAudit() {
    content.innerHTML = `
      <div class="toolbar">
        <select id="au-action"><option value="">全部动作</option></select>
        <input id="au-from" type="date" />
        <input id="au-to" type="date" />
        <button class="btn primary" id="au-search">筛选</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>时间</th><th>动作</th><th>目标</th><th>摘要</th><th>IP</th></tr></thead>
        <tbody id="au-body"><tr><td colspan="5" class="muted">加载中…</td></tr></tbody>
      </table></div>
      <div class="pager"><button class="btn sm" id="au-prev">上一页</button><span class="muted" id="au-page"></span><button class="btn sm" id="au-next">下一页</button></div>`;
    let offset = 0;
    const limit = 50;
    const load = async () => {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      const act = $('au-action').value;
      if (act) qs.set('action', act);
      if ($('au-from').value) qs.set('from', $('au-from').value + 'T00:00:00+08:00');
      if ($('au-to').value) qs.set('to', $('au-to').value + 'T23:59:59+08:00');
      const data = await api('/admin/audit?' + qs);
      const sel = $('au-action');
      if (sel.options.length <= 1 && (data.actions || []).length) {
        data.actions.forEach((a) => {
          const o = document.createElement('option');
          o.value = a; o.textContent = a; sel.appendChild(o);
        });
      }
      $('au-page').textContent = `${offset + 1}-${Math.min(offset + limit, data.total)} / ${data.total}`;
      $('au-prev').disabled = offset <= 0;
      $('au-next').disabled = offset + limit >= data.total;
      $('au-body').innerHTML = (data.logs || []).map((r) => `<tr>
        <td>${esc(r.tzLabel || fmtTime(r.createdAt))}</td>
        <td>${esc(r.action)}</td>
        <td>${esc(r.targetType || '')}${r.targetId ? ' #' + esc(r.targetId) : ''}</td>
        <td>${esc(r.summary)}</td>
        <td>${esc(r.ip || '')}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">无记录</td></tr>';
    };
    $('au-search').onclick = () => { offset = 0; load().catch(alert); };
    $('au-prev').onclick = () => { offset = Math.max(0, offset - limit); load().catch(alert); };
    $('au-next').onclick = () => { offset += limit; load().catch(alert); };
    await load();
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
    content.classList.toggle('content--dashboard', page === 'dashboard');
    try {
      if (page === 'dashboard') await renderDashboard();
      else if (page === 'pageviews') await renderPageviews();
      else if (page === 'match-health') await renderMatchHealth();
      else if (page === 'data-browser') await renderDataBrowser();
      else if (page === 'backup') await renderBackup();
      else if (page === 'membership') await renderMembership();
      else if (page === 'news-covers') await renderNewsCovers();
      else if (page === 'audit') await renderAudit();
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
    decorateNav();
    const ok = await ensureAuth();
    if (ok) await go('dashboard');
  })();
})();
