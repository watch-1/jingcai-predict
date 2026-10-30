'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AdminChartSmooth = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function chartSmoothFactory() {
  function smoothPathThrough(points) {
    const pts = points || [];
    if (pts.length < 2) {
      if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
      return '';
    }
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
    }
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function smoothAreaBetween(topPts, bottomPts) {
    const n = Math.min((topPts || []).length, (bottomPts || []).length);
    if (n < 2) return '';
    const top = topPts.slice(0, n);
    const bot = bottomPts.slice(0, n);
    const topLine = smoothPathThrough(top);
    const revBottom = bot.slice().reverse();
    const bottomLine = smoothPathThrough(revBottom);
    const cIdx = bottomLine.indexOf(' C ');
    const bottomCurves = cIdx >= 0 ? bottomLine.slice(cIdx) : ` L ${revBottom[revBottom.length - 1].x.toFixed(2)} ${revBottom[revBottom.length - 1].y.toFixed(2)}`;
    return `${topLine}${bottomCurves} Z`;
  }

  /** Simpler band: smooth top, straight bottom baseline */
  function smoothAreaToBaseline(points, baselineY) {
    if (!points.length) return '';
    const top = points;
    const dTop = smoothPathThrough(top);
    const last = top[top.length - 1];
    const first = top[0];
    return `${dTop} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
  }

  function valuesToPoints(vals, w, h, pad) {
    const p = pad || { t: 4, r: 0, b: 4, l: 0 };
    const innerW = w - p.l - p.r;
    const innerH = h - p.t - p.b;
    const nums = (vals || []).map((v) => Number(v) || 0);
    const max = Math.max(1, ...nums);
    const min = Math.min(0, ...nums);
    const span = max - min || 1;
    return nums.map((v, i) => ({
      x: p.l + (i / Math.max(1, nums.length - 1)) * innerW,
      y: p.t + (1 - (v - min) / span) * innerH,
    }));
  }

  function seriesIsFlat(vals) {
    const nums = (vals || []).map((v) => Number(v) || 0);
    if (!nums.length) return true;
    return nums.every((v) => v === nums[0]);
  }

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function renderSparklineSvg(values, color, opts) {
    const w = (opts && opts.w) || 132;
    const h = (opts && opts.h) || 48;
    const stroke = color || '#60a5fa';
    const vals = values || [];
    if (!vals.length) return '';
    const baselineY = h - 8;
    const flat = seriesIsFlat(vals);

    if (flat) {
      return `<svg class="sparkline sparkline--quiet" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <line x1="4" y1="${baselineY}" x2="${w - 4}" y2="${baselineY}" class="spark-track"/>
        <line x1="4" y1="${baselineY}" x2="${w - 4}" y2="${baselineY}" class="spark-baseline"/>
      </svg>`;
    }

    const pts = valuesToPoints(vals, w, h, { t: 8, r: 4, b: 8, l: 4 });
    const gradId = uid('spark-grad');
    const glowId = uid('spark-glow');
    const areaD = smoothAreaToBaseline(pts, baselineY);
    const lineD = smoothPathThrough(pts);
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${stroke}" stop-opacity=".38"/>
          <stop offset="100%" stop-color="${stroke}" stop-opacity="0"/>
        </linearGradient>
        <filter id="${glowId}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <line x1="4" y1="${baselineY}" x2="${w - 4}" y2="${baselineY}" class="spark-baseline"/>
      <path d="${areaD}" fill="url(#${gradId})"/>
      <path d="${lineD}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".22" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <path d="${lineD}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" filter="url(#${glowId})" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  return {
    smoothPathThrough,
    smoothAreaBetween,
    smoothAreaToBaseline,
    valuesToPoints,
    seriesIsFlat,
    renderSparklineSvg,
  };
});
