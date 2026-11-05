/**
 * Prematch attack / defense heat from ball coordinates.
 * Coordinates are absolute pitch x,y in [0, 1], not team-tagged.
 * Assumption (same as the predict kit): 1st half home attacks toward x→1;
 * 2nd half the sides switch. We mirror so the focus side always attacks left→right.
 * Product drawing follows the locked full-pitch look: thin attack polylines and
 * soft defensive blobs. Missing coordinates stay an empty note — nothing is invented.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

const EVT_GOAL = 14;
const EVT_OWNGOAL = 15;
const EVT_PENALTY = 16;

function periodKind(desc) {
  const s = String(desc || '').toLowerCase();
  if (s.includes('1st') || s.includes('first') || s === '1h' || s.includes('上半')) return '1h';
  if (s.includes('2nd') || s.includes('second') || s === '2h' || s.includes('下半')) return '2h';
  if (s.includes('extra') && s.includes('1')) return '1h';
  if (s.includes('extra') && s.includes('2')) return '2h';
  return 'other';
}

function toAttackCoords(x, y, { isHome, periodDesc } = {}) {
  let xn = Number(x);
  let yn = Number(y);
  if (!Number.isFinite(xn) || !Number.isFinite(yn)) return null;
  const pk = periodKind(periodDesc);
  let mirror = false;
  if (isHome) mirror = pk === '2h';
  else mirror = pk === '1h' || pk === 'other';
  if (mirror) {
    xn = 1 - xn;
    yn = 1 - yn;
  }
  xn = Math.min(0.999, Math.max(0, xn));
  yn = Math.min(0.999, Math.max(0, yn));
  return { x: xn, y: yn };
}

function toDefendCoords(x, y, ctx) {
  return toAttackCoords(x, y, { isHome: !ctx.isHome, periodDesc: ctx.periodDesc });
}

function parseTimerToMinute(timer) {
  if (timer == null) return null;
  const m = String(timer).match(/^(\d+)(?::(\d+))?/);
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
}

function emptyCells() {
  return Array.from({ length: 6 }, () => Array(8).fill(0));
}

function finalizeCells(cells, left, mid, right, used, skipped, nPoints, nZone, extra) {
  const den = left + mid + right || 1;
  let max = 0;
  for (const row of cells) for (const v of row) max = Math.max(max, v);
  const lcr = {
    left: +(left / den).toFixed(3),
    central: +(mid / den).toFixed(3),
    right: +(right / den).toFixed(3),
  };
  let dominant = 'central';
  if (lcr.left >= lcr.central && lcr.left >= lcr.right) dominant = 'left';
  else if (lcr.right >= lcr.central && lcr.right >= lcr.left) dominant = 'right';
  const domZh = { left: '左路', central: '中路', right: '右路' }[dominant];
  return {
    available: used.length > 0 && nZone > 0,
    fixtures_used: used.length,
    used,
    skipped: skipped.slice(0, 8),
    n_points_sampled: nPoints,
    n_zone_points: nZone,
    cells,
    max,
    lcr,
    dominant,
    dominant_zh: domZh,
    ...extra,
  };
}

function sideOf(fx, teamId) {
  const tid = Number(teamId);
  const parts = fx.participants || [];
  const home = parts.find(p => p && p.meta && p.meta.location === 'home')
    || parts.find(p => p && (p.location === 'home' || p.meta && p.meta.location === 'home'));
  const away = parts.find(p => p && p.meta && p.meta.location === 'away')
    || parts.find(p => p && (p.location === 'away' || p.meta && p.meta.location === 'away'));
  if (!home || !away) return null;
  const homeId = Number(home.id != null ? home.id : home.team_id);
  const awayId = Number(away.id != null ? away.id : away.team_id);
  if (homeId === tid) return { isHome: true, home, away };
  if (awayId === tid) return { isHome: false, home, away };
  return null;
}

function aggregateAttackHeat(fixturePayloads, teamId, { maxFixtures = 5, attackX = 0.55 } = {}) {
  const cells = emptyCells();
  let nPoints = 0;
  let nZone = 0;
  let left = 0;
  let mid = 0;
  let right = 0;
  const used = [];
  const skipped = [];
  for (const fx of fixturePayloads || []) {
    if (used.length >= maxFixtures) break;
    const side = sideOf(fx, teamId);
    if (!side) {
      skipped.push({ id: fx.id, reason: 'team-not-in-fixture' });
      continue;
    }
    const bc = fx.ballcoordinates || fx.ballCoordinates || [];
    if (!bc.length) {
      skipped.push({ id: fx.id, reason: 'no-coordinates' });
      continue;
    }
    const periodMap = Object.fromEntries((fx.periods || []).map(p => [p.id, p.description || p.kind]));
    const step = Math.max(1, Math.floor(bc.length / 350));
    let added = 0;
    for (let i = 0; i < bc.length; i += step) {
      const p = bc[i];
      const pt = toAttackCoords(p.x, p.y, {
        isHome: side.isHome,
        periodDesc: p.period || periodMap[p.period_id],
      });
      if (!pt) continue;
      nPoints++;
      if (pt.x < attackX) continue;
      nZone++;
      added++;
      const cx = Math.min(7, Math.floor(pt.x * 8));
      const cy = Math.min(5, Math.floor(pt.y * 6));
      cells[cy][cx] += 1;
      if (pt.y < 1 / 3) left++;
      else if (pt.y < 2 / 3) mid++;
      else right++;
    }
    used.push({ id: fx.id, points_used: added, as: side.isHome ? 'home' : 'away' });
  }
  return finalizeCells(cells, left, mid, right, used, skipped, nPoints, nZone, { kind: 'attack' });
}

function aggregateDefenseHeat(fixturePayloads, teamId, {
  maxFixtures = 5, dangerX = 0.55, goalWindowMin = 1.25, goalBoost = 3,
} = {}) {
  const tid = Number(teamId);
  const cells = emptyCells();
  let nPoints = 0;
  let nZone = 0;
  let left = 0;
  let mid = 0;
  let right = 0;
  let nGoals = 0;
  const used = [];
  const skipped = [];
  for (const fx of fixturePayloads || []) {
    if (used.length >= maxFixtures) break;
    const side = sideOf(fx, teamId);
    if (!side) {
      skipped.push({ id: fx.id, reason: 'team-not-in-fixture' });
      continue;
    }
    const bc = fx.ballcoordinates || fx.ballCoordinates || [];
    if (!bc.length) {
      skipped.push({ id: fx.id, reason: 'no-coordinates' });
      continue;
    }
    const periodMap = Object.fromEntries((fx.periods || []).map(p => [p.id, p.description || p.kind]));
    const concedeMinutes = [];
    for (const e of fx.events || []) {
      if (![EVT_GOAL, EVT_OWNGOAL, EVT_PENALTY].includes(e.type_id)) continue;
      let conceded = false;
      if (e.type_id === EVT_OWNGOAL) conceded = Number(e.participant_id) === tid;
      else conceded = Number(e.participant_id) !== tid;
      if (!conceded) continue;
      nGoals++;
      concedeMinutes.push((Number(e.minute) || 0) + (Number(e.extra_minute) || 0) / 60);
    }
    const step = Math.max(1, Math.floor(bc.length / 350));
    let added = 0;
    for (let i = 0; i < bc.length; i += step) {
      const p = bc[i];
      const pt = toDefendCoords(p.x, p.y, {
        isHome: side.isHome,
        periodDesc: p.period || periodMap[p.period_id],
      });
      if (!pt) continue;
      nPoints++;
      if (pt.x < dangerX) continue;
      let w = 1;
      const tMin = parseTimerToMinute(p.timer);
      if (tMin != null) {
        for (const gm of concedeMinutes) {
          if (Math.abs(tMin - gm) <= goalWindowMin) { w = goalBoost; break; }
        }
      }
      nZone += w;
      added += w;
      const cx = Math.min(7, Math.floor(pt.x * 8));
      const cy = Math.min(5, Math.floor(pt.y * 6));
      cells[cy][cx] += w;
      if (pt.y < 1 / 3) left += w;
      else if (pt.y < 2 / 3) mid += w;
      else right += w;
    }
    used.push({ id: fx.id, points_used: added, as: side.isHome ? 'home' : 'away' });
  }
  const heat = finalizeCells(cells, left, mid, right, used, skipped, nPoints, nZone, { kind: 'defense' });
  heat.n_goals_conceded = nGoals;
  return heat;
}

function formToFixtures(form) {
  const out = [];
  for (const row of (form && form.matches) || []) {
    const bc = row.ballcoordinates || row.ballCoordinates;
    if (!bc || !bc.length) continue;
    out.push({
      id: row.id || row.matchId,
      participants: [
        { id: Number(row.homeTeamId), meta: { location: 'home' } },
        { id: Number(row.awayTeamId), meta: { location: 'away' } },
      ],
      periods: row.periods || [],
      ballcoordinates: bc,
      events: row.events || [],
    });
  }
  return out;
}

function readHeatPack(teamId) {
  if (teamId == null || teamId === '') return { fixtures: [], sideId: teamId, fetchedAt: 0 };
  const file = path.join(dataDir(), 'predict-heat', `${teamId}.json`);
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(j)) return { fixtures: j, sideId: teamId, fetchedAt: 0 };
    if (j && Array.isArray(j.fixtures)) {
      return {
        fixtures: j.fixtures,
        sideId: j.smTeamId || teamId,
        smTeamId: j.smTeamId || null,
        fetchedAt: Number(j.fetchedAt) || 0,
        reason: j.reason || '',
      };
    }
  } catch { /* no cache */ }
  return { fixtures: [], sideId: teamId, fetchedAt: 0 };
}

