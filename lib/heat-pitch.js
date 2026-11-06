/**
 * Recent ball-coordinate samples (possession corridors L/C/R), not shot maps.
 * Coordinates are absolute pitch x,y in [0, 1], not team-tagged.
 * Assumption (same as the predict kit): 1st half home attacks toward x→1;
 * 2nd half the sides switch. We mirror so the focus side always attacks left→right.
 * The pitch drawing uses those L/C/R shares only: attack strokes in the attacking
 * half, pressure bands in the own half, and a matchup stroke from corridor-matchup.
 * Missing or sparse samples → empty state — nothing is invented.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function dataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  try { return require('./db').DATA_DIR; } catch { return path.join(__dirname, '..', 'data'); }
}

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

function emptyCells() {
  return Array.from({ length: 6 }, () => Array(8).fill(0));
}

/** Too few samples in the attacking half → honest empty. Borderline + flat grid → also empty. */
function isSparseHeat(nZone, max) {
  if (nZone < 20) return true;
  if (nZone < 90 && Number(max) <= 1) return true;
  return false;
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
  const zoneSparse = isSparseHeat(nZone, max);
  return {
    available: used.length > 0 && nZone > 0 && !zoneSparse,
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
    sparse: zoneSparse,
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

/** Same corridor split as attack, in defend-oriented frame — possession-only, not concede heat. */
function aggregateDefenseHeat(fixturePayloads, teamId, { maxFixtures = 5, forwardX = 0.55 } = {}) {
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
      const pt = toDefendCoords(p.x, p.y, {
        isHome: side.isHome,
        periodDesc: p.period || periodMap[p.period_id],
      });
      if (!pt) continue;
      nPoints++;
      if (pt.x < forwardX) continue;
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
  return finalizeCells(cells, left, mid, right, used, skipped, nPoints, nZone, { kind: 'defense' });
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
        scoreFixtures: Array.isArray(j.scoreFixtures) ? j.scoreFixtures : [],
        sideId: j.smTeamId || teamId,
        smTeamId: j.smTeamId || null,
        recentIds: Array.isArray(j.recentIds) ? j.recentIds.filter(Boolean) : [],
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
  return {
    fixtures: formToFixtures(form),
    scoreFixtures: disk.scoreFixtures || [],
    sideId: disk.smTeamId || teamId,
    smTeamId: disk.smTeamId || null,
    recentIds: disk.recentIds || [],
    fetchedAt: disk.fetchedAt,
    reason: disk.reason || '',
  };
}

function buildMatchHeat({ homeId, awayId, homeFixtures, awayFixtures } = {}) {
  const hFx = homeFixtures || [];
  const aFx = awayFixtures || [];
  const checked = true;
  if (!hFx.length && !aFx.length) {
    return {
      available: false,
      checked,
      note: '近几场还没有球权分布，攻防图先空着。',
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
    note: available ? '' : '近况样本太少，攻防图先空着。',
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

const LANE_Y = { left: 0.18, central: 0.5, right: 0.82 };
const LANE_KEYS = ['left', 'central', 'right'];

/** Home attack-left is the top sideline. Away attack-left is the bottom sideline. */
function physicalLaneY(orient, lane) {
  const y = LANE_Y[lane] != null ? LANE_Y[lane] : 0.5;
  return orient === 'away' ? +(1 - y).toFixed(4) : y;
}

function lcrOf(side) {
  if (!side || !side.available || !side.lcr) return null;
  const left = Number(side.lcr.left);
  const central = Number(side.lcr.central);
  const right = Number(side.lcr.right);
  if (![left, central, right].every(Number.isFinite)) return null;
  return { left, central, right };
}

function atkStyle(share, shares) {
  const vals = LANE_KEYS.map(k => shares[k]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max - min < 0.06) return { w: 3.6, op: 0.8, dash: '', rank: 'even' };
  if (share >= max - 0.0005) return { w: 7, op: 1, dash: '', rank: 'hot' };
  if (share <= min + 0.0005) return { w: 2, op: 0.5, dash: '4 3.5', rank: 'thin' };
  return { w: 4.2, op: 0.84, dash: '', rank: 'mid' };
}

function defLook(share, shares) {
  const vals = LANE_KEYS.map(k => shares[k]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const tiedMin = vals.filter(v => Math.abs(v - min) < 0.0005).length > 1;
  const gap = !tiedMin && max - min >= 0.08 && share <= min + 0.0005;
  const op = gap ? 0.07 : Math.min(0.42, 0.08 + share * 0.5);
  return { op, gap };
}

function dominantKey(side, shares) {
  if (side && side.dominant && shares[side.dominant] != null) return side.dominant;
  let best = 'central';
  let v = -1;
  for (const k of LANE_KEYS) if (shares[k] > v) { v = shares[k]; best = k; }
  return best;
}

/** Same host allowlist as predict-surface.avatarSrc. Raw CDN urls are proxied. */
function playerImageHref(src) {
  const s = String(src || '').trim();
  if (!s) return '';
  if (s.startsWith('/api/logo?url=')) return s;
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:') return '';
  const host = u.hostname.toLowerCase();
  if (host !== 'cdn.sportmonks.com' && host !== 'media.sportmonks.com') return '';
  if (!u.pathname.startsWith('/images/') || !/\.(png|jpe?g|webp)$/i.test(u.pathname)) return '';
  return '/api/logo?url=' + encodeURIComponent(u.toString());
}

function clipName(name, n) {
  const t = String(name || '').trim();
  if (!t) return '';
  const chars = [...t];
  return chars.length > n ? chars.slice(0, n).join('') : t;
}

function initialChar(name) {
  const t = String(name || '').trim();
  if (!t) return '';
  const ch = [...t][0];
  return /[a-z]/i.test(ch) ? ch.toUpperCase() : ch;
}

function focusLanes(heat, corridor) {
  if (corridor && Array.isArray(corridor.focus_lanes)) return corridor.focus_lanes;
  try {
    const built = require('./corridor-matchup').buildCorridorMatchup(heat, null);
    return (built && built.focus_lanes) || [];
  } catch { return []; }
}

function renderFullPitchSvg(heat, names = {}) {
  if (!heat || !heat.available) {
    const note = (heat && heat.note) || '近况样本太少，攻防图先空着。';
    return `<div class="pr-heat-empty">${esc(note)}</div>`;
  }
  const home = clipName(names.home || '主队', 8);
  const away = clipName(names.away || '客队', 8);
  const W = 360;
  const H = 308;
  const pitch = { x: 10, y: 48, w: 340, h: 206 };
  const X = (t) => pitch.x + t * pitch.w;
  const Y = (t) => pitch.y + t * pitch.h;
  const homeAtk = lcrOf(heat.homeAttack);
  const awayAtk = lcrOf(heat.awayAttack);
  const homeDef = lcrOf(heat.homeDefend);
  const awayDef = lcrOf(heat.awayDefend);
  const focuses = focusLanes(heat, names.corridor);

  const font = '"PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif';
  const txt = (x, y, text, fill, size, anchor) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" font-size="${size}" font-family="${font}" text-anchor="${anchor || 'middle'}" stroke="#f4f7f2" stroke-width="2.2" paint-order="stroke">${esc(text)}</text>`;

  const gapNotes = [];
  let bands = '';
  const paintBands = (shares, half, orient, sideName, color) => {
    if (!shares) return;
    for (const lane of LANE_KEYS) {
      const y = physicalLaneY(orient, lane);
      const look = defLook(shares[lane], shares);
      const x0 = half === 'left' ? 0.035 : 0.525;
      const x1 = half === 'left' ? 0.475 : 0.965;
      const y0 = Math.max(0.02, y - 0.145);
      const y1 = Math.min(0.98, y + 0.145);
      const op = look.gap ? look.op : Math.min(0.5, 0.12 + shares[lane] * 0.62);
      bands += `<rect class="pr-def" data-side="${sideName}" data-lane="${lane}" data-gap="${look.gap ? '1' : '0'}" x="${X(x0).toFixed(1)}" y="${Y(y0).toFixed(1)}" width="${(X(x1) - X(x0)).toFixed(1)}" height="${(Y(y1) - Y(y0)).toFixed(1)}" rx="8" fill="${color}" opacity="${op.toFixed(3)}"${look.gap ? ' stroke="#f6e7a8" stroke-width="1.2" stroke-dasharray="3 2"' : ''}/>`;
      if (!look.gap) continue;
      const covered = focuses.some(f => {
        const fHalf = f.side === 'home_attack' ? 'right' : 'left';
        return fHalf === half && f.lane === lane && f.badge === '更好打';
      });
      if (covered) continue;
      gapNotes.push({ nx: half === 'left' ? 0.34 : 0.66, ny: y });
    }
  };
  // Own-half pressure. Lane keys stay in each side's defend frame so they line up with the opponent's attack.
  paintBands(homeDef, 'left', 'away', 'home', '#e23d3d');
  paintBands(awayDef, 'right', 'home', 'away', '#2f6fe0');

  let focusSvg = '';
  for (const f of focuses) {
    if (!f || !f.lane || !LANE_Y[f.lane]) continue;
    const half = f.side === 'away_attack' ? 'left' : 'right';
    const orient = f.side === 'away_attack' ? 'away' : 'home';
    const y = physicalLaneY(orient, f.lane);
    const x0 = half === 'left' ? 0.02 : 0.51;
    const x1 = half === 'left' ? 0.49 : 0.98;
    const y0 = Math.max(0.015, y - 0.155);
    const y1 = Math.min(0.985, y + 0.155);
    focusSvg += `<rect class="pr-focus" data-side="${esc(f.side)}" data-lane="${esc(f.lane)}" data-badge="${esc(f.badge || '对位')}" x="${X(x0).toFixed(1)}" y="${Y(y0).toFixed(1)}" width="${(X(x1) - X(x0)).toFixed(1)}" height="${(Y(y1) - Y(y0)).toFixed(1)}" rx="10" fill="none" stroke="#e2b434" stroke-width="2.4"/>`;
    focusSvg += txt(X((x0 + x1) / 2), Y(y0) + 13, f.badge || '对位', '#8a6408', 11, 'middle');
  }

  let attacks = '';
  const paintAttack = (shares, sideName, color, dir) => {
    if (!shares) return;
    const orient = sideName === 'away' ? 'away' : 'home';
    for (const lane of LANE_KEYS) {
      const y = physicalLaneY(orient, lane);
      const st = atkStyle(shares[lane], shares);
      const x0 = dir > 0 ? 0.56 : 0.44;
      const x1 = dir > 0 ? 0.90 : 0.10;
      const yPx = Y(y);
      const xStart = X(x0);
      const xEnd = X(x1);
      const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
      attacks += `<path class="pr-atk" data-side="${sideName}" data-lane="${lane}" data-rank="${st.rank}" data-share="${shares[lane].toFixed(3)}" d="M${xStart.toFixed(1)} ${yPx.toFixed(1)} L${xEnd.toFixed(1)} ${yPx.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${st.w}" stroke-linecap="round" opacity="${st.op.toFixed(2)}"${dash}/>`;
      if (st.rank === 'thin') continue;
      const ah = st.rank === 'hot' ? 7 : 5;
      const tip = xEnd + dir * (ah + 1);
      const base = xEnd + dir * 1;
      attacks += `<path data-arrow="${sideName}" d="M${base.toFixed(1)} ${(yPx - ah * 0.55).toFixed(1)} L${tip.toFixed(1)} ${yPx.toFixed(1)} L${base.toFixed(1)} ${(yPx + ah * 0.55).toFixed(1)} Z" fill="${color}" opacity="${st.op.toFixed(2)}"/>`;
    }
  };
  paintAttack(awayAtk, 'away', '#2f6fe0', -1);
  paintAttack(homeAtk, 'home', '#e23d3d', 1);

  const avatars = names.avatars || {};
  let avatarSvg = '';
  const clips = [];
  const placed = [];
  const focusBoxes = focuses.filter(f => f && f.lane && LANE_Y[f.lane]).map(f => {
    const half = f.side === 'away_attack' ? 'left' : 'right';
    const orient = f.side === 'away_attack' ? 'away' : 'home';
    const y = physicalLaneY(orient, f.lane);
    return {
      x0: half === 'left' ? 0.02 : 0.51,
      x1: half === 'left' ? 0.49 : 0.98,
      y0: Math.max(0.015, y - 0.155),
    };
  });
  const clampSlot = (nx, ny) => ({
    nx: Math.min(0.9, Math.max(0.1, nx)),
    ny: Math.min(0.86, Math.max(0.14, ny)),
  });
  const slotFree = (nx, ny) => {
    const s = clampSlot(nx, ny);
    if (focusBoxes.some(b => s.nx >= b.x0 && s.nx <= b.x1 && s.ny >= b.y0 && s.ny <= b.y0 + 0.11)) return null;
    if (placed.some(p => Math.hypot((s.nx - p.nx) * pitch.w, (s.ny - p.ny) * pitch.h) < 74)) return null;
    return s;
  };
  const pickSlot = (cands) => {
    for (const c of cands) {
      const hit = slotFree(c.nx, c.ny);
      if (hit) return hit;
    }
    return clampSlot(cands[0].nx, cands[0].ny + 0.16);
  };
  const placeAvatar = (av, sideName, color) => {
    if (!av || !av.role) return;
    const atkShares = sideName === 'home' ? homeAtk : awayAtk;
    const defShares = sideName === 'home' ? homeDef : awayDef;
    const atkOrient = sideName === 'home' ? 'home' : 'away';
    const defOrient = sideName === 'home' ? 'away' : 'home';
    const atkLane = atkShares ? dominantKey(sideName === 'home' ? heat.homeAttack : heat.awayAttack, atkShares) : 'central';
    const defLane = defShares ? dominantKey(sideName === 'home' ? heat.homeDefend : heat.awayDefend, defShares) : 'central';
    const yAtk = physicalLaneY(atkOrient, atkLane);
    const yDef = physicalLaneY(defOrient, defLane);
    const inward = (y) => (y < 0.5 ? 0.12 : -0.12);
    let slot;
    if (av.role === 'attack') {
      const x = sideName === 'home' ? 0.84 : 0.16;
      slot = pickSlot([
        { nx: x, ny: yAtk + inward(yAtk) },
        { nx: x, ny: yAtk - inward(yAtk) },
        { nx: sideName === 'home' ? 0.74 : 0.26, ny: yAtk + inward(yAtk) },
      ]);
    } else if (av.role === 'organize') {
      const x = sideName === 'home' ? 0.44 : 0.56;
      const y = yAtk < 0.45 ? 0.46 : yAtk > 0.55 ? 0.54 : (sideName === 'home' ? 0.36 : 0.64);
      slot = pickSlot([
        { nx: x, ny: y },
        { nx: x, ny: sideName === 'home' ? 0.62 : 0.38 },
        { nx: sideName === 'home' ? 0.36 : 0.64, ny: 0.5 },
      ]);
    } else {
      const x = sideName === 'home' ? 0.30 : 0.70;
      slot = pickSlot([
        { nx: x, ny: yDef + inward(yDef) },
        { nx: x, ny: yDef - inward(yDef) },
        { nx: sideName === 'home' ? 0.18 : 0.82, ny: yDef < 0.5 ? 0.58 : 0.42 },
        { nx: sideName === 'home' ? 0.22 : 0.78, ny: 0.78 },
      ]);
    }
    const nx = slot.nx;
    const ny = slot.ny;
    placed.push({ nx, ny });
    const cx = X(nx);
    const cy = Y(ny);
    const r = 11;
    const id = `phAv${sideName}${av.role}${String(av.player_id != null ? av.player_id : av.role).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const href = playerImageHref(av.image);
    const ring = av.sidelined ? '#e11d48' : color;
    const ringW = av.sidelined ? 2.6 : 1.6;
    const above = ny > 0.72;
    const name = clipName(av.name, 3);
    const letter = initialChar(av.name);
    const tag = av.role === 'attack' ? '攻' : av.role === 'organize' ? '组' : '防';
    clips.push(`<clipPath id="${id}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r - 1}"/></clipPath>`);
    avatarSvg += `<g class="pr-avatar" data-side="${sideName}" data-role="${esc(av.role)}" data-sidelined="${av.sidelined ? '1' : '0'}">`;
    avatarSvg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="#e7edf2" stroke="${ring}" stroke-width="${ringW}"/>`;
    if (letter) avatarSvg += txt(cx, cy + 4, letter, '#3d4a5c', 11, 'middle');
    if (href) {
      avatarSvg += `<image href="${esc(href)}" x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
    }
    avatarSvg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="none" stroke="${ring}" stroke-width="${ringW}"/>`;
    const tagCy = above ? cy + 7 : cy - 7;
    avatarSvg += `<circle cx="${(cx + 7).toFixed(1)}" cy="${tagCy.toFixed(1)}" r="6.5" fill="${color}" stroke="#f4f7f2" stroke-width="1.2"/>`;
    avatarSvg += `<text x="${(cx + 7).toFixed(1)}" y="${(tagCy + 3).toFixed(1)}" fill="#fff" font-size="8" font-family="${font}" text-anchor="middle">${esc(tag)}</text>`;
    if (name) avatarSvg += txt(cx, above ? cy - r - 4 : cy + r + 13, name, '#102018', 10, 'middle');
    avatarSvg += '</g>';
  };
  for (const av of avatars.home || []) placeAvatar(av, 'home', '#e23d3d');
  for (const av of avatars.away || []) placeAvatar(av, 'away', '#2f6fe0');
  let gapSvg = '';
  for (const g of gapNotes) {
    const crowded = placed.some(p => Math.hypot((p.nx - g.nx) * pitch.w, (p.ny - g.ny) * pitch.h) < 36);
    const ny = crowded ? Math.min(0.9, g.ny + 0.08) : g.ny;
    gapSvg += txt(X(g.nx), Y(ny) + 4, '更好打', '#1c2434', 11, 'middle');
  }

  const bars = (shares, color, y, labelFill) => {
    if (!shares) return txt(12, y + 12, '这一侧样本还不够', '#8a938c', 11, 'start');
    const labs = [['左', 'left'], ['中', 'central'], ['右', 'right']];
    const max = Math.max(...LANE_KEYS.map(k => shares[k]));
    let s = '';
    labs.forEach(([lab, key], i) => {
      const x = 12 + i * 116;
      const pct = Math.round(shares[key] * 100);
      const bw = 8 + shares[key] * 44;
      const hot = shares[key] >= max - 0.0005;
      s += txt(x, y + 11, lab, labelFill, 11, 'start');
      s += `<rect x="${x + 16}" y="${y + 3}" width="${bw.toFixed(1)}" height="7" rx="3.5" fill="${color}" opacity="${hot ? '1' : '0.38'}"/>`;
      s += txt(x + 16 + bw + 4, y + 11, `${pct}%`, labelFill, 11, 'start');
    });
    return s;
  };

  const sx = X;
  const sy = Y;
  const markings = `
    <rect x="${sx(0)}" y="${sy(0)}" width="${(sx(1) - sx(0)).toFixed(1)}" height="${(sy(1) - sy(0)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.78)" stroke-width="1.6"/>
    <line x1="${sx(0.5)}" y1="${sy(0)}" x2="${sx(0.5)}" y2="${sy(1)}" stroke="rgba(255,255,255,.72)" stroke-width="1.4"/>
    <circle cx="${sx(0.5)}" cy="${sy(0.5)}" r="22" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="1.4"/>
    <rect x="${sx(0)}" y="${sy(0.2)}" width="${(sx(0.16) - sx(0)).toFixed(1)}" height="${(sy(0.8) - sy(0.2)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="1.3"/>
    <rect x="${sx(0.84)}" y="${sy(0.2)}" width="${(sx(1) - sx(0.84)).toFixed(1)}" height="${(sy(0.8) - sy(0.2)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="1.3"/>
    <rect x="${sx(0)}" y="${sy(0.36)}" width="${(sx(0.06) - sx(0)).toFixed(1)}" height="${(sy(0.64) - sy(0.36)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="1.2"/>
    <rect x="${sx(0.94)}" y="${sy(0.36)}" width="${(sx(1) - sx(0.94)).toFixed(1)}" height="${(sy(0.64) - sy(0.36)).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="1.2"/>
  `;

  return `<svg class="pr-heat-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="近况攻防习惯。粗线是常走的进攻，色带是常被压的一侧，描边是对位焦点。不是进球落点，也不是实时站位。">
    <defs>${clips.join('')}</defs>
    ${txt(12, 16, `${home}往这边打 →`, '#a32020', 12, 'start')}
    ${bars(homeAtk, '#e23d3d', 20, '#a32020')}
    <rect x="${pitch.x}" y="${pitch.y}" width="${pitch.w}" height="${pitch.h}" rx="12" fill="#2f6b3a"/>
    ${markings}
    ${bands}
    ${focusSvg}
    ${attacks}
    ${gapSvg}
    ${avatarSvg}
    ${txt(12, 272, `← ${away}往这边打`, '#1d4f9c', 12, 'start')}
    ${bars(awayAtk, '#2f6fe0', 278, '#1d4f9c')}
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
