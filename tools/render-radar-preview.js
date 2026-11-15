'use strict';
/**
 * Static preview of the Dongqiudi-inspired radar UI.
 * Reads sample JSON and writes HTML + (via Chrome) PNG under data/radar/.
 * Not used by the app at runtime.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'radar');
const HOME = '#5b7cfa';
const AWAY = '#ff4d7a';
const POOL = '#8b92a8';
const SHORT = {
  '抢断拦截次数': '抢断拦截',
  '高空处理次数': '高空处理',
  '出击次数': '出击次数',
  '成功传球率': '传球成功率',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function radarFmt(key, v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const pct = /pct|conv|duel_win|save_pct|long_pct|sib_share|aerial_win|possession|percentage|pass_pct/.test(String(key || ''))
    || /%$/.test(String(key || '')) || /成功率|转化率|控球率|扑救率/.test(String(key || ''));
  if (pct) return (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1)) + '%';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
function radarPoly(scores, cx, cy, rMax, n) {
  n = n || 6;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    const r = rMax * Math.max(0, Math.min(100, Number(scores[i]) || 0)) / 100;
    pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}
function radarHex(level, cx, cy, rMax, n) {
  n = n || 6;
  const r = rMax * level / 100;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
}
function radarSvgHtml(dims, series, opts) {
  opts = opts || {};
  const dark = !!opts.dark;
  const grid = dark ? '#2a3548' : '#e2e5ee';
  const labelC = dark ? '#c5cbe0' : '#3d4660';
  const size = opts.size || 320;
  const pad = opts.compact ? 34 : (opts.large ? 52 : 46);
  const cx = size / 2, cy = size / 2, rMax = size / 2 - pad;
  const n = (dims && dims.length) || 6;
  const ff = 'Noto Sans CJK SC, Source Han Sans SC, PingFang SC, sans-serif';
  let rings = '';
  for (const lv of [20, 40, 60, 80, 100]) {
    rings += `<polygon points="${radarHex(lv, cx, cy, rMax, n)}" fill="none" stroke="${grid}" stroke-width="${lv === 100 ? 1.15 : 0.65}"/>`;
  }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    const x = (cx + rMax * Math.cos(a)).toFixed(1);
    const y = (cy + rMax * Math.sin(a)).toFixed(1);
    rings += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${grid}" stroke-width="0.65"/>`;
  }
  let shapes = '';
  (series || []).forEach((s) => {
    shapes += `<polygon points="${radarPoly(s.scores, cx, cy, rMax, n)}" fill="${s.fill}" stroke="${s.color}" stroke-width="${opts.compact ? 1.6 : 2.1}" stroke-linejoin="round"/>`;
  });
  let labels = '';
  const fs = opts.compact ? 9 : (opts.large ? 11.5 : 10.5);
  for (let i = 0; i < n; i++) {
    const d = dims[i] || {};
    const name = SHORT[d.name] || d.name || '';
    const a = -Math.PI / 2 + i * 2 * Math.PI / n;
    const extra = opts.compact ? 14 : 22;
    const lx = cx + (rMax + extra) * Math.cos(a);
    const ly = cy + (rMax + extra) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const baseline = Math.sin(a) > 0.5 ? 'hanging' : (Math.sin(a) < -0.5 ? 'alphabetic' : 'middle');
    const fill = d.style_volume ? '#c4851a' : labelC;
    labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-size="${fs}" font-weight="700" fill="${fill}" font-family="${ff}">${esc(name)}</text>`;
  }
  const cls = 'radar-svg' + (opts.large ? ' lg' : '') + (opts.compact ? ' sm' : '');
  return `<svg class="${cls}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${rings}${shapes}${labels}</svg>`;
}
function pillWidth(val, other) {
  if (val == null || !Number.isFinite(Number(val))) return 36;
  const a = Math.abs(Number(val));
  const b = (other == null || !Number.isFinite(Number(other))) ? a : Math.abs(Number(other));
  const max = Math.max(a, b, 1e-9);
  return Math.round(36 + 64 * (a / max));
}
function leader(left, right, invert, isStyle, key) {
  if (left == null || right == null || !Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return 'na';
  const l = Number(left), r = Number(right);
  if (l === r || radarFmt(key, left) === radarFmt(key, right)) return 'eq';
  if (isStyle) return l > r ? 'l' : 'r';
  if (invert) return l < r ? 'l' : 'r';
  return l > r ? 'l' : 'r';
}
function rowHtml(row, leftColor, rightColor) {
  const lTxt = radarFmt(row.key, row.left);
  const rTxt = radarFmt(row.key, row.right);
  const who = leader(row.left, row.right, row.invert, row.style, row.key);
  const lw = pillWidth(row.left, row.right);
  const rw = pillWidth(row.right, row.left);
  const lMiss = row.left == null || !Number.isFinite(Number(row.left));
  const rMiss = row.right == null || !Number.isFinite(Number(row.right));
  const lCls = 'rk-pill' + (lMiss ? ' muted miss' : (who === 'l' || who === 'eq' ? ' win' : ' muted'));
  const rCls = 'rk-pill' + (rMiss ? ' muted miss' : (who === 'r' || who === 'eq' ? ' win' : ' muted'));
  const lStyle = (!lMiss && (who === 'l' || who === 'eq')) ? `width:${lw}%;background:${leftColor}` : `width:${lw}%`;
  const rStyle = (!rMiss && (who === 'r' || who === 'eq')) ? `width:${rw}%;background:${rightColor}` : `width:${rw}%`;
  return `<div class="rk-row">
    <div class="rk-side l"><span class="${lCls}" style="${lStyle}">${esc(lTxt)}</span></div>
    <div class="rk-lab">${esc(row.label)}${row.invert && !row.style ? '<i>越少越好</i>' : ''}</div>
    <div class="rk-side r"><span class="${rCls}" style="${rStyle}">${esc(rTxt)}</span></div>
  </div>`;
}
function groupsHtml(groups, lc, rc) {
  if (!groups || !groups.length) return '<p class="rk-empty">暂无可以对照的分项。</p>';
  return groups.map((g) => {
    const note = g.style ? '<p class="rk-sec-note">这是次数 / 风格轴，受打法影响，次数少不等于能力差。</p>' : '';
    const rows = (g.rows || []).map((r) => rowHtml(Object.assign({ style: g.style }, r), lc, rc)).join('');
    return `<section class="rk-sec"><h3 class="rk-sec-hd${g.style ? ' style' : ''}">${esc(g.name)}</h3>${note}${rows}</section>`;
  }).join('');
}
function teamGroups(home, away) {
  return ((home && home.dims) || []).map((hd, i) => {
    const ad = ((away && away.dims) || [])[i] || { parts: [] };
    const aMap = new Map((ad.parts || []).map((p) => [p.key, p]));
    return {
      name: hd.name, style: hd.style_volume,
      rows: (hd.parts || []).map((p) => ({
        key: p.key, label: p.label, left: p.value,
        right: aMap.has(p.key) ? aMap.get(p.key).value : null, invert: p.invert,
      })),
    };
  }).filter((g) => g.rows.length);
}
function poolGroups(p) {
  return (p.dims || []).map((d) => ({
    name: d.name, style: d.style_volume,
    rows: (d.parts || []).map((part) => ({
      key: part.key, label: part.label, left: part.value, right: part.avg, invert: part.invert,
    })),
  }));
}
function sharedGroups(a, b) {
  const bMap = new Map();
  (b.dims || []).forEach((d) => (d.parts || []).forEach((p) => bMap.set(p.key, p)));
  return (a.dims || []).map((d) => ({
    name: d.name, style: d.style_volume,
    rows: (d.parts || []).filter((p) => bMap.has(p.key)).map((p) => ({
      key: p.key, label: p.label, left: p.value, right: bMap.get(p.key).value, invert: p.invert,
    })),
  })).filter((g) => g.rows.length);
}
function av(p, lg) {
  const cls = lg ? 'rk-av lg' : 'rk-av';
  if (p && p.photo) return `<span class="${cls}"><img src="${esc(p.photo)}" alt=""></span>`;
  const letter = esc(([...String((p && (p.nameZh || p.name)) || '?')][0] || '?'));
  return `<span class="${cls} letter">${letter}</span>`;
}
function crest(name) {
  const letter = esc(([...String(name || '?')][0] || '?'));
  return `<span class="badge lg">${letter}</span>`;
}
function backSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M15 5l-7 7 7 7"/></svg>';
}
function hdr(title) {
  return `<header class="rk-hdr"><button type="button" class="ic-btn" aria-label="返回">${backSvg()}</button><h1>${esc(title)}</h1><div class="rk-hdr-r"></div></header>`;
}

function compactTab(pack) {
  const team = pack.team;
  const hName = pack.coverage.home.nameZh;
  const aName = pack.coverage.away.nameZh;
  const home = pack.players.filter((p) => p.side === 'home');
  const away = pack.players.filter((p) => p.side === 'away');
  let teamCard;
  if (!team || !team.ok) {
    teamCard = `<section class="sm-kit sm-radar">
      <div class="sm-kit-hd"><h3>球队六围</h3></div>
      <p class="sm-empty">暂无。${esc(team.noteZh || '本场尚无球队对照所需的赛事统计')}</p>
    </section>`;
  } else {
    const dims = team.home.dims.map((d) => ({ name: d.name, style_volume: d.style_volume }));
    const svg = radarSvgHtml(dims, [
      { scores: team.home.scores, color: HOME, fill: 'rgba(91,124,250,.28)' },
      { scores: team.away.scores, color: AWAY, fill: 'rgba(255,77,122,.20)' },
    ], { size: 328 });
    teamCard = `<section class="sm-kit sm-radar">
      <div class="sm-kit-hd"><h3>球队六围</h3><button class="rk-more">详细对照</button></div>
      <div class="sm-legend"><i class="h"></i><span>${esc(hName)}</span><i class="a"></i><span>${esc(aName)}</span></div>
      <div class="radar-wrap">${svg}</div>
      <p class="radar-cap">${esc(team.poolLabel || '')} 0–100 为同赛事对照群中的分位。<span class="style">「抢断拦截次数」是场均次数，不是能力差。</span></p>
    </section>`;
  }
  const tile = (p) => {
    const dims = (p.dims || []).map((d) => ({ name: d.name, style_volume: d.style_volume }));
    const color = p.side === 'away' ? AWAY : HOME;
    const fill = p.side === 'away' ? 'rgba(255,77,122,.28)' : 'rgba(91,124,250,.28)';
    const svg = radarSvgHtml(dims, [{ scores: p.scores, color, fill }], { compact: true, size: 168 });
    const pool = (p.poolLabel || '').replace(/。.*$/, '');
    const wing = p.wingerOverride ? `<span class="rk-chip">${esc(p.wingerOverride)}</span>` : '';
    return `<button type="button" class="sm-radar-card">
      <div class="who">${av(p)}<div><div class="nm">${esc(p.nameZh || p.name)}</div><div class="sub">${esc(pool)}</div>${wing}</div></div>
      <div class="tile-radar">${svg}</div>
    </button>`;
  };
  const col = (list, name, side) => `<div class="sm-radar-side">
    <h4><i class="${side === 'away' ? 'a' : 'h'}"></i>${esc(name)}</h4>
    ${list.map(tile).join('')}
  </div>`;
  const playerCard = `<section class="sm-kit sm-radar">
    <div class="sm-kit-hd"><h3>球员六围</h3><button class="rk-more">展开全部</button></div>
    <div class="sm-radar-players">${col(home, hName, 'home')}${col(away, aName, 'away')}</div>
    <p class="radar-cap">点开球员看与对照群的详细对照；展开全部可双方球员互相比。边锋第一期暂按前锋轴，并标明「暂按前锋对照」。</p>
  </section>`;
  return `<div class="phone-inner tab">
    <div class="fake-hdr">数据</div>
    ${teamCard}${playerCard}
  </div>`;
}

function teamExpand(pack, opts) {
  opts = opts || {};
  const team = pack.team;
  const hName = (pack.coverage && pack.coverage.home && pack.coverage.home.nameZh) || '主队';
  const aName = (pack.coverage && pack.coverage.away && pack.coverage.away.nameZh) || '客队';
  const hSub = (team && team.home && team.home.ok)
    ? `${esc(team.home.competition || '')} · ${team.home.matches} 场`
    : '';
  const aSub = (team && team.away && team.away.ok)
    ? `${esc(team.away.competition || '')} · ${team.away.matches} 场`
    : '';
  const clubs = `<div class="rk-clubs">
    <div class="rk-club h">${crest(hName)}<div class="rk-club-tx"><b>${esc(hName)}</b><small>${hSub}</small></div></div>
    <div class="rk-vs">VS</div>
    <div class="rk-club a"><div class="rk-club-tx r"><b>${esc(aName)}</b><small>${aSub}</small></div>${crest(aName)}</div>
  </div>`;
  if (!team || !team.ok) {
    const msg = (team && team.noteZh) || '本场尚无球队对照所需的赛事统计';
    return `<div class="rk-page preview">${hdr('球队对照')}<div class="rk-body">${clubs}
      <div class="rk-vacant"><p>暂无球队六围</p><p class="rk-vacant-sub">${esc(msg)}</p></div>
    </div></div>`;
  }
  const dims = team.home.dims.map((d) => ({ name: d.name, style_volume: d.style_volume }));
  const svg = radarSvgHtml(dims, [
    { scores: team.home.scores, color: HOME, fill: 'rgba(91,124,250,.30)' },
    { scores: team.away.scores, color: AWAY, fill: 'rgba(255,77,122,.22)' },
  ], { large: true, size: 360, dark: !!opts.dark });
  const cap = `${esc(String(team.poolLabel || '').replace(/。?$/, '。'))}0–100 为同赛事对照群中的分位。<span class="style">「抢断拦截次数」是场均次数，不是能力差。</span>`;
  return `<div class="rk-page preview">${hdr('球队对照')}<div class="rk-body">
    ${clubs}
    <div class="sm-legend"><i class="h"></i><span>${esc(hName)}</span><i class="a"></i><span>${esc(aName)}</span></div>
    <div class="radar-wrap lg">${svg}</div>
    <p class="rk-cap">${cap}</p>
    ${groupsHtml(teamGroups(team.home, team.away), HOME, AWAY)}
  </div></div>`;
}

function playerPool(pack, smId) {
  const p = [...pack.players, ...(pack.drawable.home || []), ...(pack.drawable.away || [])]
    .find((x) => String(x.smId) === String(smId));
  const color = p.side === 'away' ? AWAY : HOME;
  const fill = p.side === 'away' ? 'rgba(255,77,122,.28)' : 'rgba(91,124,250,.28)';
  const dims = (p.dims || []).map((d) => ({ name: d.name, style_volume: d.style_volume }));
  const series = (p.poolScores && p.poolScores.length)
    ? [{ scores: p.poolScores, color: POOL, fill: 'rgba(139,146,168,.22)' }, { scores: p.scores, color, fill }]
    : [{ scores: p.scores, color, fill }];
  const svg = radarSvgHtml(dims, series, { large: true, size: 360 });
  const mins = p.minutes ? `${Math.round(p.minutes)} 分钟 / ${p.apps || '—'} 场` : '';
  const wing = p.wingerOverride ? `（${esc(p.wingerOverride)}）` : '';
  const hero = `<div class="rk-hero">${av(p, true)}<div class="rk-hero-tx">
    <b>${esc(p.nameZh || p.name)}</b>
    <small>${esc([p.roleZh, p.club, mins].filter(Boolean).join(' · '))}</small>
  </div></div>`;
  const modes = `<div class="rk-modes"><button class="on">对照群</button><button>双方球员对照</button></div>`;
  const legend = `<div class="sm-legend"><i class="h" style="background:${color}"></i><span>${esc(p.nameZh || p.name)}</span><i class="a" style="background:${POOL}"></i><span>对照群平均</span></div>`;
  const cap = `<p class="rk-cap">${esc(p.poolLabel || '')}${wing} 彩色是该球员，灰色是对照群平均（各指标均值再计分，不是画在 50）。0–100 为分位。<span class="style">次数轴是风格次数，不是能力差。</span></p>`;
  return `<div class="rk-page preview">${hdr('球员对照')}<div class="rk-body">
    ${hero}${modes}${legend}
    <div class="radar-wrap lg">${svg}</div>
    ${cap}
    ${groupsHtml(poolGroups(p), color, POOL)}
  </div></div>`;
}

function playerH2h(pack, homeSm, awaySm) {
  const all = [...pack.players, ...(pack.drawable.home || []), ...(pack.drawable.away || [])];
  const a = all.find((x) => String(x.smId) === String(homeSm));
  const b = all.find((x) => String(x.smId) === String(awaySm));
  const same = (a.dims || []).map((d) => d.name).join() === (b.dims || []).map((d) => d.name).join();
  const pick = (p, side) => {
    const sub = [p.roleZh, p.club, p.minutes ? (Math.round(p.minutes) + ' 分钟') : ''].filter(Boolean).join(' · ');
    return `<button class="rk-pick">${av(p, true)}<div class="rk-pick-tx"><b>${esc(p.nameZh || p.name)}</b><small>${esc(sub)}</small></div><span class="rk-swap">更换</span></button>`;
  };
  const picks = `<div class="rk-picks">${pick(a, 'home')}${pick(b, 'away')}</div>`;
  const modes = `<div class="rk-modes"><button>对照群</button><button class="on">双方球员对照</button></div>`;
  let charts;
  if (same) {
    const dims = a.dims.map((d) => ({ name: d.name, style_volume: d.style_volume }));
    const svg = radarSvgHtml(dims, [
      { scores: a.scores, color: HOME, fill: 'rgba(91,124,250,.28)' },
      { scores: b.scores, color: AWAY, fill: 'rgba(255,77,122,.20)' },
    ], { large: true, size: 360 });
    charts = `<div class="sm-legend"><i class="h"></i><span>${esc(a.nameZh)}</span><i class="a"></i><span>${esc(b.nameZh)}</span></div>
      <div class="radar-wrap lg">${svg}</div>
      <p class="rk-cap">两边使用同一套位置轴（${esc(a.roleZh)}）。<span class="style">次数轴是风格次数，不是能力差。</span></p>`;
  } else {
    const sa = radarSvgHtml(a.dims.map((d) => ({ name: d.name, style_volume: d.style_volume })),
      [{ scores: a.scores, color: HOME, fill: 'rgba(91,124,250,.28)' }], { large: true, size: 320 });
    const sb = radarSvgHtml(b.dims.map((d) => ({ name: d.name, style_volume: d.style_volume })),
      [{ scores: b.scores, color: AWAY, fill: 'rgba(255,77,122,.22)' }], { large: true, size: 320 });
    charts = `<p class="rk-cap warn">两位球员的位置轴不同（${esc(a.roleZh)} vs ${esc(b.roleZh)}），不画在同一张六边形上。下面只对照两边都有的分项。</p>
      <div class="rk-stack">
        <div class="rk-stack-item"><div class="sm-legend"><i class="h"></i><span>${esc(a.nameZh)} · ${esc(a.roleZh)}</span></div><div class="radar-wrap">${sa}</div></div>
        <div class="rk-stack-item"><div class="sm-legend"><i class="a"></i><span>${esc(b.nameZh)} · ${esc(b.roleZh)}</span></div><div class="radar-wrap">${sb}</div></div>
      </div>`;
  }
  return `<div class="rk-page preview">${hdr('球员对照')}<div class="rk-body">
    ${modes}${picks}${charts}
    ${groupsHtml(sharedGroups(a, b), HOME, AWAY)}
  </div></div>`;
}

function cssFromApp() {
  const all = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
  const i = all.indexOf('/* ---- 数据页六围图');
  const radar = i >= 0 ? all.slice(i).replace(/html\[data-theme="pitch"\]/g, '.device.pitch') : '';
  return `
:root {
  --bg: #F5F7FB; --card: #ffffff; --line: #E6EBF3; --line-2: #DCE3EE;
  --t1: #1c2434; --t2: #5c6578; --t3: #7b8499;
  --sat: 0px; --safe-b: 0px; --maxw: 720px;
}
html[data-theme="pitch"] {
  --bg: #0B1220; --card: #1A2336; --line: #243044;
  --t1: #E8EEF8; --t2: #A8B4C8; --t3: #6B7A92;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 32px 28px 48px;
  font-family: "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Noto Sans SC", sans-serif;
  background: #ece7dc; color: #1c2434;
}
h1.page { font-size: 22px; margin: 0 0 6px; }
.lead { color: #555; font-size: 13px; line-height: 1.55; margin: 0 0 22px; max-width: 920px; }
.grid { display: grid; grid-template-columns: repeat(2, 402px); gap: 28px 32px; align-items: start; }
.panel h2 { margin: 0 0 10px; font-size: 14px; font-weight: 800; color: #3d4660; letter-spacing: .02em; }
.device {
  width: 390px; background: #fff; border-radius: 28px;
  box-shadow: 0 12px 40px rgba(28,36,52,.14);
  overflow: hidden; border: 8px solid #1c2434;
}
.device.pitch { background: #0B1220; }
.phone-inner.tab { padding: 0 0 20px; background: #F5F7FB; }
.fake-hdr {
  text-align: center; font-size: 17px; font-weight: 800;
  padding: 14px 12px 10px; border-bottom: 1px solid #E6EBF3; background: #fff;
}
.sm-kit { background: #fff; border-radius: 16px; padding: 12px 12px 14px; margin: 12px; }
.sm-kit-hd { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.sm-kit-hd h3, .sm-kit h3 { margin: 0; font-size: 15px; font-weight: 800; color: #1c2434; }
.sm-kit .sm-empty { color: #7b8499; font-size: 12px; line-height: 1.5; margin: 8px 0 0; }
.sm-legend { display: flex; justify-content: center; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 11px; color: #3d4660; font-weight: 700; }
.sm-legend i { width: 10px; height: 6px; border-radius: 3px; display: inline-block; }
.sm-legend i.h { background: #5b7cfa; }
.sm-legend i.a { background: #ff4d7a; }
.ic-btn { border: 0; background: none; width: 40px; height: 40px; display: grid; place-items: center; color: inherit; padding: 0; }
.badge.lg {
  width: 44px; height: 44px; border-radius: 50%; background: #e7ebf3;
  display: grid; place-items: center; font-weight: 800; font-size: 16px; color: #3d4660; flex: none;
}
.rk-page.preview {
  position: relative; inset: auto; z-index: 1; max-width: none;
  margin: 0; overflow: visible; display: flex; min-height: 0; height: auto;
}
.rk-page.preview .rk-body { overflow: visible; flex: none; padding-bottom: 24px; }
.rk-page.preview .rk-hdr { position: relative; }
${radar}
.device.pitch, .device.pitch .rk-page {
  --bg: #0B1220; --card: #1A2336; --line: #243044;
  --t1: #E8EEF8; --t2: #A8B4C8; --t3: #6B7A92;
  background: #0B1220; color: #E8EEF8;
}
.device.pitch .badge.lg { background: #243044; color: #E8EEF8; }
`;
}

function page(title, lead, panels) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>${cssFromApp()}</style></head>
<body>
<h1 class="page">${esc(title)}</h1>
<p class="lead">${lead}</p>
<div class="grid">${panels.map((p) => `<div class="panel"><h2>${esc(p.title)}</h2><div class="device${p.dark ? ' pitch' : ''}"${p.dark ? ' data-theme="pitch"' : ''}>${p.dark ? `<div data-theme="pitch">` : ''}${p.html}${p.dark ? '</div>' : ''}</div></div>`).join('')}</div>
</body></html>`;
}

function screenshot(htmlPath, pngPath, width, height) {
  const chrome = '/usr/bin/google-chrome-stable';
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-sandbox', '--disable-dev-shm-usage',
    '--force-device-scale-factor=2',
    `--window-size=${width},${height}`,
    '--default-background-color=FFECE7DC',
    `--screenshot=${pngPath}`,
    '--virtual-time-budget=8000',
    'file://' + htmlPath,
  ];
  const r = spawnSync(chrome, args, { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) {
    console.error('chrome stderr', r.stderr && r.stderr.slice(-800));
    console.error('chrome stdout', r.stdout && r.stdout.slice(-400));
  }
  const st = fs.existsSync(pngPath) ? fs.statSync(pngPath) : null;
  console.log('screenshot', pngPath, st ? st.size : 'MISSING', 'exit', r.status);
}

const tb = JSON.parse(fs.readFileSync(path.join(OUT, 'sample-2042692.json'), 'utf8'));
const uc = JSON.parse(fs.readFileSync(path.join(OUT, 'sample-2041446-united-city.json'), 'utf8'));

const html1 = page(
  '土耳其 vs 比利时 · 六围对照页预览',
  '欧国联 2026-11-13 01:00（Asia/Shanghai）。球队六围如实暂无（缓存中没有欧国联球队统计）。球员对照其俱乐部联赛同位置、满 450 分钟的对照群。主队色 #5b7cfa，客队色 #ff4d7a。展开页从数据页的「详细对照 / 展开全部」或点开球员磁贴进入；返回键关闭对照页。',
  [
    { title: 'A. 数据页紧凑卡片（球队暂无 + 球员磁贴）', html: compactTab(tb) },
    { title: 'B. 球队展开页（诚实空态，不画空六边形）', html: teamExpand(tb) },
    { title: 'C. 球员展开 · 居莱尔 vs 西甲中场对照群（181 人）', html: playerPool(tb, 37547467) },
    { title: 'D. 双方球员对照 · 居莱尔 vs 多库（轴不同，两张雷达 + 共有分项）', html: playerH2h(tb, 37547467, 23697990) },
  ],
);
const p1 = path.join(OUT, 'preview-2042692.html');
fs.writeFileSync(p1, html1);
console.log('wrote', p1, html1.length);

const html2 = page(
  '曼联 vs 曼城 · 球队六围对照页预览',
  '英超 2026-09-13（Asia/Shanghai 23:30），jc 2041446。两边都有满 10 场的同赛事对照（20 支英超球队）。曼城控球推进分位 100、抢断拦截次数仅 20（控球型，次数轴不是能力差）；曼联身体对抗 100。左图浅色主题，右图 pitch 深色主题。数字全部来自窗口内真实统计，没有编造。',
  [
    { title: 'E. 球队展开页 · 浅色（叠加六边形 + 分项胶囊）', html: teamExpand(uc) },
    { title: 'F. 同一页 · pitch 深色主题', html: teamExpand(uc, { dark: true }), dark: true },
  ],
);
const p2 = path.join(OUT, 'preview-2041446-united-city.html');
fs.writeFileSync(p2, html2);
console.log('wrote', p2, html2.length);

screenshot(p1, path.join(OUT, 'preview-2042692.png'), 900, 4200);
screenshot(p2, path.join(OUT, 'preview-2041446-united-city.png'), 900, 2800);
