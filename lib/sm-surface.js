/**
 * Prematch player form cards and match-centre style stat bars.
 * Numbers come from Sportmonks lineups.details, statistics, and
 * official xG (xgfixture / xglineup), merged from the local warehouse
 * when a fetch lacks those bags. A missing sample stays blank — nothing is filled in.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const heatSource = require('./heat-source');

const FRESH_MS = 12 * 3600 * 1000;
const NEGATIVE_MS = 20 * 60 * 1000;
const FORM_N = 8;
const SCHEMA = 5;

/** Empty-state copy when we could not verify a SportMonks senior NT id.
 *  Must not pretend we looked up fixtures and found no lineups. */
const NO_TEAM_FORM = '本场还没有核验到国家队的赛事源编号，暂不展示近况，避免把别的球队误当成这一边。';
const NO_TEAM_POS = '本场还没有核验到国家队的赛事源编号，暂不对比各位置，避免硬凑。';
const NO_TEAM_BAR = '本场还没有核验到国家队的赛事源编号，暂不展示球队统计，避免硬凑。';
const NO_TEAM_GROWTH = '本场还没有核验到国家队的赛事源编号，暂不展示细项，避免硬凑。';

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
  saves: { ids: [57], codes: ['saves'] },
  keyPasses: { ids: [117], codes: ['key-passes'] },
  duels: { ids: [106], codes: ['duels-won'] },
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

function warehouseFixturePath(id) {
  return path.join(dataDir(), 'sm-lineups', 'fixtures', `${id}.json`);
}

function readWarehouseFixture(id) {
  if (id == null || id === '') return null;
  try {
    const j = JSON.parse(fs.readFileSync(warehouseFixturePath(id), 'utf8'));
    return (j && j.fixture) || j || null;
  } catch {
    return null;
  }
}

function xgFixtureRows(fx) {
  if (!fx) return [];
  const rows = fx.xgfixture || fx.xGFixture;
  return Array.isArray(rows) ? rows : [];
}

function lineupXgBag(lu) {
  if (!lu) return null;
  const bag = lu.xglineup || lu.xGLineup;
  return Array.isArray(bag) && bag.length ? bag : null;
}

/** Merge official + player xG from the local warehouse pack when a fetched fixture lacks them.
 *  Does not add SportMonks includes (quota). Does not invent empty bags. */
