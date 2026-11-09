/**
 * 赛前球员卡片和对比条。数字只来自已有上场明细和统计。
 * 没有样本就留空，不补。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const FRESH_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;
const FORM_N = 8;
const SCHEMA = 2;

const DETAIL = {
  rating: { ids: [118], codes: ['rating'] },
  minutes: { ids: [119], codes: ['minutes-played', 'cumulative-minutes-played'] },
  goals: { ids: [52], codes: ['goals'] },
  assists: { ids: [79], codes: ['assists'] },
  shots: { ids: [42], codes: ['shots-total'] },
  shotsOn: { ids: [86], codes: ['shots-on-target'] },
  passes: { ids: [80], codes: ['passes'] },
  accurate: { ids: [116, 81], codes: ['accurate-passes', 'successful-passes'] },
  tackles: { ids: [78], codes: ['tackles'] },
  tacklesWon: { ids: [27267], codes: ['tackles-won'] },
};

const BARS = [
  { key: 'possession', label: '控球率', ids: [45], codes: ['ball-possession'], unit: '%', avg: true },
  { key: 'shots', label: '射门', ids: [42], codes: ['shots-total'], unit: '' },
  { key: 'shotsOn', label: '射正', ids: [86], codes: ['shots-on-target'], unit: '' },
  { key: 'corners', label: '角球', ids: [34], codes: ['corners'], unit: '' },
  { key: 'fouls', label: '犯规', ids: [56], codes: ['fouls'], unit: '' },
  { key: 'yellows', label: '黄牌', ids: [84], codes: ['yellowcards'], unit: '' },
];

const GROWTH = [
  { key: 'bigCreated', label: '绝佳机会创造', ids: [580], codes: ['big-chances-created'], unit: '' },
  { key: 'bigMissed', label: '绝佳机会浪费', ids: [581], codes: ['big-chances-missed'], unit: '' },
  { key: 'inBox', label: '禁区内射门', ids: [49], codes: ['shots-insidebox'], unit: '' },
  { key: 'outBox', label: '禁区外射门', ids: [50], codes: ['shots-outsidebox'], unit: '' },
  { key: 'passPct', label: '传球成功率', ids: [82], codes: ['successful-passes-percentage'], unit: '%', avg: true },
  { key: 'passes', label: '传球总数', ids: [80], codes: ['passes'], unit: '' },
  { key: 'succPasses', label: '成功传球', ids: [81], codes: ['successful-passes'], unit: '' },
  { key: 'tackles', label: '抢断', ids: [78], codes: ['tackles'], unit: '' },
  { key: 'tacklesWon', label: '抢断成功', ids: [27267], codes: ['tackles-won'], unit: '' },
  { key: 'keyPasses', label: '关键传球', ids: [117], codes: ['key-passes'], unit: '' },
  { key: 'danger', label: '危险进攻', ids: [44], codes: ['dangerous-attacks'], unit: '' },
  { key: 'wood', label: '击中门框', ids: [64], codes: ['hit-woodwork'], unit: '' },
  { key: 'duels', label: '对抗成功', ids: [106], codes: ['duels-won'], unit: '' },
  { key: 'inter', label: '拦截', ids: [100], codes: ['interceptions'], unit: '' },
  { key: 'saves', label: '扑救', ids: [57], codes: ['saves'], unit: '' },
  { key: 'offsides', label: '越位', ids: [51], codes: ['offsides'], unit: '' },
  { key: 'crosses', label: '传中', ids: [98], codes: ['total-crosses'], unit: '' },
  { key: 'accCross', label: '准确传中', ids: [99], codes: ['accurate-crosses'], unit: '' },
];

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

function cacheFile(matchId) {
  return path.join(dataDir(), 'sm-surface', `${matchId}.json`);
}

function personLabel(name) {
  const raw = String(name || '').trim();
  try {
    const lt = require('./league-tables');
    const zh = lt.playerZh(raw) || raw;
    return { zh: zh || '球员', auto: zh !== raw && !!lt.playerZhAuto(raw) };
  } catch {
    return { zh: raw || '球员', auto: false };
  }
}

function teamLabel(name, fallback) {
  const raw = String(name || '').trim();
  if (!raw) return fallback;
  try {
    const zh = require('./league-tables').teamZh(raw);
    return (zh && String(zh).trim()) || fallback;
  } catch {
    return /[\u4e00-\u9fff]/.test(raw) ? raw : fallback;
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function detailNum(details, spec) {
  for (const d of details || []) {
    const id = Number(d.type_id || (d.type && d.type.id));
    const code = String(d.code || (d.type && d.type.code) || '').toLowerCase();
    if (!spec.ids.includes(id) && !spec.codes.includes(code)) continue;
    const raw = d.data && d.data.value != null ? d.data.value : d.value;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function statValue(statistics, teamId, location, spec) {
  const rows = statistics || [];
  const hit = rows.find(s => {
    const id = Number(s.type_id || (s.type && s.type.id));
    const code = String((s.type && s.type.code) || s.code || '').toLowerCase();
    if (!spec.ids.includes(id) && !spec.codes.includes(code)) return false;
    if (teamId != null && Number(s.participant_id) === Number(teamId)) return true;
    return location && s.location === location;
  });
  if (!hit) return null;
  const raw = hit.data && hit.data.value != null ? hit.data.value : hit.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function teamLocation(fx, teamId) {
  const p = (fx.participants || []).find(x => Number(x.id) === Number(teamId));
  return (p && p.meta && p.meta.location) || (p && p.location) || '';
}

function aggregatePlayers(fixtures, teamId) {
  const tid = Number(teamId);
  const by = new Map();
  for (const fx of fixtures || []) {
    for (const lu of fx.lineups || []) {
      if (Number(lu.team_id) !== tid) continue;
      const pid = lu.player_id;
      if (!pid) continue;
      const rating = detailNum(lu.details, DETAIL.rating);
      const minutes = detailNum(lu.details, DETAIL.minutes);
      const shots = detailNum(lu.details, DETAIL.shots);
      const shotsOn = detailNum(lu.details, DETAIL.shotsOn);
      const passes = detailNum(lu.details, DETAIL.passes);
      const accurate = detailNum(lu.details, DETAIL.accurate);
      const tackles = detailNum(lu.details, DETAIL.tackles);
      const tacklesWon = detailNum(lu.details, DETAIL.tacklesWon);
      const goals = detailNum(lu.details, DETAIL.goals);
      const assists = detailNum(lu.details, DETAIL.assists);
      const played = [rating, minutes, shots, shotsOn, passes, tackles, tacklesWon, goals, assists].some(v => v != null);
      if (!played) continue;
      if (!by.has(pid)) {
        by.set(pid, {
          player_id: pid,
          name: lu.player_name || (lu.player && (lu.player.display_name || lu.player.name)) || '球员',
          image: (lu.player && lu.player.image_path) || '',
          jersey: lu.jersey_number != null ? String(lu.jersey_number) : '',
          apps: 0,
          ratingSum: 0,
          ratingN: 0,
          minutesSum: 0,
          minutesN: 0,
          shots: 0,
          shotsN: 0,
          shotsOn: 0,
          shotsOnN: 0,
          passes: 0,
          accurate: 0,
          tackles: 0,
          tacklesN: 0,
          tacklesWon: 0,
          tacklesWonN: 0,
          goals: 0,
          assists: 0,
        });
      }
      const row = by.get(pid);
      if (!row.jersey && lu.jersey_number != null) row.jersey = String(lu.jersey_number);
      if (!row.image && lu.player && lu.player.image_path) row.image = lu.player.image_path;
      row.apps += 1;
      if (rating != null) { row.ratingSum += rating; row.ratingN += 1; }
      if (minutes != null) { row.minutesSum += minutes; row.minutesN += 1; }
      if (shots != null) { row.shots += shots; row.shotsN += 1; }
      if (shotsOn != null) { row.shotsOn += shotsOn; row.shotsOnN += 1; }
      if (passes != null) row.passes += passes;
      if (accurate != null) row.accurate += accurate;
      if (tackles != null) { row.tackles += tackles; row.tacklesN += 1; }
      if (tacklesWon != null) { row.tacklesWon += tacklesWon; row.tacklesWonN += 1; }
      row.goals += goals || 0;
      row.assists += assists || 0;
    }
  }
  return [...by.values()].map(r => {
    const rating = r.ratingN ? r.ratingSum / r.ratingN : null;
    const minutes = r.minutesN ? r.minutesSum / r.minutesN : null;
    const shots = r.shotsN ? r.shots / r.shotsN : null;
    const tackles = r.tacklesN ? r.tackles / r.tacklesN : null;
    const passPct = r.passes > 0 ? (100 * r.accurate / r.passes) : null;
    const shown = personLabel(r.name);
    return {
      player_id: r.player_id,
      name: r.name,
      nameZh: shown.zh,
      nameZhAuto: shown.auto,
      image: r.image,
      jersey: r.jersey,
      apps: r.apps,
      _totalShots: r.shots,
      _totalPasses: r.passes,
      _totalAccurate: r.accurate,
      _tacklesSum: r.tackles,
      _shotsOn: r.shotsOn,
      _tacklesWon: r.tacklesWon,
      label: r.apps >= 10 ? '近10场' : `近${r.apps}场有数据`,
      rating: rating == null ? null : Math.round(rating * 100) / 100,
      minutes: minutes == null ? null : Math.round(minutes),
      shots: shots == null ? null : Math.round(shots * 10) / 10,
      tackles: tackles == null ? null : Math.round(tackles * 10) / 10,
      passPct: passPct == null ? null : Math.round(passPct),
      goals: r.goals,
      assists: r.assists,
    };
  }).sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.apps - a.apps).slice(0, 12);
}

function sideStat(fixtures, teamId, spec) {
  const vals = [];
  for (const fx of fixtures || []) {
    const loc = teamLocation(fx, teamId);
    const n = statValue(fx.statistics, teamId, loc, spec);
    if (n != null) vals.push(n);
  }
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return spec.avg ? sum / vals.length : sum / vals.length;
}

function rowsFor(specs, homeFixtures, awayFixtures, homeId, awayId, currentFx) {
  const rows = [];
  for (const spec of specs) {
    const h = currentFx
      ? statValue(currentFx.statistics, homeId, 'home', spec)
      : sideStat(homeFixtures, homeId, spec);
    const a = currentFx
      ? statValue(currentFx.statistics, awayId, 'away', spec)
      : sideStat(awayFixtures, awayId, spec);
    if (h == null && a == null) continue;
    rows.push({ label: spec.label, unit: spec.unit || '', home: h, away: a });
  }
  return rows;
}

function barsFromSides(home, away, homeId, awayId, labelMode) {
  return { mode: labelMode, rows: rowsFor(BARS, home.fixtures, away.fixtures, homeId, awayId, null) };
}

function currentBars(fx, homeId, awayId) {
  if (!fx || !(fx.statistics || []).length) return null;
  const rows = rowsFor(BARS, null, null, homeId, awayId, fx);
  return rows.length ? { mode: '本场', rows } : null;
}

function growthPack(fx, homeFixtures, awayFixtures, homeId, awayId, mode) {
  const rows = fx
    ? rowsFor(GROWTH, null, null, homeId, awayId, fx)
    : rowsFor(GROWTH, homeFixtures, awayFixtures, homeId, awayId, null);
  return { mode, rows };
}

function fmtNum(n, unit) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const shown = unit === '%' || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
  return shown;
}

function ratingClass(n) {
  if (n == null) return 'lo';
  if (n >= 7.2) return 'hi';
  if (n >= 6.6) return 'mid';
  return 'lo';
}

/** Client 弹层：可序列化行数据（本场/近况聚合行同一结构） */
function playerRowPayload(p, teamZh, side) {
  const apps = p.apps != null ? Number(p.apps) : null;
  const totalShots = (p._totalShots != null) ? p._totalShots : (apps && p.shots != null ? p.shots * apps : null);
  const totalPasses = (p._totalPasses != null) ? p._totalPasses : null;
  const totalAccurate = (p._totalAccurate != null) ? p._totalAccurate : null;
  const tacklesSum = (p._tacklesSum != null) ? p._tacklesSum : (apps && p.tackles != null ? p.tackles * apps : null);
  const shotsOn = p._shotsOn != null ? p._shotsOn : null;
  const tacklesWon = p._tacklesWon != null ? p._tacklesWon : null;
  let shotOnPct = null;
  if (shotsOn != null && totalShots != null && totalShots > 0) shotOnPct = Math.round(100 * shotsOn / totalShots);
  let passSuccPct = p.passPct != null ? p.passPct : null;
  if (passSuccPct == null && totalPasses != null && totalPasses > 0 && totalAccurate != null) {
    passSuccPct = Math.round(100 * totalAccurate / totalPasses);
  }
  let tackleSuccPct = null;
  if (tacklesWon != null && tacklesSum != null && tacklesSum > 0) {
    tackleSuccPct = Math.round(100 * tacklesWon / tacklesSum);
  }
  return {
    player_id: p.player_id != null ? p.player_id : null,
    nameZh: p.nameZh || '',
    nameZhAuto: !!p.nameZhAuto,
    jersey: p.jersey || '',
    teamZh: teamZh || '',
    side: side || '',
    label: p.label || '',
    rating: p.rating != null ? p.rating : null,
    minutes: p.minutes != null ? p.minutes : null,
    goals: p.goals != null ? p.goals : 0,
    assists: p.assists != null ? p.assists : 0,
    shots: p.shots != null ? p.shots : null,
    passPct: p.passPct != null ? p.passPct : null,
    tackles: p.tackles != null ? p.tackles : null,
    apps,
    totalShots,
    totalPasses,
    totalAccurate,
    tacklesSum,
    shotsOn,
    tacklesWon,
    shotOnPct,
    passSuccPct,
    tackleSuccPct,
    image: usableImage(p.image, p.name),
  };
}

