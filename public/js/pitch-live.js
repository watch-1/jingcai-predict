/**
 * 云球迷 Pitch Live — v10 engine + v9d 45° plates / LED.
 * Production path never invents a passing sequence, ball-holder, or weather.
 * Preview-only demo coordinates must be opted in via opts.previewDemoCoords
 * and are rejected unless opts.allowPreviewDemo === true (preview renderer only).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JCPitchLive = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const MATCH_WEATHER_TYPES = ['neutral', 'sunny', 'cloudy', 'light-rain', 'rain', 'storm'];
  const LED_PHASE_MS = 6000;
  const LED_FADE_MS = 1100;
  const LED_PHASE_COUNT = 3;
  const PLAYHEAD_REPLAY_SEC = 8;
  const EXPAND_ICON_SVG = '<svg class="als-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.6" y="6.6" width="14.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 9.2L6.8 7m0 0H9.1M6.8 7v2.3M15 9.2L17.2 7m0 0H15M17.2 7v2.3M9 14.8L6.8 17m0 0H9.1M6.8 17v-2.3M15 14.8L17.2 17m0 0H15M17.2 17v-2.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const IMG_W = 1600;
  const IMG_H = 900;
  const CAM_SCALE_BASE = 1.34;
  const CAM_IDLE_SCALE = 1.14;
  const PLATE_BASE = 'assets/pitch/pitch45_v9d_p';
  const CORNERS = {
    tl: { u: 0, v: 1, x: 406.17, y: 334.36 },
    tr: { u: 1, v: 1, x: 1211.62, y: 342.29 },
    br: { u: 1, v: 0, x: 1435.01, y: 671.71 },
    bl: { u: 0, v: 0, x: 156.88, y: 651.73 }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  function computeHomography(src, dst) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const x = src[i].x, y = src[i].y;
      const u = dst[i].x, v = dst[i].y;
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
      b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
      b.push(v);
    }
    const M = A.map(function (row, i) { return row.concat([b[i]]); });
    const n = 8;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      const div = M[col][col] || 1e-12;
      for (let c = col; c <= n; c++) M[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    const h = M.map(function (row) { return row[n]; });
    h.push(1);
    return h;
  }

  const H = computeHomography(
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    [
      { x: CORNERS.bl.x, y: CORNERS.bl.y },
      { x: CORNERS.br.x, y: CORNERS.br.y },
      { x: CORNERS.tr.x, y: CORNERS.tr.y },
      { x: CORNERS.tl.x, y: CORNERS.tl.y }
    ]
  );

  function applyH(u, v) {
    const x = H[0] * u + H[1] * v + H[2];
    const y = H[3] * u + H[4] * v + H[5];
    const w = H[6] * u + H[7] * v + H[8];
    return { x: x / w, y: y / w };
  }

  function project(px, py) {
    const p = applyH(px, py);
    const near = applyH(px, 0);
    const far = applyH(px, 1);
    const dy = Math.hypot(near.x - far.x, near.y - far.y) || 1;
    const s = lerp(1.15, 0.62, clamp(py, 0, 1));
    return { x: p.x, y: p.y, s: s, dy: dy };
  }

  /* Official mouth stays on the goal line (7.32m). Height is slightly
     exaggerated so the frame and net still read on a phone-sized 45° plate;
     the baked v9d posts are geometrically correct but only a few pixels tall. */
  const GOAL_W = 7.32 / 68;
  const GOAL_D = 2.2 / 105;
  const GOAL_H = 2.44 * 2.55;

  function project3(u, v, zMeters) {
    const p = applyH(u, v);
    const near = applyH(u, 0);
    const far = applyH(u, 1);
    const dy = Math.hypot(near.x - far.x, near.y - far.y) || 1;
    const lift = ((Number(zMeters) || 0) / 68) * dy;
    return { x: p.x, y: p.y - lift, dy: dy };
  }

  function goalMouth(side) {
    const left = side < 0;
    return {
      u: left ? 0 : 1,
      uBack: left ? -GOAL_D : 1 + GOAL_D,
      v0: 0.5 - GOAL_W / 2,
      v1: 0.5 + GOAL_W / 2,
    };
  }

  function drawOneGoal(ctx, side) {
    const g = goalMouth(side);
    const h = GOAL_H;
    const p = function (u, v, z) { return project3(u, v, z); };
    const fl = p(g.u, g.v0, 0);
    const fr = p(g.u, g.v1, 0);
    const bl = p(g.uBack, g.v0, 0);
    const br = p(g.uBack, g.v1, 0);
    const tl = p(g.u, g.v0, h);
    const tr = p(g.u, g.v1, h);
    const ntl = p(g.uBack, g.v0, h * 0.58);
    const ntr = p(g.uBack, g.v1, h * 0.58);
    const nbl = p(g.uBack, g.v0, 0.08);
    const nbr = p(g.uBack, g.v1, 0.08);
    const mid = (fl.dy + fr.dy) / 2 || 400;
    const postW = Math.max(3.2, mid * 0.012);

    function quad(a, b, c, d, fill) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    // Net bag volume (back + sides + top) so the goal has depth, not just a wire frame.
    quad(ntl, ntr, nbr, nbl, 'rgba(228, 236, 246, 0.28)');
    quad(tl, ntl, nbl, fl, 'rgba(220, 230, 242, 0.16)');
    quad(tr, ntr, nbr, fr, 'rgba(220, 230, 242, 0.16)');
    quad(tl, tr, ntr, ntl, 'rgba(236, 244, 255, 0.20)');

    function gridLine(a, b, alpha, width) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(248, 252, 255,' + alpha + ')';
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(30, 40, 55,' + (alpha * 0.35) + ')';
      ctx.lineWidth = Math.max(0.6, width * 0.45);
      ctx.stroke();
    }

    const nv = 8, nh = 5;
    for (let i = 0; i <= nv; i++) {
      const t = i / nv;
      const v = g.v0 + (g.v1 - g.v0) * t;
      const a = p(g.u, v, h);
      const b = p(g.uBack, v, h * 0.58);
      const c = p(g.uBack, v, 0.08);
      gridLine(a, b, 0.7, 0.9);
      gridLine(b, c, 0.62, 0.85);
    }
    for (let i = 0; i <= nh; i++) {
      const t = i / nh;
      const zFront = h * (1 - t);
      const zBack = (h * 0.58) * (1 - t) + 0.08 * t;
      const a = p(g.u, g.v0, zFront);
      const b = p(g.uBack, g.v0, zBack);
      const c = p(g.uBack, g.v1, zBack);
      const d = p(g.u, g.v1, zFront);
      gridLine(a, b, 0.64, 0.85);
      gridLine(b, c, 0.7, 0.9);
      gridLine(c, d, 0.64, 0.85);
    }

    function post(a, b) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(28, 34, 44, 0.55)';
      ctx.lineWidth = postW + 1.6;
      ctx.stroke();
      ctx.strokeStyle = '#f7fbff';
      ctx.lineWidth = postW;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, postW * 0.35);
      ctx.stroke();
    }
    post(fl, tl);
    post(fr, tr);
    post(tl, tr);

    // Ground contact shadows so the posts sit on the line.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(fl.x, fl.y + 1.2, postW * 1.1, postW * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(fr.x, fr.y + 1.2, postW * 1.1, postW * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGoals(ctx) {
    if (!ctx) return;
    ctx.save();
    drawOneGoal(ctx, -1);
    drawOneGoal(ctx, 1);
    ctx.restore();
  }


  function weatherType(raw) {
    let t = String(raw || 'neutral').toLowerCase().replace(/[\s_]+/g, '-');
    if (t === 'lightrain' || t === 'drizzle') t = 'light-rain';
    if (t === 'showers' || t === 'moderate-rain' || t === 'heavy-rain' || t === 'heavyrain' || t === 'moderaterain') t = 'rain';
    if (t === 'thunder' || t === 'thunderstorm' || t === 'lightning') t = 'storm';
    if (t === 'overcast' || t === 'clouds' || t === 'cloud' || t === 'fog' || t === 'mist') t = 'cloudy';
    if (t === 'clear' || t === 'fair') t = 'sunny';
    return MATCH_WEATHER_TYPES.includes(t) ? t : 'neutral';
  }

  const LIVE_PHASES = new Set(['1H', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP', 'HT']);
  const FINISH_PHASES = new Set(['FT', 'AET', 'PEN']);
  const PRE_PHASES = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'AWD', 'WO']);

  /**
   * Kickoff gate: no live ball animation before official kickoff / 未开赛.
   * After full time the engine may freeze, but canAnimateLive is false.
   */
  function canAnimateLive(opts, now) {
    const o = opts || {};
    const clock = now != null ? now : Date.now();
    const short = String(o.phase || o.status || o.statusShort || '').toUpperCase();
    if (PRE_PHASES.has(short)) return false;
    if (o.finished) return false;
    if (FINISH_PHASES.has(short) && !o.live) return false;
    const ko = Number(o.kickoffMs);
    if (Number.isFinite(ko) && clock < ko) return false;
    if (o.live) return true;
    if (LIVE_PHASES.has(short)) return true;
    if (Number.isFinite(ko) && clock >= ko && !FINISH_PHASES.has(short)) return true;
    return false;
  }

  function normalizeXY(x, y) {
    let xn = Number(x);
    let yn = Number(y);
    if (!Number.isFinite(xn) || !Number.isFinite(yn)) return null;
    const maxAbs = Math.max(Math.abs(xn), Math.abs(yn));
    if (maxAbs > 1.5) {
      const div = maxAbs > 102 ? 105 : 100;
      xn /= div;
      yn /= div;
    }
    return { x: clamp(xn, 0, 1), y: clamp(yn, 0, 1) };
  }

  function mergeLastGood(prev, next) {
    if (!next) return prev || null;
    const nextList = next.coords || next;
    const prevList = prev && (prev.coords || prev);
    const nextHas = Array.isArray(nextList) && nextList.length > 0;
    const prevHas = Array.isArray(prevList) && prevList.length > 0;
    if (nextHas) return next;
    if (prevHas) {
      if (Array.isArray(next)) return prev;
      return Object.assign({}, next, {
        coords: prev.coords || prevList,
        hasCoords: true,
        keptLastGood: true,
        reason: next.reason || 'empty_kept_last_good',
      });
    }
    return next;
  }

  function pointsFromCoords(list) {
    const arr = Array.isArray(list) ? list : [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p) continue;
      const xy = normalizeXY(p.x, p.y);
      if (!xy) continue;
      const t = Number(p.t);
      out.push({
        x: xy.x,
        y: xy.y,
        t: Number.isFinite(t) ? t : i,
        kind: p.kind || null,
      });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  /**
   * Team-level attacking side only. Never invents a ball-holder player.
   * Preference: explicit attackingSide/possessionSide from already-fetched
   * live-stats or ball-coords. Else the last real coordinate: SportMonks
   * x runs from the home goal (0) to the away goal (1), so the ball in
   * the far half means that team is attacking.
   */
  function attackingSideOf(points, state) {
    const s = state || {};
    const explicit = s.attackingSide || s.possessionSide || s.attacking || null;
    if (explicit === 'home' || explicit === 'away') return explicit;
    const pts = points || [];
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    if (!last || !Number.isFinite(Number(last.x))) return null;
    if (last.x >= 0.55) return 'home';
    if (last.x <= 0.45) return 'away';
    return null;
  }

  function startPlayhead(points) {
    const pts = points || [];
    if (!pts.length) return 0;
    const first = Number(pts[0].t);
    const last = Number(pts[pts.length - 1].t);
    const a = Number.isFinite(first) ? first : 0;
    const b = Number.isFinite(last) ? last : a;
    return Math.max(a, b - PLAYHEAD_REPLAY_SEC);
  }

  /** Path length of real coordinates — used only to decide whether a window can be replayed. */
  function pathTravel(points) {
    const pts = points || [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!a || !b) continue;
      const ax = Number(a.x), ay = Number(a.y), bx = Number(b.x), by = Number(b.y);
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) continue;
      len += Math.hypot(bx - ax, by - ay);
    }
    return len;
  }

  function pathHasReplayableMotion(points) {
    return (points || []).length >= 2 && pathTravel(points) >= 0.02;
  }

  const ACTION_KIND_LABEL = {
    goal: '进球',
    shot_on: '射正',
    shot_off: '射偏',
    shot: '射门',
    corner: '角球',
    offside: '越位',
    woodwork: '击中门框',
    yellow: '黄牌',
    red: '红牌',
    second_yellow: '两黄一红',
    subst: '换人',
    var: 'VAR',
    pen: '点球',
    missed_pen: '点球不进',
  };

  /** Most recent real live-stats / SM event, never invented. */
  function lastActionOf(events) {
    const list = Array.isArray(events) ? events : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e) continue;
      const kind = e.kind || e.type;
      const lab = ACTION_KIND_LABEL[kind]
        || (kind === 'Goal' ? '进球' : null)
        || (kind === 'Corner' ? '角球' : null)
        || (kind === 'Shot' && /off/i.test(String(e.detail || '')) ? '射偏' : null)
        || (kind === 'Shot' ? '射正' : null)
        || (kind === 'Card' && /red/i.test(String(e.detail || e.kind || '')) ? '红牌' : null)
        || (kind === 'Card' ? '黄牌' : null);
      if (!lab) continue;
      const player = String(e.playerZh || e.player || '').trim();
      return {
        kind: kind,
        label: lab,
        side: e.side || null,
        player: player,
        text: player ? (lab + ' · ' + player) : lab,
      };
    }
    return null;
  }

  function attackStatusLabel(state, points) {
    const side = attackingSideOf(points, state);
    if (side !== 'home' && side !== 'away') return '';
    const s = state || {};
    const name = side === 'home'
      ? (s.homeName || s.home || '主队')
      : (s.awayName || s.away || '客队');
    return String(name) + '进攻';
  }

  function composeLiveStatusLabel(state, points, events) {
    const s = state || {};
    const attackLab = attackStatusLabel(s, points);
    const action = lastActionOf(events != null ? events : s.events);
    if (attackLab && action) return attackLab + ' · ' + action.text;
    if (attackLab) return attackLab;
    if (action) return action.text;
    return '';
  }

  const OUT_OF_PLAY_KINDS = {
    corner: 1, throwin: 1, throw_in: 1, throw: 1,
    goalkick: 1, goal_kick: 1,
    out: 1, touch: 1, out_of_play: 1, outofplay: 1,
    offside: 1, goal: 1, kickoff: 1, kick_off: 1,
  };
  const IN_PLAY_KINDS = {
    shot: 1, shot_on: 1, shot_off: 1, pass: 1, carry: 1, ground: 1, lofted: 1, freekick: 1, free_kick: 1,
  };

  function normalizeEventKind(kind) {
    return String(kind || '').toLowerCase().replace(/[\s-]+/g, '_');
  }

  function isOutOfPlayKind(kind) {
    return !!OUT_OF_PLAY_KINDS[normalizeEventKind(kind)];
  }

  /**
   * Official stoppages only: touch, goal kick, corner, throw-in, offside, goal, kick-off.
   * Does not invent events. Last ball-related official event / point kind wins.
   */
  function officialOutOfPlay(opts) {
    const o = opts || {};
    if (o.outOfPlay) return true;
    const last = o.lastPoint || ((o.points && o.points.length) ? o.points[o.points.length - 1] : null);
    if (last && isOutOfPlayKind(last.kind)) return true;
    const evs = o.events || (o.state && o.state.events) || [];
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (!e) continue;
      const k = e.kind || e.type;
      const nk = normalizeEventKind(k);
      if (nk === 'subst' || nk === 'yellow' || nk === 'red' || nk === 'second_yellow' || nk === 'var' || nk === 'card') continue;
      if (isOutOfPlayKind(k)) {
        if (last && last.kind && IN_PLAY_KINDS[normalizeEventKind(last.kind)]) return false;
        return true;
      }
      if (IN_PLAY_KINDS[nk]) return false;
    }
    return false;
  }

  function nearestSimPlayer(players, ball, side) {
    if (!ball || !Number.isFinite(Number(ball.x))) return null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < (players || []).length; i++) {
      const p = players[i];
      if (!p) continue;
      if (side && p.side !== side) continue;
      const d = Math.hypot(p.x - ball.x, p.y - ball.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  const SIM_BALL_MAX_V = 0.18;

  /**
   * Continue the ball when official coordinates are stale or exhausted.
   * Official sample wins when officialActive. Out of play sits still.
   * Never names a holder or invents official events.
   */
  function stepSimBall(prev, opts, dt) {
    const o = opts || {};
    const d = Math.max(0.001, Number(dt) || 0.016);
    const official = o.official && Number.isFinite(Number(o.official.x)) && Number.isFinite(Number(o.official.y))
      ? { x: Number(o.official.x), y: Number(o.official.y) } : null;
    const start = (prev && Number.isFinite(Number(prev.x)) && Number.isFinite(Number(prev.y)))
      ? prev : (official ? { x: official.x, y: official.y, vx: 0, vy: 0 } : { x: 0.5, y: 0.5, vx: 0, vy: 0 });
    if (o.officialActive && official) {
      const jump = Math.hypot(official.x - start.x, official.y - start.y);
      if (prev && prev.simulated && jump > 0.04) {
        const cap = SIM_BALL_MAX_V * d * 2.8;
        const f = jump > 0 ? Math.min(1, cap / jump) : 1;
        const x = start.x + (official.x - start.x) * f;
        const y = start.y + (official.y - start.y) * f;
        return { x: x, y: y, vx: (official.x - start.x) / d * f, vy: (official.y - start.y) / d * f, mode: 'blend', side: start.side || o.attackingSide || null, t: (Number(start.t) || 0) + d, simulated: f < 1, official: f >= 1 };
      }
      return { x: official.x, y: official.y, vx: 0, vy: 0, mode: 'official', side: o.attackingSide || start.side || null, t: (Number(start.t) || 0) + d, official: true };
    }
    if (officialOutOfPlay(o) || o.outOfPlay) {
      const sit = official || start;
      return { x: sit.x, y: sit.y, vx: 0, vy: 0, mode: 'dead', side: start.side || o.attackingSide || null, t: (Number(start.t) || 0) + d };
    }
    let x = Number(start.x), y = Number(start.y);
    let vx = Number(start.vx) || 0, vy = Number(start.vy) || 0;
    let mode = start.mode === 'tackle' ? 'tackle' : 'dribble';
    let phaseT = Number(start.phaseT) || 0;
    let side = start.side || o.attackingSide || 'home';
    if (side !== 'home' && side !== 'away') side = 'home';
    phaseT += d;
    const cycle = 3.2;
    if (phaseT >= cycle) {
      phaseT -= cycle;
      if (mode === 'dribble') { mode = 'tackle'; side = side === 'home' ? 'away' : 'home'; }
      else mode = 'dribble';
    }
    const t = (Number(start.t) || 0) + d;
    const goalX = side === 'home' ? 0.86 : 0.14;
    const players = o.players || [];
    const carrier = nearestSimPlayer(players, { x: x, y: y }, side);
    const weave = Math.sin(t * 2.2) * 0.10;
    let tx = goalX - x;
    let ty = (0.5 + weave) - y;
    if (carrier) ty += (carrier.y - y) * 0.18;
    if (mode === 'tackle') {
      const opp = nearestSimPlayer(players, { x: x, y: y }, side === 'home' ? 'away' : 'home');
      if (opp) { tx = (opp.x - x) * 0.55 + tx * 0.35; ty = (opp.y - y) * 0.55 + ty * 0.25; }
    }
    const dist = Math.hypot(tx, ty) || 1;
    const speed = mode === 'tackle' ? 0.16 : 0.11;
    vx += ((tx / dist) * speed - vx) * Math.min(1, d * 3);
    vy += ((ty / dist) * speed - vy) * Math.min(1, d * 3);
    const sp = Math.hypot(vx, vy);
    if (sp > SIM_BALL_MAX_V) { vx *= SIM_BALL_MAX_V / sp; vy *= SIM_BALL_MAX_V / sp; }
    x = clamp(x + vx * d, 0.04, 0.96);
    y = clamp(y + vy * d, 0.08, 0.92);
    const jump = Math.hypot(x - start.x, y - start.y);
    const cap = SIM_BALL_MAX_V * d * 1.25;
    if (jump > cap && jump > 0) {
      x = start.x + (x - start.x) * (cap / jump);
      y = start.y + (y - start.y) * (cap / jump);
    }
    return { x: x, y: y, vx: vx, vy: vy, mode: mode, side: side, phaseT: phaseT, t: t, simulated: true };
  }

  /** Nudge the nearest anonymous sim player to support a coasting dribble / tackle. */
  function applySimBallSupport(players, ball, coast) {
    if (!players || !players.length || !ball) return players;
    const side = (coast && coast.side) || null;
    const mode = (coast && coast.mode) || 'dribble';
    const carrier = nearestSimPlayer(players, ball, side);
    const press = nearestSimPlayer(players, ball, side === 'home' ? 'away' : (side === 'away' ? 'home' : null));
    return players.map(function (p) {
      let x = p.x, y = p.y;
      if (carrier && p === carrier) {
        const behind = side === 'away' ? 0.028 : -0.028;
        x = ball.x + behind;
        y = ball.y + 0.012;
      } else if (press && p === press && mode === 'tackle') {
        x = p.x + (ball.x - p.x) * 0.45;
        y = p.y + (ball.y - p.y) * 0.45;
      }
      x = clamp(x, 0.03, 0.97);
      y = clamp(y, 0.08, 0.92);
      if (Math.hypot(x - ball.x, y - ball.y) < 0.024) {
        const ux = (x - ball.x) || 0.02;
        const uy = (y - ball.y) || 0.01;
        const n = Math.hypot(ux, uy) || 1;
        x = ball.x + ux / n * 0.028;
        y = ball.y + uy / n * 0.028;
      }
      return Object.assign({}, p, { x: x, y: y });
    });
  }


  function carryEndPoint(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const carryDist = Math.min(0.09, Math.max(0.035, dist * 0.26));
    const ux = dx / dist, uy = dy / dist;
    const side = ((a.x * 17 + a.y * 13) % 1) > 0.5 ? 1 : -1;
    return {
      x: clamp(a.x + ux * carryDist + (-uy) * 0.014 * side, 0.02, 0.98),
      y: clamp(a.y + uy * carryDist + (ux) * 0.014 * side, 0.02, 0.98)
    };
  }

  function wantsCarry(a, b) {
    if (!a || !b) return false;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 0.02) return false;
    const k = (b.kind || a.kind || 'ground');
    if (k === 'shot' || k === 'corner' || k === 'freekick') return dist < 0.35;
    return dist < 0.42;
  }

  function carryFracFor(a, b) {
    if (!wantsCarry(a, b)) return 0;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    return clamp(0.30 + dist * 0.08, 0.28, 0.42);
  }

  function segmentKind(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (b.kind) return b.kind;
    if (dist >= 0.32) return 'lofted';
    return 'ground';
  }

  function bezierPoint(a, ctrl, b, u) {
    const o = 1 - u;
    return {
      x: o * o * a.x + 2 * o * u * ctrl.x + u * u * b.x,
      y: o * o * a.y + 2 * o * u * ctrl.y + u * u * b.y
    };
  }

  function smoothCtrl(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    return { x: clamp(mx - dy * 0.12, 0.02, 0.98), y: clamp(my + dx * 0.12, 0.02, 0.98) };
  }

  function samplePath(points, t) {
    const pts = points || [];
    if (!pts.length) return null;
    if (pts.length === 1 || t <= pts[0].t) {
      const p = pts[0];
      return { x: p.x, y: p.y, lift: 0, kind: 'idle', u: 0, seg: 0, carrying: false, event: p };
    }
    const last = pts[pts.length - 1];
    if (t >= last.t) {
      return { x: last.x, y: last.y, lift: 0, kind: 'idle', u: 1, seg: pts.length - 1, carrying: false, event: last };
    }
    let i = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      if (t < pts[k + 1].t) { i = k; break; }
    }
    const a = pts[i];
    const b = pts[i + 1];
    const dur = Math.max(0.001, b.t - a.t);
    const uRaw = clamp((t - a.t) / dur, 0, 1);
    const kind = segmentKind(a, b);
    const frac = carryFracFor(a, b);
    let pt, lift = 0, carrying = false, actionKind = kind;
    if (frac > 0 && uRaw < frac) {
      const local = easeInOutCubic(uRaw / frac);
      const c = carryEndPoint(a, b);
      pt = { x: lerp(a.x, c.x, local), y: lerp(a.y, c.y, local) };
      lift = 0;
      carrying = true;
      actionKind = 'carry';
    } else {
      const localRaw = frac > 0 ? (uRaw - frac) / (1 - frac) : uRaw;
      const u = easeInOutCubic(clamp(localRaw, 0, 1));
      const start = frac > 0 ? carryEndPoint(a, b) : a;
      const ctrl = smoothCtrl(start, b);
      pt = bezierPoint(start, ctrl, b, u);
      if (kind === 'lofted' || kind === 'shot' || kind === 'corner') {
        lift = Math.sin(u * Math.PI) * (kind === 'lofted' ? 0.55 : 0.4);
      }
    }
    return {
      x: pt.x, y: pt.y, lift, kind: actionKind, u: uRaw, seg: i,
      carrying, event: a
    };
  }

  function shouldPause(opts) {
    const o = opts || {};
    if (o.hidden) return true;
    if (o.overlayOpen) return true;
    if (o.tabVisible === false) return true;
    return false;
  }

  function statusLabel(state) {
    const s = state || {};
    if (s.note) return s.note;
    if (!canAnimateLive(s, s.now) && !s.finished && !FINISH_PHASES.has(String(s.phase || '').toUpperCase())) {
      return '未开赛';
    }
    if (s.finished || FINISH_PHASES.has(String(s.phase || '').toUpperCase())) {
      return s.phaseZh || '完场';
    }
    const liveLab = composeLiveStatusLabel(s, s.points, s.events);
    if (liveLab) return liveLab;
    if (!s.hasCoords) return '暂无持球信息';
    const zh = s.phaseZh || '';
    const elapsed = s.elapsed;
    if (zh && elapsed != null && ['1H', '2H', 'ET', 'LIVE'].includes(String(s.phase || '').toUpperCase())) {
      return zh + ' ' + elapsed + "'";
    }
    return zh || '进行中';
  }

  /* ---------- DOM engine (browser only) ---------- */
  const instances = new Map();

  function assetUrl(rel) {
    return rel;
  }

  function shellHtml(opts) {
    const o = opts || {};
    const wx = weatherType(o.weather);
    const phases = [0, 1, 2].map(function (i) {
      const cls = i === 0 ? 'pitch-bg is-active' : 'pitch-bg';
      return '<img class="' + cls + '" data-phase="' + i + '" alt="" src="' + assetUrl(PLATE_BASE + i + '.webp') + '" draggable="false" />';
    }).join('');
    const hold = '<img class="pitch-bg-hold" alt="" src="' + assetUrl(PLATE_BASE + '0.webp') + '" draggable="false" />';
    const homeCrest = o.homeCrestHtml || '';
    const awayCrest = o.awayCrestHtml || '';
    const homeName = escText(o.homeName || '');
    const awayName = escText(o.awayName || '');
    return (
      '<div class="pitch-live-wrap" data-wx="' + wx + '">' +
        '<div class="cam-layer">' +
          '<div class="pitch-world">' +
            hold + '<div class="pitch-bg-stack" data-led-phase="0">' + phases + '</div>' +
            '<i class="pl-wx-open-sky"></i>' +
            '<canvas class="pl-wx-sky-flash" width="1600" height="900"></canvas>' +
            '<canvas class="pitch-live-cv" width="1600" height="900"></canvas>' +
          '</div>' +
        '</div>' +
        '<div class="pitch-live-wx" aria-hidden="true">' +
          '<i class="pl-wx-grade"></i>' +
          '<canvas class="pl-wx-rain" width="640" height="360"></canvas>' +
        '</div>' +
        '<div class="pitch-live-chrome">' +
          '<div class="pl-side is-home">' + homeCrest + (homeName ? '<span class="pl-tname">' + homeName + '</span>' : '') + '</div>' +
          '<div class="pl-status"><span class="pl-status-lab"></span></div>' +
          '<div class="pl-side is-away">' + (awayName ? '<span class="pl-tname">' + awayName + '</span>' : '') + awayCrest + '</div>' +
        '</div>' +
        '<button type="button" class="pl-expand" aria-label="全屏观看球场" title="全屏观看">' + EXPAND_ICON_SVG + '</button>' +
        '<div class="pitch-live-fx" aria-hidden="true"></div>' +
      '</div>'
    );
  }

  const HOME_SHAPE = [
    { role: 'gk', x: 0.06, y: 0.50 },
    { role: 'd', x: 0.18, y: 0.16 },
    { role: 'd', x: 0.16, y: 0.36 },
    { role: 'd', x: 0.16, y: 0.64 },
    { role: 'd', x: 0.18, y: 0.84 },
    { role: 'm', x: 0.32, y: 0.26 },
    { role: 'm', x: 0.30, y: 0.50 },
    { role: 'm', x: 0.32, y: 0.74 },
    { role: 'f', x: 0.48, y: 0.30 },
    { role: 'f', x: 0.54, y: 0.50 },
    { role: 'f', x: 0.48, y: 0.70 },
  ];

  function baseShape(side) {
    return HOME_SHAPE.map(function (p) {
      return { role: p.role, x: side === 'away' ? (1 - p.x) : p.x, y: p.y };
    });
  }

  /**
   * Simulated 11v11 off-the-ball shape when SM has no player coordinates.
   * Anchored to the real ball / attacking side. Never claims a named holder.
   */
  function simulatedPlayersAt(t, opts) {
    const o = opts || {};
    const ball = o.ball && Number.isFinite(Number(o.ball.x)) ? { x: Number(o.ball.x), y: Number(o.ball.y) } : null;
    const attack = o.attackingSide === 'home' || o.attackingSide === 'away' ? o.attackingSide : null;
    const time = Number(t) || 0;
    const out = [];
    ['home', 'away'].forEach(function (side) {
      const base = baseShape(side);
      const attacking = attack === side;
      const defending = !!(attack && attack !== side);
      base.forEach(function (b, i) {
        let x = b.x, y = b.y;
        if (ball) {
          const gx = side === 'home' ? 0 : 1;
          if (b.role === 'gk') {
            x = b.x + (ball.x - 0.5) * 0.04 * (side === 'home' ? 1 : -1);
            y = b.y + (ball.y - 0.5) * 0.10;
          } else if (defending) {
            const depth = b.role === 'd' ? 0.50 : (b.role === 'm' ? 0.68 : 0.82);
            x = gx + (ball.x - gx) * depth;
            y = y + (ball.y - y) * 0.28;
          } else {
            const pull = attacking ? 0.32 : 0.14;
            x = x + (ball.x - x) * pull;
            y = y + (ball.y - y) * (attacking ? 0.20 : 0.12);
          }
        }
        if (b.role !== 'gk') {
          const phase = (i + 1) * 1.7 + (side === 'away' ? 3.1 : 0);
          x += Math.sin(time * 1.15 + phase) * 0.012;
          y += Math.cos(time * 0.95 + phase * 1.3) * 0.016;
        }
        x = clamp(x, 0.03, 0.97);
        y = clamp(y, 0.08, 0.92);
        if (ball && Math.hypot(x - ball.x, y - ball.y) < 0.028) {
          const ux = (x - ball.x) || 0.02;
          const uy = (y - ball.y) || 0.01;
          const n = Math.hypot(ux, uy) || 1;
          x = ball.x + ux / n * 0.03;
          y = ball.y + uy / n * 0.03;
        }
        out.push({ side: side, role: b.role, x: x, y: y, simulated: true });
      });
    });
    return out;
  }

  function stepSimulatedPlayers(prev, target, dt) {
    const maxV = 0.22;
    const cap = maxV * Math.max(0.001, Number(dt) || 0.016);
    return (target || []).map(function (p, i) {
      const q = (prev && prev[i]) || p;
      const dx = p.x - q.x, dy = p.y - q.y;
      const dist = Math.hypot(dx, dy);
      const f = dist > cap && dist > 0 ? cap / dist : 1;
      return Object.assign({}, p, { x: q.x + dx * f, y: q.y + dy * f });
    });
  }

  function drawSimulatedPlayers(ctx, players) {
    if (!ctx || !players || !players.length) return;
    for (let i = 0; i < players.length; i++) {
      const pl = players[i];
      const p = project(pl.x, pl.y);
      const s = p.s;
      const r = (pl.role === 'gk' ? 5.2 : 4.6) * s;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(p.x + 0.8 * s, p.y + 1.6 * s, r * 1.15, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pl.side === 'home' ? '#5b7cfa' : '#ff4d7a';
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 1.2 * s, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBall(ctx, px, py, lift) {
    const p = project(px, py);
    const s = p.s;
    const r = 7.5 * s;
    const shadowScale = 1 - lift * 0.45;
    const ballY = p.y - lift * 30 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.4 * shadowScale) + ')';
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + 2 * s, r * 1.2 * shadowScale, r * 0.42 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    const grd = ctx.createRadialGradient(p.x - r * 0.3, ballY - r * 0.35, r * 0.1, p.x, ballY, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.6, '#f2f2f2');
    grd.addColorStop(1, '#bdbdbd');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, ballY, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const bx = p.x + Math.cos(ang) * r * 0.42;
      const by = ballY + Math.sin(ang) * r * 0.42;
      if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.lineWidth = 1.0 * s;
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + i * Math.PI * 2 / 5;
      ctx.beginPath();
      ctx.moveTo(p.x, ballY);
      ctx.lineTo(p.x + Math.cos(ang) * r * 0.92, ballY + Math.sin(ang) * r * 0.92);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(p.x - r * 0.28, ballY - r * 0.3, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTrail(ctx, trail, nowT) {
    if (!trail || !trail.length) return;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const age = nowT - b.t;
      const alpha = clamp(1 - age / 1.6, 0, 0.55);
      if (alpha <= 0.02) continue;
      const pa = project(a.x, a.y);
      const pb = project(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.lineWidth = 2.2 * ((pa.s + pb.s) / 2);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  function drawRunner(ctx, sample) {
    if (!sample || !sample.carrying) return;
    const p = project(sample.x, sample.y);
    const s = p.s;
    ctx.save();
    ctx.fillStyle = 'rgba(20, 28, 44, 0.72)';
    ctx.beginPath();
    ctx.ellipse(p.x - 10 * s, p.y + 3 * s, 5.5 * s, 3.2 * s, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230, 236, 246, 0.92)';
    ctx.beginPath();
    ctx.arc(p.x - 11 * s, p.y - 8 * s, 3.1 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - 13.2 * s, p.y - 5 * s, 4.4 * s, 8 * s);
    ctx.restore();
  }

  function makeRainDrops(n, w, h, intensity) {
    const drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({
        x: Math.random() * (w + 80) - 40,
        y: Math.random() * (h + 60) - 30,
        len: 6 + Math.random() * (intensity > 0.6 ? 16 : 11) + Math.random() * 10,
        sp: 220 + Math.random() * 420 + intensity * 80,
        thick: 0.6 + Math.random() * 1.1,
        ang: (8 + Math.random() * 10 - 5) * Math.PI / 180,
        alpha: 0.18 + Math.random() * 0.35,
      });
    }
    return drops;
  }

  function paintRain(canvas, drops, dt, intensity) {
    if (!canvas || !drops) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (intensity <= 0) return;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.x += Math.sin(d.ang) * d.sp * dt;
      d.y += Math.cos(d.ang) * d.sp * dt;
      if (d.y > h + 20 || d.x > w + 40) {
        d.x = Math.random() * (w + 80) - 40;
        d.y = -20 - Math.random() * 40;
        d.len = 6 + Math.random() * (intensity > 0.6 ? 16 : 11) + Math.random() * 10;
        d.sp = 220 + Math.random() * 420 + intensity * 80;
        d.ang = (8 + Math.random() * 10 - 5) * Math.PI / 180;
      }
      const x2 = d.x + Math.sin(d.ang) * d.len;
      const y2 = d.y + Math.cos(d.ang) * d.len;
      ctx.strokeStyle = 'rgba(210, 224, 240,' + d.alpha * intensity + ')';
      ctx.lineWidth = d.thick;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  function rainIntensity(type) {
    if (type === 'light-rain') return 0.45;
    if (type === 'rain') return 0.8;
    if (type === 'storm') return 1;
    return 0;
  }

  function setLedPhase(stack, phase) {
    if (!stack) return 0;
    const p = ((phase % LED_PHASE_COUNT) + LED_PHASE_COUNT) % LED_PHASE_COUNT;
    stack.setAttribute('data-led-phase', String(p));
    const imgs = stack.querySelectorAll('.pitch-bg');
    for (let i = 0; i < imgs.length; i++) {
      const ph = Number(imgs[i].getAttribute('data-phase'));
      imgs[i].classList.toggle('is-active', ph === p);
    }
    return p;
  }

  function applyWeatherDom(wrap, type) {
    if (!wrap) return weatherType(type);
    const t = weatherType(type);
    wrap.setAttribute('data-wx', t);
    wrap.classList.toggle('is-sunny', t === 'sunny');
    wrap.classList.toggle('is-cloudy', t === 'cloudy');
    wrap.classList.toggle('is-rain', t === 'light-rain' || t === 'rain' || t === 'storm');
    wrap.classList.toggle('is-storm', t === 'storm');
    if (t !== 'storm') wrap.classList.remove('is-flashing');
    return t;
  }

  function jaggedPath(x0, y0, x1, y1, segs, jagX, jagY) {
    const pts = [[x0, y0]];
    const n = Math.max(4, segs || 8);
    const jx = jagX == null ? 36 : jagX;
    const jy = jagY == null ? 18 : jagY;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([
        x0 + (x1 - x0) * t + (Math.random() - 0.5) * jx,
        y0 + (y1 - y0) * t + (Math.random() - 0.5) * jy
      ]);
    }
    pts.push([x1, y1]);
    return pts;
  }

  function strokeSkyPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = 'rgba(170, 210, 255, 0.55)';
    ctx.lineWidth = 9;
    ctx.shadowColor = 'rgba(210, 235, 255, 0.95)';
    ctx.shadowBlur = 14;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.lineWidth = 3.6;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#f7fbff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  function paintSkyFlash(inst, opts) {
    const cv = inst && inst.el && inst.el.querySelector('.pl-wx-sky-flash');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width || 1600;
    const h = cv.height || 900;
    ctx.clearRect(0, 0, w, h);
    let main, fork;
    if (opts && opts.preview) {
      // Jagged strike in the top opening, with a fork down the left wedge.
      main = [[18, 42], [130, 20], [250, 58], [390, 16], [540, 50], [700, 18], [860, 54], [1020, 14], [1180, 46], [1360, 18], [1576, 40]];
      fork = [[130, 20], [108, 68], [86, 112], [60, 168], [34, 220], [16, 258]];
    } else {
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? (16 + Math.random() * 140) : (w - 16 - Math.random() * 140);
      const x1 = fromLeft ? (w * 0.52 + Math.random() * w * 0.42) : (Math.random() * w * 0.42);
      const y0 = 16 + Math.random() * 40;
      const y1 = 16 + Math.random() * 40;
      main = jaggedPath(x0, y0, x1, y1, 11 + Math.floor(Math.random() * 5), 42, 22);
      main = main.map(function (p) { return [p[0], Math.max(12, Math.min(68, p[1]))]; });
      const sideL = Math.random() < 0.55;
      const mid = main[Math.max(1, Math.floor(main.length * (0.1 + Math.random() * 0.2)))];
      const sx = sideL ? Math.min(mid[0], 150 + Math.random() * 70) : Math.max(mid[0], w - 220 - Math.random() * 70);
      const ex = sideL ? (8 + Math.random() * 40) : (w - 8 - Math.random() * 40);
      const ey = 140 + Math.random() * 110;
      fork = jaggedPath(sx, mid[1], ex, ey, 7 + Math.floor(Math.random() * 3), 24, 20);
    }
    strokeSkyPath(ctx, main);
    strokeSkyPath(ctx, fork);
  }

  function clearSkyFlash(inst) {
    const cv = inst && inst.el && inst.el.querySelector('.pl-wx-sky-flash');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, cv.width || 1600, cv.height || 900);
  }

  function clearStormFlash(inst) {
    if (!inst) return;
    if (inst._flashTimer) { clearTimeout(inst._flashTimer); inst._flashTimer = 0; }
    if (inst._flashOff) { clearTimeout(inst._flashOff); inst._flashOff = 0; }
    if (inst._flashOff2) { clearTimeout(inst._flashOff2); inst._flashOff2 = 0; }
    if (inst.wrap) inst.wrap.classList.remove('is-flashing');
    clearSkyFlash(inst);
  }

  function armStormFlash(inst) {
    if (!inst) return;
    if (inst._flashTimer) { clearTimeout(inst._flashTimer); inst._flashTimer = 0; }
    if (inst.destroyed || inst.weather !== 'storm') return;
    const wait = 20000 + Math.random() * 40000;
    inst._flashTimer = setTimeout(function () { burstStormFlash(inst); }, wait);
  }

  function burstStormFlash(inst) {
    if (!inst || inst.destroyed || inst.weather !== 'storm' || !inst.wrap) return;
    const wrap = inst.wrap;
    function pulse(ms) {
      paintSkyFlash(inst);
      wrap.classList.add('is-flashing');
      inst._flashOff = setTimeout(function () {
        wrap.classList.remove('is-flashing');
        clearSkyFlash(inst);
      }, ms);
    }
    pulse(160 + Math.random() * 80); // a beat longer so the streak can be seen
    if (Math.random() < 0.4) {
      inst._flashOff2 = setTimeout(function () {
        if (!inst.destroyed && inst.weather === 'storm') pulse(120 + Math.random() * 70);
      }, 110 + Math.random() * 90);
    }
    armStormFlash(inst);
  }

  function mount(el, opts) {
    if (!el || typeof document === 'undefined') return null;
    const o = opts || {};
    const existing = instances.get(el);
    if (existing) {
      existing.update(o);
      return existing;
    }
    el.classList.add('pitch-live');
    el.innerHTML = shellHtml(o);
    const wrap = el.querySelector('.pitch-live-wrap');
    const camLayer = el.querySelector('.cam-layer');
    const canvas = el.querySelector('.pitch-live-cv');
    const ctx = canvas && canvas.getContext('2d', { alpha: true });
    const stack = el.querySelector('.pitch-bg-stack');
    const rainCv = el.querySelector('.pl-wx-rain');
    const statusLab = el.querySelector('.pl-status-lab');
    const fxBox = el.querySelector('.pitch-live-fx');
    const expandBtn = el.querySelector('.pl-expand');

    const inst = {
      el,
      wrap,
      destroyed: false,
      paused: !!o.paused,
      hidden: false,
      overlayOpen: false,
      tabVisible: o.tabVisible !== false,
      weather: weatherType(o.weather),
      onExpand: typeof o.onExpand === 'function' ? o.onExpand : null,
      state: Object.assign({ hasCoords: false, phase: 'NS' }, o.state || o),
      points: [],
      playhead: 0,
      trail: [],
      simPlayers: [],
      simClock: 0,
      cam: { x: 0.5, y: 0.52, z: CAM_IDLE_SCALE, tx: 0, ty: 0, tz: CAM_IDLE_SCALE, init: false },
      raf: 0,
      ledTimer: 0,
      ledPhase: 0,
      ledLast: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      lastTs: 0,
      rainDrops: null,
      seenEvents: new Set(),
      eventsPrimed: false,
      allowPreviewDemo: !!o.allowPreviewDemo,
      previewDemo: false,
      ballVisible: false,
      frozen: false,
      homeName: o.homeName || '',
      awayName: o.awayName || '',
    };

    applyWeatherDom(wrap, inst.weather);
    armStormFlash(inst);

    function liveOk() {
      return canAnimateLive(inst.state, inst.state.now || Date.now());
    }

    function pausedNow() {
      return shouldPause({
        hidden: inst.hidden || (typeof document !== 'undefined' && document.hidden),
        overlayOpen: inst.overlayOpen,
        tabVisible: inst.tabVisible,
      }) || inst.paused || inst.destroyed;
    }

    function writeStatus() {
      if (!statusLab) return;
      const s = Object.assign({}, inst.state, {
        points: inst.points,
        homeName: inst.homeName || inst.state.homeName,
        awayName: inst.awayName || inst.state.awayName,
        hasCoords: inst.points.length > 0,
      });
      const pre = !liveOk() && !s.finished;
      const side = attackingSideOf(inst.points, s);
      let note = '';
      if (pre) note = '未开赛';
      else if (s.finished) note = s.phaseZh || '完场';
      else note = statusLabel(s);
      statusLab.textContent = note;
      wrap.classList.toggle('is-pre', pre && !s.finished);
      wrap.classList.toggle('is-nocoords', !pre && !inst.points.length && !s.finished);
      wrap.classList.toggle('is-live', liveOk() && inst.points.length > 0);
      wrap.classList.toggle('is-attack-home', !pre && !s.finished && side === 'home');
      wrap.classList.toggle('is-attack-away', !pre && !s.finished && side === 'away');
    }

    function ingestCoords(pack) {
      if (!pack) return;
      // Production path: never accept preview-only demo coordinates.
      if (pack.previewDemoCoords && !inst.allowPreviewDemo) {
        pack = mergeLastGood({ coords: inst.points }, Object.assign({}, pack, { coords: [], hasCoords: false, previewRejected: true }));
      }
      const merged = mergeLastGood({ coords: inst.points, hasCoords: inst.points.length > 0 }, pack);
      const pts = pointsFromCoords(merged && merged.coords);
      inst.points = pts;
      inst.state = Object.assign({}, inst.state, {
        hasCoords: pts.length > 0,
        keptLastGood: !!(merged && merged.keptLastGood),
        live: pack.live != null ? !!pack.live : inst.state.live,
        finished: pack.finished != null ? !!pack.finished : inst.state.finished,
        phase: pack.phase || inst.state.phase,
        phaseZh: pack.phaseZh || inst.state.phaseZh,
        elapsed: pack.elapsed != null ? pack.elapsed : inst.state.elapsed,
        kickoffMs: pack.kickoffMs != null ? pack.kickoffMs : inst.state.kickoffMs,
        attackingSide: pack.attackingSide || pack.possessionSide || inst.state.attackingSide,
        homeName: pack.homeName || inst.state.homeName || inst.homeName,
        awayName: pack.awayName || inst.state.awayName || inst.awayName,
      });
      inst.frozen = !!inst.state.finished && pts.length > 0;
      inst.state.attackingSide = attackingSideOf(pts, inst.state);
      inst.state.points = pts;
      inst.state.homeName = inst.state.homeName || inst.homeName;
      inst.state.awayName = inst.state.awayName || inst.awayName;
      if (pts.length) {
        const lastT = pts[pts.length - 1].t;
        if (!inst._primedPlayhead) {
          inst.playhead = startPlayhead(pts);
          inst._primedPlayhead = true;
        }
        if (inst.frozen || !liveOk()) inst.playhead = lastT;
        if (liveOk() && inst.playhead < pts[0].t) inst.playhead = pts[0].t;
        if (liveOk() && inst.playhead > lastT) inst.playhead = lastT;
      }
      writeStatus();
    }

    function updateCamera(sample, dt, followBall) {
      const idle = !followBall || !sample;
      const p = sample ? project(sample.x, sample.y) : { x: IMG_W * 0.5, y: IMG_H * 0.62 };
      const nx = clamp(p.x / IMG_W, 0, 1);
      const ny = clamp(p.y / IMG_H, 0, 1);
      let targetX = idle ? 0.5 : nx;
      let targetY = idle ? 0.52 : (ny * 0.85 + 0.08);
      let targetZ = idle ? CAM_IDLE_SCALE : CAM_SCALE_BASE;
      if (!idle && sample) {
        if (sample.kind === 'shot') targetZ = CAM_SCALE_BASE * 1.08;
        else if (sample.kind === 'corner') targetZ = CAM_SCALE_BASE * 1.12;
        else if (sample.x > 0.72 || sample.x < 0.28) targetZ = CAM_SCALE_BASE * 1.05;
      }
      const follow = 1 - Math.exp(-(dt || 0.016) * (idle ? 2.2 : 3.2));
      const cam = inst.cam;
      if (!cam.init) {
        cam.x = targetX; cam.y = targetY; cam.z = targetZ;
        cam.init = true;
      } else {
        cam.x = lerp(cam.x, targetX, follow);
        cam.y = lerp(cam.y, targetY, follow * 0.85);
        cam.z = lerp(cam.z, targetZ, follow * 0.6);
      }
      const z = cam.z;
      const box = wrap.getBoundingClientRect();
      const W = box.width || 1;
      const H = box.height || 1;
      let tx = W * 0.5 - cam.x * W * z;
      let ty = H * 0.5 - cam.y * H * z;
      tx = clamp(tx, W * (1 - z), 0);
      ty = clamp(ty, H * (1 - z), 0);
      cam.tx = tx; cam.ty = ty; cam.tz = z;
      if (camLayer) {
        camLayer.style.transform = 'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + z.toFixed(4) + ')';
      }
    }

    function triggerEventFX(events) {
      if (!events || !events.length || !fxBox) return;
      if (!inst.eventsPrimed) {
        for (const e of events) if (e && e.id) inst.seenEvents.add(String(e.id));
        inst.eventsPrimed = true;
        return;
      }
      const fresh = [];
      for (const e of events) {
        if (!e || !e.id) continue;
        const id = String(e.id);
        if (inst.seenEvents.has(id)) continue;
        inst.seenEvents.add(id);
        fresh.push(e);
      }
      for (const e of fresh.slice(-3)) {
        if (e.kind === 'goal') {
          wrap.classList.remove('pitch-shake');
          void wrap.offsetWidth;
          wrap.classList.add('pitch-shake');
          const who = e.playerZh || e.player || '';
          fxBox.innerHTML = '<div class="pl-fx-goal">进球' + (who ? ' · ' + who : '') + '</div>';
          setTimeout(function () { if (!inst.destroyed) fxBox.innerHTML = ''; }, 2200);
        } else if (e.kind === 'yellow' || e.kind === 'red') {
          const who = e.playerZh || e.player || '';
          const lab = e.kind === 'red' ? '红牌' : '黄牌';
          fxBox.innerHTML = '<div class="pl-fx-card is-' + e.kind + '">' + lab + (who ? ' · ' + who : '') + '</div>';
          setTimeout(function () { if (!inst.destroyed) fxBox.innerHTML = ''; }, 1800);
        }
      }
    }

    function tickLed(now) {
      if (now - inst.ledLast >= LED_PHASE_MS) {
        inst.ledPhase = setLedPhase(stack, inst.ledPhase + 1);
        inst.ledLast = now;
      }
    }

    function frame(ts) {
      if (inst.destroyed) return;
      inst.raf = 0;
      if (pausedNow()) {
        inst.lastTs = 0;
        return;
      }
      const dt = inst.lastTs ? clamp((ts - inst.lastTs) / 1000, 0, 0.08) : 0.016;
      inst.lastTs = ts;
      tickLed(ts);
      const animate = liveOk() && !inst.frozen;
      let sample = null;
      let officialActive = false;
      const oop = officialOutOfPlay({
        events: inst.state.events,
        points: inst.points,
        lastPoint: inst.points.length ? inst.points[inst.points.length - 1] : null,
        state: inst.state,
      });
      if (inst.points.length) {
        const lastT = inst.points[inst.points.length - 1].t;
        if (animate && inst.playhead < lastT - 1e-4) {
          inst.playhead = Math.min(lastT, inst.playhead + dt);
          sample = samplePath(inst.points, inst.playhead);
          officialActive = true;
        } else {
          inst.playhead = lastT;
          sample = samplePath(inst.points, lastT);
        }
      } else if (!liveOk() && !inst.state.finished) {
        sample = { x: 0.5, y: 0.5, lift: 0, kind: 'idle', carrying: false };
      }
      if (animate && !officialActive && !oop) {
        const last = sample || (inst._coast ? { x: inst._coast.x, y: inst._coast.y } : { x: 0.5, y: 0.5 });
        inst._coast = stepSimBall(inst._coast || { x: last.x, y: last.y, vx: 0, vy: 0, side: attackingSideOf(inst.points, inst.state) }, {
          official: last,
          officialActive: false,
          outOfPlay: false,
          events: inst.state.events,
          lastPoint: inst.points.length ? inst.points[inst.points.length - 1] : null,
          attackingSide: (inst._coast && inst._coast.side) || attackingSideOf(inst.points, inst.state),
          players: inst.simPlayers,
        }, dt);
        sample = { x: inst._coast.x, y: inst._coast.y, lift: 0, kind: inst._coast.mode || 'dribble', carrying: inst._coast.mode === 'dribble', event: null };
      } else if (officialActive && sample) {
        inst._coast = stepSimBall(inst._coast, {
          official: sample,
          officialActive: true,
          attackingSide: attackingSideOf(inst.points, inst.state),
        }, dt);
        if (inst._coast && inst._coast.mode === 'blend') {
          sample = { x: inst._coast.x, y: inst._coast.y, lift: sample.lift || 0, kind: sample.kind, carrying: !!sample.carrying, event: sample.event };
        } else {
          inst._coast = { x: sample.x, y: sample.y, vx: 0, vy: 0, mode: 'official', official: true };
        }
      } else if (oop && sample) {
        inst._coast = { x: sample.x, y: sample.y, vx: 0, vy: 0, mode: 'dead' };
      }
      const coasting = !!(animate && inst._coast && inst._coast.simulated && !officialActive);
      const showBall = !!(sample && (inst.points.length || coasting || (!liveOk() && !inst.state.finished)));
      const ballOn = showBall && (inst.points.length > 0 || coasting || (!liveOk() && !inst.state.finished));
      if (ctx) {
        ctx.clearRect(0, 0, IMG_W, IMG_H);
        drawGoals(ctx);
        if (ballOn && sample && (inst.points.length || coasting)) {
          inst.trail.push({ x: sample.x, y: sample.y, t: inst.playhead });
          if (inst.trail.length > 24) inst.trail.shift();
          drawTrail(ctx, inst.trail, inst.playhead);
        } else {
          inst.trail = [];
        }
        const showSims = !!(liveOk() || inst.state.finished);
        if (showSims) {
          inst.simClock = (inst.simClock || 0) + dt;
          const side = (inst._coast && inst._coast.side) || attackingSideOf(inst.points, inst.state);
          const ball = sample && ballOn ? { x: sample.x, y: sample.y } : null;
          let target = simulatedPlayersAt(inst.simClock, { ball: ball, attackingSide: side });
          if (ball && inst._coast && inst._coast.mode && inst._coast.mode !== 'official' && inst._coast.mode !== 'dead') {
            target = applySimBallSupport(target, ball, inst._coast);
          }
          inst.simPlayers = stepSimulatedPlayers(inst.simPlayers, target, dt);
          drawSimulatedPlayers(ctx, inst.simPlayers);
        }
        if (ballOn && sample && inst.points.length && officialActive) drawRunner(ctx, sample);
        if (ballOn && sample) drawBall(ctx, sample.x, sample.y, sample.lift || 0);
      }
      updateCamera(sample, dt, liveOk() && !!(inst.points.length || coasting));
      const inten = rainIntensity(inst.weather);
      if (inten > 0 && rainCv) {
        const n = inst.weather === 'light-rain' ? 42 : inst.weather === 'rain' ? 70 : 96;
        if (!inst.rainDrops || inst.rainDrops.length !== n) inst.rainDrops = makeRainDrops(n, rainCv.width, rainCv.height, inten);
        paintRain(rainCv, inst.rainDrops, dt, inten);
      } else if (rainCv) {
        const rctx = rainCv.getContext('2d');
        if (rctx) rctx.clearRect(0, 0, rainCv.width, rainCv.height);
        inst.rainDrops = null;
      }
      inst.raf = requestAnimationFrame(frame);
    }

    function ensureLoop() {
      if (inst.destroyed || inst.raf || pausedNow()) return;
      inst.lastTs = 0;
      inst.raf = requestAnimationFrame(frame);
    }

    function stopLoop() {
      if (inst.raf) {
        try { cancelAnimationFrame(inst.raf); } catch (_) {}
        inst.raf = 0;
      }
      inst.lastTs = 0;
    }

    inst.setPaused = function (p) {
      inst.paused = !!p;
      if (inst.paused) stopLoop();
      else ensureLoop();
    };
    inst.setHidden = function (h) {
      inst.hidden = !!h;
      if (inst.hidden) stopLoop();
      else ensureLoop();
    };
    inst.setOverlayOpen = function (v) {
      inst.overlayOpen = !!v;
      if (inst.overlayOpen) stopLoop();
      else ensureLoop();
    };
    inst.setTabVisible = function (v) {
      inst.tabVisible = !!v;
      if (!inst.tabVisible) stopLoop();
      else ensureLoop();
    };
    inst.setWeather = function (type) {
      const prev = inst.weather;
      inst.weather = applyWeatherDom(wrap, type);
      if (inst.weather !== prev) {
        clearStormFlash(inst);
        armStormFlash(inst);
      }
    };
    inst.paintSkyFlash = function (opts) { paintSkyFlash(inst, opts); };
    inst.clearSkyFlash = function () { clearSkyFlash(inst); };
    inst.update = function (next) {
      const n = next || {};
      if (n.weather) inst.setWeather(n.weather);
      if (n.onExpand !== undefined) inst.onExpand = typeof n.onExpand === 'function' ? n.onExpand : null;
      if (n.state) inst.state = Object.assign({}, inst.state, n.state);
      if (n.kickoffMs != null) inst.state.kickoffMs = n.kickoffMs;
      if (n.phase) inst.state.phase = n.phase;
      if (n.phaseZh) inst.state.phaseZh = n.phaseZh;
      if (n.live != null) inst.state.live = n.live;
      if (n.finished != null) inst.state.finished = n.finished;
      if (n.elapsed != null) inst.state.elapsed = n.elapsed;
      if (n.now != null) inst.state.now = n.now;
      if (n.homeCrestHtml || n.awayCrestHtml || n.homeName || n.awayName) {
        const home = el.querySelector('.pl-side.is-home');
        const away = el.querySelector('.pl-side.is-away');
        if (home && (n.homeCrestHtml || n.homeName)) {
          home.innerHTML = (n.homeCrestHtml || '') + (n.homeName ? '<span class="pl-tname">' + escText(n.homeName) + '</span>' : '');
        }
        if (away && (n.awayCrestHtml || n.awayName)) {
          away.innerHTML = (n.awayName ? '<span class="pl-tname">' + escText(n.awayName) + '</span>' : '') + (n.awayCrestHtml || '');
        }
        if (n.homeName) inst.homeName = n.homeName;
        if (n.awayName) inst.awayName = n.awayName;
      }
      if (n.attackingSide || n.possessionSide) {
        inst.state.attackingSide = n.attackingSide || n.possessionSide;
      }
      if (n.coords || n.pack || n.hasCoords === false || (n.pack && 'coords' in n.pack)) {
        ingestCoords(n.pack || n);
      }
      if (n.events) {
        inst.state.events = n.events;
        triggerEventFX(n.events);
      }
      writeStatus();
      ensureLoop();
    };
    inst.resize = function () {
      inst.cam.init = false;
    };
    inst.destroy = function () {
      inst.destroyed = true;
      clearStormFlash(inst);
      stopLoop();
      if (inst._onExpand) {
        try { expandBtn && expandBtn.removeEventListener('click', inst._onExpand); } catch (_) {}
      }
      if (inst._onFsClose) {
        try { document.removeEventListener('keydown', inst._onFsKey); } catch (_) {}
      }
      exitExpand(true);
      instances.delete(el);
      try { el.innerHTML = ''; } catch (_) {}
    };
    inst.getState = function () {
      return {
        paused: pausedNow(),
        weather: inst.weather,
        points: inst.points.length,
        playhead: inst.playhead,
        canAnimate: liveOk(),
        frozen: inst.frozen,
        coast: inst._coast ? { mode: inst._coast.mode, x: inst._coast.x, y: inst._coast.y, simulated: !!inst._coast.simulated } : null,
      };
    };

    function exitExpand(fromDestroy) {
      if (!inst._expanded) return;
      inst._expanded = false;
      const holder = inst._homeParent;
      const full = document.getElementById('pitch-live-full');
      if (holder && el.parentNode !== holder) {
        try { holder.insertBefore(el, inst._homeNext || null); } catch (_) {}
      }
      el.classList.remove('is-expanded');
      if (full) {
        try { full.classList.add('hidden'); } catch (_) {}
        try { if (full.parentNode && !fromDestroy) { /* keep node for recycle */ } } catch (_) {}
        try { full.innerHTML = ''; } catch (_) {}
      }
      inst._homeParent = null;
      inst._homeNext = null;
      inst.cam.init = false;
    }

    function enterExpand() {
      if (inst._expanded || inst.destroyed) return;
      inst._homeParent = el.parentNode;
      inst._homeNext = el.nextSibling;
      let full = document.getElementById('pitch-live-full');
      if (!full) {
        full = document.createElement('div');
        full.id = 'pitch-live-full';
        full.className = 'pitch-live-full hidden';
        full.setAttribute('role', 'dialog');
        full.setAttribute('aria-label', '球场全屏');
        (document.getElementById('app') || document.body).appendChild(full);
      }
      full.innerHTML = '<button type="button" class="pl-expand-close" aria-label="退出全屏">退出全屏</button>';
      full.appendChild(el);
      el.classList.add('is-expanded');
      full.classList.remove('hidden');
      inst._expanded = true;
      inst.cam.init = false;
      const close = full.querySelector('.pl-expand-close');
      const onClose = function () { exitExpand(false); };
      inst._onFsClose = onClose;
      inst._onFsKey = function (ev) { if (ev && ev.key === 'Escape') onClose(); };
      if (close) close.addEventListener('click', onClose, { once: true });
      document.addEventListener('keydown', inst._onFsKey);
    }

    inst.expand = function () { if (!inst._expanded) enterExpand(); };
    inst.collapse = function () { exitExpand(false); };
    inst._onExpand = function (ev) {
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      if (typeof inst.onExpand === 'function') {
        try { inst.onExpand(inst); } catch (_) {}
        return;
      }
      if (inst._expanded) exitExpand(false);
      else enterExpand();
    };
    if (expandBtn) expandBtn.addEventListener('click', inst._onExpand);

    if (o.pack || o.coords) ingestCoords(o.pack || o);
    if (o.events) triggerEventFX(o.events);
    writeStatus();
    instances.set(el, inst);
    ensureLoop();
    return inst;
  }

  function get(el) { return instances.get(el) || null; }

  function syncAllMotion(flags) {
    const f = flags || {};
    instances.forEach(function (inst) {
      if (f.hidden != null) inst.setHidden(f.hidden);
      if (f.overlayOpen != null) inst.setOverlayOpen(f.overlayOpen);
      if (f.tabVisible != null) inst.setTabVisible(f.tabVisible);
      if (f.paused != null) inst.setPaused(f.paused);
    });
  }

  function destroyAll() {
    instances.forEach(function (inst) { inst.destroy(); });
  }

  return {
    MATCH_WEATHER_TYPES,
    LED_PHASE_MS,
    LED_FADE_MS,
    CORNERS,
    weatherType,
    canAnimateLive,
    normalizeXY,
    mergeLastGood,
    pointsFromCoords,
    samplePath,
    carryEndPoint,
    wantsCarry,
    carryFracFor,
    shouldPause,
    statusLabel,
    attackingSideOf,
    attackStatusLabel,
    startPlayhead,
    pathTravel,
    pathHasReplayableMotion,
    lastActionOf,
    composeLiveStatusLabel,
    isOutOfPlayKind,
    officialOutOfPlay,
    nearestSimPlayer,
    stepSimBall,
    applySimBallSupport,
    SIM_BALL_MAX_V,
    simulatedPlayersAt,
    stepSimulatedPlayers,
    HOME_SHAPE,
    PLAYHEAD_REPLAY_SEC,
    EXPAND_ICON_SVG,
    resize: function (el) {
      const inst = el && instances.get(el);
      if (inst && typeof inst.resize === 'function') inst.resize();
    },
    project,
    project3,
    goalMouth,
    drawGoals,
    GOAL_W,
    GOAL_D,
    GOAL_H,
    mount,
    get,
    syncAllMotion,
    destroyAll,
    instances,
  };
});
