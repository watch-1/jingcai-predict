/**
 * Prematch player form cards and match-centre style stat bars.
 * Numbers come only from Sportmonks lineups.details and statistics.
 * A missing sample stays blank — nothing is filled in.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const FRESH_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 6 * 3600 * 1000;
const FORM_N = 8;

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
};

const BARS = [
  { key: 'possession', label: '控球率', ids: [45], codes: ['ball-possession'], unit: '%', avg: true },
  { key: 'shots', label: '射门', ids: [42], codes: ['shots-total'], unit: '' },
  { key: 'shotsOn', label: '射正', ids: [86], codes: ['shots-on-target'], unit: '' },
  { key: 'corners', label: '角球', ids: [34], codes: ['corners'], unit: '' },
  { key: 'fouls', label: '犯规', ids: [56], codes: ['fouls'], unit: '' },
  { key: 'yellows', label: '黄牌', ids: [84], codes: ['yellowcards'], unit: '' },
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
      const passes = detailNum(lu.details, DETAIL.passes);
      const accurate = detailNum(lu.details, DETAIL.accurate);
      const tackles = detailNum(lu.details, DETAIL.tackles);
      const goals = detailNum(lu.details, DETAIL.goals);
      const assists = detailNum(lu.details, DETAIL.assists);
      const played = [rating, minutes, shots, passes, tackles, goals, assists].some(v => v != null);
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
          passes: 0,
          accurate: 0,
          tackles: 0,
          tacklesN: 0,
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
      if (passes != null) row.passes += passes;
      if (accurate != null) row.accurate += accurate;
      if (tackles != null) { row.tackles += tackles; row.tacklesN += 1; }
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

function barsFromSides(home, away, homeId, awayId, labelMode) {
  const rows = [];
  for (const spec of BARS) {
    const h = sideStat(home.fixtures, homeId, spec);
    const a = sideStat(away.fixtures, awayId, spec);
    if (h == null && a == null) continue;
    rows.push({
      label: spec.label,
      unit: spec.unit,
      home: h,
      away: a,
    });
  }
  return { mode: labelMode, rows };
}

function currentBars(fx, homeId, awayId) {
  if (!fx || !(fx.statistics || []).length) return null;
  const rows = [];
  for (const spec of BARS) {
    const h = statValue(fx.statistics, homeId, 'home', spec);
    const a = statValue(fx.statistics, awayId, 'away', spec);
    if (h == null && a == null) continue;
    rows.push({ label: spec.label, unit: spec.unit, home: h, away: a });
  }
  return rows.length ? { mode: '本场', rows } : null;
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

function avatarHtml(src, name) {
  const letter = esc(([...String(name || '').trim()][0] || '').toUpperCase());
  let proxied = '';
  try {
    const u = new URL(String(src || ''));
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'https:' && (host === 'cdn.sportmonks.com' || host === 'media.sportmonks.com')
      && u.pathname.startsWith('/images/') && /\.(png|jpe?g|webp)$/i.test(u.pathname)) {
      proxied = '/api/logo?url=' + encodeURIComponent(u.toString());
    }
  } catch { /* no photo */ }
  const img = proxied ? `<img src="${esc(proxied)}" alt="" loading="lazy" onerror="this.remove()" />` : '';
  return `<span class="av">${img}<i>${letter}</i></span>`;
}