function photoList(pack) {
  const out = [];
  const seen = new Set();
  for (const bag of [pack && pack.players, pack && pack.livePlayers]) {
    if (!bag) continue;
    for (const side of ['home', 'away']) {
      for (const p of bag[side] || []) {
        const image = usableImage(p && p.image, p && p.name);
        if (!p || !image) continue;
        const key = String(p.player_id || p.name || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ name: p.name || '', nameZh: p.nameZh || '', image, jersey: p.jersey || '' });
      }
    }
  }
  return out.slice(0, 80);
}

function usableImage(image, name) {
  const logo = require('./logo-proxy');
  if (image && !logo.isPlaceholderPhoto(image) && logo.smPhotoProxy(image)) return image;
  return logo.fallbackPhotoUrl(name) || '';
}

function avatarHtml(src, name, nameEn) {
  const letter = esc(([...String(name || '').trim()][0] || '').toUpperCase());
  const shot = require('./logo-proxy').headshotSources(src, nameEn || name);
  const img = shot.src
    ? `<img src="${esc(shot.src)}" alt="" loading="lazy"${shot.alt ? ` data-alt="${esc(shot.alt)}"` : ''} onerror="if(!this.dataset.tried&&this.dataset.alt){this.dataset.tried=1;this.src=this.dataset.alt;return;}this.remove()" />`
    : '';
  return `<span class="av">${img}<i>${letter}</i></span>`;
}

