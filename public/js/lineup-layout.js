/**
 * Half-vs-half formation placement for the 阵容 board.
 * Away is the top half and attacks DOWN toward midfield (their left = viewer's right).
 * Home is the bottom half and attacks UP toward midfield (their left = viewer's left).
 * Goalkeepers sit at the two ends; strikers meet at the halfway line.
 */
'use strict';

function parseFormation(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/(\d+(?:\s*-\s*\d+)+)/);
  if (!m) return null;
  const parts = m[1].split(/\s*-\s*/).map(Number).filter((n) => n > 0);
  if (parts.length < 2 || parts.length > 5) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum < 8 || sum > 10) return null;
  return parts;
}

function lineOfPos(pos) {
  const p = String(pos || '').toUpperCase();
  if (p === 'G' || p === 'GK') return 0;
  if (/^(CD|SW|LB|RB|LWB|RWB|D|CB)/.test(p)) return 1;
  if (/^DM/.test(p)) return 2;
  if (/^(CM|LM|RM|M)/.test(p)) return 3;
  if (/^AM/.test(p)) return 4;
  return 5;
}

function latOfPos(pos) {
  const p = String(pos || '').toUpperCase();
  if (/-L$/.test(p)) return -1;
  if (/-R$/.test(p)) return 1;
  if (/^L/.test(p)) return -2;
  if (/^R/.test(p)) return 2;
  return 0;
}

/** Wide track so 3 midfielders are not cramped (18 / 50 / 82, not 33 / 50 / 66). */
function xsForCount(n) {
  if (n <= 1) return [50];
  const pad = n >= 5 ? 8 : n >= 4 ? 10 : n === 3 ? 18 : 22;
  const span = 100 - 2 * pad;
  return Array.from({ length: n }, (_, i) => +(pad + (span * i) / (n - 1)).toFixed(2));
}

function ysForLines(n, dir) {
  // 5+ lines need a longer half so name chips do not sit on the next face.
  // Strikers still meet near midfield (around 46 / 54).
  let start, end;
  if (n >= 5) {
    start = dir === 'away' ? 6.5 : 95.5;
    end = dir === 'away' ? 46 : 54;
  } else {
    start = dir === 'away' ? 8 : 94;
    end = dir === 'away' ? 45 : 55;
  }
  if (n <= 1) return [start];
  return Array.from({ length: n }, (_, i) => +(start + ((end - start) * i) / (n - 1)).toFixed(2));
}

function groupByLine(starters) {
  const lines = {};
  (starters || []).forEach((p, i) => {
    const l = lineOfPos(p.pos);
    (lines[l] = lines[l] || []).push({ p, i, place: Number(p.place) || 0, lat: latOfPos(p.pos) });
  });
  return lines;
}

function linesFromFormation(starters, formation) {
  const parts = parseFormation(formation);
  const people = (starters || []).map((p, i) => ({ p, i, place: Number(p.place) || 0, lat: latOfPos(p.pos), line: lineOfPos(p.pos) }));
  if (!parts) {
    const grouped = groupByLine(starters);
    return Object.keys(grouped).map(Number).sort((a, b) => a - b).map((k) => grouped[k]);
  }
  const gks = people.filter((x) => x.line === 0);
  const rest = people.filter((x) => x.line !== 0);
  const roleOf = (line) => (line <= 1 ? 'D' : line === 2 ? 'DM' : line === 3 ? 'M' : line === 4 ? 'AM' : 'F');
  const n = parts.length;
  const roles = n <= 2 ? ['D', 'F']
    : n === 3 ? ['D', 'M', 'F']
    : n === 4 ? ['D', 'DM', 'M', 'F']
    : ['D', 'DM', 'M', 'AM', 'F'];
  const pools = { D: [], DM: [], M: [], AM: [], F: [] };
  for (const x of rest) pools[roleOf(x.line)].push(x);
  for (const k of Object.keys(pools)) pools[k] = sortLine(pools[k]);
  pools.D.sort((a, b) => {
    const wa = /^SW/i.test(String((a.p && a.p.pos) || '')) ? 1 : 0;
    const wb = /^SW/i.test(String((b.p && b.p.pos) || '')) ? 1 : 0;
    return wa - wb || a.lat - b.lat || a.i - b.i;
  });
  const prefer = {
    D: ['D', 'DM', 'M'],
    DM: ['DM', 'D', 'M'],
    M: ['M', 'AM', 'DM', 'F'],
    AM: ['AM', 'M', 'F'],
    F: ['F', 'AM', 'M'],
  };
  const used = new Set();
  function take(role, count) {
    const out = [];
    for (const r of (prefer[role] || [])) {
      for (const p of pools[r]) {
        if (out.length >= count) break;
        if (used.has(p.i)) continue;
        used.add(p.i);
        out.push(p);
      }
    }
    return out;
  }
  const rows = [gks.length ? gks : people.slice(0, 1)];
  parts.forEach((count, i) => {
    const slice = take(roles[i], count);
    if (slice.length) rows.push(slice);
  });
  const leftover = rest.filter((p) => !used.has(p.i));
  if (leftover.length) {
    const last = rows[rows.length - 1] || [];
    rows[rows.length - 1] = last.concat(leftover);
  }
  return rows.filter((r) => r.length);
}