function mergeXgFromWarehouse(fx) {
  if (!fx || fx.id == null) return fx;
  const packed = readWarehouseFixture(fx.id);
  if (!packed) return fx;
  if (!xgFixtureRows(fx).length) {
    if (Array.isArray(packed.xgfixture) && packed.xgfixture.length) fx.xgfixture = packed.xgfixture;
    else if (Array.isArray(packed.xGFixture) && packed.xGFixture.length) fx.xGFixture = packed.xGFixture;
  }
  const packedLus = packed.lineups || [];
  if (!packedLus.length || !Array.isArray(fx.lineups)) return fx;
  const byPid = new Map();
  const byId = new Map();
  for (const lu of packedLus) {
    if (lu && lu.player_id != null) byPid.set(Number(lu.player_id), lu);
    if (lu && lu.id != null) byId.set(Number(lu.id), lu);
  }
  for (const lu of fx.lineups) {
    if (!lu || lineupXgBag(lu)) continue;
    const src = (lu.player_id != null && byPid.get(Number(lu.player_id)))
      || (lu.id != null && byId.get(Number(lu.id)));
    const bag = lineupXgBag(src);
    if (bag) lu.xglineup = bag;
  }
  return fx;
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

function lineupPosGroup(lu) {
  if (!lu) return '';
  const id = Number(
    lu.position_id
    || (lu.player && lu.player.position_id)
    || (lu.player && lu.player.position && lu.player.position.id)
  );
  if (id === 24) return 'GK';
  if (id === 25) return 'DF';
  if (id === 26) return 'MF';
  if (id === 27) return 'FW';
  const name = [
    lu.position_name,
    lu.player && lu.player.position && (lu.player.position.name || lu.player.position.developer_name),
    lu.player && lu.player.position_name,
  ].filter(Boolean).join(' ');
  const s = String(name).toLowerCase();
  if (/守门|门将|goalkeeper|\bgk\b/.test(s)) return 'GK';
  if (/后卫|中卫|边卫|defender|centre-?back|full-?back|wing-?back/.test(s)) return 'DF';
  if (/中场|后腰|前腰|midfield/.test(s)) return 'MF';
  if (/前锋|中锋|边锋|forward|attacker|striker|winger/.test(s)) return 'FW';
  return '';
}

const POS_FORM_GROUPS = [
  { key: 'GK', label: '门将' },
  { key: 'DF', label: '后卫' },
  { key: 'MF', label: '中场' },
  { key: 'FW', label: '前锋' },
];

function meanMetric(rows, key) {
  const vals = (rows || []).map((p) => p[key]).filter((v) => v != null && Number.isFinite(Number(v)));
  if (!vals.length) return null;
  const n = vals.reduce((s, v) => s + Number(v), 0) / vals.length;
  return Math.round(n * 10) / 10;
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
      const saves = detailNum(lu.details, DETAIL.saves);
      const keyPasses = detailNum(lu.details, DETAIL.keyPasses);
      const duels = detailNum(lu.details, DETAIL.duels);
      const px = lineupPlayerXg(lu);
      const played = [rating, minutes, shots, shotsOn, passes, tackles, tacklesWon, goals, assists, saves, keyPasses, duels, px.xg, px.xgot].some(v => v != null);
      if (!played) continue;
      if (!by.has(pid)) {
        by.set(pid, {
          player_id: pid,
          name: lu.player_name || (lu.player && (lu.player.display_name || lu.player.name)) || '球员',
          image: (lu.player && lu.player.image_path) || '',
          jersey: lu.jersey_number != null ? String(lu.jersey_number) : '',
          posGroup: lineupPosGroup(lu),
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
          xg: 0,
          xgN: 0,
          xgot: 0,
          xgotN: 0,
        });
      }
      const row = by.get(pid);
      if (!row.jersey && lu.jersey_number != null) row.jersey = String(lu.jersey_number);
      if (!row.image && lu.player && lu.player.image_path) row.image = lu.player.image_path;
      if (!row.posGroup) row.posGroup = lineupPosGroup(lu);
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
      if (saves != null) { row.saves = (row.saves || 0) + saves; row.savesN = (row.savesN || 0) + 1; }
      if (keyPasses != null) { row.keyPasses = (row.keyPasses || 0) + keyPasses; row.keyPassesN = (row.keyPassesN || 0) + 1; }
      if (duels != null) { row.duels = (row.duels || 0) + duels; row.duelsN = (row.duelsN || 0) + 1; }
      if (px.xg != null) { row.xg += px.xg; row.xgN += 1; }
      if (px.xgot != null) { row.xgot += px.xgot; row.xgotN += 1; }
    }
  }
  return [...by.values()].map(r => {
    const rating = r.ratingN ? r.ratingSum / r.ratingN : null;
    const minutes = r.minutesN ? r.minutesSum / r.minutesN : null;
    const shots = r.shotsN ? r.shots / r.shotsN : null;
    const tackles = r.tacklesN ? r.tackles / r.tacklesN : null;
    const passPct = r.passes > 0 ? (100 * r.accurate / r.passes) : null;
    const shotsOn = r.shotsOnN ? r.shotsOn / r.shotsOnN : null;
    const saves = r.savesN ? r.saves / r.savesN : null;
    const keyPasses = r.keyPassesN ? r.keyPasses / r.keyPassesN : null;
    const duels = r.duelsN ? r.duels / r.duelsN : null;
    const shown = personLabel(r.name);
    return {
      player_id: r.player_id,
      name: r.name,
      nameZh: shown.zh,
      nameZhAuto: shown.auto,
      image: r.image,
      jersey: r.jersey,
      posGroup: r.posGroup || '',
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
      shotsOn: shotsOn == null ? null : Math.round(shotsOn * 10) / 10,
      tackles: tackles == null ? null : Math.round(tackles * 10) / 10,
      passPct: passPct == null ? null : Math.round(passPct),
      saves: saves == null ? null : Math.round(saves * 10) / 10,
      keyPasses: keyPasses == null ? null : Math.round(keyPasses * 10) / 10,
      duels: duels == null ? null : Math.round(duels * 10) / 10,
      goals: r.goals,
      assists: r.assists,
      xg: r.xgN ? r.xg : null,
      xgN: r.xgN,
      xgot: r.xgotN ? r.xgot : null,
      xgotN: r.xgotN,
      xgAvg: r.xgN ? r.xg / r.xgN : null,
      xgotAvg: r.xgotN ? r.xgot / r.xgotN : null,
    };
  }).sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.apps - a.apps);
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