function renderFormHtml(pack) {
  const home = (pack && pack.players && pack.players.home) || [];
  const away = (pack && pack.players && pack.players.away) || [];
  if (!home.length && !away.length) {
    return `<section class="sm-kit sm-form"><h3>赛前近况</h3><p class="sm-empty">${esc((pack && pack.playerNote) || '近期完场没有上场明细。')}</p></section>`;
  }
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  const list = (side, rows) => {
    const hidden = side === 'away' ? ' hidden' : '';
    if (!rows.length) return `<div class="sm-form-list" data-for="${side}"${hidden}><p class="sm-empty">这边近期没有上场明细。</p></div>`;
    return `<div class="sm-form-list" data-for="${side}"${hidden}>${rows.map(p => {
      const shown = p.nameZh ? { zh: p.nameZh, auto: !!p.nameZhAuto } : personLabel(p.name);
      const mark = shown.auto ? '<sup class="yi" title="程序自动音译">译</sup>' : '';
      const teamLab = side === 'away' ? awayLab : homeLab;
      const payload = esc(encodeURIComponent(JSON.stringify(playerRowPayload(
        Object.assign({}, p, { nameZh: shown.zh, nameZhAuto: shown.auto }),
        teamLab,
        side,
      ))));
      return `<div class="ps-row ps-row--tappable" role="button" tabindex="0" data-act="smPlayerDetail" data-player="${payload}">${avatarHtml(p.image, shown.zh, p.name)}<div class="num">${esc(p.jersey || '—')}</div><div class="who"><div class="nm">${esc(shown.zh)}${mark}</div><div class="sub">${esc(p.label)}${p.minutes != null ? ` · 场均 ${esc(p.minutes)}'` : ''}</div><div class="ps-chips-mini"><span>射 ${p.shots == null ? '—' : esc(p.shots)}</span><span>传成功 ${p.passPct == null ? '—' : esc(p.passPct) + '%'}</span><span>抢 ${p.tackles == null ? '—' : esc(p.tackles)}</span></div></div><div class="right"><span class="ps-rating ${ratingClass(p.rating)}">${p.rating == null ? '—' : esc(Number(p.rating).toFixed(2))}</span><div class="ps-ga">进/助 ${esc(p.goals)}/${esc(p.assists)}</div></div></div>`;
    }).join('')}</div>`;
  };
  const title = (pack && pack.formTitle) || '赛前近况';
  const hint = (pack && pack.formHint) || '上场明细聚合，没有明细的场次不计入';
  return `<section class="sm-kit sm-form" data-side="home"><div class="sm-kit-hd"><h3>${esc(title)}</h3><small>${esc(hint)}</small></div><div class="sm-switch"><button type="button" class="on" data-act="smFormSide" data-side="home">${esc(homeLab)}</button><button type="button" data-act="smFormSide" data-side="away">${esc(awayLab)}</button></div>${list('home', home)}${list('away', away)}</section>`;
}