function readDiskFixtures(teamId) {
  return readHeatPack(teamId).fixtures;
}

function loadFixturesForTeam(teamId, form) {
  return loadHeatPack(teamId, form).fixtures;
}

/** Disk cache wins when it has fixtures. Form rows are the offline fallback. */
function loadHeatPack(teamId, form) {
  const disk = readHeatPack(teamId);
  if (disk.fixtures.length) return disk;
  return { fixtures: formToFixtures(form), sideId: teamId, fetchedAt: disk.fetchedAt, reason: disk.reason || '' };
}

function buildMatchHeat({ homeId, awayId, homeFixtures, awayFixtures } = {}) {
  const hFx = homeFixtures || [];
  const aFx = awayFixtures || [];
  const checked = true;
  if (!hFx.length && !aFx.length) {
    return {
      available: false,
      checked,
      note: '近期完场没有落点，画不出攻防路线。',
    };
  }
  const homeAttack = aggregateAttackHeat(hFx, homeId);
  const awayAttack = aggregateAttackHeat(aFx, awayId);
  const homeDefend = aggregateDefenseHeat(hFx, homeId);
  const awayDefend = aggregateDefenseHeat(aFx, awayId);
  const available = !!(homeAttack.available || awayAttack.available || homeDefend.available || awayDefend.available);
  return {
    available,
    checked,
    note: available ? '' : '近期完场没有落点，画不出攻防路线。',
    homeAttack,
    awayAttack,
    homeDefend,
    awayDefend,
  };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attackPaths(cells) {
  if (!cells || !cells.length) return [];
  const rows = cells.length;
  const cols = cells[0].length;
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 4; c < cols; c++) total += cells[r][c] || 0;
  }
  if (total <= 0) return [];
  const bands = [[0, 1], [2, 3], [4, 5]];
  const paths = [];
  for (const [r0, r1] of bands) {
    let mass = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = 4; c < cols; c++) mass += (cells[r] && cells[r][c]) || 0;
    }
    if (mass / total < 0.12) continue;
    const pts = [{ x: 0.46, y: ((r0 + r1) / 2 + 0.5) / rows }];
    for (let c = 4; c < cols; c++) {
      let w = 0;
      let y = 0;
      for (let r = r0; r <= r1; r++) {
        const v = (cells[r] && cells[r][c]) || 0;
        w += v;
        y += v * ((r + 0.5) / rows);
      }
      if (!w) continue;
      pts.push({ x: (c + 0.5) / cols, y: y / w });
    }
    if (pts.length >= 2) paths.push({ pts, mass, share: mass / total, band: r0 === 0 ? 'left' : r0 === 2 ? 'central' : 'right' });
  }
  return paths.sort((a, b) => b.mass - a.mass).slice(0, 4);
}

