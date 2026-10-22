#!/usr/bin/env node
'use strict';
/**
 * One-shot: repair cached post-match reviews whose hardTest sides are null
 * despite hasActualStats + deltas (empty teamIds bug).
 */
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../lib/db');
const te = require('../lib/team-evidence');
const pmr = require('../lib/post-match-review');

const dir = path.join(DATA_DIR, 'post-match-reviews');
let n = 0, fixed = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const file = path.join(dir, f);
  let disk;
  try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const rev = disk && disk.payload;
  if (!rev || !rev.ok || !rev.hasActualStats) continue;
  n++;
  if (!te.needsHardTestRepair(rev)) continue;
  te.ensureTeamIds(rev);
  te.repairHardTest(rev);
  rev.version = '1.9.60';
  try { rev.html = pmr.renderReviewHtml(rev); } catch (e) { console.warn('html', f, e.message); }
  try { te.recordFromReview(rev); } catch (_) {}
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), payload: rev }));
  fixed++;
  console.log('fixed', rev.matchId, rev.home, rev.away, 'ids', rev.homeTeamId, rev.awayTeamId,
    'tags', rev.hardTest && rev.hardTest.home && rev.hardTest.home.moistureLabelZh,
    rev.hardTest && rev.hardTest.away && rev.hardTest.away.moistureLabelZh);
}
console.log('scanned', n, 'fixed', fixed);