function possRing(home, away, homeLab, awayLab) {
  const h = Number(home);
  const a = Number(away);
  const hv = Number.isFinite(h) ? h : 0;
  const av = Number.isFinite(a) ? a : 0;
  const sum = hv + av;
  const hp = sum ? hv / sum : 0.5;
  const r = 34;
  const c = 2 * Math.PI * r;
  const dashH = (c * hp).toFixed(1);
  return `<div class="sm-ring"><svg viewBox="0 0 88 88" aria-hidden="true">
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#f3d0dc" stroke-width="9"/>
    <circle cx="44" cy="44" r="${r}" fill="none" stroke="#5b7cfa" stroke-width="9" stroke-dasharray="${dashH} ${c.toFixed(1)}" stroke-linecap="butt" transform="rotate(-90 44 44)"/>
    <text x="44" y="42" text-anchor="middle" class="ring-h">${sum ? Math.round(hp * 100) : '—'}%</text>
    <text x="44" y="56" text-anchor="middle" class="ring-a">${sum ? Math.round((1 - hp) * 100) : '—'}%</text>
  </svg><div class="sm-ring-labs"><span class="h">${esc(homeLab)} ${esc(fmtNum(home, '%'))}%</span><b>控球率</b><span class="a">${esc(fmtNum(away, '%'))}% ${esc(awayLab)}</span></div></div>`;
}

