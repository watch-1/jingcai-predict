
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.ok(/216mf397|216mf398|216mf399|216mf400|216mf401/.test(index), 'cache stamp 396+');
assert.ok(!/lu-board \.lu-ph img\{[^}]*opacity:0/.test(css), 'pitch photos are visible without waiting for onload');
assert.ok(/function paintLineupBox/.test(app), 'shared lineup painter');
assert.ok(/return smPredSettled\(smPredPackOf\(m\.id\)\)/.test(app), 'pred ref settles on SM pack only');
assert.ok(!/inflight && !\(snap && \(snap\.pools/.test(app), 'pred ref no longer blocked by odds inflight');
assert.ok(/const heavyLater = \(\) =>/.test(app), 'heavy data packs are deferred');
assert.ok(/ensureMatchRadar\(x\)/.test(app) && /requestIdleCallback\(heavyLater/.test(app), 'radar is deferred off the first wave');
assert.ok(app.indexOf('ensureSmPredictions(x)') < app.indexOf('const heavyLater'), 'predictions start before heavy packs');
assert.ok(/route\(\)\.name === 'match'/.test(app) && /warmupMatchOddsAndReports[\s\S]{0,1200}route\(\)\.name === 'match'/.test(app),
  'boot warmup yields while a match is open');
assert.ok(/if \(tab === 'squad'\) \{\s*await ensureSquad\(x\);\s*const L =/.test(app),
  '阵容 tab does not wait on predict-report before painting');
console.log('match-open-fast-396-test ok');