function defenseSpots(cells) {
  if (!cells || !cells.length) return [];
  let max = 0;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 4; c < 8; c++) max = Math.max(max, (cells[r] && cells[r][c]) || 0);
  }
  if (max <= 0) return [];
  const spots = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 4; c < 8; c++) {
      const pressure = ((cells[r] && cells[r][c]) || 0) / max;
      const solid = 1 - pressure;
      spots.push({
        x: (c + 0.5) / 8,
        y: (r + 0.5) / 6,
        solid,
        pressure,
      });
    }
  }
  return spots;
}

/** Map a normalized attack point onto the full pitch. A attacks left→right; B is flipped. */
function mapAttack(pt, side) {
  if (side === 'a') return { x: pt.x, y: pt.y };
  return { x: 1 - pt.x, y: 1 - pt.y };
}

function mapDefend(pt, side) {
  // Defend frame keeps the team's own goal on the right (high x).
  // A's goal is the left end of the full pitch, so flip x. B's goal is already on the right,
  // and y flips with the attack orientation.
  if (side === 'a') return { x: 1 - pt.x, y: pt.y };
  return { x: pt.x, y: 1 - pt.y };
}

function pathD(pts, W, H, pad) {
  return pts.map((p, i) => {
    const x = pad + p.x * (W - pad * 2);
    const y = pad + p.y * (H - pad * 2);
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

function renderFullPitchSvg(heat, names = {}) {
  if (!heat || !heat.available) {
    const note = (heat && heat.note) || '近期完场没有落点，画不出攻防路线。';
    return `<div class="pr-heat-empty">${esc(note)}</div>`;
  }
  const home = names.home || '主队';
  const away = names.away || '客队';
  const W = 1000;
  const H = 620;
  const pad = 36;
  const aPaths = attackPaths(heat.homeAttack && heat.homeAttack.cells);
  const bPaths = attackPaths(heat.awayAttack && heat.awayAttack.cells);
  const aSpots = defenseSpots(heat.homeDefend && heat.homeDefend.cells);
  const bSpots = defenseSpots(heat.awayDefend && heat.awayDefend.cells);

  const blobs = [];
  const pushCorridor = (spots, side, color) => {
    if (!spots.length) return;
    const bands = [
      { name: 'left', ys: [0, 0.34], y: 0.18 },
      { name: 'central', ys: [0.34, 0.66], y: 0.5 },
      { name: 'right', ys: [0.66, 1], y: 0.82 },
    ];
    for (const band of bands) {
      const inBand = spots.filter(s => s.y >= band.ys[0] && s.y < band.ys[1]);
      if (!inBand.length) continue;
      const solid = inBand.reduce((s, p) => s + p.solid, 0) / inBand.length;
      const pressure = inBand.reduce((s, p) => s + p.pressure, 0) / inBand.length;
      const anchor = inBand[Math.floor(inBand.length / 2)];
      const p = mapDefend({ x: anchor.x, y: band.y }, side);
      const opacity = 0.22 + Math.max(solid, pressure) * 0.38;
      blobs.push({
        ...p, opacity, rad: 92, color, solid, pressure, side, corridor: true,
      });
    }
  };
  pushCorridor(aSpots, 'a', '#c4523a');
  pushCorridor(bSpots, 'b', '#2a6fbe');

  let midHot = false;
  const nearMid = (b, side) => {
    const px = b.side === side ? b : null;
    return px && b.x > 0.38 && b.x < 0.62 && (b.solid > 0.5 || b.pressure > 0.55);
  };
  if (blobs.some(b => b.side === 'a' && nearMid(b, 'a')) && blobs.some(b => b.side === 'b' && nearMid(b, 'b'))) {
    midHot = true;
  }

  const lines = [];
  const pushLines = (paths, side, color) => {
    paths.forEach((path, idx) => {
      const mapped = path.pts.map(pt => mapAttack(pt, side));
      const width = idx === 0 ? 7.5 : 3.2 + path.share * 6;
      const opacity = idx === 0 ? 0.95 : 0.55 + path.share;
      lines.push({ d: pathD(mapped, W, H, pad), width, opacity, color, side, band: path.band, rank: idx });
    });
  };
  pushLines(aPaths, 'a', '#e23d3d');
  pushLines(bPaths, 'b', '#2f6fe0');

  const label = (x, y, text, fill) =>
    `<text x="${x}" y="${y}" fill="${fill || '#1d2a24'}" font-size="22" font-family="sans-serif" stroke="#f4f7f2" stroke-width="4" paint-order="stroke">${esc(text)}</text>`;

  let labels = '';
  labels += label(pad + 8, 58, `${home}往这边打 →`, '#a32020');
  labels += label(560, 58, `← ${away}往这边打`, '#1d4f9c');
  labels += label(46, H - 48, `${home}球门`, '#7a2a22');
  labels += label(W - 150, H - 48, `${away}球门`, '#1d4f9c');

  const thick = lines.find(l => l.rank === 0);
  if (thick) labels += label(430, 92, '粗=常见', '#3d4a42');

  const aMain = aPaths[0];
  if (aMain) {
    const where = aMain.band === 'left' ? '左路' : aMain.band === 'right' ? '右路' : '中路';
    labels += label(560, 150, `${home}常从${where}打`, '#a32020');
  }
  const bMain = bPaths[0];
  if (bMain) {
    const where = bMain.band === 'left' ? '左路' : bMain.band === 'right' ? '右路' : '中路';
    labels += label(180, 150, `${away}常从${where}打`, '#1d4f9c');
  }

  const bSolid = blobs.filter(b => b.side === 'b' && b.solid >= 0.55).sort((a, b) => b.solid - a.solid)[0];
  const bLoose = blobs.filter(b => b.side === 'b' && b.pressure >= 0.55 && b !== bSolid).sort((a, b) => b.pressure - a.pressure)[0];
  if (bSolid) {
    labels += label(pad + bSolid.x * (W - pad * 2) - 20, pad + bSolid.y * (H - pad * 2) - 36, '这边守得稳', '#1d4f9c');
  }
  if (bLoose) {
    labels += label(pad + bLoose.x * (W - pad * 2) - 10, pad + bLoose.y * (H - pad * 2) + 28, '这边松一点', '#3d4a42');
  }
  if (midHot) labels += label(430, H / 2 + 8, '中场抢得凶', '#5c4d78');

  const blobSvg = blobs.map(b => {
    const cx = pad + b.x * (W - pad * 2);
    const cy = pad + b.y * (H - pad * 2);
    return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${b.rad}" ry="${(b.rad * 0.72).toFixed(1)}" fill="${b.color}" opacity="${b.opacity.toFixed(3)}" filter="url(#prHeatBlur)"/>`;
  }).join('');
  const midSvg = midHot
    ? `<ellipse cx="${W / 2}" cy="${H / 2}" rx="120" ry="90" fill="#7d7394" opacity="0.28" filter="url(#prHeatBlur)"/>`
    : '';
  const lineSvg = lines.map(l =>
    `<path d="${l.d}" fill="none" stroke="${l.color}" stroke-width="${l.width.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${Math.min(1, l.opacity).toFixed(2)}"/>`
  ).join('');

  const sx = (x) => pad + x * (W - pad * 2);
  const sy = (y) => pad + y * (H - pad * 2);

  return `<svg class="pr-heat-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="两队怎么打，哪儿不好打">
    <defs>
      <filter id="prHeatBlur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
    </defs>
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="18" fill="#2f6b3a"/>
    <rect x="${sx(0)}" y="${sy(0)}" width="${sx(1) - sx(0)}" height="${sy(1) - sy(0)}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/>
    <line x1="${sx(0.5)}" y1="${sy(0)}" x2="${sx(0.5)}" y2="${sy(1)}" stroke="rgba(255,255,255,.7)" stroke-width="3"/>
    <circle cx="${sx(0.5)}" cy="${sy(0.5)}" r="70" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/>
    <rect x="${sx(0)}" y="${sy(0.2)}" width="${sx(0.16) - sx(0)}" height="${sy(0.8) - sy(0.2)}" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="3"/>
    <rect x="${sx(0.84)}" y="${sy(0.2)}" width="${sx(1) - sx(0.84)}" height="${sy(0.8) - sy(0.2)}" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="3"/>
    <rect x="${sx(0) - 16}" y="${sy(0.38)}" width="16" height="${sy(0.62) - sy(0.38)}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="3"/>
    <rect x="${sx(1)}" y="${sy(0.38)}" width="16" height="${sy(0.62) - sy(0.38)}" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="3"/>
    ${blobSvg}${midSvg}${lineSvg}${labels}
  </svg>`;
}

module.exports = {
  periodKind,
  toAttackCoords,
  toDefendCoords,
  aggregateAttackHeat,
  aggregateDefenseHeat,
  formToFixtures,
  readHeatPack,
  loadFixturesForTeam,
  loadHeatPack,
  buildMatchHeat,
  attackPaths,
  defenseSpots,
  renderFullPitchSvg,
};