function renderBarsHtml(pack) {
  const bars = pack && pack.bars;
  const rows = (bars && bars.rows) || [];
  if (!rows.length) {
    return `<section class="sm-kit sm-bars"><h3>球队统计</h3><p class="sm-empty">${esc((pack && pack.barNote) || '近期完场没有这项统计。')}</p></section>`;
  }
  const tip = bars.mode === '本场' ? '本场公开统计' : '两边各自近况场均，不是本场实时';
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  const poss = rows.find(s => s.label === '控球率');
  const rest = rows.filter(s => s !== poss);
  const restBody = rest.map(s => barRow(s)).join('');
  const ring = poss ? possRing(poss.home, poss.away, homeLab, awayLab) : '';
  return `<section class="sm-kit sm-bars"><div class="sm-kit-hd"><h3>球队统计</h3><small>${esc(tip)}</small></div><div class="sm-legend"><i class="h"></i><span>${esc(homeLab)}</span><i class="a"></i><span>${esc(awayLab)}</span></div>${ring}${restBody}</section>`;
}

function barRow(s) {
  const hv = Number(s.home);
  const av = Number(s.away);
  const unit = s.unit || '';
  let hp = 0;
  let ap = 0;
  if (unit === '%') {
    hp = Number.isFinite(hv) ? hv : 0;
    ap = Number.isFinite(av) ? av : 0;
  } else {
    const max = Math.max(Number.isFinite(hv) ? hv : 0, Number.isFinite(av) ? av : 0, 0.01);
    hp = Number.isFinite(hv) ? Math.round(hv / max * 100) : 0;
    ap = Number.isFinite(av) ? Math.round(av / max * 100) : 0;
  }
  return `<div class="stat-row"><div class="num left">${esc(fmtNum(s.home, unit))}${esc(unit)}</div><div class="stat-mid"><div class="label">${esc(s.label)}</div><div class="bars"><div class="h"><i style="width:${hp}%"></i></div><div class="a"><i style="width:${ap}%"></i></div></div></div><div class="num right">${esc(fmtNum(s.away, unit))}${esc(unit)}</div></div>`;
}

