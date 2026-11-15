#!/usr/bin/env node
'use strict';
/**
 * Force-rebuild asof-*.json radar indexes from player-match-rich.sqlite.
 * Usage: node tools/rebuild-radar-index.js 2026-11-13 2026-09-16 2026-09-13
 */
const fs = require('fs');
const path = require('path');
const radar = require('../lib/match-radar');

const dates = process.argv.slice(2);
if (!dates.length) {
  console.error('usage: node tools/rebuild-radar-index.js YYYY-MM-DD ...');
  process.exit(1);
}
const dir = path.join(__dirname, '..', 'data', 'radar', 'index');
fs.mkdirSync(dir, { recursive: true });
for (const d of dates) {
  const fp = path.join(dir, `asof-${d}.json`);
  if (fs.existsSync(fp)) fs.renameSync(fp, fp + '.pre-rebuild');
  const idx = radar.buildIndex(d);
  if (!idx || !idx.ok) {
    console.error(JSON.stringify({ date: d, ok: false, reason: idx && idx.reason }));
    process.exit(2);
  }
  const slim = radar.slimIndex(idx);
  fs.writeFileSync(fp, JSON.stringify(slim));
  console.log(JSON.stringify({
    date: d,
    ok: true,
    nEligiblePlayers: idx.nEligiblePlayers,
    nBelowGate: (idx.belowGate || []).length,
    nSourceRows: idx.nSourceRows,
    nTeamRows: idx.nTeamRows,
    windowStart: idx.windowStart,
    windowEnd: idx.windowEnd,
    bytes: fs.statSync(fp).size,
  }));
}
radar.closeDb && radar.closeDb();