function renderFormHtml(pack) {
  const home = (pack && pack.players && pack.players.home) || [];
  const away = (pack && pack.players && pack.players.away) || [];
  if (!home.length && !away.length) {
    return `<section class="sm-kit sm-form"><h3>赛前近况</h3><p class="sm-empty">${esc((pack && pack.playerNote) || '近期完场没有上场明细。')}</p></section>`;
  }
  const list = (side, rows) => {
    const hidden = side === 'away' ? ' hidden' : '';
    if (!rows.length) return `<div class="sm-form-list" data-for="${side}"${hidden}><p class="sm-empty">这边近期没有上场明细。</p></div>`;
    return `<div class="sm-form-list" data-for="${side}"${hidden}>${rows.map(p => {
      const shown = p.nameZh ? { zh: p.nameZh, auto: !!p.nameZhAuto } : personLabel(p.name);
      const mark = shown.auto ? '<sup class="yi" title="程序自动音译">译</sup>' : '';
      return `<div class="ps-row">${avatarHtml(p.image, shown.zh)}<div class="num">${esc(p.jersey || '—')}</div><div class="who"><div class="nm">${esc(shown.zh)}${mark}</div><div class="sub">${esc(p.label)}${p.minutes != null ? ` · 场均 ${esc(p.minutes)}'` : ''}</div><div class="ps-chips-mini"><span>射 ${p.shots == null ? '—' : esc(p.shots)}</span><span>传成功 ${p.passPct == null ? '—' : esc(p.passPct) + '%'}</span><span>抢 ${p.tackles == null ? '—' : esc(p.tackles)}</span></div></div><div class="right"><span class="ps-rating ${ratingClass(p.rating)}">${p.rating == null ? '—' : esc(Number(p.rating).toFixed(2))}</span><div class="ps-ga">进/助 ${esc(p.goals)}/${esc(p.assists)}</div></div></div>`;
    }).join('')}</div>`;
  };
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  return `<section class="sm-kit sm-form" data-side="home"><div class="sm-kit-hd"><h3>赛前近况</h3><small>上场明细聚合，没有明细的场次不计入</small></div><div class="sm-switch"><button type="button" class="on" data-act="smFormSide" data-side="home">${esc(homeLab)}</button><button type="button" data-act="smFormSide" data-side="away">${esc(awayLab)}</button></div>${list('home', home)}${list('away', away)}</section>`;
}

function renderBarsHtml(pack) {
  const bars = pack && pack.bars;
  const rows = (bars && bars.rows) || [];
  if (!rows.length) {
    return `<section class="sm-kit sm-bars"><h3>统计</h3><p class="sm-empty">${esc((pack && pack.barNote) || '近期完场没有这项统计。')}</p></section>`;
  }
  const body = rows.map(s => {
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
  }).join('');
  const tip = bars.mode === '本场' ? '本场公开统计' : '两边各自近况场均，不是本场实时';
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  return `<section class="sm-kit sm-bars"><div class="sm-kit-hd"><h3>统计</h3><small>${esc(tip)}</small></div><div class="sm-legend"><i class="h"></i><span>${esc(homeLab)}</span><i class="a"></i><span>${esc(awayLab)}</span></div>${body}</section>`;
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
  if (cached && cached.fetchedAt) {
    const age = clock - Number(cached.fetchedAt);
    const has = cached.players && ((cached.players.home || []).length || (cached.players.away || []).length || (cached.bars && (cached.bars.rows || []).length));
    if (has && age < FRESH_MS) return cached;
    if (!has && age < NEGATIVE_MS) return cached;
  }
  const fetchJson = fetchImpl || (heatSource.readToken() ? heatSource.smGet : null);
  const empty = {
    matchId: String(matchId || ''),
    fetchedAt: clock,
    players: { home: [], away: [] },
    bars: { mode: '', rows: [] },
    playerNote: '近期完场没有上场明细。',
    barNote: '近期完场没有这项统计。',
  };
  if (!fetchJson || !matchId) return cached || Object.assign(empty, { reason: 'no-token' });
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
        const one = await fetchJson(`/football/fixtures/${hit.id}`, { include: 'participants;statistics.type' });
        current = one && one.data;
      }
    } catch { /* prematch often has no sheet */ }
  }
  const players = {
    home: aggregatePlayers(homeFx, homeSm),
    away: aggregatePlayers(awayFx, awaySm),
  };
  const bars = currentBars(current, homeSm, awaySm) || barsFromSides(
    { fixtures: homeFx },
    { fixtures: awayFx },
    homeSm,
    awaySm,
    '近况场均',
  );
  return writeCache({
    matchId: String(matchId),
    fetchedAt: clock,
    reason: '',
    homeSmId: homeSm,
    awaySmId: awaySm,
    players,
    bars,
    homeName: teamLabel(homeZh, ''),
    awayName: teamLabel(awayZh, ''),
    playerNote: (players.home.length || players.away.length) ? '' : '近期完场没有上场明细。',
    barNote: (bars.rows || []).length ? '' : '近期完场没有这项统计。',
  });
}

module.exports = {
  detailNum,
  aggregatePlayers,
  barsFromSides,
  currentBars,
  renderFormHtml,
  renderBarsHtml,
  ensureSurface,
};