function renderGrowthHtml(pack) {
  const growth = pack && pack.growth;
  const rows = (growth && growth.rows) || [];
  if (!rows.length) {
    return `<section class="sm-kit sm-growth"><h3>细项</h3><p class="sm-empty">${esc((pack && pack.growthNote) || '近期完场没有这项细项。')}</p></section>`;
  }
  const tip = growth.mode === '本场' ? '本场公开细项' : '两边各自近况场均';
  const body = rows.map(s => `<div class="gr-row"><span class="n">${esc(s.label)}</span><span class="h">${esc(fmtNum(s.home, s.unit))}${esc(s.unit || '')}</span><span class="dot">·</span><span class="a">${esc(fmtNum(s.away, s.unit))}${esc(s.unit || '')}</span></div>`).join('');
  return `<section class="sm-kit sm-growth"><div class="sm-kit-hd"><h3>细项</h3><small>${esc(tip)}</small></div>${body}</section>`;
}

function renderLiveHtml(pack) {
  const players = pack && pack.livePlayers;
  const home = (players && players.home) || [];
  const away = (players && players.away) || [];
  if (!home.length && !away.length) {
    return `<section class="sm-kit sm-live"><h3>赛中球员</h3><p class="sm-empty">${esc((pack && pack.liveNote) || '开赛后这里显示本场上场数据。没有明细就不编。')}</p><p class="sm-empty">落点和事件动画是示意，不是定位热力图。</p></section>`;
  }
  return renderFormHtml({
    players: { home, away },
    homeName: pack.homeName,
    awayName: pack.awayName,
    formTitle: '赛中球员',
    formHint: '本场上场明细。落点动画是示意，不是定位热力。',
  });
}

function ymd(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function readCache(matchId) {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile(matchId), 'utf8'));
    if (j && j.matchId != null) return j;
  } catch { /* miss */ }
  return null;
}

function writeCache(pack) {
  const file = cacheFile(pack.matchId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pack));
  fs.renameSync(tmp, file);
  return pack;
}

async function recentFixtures(smId, fetchJson, clock) {
  if (!smId) return [];
  const body = await fetchJson(`/football/fixtures/between/${ymd(clock - 160 * 86400000)}/${ymd(clock)}/${smId}`, {
    include: 'participants;state',
    per_page: 30,
  });
  const ids = ((body && body.data) || [])
    .filter(heatSource.isFinished)
    .sort((a, b) => String(b.starting_at || '').localeCompare(String(a.starting_at || '')))
    .map(fx => fx.id)
    .filter(Boolean)
    .slice(0, FORM_N);
  const out = [];
  for (const id of ids) {
    try {
      const one = await fetchJson(`/football/fixtures/${id}`, {
        include: 'lineups.details.type;lineups.player;participants;statistics.type',
      });
      if (one && one.data) out.push(one.data);
    } catch { /* skip one */ }
  }
  return out;
}