function sortLine(group) {
  return group.slice().sort((a, b) => {
    if (a.place && b.place && a.place !== b.place) return a.place - b.place;
    return a.lat - b.lat || a.i - b.i;
  });
}

function staggerForward(ys, rows) {
  // 4-3-3 style: a 3-person last line keeps the centre forward closer to midfield,
  // wingers a step deeper. Do not collapse midfield spacing.
  const last = rows[rows.length - 1];
  if (!last || last.length !== 3 || rows.length < 3) return ys;
  const out = ys.slice();
  const lastY = ys[ys.length - 1];
  const prevY = ys[ys.length - 2];
  const mid = (lastY + prevY) / 2;
  out._wingY = +((lastY + mid) / 2).toFixed(2);
  out._cfY = lastY;
  return out;
}

/**
 * @param {object} side lineup side (starters, formation)
 * @param {'home'|'away'} dir
 * @returns {Array<{p, left, top, line, i}>}
 */
function placeSide(side, dir) {
  const starters = (side && side.starters) || [];
  if (!starters.length) return [];
  const rows = linesFromFormation(starters, side.formation);
  const ys = staggerForward(ysForLines(rows.length, dir), rows);
  const placed = [];
  rows.forEach((group, li) => {
    const ordered = sortLine(group);
    const xsTeam = xsForCount(ordered.length); // left-to-right as the team attacks
    const wingY = (ordered.length === 3 && li === rows.length - 1 && ys._wingY != null);
    ordered.forEach((item, i) => {
      let x = xsTeam[i];
      if (dir === 'away') x = +(100 - x).toFixed(2);
      let y = ys[li];
      if (wingY) {
        const isCenter = i === 1;
        y = isCenter ? ys._cfY : ys._wingY;
      }
      placed.push({
        p: item.p,
        left: x,
        top: y,
        line: li,
        i,
        dir,
      });
    });
  });
  return placed;
}

function linkPaths(homePlaced, awayPlaced) {
  const paths = [];
  function add(a, b) {
    if (!a || !b) return;
    paths.push(`M${a.left} ${a.top} L${b.left} ${b.top}`);
  }
  function connect(placed) {
    const byLine = {};
    for (const pl of placed || []) (byLine[pl.line] = byLine[pl.line] || []).push(pl);
    const keys = Object.keys(byLine).map(Number).sort((a, b) => a - b);
    for (const k of keys) {
      const row = byLine[k].sort((a, b) => a.left - b.left);
      for (let i = 0; i < row.length - 1; i++) add(row[i], row[i + 1]);
    }
    for (let i = 0; i < keys.length - 1; i++) {
      const a = byLine[keys[i]];
      const b = byLine[keys[i + 1]];
      for (const pa of a) {
        let best = null;
        let bestD = Infinity;
        for (const pb of b) {
          const d = Math.abs(pa.left - pb.left) + Math.abs(pa.top - pb.top) * 0.4;
          if (d < bestD) { bestD = d; best = pb; }
        }
        add(pa, best);
      }
    }
  }
  connect(awayPlaced);
  connect(homePlaced);
  return paths;
}

function hasXi(side) {
  return !!(side && Array.isArray(side.starters) && side.starters.length >= 11);
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    parseFormation, lineOfPos, latOfPos, xsForCount, ysForLines,
    placeSide, linkPaths, hasXi, linesFromFormation,
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.LineupLayout = {
    parseFormation, lineOfPos, latOfPos, xsForCount, ysForLines,
    placeSide, linkPaths, hasXi, linesFromFormation,
  };
}