function meanVals(vals) {
  if (!vals || !vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Form-window official team xG average. Missing matches are skipped, not treated as 0.
 *  Player-sum is used only when the side has zero official values in the window. */
function sideFormXg(fixtures, teamId) {
  const official = [];
  const player = [];
  for (const fx of fixtures || []) {
    const off = officialTeamXg(fx, teamId);
    if (off.xg != null) official.push(off.xg);
    const sum = playerXgSum(fx, teamId);
    if (sum.xg != null) player.push(sum.xg);
  }
  if (official.length) return { value: meanVals(official), source: 'official', n: official.length };
  if (player.length) return { value: meanVals(player), source: 'player-sum', n: player.length };
  return { value: null, source: '', n: 0 };
}

function formXgGrowthRow(homeFixtures, awayFixtures, homeId, awayId, currentFx, mode) {
  const homeSide = currentFx ? sideFormXg([currentFx], homeId) : sideFormXg(homeFixtures, homeId);
  const awaySide = currentFx ? sideFormXg([currentFx], awayId) : sideFormXg(awayFixtures, awayId);
  if (homeSide.value == null && awaySide.value == null) return null;
  const usedFallback = homeSide.source === 'player-sum' || awaySide.source === 'player-sum';
  const thisMatch = !!currentFx || mode === '本场';
  const label = thisMatch
    ? (usedFallback ? '预期进球（球员xG合计）' : '预期进球')
    : (usedFallback ? '场均预期进球（球员xG合计）' : '场均预期进球');
  return { label, unit: '', home: homeSide.value, away: awaySide.value };
}

function insertXgGrowthRow(rows, xgRow) {
  if (!xgRow) return rows;
  const beforeInbox = rows.findIndex((r) => r.label === '禁区内射门');
  if (beforeInbox >= 0) {
    rows.splice(beforeInbox, 0, xgRow);
    return rows;
  }
  const afterMiss = rows.findIndex((r) => r.label === '绝佳机会浪费');
  if (afterMiss >= 0) rows.splice(afterMiss + 1, 0, xgRow);
  else rows.unshift(xgRow);
  return rows;
}

function growthPack(fx, homeFixtures, awayFixtures, homeId, awayId, mode) {
  const rows = fx
    ? rowsFor(GROWTH, null, null, homeId, awayId, fx)
    : rowsFor(GROWTH, homeFixtures, awayFixtures, homeId, awayId, null);
  insertXgGrowthRow(rows, formXgGrowthRow(homeFixtures, awayFixtures, homeId, awayId, fx || null, mode));
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
    xg: p.xg != null && Number.isFinite(Number(p.xg)) ? Number(p.xg) : null,
    xgN: p.xgN != null && Number.isFinite(Number(p.xgN)) ? Number(p.xgN) : null,
    xgot: p.xgot != null && Number.isFinite(Number(p.xgot)) ? Number(p.xgot) : null,
    xgAvg: p.xgAvg != null && Number.isFinite(Number(p.xgAvg)) ? Number(p.xgAvg) : null,
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
  const playerRow = (p, side) => {
    const shown = p.nameZh ? { zh: p.nameZh, auto: !!p.nameZhAuto } : personLabel(p.name);
    const mark = shown.auto ? '<sup class="yi" title="程序自动音译">译</sup>' : '';
    const teamLab = side === 'away' ? awayLab : homeLab;
    const payload = esc(encodeURIComponent(JSON.stringify(playerRowPayload(
      Object.assign({}, p, { nameZh: shown.zh, nameZhAuto: shown.auto }),
      teamLab,
      side,
    ))));
    return `<div class="ps-row ps-row--tappable" role="button" tabindex="0" data-act="smPlayerDetail" data-player="${payload}">${avatarHtml(p.image, shown.zh, p.name)}<div class="num">${esc(p.jersey || '—')}</div><div class="who"><div class="nm">${esc(shown.zh)}${mark}</div><div class="sub">${esc(p.label)}${p.minutes != null ? ` · 场均 ${esc(p.minutes)}'` : ''}</div><div class="ps-chips-mini"><span>射 ${p.shots == null ? '—' : esc(p.shots)}</span><span>传成功 ${p.passPct == null ? '—' : esc(p.passPct) + '%'}</span><span>抢 ${p.tackles == null ? '—' : esc(p.tackles)}</span></div></div><div class="right"><span class="ps-rating ${ratingClass(p.rating)}">${p.rating == null ? '—' : esc(Number(p.rating).toFixed(2))}</span><div class="ps-ga">进/助 ${esc(p.goals)}/${esc(p.assists)}</div></div></div>`;
  };
  const formRows = (side, rows) => {
    const known = (rows || []).filter((p) => p.posGroup && p.posGroup !== 'UNK');
    if (known.length >= Math.max(3, Math.ceil((rows || []).length * 0.3))) {
      return POS_FORM_GROUPS.map((g) => {
        const grp = known.filter((p) => p.posGroup === g.key).slice(0, 6);
        if (!grp.length) return '';
        return `<div class="pos-h">${esc(g.label)}</div>` + grp.map((p) => playerRow(p, side)).join('');
      }).filter(Boolean).join('');
    }
    return (rows || []).slice(0, 12).map((p) => playerRow(p, side)).join('');
  };
  const list = (side, rows) => {
    const hidden = side === 'away' ? ' hidden' : '';
    if (!rows.length) return `<div class="sm-form-list" data-for="${side}"${hidden}><p class="sm-empty">这边近期没有上场明细。</p></div>`;
    return `<div class="sm-form-list" data-for="${side}"${hidden}>${formRows(side, rows)}</div>`;
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


const POS_COMPARE = [
  { group: 'GK', label: '门将', metrics: [
    { key: 'saves', label: '场均扑救' },
    { key: 'rating', label: '场均评分' },
  ] },
  { group: 'DF', label: '后卫', metrics: [
    { key: 'tackles', label: '场均抢断' },
    { key: 'duels', label: '场均对抗成功' },
  ] },
  { group: 'MF', label: '中场', metrics: [
    { key: 'passPct', label: '传球成功率', unit: '%' },
    { key: 'keyPasses', label: '场均关键传球' },
    { key: 'xgAvg', label: '场均 xG' },
  ] },
  { group: 'FW', label: '前锋', metrics: [
    { key: 'shotsOn', label: '场均射正' },
    { key: 'goals', label: '近况进球' },
    { key: 'xgAvg', label: '场均 xG' },
  ] },
];

function renderPosCompareHtml(pack) {
  const home = (pack && pack.players && pack.players.home) || [];
  const away = (pack && pack.players && pack.players.away) || [];
  const covered = (rows) => (rows || []).filter((p) => p.posGroup && p.posGroup !== 'UNK');
  if (covered(home).length + covered(away).length < 4) {
    const note = (pack && pack.posNote) || '近况名单里位置信息不够，暂不对比，避免硬凑。';
    return `<section class="sm-kit sm-pos"><h3>各位置数据对比</h3><p class="sm-empty">${esc(note)}</p></section>`;
  }
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  const blocks = [];
  for (const g of POS_COMPARE) {
    const hr = covered(home).filter((p) => p.posGroup === g.group);
    const ar = covered(away).filter((p) => p.posGroup === g.group);
    const rows = [];
    for (const metric of g.metrics) {
      const hv = meanMetric(hr, metric.key);
      const av = meanMetric(ar, metric.key);
      if (hv == null && av == null) continue;
      rows.push(barRow({
        label: metric.label,
        unit: metric.unit || '',
        home: hv,
        away: av,
      }));
    }
    if (!rows.length) continue;
    blocks.push(`<div class="pos-h">${esc(g.label)}</div>${rows.join('')}`);
  }
  if (!blocks.length) {
    return `<section class="sm-kit sm-pos"><h3>各位置数据对比</h3><p class="sm-empty">这一项近期没有可对比的位置数据，有则显示，没有就不编。</p></section>`;
  }
  return `<section class="sm-kit sm-pos"><div class="sm-kit-hd"><h3>各位置数据对比</h3><small>按近况上场名单分位置场均，缺项显示为 —</small></div><div class="sm-legend"><i class="h"></i><span>${esc(homeLab)}</span><i class="a"></i><span>${esc(awayLab)}</span></div>${blocks.join('')}</section>`;
}


const XG_SPEC = { ids: [5304], codes: ['expected-goals', 'expected_goals'] };
const XGOT_SPEC = { ids: [5305], codes: ['expected-goals-on-target', 'expected_goals_on_target'] };
const INBOX_SPEC = GROWTH.find((s) => s.key === 'inBox');
const OUTBOX_SPEC = GROWTH.find((s) => s.key === 'outBox');

function xgNum(row) {
  if (!row) return null;
  const raw = row.data && row.data.value != null ? row.data.value : row.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Official team xG from xGFixture (preferred). Never invent 0. */
function officialTeamXg(fx, teamId) {
  const rows = (fx && (fx.xgfixture || fx.xGFixture)) || [];
  let xg = null;
  let xgot = null;
  for (const row of rows) {
    if (!row || Number(row.participant_id) !== Number(teamId)) continue;
    const tid = Number(row.type_id || (row.type && row.type.id));
    const v = xgNum(row);
    if (v == null) continue;
    if (tid === 5304 && xg == null) xg = v;
    else if (tid === 5305 && xgot == null) xgot = v;
  }
  return { xg, xgot };
}

function lineupPlayerXg(lu) {
  if (!lu) return { xg: null, xgot: null };
  const bags = lu.xglineup || lu.xGLineup || [];
  const details = bags.length ? bags : (lu.details || []);
  let xg = null;
  let xgot = null;
  for (const row of details) {
    const tid = Number(row.type_id || (row.type && row.type.id));
    const v = xgNum(row);
    if (v == null) continue;
    if (tid === 5304 && xg == null) xg = v;
    else if (tid === 5305 && xgot == null) xgot = v;
  }
  return { xg, xgot };
}

function playerXgSum(fx, teamId) {
  let xg = 0;
  let xgot = 0;
  let nXg = 0;
  let nXgot = 0;
  for (const lu of (fx && fx.lineups) || []) {
    if (Number(lu.team_id) !== Number(teamId)) continue;
    const px = lineupPlayerXg(lu);
    if (px.xg != null) { xg += px.xg; nXg += 1; }
    if (px.xgot != null) { xgot += px.xgot; nXgot += 1; }
  }
  return {
    xg: nXg ? +xg.toFixed(2) : null,
    xgot: nXgot ? +xgot.toFixed(2) : null,
  };
}

function fmtXg(n) {
  if (n == null || !Number.isFinite(Number(n))) return '暂无';
  return Number(n).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * This-match xG card. Official team xG preferred; otherwise label 球员xG合计;
 * otherwise 暂无. Box counts (types 49/50) are counts, never shot-location dots.
 */
function buildXgCard(fx, homeId, awayId) {
  if (!fx) {
    return { ok: false, reason: 'no_fixture', noteZh: '本场暂无预期进球与禁区射门次数', official: false };
  }
  const offH = officialTeamXg(fx, homeId);
  const offA = officialTeamXg(fx, awayId);
  let official = (offH.xg != null || offA.xg != null);
  let source = official ? 'official' : '';
  let sourceLabel = official ? '官方球队 xG' : '';
  let home = official ? offH : { xg: null, xgot: null };
  let away = official ? offA : { xg: null, xgot: null };
  if (!official) {
    const sumH = playerXgSum(fx, homeId);
    const sumA = playerXgSum(fx, awayId);
    if (sumH.xg != null || sumA.xg != null) {
      source = 'player-sum';
      sourceLabel = '球员xG合计';
      home = sumH;
      away = sumA;
    }
  }
  const inBox = {
    home: statValue(fx.statistics, homeId, 'home', INBOX_SPEC),
    away: statValue(fx.statistics, awayId, 'away', INBOX_SPEC),
  };
  const outBox = {
    home: statValue(fx.statistics, homeId, 'home', OUTBOX_SPEC),
    away: statValue(fx.statistics, awayId, 'away', OUTBOX_SPEC),
  };
  const hasBox = inBox.home != null || inBox.away != null || outBox.home != null || outBox.away != null;
  const hasXg = home.xg != null || away.xg != null;
  if (!hasXg && !hasBox) {
    return { ok: false, reason: 'no_xg_or_box', noteZh: '本场暂无预期进球与禁区射门次数', official: false };
  }
  return {
    ok: true,
    official,
    source,
    sourceLabel: sourceLabel || (hasBox && !hasXg ? '暂无预期进球，仅有禁区射门次数' : '暂无'),
    noteZh: hasXg
      ? (official ? '官方球队 xG。球场上是禁区内/外射门次数，不是单次落点。' : '官方球队 xG 暂缺，以下为球员 xG 合计，不是官方球队值。禁区内/外是次数，不是落点。')
      : '本场暂无预期进球数字。有禁区内/外射门次数时只展示次数，不画落点。',
    home,
    away,
    inBox,
    outBox,
    hasXg,
    hasBox,
  };
}

function xgCardFromGrowth(pack) {
  if (pack && pack.xgCard) return pack.xgCard;
  const growth = pack && pack.growth;
  if (!growth || growth.mode !== '本场') {
    return { ok: false, reason: 'no_this_match', noteZh: '本场暂无预期进球与禁区射门次数', official: false };
  }
  const pick = (lab) => (growth.rows || []).find((r) => r.label === lab);
  const inbox = pick('禁区内射门');
  const outbox = pick('禁区外射门');
  if (!inbox && !outbox) {
    return { ok: false, reason: 'no_xg_or_box', noteZh: '本场暂无预期进球与禁区射门次数', official: false };
  }
  return {
    ok: true,
    official: false,
    source: '',
    sourceLabel: '暂无预期进球，仅有禁区射门次数',
    noteZh: '本场暂无预期进球数字。有禁区内/外射门次数时只展示次数，不画落点。',
    home: { xg: null, xgot: null },
    away: { xg: null, xgot: null },
    inBox: { home: inbox ? inbox.home : null, away: inbox ? inbox.away : null },
    outBox: { home: outbox ? outbox.home : null, away: outbox ? outbox.away : null },
    hasXg: false,
    hasBox: true,
  };
}

function xgBarRow(label, home, away, unit) {
  const hv = Number(home);
  const av = Number(away);
  const max = Math.max(Number.isFinite(hv) ? hv : 0, Number.isFinite(av) ? av : 0, 0.01);
  const hp = Number.isFinite(hv) ? Math.round(hv / max * 100) : 0;
  const ap = Number.isFinite(av) ? Math.round(av / max * 100) : 0;
  const left = home == null ? '暂无' : (unit === '' && !Number.isInteger(Number(home)) ? fmtXg(home) : fmtNum(home, unit));
  const right = away == null ? '暂无' : (unit === '' && !Number.isInteger(Number(away)) ? fmtXg(away) : fmtNum(away, unit));
  return `<div class="xg-row"><div class="num left">${esc(left)}</div><div class="stat-mid"><div class="label">${esc(label)}</div><div class="bars"><div class="h"><i style="width:${hp}%"></i></div><div class="a"><i style="width:${ap}%"></i></div></div></div><div class="num right">${esc(right)}</div></div>`;
}

function xgPitchZones(card) {
  if (!card || !card.hasBox) return '';
  const z = (side, key, label, top) => {
    const bag = card[key] || {};
    const v = bag[side];
    const shown = v == null ? '暂无' : String(Math.round(Number(v)));
    return `<div class="xg-zone ${side}" style="top:${top}%"><b>${esc(shown)}</b><s>${esc(label)}</s></div>`;
  };
  // Simple pitch outline, zone counts only — no shot-location dots.
  const svg = `<svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="1" y="1" width="66" height="103" fill="none" stroke="rgba(213,224,208,.45)" stroke-width="1"/>
    <line x1="1" y1="52.5" x2="67" y2="52.5" stroke="rgba(213,224,208,.45)" stroke-width=".8"/>
    <circle cx="34" cy="52.5" r="9" fill="none" stroke="rgba(213,224,208,.4)" stroke-width=".8"/>
    <rect x="13.84" y="1" width="40.32" height="16.5" fill="none" stroke="rgba(213,224,208,.4)" stroke-width=".8"/>
    <rect x="13.84" y="87.5" width="40.32" height="16.5" fill="none" stroke="rgba(213,224,208,.4)" stroke-width=".8"/>
  </svg>`;
  return `<div class="xg-field" aria-label="禁区内/外射门次数">${svg}
    ${z('away', 'outBox', '客·禁区外', 18)}
    ${z('away', 'inBox', '客·禁区内', 34)}
    ${z('home', 'inBox', '主·禁区内', 66)}
    ${z('home', 'outBox', '主·禁区外', 82)}
  </div>`;
}

function renderXgCardHtml(pack) {
  const card = (pack && pack.xgCard) || xgCardFromGrowth(pack);
  const homeLab = teamLabel(pack && pack.homeName, '主队');
  const awayLab = teamLabel(pack && pack.awayName, '客队');
  if (!card || !card.ok) {
    return `<section class="lu-xg sm-kit"><div class="sm-kit-hd"><h3>预期进球</h3></div><p class="sm-empty">${esc((card && card.noteZh) || '本场暂无预期进球与禁区射门次数')}</p></section>`;
  }
  const sub = card.sourceLabel || '暂无';
  const hVal = card.hasXg ? fmtXg(card.home && card.home.xg) : '暂无';
  const aVal = card.hasXg ? fmtXg(card.away && card.away.xg) : '暂无';
  const src = card.hasXg && card.source === 'player-sum' ? '<span class="src">球员xG合计</span>' : (card.hasXg && card.official ? '<span class="src">官方</span>' : '');
  let rows = '';
  if (card.hasXg) rows += xgBarRow('预期进球', card.home && card.home.xg, card.away && card.away.xg, '');
  if (card.hasBox) {
    rows += xgBarRow('禁区内射门', card.inBox && card.inBox.home, card.inBox && card.inBox.away, '');
    rows += xgBarRow('禁区外射门', card.outBox && card.outBox.home, card.outBox && card.outBox.away, '');
  }
  return `<section class="lu-xg sm-kit"><div class="sm-kit-hd"><h3>预期进球</h3><small>${esc(sub)}</small></div>
    <p class="sub">${esc(card.noteZh || '')}</p>
    <div class="xg-top">
      <div class="side"><div class="lab">${esc(homeLab)}</div><div class="val">${esc(hVal)}</div>${src}</div>
      <div class="mid"><b>对照</b><em>xG</em></div>
      <div class="side"><div class="lab">${esc(awayLab)}</div><div class="val">${esc(aVal)}</div>${src}</div>
    </div>
    ${xgPitchZones(card)}
    ${rows}
  </section>`;
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
      if (one && one.data) out.push(mergeXgFromWarehouse(one.data));
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
    const pinned = heatSource.verifiedNtId && heatSource.verifiedNtId(zh, teamId);
    if (pinned) return pinned;
    const name = heatSource.englishName(teamId, zh);
    if (!name) return null;
    const found = await fetchJson(`/football/teams/search/${encodeURIComponent(name)}`);
    const picked = heatSource.pickTeamId(found && found.data, name);
    if (picked) return picked;
    // Search often omits senior European NTs; a verified pin may still exist
    // under the English name after the Chinese lookup above missed.
    const pinnedEn = heatSource.verifiedNtId && heatSource.verifiedNtId(name, teamId);
    return pinnedEn || null;
  }
  let homeSm = homeSmId || null;
  let awaySm = awaySmId || null;
  try {
    homeSm = await resolve(homeTeamId, homeZh, homeSm);
    awaySm = await resolve(awayTeamId, awayZh, awaySm);
  } catch {
    return cached || Object.assign(empty, { reason: 'lookup-failed' });
  }
  if (!homeSm && !awaySm) {
    return writeCache(Object.assign(empty, {
      reason: 'no-team',
      playerNote: NO_TEAM_FORM,
      posNote: NO_TEAM_POS,
      barNote: NO_TEAM_BAR,
      growthNote: NO_TEAM_GROWTH,
    }));
  }
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
        current = one && one.data ? mergeXgFromWarehouse(one.data) : null;
      }
    } catch { /* prematch often has no sheet */ }
  }
  const players = {
    home: aggregatePlayers(homeFx, homeSm),
    away: aggregatePlayers(awayFx, awaySm),
  };
  const thisMatch = currentBars(current, homeSm, awaySm);
  const xgCard = buildXgCard(current, homeSm, awaySm);
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
    xgCard,
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
  renderPosCompareHtml,
  renderBarsHtml,
  renderGrowthHtml,
  renderLiveHtml,
  photoList,
  growthPack,
  ensureSurface,
  playerRowPayload,
  buildXgCard,
  xgCardFromGrowth,
  renderXgCardHtml,
  officialTeamXg,
  playerXgSum,
  lineupPlayerXg,
  mergeXgFromWarehouse,
  sideFormXg,
  formXgGrowthRow,
  POS_COMPARE,
  NO_TEAM_FORM,
  NO_TEAM_POS,
  NO_TEAM_BAR,
  NO_TEAM_GROWTH,
  SCHEMA,
};