async function ensureSurface({
  matchId, homeTeamId, awayTeamId, homeZh, awayZh,
  homeSmId, awaySmId, kickoffMs, fetchImpl, now,
} = {}) {
  const clock = now || Date.now();
  const cached = matchId ? readCache(matchId) : null;
  if (cached && cached.schema === SCHEMA && cached.fetchedAt) {
    const age = clock - Number(cached.fetchedAt);
    const has = cached.players && ((cached.players.home || []).length || (cached.players.away || []).length || (cached.bars && (cached.bars.rows || []).length));
    if (has && age < FRESH_MS) return cached;
    if (!has && age < NEGATIVE_MS) return cached;
  }
  const fetchJson = fetchImpl || (heatSource.readToken() ? heatSource.smGet : null);
  const empty = {
    matchId: String(matchId || ''),
    schema: SCHEMA,
    fetchedAt: clock,
    players: { home: [], away: [] },
    bars: { mode: '', rows: [] },
    growth: { mode: '', rows: [] },
    livePlayers: { home: [], away: [] },
    playerNote: '近期完场没有上场明细。',
    barNote: '近期完场没有这项统计。',
    growthNote: '近期完场没有这项细项。',
    liveNote: '开赛后这里显示本场上场数据。没有明细就不编。',
  };
  if (!fetchJson || !matchId) {
    if (cached && cached.schema === SCHEMA) return cached;
    return cached && cached.players ? cached : Object.assign(empty, {
      reason: 'no-token',
      playerNote: '这场的球员和球队统计还没接到。',
      barNote: '这场的球员和球队统计还没接到。',
      growthNote: '这场的球员和球队统计还没接到。',
    });
  }
  async function resolve(teamId, zh, known) {
    if (known) return known;
    const name = heatSource.englishName(teamId, zh);
    if (!name) return null;
    const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    return heatSource.pickTeamId(found && found.data, name);
  }
  let homeSm = homeSmId || null;
  let awaySm = awaySmId || null;
  try {
    homeSm = await resolve(homeTeamId, homeZh, homeSm);
    awaySm = await resolve(awayTeamId, awayZh, awaySm);
  } catch {
    return cached || Object.assign(empty, { reason: 'lookup-failed' });
  }
  if (!homeSm && !awaySm) return writeCache(Object.assign(empty, { reason: 'no-team' }));
  let homeFx = [];
  let awayFx = [];
  try { homeFx = await recentFixtures(homeSm, fetchJson, clock); } catch { homeFx = []; }
  try { awayFx = await recentFixtures(awaySm, fetchJson, clock); } catch { awayFx = []; }
  let current = null;
  if (homeSm && awaySm) {
    try {
      const ko = Number.isFinite(kickoffMs) ? kickoffMs : clock;
      const body = await fetchJson(`/football/fixtures/between/${ymd(ko - 36 * 3600e3)}/${ymd(ko + 36 * 3600e3)}/${homeSm}`, {
        include: 'participants',
        per_page: 20,
      });
      const hit = ((body && body.data) || []).find(fx => {
        const ids = (fx.participants || []).map(p => Number(p.id));
        return ids.includes(Number(homeSm)) && ids.includes(Number(awaySm));
      });
      if (hit && hit.id) {
        const one = await fetchJson(`/football/fixtures/${hit.id}`, {
          include: 'participants;statistics.type;lineups.details.type;lineups.player',
        });
        current = one && one.data;
      }
    } catch { /* prematch often has no sheet */ }
  }
  const players = {
    home: aggregatePlayers(homeFx, homeSm),
    away: aggregatePlayers(awayFx, awaySm),
  };
  const thisMatch = currentBars(current, homeSm, awaySm);
  const bars = thisMatch || barsFromSides(
    { fixtures: homeFx },
    { fixtures: awayFx },
    homeSm,
    awaySm,
    '近况场均',
  );
  const growth = growthPack(thisMatch ? current : null, homeFx, awayFx, homeSm, awaySm, bars.mode);
  const markLive = rows => rows.map(p => Object.assign({}, p, { label: '本场' }));
  const livePlayers = {
    home: current ? markLive(aggregatePlayers([current], homeSm)) : [],
    away: current ? markLive(aggregatePlayers([current], awaySm)) : [],
  };
  return writeCache({
    matchId: String(matchId),
    schema: SCHEMA,
    fetchedAt: clock,
    reason: '',
    homeSmId: homeSm,
    awaySmId: awaySm,
    players,
    bars,
    growth,
    livePlayers,
    homeName: teamLabel(homeZh, ''),
    awayName: teamLabel(awayZh, ''),
    playerNote: (players.home.length || players.away.length) ? '' : '近期完场没有上场明细。',
    barNote: (bars.rows || []).length ? '' : '近期完场没有这项统计。',
    growthNote: (growth.rows || []).length ? '' : '近期完场没有这项细项。',
    liveNote: (livePlayers.home.length || livePlayers.away.length) ? '' : '开赛后这里显示本场上场数据。没有明细就不编。',
  });
}

module.exports = {
  detailNum,
  aggregatePlayers,
  barsFromSides,
  currentBars,
  renderFormHtml,
  renderBarsHtml,
  renderGrowthHtml,
  renderLiveHtml,
  photoList,
  growthPack,
  ensureSurface,
  playerRowPayload,
};
